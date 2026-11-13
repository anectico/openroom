<script lang="ts">


 let { at }: { at: number } = $props();
 let local = $state('');
 $effect(() => { local = new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); });
</script>
<time datetime={new Date(at).toISOString()} title={new Date(at).toISOString()}>{local || `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`}</time>
