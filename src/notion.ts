import { APIErrorCode, Client, isFullDatabase, isNotionClientError } from '@notionhq/client';
import type { SepayWebhookPayload } from './sepay';

export interface NotionEnv {
	NOTION_TOKEN: string;
	NOTION_DB_ID: string;
}

const dataSourceIdCache = new Map<string, string>();
const upsertQueue = new Map<string, Promise<void>>();

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

async function resolveDataSourceId(notion: Client, databaseOrDataSourceId: string): Promise<string> {
	const cachedDataSourceId = dataSourceIdCache.get(databaseOrDataSourceId);
	if (cachedDataSourceId) {
		return cachedDataSourceId;
	}

	try {
		await notion.dataSources.retrieve({ data_source_id: databaseOrDataSourceId });
		dataSourceIdCache.set(databaseOrDataSourceId, databaseOrDataSourceId);
		return databaseOrDataSourceId;
	} catch (error: unknown) {
		const canFallbackToDatabaseLookup =
			isNotionClientError(error) &&
			(error.code === APIErrorCode.ObjectNotFound ||
				error.code === APIErrorCode.ValidationError ||
				error.code === APIErrorCode.InvalidRequest);
		if (!canFallbackToDatabaseLookup) {
			throw error;
		}
	}

	try {
		const database = await notion.databases.retrieve({ database_id: databaseOrDataSourceId });
		if (!isFullDatabase(database)) {
			throw new Error('Unable to resolve full database metadata');
		}
		const dataSourceId = database.data_sources[0]?.id;
		if (!dataSourceId) {
			throw new Error('No data source found for database');
		}
		dataSourceIdCache.set(databaseOrDataSourceId, dataSourceId);
		return dataSourceId;
	} catch (error: unknown) {
		throw error;
	}
}

export async function upsertTransaction(payload: SepayWebhookPayload, env: NotionEnv): Promise<void> {
	if (!env.NOTION_TOKEN || !env.NOTION_DB_ID) {
		throw new Error('Missing Notion configuration');
	}

	const queueKey = String(payload.id);
	const previous = upsertQueue.get(queueKey) ?? Promise.resolve();
	const current = previous
		.catch(() => undefined)
		.then(async () => {
			const notion = new Client({
				auth: env.NOTION_TOKEN,
				fetch: globalThis.fetch.bind(globalThis),
			});
			const dataSourceId = await resolveDataSourceId(notion, env.NOTION_DB_ID);
			const properties = buildProperties(payload);
			const existingPageIds = await findExistingPageIds(notion, dataSourceId, payload.id);

			if (existingPageIds.length > 0) {
				for (const pageId of existingPageIds) {
					await notion.pages.update({
						page_id: pageId,
						properties,
					});
				}
				return;
			}

			await notion.pages.create({
				parent: { data_source_id: dataSourceId },
				properties,
				icon: {
					type: 'emoji',
					emoji: payload.transferType.toUpperCase() === 'OUT' ? '💸' : '💰',
				},
			});
		});

	upsertQueue.set(queueKey, current);
	try {
		await current;
	} finally {
		if (upsertQueue.get(queueKey) === current) {
			upsertQueue.delete(queueKey);
		}
	}
}
