import { describe, expect, it } from 'vitest';
import { type CsvRow, generateTransactionId, matchCategory, parseCsv, shouldSkip } from '../src/csv-import';

describe('csv-import', () => {
	describe('parseCsv', () => {
		it('parses valid CSV into rows', () => {
			const csv = `transaction_date,post_date,description,amount
2026-02-20,2026-02-21,Grab* A-9WKXLBBWWRFCAV,-203000
2026-02-20,2026-02-21,Foody,-338120`;

			const rows = parseCsv(csv);
			expect(rows).toHaveLength(2);
			expect(rows[0]).toEqual({
				transactionDate: '2026-02-20',
				postDate: '2026-02-21',
				description: 'Grab* A-9WKXLBBWWRFCAV',
				amount: -203000,
			});
			expect(rows[1]).toEqual({
				transactionDate: '2026-02-20',
				postDate: '2026-02-21',
				description: 'Foody',
				amount: -338120,
			});
		});

		it('returns empty array for CSV with only header', () => {
			const csv = 'transaction_date,post_date,description,amount\n';
			expect(parseCsv(csv)).toEqual([]);
		});

		it('returns empty array for empty string', () => {
			expect(parseCsv('')).toEqual([]);
		});

		it('throws for invalid amount', () => {
			const csv = `transaction_date,post_date,description,amount
2026-02-20,2026-02-21,Grab,abc`;
			expect(() => parseCsv(csv)).toThrow('invalid amount');
		});

		it('throws for missing fields', () => {
			const csv = `transaction_date,post_date,description,amount
2026-02-20,Grab,-100`;
			expect(() => parseCsv(csv)).toThrow('expected 4 fields');
		});

		it('throws for invalid date format', () => {
			const csv = `transaction_date,post_date,description,amount
20-02-2026,2026-02-21,Grab,-100`;
			expect(() => parseCsv(csv)).toThrow('invalid transaction_date');
		});

		it('parses positive amount correctly', () => {
			const csv = `transaction_date,post_date,description,amount
2026-02-23,2026-02-23,Thanh toán thẻ tín dụng,526868`;
			const rows = parseCsv(csv);
			expect(rows[0].amount).toBe(526868);
		});
	});

	describe('shouldSkip', () => {
		it('skips credit card payment description', () => {
			expect(shouldSkip('Thanh toán thẻ tín dụng')).toBe(true);
		});

		it('does not skip Grab descriptions', () => {
			expect(shouldSkip('Grab* A-9WKXLBBWWRFCAV')).toBe(false);
		});

		it('does not skip Foody descriptions', () => {
			expect(shouldSkip('Foody')).toBe(false);
		});

		it('does not skip other descriptions', () => {
			expect(shouldSkip('CELLPHONES')).toBe(false);
		});
	});

	describe('matchCategory', () => {
		it('matches Grab to Transport/NEC', () => {
			const rule = matchCategory('Grab* A-9WKXLBBWWRFCAV');
			expect(rule).toEqual({ match: 'Grab', categoryName: 'Transport', jarName: 'NEC' });
		});

		it('matches Foody to Dining Out/NEC', () => {
			const rule = matchCategory('Foody');
			expect(rule).toEqual({ match: 'Foody', categoryName: 'Dining Out', jarName: 'NEC' });
		});

		it('returns undefined for unmatched description', () => {
			expect(matchCategory('CELLPHONES')).toBeUndefined();
		});

		it('returns undefined for empty description', () => {
			expect(matchCategory('')).toBeUndefined();
		});
	});

	describe('generateTransactionId', () => {
		it('produces deterministic hash', async () => {
			const row: CsvRow = {
				transactionDate: '2026-02-20',
				postDate: '2026-02-21',
				description: 'Grab* A-9WKXLBBWWRFCAV',
				amount: -203000,
			};
			const id1 = await generateTransactionId(row, 0);
			const id2 = await generateTransactionId(row, 0);
			expect(id1).toBe(id2);
			expect(id1).toMatch(/^csv-[0-9a-f]{16}$/);
		});

		it('produces different hash for different data', async () => {
			const row1: CsvRow = {
				transactionDate: '2026-02-20',
				postDate: '2026-02-21',
				description: 'Grab',
				amount: -100,
			};
			const row2: CsvRow = {
				transactionDate: '2026-02-20',
				postDate: '2026-02-21',
				description: 'Foody',
				amount: -100,
			};
			const id1 = await generateTransactionId(row1, 0);
			const id2 = await generateTransactionId(row2, 1);
			expect(id1).not.toBe(id2);
		});

		it('produces different hash for same row at different line indices', async () => {
			const row: CsvRow = {
				transactionDate: '2026-02-20',
				postDate: '2026-02-21',
				description: 'Grab',
				amount: -16000,
			};
			const id1 = await generateTransactionId(row, 0);
			const id2 = await generateTransactionId(row, 1);
			expect(id1).not.toBe(id2);
		});
	});
});
