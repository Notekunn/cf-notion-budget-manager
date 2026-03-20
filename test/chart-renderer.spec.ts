import { describe, expect, it } from 'vitest';
import { renderTrendsChart, renderCategoriesChart, renderBudgetChart, renderDashboard, renderNoData } from '../src/chart-renderer';
import type { MonthlyTrend, BudgetChartData } from '../src/chart-data-service';

const sampleTrends: MonthlyTrend[] = [
	{ month: '2026-01', income: 10000000, spending: 7000000 },
	{ month: '2026-02', income: 12000000, spending: 8000000 },
];

const sampleBudget: BudgetChartData = {
	month: '2026-03',
	totalIncome: 15000000,
	jars: [
		{ name: 'Necessities', budget: 8250000, actual: 6000000, remain: 2250000 },
		{ name: 'Education', budget: 1500000, actual: 500000, remain: 1000000 },
		{ name: 'Savings', budget: 1500000, actual: 0, remain: 1500000 },
	],
};

describe('chart-renderer', () => {
	it('renderNoData returns HTML with message', () => {
		const html = renderNoData('No data here');
		expect(html).toContain('No data here');
		expect(html).toContain('<!DOCTYPE html>');
	});

	it('renderTrendsChart includes Chart.js CDN and data', () => {
		const html = renderTrendsChart(sampleTrends);
		expect(html).toContain('cdn.jsdelivr.net/npm/chart.js');
		expect(html).toContain('2026-01');
		expect(html).toContain('2026-02');
		expect(html).toContain('10000000');
		expect(html).toContain('Income');
		expect(html).toContain('Spending');
		expect(html).toContain('Refresh');
	});

	it('renderCategoriesChart renders doughnut with jar names', () => {
		const html = renderCategoriesChart(sampleBudget);
		expect(html).toContain('doughnut');
		expect(html).toContain('Necessities');
		expect(html).toContain('Education');
		expect(html).toContain('2026-03');
	});

	it('renderBudgetChart renders grouped bar', () => {
		const html = renderBudgetChart(sampleBudget);
		expect(html).toContain('Budget');
		expect(html).toContain('Actual');
		expect(html).toContain('8250000');
		expect(html).toContain('6000000');
	});

	it('renderDashboard combines trends and budget charts', () => {
		const html = renderDashboard(sampleTrends, sampleBudget);
		expect(html).toContain('c1'); // trends canvas
		expect(html).toContain('c2'); // categories canvas
		expect(html).toContain('c3'); // budget canvas
		expect(html).toContain('Dashboard');
	});

	it('renderDashboard with no budget shows trends only', () => {
		const html = renderDashboard(sampleTrends, null);
		expect(html).toContain('c1');
		expect(html).not.toContain('c2');
		expect(html).not.toContain('c3');
	});

	it('renderDashboard with no data shows no-data message', () => {
		const html = renderDashboard([], null);
		expect(html).toContain('No budget data');
	});
});
