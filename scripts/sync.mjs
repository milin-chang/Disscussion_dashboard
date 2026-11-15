import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { collectDiscussions } from './github.mjs';

const snapshot = await collectDiscussions({
  token: process.env.GH_TOKEN || process.env.DISCUSSIONS_TOKEN,
  account: process.env.DISCUSSION_ACCOUNT || 'milin-chang',
  includePrivate: process.env.INCLUDE_PRIVATE !== 'false'
});
await mkdir('data', { recursive: true });
const temp = `data/.discussions-${process.pid}.tmp`;
try {
  await writeFile(temp, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(temp, 'data/discussions.json');
} finally { await rm(temp, { force: true }); }
console.log(`Synced ${snapshot.items.length} discussions. Truncated: ${snapshot.coverage.truncated}.`);
