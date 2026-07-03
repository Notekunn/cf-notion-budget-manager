import type { Client } from '@notionhq/client';
import { resolveDataSourceId } from './notion-client';
import { getPageEmojiIcon, getTitleValue } from './notion-helpers';

export interface NotionOption {
	id: string;
	name: string;
	icon?: string;
}

export async function fetchCategories(notion: Client, categoryDbId: string): Promise<NotionOption[]> {
	const dataSourceId = await resolveDataSourceId(notion, categoryDbId);
	const categories: NotionOption[] = [];
	let nextCursor: string | undefined;

	do {
		const response = await notion.dataSources.query({
			data_source_id: dataSourceId,
			page_size: 100,
			start_cursor: nextCursor,
		});

		for (const result of response.results) {
			const properties = (result as { properties?: Record<string, any> }).properties;
			if (!properties) {
				continue;
			}
			const name = getTitleValue(properties, 'Name');
			if (name) {
				const icon = getPageEmojiIcon(result);
				categories.push({ id: result.id, name, ...(icon ? { icon } : {}) });
			}
		}

		nextCursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
	} while (nextCursor);

	return categories;
}
