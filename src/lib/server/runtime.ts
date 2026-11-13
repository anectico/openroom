import { applyRetention, runCapEmail, runNoticeEmail } from './activity.ts';
import { runArchive } from './archive.ts';
import { closeDatabase, database } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { runEmailJob } from './email.ts';
import { cleanupErasedFiles } from './erasure.ts';
import { cleanupExports, runZipExport } from './exports.ts';
import { defineJob, startJobs, stopJobs } from './jobs.ts';
import { cleanupReleasedObjects, sweepStrayObjects } from './object-cleanup.ts';
import { runPageCount } from './pdf.ts';
import { reencryptAll } from './rotation.ts';
import { s3Config } from './s3.ts';
import { seedOwner } from './seed.ts';
import { setSetting } from './settings.ts';
import { moveDiskObjects, queueStorageMove } from './storage-move.ts';
import { resumeTransfer, runStorageTransfer } from './storage-transfer.ts';
import { checkSystemHealth, persistEnvironmentStorage, recordReplication } from './system-health.ts';
import { cleanupUploads, resetInProgressUploads } from './uploads.ts';
import { cleanupGates } from './viewer/gates.ts';
import { runWebhookJob } from './webhooks.ts';

export type RuntimeControl = {
	stop: () => Promise<void>;
	checkpoint: () => unknown;
	storageConfig: typeof s3Config;
	replicationStatus: typeof recordReplication;
};

export const runtimeKey = Symbol.for('openroom.runtime');
const store = globalThis as typeof globalThis & { [runtimeKey]?: RuntimeControl };

const day = 24 * 60 * 60_000;

function defineCoreJobs() {
	defineJob(
		'jobs.prune',
		() => {
			database()
				.sqlite.prepare('DELETE FROM jobs WHERE schedule_key IS NULL AND (done_at < ? OR failed_at < ?)')
				.run(Date.now() - 7 * day, Date.now() - 7 * day);
		},
		{ everyMs: day },
	);
	defineJob('objects.cleanup', () => cleanupReleasedObjects(), { everyMs: day });
	defineJob('objects.sweep', () => sweepStrayObjects(), { everyMs: 7 * day });
	defineJob('system.health', checkSystemHealth, { everyMs: 60_000 });
	defineJob('email.send', runEmailJob);
	defineJob('email.reset', runEmailJob);
	defineJob('email.code', runEmailJob);
	defineJob('email.notice', runEmailJob);
	defineJob('privacy.cleanup', cleanupErasedFiles);
	defineJob('files.pages', runPageCount);
	defineJob('storage.transfer', runStorageTransfer);
	defineJob('storage.resume', resumeTransfer, { everyMs: 60 * 60_000 });
	defineJob('storage.to_s3', moveDiskObjects);
	defineJob('storage.rescan', queueStorageMove, { everyMs: 60 * 60_000 });
	defineJob('notices.email', runNoticeEmail);
	defineJob('notices.cap_email', runCapEmail);
	defineJob('activity.retention', () => applyRetention(), { everyMs: day });
	defineJob('export.zip', runZipExport);
	defineJob('export.archive', runArchive);
	defineJob('webhook.deliver', runWebhookJob);
	defineJob('exports.cleanup', () => cleanupExports(), { everyMs: 60 * 60_000 });
	defineJob('gates.cleanup', () => cleanupGates(), { everyMs: 60 * 60_000 });
	defineJob(
		'uploads.cleanup',
		async () => {
			await cleanupUploads();
		},
		{ everyMs: 60 * 60_000 },
	);
}

export async function startRuntime() {
	if (store[runtimeKey]) return;
	store[runtimeKey] = {
		stop: stopRuntime,
		checkpoint: passiveCheckpoint,
		storageConfig: s3Config,
		replicationStatus: recordReplication,
	};
	const result = migrate();
	if (result.applied.length) console.log(`applied migrations: ${result.applied.join(', ')}`);
	database();
	resetInProgressUploads();
	const rotated = reencryptAll();
	if (rotated) console.log(`re-encrypted ${rotated} value(s) under the new secret key`);
	await persistEnvironmentStorage();
	setSetting('replication.started_at', String(Date.now()));
	await seedOwner();
	defineCoreJobs();
	resumeTransfer();
	startJobs();
}

async function stopRuntime() {
	await stopJobs();
	closeDatabase();
	store[runtimeKey] = undefined;
}

function passiveCheckpoint() {
	return database().sqlite.pragma('wal_checkpoint(PASSIVE)');
}
