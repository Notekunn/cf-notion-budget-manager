import type { Client } from '@notionhq/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCategories } from '../src/category-service';

function createNotionMock() {
	return {
		dataSources: {
			retrieve: vi.fn(),
			query: vi.fn(),
		},
		databases: {
			retrieve: vi.fn(),
		},
	};
}

describe('category-service', () => {
	const notion = createNotionMock();
	const client = notion as unknown as Client;

	beforeEach(() => {
		notion.dataSources.retrieve.mockReset();
		notion.dataSources.query.mockReset();
		notion.databases.retrieve.mockReset();
		notion.dataSources.retrieve.mockResolvedValue({ object: 'data_source' });
	});

	it('fetches categories by Name and paginates', async () => {
		notion.dataSources.query
			.mockResolvedValueOnce({
				results: [
					{ id: 'cat-1', icon: { type: 'emoji', emoji: '🍜' }, properties: { Name: { title: [{ plain_text: 'Food' }] } } },
					{ id: 'cat-empty', properties: { Name: { title: [] } } },
				],
				has_more: true,
				next_cursor: 'cursor-1',
			})
			.mockResolvedValueOnce({
				results: [{ id: 'cat-2', properties: { Name: { title: [{ text: { content: 'Transport' } }] } } }],
				has_more: false,
				next_cursor: null,
			});

		await expect(fetchCategories(client, 'category-ds')).resolves.toEqual([
			{ id: 'cat-1', name: 'Food', icon: '🍜' },
			{ id: 'cat-2', name: 'Transport' },
		]);
		expect(notion.dataSources.query).toHaveBeenCalledTimes(2);
		expect(notion.dataSources.query.mock.calls[1][0]).toEqual(expect.objectContaining({ start_cursor: 'cursor-1' }));
	});
});
