export type ReadingPlace = { fileId: string; version: number; page: number };

export function readingPlaces(scope: string): ReadingPlace[] {
	try {
		const stored: unknown = JSON.parse(sessionStorage.getItem(`openroom:reading:${scope}`) ?? '[]');
		if (!Array.isArray(stored)) return [];
		return stored
			.filter(
				(p) =>
					p &&
					typeof p.fileId === 'string' &&
					Number.isInteger(p.version) &&
					p.version > 0 &&
					Number.isInteger(p.page) &&
					p.page > 0 &&
					p.page <= 100_000,
			)
			.slice(0, 50);
	} catch {
		return [];
	}
}

export function rememberPage(scope: string, place: ReadingPlace) {
	try {
		const places = readingPlaces(scope).filter((p) => p.fileId !== place.fileId);
		sessionStorage.setItem(`openroom:reading:${scope}`, JSON.stringify([place, ...places].slice(0, 50)));
	} catch {}
}
