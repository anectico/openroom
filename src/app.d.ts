import type { Role } from '#lib/server/members.ts';

declare global {
	namespace App {
		interface PageState {
			folderOrigin?: { destination: string; label: string };
		}
		interface Locals {
			member: { id: string; name: string; email: string; role: Role } | null;
		}
	}
}
