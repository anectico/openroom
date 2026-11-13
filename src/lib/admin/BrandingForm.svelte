<script lang="ts">
	import { tick, untrack } from 'svelte';
 import { MediaQuery } from 'svelte/reactivity';
	import { type Branding, defaultAccent, normalizeColor } from '#lib/brand.ts';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Field from '#lib/components/ui/field/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
 import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { invalidateAll } from '$app/navigation';
	import AppearancePreview from './AppearancePreview.svelte';
	import { op } from './op.ts';

 const wide = new MediaQuery('(min-width: 1280px)');
	let { roomId, branding, room, disabled = false }: { roomId?: string; branding: Branding; room?: { name: string; welcomeMarkdown: string }; disabled?: boolean } = $props();
	let base = $state(untrack(() => branding));
	let savedName = $state(untrack(() => room?.name ?? 'Your data room'));
	let savedWelcome = $state(untrack(() => room?.welcomeMarkdown ?? ''));
	let name = $state(untrack(() => savedName));
	let welcome = $state(untrack(() => savedWelcome));
	let hex = $state(untrack(() => branding.accentColor ?? defaultAccent));
	let inherited = $state(untrack(() => roomId ? !branding.roomOverrides?.accentColor : !branding.accentColor));
	let whiteLabel = $state(untrack(() => branding.whiteLabel));
	let imageBase64 = $state<string | null | undefined>(undefined);
	let previewImage = $state<string | null>(null);
	let input = $state<HTMLInputElement>();
	let busy = $state(false);
 let pane = $state('edit');
 let form = $state<HTMLFormElement>();
 let footer = $state<HTMLDivElement>();
 let footerHeight = $state(96);
 async function revealFocus(event: FocusEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || footer?.contains(target)) return;
  await tick();
  requestAnimationFrame(() => {
   if (document.activeElement !== target || !footer) return;
   const rect = target.getBoundingClientRect(), bottom = Math.min(innerHeight, footer.getBoundingClientRect().top) - 12;
   if (rect.bottom > bottom) window.scrollBy({ top: rect.bottom - bottom, behavior: 'instant' });
   else if (rect.top < 12) window.scrollBy({ top: rect.top - 12, behavior: 'instant' });
  });
 }
 async function focusColour() {
  pane = 'edit';
  await tick();
  form?.querySelector<HTMLInputElement>('#appearance-color')?.focus();
 }
	let reading = $state(false);
	let error = $state('');
	let status = $state('');
	let selection = 0;
	const color = $derived(inherited ? (roomId ? base.workspace.accentColor : null) : normalizeColor(hex));
	const logo = $derived(imageBase64 === undefined ? base.logoUrl : imageBase64 === null ? (roomId ? base.workspace.logoUrl : null) : previewImage);
	const dirty = $derived(imageBase64 !== undefined || name !== savedName || welcome !== savedWelcome || whiteLabel !== base.whiteLabel || inherited !== (roomId ? !base.roomOverrides?.accentColor : !base.accentColor) || (!inherited && normalizeColor(hex) !== base.accentColor));

	function cancel() {
		selection++;
		reading = false;
		name = savedName;
		welcome = savedWelcome;
		hex = base.accentColor ?? defaultAccent;
		inherited = roomId ? !base.roomOverrides?.accentColor : !base.accentColor;
		whiteLabel = base.whiteLabel;
		imageBase64 = undefined;
		previewImage = null;
		if (input) input.value = '';
		error = '';
		status = '';
	}

	async function pick(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		const current = ++selection;
		reading = false;
		error = '';
		status = '';
		if (file.size > 700 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
			error = 'Choose a PNG, JPEG or WebP smaller than 700 KB.';
			return;
		}
		reading = true;
		try {
			const bitmap = await createImageBitmap(file);
			bitmap.close();
			const bytes = new Uint8Array(await file.arrayBuffer());
			let binary = '';
			for (const b of bytes) binary += String.fromCharCode(b);
			if (current !== selection) return;
			imageBase64 = btoa(binary);
			previewImage = `data:${file.type};base64,${imageBase64}`;
		} catch {
			if (current === selection) error = 'That image could not be read. Choose another file.';
		} finally {
			if (current === selection) reading = false;
		}
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy || reading || disabled) return;
 if (form && !form.checkValidity()) { pane = 'edit'; await tick(); form.reportValidity(); return; }
		error = '';
		status = '';
		if (!inherited && !normalizeColor(hex)) {
			pane = 'edit';
 error = 'Enter a colour like #286344.';
 await focusColour();
			return;
		}
		busy = true;
		try {
			const saved = await op<Branding>('update_branding', {
				...(roomId ? { roomId, name, welcomeMarkdown: welcome } : { whiteLabel }),
				accentColor: inherited ? null : color,
				...(imageBase64 !== undefined ? { imageBase64 } : {}),
			});
			if (!saved?.workspace) throw new Error('Your session may have ended. Sign in again before saving.');
			base = saved;
			savedName = name.trim();
			savedWelcome = welcome;
			cancel();
			status = 'Appearance saved. Investors will see these changes.';
			try { await invalidateAll(); } catch { status = 'Appearance saved. Reload to refresh the rest of this page.'; }
		} catch (e) {
			error = e instanceof Error ? e.message : 'Appearance could not be saved. Your draft is still here.';
		} finally {
			busy = false;
		}
	}
</script>

<form bind:this={form} onfocusin={revealFocus} style:--appearance-footer={`${footerHeight + 16}px`} novalidate onsubmit={save} class="flex min-w-0 flex-col gap-6">
	<Tabs.Root bind:value={pane}><Tabs.List aria-label="Appearance editor" class="h-auto xl:hidden"><Tabs.Trigger value="edit" class="min-h-11">Edit</Tabs.Trigger><Tabs.Trigger value="preview" class="min-h-11">Preview</Tabs.Trigger></Tabs.List>
 <div class="grid min-w-0 gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
  <Tabs.Content value="edit">{#snippet child({ props })}<div {...props} hidden={!wide.current && pane !== 'edit'} class="min-w-0" role="tabpanel" aria-label={wide.current ? 'Appearance settings' : undefined} aria-labelledby={wide.current ? undefined : String(props['aria-labelledby'] ?? '')}>
		<fieldset disabled={disabled || busy} class="min-w-0 [&_input]:scroll-mb-[var(--appearance-footer)] [&_textarea]:scroll-mb-[var(--appearance-footer)] [&_button]:scroll-mb-[var(--appearance-footer)]"><legend class="sr-only">Appearance settings</legend>
			<Field.Group>
				{#if roomId}
					<Field.Field><Field.Label for="appearance-name">Room name</Field.Label><Input id="appearance-name" class="min-h-11 sm:min-h-9" required maxlength={120} bind:value={name} /><Field.Description>The title investors see on entry and inside the room.</Field.Description></Field.Field>
					<Field.Field><Field.Label for="appearance-welcome">Welcome & introduction</Field.Label><Textarea id="appearance-welcome" rows={6} style="field-sizing: fixed" maxlength={20000} bind:value={welcome} placeholder="Welcome. Start with our company overview, then explore the financials." /><Field.Description>Shown at email entry and inside the room. Use Markdown for **bold**, lists and links. Investors see an excerpt and can open the full welcome.</Field.Description></Field.Field>
				{/if}
				<Field.Field><Field.Label for="appearance-logo">Logo & browser icon</Field.Label><div class="flex flex-wrap items-center gap-3"><div class="flex h-16 w-36 items-center justify-center rounded-lg border bg-muted/30">{#if logo}<img src={logo} alt="Current logo preview" class="max-h-12 max-w-32 object-contain" />{:else}<span class="text-xs text-muted-foreground">No logo</span>{/if}</div><Button class="min-h-11 sm:min-h-9" type="button" variant="outline" onclick={() => input?.click()} disabled={reading}>{reading ? 'Reading image…' : 'Choose logo'}</Button></div><input id="appearance-logo" bind:this={input} type="file" accept="image/png,image/jpeg,image/webp" class="hidden" onchange={pick} /><Field.Description>{roomId ? (imageBase64 === null || (imageBase64 === undefined && !base.roomOverrides?.logo) ? 'Using workspace logo.' : 'Custom logo for this room.') : 'Your default logo for all rooms.'} PNG, JPEG or WebP, up to 700 KB. A browser icon is generated automatically.</Field.Description><div><Button class="min-h-11 sm:min-h-9" type="button" variant="ghost" size="sm" onclick={() => { selection++; reading = false; imageBase64 = null; previewImage = null; if (input) input.value = ''; }}>{roomId ? 'Use workspace logo' : 'Remove logo'}</Button></div></Field.Field>
				<Field.Field data-invalid={!inherited && !normalizeColor(hex)}><Field.Label for="appearance-color">Brand colour</Field.Label><div class="flex flex-wrap items-center gap-3"><input type="color" aria-label="Pick brand colour" class="h-11 w-14 cursor-pointer rounded-md border p-1" value={color ?? defaultAccent} oninput={(e) => { hex = e.currentTarget.value; inherited = false; }} /><Input id="appearance-color" aria-describedby={!inherited && !normalizeColor(hex) ? 'appearance-color-error' : undefined} class="min-h-11 w-32 font-mono sm:min-h-9" maxlength={7} value={inherited ? color ?? defaultAccent : hex} aria-invalid={!inherited && !normalizeColor(hex)} oninput={(e) => { hex = e.currentTarget.value; inherited = false; }} /></div>{#if !inherited && !normalizeColor(hex)}<p id="appearance-color-error" class="text-sm text-destructive">Enter a colour like #286344.</p>{/if}<Field.Description>{inherited ? roomId ? 'Using workspace colour.' : 'Using the default colour.' : roomId ? 'Custom colour for this room.' : 'Custom workspace colour.'} Button text and links adjust automatically for readability.</Field.Description><div><Button class="min-h-11 sm:min-h-9" type="button" variant="ghost" size="sm" onclick={() => { inherited = true; hex = (roomId ? base.workspace.accentColor : null) ?? defaultAccent; }}>{roomId ? 'Use workspace colour' : 'Use default colour'}</Button></div></Field.Field>
				{#if !roomId}<Field.Field orientation="horizontal"><Switch id="appearance-credit" bind:checked={whiteLabel} /><Field.Content><Field.Label for="appearance-credit">Hide OpenRoom credit</Field.Label><Field.Description>Applies to all investor pages. Admin pages keep the OpenRoom name.</Field.Description></Field.Content></Field.Field>{:else}<p class="text-xs text-muted-foreground">The footer credit follows workspace settings.</p>{/if}
			</Field.Group>
		</fieldset>
 </div>{/snippet}</Tabs.Content><Tabs.Content value="preview">{#snippet child({ props })}<div {...props} hidden={!wide.current && pane !== 'preview'} class="min-w-0" role="tabpanel" aria-label={wide.current ? 'Live appearance preview' : undefined} aria-labelledby={wide.current ? undefined : String(props['aria-labelledby'] ?? '')}>
		<AppearancePreview brand={{ logoUrl: logo, accentColor: color, whiteLabel }} {name} {welcome} />
 </div>{/snippet}</Tabs.Content></div></Tabs.Root>
	<div bind:this={footer} bind:clientHeight={footerHeight} class="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-card py-3">{#if error}<p id="appearance-error" class="w-full text-sm text-destructive" role="alert">{#if !inherited && !normalizeColor(hex)}<button type="button" class="text-left underline underline-offset-4" onclick={focusColour}>{error}</button>{:else}{error}{/if}</p>{/if}<Button class="min-h-11 sm:min-h-9" type="submit" disabled={disabled || busy || reading || !dirty}>{busy ? 'Saving…' : 'Save appearance'}</Button><Button class="min-h-11 sm:min-h-9" type="button" variant="outline" disabled={busy || (!dirty && !error)} onclick={cancel} aria-label="Cancel changes"><span class="sm:hidden">Cancel</span><span class="hidden sm:inline">Cancel changes</span></Button><p class="w-full text-xs text-muted-foreground sm:w-auto" role="status">{dirty ? 'Unsaved changes' : status || 'Changes go live only when you save.'}</p></div>
</form>
