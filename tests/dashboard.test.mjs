import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDiscussions } from '../scripts/github.mjs';
import { filterItems, isUnread, githubDiscussionUrl, recentRepositories, snapshotFreshness, compareSnapshots } from '../lib.mjs';

function node(id, options = {}) {
  return { id, number: 1, title: '<img src=x onerror=alert(1)>', url: 'https://github.com/milin-chang/private/discussions/1',
    author: { login: 'milin-chang' }, repository: { nameWithOwner: 'milin-chang/private', isPrivate: true },
    category: { name: 'General', emoji: '💬' }, labels: { nodes: [] }, comments: { totalCount: 3 },
    body: 'A private post body must never be published', upvoteCount: 2, isAnswered: false, closed: false,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-15T00:00:00Z', ...options };
}
const ok = (nodes, next = false, cursor = null, total = nodes.length) => ({ ok: true, json: async () => ({ data: { search: { nodes, discussionCount: total, pageInfo: { hasNextPage: next, endCursor: cursor } } } }) });

test('sync follows cursors, deduplicates records and publishes only the agreed metadata', async () => {
  const requests = [];
  const pages = [ok([node('one')], true, 'page-2', 2), ok([node('one'), node('two')], false, null, 2)];
  const snapshot = await collectDiscussions({ token: 'test-token', fetcher: async (_, init) => { requests.push(JSON.parse(init.body)); return pages.shift(); } });
  assert.equal(snapshot.items.length, 2);
  assert.equal(requests[0].variables.cursor, null);
  assert.equal(requests[1].variables.cursor, 'page-2');
  assert.match(requests[0].variables.query, /involves:milin-chang/);
  assert.equal(snapshot.coverage.truncated, false);
  assert.equal(snapshot.items[0].isPrivate, true);
  assert.doesNotMatch(JSON.stringify(snapshot), /private post body|test-token/);
  assert.equal(snapshot.items[0].body, undefined);
});
test('public-only mode excludes private data even if the server returns it', async () => {
  let query;
  const result = await collectDiscussions({ token: 'test', includePrivate: false, fetcher: async (_, init) => { query = JSON.parse(init.body).variables.query; return ok([node('private'), node('public', { repository: { nameWithOwner: 'milin-chang/public', isPrivate: false } })]); } });
  assert.match(query, /is:public/);
  assert.deepEqual(result.items.map(item => item.id), ['public']);
});
test('a partial GraphQL error aborts synchronization rather than publishing partial data', async () => {
  await assert.rejects(() => collectDiscussions({ token: 'test', fetcher: async () => ({ ok: true, json: async () => ({ errors: [{ message: 'private information' }], data: { search: { nodes: [] } } }) }) }), /could not complete/);
});
test('authentication and HTTP failures are explicit and do not leak API response bodies', async () => {
  await assert.rejects(() => collectDiscussions({ token: '' }), /Missing DISCUSSIONS_TOKEN/);
  await assert.rejects(() => collectDiscussions({ token: 'secret', fetcher: async () => ({ ok: false, status: 401 }) }), /HTTP 401/);
});
test('stalled pagination fails instead of silently omitting discussions', async () => {
  await assert.rejects(() => collectDiscussions({ token: 'test', fetcher: async () => ok([node('one')], true, 'repeated', 300) }), /pagination/);
});
test('the GitHub search cap is reported rather than claiming all results were loaded', async () => {
  let page = 0;
  const snapshot = await collectDiscussions({ token: 'test', fetcher: async () => ok([node(`id-${page}`)], true, `cursor-${page++}`, 1500) });
  assert.equal(snapshot.coverage.truncated, true);
  assert.equal(page, 10);
});
test('a discussion becomes unread again when a newer update arrives', () => {
  const item = { id: 'one', updatedAt: '2026-11-15T01:00:00Z' };
  assert.equal(isUnread(item, {}), true);
  assert.equal(isUnread(item, { one: item.updatedAt }), false);
  assert.equal(isUnread(item, { one: '2026-11-15T00:00:00Z' }), true);
});
test('filters combine author, repo, search, unread and saved state without changing original order', () => {
  const base = { author: 'milin-chang', category: 'General', labels: ['RL'], repository: 'milin-chang/a', isAnswered: false, comments: 1, createdAt: '2026-11-01T00:00:00Z' };
  const items = [{ ...base, id: 'a', title: '訓練紀錄', updatedAt: '2026-11-14T00:00:00Z' }, { ...base, id: 'b', title: '討論', author: 'someone', updatedAt: '2026-11-15T00:00:00Z' }];
  assert.deepEqual(filterItems(items, { query: 'rl', repo: base.repository, unread: true }).map(item => item.id), ['a']);
  assert.deepEqual(filterItems(items, { tab: 'saved', saved: ['b'] }).map(item => item.id), ['b']);
  assert.deepEqual(filterItems(items, { tab: 'all' }).map(item => item.id), ['b', 'a']);
  assert.deepEqual(items.map(item => item.id), ['a', 'b']);
});
test('external discussion links reject scripts and lookalike hosts', () => {
  for (const value of ['javascript:alert(1)', 'https://github.com.evil.test/a/b/discussions/1', 'https://evil.test/a/b/discussions/1', 'http://github.com/a/b/discussions/1']) assert.equal(githubDiscussionUrl(value), null);
  assert.equal(githubDiscussionUrl('https://github.com/a/b/discussions/1'), 'https://github.com/a/b/discussions/1');
});
test('recent repositories are five distinct repos ordered by their most recent discussion', () => {
  const row = (repository, day) => ({ repository, updatedAt: `2026-11-${String(day).padStart(2, '0')}T00:00:00Z` });
  const items = [row('c', 10), row('b', 9), row('a', 15), row('a', 14), row('b', 13), row('d', 8), row('e', 7), row('f', 6)];
  const original = [...items];
  const repos = recentRepositories(items);
  assert.deepEqual(repos.map(repo => repo.repository), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(repos[0].updatedAt, '2026-11-15T00:00:00Z');
  assert.equal(repos[0].count, 2);
  assert.equal(repos[1].count, 2);
  assert.deepEqual(items, original);
});
test('recent repository selection stops at forty discussions before deduplicating repos', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ repository: 'same', updatedAt: new Date(Date.UTC(2026, 10, 15, 0, i)).toISOString() }));
  items.push({ repository: 'outside-window', updatedAt: '2026-11-14T23:00:00Z' });
  assert.deepEqual(recentRepositories(items), [{ repository: 'same', updatedAt: '2026-11-15T00:39:00.000Z', count: 40 }]);
  assert.deepEqual(recentRepositories([]), []);
});
test('source snapshots show stale after ninety minutes regardless of discussion activity dates', () => {
  const now = Date.parse('2026-11-17T04:00:00Z');
  assert.equal(snapshotFreshness('2026-11-17T03:50:00Z', now), 'fresh');
  assert.equal(snapshotFreshness('2026-11-17T02:30:00Z', now), 'fresh');
  assert.equal(snapshotFreshness('2026-11-17T02:29:59Z', now), 'stale');
  assert.equal(snapshotFreshness(null, now), 'missing');
  assert.equal(snapshotFreshness('invalid', now), 'missing');
});
test('checking the same published snapshot is distinct from a new sync without discussion changes', () => {
  const previous = { generatedAt: '2026-11-17T01:00:00Z', items: [{ id: 'a', comments: 1 }] };
  assert.deepEqual(compareSnapshots(previous, structuredClone(previous)), { kind: 'same', added: 0, updated: 0, removed: 0 });
  assert.deepEqual(compareSnapshots(previous, { ...previous, generatedAt: '2026-11-17T02:00:00Z' }), { kind: 'synced', added: 0, updated: 0, removed: 0 });
});
test('refresh counts new discussions and metadata changes even if a discussion timestamp is unchanged', () => {
  const previous = { generatedAt: '2026-11-17T01:00:00Z', items: [{ id: 'a', comments: 1, updatedAt: 'same' }, { id: 'b' }] };
  const next = { generatedAt: '2026-11-17T02:00:00Z', items: [{ id: 'a', comments: 2, updatedAt: 'same' }, { id: 'c' }] };
  assert.deepEqual(compareSnapshots(previous, next), { kind: 'changed', added: 1, updated: 1, removed: 1 });
});
test('an older or uninitialized published snapshot cannot replace newer data', () => {
  const previous = { generatedAt: '2026-11-17T02:00:00Z', items: [{ id: 'new' }] };
  for (const generatedAt of ['2026-11-17T01:00:00Z', null]) {
    assert.deepEqual(compareSnapshots(previous, { generatedAt, items: [] }), { kind: 'older', added: 0, updated: 0, removed: 0 });
  }
});
