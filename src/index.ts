import { upsertTransaction } from './notion';
import { isSepayWebhookPayload, verifyApiKey } from './sepay';

export interface Env {
	NOTION_TOKEN: string;
	NOTION_DB_ID: string;
	SEPAY_API_KEY: string;
}

function isJsonContentType(contentType: string | null): boolean {
	if (!contentType) {
		return false;
	}

	const mimeType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
	return mimeType === 'application/json' || mimeType.endsWith('+json');
}

export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		if (request.method !== 'POST' || url.pathname !== '/webhook') {
			return new Response('Not Found', { status: 404 });
		}

		if (!verifyApiKey(request, env.SEPAY_API_KEY)) {
			return new Response('Unauthorized', { status: 401 });
		}

		if (!isJsonContentType(request.headers.get('Content-Type'))) {
			return new Response('Bad Request', { status: 400 });
		}

		let payload: unknown;
		try {
			payload = await request.json();
		} catch {
			return new Response('Bad Request', { status: 400 });
		}

		if (!isSepayWebhookPayload(payload)) {
			return new Response('Invalid payload structure', { status: 400 });
		}

		try {
			await upsertTransaction(payload, env);
		} catch {
			return new Response('Internal Server Error', { status: 500 });
		}

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	},
} satisfies ExportedHandler<Env>;
