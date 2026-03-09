import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SepayWebhookPayload } from '../src/sepay';

const notionMocks = vi.hoisted(() => ({
	clientCtor: vi.fn(),
	dataSourcesRetrieve: vi.fn(),
	dataSourcesQuery: vi.fn(),
	databasesRetrieve: vi.fn(),
	databasesUpdate: vi.fn(),
	pagesUpdate: vi.fn(),
	pagesCreate: vi.fn(),
}));

vi.mock('@notionhq/client', () => {
	class MockClient {
		dataSources = {
			retrieve: notionMocks.dataSourcesRetrieve,
			query: notionMocks.dataSourcesQuery,
		};
		databases = {
			retrieve: notionMocks.databasesRetrieve,
			update: notionMocks.databasesUpdate,
		};
		pages = {
			update: notionMocks.pagesUpdate,
			create: notionMocks.pagesCreate,
		};

		constructor(options: unknown) {
			notionMocks.clientCtor(options);
		}
	}

	return {
		Client: MockClient,
		APIErrorCode: { ObjectNotFound: 'object_not_found' },
		LogLevel: { ERROR: 'error' },
		isNotionClientError: (error: unknown) => typeof error === 'object' && error !== null && 'code' in error,
		isFullDatabase: (response: unknown) =>
			typeof response === 'object' &&
			response !== null &&
			(response as { object?: string }).object === 'database',
	};
});

import { upsertTransaction, type NotionEnv } from '../src/notion';

const payload: SepayWebhookPayload = {
	id: 101,
	gateway: 'MBBank',
	transactionDate: '2026-03-05 10:00:00',
	accountNumber: '123456',
	subAccount: null,
	code: null,
	content: 'Rent',
	transferType: 'OUT',
	transferAmount: 7000000,
	accumulated: 10000000,
	referenceCode: 'REF-101',
	description: 'Monthly rent',
};

const env: NotionEnv = {
	NOTION_TOKEN: 'token',
	NOTION_DB_ID: 'ds-tx',
	NOTION_BUDGET_DB_ID: 'ds-budget',
	NOTION_JARS_CONFIG_DB_ID: 'ds-jars',
};

beforeEach(() => {
	notionMocks.clientCtor.mockReset();
	notionMocks.dataSourcesRetrieve.mockReset();
	notionMocks.dataSourcesQuery.mockReset();
	notionMocks.databasesRetrieve.mockReset();
	notionMocks.databasesUpdate.mockReset();
	notionMocks.pagesUpdate.mockReset();
	notionMocks.pagesCreate.mockReset();
	notionMocks.dataSourcesRetrieve.mockResolvedValue({ object: 'data_source' });
});

describe('upsertTransaction budget linking', () => {
	it('auto-links transaction to existing monthly budget', async () => {
		notionMocks.dataSourcesQuery
			.mockResolvedValueOnce({ results: [] })
			.mockResolvedValueOnce({ results: [{ id: 'budget-page-1' }] });
		notionMocks.pagesCreate.mockResolvedValueOnce({ id: 'tx-page-1' });
		notionMocks.pagesUpdate.mockResolvedValue({});

		const pageId = await upsertTransaction(payload, env);
		expect(pageId).toBe('tx-page-1');
		expect(notionMocks.pagesUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				page_id: 'tx-page-1',
				properties: {
					'Monthly Budget': { relation: [{ id: 'budget-page-1' }] },
				},
			})
		);
	});

	it('auto-creates monthly budget when missing', async () => {
		notionMocks.dataSourcesQuery
			.mockResolvedValueOnce({ results: [] })
			.mockResolvedValueOnce({ results: [] })
			.mockResolvedValueOnce({
				results: [
					{
						id: 'jar-1',
						properties: {
							Name: { title: [{ plain_text: 'Necessities' }] },
							Percent: { number: 55 },
						},
					},
				],
				has_more: false,
				next_cursor: null,
			})
			.mockResolvedValueOnce({ results: [] });
		notionMocks.pagesCreate.mockImplementation(async (args: { parent: { data_source_id: string } }) => {
			if (args.parent.data_source_id === 'ds-tx') {
				return { id: 'tx-page-2' };
			}
			return { id: 'budget-page-2' };
		});
		notionMocks.pagesUpdate.mockResolvedValue({});

		await upsertTransaction(payload, env);
		expect(notionMocks.databasesUpdate).toHaveBeenCalledOnce();
		expect(notionMocks.pagesUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				page_id: 'tx-page-2',
				properties: {
					'Monthly Budget': { relation: [{ id: 'budget-page-2' }] },
				},
			})
		);
	});

	it('budget linking failure does not fail transaction upsert', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		notionMocks.dataSourcesQuery
			.mockResolvedValueOnce({ results: [] })
			.mockResolvedValueOnce({ results: [{ id: 'budget-page-1' }] });
		notionMocks.pagesCreate.mockResolvedValueOnce({ id: 'tx-page-3' });
		notionMocks.pagesUpdate.mockRejectedValueOnce(new Error('relation update failed'));

		await expect(upsertTransaction(payload, env)).resolves.toBe('tx-page-3');
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});
