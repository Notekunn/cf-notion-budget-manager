import type { Client } from '@notionhq/client';
import { resolveDataSourceId } from './notion-client';
import { getNumberValue } from './notion-helpers';
import { fetchJarConfigs, findMonthlyBudget } from './budget-service';

export interface MonthlyTrend {
	month: string;
	income: number;
	spending: number;
}

export interface JarBudgetData {
	name: string;
	budget: number;
	actual: number;
	remain: number;
}

export interface BudgetChartData {
	month: string;
	totalIncome: number;
	jars: JarBudgetData[];
}

function getFormulaNumber(properties: Record<string, any>, key: string): number {
	const formula = properties[key]?.formula;
	if (formula?.type === 'number' && typeof formula.number === 'number') {
		return formula.number;
	}
	return 0;
}

export async function fetchMonthlyTrends(notion: Client, transactionDbId: string, monthCount: number = 6): Promise<MonthlyTrend[]> {
	const dataSourceId = await resolveDataSourceId(notion, transactionDbId);
	const now = new Date();
	const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthCount + 1, 1));
	const startStr = start.toISOString().slice(0, 10);

	const trends = new Map<string, { income: number; spending: number }>();
	let nextCursor: string | undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: dataSourceId,
			start_cursor: nextCursor,
			page_size: 100,
			filter: { property: 'Date', date: { on_or_after: startStr } },
		});

		for (const result of response.results) {
			const properties = (result as { properties?: Record<string, any> }).properties;
			if (!properties) continue;
			const dateStr = properties.Date?.date?.start;
			if (!dateStr) continue;
			const month = dateStr.slice(0, 7);
			const amount = getNumberValue(properties, 'Amount');
			const type = properties.Type?.select?.name?.toUpperCase();
			if (!trends.has(month)) trends.set(month, { income: 0, spending: 0 });
			const entry = trends.get(month)!;
			if (type === 'IN') entry.income += amount;
			else if (type === 'OUT') entry.spending += amount;
		}

		nextCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
	} while (nextCursor);

	return [...trends.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({ month, ...data }));
}

export async function fetchBudgetData(notion: Client, budgetDbId: string, jarsConfigDbId: string, month: string): Promise<BudgetChartData | null> {
	const jars = await fetchJarConfigs(notion, jarsConfigDbId);
	const budgetPageId = await findMonthlyBudget(notion, budgetDbId, month);
	if (!budgetPageId) return null;

	const page = await notion.pages.retrieve({ page_id: budgetPageId });
	const properties = (page as { properties?: Record<string, any> }).properties;
	if (!properties) return null;

	const totalIncome = getFormulaNumber(properties, 'Total Income');
	const jarData: JarBudgetData[] = jars.map((jar) => ({
		name: jar.name,
		budget: getFormulaNumber(properties, `${jar.name} Budget`),
		actual: getFormulaNumber(properties, `${jar.name} Actual`),
		remain: getFormulaNumber(properties, `${jar.name} Remain`),
	}));

	return { month, totalIncome, jars: jarData };
}
