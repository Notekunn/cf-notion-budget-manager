import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answerCallbackQuery, deleteTelegramMessage, sendTelegramMessage, type TelegramEnv } from '../src/telegram';

const env: TelegramEnv = {
	TELEGRAM_BOT_TOKEN: 'token',
	TELEGRAM_CHAT_ID: '123',
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function mockTelegramResponse(body: unknown, status = 200) {
	fetchMock.mockResolvedValueOnce(
		new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json' },
		}),
	);
}

function getRequestBody(): Record<string, unknown> {
	return JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
}

describe('telegram API helper', () => {
	it('sends messages with inline keyboard and returns message id', async () => {
		mockTelegramResponse({ ok: true, result: { message_id: 42 } });

		await expect(
			sendTelegramMessage(env, 'hello', {
				replyMarkup: {
					inline_keyboard: [[{ text: 'Input', callback_data: 'tx:page-1' }]],
				},
			}),
		).resolves.toEqual({ messageId: 42 });

		expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottoken/sendMessage', expect.any(Object));
		expect(getRequestBody()).toEqual({
			chat_id: '123',
			text: 'hello',
			reply_markup: {
				inline_keyboard: [[{ text: 'Input', callback_data: 'tx:page-1' }]],
			},
		});
	});

	it('allows overriding chat id', async () => {
		mockTelegramResponse({ ok: true, result: { message_id: 43 } });

		await sendTelegramMessage(env, 'hello', { chatId: 999 });

		expect(getRequestBody()).toEqual({ chat_id: 999, text: 'hello' });
	});

	it('answers callback queries', async () => {
		mockTelegramResponse({ ok: true, result: true });

		await answerCallbackQuery(env, 'callback-1', 'Saved');

		expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottoken/answerCallbackQuery', expect.any(Object));
		expect(getRequestBody()).toEqual({ callback_query_id: 'callback-1', text: 'Saved' });
	});

	it('deletes messages', async () => {
		mockTelegramResponse({ ok: true, result: true });

		await deleteTelegramMessage(env, 123, 45);

		expect(fetchMock).toHaveBeenCalledWith('https://api.telegram.org/bottoken/deleteMessage', expect.any(Object));
		expect(getRequestBody()).toEqual({ chat_id: 123, message_id: 45 });
	});

	it('throws on non-ok HTTP response', async () => {
		fetchMock.mockResolvedValueOnce(new Response('bad token', { status: 401 }));

		await expect(sendTelegramMessage(env, 'hello')).rejects.toThrow('Telegram API error 401: bad token');
	});

	it('throws on Bot API error response', async () => {
		mockTelegramResponse({ ok: false, description: 'chat not found' });

		await expect(sendTelegramMessage(env, 'hello')).rejects.toThrow('Telegram API error: chat not found');
	});
});
