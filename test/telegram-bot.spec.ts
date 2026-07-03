import { beforeEach, describe, expect, it, vi } from 'vitest';

const botMocks = vi.hoisted(() => ({
	sendTelegramMessage: vi.fn(),
	answerCallbackQuery: vi.fn(),
	deleteTelegramMessage: vi.fn(),
	fetchCategories: vi.fn(),
	fetchJarConfigs: vi.fn(),
	updateTransactionDetails: vi.fn(),
	createNotionClient: vi.fn(),
}));

vi.mock('../src/telegram', () => ({
	sendTelegramMessage: botMocks.sendTelegramMessage,
	answerCallbackQuery: botMocks.answerCallbackQuery,
	deleteTelegramMessage: botMocks.deleteTelegramMessage,
}));

vi.mock('../src/category-service', () => ({
	fetchCategories: botMocks.fetchCategories,
}));

vi.mock('../src/budget-service', () => ({
	fetchJarConfigs: botMocks.fetchJarConfigs,
}));

vi.mock('../src/notion', () => ({
	updateTransactionDetails: botMocks.updateTransactionDetails,
}));

vi.mock('../src/notion-client', () => ({
	createNotionClient: botMocks.createNotionClient,
}));

import { handleTelegramWebhook, sendTransactionInputPrompt } from '../src/telegram-bot';
import { getActiveTransactionState } from '../src/telegram-state';
import type { SepayWebhookPayload } from '../src/sepay';

function createKvMock(): KVNamespace {
	const store = new Map<string, string>();
	return {
		get: vi.fn(async (key: string, options?: { type?: string }) => {
			const value = store.get(key) ?? null;
			if (value && options?.type === 'json') {
				return JSON.parse(value);
			}
			return value;
		}),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
	} as unknown as KVNamespace;
}

function createCtx() {
	const pending: Promise<unknown>[] = [];
	return {
		ctx: {
			waitUntil: (promise: Promise<unknown>) => pending.push(promise),
		} as unknown as ExecutionContext,
		wait: async () => {
			await Promise.all(pending);
		},
	};
}

function createEnv() {
	return {
		TELEGRAM_BOT_TOKEN: 'tg-token',
		TELEGRAM_CHAT_ID: '123',
		TELEGRAM_WEBHOOK_SECRET: 'secret',
		TELEGRAM_STATE: createKvMock(),
		NOTION_TOKEN: 'notion-token',
		NOTION_CATEGORY_DB_ID: 'category-db',
		NOTION_JARS_CONFIG_DB_ID: 'jars-db',
	};
}

function requestFor(body: unknown, secret = 'secret'): Request {
	return new Request('https://example.com/telegram/webhook', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Telegram-Bot-Api-Secret-Token': secret,
		},
		body: JSON.stringify(body),
	});
}

function rawRequestFor(body: string, secret = 'secret'): Request {
	return new Request('https://example.com/telegram/webhook', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Telegram-Bot-Api-Secret-Token': secret,
		},
		body,
	});
}

function callbackUpdate(id: string, data: string, messageId: number, chatId: string | number = 123) {
	return {
		callback_query: {
			id,
			data,
			message: {
				message_id: messageId,
				chat: { id: chatId },
			},
		},
	};
}

async function completeSelectionFlow(env: ReturnType<typeof createEnv>, ctx: ExecutionContext) {
	await handleTelegramWebhook(requestFor(callbackUpdate('cb-start', 'tx:tx-page-1', 10)), env, ctx);
	await handleTelegramWebhook(
		requestFor({
			message: {
				message_id: 11,
				chat: { id: 123 },
				text: 'Lunch with team',
			},
		}),
		env,
		ctx,
	);
	await handleTelegramWebhook(requestFor(callbackUpdate('cb-cat', 'cat:cat-1', 101)), env, ctx);
	await handleTelegramWebhook(requestFor(callbackUpdate('cb-jar', 'jar:jar-1', 102)), env, ctx);
}

const payload: SepayWebhookPayload = {
	id: 1,
	gateway: 'MBBank',
	transactionDate: '2026-03-05 10:00:00',
	accountNumber: '123456',
	subAccount: null,
	code: null,
	content: 'Lunch',
	transferType: 'OUT',
	transferAmount: 100000,
	accumulated: 500000,
	referenceCode: 'REF123',
	description: 'Desc',
};

beforeEach(() => {
	let nextMessageId = 100;
	botMocks.sendTelegramMessage.mockReset();
	botMocks.sendTelegramMessage.mockImplementation(async () => ({ messageId: nextMessageId++ }));
	botMocks.answerCallbackQuery.mockReset();
	botMocks.answerCallbackQuery.mockResolvedValue(undefined);
	botMocks.deleteTelegramMessage.mockReset();
	botMocks.deleteTelegramMessage.mockResolvedValue(undefined);
	botMocks.fetchCategories.mockReset();
	botMocks.fetchCategories.mockResolvedValue([{ id: 'cat-1', name: 'Food' }]);
	botMocks.fetchJarConfigs.mockReset();
	botMocks.fetchJarConfigs.mockResolvedValue([{ id: 'jar-1', name: 'NEC', percent: 55 }]);
	botMocks.updateTransactionDetails.mockReset();
	botMocks.updateTransactionDetails.mockResolvedValue(undefined);
	botMocks.createNotionClient.mockReset();
	botMocks.createNotionClient.mockReturnValue({ notion: true });
});

describe('telegram bot transaction flow', () => {
	it('rejects bad webhook secret before handling update', async () => {
		const env = createEnv();
		const { ctx } = createCtx();
		const response = await handleTelegramWebhook(requestFor({}, 'wrong'), env, ctx);

		expect(response.status).toBe(401);
		expect(botMocks.sendTelegramMessage).not.toHaveBeenCalled();
	});

	it('rejects bad secret before parsing malformed body', async () => {
		const env = createEnv();
		const { ctx } = createCtx();
		const response = await handleTelegramWebhook(rawRequestFor('{bad-json', 'wrong'), env, ctx);

		expect(response.status).toBe(401);
		expect(botMocks.answerCallbackQuery).not.toHaveBeenCalled();
	});

	it('returns ok for malformed JSON with valid secret', async () => {
		const env = createEnv();
		const { ctx } = createCtx();
		const response = await handleTelegramWebhook(rawRequestFor('{bad-json'), env, ctx);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
		expect(botMocks.answerCallbackQuery).not.toHaveBeenCalled();
	});

	it('sends new transaction prompt with Input button', async () => {
		const env = createEnv();

		await sendTransactionInputPrompt(payload, 'tx-page-1', env);

		expect(botMocks.sendTelegramMessage).toHaveBeenCalledWith(
			env,
			expect.stringContaining('New transaction'),
			expect.objectContaining({
				replyMarkup: { inline_keyboard: [[{ text: 'Input', callback_data: 'tx:tx-page-1' }]] },
			}),
		);
	});

	it('ignores callbacks from wrong chat', async () => {
		const env = createEnv();
		const { ctx } = createCtx();

		const response = await handleTelegramWebhook(requestFor(callbackUpdate('cb-1', 'tx:tx-page-1', 10, 999)), env, ctx);

		expect(response.status).toBe(200);
		expect(botMocks.sendTelegramMessage).not.toHaveBeenCalled();
		await expect(getActiveTransactionState(env, '123')).resolves.toBeNull();
	});

	it('allows only one active transaction per chat', async () => {
		const env = createEnv();
		const { ctx } = createCtx();

		await handleTelegramWebhook(requestFor(callbackUpdate('cb-1', 'tx:tx-page-1', 10)), env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-2', 'tx:tx-page-2', 11)), env, ctx);

		await expect(getActiveTransactionState(env, '123')).resolves.toEqual(expect.objectContaining({ txPageId: 'tx-page-1' }));
		expect(botMocks.answerCallbackQuery).toHaveBeenCalledWith(env, 'cb-2', 'Finish current transaction first');
	});

	it('cleans up prompt when active state appears during start', async () => {
		const env = createEnv();
		const { ctx } = createCtx();
		(env.TELEGRAM_STATE.get as any)
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				chatId: '123',
				txPageId: 'tx-existing',
				step: 'await_name',
				messageIds: [1],
				createdAt: 1,
				updatedAt: 1,
			});

		await handleTelegramWebhook(requestFor(callbackUpdate('cb-start', 'tx:tx-page-1', 10)), env, ctx);

		expect(botMocks.deleteTelegramMessage).toHaveBeenCalledWith(env, 123, 100);
		expect(env.TELEGRAM_STATE.put).not.toHaveBeenCalled();
		expect(botMocks.answerCallbackQuery).toHaveBeenCalledWith(env, 'cb-start', 'Finish current transaction first');
	});

	it('acks unknown callbacks without state changes', async () => {
		const env = createEnv();
		const { ctx } = createCtx();

		await handleTelegramWebhook(requestFor(callbackUpdate('cb-unknown', 'noop', 10)), env, ctx);

		expect(botMocks.answerCallbackQuery).toHaveBeenCalledWith(env, 'cb-unknown', undefined);
		await expect(getActiveTransactionState(env, '123')).resolves.toBeNull();
	});

	it('keeps awaiting name for blank text', async () => {
		const env = createEnv();
		const { ctx } = createCtx();

		await handleTelegramWebhook(requestFor(callbackUpdate('cb-start', 'tx:tx-page-1', 10)), env, ctx);
		await handleTelegramWebhook(
			requestFor({
				message: {
					message_id: 11,
					chat: { id: 123 },
					text: '   ',
				},
			}),
			env,
			ctx,
		);

		await expect(getActiveTransactionState(env, '123')).resolves.toEqual(expect.objectContaining({ step: 'await_name' }));
		expect(botMocks.fetchCategories).not.toHaveBeenCalled();
		expect(botMocks.sendTelegramMessage).toHaveBeenLastCalledWith(env, 'Name cannot be empty', expect.any(Object));
	});

	it('ignores stale category callbacks before name entry', async () => {
		const env = createEnv();
		const { ctx } = createCtx();

		await handleTelegramWebhook(requestFor(callbackUpdate('cb-start', 'tx:tx-page-1', 10)), env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-stale-cat', 'cat:cat-1', 10)), env, ctx);

		await expect(getActiveTransactionState(env, '123')).resolves.toEqual(expect.objectContaining({ step: 'await_name' }));
		expect(botMocks.fetchCategories).not.toHaveBeenCalled();
		expect(botMocks.answerCallbackQuery).toHaveBeenCalledWith(env, 'cb-stale-cat', 'No active transaction');
	});

	it('updates Notion on confirm and clears state', async () => {
		const env = createEnv();
		const { ctx, wait } = createCtx();

		await completeSelectionFlow(env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-confirm', 'confirm', 103)), env, ctx);
		await wait();

		expect(botMocks.updateTransactionDetails).toHaveBeenCalledWith(
			'tx-page-1',
			{ name: 'Lunch with team', categoryId: 'cat-1', jarId: 'jar-1' },
			env,
		);
		await expect(getActiveTransactionState(env, '123')).resolves.toBeNull();
		expect(botMocks.deleteTelegramMessage).toHaveBeenCalled();
	});

	it('keeps state when confirm update fails', async () => {
		const env = createEnv();
		const { ctx } = createCtx();
		botMocks.updateTransactionDetails.mockRejectedValueOnce(new Error('notion failed'));

		await completeSelectionFlow(env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-confirm', 'confirm', 103)), env, ctx);

		await expect(getActiveTransactionState(env, '123')).resolves.toEqual(
			expect.objectContaining({ step: 'await_confirm', txPageId: 'tx-page-1' }),
		);
		expect(botMocks.deleteTelegramMessage).not.toHaveBeenCalled();
		expect(botMocks.sendTelegramMessage).toHaveBeenLastCalledWith(
			env,
			'Update failed. Try confirm again or cancel.',
			expect.objectContaining({
				replyMarkup: expect.objectContaining({
					inline_keyboard: expect.any(Array),
				}),
			}),
		);
	});

	it('sequential duplicate confirm does not update twice', async () => {
		const env = createEnv();
		const { ctx, wait } = createCtx();

		await completeSelectionFlow(env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-confirm-1', 'confirm', 103)), env, ctx);
		await wait();
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-confirm-2', 'confirm', 103)), env, ctx);

		expect(botMocks.updateTransactionDetails).toHaveBeenCalledOnce();
		expect(botMocks.answerCallbackQuery).toHaveBeenCalledWith(env, 'cb-confirm-2', 'No active transaction');
	});

	it('Telegram ack failure does not block confirm update', async () => {
		const env = createEnv();
		const { ctx, wait } = createCtx();

		await completeSelectionFlow(env, ctx);
		botMocks.answerCallbackQuery.mockRejectedValueOnce(new Error('ack failed'));
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-confirm', 'confirm', 103)), env, ctx);
		await wait();

		expect(botMocks.updateTransactionDetails).toHaveBeenCalledOnce();
		await expect(getActiveTransactionState(env, '123')).resolves.toBeNull();
	});

	it('stale confirm callback cannot update newer active transaction', async () => {
		const env = createEnv();
		const { ctx } = createCtx();

		await completeSelectionFlow(env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-cancel-old', 'cancel', 102)), env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-start-new', 'tx:tx-page-2', 20)), env, ctx);
		await handleTelegramWebhook(
			requestFor({
				message: {
					message_id: 21,
					chat: { id: 123 },
					text: 'Dinner',
				},
			}),
			env,
			ctx,
		);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-cat-new', 'cat:cat-1', 104)), env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-jar-new', 'jar:jar-1', 105)), env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-old-confirm', 'confirm', 102)), env, ctx);

		expect(botMocks.updateTransactionDetails).not.toHaveBeenCalled();
		await expect(getActiveTransactionState(env, '123')).resolves.toEqual(
			expect.objectContaining({ txPageId: 'tx-page-2', step: 'await_confirm', transactionName: 'Dinner' }),
		);
	});

	it('deletes all tracked messages best-effort after confirm', async () => {
		const env = createEnv();
		const { ctx, wait } = createCtx();
		botMocks.deleteTelegramMessage.mockRejectedValueOnce(new Error('delete failed'));

		await completeSelectionFlow(env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-confirm', 'confirm', 103)), env, ctx);
		await wait();

		const deletedIds = botMocks.deleteTelegramMessage.mock.calls.map((call) => call[2]);
		expect(deletedIds).toEqual([10, 100, 11, 101, 102, 103]);
		await expect(getActiveTransactionState(env, '123')).resolves.toBeNull();
	});

	it('cancel clears state without Notion update', async () => {
		const env = createEnv();
		const { ctx, wait } = createCtx();

		await handleTelegramWebhook(requestFor(callbackUpdate('cb-start', 'tx:tx-page-1', 10)), env, ctx);
		await handleTelegramWebhook(requestFor(callbackUpdate('cb-cancel', 'cancel', 10)), env, ctx);
		await wait();

		expect(botMocks.updateTransactionDetails).not.toHaveBeenCalled();
		await expect(getActiveTransactionState(env, '123')).resolves.toBeNull();
		expect(botMocks.deleteTelegramMessage).toHaveBeenCalledWith(env, 123, 10);
		expect(botMocks.deleteTelegramMessage).toHaveBeenCalledWith(env, 123, 100);
	});
});
