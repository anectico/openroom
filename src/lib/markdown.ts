import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
const allowed = /^(https:|mailto:)/i;

md.validateLink = (url) => allowed.test(url.trim());

const defaultLinkOpen =
	md.renderer.rules.link_open ??
	((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
	tokens[idx].attrSet('rel', 'noopener noreferrer nofollow');
	tokens[idx].attrSet('target', '_blank');
	return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderedExcerpt(html: string) {
	return md.utils.unescapeAll(
		html
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim(),
	);
}

export function renderMarkdown(text: string) {
	return md.render(text);
}
