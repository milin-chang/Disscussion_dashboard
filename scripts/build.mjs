import { cp, mkdir, readFile } from 'node:fs/promises';
const snapshot = JSON.parse(await readFile('data/discussions.json', 'utf8'));
if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.items)) throw new Error('Invalid discussion snapshot.');
await mkdir('dist/data', { recursive: true });
// An explicit allowlist keeps tokens, source, tests and local files out of Pages.
for (const file of ['index.html', 'styles.css', 'app.js', 'lib.mjs', 'favicon.svg']) await cp(file, `dist/${file}`);
await cp('data/discussions.json', 'dist/data/discussions.json');
console.log('Static site built in dist/.');
