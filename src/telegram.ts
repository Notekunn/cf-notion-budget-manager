export interface TelegramEnv {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
}

export async function sendTelegramMessage(env: TelegramEnv, text: string): Promise<void> {
	const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			chat_id: env.TELEGRAM_CHAT_ID,
			text,
		}),
	});
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Telegram API error ${response.status}: ${body}`);
	}
}
