<script lang="ts">
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
	let canFullscreen = $state(false);

	const clock = (s: number) => {
		if (!Number.isFinite(s)) return '0:00';
		const m = Math.floor(s / 60);
		const r = Math.floor(s % 60);
		return `${m}:${String(r).padStart(2, '0')}`;
	};

	function toggle() {
		if (!video) return;
		if (video.paused) void video.play();
		else video.pause();
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
		if (document.fullscreenElement) void document.exitFullscreen();
		else void stage?.requestFullscreen?.().catch(() => {});
	}

	function keys(event: KeyboardEvent) {
		if (!video) return;
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		const target = event.target as HTMLElement;
		if (target.closest('input') || (target.closest('button') && [' ', 'Enter'].includes(event.key))) return;
		if (event.key === ' ' || event.key === 'k') toggle();
		else if (event.key === 'ArrowRight') video.currentTime = Math.min(duration, video.currentTime + 5);
		else if (event.key === 'ArrowLeft') video.currentTime = Math.max(0, video.currentTime - 5);
		else if (event.key === 'm') video.muted = !video.muted;
		else if (event.key === 'f' && canFullscreen) fullscreen();
		else return;
		event.preventDefault();
	}

	function guard(node: HTMLVideoElement) {
		canFullscreen = !!document.fullscreenEnabled;
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
		v.addEventListener('webkitpresentationmodechanged', inline);
		v.addEventListener('enterpictureinpicture', inline);
		v.addEventListener('webkitbeginfullscreen', begin);
		v.addEventListener('contextmenu', block);
		document.addEventListener('fullscreenchange', change);
		return () => {
			v.removeEventListener('webkitpresentationmodechanged', inline);
			v.removeEventListener('enterpictureinpicture', inline);
			v.removeEventListener('webkitbeginfullscreen', begin);
			v.removeEventListener('contextmenu', block);
			document.removeEventListener('fullscreenchange', change);
		};
	}
</script>

<div
	bind:this={stage}
	class="relative flex flex-col overflow-hidden rounded-md bg-black {staged ? 'h-full' : ''}"
>
	<div class="relative flex min-h-0 flex-1 items-center">
		<video
			bind:this={video}
			{src}
			playsinline
			disablepictureinpicture
			disableremoteplayback
			preload="metadata"
			class="mx-auto w-full {staged ? 'max-h-full' : 'max-h-[75vh]'}"
			bind:paused
			bind:currentTime={time}
			bind:duration
			bind:volume
			bind:muted
			onclick={toggle}
			{@attach guard}
		>
			<track kind="captions" />
		</video>
		{#if watermark}<Watermark text={watermark} />{/if}
	</div>
	<div class="flex flex-wrap items-center gap-2 bg-black/80 px-3 py-2 text-xs text-white" onkeydown={keys} role="toolbar" tabindex="-1" aria-label="Playback">
		<button type="button" class="w-14 rounded px-2 py-1 hover:bg-white/10" onclick={toggle}>{paused ? 'Play' : 'Pause'}</button>
		<span class="tabular-nums">{clock(time)}</span>
		<input
			type="range"
			class="order-last h-11 w-full min-w-0 basis-full accent-white sm:order-none sm:h-auto sm:w-auto sm:flex-1 sm:basis-auto"
			min="0"
			max={duration || 0}
			step="0.1"
			value={time}
			oninput={seek}
			aria-label="Position"
		/>
		<span class="tabular-nums">{clock(duration)}</span>
		<button type="button" class="rounded px-2 py-1 hover:bg-white/10" onclick={() => (muted = !muted)}>{muted ? 'Unmute' : 'Mute'}</button>
		<input
			type="range"
			class="hidden w-20 accent-white sm:block"
			min="0"
			max="1"
			step="0.05"
			value={muted ? 0 : volume}
			oninput={setVolume}
			aria-label="Volume"
		/>
		{#if canFullscreen}
			<button type="button" class="rounded px-2 py-1 hover:bg-white/10" onclick={fullscreen}>{staged ? 'Exit full screen' : 'Full screen'}</button>
		{/if}
	</div>
</div>
