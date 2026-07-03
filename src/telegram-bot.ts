import { fetchJarConfigs } from './budget-service';
import { fetchCategories, type NotionOption } from './category-service';
import { createNotionClient } from './notion-client';
import { updateTransactionDetails } from './notion';
import type { SepayWebhookPayload } from './sepay';
import {
	answerCallbackQuery,
	deleteTelegramMessage,
	sendTelegramMessage,
	type TelegramInlineKeyboardMarkup,
} from './telegram';
import {
	appendTelegramMessageId,
	clearActiveTransactionState,
	getActiveTransactionState,
	putActiveTransactionState,
	type TelegramSelectedOption,
	type TelegramTransactionState,
} from './telegram-state';

interface TelegramBotEnv {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
	TELEGRAM_WEBHOOK_SECRET: string;
	TELEGRAM_STATE: KVNamespace;
	NOTION_TOKEN: string;
	NOTION_CATEGORY_DB_ID: string;
	NOTION_JARS_CONFIG_DB_ID: string;
}

interface TelegramChat {
	id: number | string;
}

interface TelegramMessage {
	message_id: number;
	chat: TelegramChat;
	text?: string;
}

interface TelegramCallbackQuery {
	id: string;
	data?: string;
	message?: TelegramMessage;
}

interface TelegramUpdate {
	message?: TelegramMessage;
	callback_query?: TelegramCallbackQuery;
}

const TELEGRAM_SECRET_HEADER = 'X-Telegram-Bot-Api-Secret-Token';

function isAllowedChat(env: TelegramBotEnv, chatId: string | number): boolean {
	return String(chatId) === env.TELEGRAM_CHAT_ID;
}

function rowsFromOptions(prefix: string, options: NotionOption[]): TelegramInlineKeyboardMarkup {
	return {
		inline_keyboard: [
			...options.map((option) => [{ text: option.name, callback_data: `${prefix}:${option.id}` }]),
			[{ text: 'Cancel', callback_data: 'cancel' }],
		],
	};
}

function confirmKeyboard(): TelegramInlineKeyboardMarkup {
	return {
		inline_keyboard: [
			[
				{ text: 'Confirm', callback_data: 'confirm' },
				{ text: 'Cancel', callback_data: 'cancel' },
			],
		],
	};
}

function formatAmount(amount: number): string {
	return new Intl.NumberFormat('en-US').format(amount);
}

function formatPrompt(payload: SepayWebhookPayload): string {
	const content = payload.content.trim() || `Transaction ${payload.id}`;
	return [
		'New transaction',
		`Name: ${content}`,
		`Amount: ${formatAmount(payload.transferAmount)}`,
		`Type: ${payload.transferType.toUpperCase()}`,
	].join('\n');
}

function uniqueMessageIds(state: TelegramTransactionState, extraMessageId?: number): number[] {
	return [...new Set([...state.messageIds, ...(extraMessageId ? [extraMessageId] : [])])];
}

async function answerCallbackQuerySafe(env: TelegramBotEnv, callbackQueryId: string, text?: string): Promise<void> {
	try {
		await answerCallbackQuery(env, callbackQueryId, text);
	} catch (error: unknown) {
		console.warn('Telegram callback ack failed:', error);
	}
}

function isTrackedCallbackMessage(state: TelegramTransactionState, messageId: number): boolean {
	return state.messageIds.includes(messageId);
}

async function cleanupMessages(
	env: TelegramBotEnv,
	chatId: string | number,
	state: TelegramTransactionState,
	extraMessageId?: number,
): Promise<void> {
	for (const messageId of uniqueMessageIds(state, extraMessageId)) {
		try {
			await deleteTelegramMessage(env, chatId, messageId);
		} catch (error: unknown) {
			console.warn('Telegram message cleanup failed:', error);
		}
	}
}

async function sendTrackedMessage(
	env: TelegramBotEnv,
	chatId: string | number,
	text: string,
	replyMarkup?: TelegramInlineKeyboardMarkup,
): Promise<void> {
	const sent = await sendTelegramMessage(env, text, { chatId, replyMarkup });
	await appendTelegramMessageId(env, chatId, sent.messageId);
}

async function startInputFlow(env: TelegramBotEnv, callbackQuery: TelegramCallbackQuery, txPageId: string): Promise<void> {
	const message = callbackQuery.message;
	if (!message) {
		await answerCallbackQuerySafe(env, callbackQuery.id, 'No message found');
		return;
	}
	const chatId = message.chat.id;
	if (!isAllowedChat(env, chatId)) {
		await answerCallbackQuerySafe(env, callbackQuery.id);
		return;
	}

	const active = await getActiveTransactionState(env, chatId);
	if (active) {
		await answerCallbackQuerySafe(env, callbackQuery.id, 'Finish current transaction first');
		return;
	}

	const sent = await sendTelegramMessage(env, 'Enter transaction name', { chatId });
	const activeAfterPrompt = await getActiveTransactionState(env, chatId);
	if (activeAfterPrompt) {
		try {
			await deleteTelegramMessage(env, chatId, sent.messageId);
		} catch (error: unknown) {
			console.warn('Telegram superseded prompt cleanup failed:', error);
		}
		await answerCallbackQuerySafe(env, callbackQuery.id, 'Finish current transaction first');
		return;
	}

	await putActiveTransactionState(env, {
		chatId: String(chatId),
		txPageId,
		step: 'await_name',
		messageIds: [message.message_id, sent.messageId],
		createdAt: Date.now(),
		updatedAt: Date.now(),
	});
	await answerCallbackQuerySafe(env, callbackQuery.id, 'Started');
}

async function sendCategoryChoices(env: TelegramBotEnv, chatId: string | number): Promise<void> {
	const notion = createNotionClient(env.NOTION_TOKEN);
	const categories = await fetchCategories(notion, env.NOTION_CATEGORY_DB_ID);
	await sendTrackedMessage(env, chatId, 'Choose category', rowsFromOptions('cat', categories));
}

async function sendJarChoices(env: TelegramBotEnv, chatId: string | number): Promise<void> {
	const notion = createNotionClient(env.NOTION_TOKEN);
	const jars = await fetchJarConfigs(notion, env.NOTION_JARS_CONFIG_DB_ID);
	await sendTrackedMessage(env, chatId, 'Choose JAR', rowsFromOptions('jar', jars));
}

async function handleNameMessage(env: TelegramBotEnv, message: TelegramMessage): Promise<void> {
	const chatId = message.chat.id;
	if (!isAllowedChat(env, chatId)) {
		return;
	}
	const state = await getActiveTransactionState(env, chatId);
	if (!state || state.step !== 'await_name') {
		return;
	}

	const name = message.text?.trim() ?? '';
	await putActiveTransactionState(env, { ...state, messageIds: [...new Set([...state.messageIds, message.message_id])] });
	if (!name) {
		await sendTrackedMessage(env, chatId, 'Name cannot be empty');
		return;
	}

	await putActiveTransactionState(env, {
		...state,
		step: 'await_category',
		transactionName: name,
		messageIds: [...new Set([...state.messageIds, message.message_id])],
	});
	await sendCategoryChoices(env, chatId);
}

async function selectCategory(env: TelegramBotEnv, callbackQuery: TelegramCallbackQuery, categoryId: string): Promise<void> {
	const message = callbackQuery.message;
	if (!message || !isAllowedChat(env, message.chat.id)) {
		await answerCallbackQuerySafe(env, callbackQuery.id);
		return;
	}

	const chatId = message.chat.id;
	const state = await getActiveTransactionState(env, chatId);
	if (!state || state.step !== 'await_category' || !isTrackedCallbackMessage(state, message.message_id)) {
		await answerCallbackQuerySafe(env, callbackQuery.id, 'No active transaction');
		return;
	}

	const notion = createNotionClient(env.NOTION_TOKEN);
	const category = (await fetchCategories(notion, env.NOTION_CATEGORY_DB_ID)).find((option) => option.id === categoryId);
	if (!category) {
		await answerCallbackQuerySafe(env, callbackQuery.id, 'Category unavailable');
		return;
	}

	await putActiveTransactionState(env, {
		...state,
		step: 'await_jar',
		category,
		messageIds: [...new Set([...state.messageIds, message.message_id])],
	});
	await sendJarChoices(env, chatId);
	await answerCallbackQuerySafe(env, callbackQuery.id, category.name);
}

async function selectJar(env: TelegramBotEnv, callbackQuery: TelegramCallbackQuery, jarId: string): Promise<void> {
	const message = callbackQuery.message;
	if (!message || !isAllowedChat(env, message.chat.id)) {
		await answerCallbackQuerySafe(env, callbackQuery.id);
		return;
	}

	const chatId = message.chat.id;
	const state = await getActiveTransactionState(env, chatId);
	if (!state || state.step !== 'await_jar' || !isTrackedCallbackMessage(state, message.message_id)) {
		await answerCallbackQuerySafe(env, callbackQuery.id, 'No active transaction');
		return;
	}

	const notion = createNotionClient(env.NOTION_TOKEN);
	const jar = (await fetchJarConfigs(notion, env.NOTION_JARS_CONFIG_DB_ID)).find((option) => option.id === jarId);
	if (!jar) {
		await answerCallbackQuerySafe(env, callbackQuery.id, 'JAR unavailable');
		return;
	}

	const selectedJar: TelegramSelectedOption = { id: jar.id, name: jar.name };
	await putActiveTransactionState(env, {
		...state,
		step: 'await_confirm',
		jar: selectedJar,
		messageIds: [...new Set([...state.messageIds, message.message_id])],
	});
	await sendTrackedMessage(
		env,
		chatId,
		[`Confirm transaction`, `Name: ${state.transactionName ?? ''}`, `Category: ${state.category?.name ?? ''}`, `JAR: ${jar.name}`].join(
			'\n',
		),
		confirmKeyboard(),
	);
	await answerCallbackQuerySafe(env, callbackQuery.id, jar.name);
}

async function cancelFlow(env: TelegramBotEnv, callbackQuery: TelegramCallbackQuery, ctx: ExecutionContext): Promise<void> {
	const message = callbackQuery.message;
	if (!message || !isAllowedChat(env, message.chat.id)) {
		await answerCallbackQuerySafe(env, callbackQuery.id);
		return;
	}

	const state = await getActiveTransactionState(env, message.chat.id);
	if (state && isTrackedCallbackMessage(state, message.message_id)) {
		await clearActiveTransactionState(env, message.chat.id);
		ctx.waitUntil(cleanupMessages(env, message.chat.id, state, message.message_id));
	}
	await answerCallbackQuerySafe(env, callbackQuery.id, 'Cancelled');
}

async function confirmFlow(env: TelegramBotEnv, callbackQuery: TelegramCallbackQuery, ctx: ExecutionContext): Promise<void> {
	const message = callbackQuery.message;
	if (!message || !isAllowedChat(env, message.chat.id)) {
		await answerCallbackQuerySafe(env, callbackQuery.id);
		return;
	}

	const chatId = message.chat.id;
	const state = await getActiveTransactionState(env, chatId);
	if (
		!state ||
		state.step !== 'await_confirm' ||
		!state.transactionName ||
		!state.category ||
		!state.jar ||
		!isTrackedCallbackMessage(state, message.message_id)
	) {
		await answerCallbackQuerySafe(env, callbackQuery.id, 'No active transaction');
		return;
	}

	await answerCallbackQuerySafe(env, callbackQuery.id, 'Saving');
	try {
		await updateTransactionDetails(
			state.txPageId,
			{
				name: state.transactionName,
				categoryId: state.category.id,
				jarId: state.jar.id,
			},
			env,
		);
	} catch (error: unknown) {
		console.warn('Telegram transaction update failed:', error);
		await sendTrackedMessage(env, chatId, 'Update failed. Try confirm again or cancel.', confirmKeyboard());
		return;
	}

	await clearActiveTransactionState(env, chatId);
	ctx.waitUntil(cleanupMessages(env, chatId, state, message.message_id));
}

async function handleCallbackQuery(
	env: TelegramBotEnv,
	callbackQuery: TelegramCallbackQuery,
	ctx: ExecutionContext,
): Promise<void> {
	const data = callbackQuery.data ?? '';
	if (data.startsWith('tx:')) {
		await startInputFlow(env, callbackQuery, data.slice(3));
		return;
	}
	if (data.startsWith('cat:')) {
		await selectCategory(env, callbackQuery, data.slice(4));
		return;
	}
	if (data.startsWith('jar:')) {
		await selectJar(env, callbackQuery, data.slice(4));
		return;
	}
	if (data === 'confirm') {
		await confirmFlow(env, callbackQuery, ctx);
		return;
	}
	if (data === 'cancel') {
		await cancelFlow(env, callbackQuery, ctx);
		return;
	}

	await answerCallbackQuerySafe(env, callbackQuery.id);
}

export async function sendTransactionInputPrompt(
	payload: SepayWebhookPayload,
	txPageId: string,
	env: TelegramBotEnv,
): Promise<void> {
	if (!txPageId) {
		console.warn('Telegram transaction input prompt skipped: missing transaction page id');
		return;
	}

	await sendTelegramMessage(env, formatPrompt(payload), {
		replyMarkup: {
			inline_keyboard: [[{ text: 'Input', callback_data: `tx:${txPageId}` }]],
		},
	});
}

export async function handleTelegramWebhook(
	request: Request,
	env: TelegramBotEnv,
	ctx: ExecutionContext,
): Promise<Response> {
	if (request.headers.get(TELEGRAM_SECRET_HEADER) !== env.TELEGRAM_WEBHOOK_SECRET) {
		return new Response('Unauthorized', { status: 401 });
	}

	let update: TelegramUpdate;
	try {
		update = (await request.json()) as TelegramUpdate;
	} catch {
		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		if (update.callback_query) {
			await handleCallbackQuery(env, update.callback_query, ctx);
		} else if (update.message) {
			await handleNameMessage(env, update.message);
		}
	} catch (error: unknown) {
		console.warn('Telegram webhook handling failed:', error);
	}

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}
