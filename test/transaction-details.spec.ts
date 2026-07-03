import { beforeEach, describe, expect, it, vi } from 'vitest';

const notionMocks = vi.hoisted(() => ({
	clientCtor: vi.fn(),
	pagesUpdate: vi.fn(),
}));

vi.mock('@notionhq/client', () => {
	class MockClient {
		pages = {
			update: notionMocks.pagesUpdate,
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
		isFullDatabase: () => false,
	};
});

import { updateTransactionDetails } from '../src/notion';

beforeEach(() => {
	notionMocks.clientCtor.mockReset();
	notionMocks.pagesUpdate.mockReset();
	notionMocks.pagesUpdate.mockResolvedValue({});
});

describe('updateTransactionDetails', () => {
	it('updates Name, Category, and JAR relations', async () => {
		await updateTransactionDetails(
			'tx-page-1',
			{ name: 'Lunch', categoryId: 'cat-1', jarId: 'jar-1' },
			{ NOTION_TOKEN: 'token' },
		);

		expect(notionMocks.clientCtor).toHaveBeenCalledWith(expect.objectContaining({ auth: 'token' }));
		expect(notionMocks.pagesUpdate).toHaveBeenCalledWith({
			page_id: 'tx-page-1',
			properties: {
				Name: { title: [{ text: { content: 'Lunch' } }] },
				Category: { relation: [{ id: 'cat-1' }] },
				JAR: { relation: [{ id: 'jar-1' }] },
			},
		});
	});

	it('rejects missing Notion token', async () => {
		await expect(
			updateTransactionDetails('tx-page-1', { name: 'Lunch', categoryId: 'cat-1', jarId: 'jar-1' }, { NOTION_TOKEN: '' }),
		).rejects.toThrow('Missing Notion configuration');
		expect(notionMocks.clientCtor).not.toHaveBeenCalled();
	});
});
