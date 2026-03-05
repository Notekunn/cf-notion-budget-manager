export interface Env {
	NOTION_TOKEN: string;
	NOTION_DB_ID: string;
	SEPAY_API_KEY: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;
