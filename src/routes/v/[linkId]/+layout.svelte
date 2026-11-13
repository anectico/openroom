<script lang="ts">
	import { FolderClosed, LockKeyhole, LogOut } from '@lucide/svelte';
	import { brandStyle } from '#lib/brand.ts';
	import RoomNavigation from '#lib/viewer/RoomNavigation.svelte';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	let { data, children } = $props();
	const questions = $derived(page.url.pathname.includes('/questions'));
	const requests = $derived(page.url.pathname.includes('/requests'));
function clearDrafts() {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(`openroom:draft:${data.readingScope}:`)) sessionStorage.removeItem(key); } catch {}
 }
</script>

<svelte:window onfocus={() => { if (document.visibilityState === 'visible') void invalidateAll(); }} />

<div data-sveltekit-preload-data={false} class="investor-brand min-h-dvh bg-background" style={brandStyle(data.branding.accentColor)}>
	{#if data.preview}<div class="flex items-center justify-center gap-2 border-b bg-primary/5 px-4 py-2 text-center text-xs text-primary"><LockKeyhole class="size-3.5 shrink-0" />Investor preview · Your visit is not recorded<a class="ml-3 underline underline-offset-4" href="/admin/rooms/{data.roomId ?? ''}">Back to workspace</a></div>{/if}
	<header class="border-b bg-card"><div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-8 sm:py-5"><a href="/v/{data.linkId}" class="flex min-w-0 flex-1 items-center gap-3" title={data.roomName}>{#if data.branding.logoUrl}<img src={data.branding.logoUrl} alt="" class="h-9 w-auto max-w-28 shrink-0 object-contain" />{:else}<span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><FolderClosed class="size-5" strokeWidth={1.6} /></span>{/if}<span class="min-w-0"><span class="mb-1 hidden text-xs sm:block font-medium tracking-[0.16em] text-muted-foreground uppercase">Private data room</span><span class="line-clamp-2 break-words text-sm font-semibold tracking-tight">{data.roomName}</span></span></a>{#if data.email}<form method="POST" onsubmit={clearDrafts} action="/v/{data.linkId}/signout" class="flex items-center gap-3"><span class="hidden max-w-56 truncate text-xs text-muted-foreground sm:block">{data.email}</span><button type="submit" class="flex items-center min-h-11 gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut class="size-3.5" />Sign out</button></form>{/if}</div><RoomNavigation baseHref={`/v/${data.linkId}`} active={questions ? 'questions' : requests ? 'requests' : 'documents'} unreadReplies={data.unreadReplies} actionRequests={data.actionRequests} /></header>
	<main class="mx-auto max-w-6xl px-4 py-4 sm:px-8 sm:py-6">{#key `${data.linkId}:${data.readingScope}:${page.params.fileId ?? ''}`}{@render children()}{/key}</main>
	<footer class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs text-muted-foreground sm:px-8"><span class="flex items-center gap-1.5"><LockKeyhole class="size-3" />Shared privately with you</span>{#if !data.branding.whiteLabel}<span>Powered by <a href="https://github.com/anectico/openroom" class="font-medium text-foreground/70" target="_blank" rel="noreferrer">OpenRoom</a></span>{/if}</footer>
</div>
