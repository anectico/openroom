<script lang="ts">
	import { HardDrive, KeyRound, Settings, Users, Webhook } from '@lucide/svelte';
	import PageHeading from '#lib/admin/PageHeading.svelte';
	import SectionNav from '#lib/admin/SectionNav.svelte';
	import { page } from '$app/state';

	let { data, children } = $props();
	const tabs = $derived(
		data.member?.role === 'owner'
			? [
					{ href: '/admin/settings', label: 'General', icon: Settings },
					{ href: '/admin/settings/storage', label: 'Storage & backups', icon: HardDrive },
					{ href: '/admin/settings/members', label: 'Members', icon: Users },
					{ href: '/admin/settings/webhooks', label: 'Webhooks', icon: Webhook },
					{ href: '/admin/settings/api-keys', label: 'API keys', icon: KeyRound },
				]
			: [{ href: '/admin/settings/api-keys', label: 'API keys', icon: KeyRound }],
	);
</script>

<PageHeading title="Settings" description="Workspace preferences, email, appearance, storage, members, webhooks and API keys." eyebrow="Workspace" />
<SectionNav label="Settings" {tabs} activeHref={page.url.pathname} current={tabs.find((tab) => tab.href === page.url.pathname)?.label ?? 'Settings'} />
{@render children()}
