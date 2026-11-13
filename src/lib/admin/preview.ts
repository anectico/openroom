import { toast } from 'svelte-sonner';
import { op } from './op.ts';

export async function openPreview(linkId: string) {
	const tab = window.open('', '_blank');
	if (tab) tab.opener = null;
	try {
		const result = await op<{ url: string }>('preview_link', { linkId });
		if (tab) tab.location.href = result.url;
		else location.href = result.url;
	} catch (error) {
		tab?.close();
		toast.error(error instanceof Error ? error.message : 'Could not open the preview.');
	}
}
