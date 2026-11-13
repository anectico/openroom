import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'svelte/compiler';
import ts from 'typescript';

const excluded = [
	/^migrations\//,
	/^\.svelte-kit\//,
	/^build\//,
	/^cli\/src\/generated\//,
	/\/meta\/.*\.json$/,
];

type Finding = { file: string; line: number; text: string };

function lineOf(source: string, offset: number) {
	return source.slice(0, offset).split('\n').length;
}

function scriptComments(code: string, kind: ts.ScriptKind): { pos: number; end: number }[] {
	const file = ts.createSourceFile('x', code, ts.ScriptTarget.Latest, true, kind);
	const found = new Map<number, number>();
	const collect = (ranges: ts.CommentRange[] | undefined) => {
		for (const r of ranges ?? []) {
			if (r.pos === 0 && code.startsWith('#!')) continue;
			found.set(r.pos, r.end);
		}
	};
	const visit = (node: ts.Node) => {
		collect(ts.getLeadingCommentRanges(code, node.pos));
		collect(ts.getTrailingCommentRanges(code, node.end));
		node.getChildren(file).forEach(visit);
	};
	visit(file);
	return [...found].map(([pos, end]) => ({ pos, end }));
}

function cssComments(code: string): { pos: number; end: number }[] {
	const out: { pos: number; end: number }[] = [];
	let quote = '';
	for (let i = 0; i < code.length; i++) {
		const c = code[i];
		if (quote) {
			if (c === '\\') i++;
			else if (c === quote) quote = '';
		} else if (c === '"' || c === "'") quote = c;
		else if (c === '/' && code[i + 1] === '*') {
			const end = code.indexOf('*/', i + 2);
			out.push({ pos: i, end: end < 0 ? code.length : end + 2 });
			i = end < 0 ? code.length : end + 1;
		}
	}
	return out;
}

function hashComments(code: string): { pos: number; end: number }[] {
	const out: { pos: number; end: number }[] = [];
	let offset = 0;
	for (const line of code.split('\n')) {
		let quote = '';
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (quote) {
				if (c === '\\' && quote === '"') i++;
				else if (c === quote) quote = '';
			} else if (c === '"' || c === "'") quote = c;
			else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
				if (!(offset === 0 && line.startsWith('#!')))
					out.push({ pos: offset + i, end: offset + line.length });
				break;
			}
		}
		offset += line.length + 1;
	}
	return out;
}

function sqlComments(code: string): { pos: number; end: number }[] {
	const out = cssComments(code);
	let offset = 0;
	for (const line of code.split('\n')) {
		const i = line.indexOf('--');
		if (i >= 0 && (line.slice(0, i).split("'").length - 1) % 2 === 0)
			out.push({ pos: offset + i, end: offset + line.length });
		offset += line.length + 1;
	}
	return out;
}

function svelteComments(code: string): { pos: number; end: number }[] {
	const ast = parse(code, { modern: true });
	const out: { pos: number; end: number }[] = [];
	for (const script of [ast.instance, ast.module]) {
		if (!script) continue;
		const start = code.indexOf('>', script.start) + 1;
		const end = code.lastIndexOf('</script', script.end);
		for (const c of scriptComments(code.slice(start, end), ts.ScriptKind.TS)) {
			out.push({ pos: start + c.pos, end: start + c.end });
		}
	}
	if (ast.css) {
		const start = ast.css.content.start;
		for (const c of cssComments(ast.css.content.styles)) out.push({ pos: start + c.pos, end: start + c.end });
	}
	const walk = (node: unknown) => {
		if (!node || typeof node !== 'object') return;
		const n = node as { type?: string; start?: number; end?: number };
		if (n.type === 'Comment' && n.start !== undefined && n.end !== undefined)
			out.push({ pos: n.start, end: n.end });
		for (const value of Object.values(node)) {
			if (Array.isArray(value)) value.forEach(walk);
			else if (value && typeof value === 'object') walk(value);
		}
	};
	walk(ast.fragment);
	return out;
}

function commentsFor(file: string, code: string) {
	const name = file.split('/').pop() ?? file;
	if (/\.(ts|mts|cts)$/.test(file)) return scriptComments(code, ts.ScriptKind.TS);
	if (/\.(js|mjs|cjs)$/.test(file)) return scriptComments(code, ts.ScriptKind.JS);
	if (file.endsWith('.svelte')) return svelteComments(code);
	if (file.endsWith('.css')) return cssComments(code);
	if (file.endsWith('.html'))
		return [...code.matchAll(/<!--[\s\S]*?-->/g)].map((m) => ({ pos: m.index, end: m.index + m[0].length }));
	if (file.endsWith('.sql')) return sqlComments(code);
	if (
		/\.(sh|ya?ml|toml)$/.test(file) ||
		['Dockerfile', 'Caddyfile', 'openroom-server', '.dockerignore', '.npmrc', '.env.example'].includes(name)
	) {
		return hashComments(code);
	}
	return [];
}

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
	encoding: 'utf8',
})
	.split('\n')
	.filter((f) => f && !excluded.some((r) => r.test(f)));

const findings: Finding[] = [];
for (const file of files) {
	let code: string;
	try {
		code = readFileSync(file, 'utf8');
	} catch {
		continue;
	}
	for (const c of commentsFor(file, code)) {
		findings.push({
			file,
			line: lineOf(code, c.pos),
			text: code.slice(c.pos, c.end).split('\n')[0].slice(0, 80),
		});
	}
}

for (const f of findings) console.error(`${f.file}:${f.line}: ${f.text}`);
if (findings.length) {
	console.error(`\n${findings.length} comment(s) found. Explanations belong in docs/, not in code.`);
	process.exit(1);
}
console.log(`No comments in ${files.length} files.`);
