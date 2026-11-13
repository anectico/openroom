<script lang="ts">
 import { CircleAlert, CircleCheck, LockKeyhole } from '@lucide/svelte';
 import { Badge } from '#lib/components/ui/badge/index.js';

 let { status }: { status: 'Action needed' | 'Uploaded' | 'Closed' } = $props();
</script>
<Badge variant={status === 'Action needed' ? 'attention' : status === 'Uploaded' ? 'success' : 'secondary'}>{#if status === 'Action needed'}<CircleAlert data-icon="inline-start" />{:else if status === 'Uploaded'}<CircleCheck data-icon="inline-start" />{:else}<LockKeyhole data-icon="inline-start" />{/if}{status}</Badge>
