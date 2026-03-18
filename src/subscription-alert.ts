import type { Client } from '@notionhq/client';
import { createNotionClient, resolveDataSourceId } from './notion-client';
import { getNumberValue, getTitleValue } from './notion-helpers';
import { sendTelegramMessage, type TelegramEnv } from './telegram';

export interface Subscription {
	id: string;
	name: string;
	amount: number;
	currency: string;
	billingCycle: string;
	status: string;
	nextPayment: string | null;
	daysUntilRenewal: number | null;
	remindDaysBefore: number;
	autoRenew: boolean;
	trialEndDate: string | null;
}

function getFormulaNumber(properties: Record<string, any>, key: string): number | null {
	const formula = properties[key]?.formula;
	if (!formula || formula.type !== 'number') {
		return null;
	}
	return typeof formula.number === 'number' ? formula.number : null;
}

function getFormulaDate(properties: Record<string, any>, key: string): string | null {
	const formula = properties[key]?.formula;
	if (!formula || formula.type !== 'date' || !formula.date) {
		return null;
	}
	return formula.date.start ?? null;
}

function getSelectValue(properties: Record<string, any>, key: string): string {
	return properties[key]?.select?.name ?? '';
}

function getDateValue(properties: Record<string, any>, key: string): string | null {
	return properties[key]?.date?.start ?? null;
}

function getCheckboxValue(properties: Record<string, any>, key: string): boolean {
	return properties[key]?.checkbox === true;
}

export async function fetchActiveSubscriptions(notion: Client, subscriptionDbId: string): Promise<Subscription[]> {
	const dataSourceId = await resolveDataSourceId(notion, subscriptionDbId);

	const subscriptions: Subscription[] = [];
	let nextCursor: string | undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: dataSourceId,
			start_cursor: nextCursor,
			page_size: 100,
			filter: {
				property: 'Status',
				select: {
					is_not_empty: true,
				},
			},
		});

		for (const result of response.results) {
			const properties = (result as { properties?: Record<string, unknown> }).properties;
			if (!properties) {
				continue;
			}
			const props = properties as Record<string, any>;
			const status = getSelectValue(props, 'Status');
			if (status !== 'Active' && status !== 'Trial') {
				continue;
			}

			const name = getTitleValue(props, 'Name');
			if (!name) {
				continue;
			}

			subscriptions.push({
				id: result.id,
				name,
				amount: getNumberValue(props, 'Amount'),
				currency: getSelectValue(props, 'Currency'),
				billingCycle: getSelectValue(props, 'Billing Cycle'),
				status,
				nextPayment: getFormulaDate(props, 'Next Payment'),
				daysUntilRenewal: getFormulaNumber(props, 'Days Until Renewal'),
				remindDaysBefore: getNumberValue(props, 'Remind Days Before') || 3,
				autoRenew: getCheckboxValue(props, 'Auto Renew'),
				trialEndDate: getDateValue(props, 'Trial End Date'),
			});
		}

		nextCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
	} while (nextCursor);

	return subscriptions;
}

// --- Alert logic ---

export interface AlertResult {
	trialEnding: Subscription[];
	dueToday: Subscription[];
	upcoming: Subscription[];
}

export interface SubscriptionAlertEnv extends TelegramEnv {
	NOTION_TOKEN: string;
	NOTION_SUBSCRIPTION_DB_ID: string;
}

/** Get today's date string in UTC+7 (Vietnam timezone) */
export function getTodayVietnam(): string {
	return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function diffDays(dateStr: string, todayStr: string): number {
	const d1 = new Date(dateStr + 'T00:00:00Z');
	const d2 = new Date(todayStr + 'T00:00:00Z');
	return Math.round((d1.getTime() - d2.getTime()) / 86400000);
}

export function filterSubscriptionsForAlert(subs: Subscription[], todayStr: string): AlertResult {
	const trialEnding: Subscription[] = [];
	const dueToday: Subscription[] = [];
	const upcoming: Subscription[] = [];

	for (const sub of subs) {
		// Trial subs with trialEndDate: prioritize trial end alerts
		if (sub.status === 'Trial' && sub.trialEndDate) {
			const daysLeft = diffDays(sub.trialEndDate, todayStr);
			if (daysLeft <= 0 && daysLeft >= -7) {
				trialEnding.push(sub);
			} else if (daysLeft > 0 && daysLeft <= sub.remindDaysBefore) {
				trialEnding.push(sub);
			}
			continue; // Skip renewal alerts for trial subs with trialEndDate
		}

		const nextPaymentDate = sub.nextPayment?.slice(0, 10) ?? null;
		const days = sub.daysUntilRenewal;

		// Cap overdue: only alert if overdue by ≤ 7 days to avoid perpetual alerts
		if (nextPaymentDate === todayStr || (days !== null && days <= 0 && days >= -7)) {
			dueToday.push(sub);
		} else if (days !== null && days > 0 && days <= sub.remindDaysBefore) {
			upcoming.push(sub);
		}
	}

	return { trialEnding, dueToday, upcoming };
}

function formatNumberWithCommas(n: number): string {
	const parts = String(Math.abs(n)).split('.');
	parts[0] = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return (n < 0 ? '-' : '') + parts.join('.');
}

function formatAmount(amount: number, currency: string): string {
	if (currency === 'VND') {
		return `${formatNumberWithCommas(amount)} VND`;
	}
	const symbols: Record<string, string> = { USD: '$', EUR: '€' };
	const symbol = symbols[currency] ?? '';
	return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
}

function formatSubLine(sub: Subscription, showDays: boolean): string {
	const amount = formatAmount(sub.amount, sub.currency);

	const days = showDays && sub.daysUntilRenewal !== null ? ` in ${sub.daysUntilRenewal} day${sub.daysUntilRenewal === 1 ? '' : 's'}` : '';
	return `• ${sub.name} — ${amount}${days} (${sub.billingCycle})`;
}

function formatTotalsByCurrency(subs: Subscription[]): string {
	const totals = new Map<string, number>();
	for (const sub of subs) {
		totals.set(sub.currency, (totals.get(sub.currency) ?? 0) + sub.amount);
	}
	return [...totals.entries()].map(([currency, total]) => formatAmount(total, currency)).join(', ');
}

function formatTrialLine(sub: Subscription, todayStr: string): string {
	const amount = formatAmount(sub.amount, sub.currency);
	const daysLeft = sub.trialEndDate ? diffDays(sub.trialEndDate, todayStr) : 0;
	let urgency: string;
	if (daysLeft <= 0) {
		urgency = '🔴 EXPIRED';
	} else if (daysLeft === 1) {
		urgency = '🔴 TOMORROW';
	} else if (daysLeft <= 3) {
		urgency = `🟠 ${daysLeft} days left`;
	} else {
		urgency = `🟡 ${daysLeft} days left`;
	}
	return `• ${sub.name} — ${amount} [${urgency}] (${sub.billingCycle})`;
}

export function formatAlertMessage(result: AlertResult, todayStr: string): string | null {
	if (result.trialEnding.length === 0 && result.dueToday.length === 0 && result.upcoming.length === 0) {
		return null;
	}

	const [year, month, day] = todayStr.split('-');
	const header = `🔔 Subscription Alerts — ${day}/${month}/${year}`;
	const lines: string[] = [header, ''];

	if (result.trialEnding.length > 0) {
		lines.push('🚨 TRIAL ENDING — ACT NOW:');
		for (const sub of result.trialEnding) {
			lines.push(formatTrialLine(sub, todayStr));
		}
		lines.push('👉 Cancel or upgrade before trial expires!');
		lines.push('');
	}

	if (result.dueToday.length > 0) {
		lines.push('⚠️ Due Today:');
		for (const sub of result.dueToday) {
			lines.push(formatSubLine(sub, false));
		}
		lines.push('');
	}

	if (result.upcoming.length > 0) {
		lines.push('📅 Upcoming:');
		for (const sub of result.upcoming) {
			lines.push(formatSubLine(sub, true));
		}
		lines.push('');
	}

	if (result.dueToday.length > 0) {
		lines.push(`💰 Total due today: ${formatTotalsByCurrency(result.dueToday)}`);
	}

	return lines.join('\n');
}

export async function checkSubscriptionAlerts(env: SubscriptionAlertEnv): Promise<void> {
	const notion = createNotionClient(env.NOTION_TOKEN);
	const subs = await fetchActiveSubscriptions(notion, env.NOTION_SUBSCRIPTION_DB_ID);

	const today = getTodayVietnam();
	const result = filterSubscriptionsForAlert(subs, today);
	const message = formatAlertMessage(result, today);

	if (message) {
		await sendTelegramMessage(env, message);
	}
}
