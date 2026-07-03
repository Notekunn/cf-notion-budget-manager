export interface TelegramEnv {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
}

export interface TelegramInlineKeyboardButton {
	text: string;
	callback_data: string;
}

export interface TelegramInlineKeyboardMarkup {
	inline_keyboard: TelegramInlineKeyboardButton[][];
}

interface TelegramApiResponse<T> {
	ok: boolean;
	result?: T;
	description?: string;
}

export interface SendTelegramMessageOptions {
	chatId?: string | number;
	replyMarkup?: TelegramInlineKeyboardMarkup;
}

export interface SentTelegramMessage {
	messageId: number;
}

async function callTelegramApi<T>(env: TelegramEnv, method: string, payload: Record<string, unknown>): Promise<T> {
	const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`;
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Telegram API error ${response.status}: ${body}`);
	}

	const body = (await response.json()) as TelegramApiResponse<T>;
	if (!body.ok || body.result === undefined) {
		throw new Error(`Telegram API error: ${body.description ?? 'unknown error'}`);
	}

	return body.result;
}

export async function sendTelegramMessage(
	env: TelegramEnv,
	text: string,
	options: SendTelegramMessageOptions = {},
): Promise<SentTelegramMessage> {
	const result = await callTelegramApi<{ message_id: number }>(env, 'sendMessage', {
		chat_id: options.chatId ?? env.TELEGRAM_CHAT_ID,
		text,
		reply_markup: options.replyMarkup,
	});

	return { messageId: result.message_id };
}

export async function answerCallbackQuery(env: TelegramEnv, callbackQueryId: string, text?: string): Promise<void> {
	await callTelegramApi<true>(env, 'answerCallbackQuery', {
		callback_query_id: callbackQueryId,
		text,
	});
}

export async function deleteTelegramMessage(env: TelegramEnv, chatId: string | number, messageId: number): Promise<void> {
	await callTelegramApi<true>(env, 'deleteMessage', {
		chat_id: chatId,
		message_id: messageId,
	});
}
