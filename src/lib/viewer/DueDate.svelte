<script lang="ts">
 let { at, plain = false }: { at: number; plain?: boolean } = $props();
 let label = $state('');
 let exact = $state('');
 $effect(() => {
  const date = new Date(at), now = new Date();
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(date) - day(now)) / 86400000);
  exact = date.toLocaleDateString(undefined, { dateStyle: 'long' });
  label = plain ? exact : days < 0 ? `${-days} day${days === -1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : days <= 7 ? `Due in ${days} days` : `Due ${exact}`;
 });
</script>
<time datetime={new Date(at).toISOString()} title={exact}>{label || `${plain ? '' : 'Due '}${new Date(at).toISOString().slice(0, 10)}`}</time>
