import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/notion', () => ({
	upsertTransaction: vi.fn(),
	ensureMonthlyBudgetForMonth: vi.fn(),
}));

import worker, { type Env } from '../src/index';
import { ensureMonthlyBudgetForMonth } from '../src/notion';

const IncomingRequest = Request;
const ensureMonthlyBudgetForMonthMock = vi.mocked(ensureMonthlyBudgetForMonth);

const testEnv: Env = {
	NOTION_TOKEN: 'test-token',
	NOTION_DB_ID: 'test-db',
	NOTION_BUDGET_DB_ID: 'test-budget-db',
	NOTION_JARS_CONFIG_DB_ID: 'test-jars-db',
	SEPAY_API_KEY: 'test-sepay-key',
};

async function fetchUnit(request: Request, env: Env = testEnv): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

beforeEach(() => {
	ensureMonthlyBudgetForMonthMock.mockReset();
	ensureMonthlyBudgetForMonthMock.mockResolvedValue('budget-page-1');
});

describe('/budget route and scheduled handler', () => {
	it('returns 401 for POST /budget with missing auth', async () => {
		const request = new IncomingRequest('http://example.com/budget', { method: 'POST' });
		const response = await fetchUnit(request);
		expect(response.status).toBe(401);
	});

	it('returns 400 for POST /budget with invalid month', async () => {
		const request = new IncomingRequest('http://example.com/budget', {
			method: 'POST',
			headers: {
				Authorization: `Apikey ${testEnv.SEPAY_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ month: '2026-13' }),
		});
		const response = await fetchUnit(request);
		expect(response.status).toBe(400);
	});

	it('returns 400 for POST /budget with non-json body', async () => {
		const request = new IncomingRequest('http://example.com/budget', {
			method: 'POST',
			headers: {
				Authorization: `Apikey ${testEnv.SEPAY_API_KEY}`,
				'Content-Type': 'text/plain',
			},
			body: 'month=2026-03',
		});
		const response = await fetchUnit(request);
		expect(response.status).toBe(400);
	});

	it('creates budget for specific month', async () => {
		const request = new IncomingRequest('http://example.com/budget', {
			method: 'POST',
			headers: {
				Authorization: `Apikey ${testEnv.SEPAY_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ month: '2026-03' }),
		});

		const response = await fetchUnit(request);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			budgetId: 'budget-page-1',
			month: '2026-03',
		});
		expect(ensureMonthlyBudgetForMonthMock).toHaveBeenCalledWith('2026-03', testEnv);
	});

	it('creates budget for current month when body empty', async () => {
		const request = new IncomingRequest('http://example.com/budget', {
			method: 'POST',
			headers: {
				Authorization: `Apikey ${testEnv.SEPAY_API_KEY}`,
			},
		});

		const response = await fetchUnit(request);
		expect(response.status).toBe(200);
		const body = await response.json<{ success: boolean; budgetId: string; month: string }>();
		expect(body.success).toBe(true);
		expect(body.budgetId).toBe('budget-page-1');
		expect(body.month).toMatch(/^\d{4}-\d{2}$/);
		expect(ensureMonthlyBudgetForMonthMock).toHaveBeenCalledWith(body.month, testEnv);
	});

	it('POST /budget idempotent behavior returns success twice', async () => {
		const request = new IncomingRequest('http://example.com/budget', {
			method: 'POST',
			headers: {
				Authorization: `Apikey ${testEnv.SEPAY_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ month: '2026-04' }),
		});

		const first = await fetchUnit(request.clone());
		const second = await fetchUnit(request);
		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(ensureMonthlyBudgetForMonthMock).toHaveBeenCalledTimes(2);
	});

	it('returns 404 for non-POST /budget', async () => {
		const request = new IncomingRequest('http://example.com/budget', { method: 'GET' });
		const response = await fetchUnit(request);
		expect(response.status).toBe(404);
	});

	it('scheduled handler creates budget for current month', async () => {
		const ctx = createExecutionContext();
		await worker.scheduled?.(
			{
				cron: '0 0 1 * *',
				scheduledTime: Date.now(),
				type: 'scheduled',
				noRetry: () => undefined,
			} as ScheduledController,
			testEnv,
			ctx
		);
		await waitOnExecutionContext(ctx);

		expect(ensureMonthlyBudgetForMonthMock).toHaveBeenCalledOnce();
		const monthArg = ensureMonthlyBudgetForMonthMock.mock.calls[0]?.[0];
		expect(monthArg).toMatch(/^\d{4}-\d{2}$/);
	});
});
