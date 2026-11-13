export type LinkSettings = {
	verifyEmail: boolean;
	requireNda: boolean;
	watermark: boolean;
	screenshotProtection: boolean;
	downloads: 'none' | 'per_file' | 'zip';
	customFields: { label: string; required: boolean }[];
	notifyEveryView: boolean;
	readPastShare: number;
};

export type TreeNode = {
	type: 'folder' | 'file';
	id: string;
	parentId: string | null;
	number: string;
	depth: number;
	name: string;
	kind: 'pdf' | 'image' | 'video' | 'download' | null;
	version: number | null;
	size: number | null;
	contentType: string | null;
};

export type Room = {
	id: string;
	name: string;
	slug: string;
	welcomeMarkdown: string;
	pinnedFileIds: string[];
	linkDefaults: LinkSettings;
	hasNda: boolean;
	frozenAt: number | null;
	frozenRetentionDays: number;
	createdAt: number;
	fileCount: number;
	activeLinkCount: number;
	tree: TreeNode[];
};

export type Link = {
	id: string;
	roomId: string;
	label: string;
	welcomeMarkdown: string | null;
	url: string;
	status: 'active' | 'expired' | 'revoked';
	open: boolean;
	allow: { id: string; kind: 'email' | 'domain'; value: string }[];
	blocks: { id: string; kind: 'email' | 'domain'; value: string }[];
	hasPassword: boolean;
	expiresAt: number | null;
	revokedAt: number | null;
	invitedAt: number | null;
	createdAt: number;
	settings: LinkSettings;
	overridden: string[];
	groupId: string | null;
	groupName: string | null;
	lastOpenedAt: number | null;
	viewerCount: number;
};
