<script lang="ts">
	import { Bold, Check, CodeXml, Heading1, Heading2, Italic, Link2, List, ListOrdered, Palette } from '@lucide/svelte';
	import { setBlockType, toggleMark } from 'prosemirror-commands';
	import type { Command, EditorState } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import 'prosemirror-view/style/prosemirror.css';
	import { tick, untrack } from 'svelte';
	import { changeColor, changeList, schema, serializer, welcomeState } from './welcome-editor.ts';

	let { value = $bindable(''), id, label, limit, disabled = false }: {
		value: string; id: string; label: string; limit: number; disabled?: boolean;
	} = $props();
	let host = $state<HTMLDivElement>();
	let view = $state.raw<EditorView>();
	let current = $state.raw<EditorState>();
	let source = $state(false);
	let colorsOpen = $state(false);
	let linkOpen = $state(false);
	let address = $state('');
	let linkError = $state('');
	let linkInput = $state<HTMLInputElement>();
	async function showLink() {
		linkOpen = !linkOpen;
		colorsOpen = false;
		address = '';
		linkError = '';
		if (linkOpen) { await tick(); linkInput?.focus(); }
	}
	function insertLink() {
		const href = address.trim();
		try {
			const url = new URL(href);
			if (!['https:', 'mailto:'].includes(url.protocol) || (url.protocol === 'mailto:' && !url.pathname)) throw new Error();
		} catch {
			linkError = 'Enter an HTTPS address or a mailto: link.';
			return;
		}
		run((state, dispatch) => {
			const { from, to, empty } = state.selection;
			const mark = schema.marks.link.create({ href });
			const tr = state.tr;
			if (empty) tr.replaceSelectionWith(schema.text(href, [mark]), false);
			else tr.addMark(from, to, mark);
			dispatch?.(tr);
			return true;
		});
		linkOpen = false;
	}
	let notice = $state('');
	let loaded = '';
	const colors = [
		{ name: 'Default', value: null }, { name: 'Forest', value: '#17603f' },
		{ name: 'Ocean', value: '#155e75' }, { name: 'Indigo', value: '#4338a0' },
		{ name: 'Berry', value: '#963963' }, { name: 'Copper', value: '#97471c' },
	];

	function read(text: string) {
		try {
			return welcomeState(text);
		} catch {
			notice = 'This message uses extended Markdown. You can edit its source here.';
			source = true;
		}
	}

	$effect(() => {
		if (!host) return;
		const initial = untrack(() => value);
		const state = read(initial);
		if (!state) return;
		loaded = initial;
		const instance: EditorView = new EditorView(host, {
			state,
			editable: () => !disabled,
			attributes: { id, role: 'textbox', 'aria-label': label, 'aria-multiline': 'true', class: 'md welcome-copy max-h-72 min-h-36 overflow-y-auto px-3 py-2 text-sm leading-relaxed outline-none' },
			dispatchTransaction(tr) {
				const next = instance.state.apply(tr);
				instance.updateState(next);
				current = next;
				if (tr.docChanged) {
					loaded = serializer.serialize(next.doc);
					value = loaded;
				}
			},
		});
		view = instance;
		current = state;
		return () => { instance.destroy(); view = undefined; current = undefined; };
	});

	$effect(() => {
		if (!view || value === loaded) return;
		const state = read(value);
		if (state) {
			loaded = value;
			view.updateState(state);
			current = state;
		}
	});

	$effect(() => {
		const editable = !disabled;
		view?.setProps({ editable: () => editable });
	});

	const activeMarks = $derived(current?.storedMarks ?? current?.selection.$from.marks() ?? []);
	const activeColor = $derived(activeMarks.find((mark) => mark.type === schema.marks.color)?.attrs.value ?? null);
	function marked(name: string) {
		if (!current) return false;
		const { from, to, empty } = current.selection;
		return empty ? activeMarks.some((mark) => mark.type.name === name) : current.doc.rangeHasMark(from, to, schema.marks[name]);
	}
	function inBlock(name: string, level?: number) {
		if (!current) return false;
		const pos = current.selection.$from;
		for (let depth = pos.depth; depth > 0; depth--) {
			const node = pos.node(depth);
			if (node.type.name === name && (!level || node.attrs.level === level)) return true;
		}
		return false;
	}
	function run(command: Command) {
		if (!view || disabled) return;
		command(view.state, view.dispatch, view);
		view.focus();
	}
	function heading(level: number) {
		run(inBlock('heading', level) ? setBlockType(schema.nodes.paragraph) : setBlockType(schema.nodes.heading, { level }));
	}
	function toggleSource() {
		notice = '';
		colorsOpen = false;
		linkOpen = false;
		if (source && !read(value)) return;
		source = !source;
	}
</script>

<div class="min-w-0 rounded-lg border bg-card focus-within:border-ring">
	<fieldset class="flex min-w-0 flex-wrap items-center gap-1 rounded-t-lg border-b bg-muted/35 p-1.5" aria-label="Welcome formatting">
		{#if !source}
			{#each [
				{ label: 'Heading', icon: Heading1, active: inBlock('heading', 1), action: () => heading(1) },
				{ label: 'Subheading', icon: Heading2, active: inBlock('heading', 2), action: () => heading(2) },
				{ label: 'Bold', icon: Bold, active: marked('strong'), action: () => run(toggleMark(schema.marks.strong)) },
				{ label: 'Italic', icon: Italic, active: marked('em'), action: () => run(toggleMark(schema.marks.em)) },
				{ label: 'Bulleted list', icon: List, active: inBlock('bullet_list'), action: () => run(changeList('bullet_list')) },
				{ label: 'Numbered list', icon: ListOrdered, active: inBlock('ordered_list'), action: () => run(changeList('ordered_list')) },
			] as tool (tool.label)}
				<button type="button" class="tool" {disabled} title={tool.label} aria-label={tool.label} aria-pressed={tool.active} onmousedown={(e) => e.preventDefault()} onclick={tool.action}><tool.icon /></button>
			{/each}
			<button type="button" class="tool" {disabled} aria-expanded={linkOpen} title="Insert link" aria-label="Insert link" onmousedown={(e) => e.preventDefault()} onclick={showLink}><Link2 /></button>
			<button type="button" class="tool" {disabled} aria-expanded={colorsOpen} title="Text color" aria-label="Text color" onmousedown={(e) => e.preventDefault()} onclick={() => { colorsOpen = !colorsOpen; linkOpen = false; }}><Palette /></button>
		{/if}
		<button type="button" {disabled} class="tool ml-auto gap-1 px-2 text-xs" aria-pressed={source} onclick={toggleSource}><CodeXml />Markdown</button>
	</fieldset>
	{#if linkOpen && !source}
		<div class="flex flex-wrap items-center gap-2 border-b p-2">
			<input bind:this={linkInput} bind:value={address} aria-label="Link address" placeholder="https://example.com" class="h-9 min-w-0 flex-1 rounded-md border px-2 text-sm" onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); insertLink(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); linkOpen = false; view?.focus(); } }} />
			<button type="button" class="tool px-2 text-sm font-medium" onclick={insertLink}>Apply link</button>
			{#if linkError}<p role="alert" class="w-full text-xs text-destructive">{linkError}</p>{/if}
		</div>
	{/if}
	{#if colorsOpen && !source}
		<fieldset aria-label="Text color" class="flex flex-wrap items-center gap-1 border-b px-2 py-1">
			{#each colors as color (color.name)}
				<button type="button" {disabled} aria-label={color.name} title={color.name} aria-pressed={activeColor === color.value} class="tool" onmousedown={(e) => e.preventDefault()} onclick={() => { run(changeColor(color.value)); colorsOpen = false; }}>
					<span class="inline-grid size-5 place-items-center rounded-full" style:background={color.value ?? 'var(--foreground)'}>{#if color.value === activeColor}<Check class="size-3 text-white" />{/if}</span>
				</button>
			{/each}
		</fieldset>
	{/if}
	{#if source}
		<textarea {id} aria-label={label} {disabled} maxlength={limit} rows="7" class="block w-full rounded-b-lg bg-transparent p-3 font-mono text-sm" bind:value></textarea>
	{:else}
		<div bind:this={host}></div>
	{/if}
</div>
{#if value.length > limit}<p class="text-sm text-destructive" role="alert">Shorten the message by {value.length - limit} {value.length - limit === 1 ? 'character' : 'characters'} to save it. Formatting counts toward the limit.</p>{:else if notice}<p class="text-xs text-muted-foreground" role="status">{notice}</p>{/if}

<style>
	.tool { display: inline-flex; min-width: 2rem; min-height: 2rem; align-items: center; justify-content: center; border-radius: .375rem; }
	.tool :global(svg) { width: 1rem; height: 1rem; }
	.tool:hover, .tool[aria-expanded="true"] { background: var(--muted); }
	.tool[aria-pressed="true"] { color: var(--primary); background: var(--accent); }
	.tool:focus-visible { outline: 2px solid var(--ring); }
</style>
