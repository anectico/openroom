import { notify } from './activity.ts';
import { database } from './db/index.ts';
import { diskSpace } from './disk-space.ts';
import { emailReady } from './email.ts';
import { s3Config, s3Connection, s3Identity } from './s3.ts';
import { getSetting, setSecretSetting, setSetting } from './settings.ts';

export type ReplicationStatus = {
	ok: boolean;
	checkedAt: number;
	error: string | null;
	root?: string | null;
	prefix?: string | null;
};

export function recordReplication(status: ReplicationStatus) {
	setSetting('replication.checked_at', String(status.checkedAt));
	setSetting('replication.error', status.error);
	if (status.ok) setSetting('replication.last_ok_at', String(status.checkedAt));
	if (status.root) setSetting('replication.root', status.root);
	if (status.prefix) setSetting('replication.prefix', status.prefix);
}

export async function persistEnvironmentStorage() {
	const config = s3Config();
	if (config?.source !== 'env') return;
	if (
		!getSetting('storage.s3.identity') &&
		!process.env.RESTORE_FROM &&
		(await s3Connection(config).disk.exists('db/CURRENT'))
	)
		throw new Error(
			'This bucket already contains a database replica. Use the fresh-install restore procedure or an empty dedicated bucket.',
		);
	database()
		.sqlite.transaction(() => {
			setSetting('storage.s3.bucket', config.bucket);
			setSetting('storage.s3.region', config.region);
			setSetting('storage.s3.endpoint', config.endpoint);
			setSetting('storage.s3.force_path_style', String(config.forcePathStyle));
			setSecretSetting('storage.s3.access_key_id', config.accessKeyId);
			setSecretSetting('storage.s3.secret_access_key', config.secretAccessKey);
			setSetting('storage.s3.identity', s3Identity(config));
		})
		.immediate();
}

export function systemStatus() {
	const s3 = s3Config();
	const disk = diskSpace();
	const lastOkAt = Number(getSetting('replication.last_ok_at')) || null;
	const checkedAt = Number(getSetting('replication.checked_at')) || null;
	const replicaOk = !!lastOkAt && Date.now() - lastOkAt < 90_000 && !getSetting('replication.error');
	const diskLow = disk.free < 2 * 1024 ** 3 || (disk.total > 0 && disk.free / disk.total < 0.1);
	const warnings: { code: string; text: string; href: string }[] = [];
	if (!s3)
		warnings.push({
			code: 'backups_local',
			text: 'Files and backups are on this server. Add S3 to protect them if the server is lost.',
			href: '/admin/settings/storage',
		});
	else if (!replicaOk)
		warnings.push({
			code: 'replication_stopped',
			text: 'The database backup has not been confirmed recently. Check replication before relying on off-server backups.',
			href: '/admin/settings/storage',
		});
	if (diskLow)
		warnings.push({
			code: 'disk_low',
			text: 'The server is running low on disk space. Free space or move files to S3.',
			href: '/admin/settings/storage',
		});
	const moving = Number(
		(
			database().sqlite.prepare("SELECT count(*) AS n FROM objects WHERE location = 'disk'").get() as {
				n: number;
			}
		).n,
	);
	if (s3 && moving)
		warnings.push({
			code: 'files_moving',
			text: 'Existing files are still being copied to S3. Keep this server until every file has moved.',
			href: '/admin/settings/storage',
		});
	return {
		emailReady: emailReady(),
		s3Ready: !!s3,
		backupsReady: !!s3 && replicaOk && !moving,
		diskFreeBytes: disk.free,
		diskTotalBytes: disk.total,
		diskLow,
		replication: {
			ok: replicaOk,
			lastOkAt,
			checkedAt,
			error: getSetting('replication.error'),
			prefix: getSetting('replication.prefix'),
			root: getSetting('replication.root'),
		},
		warnings,
	};
}

export function checkSystemHealth() {
	const status = systemStatus();
	for (const [event, active] of [
		['disk_low', status.diskLow],
		[
			'replication_stopped',
			status.s3Ready &&
				!status.replication.ok &&
				Date.now() - Number(getSetting('replication.started_at') ?? 0) > 90_000,
		],
	] as const) {
		const key = `health.${event}`;
		if (active && getSetting(key) !== '1') notify(event, { detail: { freeBytes: status.diskFreeBytes } });
		setSetting(key, active ? '1' : '0');
	}
}
