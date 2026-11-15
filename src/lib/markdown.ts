import MarkdownIt from 'markdown-it';

const allowed = /^(https:|mailto:)/i;

export function configureMarkdown(md: InstanceType<typeof MarkdownIt>) {
	md.validateLink = (url) => allowed.test(url.trim());

	const defaultLinkOpen =
		md.renderer.rules.link_open ??
		((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

	md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
		tokens[idx].attrSet('rel', 'noopener noreferrer nofollow');
		tokens[idx].attrSet('target', '_blank');
		return defaultLinkOpen(tokens, idx, options, env, self);
	};
	return md;
}

const md = configureMarkdown(new MarkdownIt({ html: false, linkify: true, typographer: true }));

export function renderMarkdown(text: string) {
	return md.render(text);
}
