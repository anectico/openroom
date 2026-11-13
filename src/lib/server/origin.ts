export function publicOrigin() {
	const fromEnv = process.env.ORIGIN?.replace(/\/$/, '');
	if (fromEnv) return fromEnv;
	return process.env.NODE_ENV === 'production'
		? `http://localhost:${process.env.PORT ?? 3000}`
		: 'http://localhost:5173';
}
