<script lang="ts">
	import { CalendarDays, Download, FileText, FolderOpen, ShieldCheck, Users } from '@lucide/svelte';
	import DetailSummary from './DetailSummary.svelte';
	import { formatDate } from './op.ts';
	import { downloadLabels, type Link } from './types.ts';

	let { link, timeZone }: { link: Link; timeZone: string } = $props();
</script>

<DetailSummary
	label="Link access summary"
	primary={{ label: 'Audience', icon: Users, value: link.open ? 'Anyone with the link who enters an email' : link.allow.map((entry) => entry.value).join(', ') || 'No allowed emails' }}
	details={[
		{ label: 'Documents', icon: FolderOpen, value: link.groupName ?? 'All documents in this room' },
		{ label: 'Downloads', icon: Download, value: downloadLabels[link.settings.downloads] },
		{ label: 'Welcome', icon: FileText, value: link.welcomeMarkdown ? 'Personal note after access checks' : 'Room introduction' },
		{ label: 'Expires', icon: CalendarDays, value: link.expiresAt ? formatDate(link.expiresAt, timeZone) : 'No expiry' },
	]}
>
	<div class="col-span-full flex flex-wrap items-center border-t gap-x-3 gap-y-2 px-4 py-3">
		<dt class="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck aria-hidden="true" class="size-3.5" />Protection</dt>
		<dd class="flex flex-wrap gap-1.5">
			{#each [link.settings.verifyEmail ? 'Verified email' : 'Unverified email', link.settings.requireNda ? 'NDA required' : 'No NDA', link.settings.watermark ? 'Watermarked' : 'No watermark', ...(link.hasPassword ? ['Password required'] : [])] as protection (protection)}
				<span class="rounded-md bg-muted px-2 py-0.5 text-xs">{protection}</span>
			{/each}
		</dd>
	</div>
</DetailSummary>

{#if link.settings.downloads !== 'per_file'}<p class="text-xs text-muted-foreground">Download-only files remain downloadable. Use a document group to hide files that should not be shared.</p>{/if}
