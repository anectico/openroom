<script lang="ts">
	import { CalendarClock, LockKeyhole, LogOut } from '@lucide/svelte';
	import { brandStyle } from '#lib/brand.ts';
	import OpenRoomCredit from '#lib/components/OpenRoomCredit.svelte';
	import BrandIdentity from '#lib/viewer/BrandIdentity.svelte';
	import DueDate from '#lib/viewer/DueDate.svelte';
	import RoomNavigation from '#lib/viewer/RoomNavigation.svelte';
	import RoomWelcome from '#lib/viewer/RoomWelcome.svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import type { LayoutProps } from './$types';

	type Appearance = { section: string; onselect: (section: string) => void; onWelcomeDismiss: () => void };
	let { data, children, appearance }: Pick<LayoutProps, 'data' | 'children'> & { appearance?: Appearance } = $props();
	const questions = $derived(page.url.pathname.includes('/questions'));
	const requests = $derived(page.url.pathname.includes('/requests'));
	const reading = $derived(!appearance && page.route.id?.includes('/view/') === true);
function clearDrafts() {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(`openroom:draft:${data.readingScope}:`)) sessionStorage.removeItem(key); } catch {}
 }
</script>

<svelte:window onfocus={() => { if (!appearance && document.visibilityState === 'visible') void invalidateAll(); }} />

<div data-sveltekit-preload-data={false} class="investor-brand min-h-dvh bg-background" style={brandStyle(data.branding.accentColor)}>
	{#if data.preview && !appearance}<div class="flex items-center justify-center gap-2 border-b bg-primary/5 px-4 py-2 text-center text-xs text-primary"><LockKeyhole class="size-3.5 shrink-0" />Investor preview · Your visit is not recorded<a class="ml-3 underline underline-offset-4" href="/admin/rooms/{data.roomId ?? ''}">Back to workspace</a></div>{/if}
	{#snippet account()}{#if data.email}<form method="POST" onsubmit={(event) => { if (appearance) event.preventDefault(); else clearDrafts(); }} action="/v/{data.linkId}/signout" class="flex items-center gap-3"><span class="hidden max-w-56 truncate text-xs text-muted-foreground sm:block">{data.email}</span><button type="submit" disabled={!!appearance} class="flex items-center min-h-11 gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut class="size-3.5" />Sign out</button></form>{/if}{/snippet}
	<header class="border-b bg-card">
		<div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
			<a class="min-w-0 flex-1" href={appearance ? '#preview-documents' : `/v/${data.linkId}`}
				onclick={(event) => { if (appearance) { event.preventDefault(); appearance.onselect('documents'); } }}>
				<BrandIdentity name={data.roomName} logoUrl={data.branding.logoUrl} />
			</a>
			{@render account()}
		</div>
	</header>
	<main class="mx-auto max-w-6xl px-4 py-4 sm:px-8 sm:py-6">
		{#if data.welcome && !reading}
			{#key data.welcome.storageKey}
				<RoomWelcome html={data.welcome.html} storageKey={appearance ? null : data.welcome.storageKey} name={data.roomName} logoUrl={data.branding.logoUrl}
					coverUrl={data.branding.coverUrl} preview={!!appearance || data.preview} onDismiss={appearance?.onWelcomeDismiss} start={appearance ? null : data.welcome.start} />
			{/key}
		{:else if data.coverOnly}
			<img src={data.coverOnly} alt="" class="mb-5 h-20 w-full rounded-xl object-cover sm:h-36" />
		{/if}
		<RoomNavigation baseHref={`/v/${data.linkId}`} onselect={appearance?.onselect} active={appearance?.section ?? (questions ? 'questions' : requests ? 'requests' : 'documents')} unreadReplies={data.unreadReplies} actionRequests={data.actionRequests} />
		{#key `${data.linkId}:${data.readingScope}:${page.params.fileId ?? ''}`}{@render children()}{/key}</main>
	<footer class="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-xs text-muted-foreground sm:px-8">
		{#if data.records?.length}
			<details class="max-w-xl">
				<summary class="flex min-h-11 cursor-pointer items-center gap-1.5 font-medium text-foreground"><LockKeyhole class="size-3" />What this room records</summary>
				<ul class="mt-1 flex list-disc flex-col gap-1 pl-5">{#each data.records as fact (fact)}<li>{fact}</li>{/each}</ul>
			</details>
		{/if}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<span class="flex flex-wrap items-center gap-x-4 gap-y-1">
				<span class="flex items-center gap-1.5"><LockKeyhole class="size-3" />Shared privately with you</span>
				{#if data.accessUntil}<span class="flex items-center gap-1.5"><CalendarClock class="size-3" />Access until <DueDate at={data.accessUntil} plain /></span>{/if}
				{#if data.ndaCopy && !appearance}<a class="flex min-h-11 items-center underline underline-offset-4 hover:text-foreground" href="/v/{data.linkId}/nda/copy" download>Your NDA</a>{/if}
			</span>
			<OpenRoomCredit />
		</div>
	</footer>
</div>


<style>
	:global(html:has(.investor-brand)) { scrollbar-gutter: stable; }
</style>
