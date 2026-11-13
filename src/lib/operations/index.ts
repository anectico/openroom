import {
	exportViewerData,
	getNotificationPrefs,
	getRoomActivity,
	getViewer,
	getViewingNow,
	listNotices,
	listViewers,
	markNoticesRead,
	setNotificationPref,
} from './activity.ts';
import { createApiKey, listApiKeys, revokeApiKey } from './api-keys.ts';
import { listAuditLog } from './audit.ts';
import { addBlocks, listBlocks, removeBlock } from './blocks.ts';
import { getBranding, setLogo, updateBranding } from './branding.ts';
import type { Operation } from './define.ts';
import { exportRoomZip, getExport } from './exports.ts';
import {
	createFolder,
	deleteFile,
	deleteFolder,
	listFileVersions,
	setCurrentVersion,
	updateFile,
	updateFolder,
} from './files.ts';
import { createGroup, deleteGroup, getGroup, listGroups, setGroupAccess, updateGroup } from './groups.ts';
import { uploadFromUrl, uploadInline } from './ingestion.ts';
import {
	createLink,
	getLink,
	listLinks,
	newLinkAddress,
	previewLink,
	revokeAllLinks,
	revokeLink,
	sendLinkInvites,
	updateLink,
	updateLinkDefaults,
} from './links.ts';
import {
	cancelInvite,
	changeMemberRole,
	getMe,
	inviteMember,
	listMembers,
	removeMember,
	resendInvite,
	updateProfile,
} from './members.ts';
import { getNda, publishNda } from './nda.ts';
import { setPinnedDocuments } from './pins.ts';
import { eraseViewer } from './privacy.ts';
import {
	createFaqEntry,
	deleteFaqEntry,
	getConversation,
	listConversations,
	listFaq,
	replyToConversation,
	updateFaqEntry,
} from './questions.ts';
import { closeFileRequest, createFileRequest, listFileRequests } from './requests.ts';
import {
	createRoom,
	deleteRoom,
	duplicateRoomOp,
	exportRoomIndex,
	freezeRoom,
	getRoom,
	getRoomArchive,
	listRooms,
	retryRoomArchive,
	setRoomRetention,
	updateRoom,
} from './rooms.ts';
import {
	getEmailSettings,
	getGeneralSettings,
	testEmail,
	updateEmailSettings,
	updateGeneralSettings,
} from './settings.ts';
import {
	cancelStorageMove,
	getStorageSettings,
	moveStorage,
	retryStorageMove,
	testStorage,
	updateStorageSettings,
} from './storage.ts';
import { getSystemStatus, testReplication } from './system.ts';
import { createUpload, finishUpload } from './uploads.ts';
import { createWebhook, deleteWebhook, listWebhooks, testWebhook, updateWebhook } from './webhooks.ts';

export const operations: Operation[] = [
	getMe,
	updateProfile,
	listMembers,
	inviteMember,
	resendInvite,
	cancelInvite,
	changeMemberRole,
	removeMember,
	listApiKeys,
	createApiKey,
	revokeApiKey,
	listAuditLog,
	listRooms,
	getRoom,
	createRoom,
	updateRoom,
	setPinnedDocuments,
	deleteRoom,
	createFolder,
	updateFolder,
	deleteFolder,
	updateFile,
	deleteFile,
	listFileVersions,
	setCurrentVersion,
	createUpload,
	uploadInline,
	uploadFromUrl,
	finishUpload,
	listLinks,
	getLink,
	createLink,
	updateLink,
	revokeLink,
	revokeAllLinks,
	newLinkAddress,
	updateLinkDefaults,
	listBlocks,
	addBlocks,
	removeBlock,
	getEmailSettings,
	updateEmailSettings,
	testEmail,
	getGeneralSettings,
	updateGeneralSettings,
	getSystemStatus,
	testReplication,
	moveStorage,
	cancelStorageMove,
	getStorageSettings,
	updateStorageSettings,
	testStorage,
	retryStorageMove,
	listGroups,
	getGroup,
	createGroup,
	updateGroup,
	deleteGroup,
	setGroupAccess,
	getNda,
	publishNda,
	previewLink,
	sendLinkInvites,
	exportRoomZip,
	getExport,
	getRoomActivity,
	getViewingNow,
	listViewers,
	getViewer,
	exportViewerData,
	eraseViewer,
	listNotices,
	markNoticesRead,
	getNotificationPrefs,
	setNotificationPref,
	listConversations,
	getConversation,
	replyToConversation,
	listFaq,
	createFaqEntry,
	updateFaqEntry,
	deleteFaqEntry,
	listFileRequests,
	createFileRequest,
	closeFileRequest,
	duplicateRoomOp,
	exportRoomIndex,
	freezeRoom,
	setRoomRetention,
	getRoomArchive,
	retryRoomArchive,
	listWebhooks,
	createWebhook,
	updateWebhook,
	deleteWebhook,
	testWebhook,
	getBranding,
	updateBranding,
	setLogo,
];

const names = new Set<string>();
const routes = new Set<string>();
for (const op of operations) {
	const route = `${op.http.method} ${op.http.path.replace(/\{[^}]+\}/g, '{}')}`;
	if (names.has(op.name)) throw new Error(`Duplicate operation ${op.name}`);
	if (routes.has(route)) throw new Error(`Duplicate route ${route}`);
	if (op.http.method !== 'GET' && !op.audit)
		throw new Error(`${op.name} changes state but has no audit entry`);
	names.add(op.name);
	routes.add(route);
}

export const operationsByName = new Map(operations.map((op) => [op.name, op]));

type Compiled = { op: Operation; method: string; pattern: RegExp; params: string[] };

const compiled: Compiled[] = operations.map((op) => {
	const params: string[] = [];
	const source = op.http.path
		.split('/')
		.map((part) => {
			const m = part.match(/^\{(\w+)\}$/);
			if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			params.push(m[1]);
			return '([^/]+)';
		})
		.join('/');
	return { op, method: op.http.method, pattern: new RegExp(`^${source}$`), params };
});

export function matchRoute(method: string, path: string) {
	let pathMatched = false;
	for (const c of compiled) {
		const m = path.match(c.pattern);
		if (!m) continue;
		pathMatched = true;
		if (c.method !== method) continue;
		const params = Object.fromEntries(c.params.map((name, i) => [name, m[i + 1]]));
		return { op: c.op, params };
	}
	return pathMatched ? 'method' : null;
}
