<script lang="ts">
	import { formatDate, relative } from './op.ts';

	let { at, timeZone = 'UTC' }: { at: number | null; timeZone?: string } = $props();
</script>

{#if at === null}<span>never</span>{:else}<time datetime={new Date(at).toISOString()} title={formatDate(at, timeZone)}
		>{relative(at, timeZone)}</time
	>{/if}
