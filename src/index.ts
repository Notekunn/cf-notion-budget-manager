import { ensureMonthlyBudgetForMonth, upsertTransaction } from './notion';
import { isSepayWebhookPayload, verifyApiKey } from './sepay';
import { checkSubscriptionAlerts } from './subscription-alert';

export interface Env {
	NOTION_TOKEN: string;
	NOTION_DB_ID: string;
	NOTION_BUDGET_DB_ID: string;
	NOTION_JARS_CONFIG_DB_ID: string;
	SEPAY_API_KEY: string;
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
	NOTION_SUBSCRIPTION_DB_ID: string;
}

function isJsonContentType(contentType: string | null): boolean {
	if (!contentType) {
		return false;
	}

	const mimeType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
	return mimeType === 'application/json' || mimeType.endsWith('+json');
}

function getCurrentMonthUtc(): string {
	const now = new Date();
	const month = String(now.getUTCMonth() + 1).padStart(2, '0');
	return `${now.getUTCFullYear()}-${month}`;
}

function isValidMonth(value: string): boolean {
	const match = value.match(/^(\d{4})-(\d{2})$/);
	if (!match) {
		return false;
	}
	const month = Number(match[2]);
	return month >= 1 && month <= 12;
}

async function getBudgetMonth(request: Request): Promise<string | null> {
	const rawBody = await request.text();
	if (!rawBody.trim()) {
		return getCurrentMonthUtc();
	}
	if (!isJsonContentType(request.headers.get('Content-Type'))) {
		return null;
	}

	let payload: unknown;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return null;
	}
	if (typeof payload !== 'object' || payload === null) {
		return null;
	}

	const month = (payload as { month?: unknown }).month;
	if (month === undefined || month === null || month === '') {
		return getCurrentMonthUtc();
	}
	if (typeof month !== 'string') {
		return null;
	}

	const normalizedMonth = month.trim();
	return isValidMonth(normalizedMonth) ? normalizedMonth : null;
}

export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/budget') {
			if (!verifyApiKey(request, env.SEPAY_API_KEY)) {
				return new Response('Unauthorized', { status: 401 });
			}

			const month = await getBudgetMonth(request);
			if (!month) {
				return new Response('Bad Request', { status: 400 });
			}

			try {
				const budgetId = await ensureMonthlyBudgetForMonth(month, env);
				return new Response(JSON.stringify({ success: true, budgetId, month }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			} catch (error: unknown) {
				console.error('Error occurred while creating monthly budget:', error);
				return new Response('Internal Server Error', { status: 500 });
			}
		}

		if (request.method === 'POST' && url.pathname === '/subscription-alerts') {
			if (!verifyApiKey(request, env.SEPAY_API_KEY)) {
				return new Response('Unauthorized', { status: 401 });
			}
			try {
				await checkSubscriptionAlerts(env);
				return new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			} catch (error: unknown) {
				console.error('Error checking subscription alerts:', error);
				return new Response('Internal Server Error', { status: 500 });
			}
		}

		if (request.method !== 'POST' || url.pathname !== '/webhook') {
			return new Response('Not Found', { status: 404 });
		}

		if (!verifyApiKey(request, env.SEPAY_API_KEY)) {
			return new Response('Unauthorized', { status: 401 });
		}

		if (!isJsonContentType(request.headers.get('Content-Type'))) {
			return new Response('Bad Request', { status: 400 });
		}

		let payload: unknown;
		try {
			payload = await request.json();
		} catch {
			return new Response('Bad Request', { status: 400 });
		}

		if (!isSepayWebhookPayload(payload)) {
			return new Response('Invalid payload structure', { status: 400 });
		}

		try {
			await upsertTransaction(payload, env);
		} catch (e) {
			console.error('Error occurred while upserting transaction:', e);
			return new Response('Internal Server Error', { status: 500 });
		}

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	},
	async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
		// Monthly budget (1st of month)
		if (event.cron === '0 0 1 * *') {
			const month = getCurrentMonthUtc();
			await ensureMonthlyBudgetForMonth(month, env);
		}
		// Daily subscription alert
		if (event.cron === '0 0 * * *') {
			await checkSubscriptionAlerts(env);
		}
	},
} satisfies ExportedHandler<Env>;
