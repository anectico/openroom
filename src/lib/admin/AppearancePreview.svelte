<script lang="ts">
 import type { Brand } from "#lib/brand.ts";
 import { Button } from "#lib/components/ui/button/index.js";
 import * as Tabs from "#lib/components/ui/tabs/index.js";
 import type { AppearanceDraft } from "./appearance-draft.ts";

 let { brand, name, welcome, roomId }: { brand: Brand; name: string; welcome: string; roomId?: string } = $props();
 let screen = $state('documents');
 let frame = $state<HTMLIFrameElement>();
 let device = $state('fit');
 let availableWidth = $state(0);
 let deviceHeight = $state(0);
 let actualSize = $state(false);
 const renderWidth = $derived(device === 'phone' ? 360 : device === 'desktop' ? 1280 : Math.max(0, availableWidth - 2));
 const phone = $derived(device === 'phone');
 const frameWidth = $derived(renderWidth + (phone ? 16 : 2));
 const fitScale = $derived(device === 'fit' || !availableWidth ? 1 : Math.min(1, availableWidth / frameWidth));
 const scale = $derived(actualSize ? 1 : fitScale);
 const frameUrl = $derived(roomId ? `/admin/appearance-preview?room=${encodeURIComponent(roomId)}` : '/admin/appearance-preview');
 const draft: AppearanceDraft = $derived({brand, name, welcome, screen, phone});
 function sendDraft() {
  frame?.contentWindow?.postMessage({type: 'appearance-draft', draft: $state.snapshot(draft)}, location.origin);
 }
 $effect(sendDraft);
 function receive(event: MessageEvent) {
  if (event.source === frame?.contentWindow && event.origin === location.origin && event.data?.type === 'appearance-ready') sendDraft();
 }
</script>
<svelte:window onmessage={receive} />
<section class="min-w-0 rounded-xl sm:border sm:bg-muted/25 sm:p-5" aria-label="Appearance preview">
 <div class="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 class="text-sm font-semibold">Live preview</h3><p class="mt-1 text-xs text-muted-foreground">{roomId ? 'Room content' : 'Sample room'} · changes appear as you edit</p></div><Tabs.Root value={device} onValueChange={(value) => { device = value; actualSize = false; }}><Tabs.List aria-label="Preview size" class="h-auto"><Tabs.Trigger class="min-h-11 sm:min-h-8" value="fit">Fit to panel</Tabs.Trigger><Tabs.Trigger class="min-h-11 sm:min-h-8" value="desktop">Desktop</Tabs.Trigger><Tabs.Trigger class="min-h-11 sm:min-h-8" value="phone">Phone</Tabs.Trigger></Tabs.List></Tabs.Root></div>
 <Tabs.Root bind:value={screen}>
  <Tabs.List aria-label="Preview screen" class="mb-3 h-auto"><Tabs.Trigger class="min-h-11 sm:min-h-8" value="documents">Inside the room</Tabs.Trigger><Tabs.Trigger class="min-h-11 sm:min-h-8" value="entry">Entry screen</Tabs.Trigger></Tabs.List>
  <div class="mb-3 flex flex-wrap items-center gap-2"><p class="text-xs text-muted-foreground" role="status">{Math.round(renderWidth)} px wide · {Math.round(scale * 100)}% scale</p>{#if fitScale < 1}<Button type="button" size="sm" variant="outline" class="min-h-11" onclick={() => (actualSize = !actualSize)}>{actualSize ? 'Scale to fit' : 'Actual size'}</Button>{/if}</div>
  <Tabs.Content value={screen} class="m-0">
  <div bind:clientWidth={availableWidth} class="min-w-0 overflow-x-auto" class:hide-scrollbar={phone}>
   <div class="relative mx-auto overflow-clip" style:width={`${frameWidth * scale}px`} style:height={`${deviceHeight * scale}px`}>
    <div bind:offsetHeight={deviceHeight} class={phone ? 'phone-frame' : 'box-content overflow-hidden rounded-xl border bg-background shadow-sm'}
     style:width={`${renderWidth}px`} style:transform={`scale(${scale})`} style:transform-origin="top left">
     <iframe bind:this={frame} src={frameUrl} title="Live investor preview"
      class="block w-full border-0" class:phone-screen={phone} style:height={phone ? '640px' : '680px'}></iframe>
    </div>
   </div>
  </div>
  </Tabs.Content>
 </Tabs.Root>
 <p class="mt-3 text-xs text-muted-foreground">Files and account actions are read-only here. Use “Preview as investor” on a sharing link to check its welcome, document access and downloads.</p>
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
  overflow: hidden;
  border-radius: 23px;
  background: var(--background);
 }
</style>
