import MarkdownIt from 'markdown-it';
import { configureMarkdown } from './markdown.ts';

export function welcomeMarkdown(editor = false) {
	const md = configureMarkdown(new MarkdownIt({ html: false, linkify: true, typographer: !editor }));
	md.inline.ruler.before('html_inline', 'welcome_color', (state, silent) => {
		if (state.src[state.pos] !== '<') return false;
		const tag = /^<span style="color:(#[a-f0-9]{6})">|^<\/span>/i.exec(
			state.src.slice(state.pos, state.posMax),
		);
		if (!tag) return false;
		if (!silent) {
			const token = state.push(tag[1] ? 'welcome_color_open' : 'welcome_color_close', 'span', 0);
			token.content = tag[0];
			if (tag[1]) token.attrSet('style', `color:${tag[1]}`);
		}
		state.pos += tag[0].length;
		return true;
	});
	md.core.ruler.after('inline', 'pair_welcome_colors', (state) => {
		for (const block of state.tokens) {
			if (!block.children) continue;
			const openings: typeof block.children = [];
			for (const token of block.children) {
				if (token.type === 'welcome_color_open') openings.push(token);
				else if (token.type === 'welcome_color_close') {
					const opening = openings.pop();
					if (opening) {
						opening.nesting = 1;
						token.nesting = -1;
					} else token.type = 'text';
				}
			}
			for (const opening of openings) opening.type = 'text';
		}
	});
	return md;
}

const renderer = welcomeMarkdown();

export function renderWelcome(text: string) {
	return renderer.render(text);
}
