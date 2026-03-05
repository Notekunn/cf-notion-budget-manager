import { createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/notion', () => ({
	upsertTransaction: vi.fn(),
}));

import worker, { type Env } from '../src/index';
import { upsertTransaction } from '../src/notion';

const IncomingRequest = Request;
const upsertTransactionMock = vi.mocked(upsertTransaction);

const testEnv: Env = {
	NOTION_TOKEN: 'test-token',
	NOTION_DB_ID: 'test-db',
	SEPAY_API_KEY: 'test-sepay-key',
};

const validPayload = {
	id: 1,
	gateway: 'MBBank',
	transactionDate: '2026-03-05 10:00:00',
	accountNumber: '123456',
	subAccount: null,
	code: null,
	content: 'Lunch',
	transferType: 'IN' as const,
	transferAmount: 100000,
	accumulated: 500000,
	referenceCode: 'REF123',
	description: 'Desc',
};

async function fetchUnit(request: Request, env: Env = testEnv): Promise<Response> {
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, env, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

beforeEach(() => {
	upsertTransactionMock.mockReset();
	upsertTransactionMock.mockResolvedValue(undefined);
});

describe('SePay webhook worker', () => {
	it('returns 404 for non-webhook path', async () => {
		const request = new IncomingRequest('http://example.com/not-webhook', { method: 'POST' });
		const response = await fetchUnit(request);
		expect(response.status).toBe(404);
	});

	it('returns 404 for non-POST /webhook', async () => {
		const request = new IncomingRequest('http://example.com/webhook', { method: 'GET' });
		const response = await fetchUnit(request);
		expect(response.status).toBe(404);
	});

	it('returns 401 for wrong apikey', async () => {
		const request = new IncomingRequest('http://example.com/webhook', {
			method: 'POST',
			headers: {
				Authorization: 'Apikey wrong-key',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(validPayload),
		});
		const response = await fetchUnit(request);
		expect(response.status).toBe(401);
	});

	it('returns 401 before body parsing when auth invalid', async () => {
		const request = new IncomingRequest('http://example.com/webhook', {
			method: 'POST',
			headers: {
				Authorization: 'Apikey wrong-key',
				'Content-Type': 'application/json',
			},
			body: '{invalid-json',
		});
		const response = await fetchUnit(request);
		expect(response.status).toBe(401);
	});

	it('returns 400 for non-json content type', async () => {
		const request = new IncomingRequest('http://example.com/webhook', {
			method: 'POST',
			headers: {
				Authorization: `Apikey ${testEnv.SEPAY_API_KEY}`,
				'Content-Type': 'text/plain',
			},
			body: JSON.stringify(validPayload),
		});
		const response = await fetchUnit(request);
		expect(response.status).toBe(400);
	});

	it('returns 400 for malformed body', async () => {
		const request = new IncomingRequest('http://example.com/webhook', {
			method: 'POST',
			headers: {
				Authorization: `Apikey ${testEnv.SEPAY_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: '{invalid-json',
		});
		const response = await fetchUnit(request);
		expect(response.status).toBe(400);
	});

	it('returns 400 for invalid payload shape', async () => {
		const request = new IncomingRequest('http://example.com/webhook', {
			method: 'POST',
			headers: {
				Authorization: `Apikey ${testEnv.SEPAY_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ id: 1 }),
		});
		const response = await fetchUnit(request);
		expect(response.status).toBe(400);
	});

	it('returns 500 when downstream upsert fails', async () => {
		upsertTransactionMock.mockRejectedValueOnce(new Error('notion-failed'));
		const request = new IncomingRequest('http://example.com/webhook', {
			method: 'POST',
			headers: {
				Authorization: `Apikey ${testEnv.SEPAY_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(validPayload),
		});
		const response = await fetchUnit(request);
		expect(response.status).toBe(500);
	});

	it('returns 200 for valid apikey and payload', async () => {
		const request = new IncomingRequest('http://example.com/webhook', {
			method: 'POST',
			headers: {
				Authorization: `Apikey ${testEnv.SEPAY_API_KEY}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(validPayload),
		});
		const response = await fetchUnit(request);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(upsertTransactionMock).toHaveBeenCalledOnce();
	});

	it('returns 404 on unknown path (integration style)', async () => {
		const response = await SELF.fetch('https://example.com/unknown-path', { method: 'POST' });
		expect(response.status).toBe(404);
	});

	it('returns 401 on /webhook without auth (integration style)', async () => {
		const response = await SELF.fetch('https://example.com/webhook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(validPayload),
		});
		expect(response.status).toBe(401);
	});
});
