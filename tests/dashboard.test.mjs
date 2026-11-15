import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDiscussions } from '../scripts/github.mjs';
import { filterItems, isUnread, githubDiscussionUrl } from '../lib.mjs';

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
