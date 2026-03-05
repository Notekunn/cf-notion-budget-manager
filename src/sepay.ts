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
	const valueUpper = typeof value === 'string' ? value.toUpperCase() : '';
	return valueUpper === 'IN' || valueUpper === 'OUT';
}

function hasValidDateTimeParts(year: number, month: number, day: number, hour: number, minute: number, second: number): boolean {
	if (hour > 23 || minute > 59 || second > 59) {
		return false;
	}

	const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
	return (
		parsed.getUTCFullYear() === year &&
		parsed.getUTCMonth() + 1 === month &&
		parsed.getUTCDate() === day &&
		parsed.getUTCHours() === hour &&
		parsed.getUTCMinutes() === minute &&
		parsed.getUTCSeconds() === second
	);
}

function isValidTransactionDate(value: unknown): value is string {
	if (typeof value !== 'string') {
		return false;
	}

	const sepayParts = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
	if (sepayParts) {
		const [, yearPart, monthPart, dayPart, hourPart, minutePart, secondPart] = sepayParts;
		const year = Number(yearPart);
		const month = Number(monthPart);
		const day = Number(dayPart);
		const hour = Number(hourPart);
		const minute = Number(minutePart);
		const second = Number(secondPart);

		return hasValidDateTimeParts(year, month, day, hour, minute, second);
	}

	const isoParts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:([+-])(\d{2}):(\d{2})|Z)?$/);
	if (!isoParts) {
		return false;
	}

	const [, yearPart, monthPart, dayPart, hourPart, minutePart, secondPart, , tzHourPart, tzMinutePart] = isoParts;
	const year = Number(yearPart);
	const month = Number(monthPart);
	const day = Number(dayPart);
	const hour = Number(hourPart);
	const minute = Number(minutePart);
	const second = Number(secondPart);
	if (!hasValidDateTimeParts(year, month, day, hour, minute, second)) {
		return false;
	}

	if (!tzHourPart || !tzMinutePart) {
		return true;
	}

	return Number(tzHourPart) <= 23 && Number(tzMinutePart) <= 59;
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
		isValidTransactionDate(payload.transactionDate) &&
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
