import { readFileSync, writeFileSync } from 'node:fs';
import { openApiDocument } from '../src/lib/server/http/openapi.ts';

const document = openApiDocument();
const json = `${JSON.stringify(document, null, 2)}\n`;
if (process.argv.includes('--check')) {
	if (readFileSync('cli/catalog.json', 'utf8') !== json)
		throw new Error('The CLI catalog is stale. Run npm run cli:generate.');
} else writeFileSync('cli/catalog.json', json);
