<script lang="ts">
	import PageHeading from '#lib/admin/PageHeading.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';


	let { data, children } = $props();
	const tabs = $derived(
		data.member?.role === 'owner'
			? [
					{ href: '/admin/settings', label: 'General and email' },
					{ href: '/admin/settings/storage', label: 'Storage & backups' },
					{ href: '/admin/settings/members', label: 'Members' },
					{ href: '/admin/settings/webhooks', label: 'Webhooks' },
					{ href: '/admin/settings/api-keys', label: 'API keys' },
				]
			: [{ href: '/admin/settings/api-keys', label: 'API keys' }],
	);
</script>

<PageHeading title="Workspace settings" description="Make OpenRoom your own. Manage your team, services and preferences." />
<nav class="mb-6 hidden sm:flex gap-1 overflow-x-auto border-b" aria-label="Settings">
	{#each tabs as tab (tab.href)}
		<a
			href={tab.href}
			class="-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap {page.url.pathname === tab.href
				? 'border-foreground font-medium'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
			aria-current={page.url.pathname === tab.href ? 'page' : undefined}>{tab.label}</a
		>
	{/each}
</nav>
<div class="mb-5 sm:hidden"><label for="settings-section" class="sr-only">Settings section</label><select id="settings-section" class="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm font-medium" value={page.url.pathname} onchange={(event) => goto(event.currentTarget.value)}>{#each tabs as tab (tab.href)}<option value={tab.href}>{tab.label}</option>{/each}</select></div>
{@render children()}
