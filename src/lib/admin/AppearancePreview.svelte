<script lang="ts">
 import { ArrowRight, Check, FolderClosed, LockKeyhole, MessageSquare, Search } from '@lucide/svelte';
 import { type Brand, brandStyle } from '#lib/brand.ts';
 import { Button } from '#lib/components/ui/button/index.js';
 import { Input } from '#lib/components/ui/input/index.js';
 import * as Tabs from '#lib/components/ui/tabs/index.js';
 import { renderMarkdown } from '#lib/markdown.ts';
 import DocumentListItem from '#lib/viewer/DocumentListItem.svelte';
 import PinnedDocument from '#lib/viewer/PinnedDocument.svelte';
 import RoomNavigation from '#lib/viewer/RoomNavigation.svelte';
 import RoomWelcome from '#lib/viewer/RoomWelcome.svelte';

 let { brand, name, welcome }: { brand: Brand; name: string; welcome: string } = $props();
 let screen = $state('documents');
 let section = $state('documents');
 let device = $state('fit');
 let availableWidth = $state(0);
 let actualSize = $state(false);
 const renderWidth = $derived(device === 'phone' ? 360 : device === 'desktop' ? 1280 : Math.max(240, availableWidth));
 const scale = $derived(actualSize || device === 'fit' || !availableWidth ? 1 : Math.min(1, availableWidth / renderWidth));
 const html = $derived(renderMarkdown(welcome));
 const previewEmailId = $props.id();
 const samples = ['Company overview', 'Financial highlights', 'Product roadmap'];
</script>

<section class="min-w-0 rounded-xl sm:border sm:bg-muted/25 sm:p-5" aria-label="Appearance preview">
 <div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 class="text-sm font-semibold">Live preview</h3><p class="mt-1 text-xs text-muted-foreground">Sample content · changes appear as you edit</p></div><Tabs.Root bind:value={device}><Tabs.List aria-label="Preview size" class="h-auto"><Tabs.Trigger class="min-h-11 sm:min-h-8" value="fit">Fit to panel</Tabs.Trigger><Tabs.Trigger class="min-h-11 sm:min-h-8" value="desktop">Desktop</Tabs.Trigger><Tabs.Trigger class="min-h-11 sm:min-h-8" value="phone">Phone</Tabs.Trigger></Tabs.List></Tabs.Root></div>
 <Tabs.Root bind:value={screen}>
  <Tabs.List aria-label="Preview screen" class="mb-3 h-auto"><Tabs.Trigger class="min-h-11 sm:min-h-8" value="documents">Inside the room</Tabs.Trigger><Tabs.Trigger class="min-h-11 sm:min-h-8" value="entry">Entry screen</Tabs.Trigger></Tabs.List>
  <div class="mb-3 flex flex-wrap items-center gap-2"><p class="text-xs text-muted-foreground" role="status">{Math.round(renderWidth)} px wide · {Math.round(scale * 100)}% scale</p>{#if device !== 'fit'}<Button type="button" size="sm" variant="outline" class="min-h-11" onclick={() => (actualSize = !actualSize)}>{actualSize ? 'Scale to fit' : 'Actual size'}</Button>{/if}</div>
  <section bind:clientWidth={availableWidth} class="max-h-[680px] w-full min-w-0 overflow-auto rounded-xl border bg-background shadow-sm" aria-label="Scrollable appearance sample">
   <div class="investor-brand @container/preview" data-preview-width={renderWidth} style={`${brandStyle(brand.accentColor)}; width: ${renderWidth}px; zoom: ${scale}`}>
    <Tabs.Content value="documents" class="m-0">
     <header class="border-b bg-card"><div class="flex items-center gap-3 p-4">{#if brand.logoUrl}<img src={brand.logoUrl} alt="Logo preview" class="h-9 max-w-28 object-contain" />{:else}<span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><FolderClosed class="size-5" /></span>{/if}<span class="min-w-0 break-words text-sm font-semibold">{name || 'Your data room'}</span></div><RoomNavigation active={section} onselect={(value) => section = value} /></header>
     <div class="p-4 @xl/preview:p-8">
      {#if section === 'documents'}
       <RoomWelcome name={name || 'Your data room'} {html}>{#snippet tools()}<div class="mt-4 mb-3 flex flex-wrap items-center gap-2"><div class="relative min-w-0 basis-full @sm/preview:flex-1 @sm/preview:basis-auto"><Search class="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" /><Input readonly tabindex={-1} aria-label="Preview document search" placeholder="Find a document…" class="min-h-11 pl-9" /></div><Button variant="outline" size="sm" class="min-h-11" onclick={() => section = 'questions'}><MessageSquare data-icon="inline-start" />My questions</Button></div>{/snippet}</RoomWelcome>
       <section class="mb-6" aria-label="Start here preview"><div class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><div class="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 class="text-base font-semibold">Start here</h3><p class="text-xs text-muted-foreground">3 documents to get started</p></div><div class="flex flex-wrap items-center gap-2"><Button variant="ghost" size="sm" class="min-h-11" disabled>All documents</Button><Button size="sm" class="min-h-11" disabled>Start review<ArrowRight data-icon="inline-end" /></Button></div></div><ol class="grid gap-2 @5xl/preview:grid-cols-3">{#each samples as file, index}<PinnedDocument name={file} kind="pdf" size={2457600} number={index + 1}>{#snippet controls()}<Button variant="ghost" size="sm" class="min-h-11" disabled><Check data-icon="inline-start" />Mark reviewed</Button>{/snippet}</PinnedDocument>{/each}</ol></section>
       <h3 class="mb-3 text-base font-semibold">All documents</h3><ul class="divide-y overflow-hidden rounded-xl border bg-card">{#each samples as file, index}<DocumentListItem name={file} kind="pdf" size={2457600} number={`1.${index + 1}`} />{/each}</ul>
      {:else if section === 'questions'}<h3 class="text-xl font-semibold">My questions</h3><p class="mt-2 text-sm text-muted-foreground">Private conversations with the team.</p><div class="mt-5 rounded-xl border bg-card p-5"><h4 class="text-sm font-medium">Ask the team</h4><p class="mt-2 text-sm text-muted-foreground">Your questions and replies will appear here.</p><Button class="mt-4 min-h-11" disabled>Ask a question</Button></div>
      {:else}<h3 class="text-xl font-semibold">File requests</h3><p class="mt-2 text-sm text-muted-foreground">Documents the team has asked you to share.</p><div class="mt-5 rounded-xl border bg-card p-5"><h4 class="text-sm font-medium">No requests right now</h4><p class="mt-2 text-sm text-muted-foreground">New requests will appear here.</p></div>{/if}
     </div>
    </Tabs.Content>
    <Tabs.Content value="entry" class="m-0"><div class="px-4 py-8"><div class="mx-auto flex max-w-sm flex-col gap-4 rounded-xl border bg-card p-5">{#if brand.logoUrl}<img src={brand.logoUrl} alt="Logo preview" class="h-12 max-w-full self-start object-contain" />{/if}<p class="break-words text-xs font-medium text-muted-foreground">{name || 'Your data room'}</p><h3 class="text-2xl font-semibold tracking-tight">Welcome to the room.</h3><p class="text-sm text-muted-foreground">Enter your email to access the documents shared with you.</p><label for={previewEmailId} class="flex flex-col gap-2 text-sm">Your email<Input id={previewEmailId} readonly tabindex={-1} class="min-h-11" placeholder="investor@example.com" /></label><Button disabled class="min-h-11">Continue</Button><p class="text-xs text-muted-foreground">This room records which pages you view.</p>{#if html}<details class="rounded-lg border"><summary class="min-h-11 cursor-pointer p-3 text-sm font-medium">Read the welcome</summary><div class="md break-words border-t p-3 text-sm [overflow-wrap:anywhere]">{@html html}</div></details>{/if}</div></div></Tabs.Content>
    <div class="flex flex-wrap justify-between gap-2 px-4 pb-5 text-xs text-muted-foreground"><span class="flex items-center gap-1"><LockKeyhole class="size-3" />Shared privately with you</span>{#if !brand.whiteLabel}<span>Powered by OpenRoom</span>{/if}</div>
   </div>
  </section>
 </Tabs.Root>
 <p class="mt-3 text-xs text-muted-foreground">For real documents and access rules, use “Preview as investor” on a sharing link.</p>
</section>
