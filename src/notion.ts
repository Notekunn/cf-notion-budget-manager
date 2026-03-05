import type { SepayWebhookPayload } from './sepay';

export interface NotionEnv {
	NOTION_TOKEN: string;
	NOTION_DB_ID: string;
}

export async function upsertTransaction(_payload: SepayWebhookPayload, _env: NotionEnv): Promise<void> {
	// Phase 3 will implement real Notion upsert.
}
