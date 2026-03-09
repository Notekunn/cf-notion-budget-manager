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

const basePayload: SepayWebhookPayload = {
	id: 42,
	gateway: 'MBBank',
	transactionDate: '2026-03-05 10:00:00',
	accountNumber: '123456',
	subAccount: null,
	code: null,
	content: 'Lunch',
	transferType: 'IN',
	transferAmount: 100000,
	accumulated: 500000,
	referenceCode: 'REF-42',
	description: 'Desc',
};

beforeEach(() => {
	notionMocks.clientCtor.mockReset();
	notionMocks.dataSourcesRetrieve.mockReset();
	notionMocks.dataSourcesQuery.mockReset();
	notionMocks.databasesRetrieve.mockReset();
	notionMocks.databasesUpdate.mockReset();
	notionMocks.pagesUpdate.mockReset();
	notionMocks.pagesCreate.mockReset();
});

describe('upsertTransaction', () => {
	it('updates all existing pages when tx id already exists', async () => {
		const env: NotionEnv = {
			NOTION_TOKEN: 'token',
			NOTION_DB_ID: 'ds-001',
			NOTION_BUDGET_DB_ID: '',
			NOTION_JARS_CONFIG_DB_ID: '',
		};
		notionMocks.dataSourcesRetrieve.mockResolvedValueOnce({ object: 'data_source', id: 'ds-001' });
		notionMocks.dataSourcesQuery.mockResolvedValueOnce({ results: [{ id: 'page-1' }, { id: 'page-2' }] });
		notionMocks.pagesUpdate.mockResolvedValue({});

		await upsertTransaction(basePayload, env);

		const clientOptions = notionMocks.clientCtor.mock.calls[0]?.[0] as {
			auth: string;
			fetch: typeof fetch;
		};
		expect(clientOptions.auth).toBe('token');
		expect(clientOptions.fetch).toEqual(expect.any(Function));
		expect(clientOptions.fetch).not.toBe(globalThis.fetch);
		expect(notionMocks.dataSourcesRetrieve).toHaveBeenCalledWith({ data_source_id: 'ds-001' });
		expect(notionMocks.databasesRetrieve).not.toHaveBeenCalled();
		expect(notionMocks.pagesUpdate).toHaveBeenCalledTimes(2);
		expect(notionMocks.pagesCreate).not.toHaveBeenCalled();

		const firstUpdate = notionMocks.pagesUpdate.mock.calls[0]?.[0] as {
			properties: Record<string, unknown>;
		};
		expect(firstUpdate.properties.Date).toEqual({ date: { start: '2026-03-05T10:00:00+07:00' } });
		expect(firstUpdate.properties.Type).toEqual({ select: { name: 'IN' } });
	});

	it('paginates duplicate lookup and updates all pages across cursors', async () => {
		const env: NotionEnv = {
			NOTION_TOKEN: 'token',
			NOTION_DB_ID: 'ds-002',
			NOTION_BUDGET_DB_ID: '',
			NOTION_JARS_CONFIG_DB_ID: '',
		};
		notionMocks.dataSourcesRetrieve.mockResolvedValueOnce({ object: 'data_source', id: 'ds-002' });
		notionMocks.dataSourcesQuery
			.mockResolvedValueOnce({
				results: [{ id: 'page-1' }],
				has_more: true,
				next_cursor: 'cursor-1',
			})
			.mockResolvedValueOnce({
				results: [{ id: 'page-2' }],
				has_more: false,
				next_cursor: null,
			});
		notionMocks.pagesUpdate.mockResolvedValue({});

		await upsertTransaction(basePayload, env);

		expect(notionMocks.dataSourcesQuery).toHaveBeenCalledTimes(2);
		expect(notionMocks.dataSourcesQuery.mock.calls[1]?.[0]).toEqual(
			expect.objectContaining({ start_cursor: 'cursor-1' })
		);
		expect(notionMocks.pagesUpdate).toHaveBeenCalledTimes(2);
		expect(notionMocks.pagesCreate).not.toHaveBeenCalled();
	});

	it('falls back from database id to data source id and creates page', async () => {
		const env: NotionEnv = {
			NOTION_TOKEN: 'token',
			NOTION_DB_ID: 'db-001',
			NOTION_BUDGET_DB_ID: '',
			NOTION_JARS_CONFIG_DB_ID: '',
		};
		notionMocks.dataSourcesRetrieve.mockRejectedValueOnce({ code: 'object_not_found' });
		notionMocks.databasesRetrieve.mockResolvedValueOnce({
			object: 'database',
			data_sources: [{ id: 'ds-777', name: 'Budget' }],
		});
		notionMocks.dataSourcesQuery.mockResolvedValueOnce({ results: [] });
		notionMocks.pagesCreate.mockResolvedValue({});

		await upsertTransaction(
			{
				...basePayload,
				id: 99,
				content: '   ',
				transferType: 'out' as unknown as 'IN',
				referenceCode: '',
				subAccount: null,
			},
			env
		);

		expect(notionMocks.databasesRetrieve).toHaveBeenCalledWith({ database_id: 'db-001' });
		expect(notionMocks.dataSourcesQuery).toHaveBeenCalledWith(
			expect.objectContaining({ data_source_id: 'ds-777' })
		);
		expect(notionMocks.pagesUpdate).not.toHaveBeenCalled();
		expect(notionMocks.pagesCreate).toHaveBeenCalledOnce();

		const createArgs = notionMocks.pagesCreate.mock.calls[0]?.[0] as {
			parent: Record<string, unknown>;
			properties: Record<string, any>;
		};
		expect(createArgs.parent).toEqual({ data_source_id: 'ds-777' });
		expect(createArgs.properties.Name.title[0].text.content).toBe('Transaction 99');
		expect(createArgs.properties.Type.select.name).toBe('OUT');
		expect(createArgs.properties.Reference.rich_text[0].text.content).toBe('');
		expect(createArgs.properties['Sub Account'].rich_text[0].text.content).toBe('');
	});

	it('throws when notion env is missing', async () => {
		const env: NotionEnv = {
			NOTION_TOKEN: '',
			NOTION_DB_ID: '',
			NOTION_BUDGET_DB_ID: '',
			NOTION_JARS_CONFIG_DB_ID: '',
		};
		await expect(upsertTransaction(basePayload, env)).rejects.toThrow('Missing Notion configuration');
		expect(notionMocks.clientCtor).not.toHaveBeenCalled();
	});
});
