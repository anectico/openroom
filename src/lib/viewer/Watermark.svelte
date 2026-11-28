<script lang="ts">
	let { text }: { text: string } = $props();
	const rows = Array.from({ length: 8 }, (_, i) => i);
</script>

<div class="watermark pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden="true">
	<div class="absolute -inset-1/2 flex rotate-[-28deg] flex-col justify-around">
		{#each rows as row (row)}
			<p class="diagonal text-center font-medium whitespace-nowrap text-black/20 [text-shadow:0_0_3px_rgb(255_255_255/0.7)] even:translate-x-[8cqw]">
				{text} &nbsp;·&nbsp; {text} &nbsp;·&nbsp; {text}
			</p>
		{/each}
	</div>
	<p class="footer absolute inset-x-[1.5cqw] bottom-[1cqw] rounded-sm bg-white/75 px-1 text-center leading-snug break-words text-black/75">{text}</p>
</div>

<style>
	.watermark { container-type: size; }
	.diagonal { font-size: max(10px, 1.3cqw); }
	.footer { font-size: max(11px, 1.15cqw); }
</style>
