import { statfsSync } from 'node:fs';
import { dataDir } from './paths.ts';

export const diskMarginBytes = 1024 ** 3;

export function diskSpace() {
	const stat = statfsSync(dataDir);
	return { free: stat.bavail * stat.bsize, total: stat.blocks * stat.bsize };
}

export function freeDiskBytes() {
	return diskSpace().free;
}

export function requireDiskSpace(bytes = 0) {
	if (freeDiskBytes() < bytes + diskMarginBytes)
		throw new Error('The server does not have enough free disk space. Free space and try again.');
}
