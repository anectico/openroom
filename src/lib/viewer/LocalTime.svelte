<script lang="ts">
 let { at, date = false }: { at: number; date?: boolean } = $props();
 let local = $state('');
 $effect(() => { local = date ? new Date(at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); });
</script>
<time datetime={new Date(at).toISOString()} title={new Date(at).toISOString()}>{local || (date ? new Date(at).toISOString().slice(0, 10) : `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`)}</time>
