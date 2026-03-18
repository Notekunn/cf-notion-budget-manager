import { describe, expect, it } from 'vitest';
import {
	diffDays,
	filterSubscriptionsForAlert,
	formatAlertMessage,
	type AlertResult,
	type Subscription,
} from '../src/subscription-alert';

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
	return {
		id: 'test-id',
		name: 'Test Sub',
		amount: 10,
		currency: 'USD',
		billingCycle: 'Monthly',
		status: 'Active',
		nextPayment: null,
		daysUntilRenewal: null,
		remindDaysBefore: 3,
		autoRenew: false,
		trialEndDate: null,
		...overrides,
	};
}

describe('diffDays', () => {
	it('returns 0 for same day', () => {
		expect(diffDays('2026-03-17', '2026-03-17')).toBe(0);
	});

	it('returns 1 for tomorrow', () => {
		expect(diffDays('2026-03-18', '2026-03-17')).toBe(1);
	});

	it('returns -1 for yesterday', () => {
		expect(diffDays('2026-03-16', '2026-03-17')).toBe(-1);
	});
});

describe('filterSubscriptionsForAlert', () => {
	const today = '2026-03-17';

	it('trial sub with trialEndDate today → trialEnding', () => {
		const sub = makeSub({ status: 'Trial', trialEndDate: '2026-03-17' });
		const result = filterSubscriptionsForAlert([sub], today);
		expect(result.trialEnding).toHaveLength(1);
		expect(result.dueToday).toHaveLength(0);
	});

	it('trial sub with trialEndDate in 2 days, remindDaysBefore: 3 → trialEnding', () => {
		const sub = makeSub({ status: 'Trial', trialEndDate: '2026-03-19', remindDaysBefore: 3 });
		const result = filterSubscriptionsForAlert([sub], today);
		expect(result.trialEnding).toHaveLength(1);
	});

	it('trial sub with trialEndDate in 5 days, remindDaysBefore: 3 → not in any alert', () => {
		const sub = makeSub({ status: 'Trial', trialEndDate: '2026-03-22', remindDaysBefore: 3 });
		const result = filterSubscriptionsForAlert([sub], today);
		expect(result.trialEnding).toHaveLength(0);
		expect(result.dueToday).toHaveLength(0);
		expect(result.upcoming).toHaveLength(0);
	});

	it('trial sub with trialEndDate 8 days ago → not in alerts (past cap)', () => {
		const sub = makeSub({ status: 'Trial', trialEndDate: '2026-03-09' });
		const result = filterSubscriptionsForAlert([sub], today);
		expect(result.trialEnding).toHaveLength(0);
	});

	it('trial sub without trialEndDate → falls through to normal renewal logic', () => {
		const sub = makeSub({
			status: 'Trial',
			trialEndDate: null,
			nextPayment: '2026-03-17',
			daysUntilRenewal: 0,
		});
		const result = filterSubscriptionsForAlert([sub], today);
		expect(result.trialEnding).toHaveLength(0);
		expect(result.dueToday).toHaveLength(1);
	});

	it('active sub unaffected by trial logic', () => {
		const sub = makeSub({
			status: 'Active',
			nextPayment: '2026-03-17',
			daysUntilRenewal: 0,
		});
		const result = filterSubscriptionsForAlert([sub], today);
		expect(result.trialEnding).toHaveLength(0);
		expect(result.dueToday).toHaveLength(1);
	});

	it('trial sub with trialEndDate does not appear in dueToday/upcoming', () => {
		const sub = makeSub({
			status: 'Trial',
			trialEndDate: '2026-03-17',
			nextPayment: '2026-03-17',
			daysUntilRenewal: 0,
		});
		const result = filterSubscriptionsForAlert([sub], today);
		expect(result.trialEnding).toHaveLength(1);
		expect(result.dueToday).toHaveLength(0);
		expect(result.upcoming).toHaveLength(0);
	});
});

describe('formatAlertMessage', () => {
	const today = '2026-03-17';

	it('includes trial ending section when trialEnding non-empty', () => {
		const result: AlertResult = {
			trialEnding: [makeSub({ status: 'Trial', trialEndDate: '2026-03-19' })],
			dueToday: [],
			upcoming: [],
		};
		const msg = formatAlertMessage(result, today);
		expect(msg).toContain('TRIAL ENDING');
		expect(msg).toContain('Cancel or upgrade');
	});

	it('does not show trial section when trialEnding empty', () => {
		const result: AlertResult = {
			trialEnding: [],
			dueToday: [makeSub({ nextPayment: today, daysUntilRenewal: 0 })],
			upcoming: [],
		};
		const msg = formatAlertMessage(result, today);
		expect(msg).not.toContain('TRIAL ENDING');
	});

	it('correct ordering: trial then due today then upcoming', () => {
		const result: AlertResult = {
			trialEnding: [makeSub({ name: 'TrialSub', status: 'Trial', trialEndDate: '2026-03-19' })],
			dueToday: [makeSub({ name: 'DueSub' })],
			upcoming: [makeSub({ name: 'UpcomingSub', daysUntilRenewal: 2 })],
		};
		const msg = formatAlertMessage(result, today)!;
		const trialIdx = msg.indexOf('TRIAL ENDING');
		const dueIdx = msg.indexOf('Due Today:');
		const upIdx = msg.indexOf('Upcoming:');
		expect(trialIdx).toBeLessThan(dueIdx);
		expect(dueIdx).toBeLessThan(upIdx);
	});

	it('returns null when all arrays empty', () => {
		const result: AlertResult = { trialEnding: [], dueToday: [], upcoming: [] };
		expect(formatAlertMessage(result, today)).toBeNull();
	});

	it('shows expired text for past trial end dates', () => {
		const result: AlertResult = {
			trialEnding: [makeSub({ status: 'Trial', trialEndDate: '2026-03-15' })],
			dueToday: [],
			upcoming: [],
		};
		const msg = formatAlertMessage(result, today)!;
		expect(msg).toContain('EXPIRED');
	});

	it('shows urgency for future trial end dates', () => {
		const result: AlertResult = {
			trialEnding: [makeSub({ status: 'Trial', trialEndDate: '2026-03-19' })],
			dueToday: [],
			upcoming: [],
		};
		const msg = formatAlertMessage(result, today)!;
		expect(msg).toContain('2 days left');
	});

	it('shows TOMORROW for 1 day left', () => {
		const result: AlertResult = {
			trialEnding: [makeSub({ status: 'Trial', trialEndDate: '2026-03-18' })],
			dueToday: [],
			upcoming: [],
		};
		const msg = formatAlertMessage(result, today)!;
		expect(msg).toContain('TOMORROW');
	});
});
