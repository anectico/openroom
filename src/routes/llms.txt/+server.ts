import index from '../../../llms.txt?raw';

export function GET() {
	return new Response(index, {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
	});
}
