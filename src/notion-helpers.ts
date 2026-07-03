/** Shared Notion property extraction helpers */

export function getTitleValue(properties: Record<string, any>, key: string): string {
	const titleItems = properties[key]?.title;
	if (!Array.isArray(titleItems)) {
		return '';
	}
	const item = titleItems[0];
	const value = item?.plain_text ?? item?.text?.content ?? '';
	return String(value).trim();
}

export function getNumberValue(properties: Record<string, any>, key: string): number {
	const value = properties[key]?.number;
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function getPageEmojiIcon(page: unknown): string | undefined {
	if (typeof page !== 'object' || page === null || !('icon' in page)) {
		return undefined;
	}
	const icon = (page as { icon?: unknown }).icon;
	if (typeof icon !== 'object' || icon === null) {
		return undefined;
	}
	const typedIcon = icon as { type?: unknown; emoji?: unknown };
	if (typedIcon.type !== 'emoji' || typeof typedIcon.emoji !== 'string') {
		return undefined;
	}
	const emoji = typedIcon.emoji.trim();
	return emoji || undefined;
}
