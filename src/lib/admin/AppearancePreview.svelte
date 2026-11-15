<script lang="ts">
 import { Check, LockKeyhole, Search } from '@lucide/svelte';
 import { type Brand, brandStyle } from '#lib/brand.ts';
	import OpenRoomCredit from '#lib/components/OpenRoomCredit.svelte';
 import { Button } from '#lib/components/ui/button/index.js';
 import { Input } from '#lib/components/ui/input/index.js';
 import * as Tabs from '#lib/components/ui/tabs/index.js';
 import { renderMarkdown } from '#lib/markdown.ts';
 import BrandIdentity from '#lib/viewer/BrandIdentity.svelte';
 import DocumentListItem from '#lib/viewer/DocumentListItem.svelte';
 import FeaturedDocument from '#lib/viewer/FeaturedDocument.svelte';
 import PinnedDocument from '#lib/viewer/PinnedDocument.svelte';
 import RoomNavigation from '#lib/viewer/RoomNavigation.svelte';
 import RoomWelcome from '#lib/viewer/RoomWelcome.svelte';

 let { brand, name, welcome }: { brand: Brand; name: string; welcome: string } = $props();
 let screen = $state('documents');
 let section = $state('documents');
 let device = $state('fit');
 let availableWidth = $state(0);
 let screenWidth = $state(0);
 let actualSize = $state(false);
 const renderWidth = $derived(device === 'phone' ? 360 : device === 'desktop' ? 1280 : screenWidth || availableWidth);
 const phone = $derived(device === 'phone');
 const frameWidth = $derived(phone ? renderWidth + 16 : renderWidth);
 const availableFrameWidth = $derived(phone ? availableWidth : screenWidth);
 const fitScale = $derived(device === 'fit' || !availableFrameWidth ? 1 : Math.min(1, availableFrameWidth / frameWidth));
 const scale = $derived(actualSize ? 1 : fitScale);
 const html = $derived(renderMarkdown(welcome));
 const previewEmailId = $props.id();
 const samples = ['Company overview', 'Financial highlights', 'Product roadmap'];
</script>

<section class="min-w-0 rounded-xl sm:border sm:bg-muted/25 sm:p-5" aria-label="Appearance preview">
 <div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 class="text-sm font-semibold">Live preview</h3><p class="mt-1 text-xs text-muted-foreground">Sample content · changes appear as you edit</p></div><Tabs.Root value={device} onValueChange={(value) => { device = value; actualSize = false; }}><Tabs.List aria-label="Preview size" class="h-auto"><Tabs.Trigger class="min-h-11 sm:min-h-8" value="fit">Fit to panel</Tabs.Trigger><Tabs.Trigger class="min-h-11 sm:min-h-8" value="desktop">Desktop</Tabs.Trigger><Tabs.Trigger class="min-h-11 sm:min-h-8" value="phone">Phone</Tabs.Trigger></Tabs.List></Tabs.Root></div>
 <Tabs.Root bind:value={screen}>
  <Tabs.List aria-label="Preview screen" class="mb-3 h-auto"><Tabs.Trigger class="min-h-11 sm:min-h-8" value="documents">Inside the room</Tabs.Trigger><Tabs.Trigger class="min-h-11 sm:min-h-8" value="entry">Entry screen</Tabs.Trigger></Tabs.List>
  <div class="mb-3 flex flex-wrap items-center gap-2"><p class="text-xs text-muted-foreground" role="status">{Math.round(renderWidth)} px wide · {Math.round(scale * 100)}% scale</p>{#if fitScale < 1}<Button type="button" size="sm" variant="outline" class="min-h-11" onclick={() => (actualSize = !actualSize)}>{actualSize ? 'Scale to fit' : 'Actual size'}</Button>{/if}</div>
  <div bind:clientWidth={availableWidth} class="min-w-0" class:hide-scrollbar={phone} class:overflow-x-auto={phone && actualSize} class:overflow-x-clip={phone && !actualSize}>
   <div class:phone-frame={phone} style:width={phone ? `${renderWidth}px` : undefined} style:zoom={phone ? scale : undefined}>
    <section
     class={phone ? 'phone-screen hide-scrollbar' : 'max-h-[680px] overflow-auto rounded-xl border bg-background shadow-sm'}
     bind:clientWidth={screenWidth}
     aria-label="Scrollable appearance sample"
    >
     <div class="investor-brand @container/preview" data-preview-width={renderWidth} style={brandStyle(brand.accentColor)} style:width={device === 'desktop' ? `${renderWidth}px` : undefined} style:zoom={device === 'desktop' ? scale : undefined}>
      <Tabs.Content value="documents" class="m-0">
       <header class="border-b bg-card">{#if section === 'documents'}<RoomWelcome name={name || 'Your data room'} logoUrl={brand.logoUrl} coverUrl={brand.coverUrl} {html} />{:else}<div class="flex items-center gap-3 p-4"><BrandIdentity name={name || 'Your data room'} logoUrl={brand.logoUrl} /></div>{/if}<RoomNavigation active={section} onselect={(value) => section = value} /></header>
       <div class="p-4 @xl/preview:p-8">
        {#if section === 'documents'}
         <section class="mb-6" aria-label="Start here preview">
          <div class="mb-3 flex flex-wrap items-baseline gap-3"><h3 class="font-semibold">Start here</h3><p class="text-xs text-muted-foreground">3 documents to get started</p></div>
          <ol class="grid gap-2">{#each samples as file, index}
           {#snippet controls()}<Button variant="ghost" size="sm" class="min-h-11" disabled><Check />Mark reviewed</Button>{/snippet}
           {#if index === 0}<li><FeaturedDocument name={file} kind="pdf" size={2457600} action="Start review" {controls} /></li>
           {:else}<PinnedDocument name={file} kind="pdf" size={2457600} number={index + 1} {controls} />{/if}
          {/each}</ol>
         </section>
         <div class="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 class="text-base font-semibold">All documents</h3><div class="relative w-full @xl/preview:w-64"><Search class="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" /><Input readonly tabindex={-1} aria-label="Preview document search" placeholder="Find a document…" class="min-h-11 pl-9" /></div></div><ul class="divide-y overflow-hidden rounded-xl border bg-card">{#each samples as file, index}<DocumentListItem name={file} kind="pdf" size={2457600} number={`1.${index + 1}`} />{/each}</ul>
        {:else if section === 'questions'}<h3 class="text-xl font-semibold">My questions</h3><p class="mt-2 text-sm text-muted-foreground">Private conversations with the team.</p><div class="mt-5 rounded-xl border bg-card p-5"><h4 class="text-sm font-medium">Ask the team</h4><p class="mt-2 text-sm text-muted-foreground">Your questions and replies will appear here.</p><Button class="mt-4 min-h-11" disabled>Ask a question</Button></div>
        {:else}<h3 class="text-xl font-semibold">File requests</h3><p class="mt-2 text-sm text-muted-foreground">Documents the team has asked you to share.</p><div class="mt-5 rounded-xl border bg-card p-5"><h4 class="text-sm font-medium">No requests right now</h4><p class="mt-2 text-sm text-muted-foreground">New requests will appear here.</p></div>{/if}
       </div>
      </Tabs.Content>
      <Tabs.Content value="entry" class="m-0"><div class="px-4 py-8"><div class="mx-auto flex max-w-sm flex-col gap-4 rounded-xl border bg-card p-5">{#if brand.logoUrl}<img src={brand.logoUrl} alt="Logo preview" class="h-12 max-w-full self-start object-contain" />{/if}<p class="break-words text-xs font-medium text-muted-foreground">{name || 'Your data room'}</p><h3 class="text-2xl font-semibold tracking-tight">Welcome to the room.</h3><p class="text-sm text-muted-foreground">Enter your email to access the documents shared with you.</p><label for={previewEmailId} class="flex flex-col gap-2 text-sm">Your email<Input id={previewEmailId} readonly tabindex={-1} class="min-h-11" placeholder="investor@example.com" /></label><Button disabled class="min-h-11">Continue</Button><p class="text-xs text-muted-foreground">This room records which pages you view.</p>{#if html}<details class="rounded-lg border"><summary class="min-h-11 cursor-pointer p-3 text-sm font-medium">Read the welcome</summary><div class="md break-words border-t p-3 text-sm [overflow-wrap:anywhere]">{@html html}</div></details>{/if}</div></div></Tabs.Content>
      <div class="flex flex-wrap justify-between gap-2 px-4 pb-5 text-xs text-muted-foreground"><span class="flex items-center gap-1"><LockKeyhole class="size-3" />Shared privately with you</span><OpenRoomCredit /></div>
     </div>
    </section>
   </div>
  </div>
 </Tabs.Root>
 <p class="mt-3 text-xs text-muted-foreground">For real documents and access rules, use “Preview as investor” on a sharing link.</p>
</section>

<style>
 .phone-frame {
  box-sizing: content-box;
  margin-inline: auto;
  padding: 0 7px;
  border: 1px solid #424746;
  border-radius: 36px;
  background: #242827;
  box-shadow: inset 0 0 0 2px #4c504f;
 }

 .phone-frame::before,
 .phone-frame::after {
  display: block;
  content: '';
  margin-inline: auto;
  border-radius: 999px;
 }

 .phone-frame::before {
  width: 42px;
  height: 4px;
  margin-block: 8px;
  background: #111413;
 }

 .phone-frame::after {
  width: 80px;
  height: 4px;
  margin-block: 6px;
  background: #89908d;
 }

 .hide-scrollbar {
  scrollbar-width: none;
 }

 .hide-scrollbar::-webkit-scrollbar {
  display: none;
 }

 .phone-screen {
  height: 640px;
  overflow: auto;
  border-radius: 23px;
  background: var(--background);
 }
</style>
