export type AuditEntry = {
	id: number;
	at: number;
	operation: string;
	memberId: string | null;
	memberName: string | null;
	apiKeyId: string | null;
	roomId: string | null;
	targetType: string | null;
	targetId: string | null;
	detail: Record<string, unknown> | null;
};

export function auditFilters(url: URL) {
	const days = Number(url.searchParams.get('days') ?? '');
	return {
		memberId: url.searchParams.get('member') || undefined,
		operation: url.searchParams.get('operation') || undefined,
		since: days > 0 ? Date.now() - days * 86_400_000 : undefined,
	};
}
