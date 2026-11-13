<script lang="ts">
	let { text }: { text: string } = $props();
	const rows = Array.from({ length: 6 }, (_, i) => i);
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden="true">
	<div class="absolute -inset-1/2 flex rotate-[-28deg] flex-col justify-around">
		{#each rows as row (row)}
			<p class="text-center text-[10px] font-medium whitespace-nowrap text-black/20 [text-shadow:0_0_3px_rgb(255_255_255/0.7)] even:translate-x-16 sm:text-xs">
				{text} &nbsp;·&nbsp; {text}
			</p>
		{/each}
	</div>
	<p class="absolute inset-x-2 bottom-1.5 rounded-sm bg-white/60 px-1 text-center text-[8px] leading-snug break-words text-black/55">{text}</p>
</div>
