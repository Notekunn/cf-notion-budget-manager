import type { Client } from '@notionhq/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createMonthlyBudget,
	fetchJarConfigs,
	findMonthlyBudget,
	linkTransactionToBudget,
	syncBudgetDbProperties,
} from '../src/budget-service';

function createNotionMock() {
	return {
		dataSources: {
			retrieve: vi.fn(),
			query: vi.fn(),
		},
		databases: {
			retrieve: vi.fn(),
			update: vi.fn(),
		},
		pages: {
			create: vi.fn(),
			update: vi.fn(),
		},
	};
}

describe('budget-service', () => {
	const notion = createNotionMock();
	const client = notion as unknown as Client;

	beforeEach(() => {
		notion.dataSources.retrieve.mockReset();
		notion.dataSources.query.mockReset();
		notion.databases.retrieve.mockReset();
		notion.databases.update.mockReset();
		notion.pages.create.mockReset();
		notion.pages.update.mockReset();
		notion.dataSources.retrieve.mockResolvedValue({ object: 'data_source' });
	});

	it('fetchJarConfigs returns parsed jars and handles pagination', async () => {
		notion.dataSources.query
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
				has_more: true,
				next_cursor: 'cursor-1',
			})
			.mockResolvedValueOnce({
				results: [
					{
						id: 'jar-2',
						properties: {
							Name: { title: [{ plain_text: 'Education' }] },
							Percent: { number: 10 },
						},
					},
				],
				has_more: false,
				next_cursor: null,
			});

		const jars = await fetchJarConfigs(client, 'jars-ds-1');
		expect(jars).toEqual([
			{ id: 'jar-1', name: 'Necessities', percent: 55 },
			{ id: 'jar-2', name: 'Education', percent: 10 },
		]);
		expect(notion.dataSources.query).toHaveBeenCalledTimes(2);
	});

	it('syncBudgetDbProperties builds formula expressions', async () => {
		await syncBudgetDbProperties(client, 'budget-db-1', [{ id: 'jar-1', name: 'Necessities', percent: 55 }]);

		const args = notion.databases.update.mock.calls[0]?.[0] as { properties: Record<string, any> };
		expect(args.properties['Total Income'].formula.expression).toContain('prop("Transactions")');
		expect(args.properties['Necessities Budget'].formula.expression).toContain('prop("Necessities %")');
		expect(args.properties['Necessities Actual'].formula.expression).toContain('current.prop("JAR")');
		expect(args.properties['Necessities Remain'].formula.expression).toContain('Necessities Actual');
	});

	it('findMonthlyBudget returns page id when found', async () => {
		notion.dataSources.query.mockResolvedValueOnce({ results: [{ id: 'budget-page-1' }] });

		const budgetId = await findMonthlyBudget(client, 'budget-ds-2', '2026-03');
		expect(budgetId).toBe('budget-page-1');
	});

	it('findMonthlyBudget returns null when missing', async () => {
		notion.dataSources.query.mockResolvedValueOnce({ results: [] });

		const budgetId = await findMonthlyBudget(client, 'budget-ds-3', '2026-03');
		expect(budgetId).toBeNull();
	});

	it('createMonthlyBudget creates monthly page with snapshotted percentages', async () => {
		notion.dataSources.query.mockResolvedValueOnce({ results: [] });
		notion.pages.create.mockResolvedValueOnce({ id: 'budget-created-1' });

		const budgetId = await createMonthlyBudget(client, 'budget-ds-4', '2026-03', [
			{ id: 'jar-1', name: 'Necessities', percent: 55 },
			{ id: 'jar-2', name: 'Education', percent: 10 },
		]);

		expect(budgetId).toBe('budget-created-1');
		const createArgs = notion.pages.create.mock.calls[0]?.[0] as { properties: Record<string, any> };
		expect(createArgs.properties.Month).toEqual({ date: { start: '2026-03-01' } });
		expect(createArgs.properties['Necessities %']).toEqual({ number: 55 });
		expect(createArgs.properties['Education %']).toEqual({ number: 10 });
	});

	it('createMonthlyBudget is idempotent when budget exists', async () => {
		notion.dataSources.query.mockResolvedValueOnce({ results: [{ id: 'budget-exist-1' }] });

		const budgetId = await createMonthlyBudget(client, 'budget-ds-5', '2026-03', [
			{ id: 'jar-1', name: 'Necessities', percent: 55 },
		]);

		expect(budgetId).toBe('budget-exist-1');
		expect(notion.pages.create).not.toHaveBeenCalled();
	});

	it('linkTransactionToBudget updates relation on transaction page', async () => {
		notion.pages.update.mockResolvedValueOnce({});

		await linkTransactionToBudget(client, 'tx-page-1', 'budget-page-1');
		expect(notion.pages.update).toHaveBeenCalledWith(
			expect.objectContaining({
				page_id: 'tx-page-1',
				properties: {
					'Monthly Budget': { relation: [{ id: 'budget-page-1' }] },
				},
			})
		);
	});
});
