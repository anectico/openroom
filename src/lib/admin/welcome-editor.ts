import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import {
	defaultMarkdownParser,
	defaultMarkdownSerializer,
	MarkdownParser,
	MarkdownSerializer,
	schema as markdownSchema,
} from 'prosemirror-markdown';
import { type MarkSpec, Schema } from 'prosemirror-model';
import { liftListItem, splitListItem, wrapInList } from 'prosemirror-schema-list';
import { type Command, EditorState } from 'prosemirror-state';
import { welcomeMarkdown } from '#lib/welcome-markdown.ts';

const tokenizer = welcomeMarkdown(true);
const color: MarkSpec = {
	attrs: { value: {} },
	parseDOM: [
		{
			tag: 'span[data-welcome-color]',
			getAttrs: (element) => {
				const value = element.dataset.welcomeColor ?? '';
				return /^#[0-9a-f]{6}$/i.test(value) ? { value } : false;
			},
		},
	],
	toDOM: (mark) => [
		'span',
		{ style: `color:${mark.attrs.value}`, 'data-welcome-color': mark.attrs.value },
		0,
	],
};

const marks = markdownSchema.spec.marks
	.update('link', {
		...markdownSchema.spec.marks.get('link'),
		parseDOM: [
			{
				tag: 'a[href]',
				getAttrs: (a) => {
					const href = a.getAttribute('href') ?? '';
					return tokenizer.validateLink(href) ? { href, title: a.title || null } : false;
				},
			},
		],
	})
	.addToStart('color', color);

const image = markdownSchema.nodes.image.spec;
const nodes = markdownSchema.spec.nodes.update('image', {
	...image,
	parseDOM: [
		{
			tag: 'img[src]',
			getAttrs: (img) => {
				const src = img.getAttribute('src') ?? '';
				return /^https:/i.test(src) ? { src, alt: img.getAttribute('alt'), title: img.title || null } : false;
			},
		},
	],
});

export const schema = new Schema({ nodes, marks });
const parser = new MarkdownParser(schema, tokenizer, {
	...defaultMarkdownParser.tokens,
	welcome_color: { mark: 'color', getAttrs: (token) => ({ value: token.attrGet('style')?.slice(6) }) },
});

export const serializer = new MarkdownSerializer(
	defaultMarkdownSerializer.nodes,
	{
		...defaultMarkdownSerializer.marks,
		color: {
			open: (_, mark) => `<span style="color:${mark.attrs.value}">`,
			close: '</span>',
			expelEnclosingWhitespace: true,
		},
	},
	{ escapeExtraCharacters: /[<&]/g },
);

export function welcomeState(value: string) {
	return EditorState.create({
		doc: parser.parse(value),
		plugins: [
			history(),
			keymap({
				'Mod-b': toggleMark(schema.marks.strong),
				'Mod-i': toggleMark(schema.marks.em),
				'Mod-z': undo,
				'Mod-Shift-z': redo,
				'Mod-y': redo,
				Enter: splitListItem(schema.nodes.list_item),
				'Shift-Enter': (state, dispatch) => {
					dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());
					return true;
				},
			}),
			keymap(baseKeymap),
		],
	});
}

export function changeList(type: 'bullet_list' | 'ordered_list'): Command {
	return (state, dispatch) => {
		const { $from } = state.selection;
		for (let depth = $from.depth; depth > 0; depth--) {
			const node = $from.node(depth);
			if (node.type === schema.nodes[type]) return liftListItem(schema.nodes.list_item)(state, dispatch);
			if (node.type === schema.nodes.bullet_list || node.type === schema.nodes.ordered_list) {
				dispatch?.(state.tr.setNodeMarkup($from.before(depth), schema.nodes[type]));
				return true;
			}
		}
		return wrapInList(schema.nodes[type])(state, dispatch);
	};
}

export function changeColor(value: string | null): Command {
	return (state, dispatch) => {
		const { from, to, empty } = state.selection;
		const mark = schema.marks.color;
		const tr = state.tr;
		if (empty) {
			if (value) tr.addStoredMark(mark.create({ value }));
			else tr.removeStoredMark(mark);
		} else {
			tr.removeMark(from, to, mark);
			if (value) tr.addMark(from, to, mark.create({ value }));
		}
		dispatch?.(tr);
		return true;
	};
}
