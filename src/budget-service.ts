import type { Client } from '@notionhq/client';
import { resolveDataSourceId } from './notion-client';

export interface JarConfig {
	id: string;
	name: string;
	percent: number;
}

function firstDayOfMonth(month: string): string {
	return `${month}-01`;
}

function escapeFormulaText(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getTitleValue(properties: Record<string, any>, key: string): string {
	const titleItems = properties[key]?.title;
	if (!Array.isArray(titleItems)) {
		return '';
	}
	const item = titleItems[0];
	const value = item?.plain_text ?? item?.text?.content ?? '';
	return String(value).trim();
}

function getNumberValue(properties: Record<string, any>, key: string): number {
	const value = properties[key]?.number;
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function fetchJarConfigs(notion: Client, jarsConfigDbId: string): Promise<JarConfig[]> {
	const dataSourceId = await resolveDataSourceId(notion, jarsConfigDbId);

	const jars: JarConfig[] = [];
	let nextCursor: string | undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: dataSourceId,
			start_cursor: nextCursor,
			page_size: 100,
		});

		for (const result of response.results) {
			const properties = (result as { properties?: Record<string, unknown> }).properties;
			if (!properties) {
				continue;
			}
			const name = getTitleValue(properties as Record<string, any>, 'Name');
			if (!name) {
				continue;
			}
			jars.push({
				id: result.id,
				name,
				percent: getNumberValue(properties as Record<string, any>, 'Percent'),
			});
		}

		nextCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
	} while (nextCursor);

	return jars;
}

export async function syncBudgetDbProperties(notion: Client, budgetDbId: string, jars: JarConfig[]): Promise<void> {
	const properties: Record<string, any> = {
		'Total Income': {
			formula: {
				expression: '1 /** prop("Transactions").filter(current.prop("Type") == "IN").map(current.prop("Amount")).sum() */',
			},
			name: 'Total Income',
		},
	};

	for (const jar of jars) {
		const jarName = escapeFormulaText(jar.name);
		const percentProp = `${jar.name} %`;
		const budgetProp = `${jar.name} Budget`;
		const actualProp = `${jar.name} Actual`;

		properties[percentProp] = { number: { format: 'number' } };
		properties[budgetProp] = {
			formula: {
				expression: `1 /** prop("${escapeFormulaText(percentProp)}") / 100 * prop("Total Income")*/`,
			},
		};
		properties[actualProp] = {
			formula: {
				expression: `1 /** prop("Transactions").filter(current.prop("Type") == "OUT" and current.prop("JAR").first().prop("Name") == "${jarName}").map(current.prop("Amount")).sum() */`,
			},
		};
		properties[`${jar.name} Remain`] = {
			formula: {
				expression: `1 /** prop("${escapeFormulaText(budgetProp)}") - prop("${escapeFormulaText(actualProp)}") */`,
			},
		};
	}

	await notion.dataSources.update({
		data_source_id: budgetDbId,
		properties,
	});
}

export async function findMonthlyBudget(notion: Client, budgetDbId: string, month: string): Promise<string | null> {
	const dataSourceId = await resolveDataSourceId(notion, budgetDbId);

	const response = await notion.dataSources.query({
		data_source_id: dataSourceId,
		page_size: 1,
		filter: {
			property: 'Month',
			date: { equals: firstDayOfMonth(month) },
		},
		in_trash: false,
	});

	return response.results[0]?.id ?? null;
}

export async function createMonthlyBudget(notion: Client, budgetDbId: string, month: string, jars: JarConfig[]): Promise<string> {
	const existingId = await findMonthlyBudget(notion, budgetDbId, month);
	if (existingId) {
		return existingId;
	}

	const dataSourceId = await resolveDataSourceId(notion, budgetDbId);
	const properties: Record<string, any> = {
		Name: { title: [{ text: { content: `Budget ${month}` } }] },
		Month: { date: { start: firstDayOfMonth(month) } },
	};
	for (const jar of jars) {
		properties[`${jar.name} %`] = { number: jar.percent };
	}

	const created = await notion.pages.create({
		parent: { data_source_id: dataSourceId },
		properties,
		icon: {
			type: 'emoji',
			emoji: '💵',
		},
	} as any);

	return created.id;
}

export async function ensureMonthlyBudget(notion: Client, budgetDbId: string, jarsConfigDbId: string, month: string): Promise<string> {
	const existingId = await findMonthlyBudget(notion, budgetDbId, month);
	if (existingId) {
		return existingId;
	}

	const jars = await fetchJarConfigs(notion, jarsConfigDbId);
	//await syncBudgetDbProperties(notion, budgetDbId, jars);
	return createMonthlyBudget(notion, budgetDbId, month, jars);
}

export async function linkTransactionToBudget(notion: Client, txPageId: string, budgetPageId: string): Promise<void> {
	await notion.pages.update({
		page_id: txPageId,
		properties: {
			Budget: {
				relation: [{ id: budgetPageId }],
			},
		},
	} as any);
}
