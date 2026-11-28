<script lang="ts">
	import { LoaderCircle, Maximize, Minimize, Pause, Play, Volume2, VolumeX } from '@lucide/svelte';
	import Watermark from './Watermark.svelte';

	let { src, watermark = null }: { src: string; watermark?: string | null } = $props();

	let stage = $state<HTMLDivElement>();
	let video = $state<HTMLVideoElement>();
	let paused = $state(true);
	let time = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let muted = $state(false);
	let staged = $state(false);
	let filled = $state(false);
	let buffering = $state(false);
	let failed = $state(false);
	const large = $derived(staged || filled);

	const clock = (s: number) => {
		if (!Number.isFinite(s)) return '0:00';
		const m = Math.floor(s / 60);
		const r = Math.floor(s % 60);
		return `${m}:${String(r).padStart(2, '0')}`;
	};

	$effect(() => {
		if (video && video.getAttribute('src') !== src) {
			failed = false;
			video.src = src;
		}
	});

	function toggle() {
		if (!video || failed) return;
		if (video.paused) void video.play().catch(() => {});
		else video.pause();
	}

	function retry() {
		if (!video) return;
		failed = false;
		buffering = true;
		const at = time;
		video.load();
		video.addEventListener('loadedmetadata', () => { if (video) video.currentTime = at; }, { once: true });
	}

	function seek(event: Event) {
		if (video) video.currentTime = Number((event.currentTarget as HTMLInputElement).value);
	}

	function setVolume(event: Event) {
		if (!video) return;
		video.volume = Number((event.currentTarget as HTMLInputElement).value);
		video.muted = video.volume === 0;
	}

	function fullscreen() {
		if (filled) filled = false;
		else if (document.fullscreenElement) void document.exitFullscreen();
		else if (document.fullscreenEnabled && stage?.requestFullscreen) void stage.requestFullscreen().catch(() => (filled = true));
		else filled = true;
		stage?.focus({ preventScroll: true });
	}

	let engaged = false;

	function pointed(event: PointerEvent) {
		engaged = !!stage?.contains(event.target as Node);
	}

	function keys(event: KeyboardEvent) {
		if (!video || !stage) return;
		const inside = stage.contains(event.target as Node);
		if (!inside && !(engaged && (event.target === document.body || event.target === document.documentElement))) return;
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		const target = event.target as HTMLElement;
		if (target.closest('input') || (target.closest('button') && [' ', 'Enter'].includes(event.key))) return;
		if (event.key === ' ' || event.key === 'k') toggle();
		else if (event.key === 'ArrowRight') video.currentTime = Math.min(duration, video.currentTime + 5);
		else if (event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
		else if (event.key === 'm') video.muted = !video.muted;
		else if (event.key === 'f') fullscreen();
		else if (event.key === 'Escape' && filled) filled = false;
		else return;
		event.preventDefault();
	}

	function guard(node: HTMLVideoElement) {
		const v = node as HTMLVideoElement & {
			webkitPresentationMode?: string;
			webkitSetPresentationMode?: (mode: string) => void;
			webkitExitFullscreen?: () => void;
		};
		const inline = () => {
			if (v.webkitPresentationMode && v.webkitPresentationMode !== 'inline') v.webkitSetPresentationMode?.('inline');
			if (document.pictureInPictureElement === v) void document.exitPictureInPicture();
			if (document.fullscreenElement === v) void document.exitFullscreen();
		};
		const change = () => {
			staged = !!stage && document.fullscreenElement === stage;
			inline();
		};
		const begin = () => v.webkitExitFullscreen?.();
		const block = (e: Event) => e.preventDefault();
		const wait = () => (buffering = true);
		const ready = () => (buffering = false);
		const broken = () => {
			if (!v.error) return;
			failed = true;
			buffering = false;
		};
		v.addEventListener('webkitpresentationmodechanged', inline);
		v.addEventListener('enterpictureinpicture', inline);
		v.addEventListener('webkitbeginfullscreen', begin);
		v.addEventListener('contextmenu', block);
		v.addEventListener('waiting', wait);
		v.addEventListener('seeking', wait);
		v.addEventListener('canplay', ready);
		v.addEventListener('playing', ready);
		v.addEventListener('seeked', ready);
		v.addEventListener('error', broken);
		document.addEventListener('fullscreenchange', change);
		return () => {
			v.removeEventListener('webkitpresentationmodechanged', inline);
			v.removeEventListener('enterpictureinpicture', inline);
			v.removeEventListener('webkitbeginfullscreen', begin);
			v.removeEventListener('contextmenu', block);
			v.removeEventListener('waiting', wait);
			v.removeEventListener('seeking', wait);
			v.removeEventListener('canplay', ready);
			v.removeEventListener('playing', ready);
			v.removeEventListener('seeked', ready);
			v.removeEventListener('error', broken);
			document.removeEventListener('fullscreenchange', change);
		};
	}
</script>

<svelte:window onkeydown={keys} onpointerdowncapture={pointed} />

<div
	bind:this={stage}
	class="relative flex flex-col overflow-hidden bg-black {staged ? 'h-full' : ''} {filled ? 'video-filled fixed inset-0 z-50 h-dvh w-screen' : 'rounded-md'}"
>
	<div class="relative flex min-h-0 flex-1 items-center">
		<video
			bind:this={video}
			playsinline
			disablepictureinpicture
			disableremoteplayback
			preload="metadata"
			class="mx-auto w-full {large ? 'max-h-full' : 'max-h-[75vh]'}"
			bind:paused
			bind:currentTime={time}
			bind:duration
			bind:volume
			bind:muted
			onclick={toggle}
			{@attach guard}
		><track kind="captions" /></video>
		{#if watermark}<Watermark text={watermark} />{/if}
		{#if failed}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-4 text-center text-sm text-white" role="alert">
				<p>This video could not be played. Check your connection and try again.</p>
				<button type="button" class="control border border-white/30" onclick={retry}>Try again</button>
			</div>
		{:else if buffering}
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center" role="status" aria-label="Loading video">
				<LoaderCircle class="size-10 animate-spin text-white/80" aria-hidden="true" />
			</div>
		{/if}
	</div>
	<div class="flex flex-wrap items-center gap-1 bg-black/80 px-2 py-1 text-xs text-white sm:gap-2 sm:px-3" role="toolbar" aria-label="Playback">
		<button type="button" class="control" onclick={toggle} disabled={failed} aria-label={paused ? 'Play' : 'Pause'}>{#if paused}<Play />{:else}<Pause />{/if}<span class="hidden sm:inline">{paused ? 'Play' : 'Pause'}</span></button>
		<span class="tabular-nums">{clock(time)}</span>
		<input
			type="range"
			class="order-last h-11 w-full min-w-0 basis-full accent-white sm:order-none sm:h-8 sm:w-auto sm:flex-1 sm:basis-auto"
			min="0"
			max={duration || 0}
			step="0.1"
			value={time}
			oninput={seek}
			aria-label="Position"
		/>
		<span class="tabular-nums">{clock(duration)}</span>
		<button type="button" class="control ml-auto sm:ml-0" onclick={() => (muted = !muted)} aria-label={muted ? 'Unmute' : 'Mute'}>{#if muted}<VolumeX />{:else}<Volume2 />{/if}<span class="hidden sm:inline">{muted ? 'Unmute' : 'Mute'}</span></button>
		<input
			type="range"
			class="hidden h-8 w-20 accent-white sm:block"
			min="0"
			max="1"
			step="0.05"
			value={muted ? 0 : volume}
			oninput={setVolume}
			aria-label="Volume"
		/>
		<button type="button" class="control" onclick={fullscreen} aria-label={large ? 'Exit full screen' : 'Full screen'}>{#if large}<Minimize />{:else}<Maximize />{/if}<span class="hidden sm:inline">{large ? 'Exit full screen' : 'Full screen'}</span></button>
	</div>
</div>

<style>
	:global(html:has(.video-filled)) { overflow: hidden; }
	.control { display: inline-flex; min-height: 44px; min-width: 44px; align-items: center; justify-content: center; gap: .375rem; border-radius: .375rem; padding-inline: .5rem; }
	.control:hover { background: rgb(255 255 255 / .12); }
	.control:disabled { opacity: .4; }
	.control :global(svg) { width: 1rem; height: 1rem; }
	@media (width >= 40rem) { .control { min-height: 32px; min-width: 32px; } }
</style>
