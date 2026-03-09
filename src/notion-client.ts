import { APIErrorCode, Client, LogLevel, isFullDatabase, isNotionClientError } from '@notionhq/client';

const dataSourceIdCache = new Map<string, string>();

export function createNotionClient(token: string): Client {
	return new Client({
		auth: token,
		fetch: globalThis.fetch.bind(globalThis),
		logLevel: LogLevel.ERROR,
	});
}

export async function resolveDataSourceId(notion: Client, databaseOrDataSourceId: string): Promise<string> {
	const cachedDataSourceId = dataSourceIdCache.get(databaseOrDataSourceId);
	if (cachedDataSourceId) {
		return cachedDataSourceId;
	}

	try {
		await notion.dataSources.retrieve({ data_source_id: databaseOrDataSourceId });
		dataSourceIdCache.set(databaseOrDataSourceId, databaseOrDataSourceId);

		return databaseOrDataSourceId;
	} catch (error: unknown) {
		const canFallbackToDatabaseLookup =
			isNotionClientError(error) &&
			(error.code === APIErrorCode.ObjectNotFound ||
				error.code === APIErrorCode.ValidationError ||
				error.code === APIErrorCode.InvalidRequest);
		if (!canFallbackToDatabaseLookup) {
			throw error;
		}
	}

	const database = await notion.databases.retrieve({ database_id: databaseOrDataSourceId });

	if (!isFullDatabase(database)) {
		throw new Error('Unable to resolve full database metadata');
	}
	const dataSourceId = database.data_sources[0]?.id;
	if (!dataSourceId) {
		throw new Error('No data source found for database');
	}
	dataSourceIdCache.set(databaseOrDataSourceId, dataSourceId);
	return dataSourceId;
}
