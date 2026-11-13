import { z } from 'zod';
import { probeReplication } from '../../launcher/health.ts';
import { recordReplication, systemStatus } from '../server/system-health.ts';
import { defineOperation } from './define.ts';

const replication = z.object({
	ok: z.boolean(),
	lastOkAt: z.number().nullable(),
	checkedAt: z.number().nullable(),
	error: z.string().nullable(),
	prefix: z.string().nullable(),
	root: z.string().nullable(),
});

export const getSystemStatus = defineOperation({
	name: 'get_system_status',
	summary:
		'Show setup, free disk space, confirmed replication health and warnings. S3 and email stay optional.',
	role: 'observer',
	http: { method: 'GET', path: '/system/status' },
	input: z.object({}),
	output: z.object({
		emailReady: z.boolean(),
		s3Ready: z.boolean(),
		backupsReady: z.boolean(),
		diskFreeBytes: z.number(),
		diskTotalBytes: z.number(),
		diskLow: z.boolean(),
		replication,
		warnings: z.array(z.object({ code: z.string(), text: z.string(), href: z.string() })),
	}),
	audit: false,
	run: () => systemStatus(),
});

export const testReplication = defineOperation({
	name: 'test_replication',
	summary:
		'Ask the running Litestream process to sync now and wait for remote replication to finish. A running process alone is not a successful backup.',
	role: 'owner',
	http: { method: 'POST', path: '/settings/storage/replication/test' },
	input: z.object({}),
	output: replication,
	audit: {
		target: () => ({ type: 'settings', id: 'replication' }),
		detail: (_input, result) => ({ ok: result.ok }),
	},
	run: async () => {
		recordReplication(await probeReplication());
		return systemStatus().replication;
	},
});
