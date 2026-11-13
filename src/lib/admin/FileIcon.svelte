<script lang="ts">
	import { File, FileImage, FileText, Film, Folder } from '@lucide/svelte';

	let { kind = null, folder = false, small = false }: { kind?: string | null; folder?: boolean; small?: boolean } = $props();
	const icons = { pdf: FileText, image: FileImage, video: Film, download: File };
	const Icon = $derived(folder ? Folder : (icons[kind as keyof typeof icons] ?? File));
</script>

<span class="flex shrink-0 items-center justify-center rounded-lg {small ? 'size-8' : 'size-10'} {folder ? 'bg-primary/8 text-primary' : 'bg-muted text-muted-foreground'}">
	<Icon class={small ? 'size-4' : 'size-5'} strokeWidth={1.6} />
</span>
