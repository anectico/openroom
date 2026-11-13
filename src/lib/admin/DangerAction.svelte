<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as AlertDialog from '#lib/components/ui/alert-dialog/index.js';
	import { Button, type ButtonSize } from '#lib/components/ui/button/index.js';
	import { invalidateAll } from '$app/navigation';
	import { OpFailure, op } from './op.ts';

	let {
		operation,
		input,
		label,
		confirmLabel = label,
		title,
		description = null,
		success,
		size = 'sm',
		showButton = true,
		onDone,
	}: {
		operation: string;
		input: Record<string, unknown>;
		label: string;
		confirmLabel?: string;
		title: string;
		description?: string | null;
		success: string;
		size?: ButtonSize;
		showButton?: boolean;
		onDone?: () => void | Promise<void>;
	} = $props();

	let open = $state(false);
	let text = $state('');
	let busy = $state(false);
	let confirmable = $state(false);

	export async function start() {
		if (busy) return;
		if (description) {
			text = description;
			confirmable = false;
			open = true;
			return;
		}
		busy = true;
		try {
			await op(operation, input);
			toast.success(success);
			if (onDone) await onDone();
			else await invalidateAll();
		} catch (e) {
			if (e instanceof OpFailure && e.code === 'confirmation_required') {
				text = String(e.detail.wouldChange ?? e.message);
				confirmable = true;
				open = true;
			} else toast.error(e instanceof Error ? e.message : 'Something went wrong.');
		} finally {
			busy = false;
		}
	}

	async function confirm() {
		if (busy) return;
		busy = true;
		try {
			await op(operation, confirmable ? { ...input, confirm: true } : input);
			toast.success(success);
			open = false;
			if (onDone) await onDone();
			else await invalidateAll();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Something went wrong.');
		} finally {
			busy = false;
		}
	}
</script>

{#if showButton}<Button variant="destructive" {size} disabled={busy} onclick={start}>{label}</Button>{/if}

<AlertDialog.Root bind:open={() => open, (value) => { if (!busy) open = value; }}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{title}</AlertDialog.Title>
			<AlertDialog.Description>{text}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={busy}>Cancel</AlertDialog.Cancel>
			<Button variant="destructive" disabled={busy} onclick={confirm}>{confirmLabel}</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
