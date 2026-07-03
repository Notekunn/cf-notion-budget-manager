export type TelegramTransactionStep = 'await_name' | 'await_category' | 'await_jar' | 'await_confirm';

export interface TelegramSelectedOption {
	id: string;
	name: string;
}

export interface TelegramTransactionState {
	chatId: string;
	txPageId: string;
	step: TelegramTransactionStep;
	transactionName?: string;
	category?: TelegramSelectedOption;
	jar?: TelegramSelectedOption;
	messageIds: number[];
	createdAt: number;
	updatedAt: number;
}

export interface TelegramStateEnv {
	TELEGRAM_STATE: KVNamespace;
}

const STATE_TTL_SECONDS = 24 * 60 * 60;

export function telegramStateKey(chatId: string | number): string {
	return `telegram:chat:${String(chatId)}:active`;
}

function normalizeState(value: unknown): TelegramTransactionState | null {
	if (typeof value !== 'object' || value === null) {
		return null;
	}
	const state = value as Partial<TelegramTransactionState>;
	if (!state.chatId || !state.txPageId || !state.step || !Array.isArray(state.messageIds)) {
		return null;
	}

	return {
		chatId: String(state.chatId),
		txPageId: String(state.txPageId),
		step: state.step,
		transactionName: state.transactionName,
		category: state.category,
		jar: state.jar,
		messageIds: [...new Set(state.messageIds.filter((id): id is number => Number.isInteger(id)))],
		createdAt: typeof state.createdAt === 'number' ? state.createdAt : Date.now(),
		updatedAt: typeof state.updatedAt === 'number' ? state.updatedAt : Date.now(),
	};
}

export async function getActiveTransactionState(
	env: TelegramStateEnv,
	chatId: string | number,
): Promise<TelegramTransactionState | null> {
	const state = await env.TELEGRAM_STATE.get<unknown>(telegramStateKey(chatId), { type: 'json' });
	return normalizeState(state);
}

export async function putActiveTransactionState(
	env: TelegramStateEnv,
	state: TelegramTransactionState,
): Promise<void> {
	const now = Date.now();
	await env.TELEGRAM_STATE.put(
		telegramStateKey(state.chatId),
		JSON.stringify({ ...state, updatedAt: now }),
		{ expirationTtl: STATE_TTL_SECONDS },
	);
}

export async function clearActiveTransactionState(env: TelegramStateEnv, chatId: string | number): Promise<void> {
	await env.TELEGRAM_STATE.delete(telegramStateKey(chatId));
}

export async function appendTelegramMessageId(
	env: TelegramStateEnv,
	chatId: string | number,
	messageId: number,
): Promise<TelegramTransactionState | null> {
	const state = await getActiveTransactionState(env, chatId);
	if (!state) {
		return null;
	}
	await putActiveTransactionState(env, {
		...state,
		messageIds: [...new Set([...state.messageIds, messageId])],
	});
	return getActiveTransactionState(env, chatId);
}
