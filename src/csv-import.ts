import type { Client } from '@notionhq/client';
import { ensureMonthlyBudget, fetchJarConfigs, linkTransactionToBudget } from './budget-service';
import { createNotionClient, resolveDataSourceId } from './notion-client';
import { getTitleValue } from './notion-helpers';

export interface CsvRow {
	transactionDate: string;
	postDate: string;
	description: string;
	amount: number;
}

interface CategoryRule {
	match: string;
	categoryName: string;
	jarName: string;
}

export interface ImportResult {
	imported: number;
	skipped: number;
	errors: string[];
}

export interface ImportEnv {
	NOTION_TOKEN: string;
	NOTION_DB_ID: string;
	NOTION_BUDGET_DB_ID: string;
	NOTION_JARS_CONFIG_DB_ID: string;
	NOTION_CATEGORY_DB_ID: string;
}

const SKIP_DESCRIPTIONS = ['Thanh toán thẻ tín dụng'];

const CATEGORY_RULES: CategoryRule[] = [
	{ match: 'Grab', categoryName: 'Transport', jarName: 'NEC' },
	{ match: 'Foody', categoryName: 'Dining Out', jarName: 'NEC' },
];

export function shouldSkip(description: string): boolean {
	return SKIP_DESCRIPTIONS.some((s) => description.includes(s));
}

export function parseCsv(csv: string): CsvRow[] {
	const lines = csv.trim().split('\n');
	if (lines.length <= 1) return [];

	const rows: CsvRow[] = [];
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const fields = line.split(',');
		if (fields.length < 4) {
			throw new Error(`Line ${i + 1}: expected 4 fields, got ${fields.length}`);
		}

		const transactionDate = fields[0];
		const postDate = fields[1];
		const description = fields.slice(2, -1).join(',');
		const amountStr = fields[fields.length - 1];

		if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
			throw new Error(`Line ${i + 1}: invalid transaction_date "${transactionDate}"`);
		}
		if (!/^\d{4}-\d{2}-\d{2}$/.test(postDate)) {
			throw new Error(`Line ${i + 1}: invalid post_date "${postDate}"`);
		}

		const amount = Number(amountStr);
		if (!Number.isFinite(amount)) {
			throw new Error(`Line ${i + 1}: invalid amount "${amountStr}"`);
		}

		rows.push({ transactionDate, postDate, description, amount });
	}
	return rows;
}

export function matchCategory(description: string): CategoryRule | undefined {
	return CATEGORY_RULES.find((rule) => description.includes(rule.match));
}

export async function generateTransactionId(row: CsvRow, lineIndex: number): Promise<string> {
	const raw = `${row.transactionDate}:${row.description}:${row.amount}:${lineIndex}`;
	const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
	const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
	return `csv-${hex.slice(0, 16)}`;
}

async function queryPagesByName(notion: Client, dbId: string): Promise<Map<string, string>> {
	const dataSourceId = await resolveDataSourceId(notion, dbId);
	const nameToId = new Map<string, string>();
	let nextCursor: string | undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: dataSourceId,
			page_size: 100,
			start_cursor: nextCursor,
		});

		for (const result of response.results) {
			const properties = (result as { properties?: Record<string, any> }).properties;
			if (!properties) continue;
			const name = getTitleValue(properties, 'Name');
			if (name) nameToId.set(name, result.id);
		}
		nextCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
	} while (nextCursor);

	return nameToId;
}

/** Batch-check which transaction IDs already exist in Notion. Chunks into groups of 100 (Notion OR filter limit). */
async function findExistingTxIds(notion: Client, dataSourceId: string, txIds: string[]): Promise<Set<string>> {
	const existing = new Set<string>();
	const CHUNK_SIZE = 100;

	for (let start = 0; start < txIds.length; start += CHUNK_SIZE) {
		const chunk = txIds.slice(start, start + CHUNK_SIZE);
		const orFilter = chunk.map((id) => ({
			property: 'Transaction ID',
			rich_text: { equals: id },
		}));

		let nextCursor: string | undefined;
		do {
			const response = await notion.dataSources.query({
				data_source_id: dataSourceId,
				filter: { or: orFilter } as any,
				page_size: 100,
				start_cursor: nextCursor,
			});

			for (const result of response.results) {
				const props = (result as { properties?: Record<string, any> }).properties;
				const richText = props?.['Transaction ID']?.rich_text;
				const txId = richText?.[0]?.plain_text ?? richText?.[0]?.text?.content;
				if (txId) existing.add(txId);
			}
			nextCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
		} while (nextCursor);
	}

	return existing;
}

function buildCsvProperties(row: CsvRow, txId: string, categoryPageId?: string, jarPageId?: string): Record<string, any> {
	const transferType = row.amount < 0 ? 'OUT' : 'IN';
	const isoDate = `${row.transactionDate}T00:00:00+07:00`;

	const properties: Record<string, any> = {
		Name: { title: [{ text: { content: row.description } }] },
		Amount: { number: Math.abs(row.amount) },
		Type: { select: { name: transferType } },
		Date: { date: { start: isoDate } },
		'Transaction ID': { rich_text: [{ text: { content: txId } }] },
		Gateway: { rich_text: [{ text: { content: 'Cake Credit Card' } }] },
		Message: { rich_text: [{ text: { content: row.description } }] },
	};

	if (categoryPageId) {
		properties['Category'] = { relation: [{ id: categoryPageId }] };
	}
	if (jarPageId) {
		properties['JAR'] = { relation: [{ id: jarPageId }] };
	}

	return properties;
}

export async function importCsvTransactions(csvBody: string, env: ImportEnv): Promise<ImportResult> {
	const rows = parseCsv(csvBody);

	const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

	if (rows.length === 0) return result;

	console.log(`CSV import started: ${rows.length} rows to process`);

	const notion = createNotionClient(env.NOTION_TOKEN);
	const dataSourceId = await resolveDataSourceId(notion, env.NOTION_DB_ID);

	// Generate all transaction IDs upfront
	const txIds = await Promise.all(rows.map((row, i) => generateTransactionId(row, i)));

	// Batch dedup check — 1 query per 100 IDs instead of 1 per row
	const nonSkippedTxIds = txIds.filter((_, i) => !shouldSkip(rows[i].description));
	const existingTxIds = nonSkippedTxIds.length > 0 ? await findExistingTxIds(notion, dataSourceId, nonSkippedTxIds) : new Set<string>();
	console.log(`Dedup check done: ${existingTxIds.size} existing found`);

	// Resolve category and JAR pages
	const categoryMap = await queryPagesByName(notion, env.NOTION_CATEGORY_DB_ID);
	const jarConfigs = await fetchJarConfigs(notion, env.NOTION_JARS_CONFIG_DB_ID);
	const jarMap = new Map(jarConfigs.map((j) => [j.name, j.id]));

	// Cache budgetId by month to avoid repeated Notion API calls
	const budgetCache = new Map<string, string>();

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const txId = txIds[i];
		try {
			if (shouldSkip(row.description)) {
				result.skipped++;
				console.log(`[${i + 1}/${rows.length}] Skipped (filtered): "${row.description}"`);
				continue;
			}

			if (existingTxIds.has(txId)) {
				result.skipped++;
				console.log(`[${i + 1}/${rows.length}] Skipped (duplicate): "${row.description}"`);
				continue;
			}

			const rule = matchCategory(row.description);
			const categoryPageId = rule ? categoryMap.get(rule.categoryName) : undefined;
			const jarPageId = rule ? jarMap.get(rule.jarName) : undefined;

			const properties = buildCsvProperties(row, txId, categoryPageId, jarPageId);
			const created = await notion.pages.create({
				parent: { data_source_id: dataSourceId },
				properties,
				icon: {
					type: 'emoji',
					emoji: row.amount < 0 ? '💸' : '💰',
				},
			});

			// Link to monthly budget (cached by month)
			try {
				if (env.NOTION_BUDGET_DB_ID && env.NOTION_JARS_CONFIG_DB_ID) {
					const month = row.transactionDate.slice(0, 7);
					let budgetId = budgetCache.get(month);
					if (!budgetId) {
						budgetId = await ensureMonthlyBudget(notion, env.NOTION_BUDGET_DB_ID, env.NOTION_JARS_CONFIG_DB_ID, month);
						budgetCache.set(month, budgetId);
					}
					await linkTransactionToBudget(notion, created.id, budgetId);
				}
			} catch (error: unknown) {
				console.warn(`Budget linking failed for "${row.description}":`, error);
			}

			result.imported++;
			console.log(`[${i + 1}/${rows.length}] Imported: "${row.description}" (${row.amount})`);
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			result.errors.push(`Row "${row.description}": ${msg}`);
			console.error(`[${i + 1}/${rows.length}] Error: "${row.description}" - ${msg}`);
		}
	}

	return result;
}
