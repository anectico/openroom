export class ReadTracker {
	#url: string;
	#fileId: string;
	#page = 0;
	#since = 0;
	#visible = document.visibilityState === 'visible';
	#pending = new Map<number, number>();
	#video: HTMLVideoElement | null = null;
	#timer: ReturnType<typeof setInterval> | null = null;
	#onVisibility = () => {
		this.#account();
		this.#visible = document.visibilityState === 'visible';
		if (!this.#visible) this.flush();
	};
	#onHide = () => {
		this.flush();
		this.#visible = false;
	};
	#onShow = () => {
		this.#visible = document.visibilityState === 'visible';
		this.#since = Date.now();
	};

	constructor(linkId: string, fileId: string) {
		this.#url = `/v/${linkId}/beacon`;
		this.#fileId = fileId;
		document.addEventListener('visibilitychange', this.#onVisibility);
		window.addEventListener('pagehide', this.#onHide);
		window.addEventListener('pageshow', this.#onShow);
		this.#timer = setInterval(() => document.visibilityState === 'visible' && this.flush(), 30_000);
	}

	#account() {
		if (this.#page && this.#since && this.#visible) {
			const ms = Date.now() - this.#since;
			this.#pending.set(this.#page, (this.#pending.get(this.#page) ?? 0) + ms);
		}
		this.#since = Date.now();
	}

	setPage(page: number) {
		if (page === this.#page) return;
		this.#account();
		this.#page = page;
	}

	watch(video: HTMLVideoElement) {
		this.#video = video;
	}

	flush() {
		this.#account();
		const body: Record<string, unknown> = { fileId: this.#fileId };
		if (this.#pending.size) body.pages = Object.fromEntries(this.#pending);
		if (this.#video) {
			const ranges: [number, number][] = [];
			for (let i = 0; i < this.#video.played.length; i++)
				ranges.push([this.#video.played.start(i) * 1000, this.#video.played.end(i) * 1000]);
			if (ranges.length)
				body.video = {
					ranges,
					durationMs: Number.isFinite(this.#video.duration)
						? Math.round(this.#video.duration * 1000)
						: undefined,
				};
		}
		if (!body.pages && !body.video) return;
		this.#pending.clear();
		const text = JSON.stringify(body);
		fetch(this.#url, {
			method: 'POST',
			body: text,
			headers: { 'content-type': 'application/json' },
			keepalive: true,
			credentials: 'same-origin',
		}).catch(() => navigator.sendBeacon(this.#url, new Blob([text], { type: 'application/json' })));
	}

	stop() {
		this.flush();
		document.removeEventListener('visibilitychange', this.#onVisibility);
		window.removeEventListener('pagehide', this.#onHide);
		window.removeEventListener('pageshow', this.#onShow);
		if (this.#timer) clearInterval(this.#timer);
	}
}
