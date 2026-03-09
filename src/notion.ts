import type { Client } from '@notionhq/client';
import {
	ensureMonthlyBudget,
	linkTransactionToBudget,
} from './budget-service';
import { createNotionClient, resolveDataSourceId } from './notion-client';
import type { SepayWebhookPayload } from './sepay';

export interface NotionEnv {
	NOTION_TOKEN: string;
	NOTION_DB_ID: string;
	NOTION_BUDGET_DB_ID: string;
	NOTION_JARS_CONFIG_DB_ID: string;
}

const upsertQueue = new Map<string, Promise<string>>();

function toNotionIsoDate(transactionDate: string): string {
	const withTimeSeparator = transactionDate.includes('T') ? transactionDate : transactionDate.replace(' ', 'T');
	if (withTimeSeparator.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(withTimeSeparator)) {
		return withTimeSeparator;
	}

	return `${withTimeSeparator}+07:00`;
}

function toRichText(value: string | null | undefined): { rich_text: [{ text: { content: string } }] } {
	return {
		rich_text: [{ text: { content: value ?? '' } }],
	};
}

function buildProperties(tx: SepayWebhookPayload) {
	const trimmedContent = tx.content.trim();
	const titleContent = trimmedContent.length > 0 ? trimmedContent : `Transaction ${tx.id}`;
	const isoDate = toNotionIsoDate(tx.transactionDate);
	const transferType = tx.transferType.toUpperCase() === 'OUT' ? 'OUT' : 'IN';

	return {
		Name: { title: [{ text: { content: titleContent } }] },
		Amount: { number: tx.transferAmount },
		Type: { select: { name: transferType } },
		Date: { date: { start: isoDate } },
		Account: toRichText(tx.accountNumber),
		Gateway: toRichText(tx.gateway),
		'Transaction ID': toRichText(String(tx.id)),
		Reference: toRichText(tx.referenceCode),
		'Sub Account': toRichText(tx.subAccount),
		Message: toRichText(tx.content.trim()),
	};
}

async function findExistingPageIds(notion: Client, dataSourceId: string, txId: number): Promise<string[]> {
	const pageIds: string[] = [];
	let nextCursor: string | undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: dataSourceId,
			filter: {
				property: 'Transaction ID',
				rich_text: { equals: String(txId) },
			},
			page_size: 100,
			start_cursor: nextCursor,
		});

		pageIds.push(...response.results.map((result) => result.id));
		nextCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
	} while (nextCursor);

	return pageIds;
}

function getMonthFromTransactionDate(transactionDate: string): string {
	return transactionDate.slice(0, 7);
}

export async function ensureMonthlyBudgetForMonth(month: string, env: NotionEnv): Promise<string> {
	if (!env.NOTION_TOKEN || !env.NOTION_BUDGET_DB_ID || !env.NOTION_JARS_CONFIG_DB_ID) {
		throw new Error('Missing Notion budget configuration');
	}

	const notion = createNotionClient(env.NOTION_TOKEN);
	return ensureMonthlyBudget(notion, env.NOTION_BUDGET_DB_ID, env.NOTION_JARS_CONFIG_DB_ID, month);
}

export async function upsertTransaction(payload: SepayWebhookPayload, env: NotionEnv): Promise<string> {
	if (!env.NOTION_TOKEN || !env.NOTION_DB_ID) {
		throw new Error('Missing Notion configuration');
	}

	const queueKey = String(payload.id);
	const previous = upsertQueue.get(queueKey) ?? Promise.resolve('');
	const current = previous
		.catch(() => '')
		.then(async () => {
			const notion = createNotionClient(env.NOTION_TOKEN);
			const dataSourceId = await resolveDataSourceId(notion, env.NOTION_DB_ID);
			const properties = buildProperties(payload);
			const existingPageIds = await findExistingPageIds(notion, dataSourceId, payload.id);
			let pageIds: string[] = existingPageIds;

			if (existingPageIds.length > 0) {
				for (const pageId of existingPageIds) {
					await notion.pages.update({
						page_id: pageId,
						properties,
					});
				}
			} else {
				const created = await notion.pages.create({
					parent: { data_source_id: dataSourceId },
					properties,
					icon: {
						type: 'emoji',
						emoji: payload.transferType.toUpperCase() === 'OUT' ? '💸' : '💰',
					},
				});
				pageIds = [created.id];
			}

			try {
				if (env.NOTION_BUDGET_DB_ID && env.NOTION_JARS_CONFIG_DB_ID) {
					const month = getMonthFromTransactionDate(payload.transactionDate);
					const budgetId = await ensureMonthlyBudget(
						notion,
						env.NOTION_BUDGET_DB_ID,
						env.NOTION_JARS_CONFIG_DB_ID,
						month
					);
					for (const pageId of pageIds) {
						await linkTransactionToBudget(notion, pageId, budgetId);
					}
				} else {
					console.warn('Budget linking skipped: missing NOTION_BUDGET_DB_ID or NOTION_JARS_CONFIG_DB_ID');
				}
			} catch (error: unknown) {
				console.warn('Budget linking failed (non-blocking):', error);
			}

			return pageIds[0] ?? '';
		});

	upsertQueue.set(queueKey, current);
	try {
		return await current;
	} finally {
		if (upsertQueue.get(queueKey) === current) {
			upsertQueue.delete(queueKey);
		}
	}
}
