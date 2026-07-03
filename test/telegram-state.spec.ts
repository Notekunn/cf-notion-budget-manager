import { describe, expect, it, vi } from 'vitest';
import {
	appendTelegramMessageId,
	clearActiveTransactionState,
	getActiveTransactionState,
	putActiveTransactionState,
	telegramStateKey,
	type TelegramTransactionState,
} from '../src/telegram-state';

function createKvMock() {
	const store = new Map<string, string>();
	return {
		store,
		kv: {
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
		} as unknown as KVNamespace,
	};
}

function makeState(overrides: Partial<TelegramTransactionState> = {}): TelegramTransactionState {
	return {
		chatId: '123',
		txPageId: 'tx-page-1',
		step: 'await_name',
		messageIds: [10],
		createdAt: 1,
		updatedAt: 1,
		...overrides,
	};
}

describe('telegram-state', () => {
	it('stores active transaction state with ttl', async () => {
		const { kv } = createKvMock();
		const env = { TELEGRAM_STATE: kv };

		await putActiveTransactionState(env, makeState());
		const state = await getActiveTransactionState(env, '123');

		expect(state).toEqual(expect.objectContaining({ chatId: '123', txPageId: 'tx-page-1', step: 'await_name' }));
		expect((kv.put as any).mock.calls[0][2]).toEqual({ expirationTtl: 86400 });
	});

	it('appends message ids once', async () => {
		const { kv } = createKvMock();
		const env = { TELEGRAM_STATE: kv };

		await putActiveTransactionState(env, makeState({ messageIds: [10, 11] }));
		await appendTelegramMessageId(env, '123', 11);
		await appendTelegramMessageId(env, '123', 12);

		await expect(getActiveTransactionState(env, '123')).resolves.toEqual(
			expect.objectContaining({ messageIds: [10, 11, 12] }),
		);
	});

	it('clears active transaction state', async () => {
		const { kv } = createKvMock();
		const env = { TELEGRAM_STATE: kv };

		await putActiveTransactionState(env, makeState());
		await clearActiveTransactionState(env, '123');

		expect(kv.delete).toHaveBeenCalledWith(telegramStateKey('123'));
		await expect(getActiveTransactionState(env, '123')).resolves.toBeNull();
	});
});
