<script lang="ts">
	import { LockKeyhole, LogOut } from '@lucide/svelte';
	import { brandStyle } from '#lib/brand.ts';
	import OpenRoomCredit from '#lib/components/OpenRoomCredit.svelte';
	import BrandIdentity from '#lib/viewer/BrandIdentity.svelte';
	import RoomNavigation from '#lib/viewer/RoomNavigation.svelte';
	import RoomWelcome from '#lib/viewer/RoomWelcome.svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	import type { LayoutProps } from './$types';

	type Appearance = { section: string; onselect: (section: string) => void; onWelcomeDismiss: () => void };
	let { data, children, appearance }: Pick<LayoutProps, 'data' | 'children'> & { appearance?: Appearance } = $props();
	const questions = $derived(page.url.pathname.includes('/questions'));
	const requests = $derived(page.url.pathname.includes('/requests'));
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
		{#if data.welcome}
			{#key data.welcome.storageKey}
				<RoomWelcome html={data.welcome.html} storageKey={appearance ? null : data.welcome.storageKey} name={data.roomName} logoUrl={data.branding.logoUrl}
					coverUrl={data.branding.coverUrl} preview={!!appearance || data.preview} onDismiss={appearance?.onWelcomeDismiss} />
			{/key}
		{:else if data.coverOnly}
			<img src={data.coverOnly} alt="" class="mb-5 h-20 w-full rounded-xl object-cover sm:h-36" />
		{/if}
		<RoomNavigation baseHref={`/v/${data.linkId}`} onselect={appearance?.onselect} active={appearance?.section ?? (questions ? 'questions' : requests ? 'requests' : 'documents')} unreadReplies={data.unreadReplies} actionRequests={data.actionRequests} />
		{#key `${data.linkId}:${data.readingScope}:${page.params.fileId ?? ''}`}{@render children()}{/key}</main>
	<footer class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs text-muted-foreground sm:px-8"><span class="flex items-center gap-1.5"><LockKeyhole class="size-3" />Shared privately with you</span><OpenRoomCredit /></footer>
</div>


<style>
	:global(html:has(.investor-brand)) { scrollbar-gutter: stable; }
</style>
