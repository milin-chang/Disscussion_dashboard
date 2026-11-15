import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const snapshot = JSON.parse(await readFile('data/discussions.json', 'utf8'));
if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.items)) throw new Error('Invalid discussion snapshot.');
await mkdir('dist/data', { recursive: true });
// Content hashes refresh browser caches for both entry assets and module imports.
const versionedName = (name, content) => {
  const dot = name.lastIndexOf('.');
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
  return `${name.slice(0, dot)}.${hash}${name.slice(dot)}`;
};
const lib = await readFile('lib.mjs', 'utf8');
const libName = versionedName('lib.mjs', lib);
const app = (await readFile('app.js', 'utf8')).replaceAll("'./lib.mjs'", `'./${libName}'`);
const appName = versionedName('app.js', app);
const css = await readFile('styles.css', 'utf8');
const cssName = versionedName('styles.css', css);
const html = (await readFile('index.html', 'utf8'))
  .replace('./styles.css', `./${cssName}`)
  .replace('./app.js', `./${appName}`);
// Only these site assets are emitted; credentials and source files stay outside dist.
await writeFile(`dist/${libName}`, lib);
await writeFile(`dist/${appName}`, app);
await writeFile(`dist/${cssName}`, css);
await writeFile('dist/index.html', html);
await cp('favicon.svg', 'dist/favicon.svg');
await cp('data/discussions.json', 'dist/data/discussions.json');
console.log('Static site built in dist/.');
