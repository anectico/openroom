import { z } from 'zod';

export const s3Endpoint = z
	.string()
	.url()
	.max(2048)
	.refine((value) => {
		try {
			const url = new URL(value);
			return (
				['https:', 'http:'].includes(url.protocol) &&
				!url.username &&
				!url.password &&
				!url.search &&
				!url.hash &&
				url.pathname === '/'
			);
		} catch {
			return false;
		}
	}, 'Use an HTTP or HTTPS endpoint without a path, password or query.')
	.transform((value) => new URL(value).origin);

export const s3SettingsInput = z.object({
	bucket: z
		.string()
		.trim()
		.min(3)
		.max(63)
		.regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
	region: z
		.string()
		.trim()
		.min(1)
		.max(100)
		.regex(/^[a-z0-9-]+$/)
		.default('auto'),
	endpoint: s3Endpoint.nullable().default(null),
	forcePathStyle: z.boolean().default(true),
	accessKeyId: z
		.string()
		.trim()
		.min(1)
		.max(500)
		.regex(/^[^\s]+$/)
		.optional(),
	secretAccessKey: z
		.string()
		.min(1)
		.max(1000)
		.regex(/^[^\s]+$/)
		.optional(),
});
