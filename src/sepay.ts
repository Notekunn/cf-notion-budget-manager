export interface SepayWebhookPayload {
	id: number;
	gateway: string;
	transactionDate: string;
	accountNumber: string;
	subAccount: string | null;
	code: string | null;
	content: string;
	transferType: 'IN' | 'OUT';
	transferAmount: number;
	accumulated: number;
	referenceCode: string;
	description: string;
}

function isStringOrNull(value: unknown): value is string | null {
	return typeof value === 'string' || value === null;
}

function isTransferType(value: unknown): value is SepayWebhookPayload['transferType'] {
	const upperValue = typeof value === 'string' ? value.toUpperCase() : '';
	return upperValue === 'IN' || upperValue === 'OUT';
}

export function isSepayWebhookPayload(value: unknown): value is SepayWebhookPayload {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const payload = value as Record<string, unknown>;

	return (
		typeof payload.id === 'number' &&
		Number.isFinite(payload.id) &&
		typeof payload.gateway === 'string' &&
		typeof payload.transactionDate === 'string' &&
		typeof payload.accountNumber === 'string' &&
		isStringOrNull(payload.subAccount) &&
		isStringOrNull(payload.code) &&
		typeof payload.content === 'string' &&
		isTransferType(payload.transferType) &&
		typeof payload.transferAmount === 'number' &&
		Number.isFinite(payload.transferAmount) &&
		typeof payload.accumulated === 'number' &&
		Number.isFinite(payload.accumulated) &&
		typeof payload.referenceCode === 'string' &&
		typeof payload.description === 'string'
	);
}

export function verifyApiKey(request: Request, expectedKey: string): boolean {
	if (!expectedKey) {
		return false;
	}

	const auth = request.headers.get('Authorization')?.trim() ?? '';
	const [scheme, key] = auth.split(/\s+/, 2);

	return scheme === 'Apikey' && key === expectedKey;
}
