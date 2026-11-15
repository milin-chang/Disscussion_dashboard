import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, readFile, appendFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

test('deployed asset URLs change when styles or imported modules change', async () => {
  const source = fileURLToPath(new URL('../', import.meta.url));
  const workdir = await mkdtemp(join(tmpdir(), 'discussion-assets-'));
  await mkdir(join(workdir, 'data'));
  for (const file of ['index.html', 'styles.css', 'app.js', 'lib.mjs', 'favicon.svg']) await copyFile(join(source, file), join(workdir, file));
  await writeFile(join(workdir, 'data/discussions.json'), JSON.stringify({ schemaVersion: 1, items: [] }));
  const build = () => execFileSync(process.execPath, [join(source, 'scripts/build.mjs')], { cwd: workdir, stdio: 'pipe' });
  const assets = async () => {
    const html = await readFile(join(workdir, 'dist/index.html'), 'utf8');
    const cssName = html.match(/href="\.\/(styles\.[a-f0-9]+\.css)"/)[1];
    const appName = html.match(/src="\.\/(app\.[a-f0-9]+\.js)"/)[1];
    const app = await readFile(join(workdir, 'dist', appName), 'utf8');
    const libName = app.match(/from '\.\/(lib\.[a-f0-9]+\.mjs)'/)[1];
    await readFile(join(workdir, 'dist', cssName));
    await readFile(join(workdir, 'dist', libName));
    return { cssName, appName, libName };
  };
  build();
  const first = await assets();
  await appendFile(join(workdir, 'styles.css'), '\n/* stylesheet changed */\n');
  await appendFile(join(workdir, 'lib.mjs'), '\nexport const cacheRegression = true;\n');
  build();
  const second = await assets();
  assert.notEqual(first.cssName, second.cssName);
  assert.notEqual(first.libName, second.libName);
  assert.notEqual(first.appName, second.appName);
});
