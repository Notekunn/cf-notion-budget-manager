import { createNotionClient } from './notion-client';
import { fetchMonthlyTrends, fetchBudgetData } from './chart-data-service';
import { renderTrendsChart, renderCategoriesChart, renderBudgetChart, renderDashboard, renderNoData } from './chart-renderer';

export interface ChartEnv {
	NOTION_TOKEN: string;
	NOTION_DB_ID: string;
	NOTION_BUDGET_DB_ID: string;
	NOTION_JARS_CONFIG_DB_ID: string;
	SEPAY_API_KEY: string;
	CHART_API_KEY?: string;
}

const SECURITY_HEADERS: Record<string, string> = {
	'Content-Type': 'text/html; charset=utf-8',
	'Referrer-Policy': 'no-referrer',
	'X-Content-Type-Options': 'nosniff',
	'Content-Security-Policy': "default-src 'none'; script-src https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'unsafe-inline'",
};

function htmlResponse(html: string, status: number = 200): Response {
	return new Response(html, { status, headers: SECURITY_HEADERS });
}

function getCurrentMonth(): string {
	const now = new Date();
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isValidMonth(v: string): boolean {
	const m = v.match(/^(\d{4})-(\d{2})$/);
	return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export async function handleChartRequest(url: URL, env: ChartEnv): Promise<Response | null> {
	const path = url.pathname;
	if (!path.startsWith('/charts/')) return null;

	// Auth: prefer dedicated CHART_API_KEY, fall back to SEPAY_API_KEY
	const expectedKey = env.CHART_API_KEY || env.SEPAY_API_KEY;
	const key = url.searchParams.get('key');
	if (!key || key !== expectedKey) {
		return htmlResponse(renderNoData('Unauthorized'), 401);
	}

	const monthParam = url.searchParams.get('month')?.trim() ?? '';
	const month = monthParam && isValidMonth(monthParam) ? monthParam : getCurrentMonth();
	const notion = createNotionClient(env.NOTION_TOKEN);

	try {
		const chartType = path.replace('/charts/', '');

		if (chartType === 'trends') {
			const months = Math.min(Math.max(Number(url.searchParams.get('months')) || 6, 1), 24);
			const trends = await fetchMonthlyTrends(notion, env.NOTION_DB_ID, months);
			if (trends.length === 0) return htmlResponse(renderNoData('No transaction data found'));
			return htmlResponse(renderTrendsChart(trends));
		}

		if (chartType === 'categories') {
			const budget = await fetchBudgetData(notion, env.NOTION_BUDGET_DB_ID, env.NOTION_JARS_CONFIG_DB_ID, month);
			if (!budget) return htmlResponse(renderNoData(`No budget data for ${month}`));
			return htmlResponse(renderCategoriesChart(budget));
		}

		if (chartType === 'budget') {
			const budget = await fetchBudgetData(notion, env.NOTION_BUDGET_DB_ID, env.NOTION_JARS_CONFIG_DB_ID, month);
			if (!budget) return htmlResponse(renderNoData(`No budget data for ${month}`));
			return htmlResponse(renderBudgetChart(budget));
		}

		if (chartType === 'dashboard') {
			const months = Math.min(Math.max(Number(url.searchParams.get('months')) || 6, 1), 24);
			const [trends, budget] = await Promise.all([
				fetchMonthlyTrends(notion, env.NOTION_DB_ID, months),
				fetchBudgetData(notion, env.NOTION_BUDGET_DB_ID, env.NOTION_JARS_CONFIG_DB_ID, month),
			]);
			return htmlResponse(renderDashboard(trends, budget));
		}

		return null;
	} catch (error: unknown) {
		console.error('Chart rendering error:', error);
		return htmlResponse(renderNoData('Error loading chart data'), 500);
	}
}
