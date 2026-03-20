import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/notion', () => ({
	upsertTransaction: vi.fn(),
	ensureMonthlyBudgetForMonth: vi.fn(),
}));

vi.mock('../src/chart-data-service', () => ({
	fetchMonthlyTrends: vi.fn(),
	fetchBudgetData: vi.fn(),
}));

import worker, { type Env } from '../src/index';
import { fetchMonthlyTrends, fetchBudgetData } from '../src/chart-data-service';

const fetchMonthlyTrendsMock = vi.mocked(fetchMonthlyTrends);
const fetchBudgetDataMock = vi.mocked(fetchBudgetData);

const testEnv: Env = {
	NOTION_TOKEN: 'test-token',
	NOTION_DB_ID: 'test-db',
	NOTION_BUDGET_DB_ID: 'test-budget-db',
	NOTION_JARS_CONFIG_DB_ID: 'test-jars-db',
	SEPAY_API_KEY: 'test-chart-key',
	TELEGRAM_BOT_TOKEN: 'tg-token',
	TELEGRAM_CHAT_ID: 'tg-chat',
	NOTION_SUBSCRIPTION_DB_ID: 'test-sub-db',
};

async function fetchChart(path: string, key?: string): Promise<Response> {
	const parsed = new URL(`http://localhost${path}`);
	if (key) parsed.searchParams.set('key', key);
	const request = new Request(parsed.toString(), { method: 'GET' });
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

beforeEach(() => {
	fetchMonthlyTrendsMock.mockReset();
	fetchBudgetDataMock.mockReset();
});

describe('chart routes', () => {
	it('returns 401 without key', async () => {
		const res = await fetchChart('/charts/trends');
		expect(res.status).toBe(401);
		const html = await res.text();
		expect(html).toContain('Unauthorized');
	});

	it('returns 401 with wrong key', async () => {
		const res = await fetchChart('/charts/trends', 'wrong-key');
		expect(res.status).toBe(401);
	});

	it('returns 404 for unknown chart type', async () => {
		const res = await fetchChart('/charts/unknown', testEnv.SEPAY_API_KEY);
		expect(res.status).toBe(404);
	});

	it('renders trends chart with valid key', async () => {
		fetchMonthlyTrendsMock.mockResolvedValue([
			{ month: '2026-01', income: 10000000, spending: 7000000 },
			{ month: '2026-02', income: 12000000, spending: 8000000 },
		]);
		const res = await fetchChart('/charts/trends', testEnv.SEPAY_API_KEY);
		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toContain('text/html');
		const html = await res.text();
		expect(html).toContain('chart.js');
		expect(html).toContain('Income');
	});

	it('renders no-data for empty trends', async () => {
		fetchMonthlyTrendsMock.mockResolvedValue([]);
		const res = await fetchChart('/charts/trends', testEnv.SEPAY_API_KEY);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('No transaction data');
	});

	it('renders categories chart', async () => {
		fetchBudgetDataMock.mockResolvedValue({
			month: '2026-03',
			totalIncome: 15000000,
			jars: [{ name: 'Necessities', budget: 8250000, actual: 6000000, remain: 2250000 }],
		});
		const res = await fetchChart('/charts/categories', testEnv.SEPAY_API_KEY);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('doughnut');
		expect(html).toContain('Necessities');
	});

	it('renders no-data for missing budget', async () => {
		fetchBudgetDataMock.mockResolvedValue(null);
		const res = await fetchChart('/charts/budget', testEnv.SEPAY_API_KEY);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('No budget data');
	});

	it('renders budget chart', async () => {
		fetchBudgetDataMock.mockResolvedValue({
			month: '2026-03',
			totalIncome: 15000000,
			jars: [{ name: 'Savings', budget: 1500000, actual: 500000, remain: 1000000 }],
		});
		const res = await fetchChart('/charts/budget', testEnv.SEPAY_API_KEY);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('Savings');
		expect(html).toContain('Budget');
	});

	it('renders dashboard with trends and budget', async () => {
		fetchMonthlyTrendsMock.mockResolvedValue([{ month: '2026-01', income: 5000000, spending: 3000000 }]);
		fetchBudgetDataMock.mockResolvedValue({
			month: '2026-03',
			totalIncome: 15000000,
			jars: [{ name: 'Fun', budget: 750000, actual: 200000, remain: 550000 }],
		});
		const res = await fetchChart('/charts/dashboard', testEnv.SEPAY_API_KEY);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('Dashboard');
	});

	it('accepts custom month param', async () => {
		fetchBudgetDataMock.mockResolvedValue(null);
		const res = await fetchChart('/charts/budget?month=2026-01', testEnv.SEPAY_API_KEY);
		expect(res.status).toBe(200);
		expect(fetchBudgetDataMock).toHaveBeenCalledOnce();
	});

	it('returns 500 on internal error', async () => {
		fetchMonthlyTrendsMock.mockRejectedValue(new Error('Notion API down'));
		const res = await fetchChart('/charts/trends', testEnv.SEPAY_API_KEY);
		expect(res.status).toBe(500);
		const html = await res.text();
		expect(html).toContain('Error loading chart data');
	});
});
