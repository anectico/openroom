import type { Role } from '#lib/server/members.ts';

declare global {
	namespace App {
		interface Locals {
			member: { id: string; name: string; email: string; role: Role } | null;
		}
	}
}
