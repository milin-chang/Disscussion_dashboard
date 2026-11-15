export const SEARCH_QUERY = `query Discussions($query: String!, $cursor: String) {
  search(query: $query, type: DISCUSSION, first: 100, after: $cursor) {
    discussionCount
    pageInfo { hasNextPage endCursor }
    nodes { ... on Discussion {
      id number title url createdAt updatedAt isAnswered closed upvoteCount
      author { login }
      repository { nameWithOwner isPrivate }
      category { name emoji }
      comments { totalCount }
      labels(first: 20) { nodes { name } }
    } }
  }
}`;

export async function collectDiscussions({ token, account = 'milin-chang', includePrivate = true, fetcher = fetch }) {
  if (!token) throw new Error('Missing DISCUSSIONS_TOKEN. Add it in repository Settings → Secrets and variables → Actions.');
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(account)) throw new Error('Invalid GitHub account.');
  const query = `involves:${account} sort:updated-desc${includePrivate ? '' : ' is:public'}`;
  let cursor = null;
  let totalCount = 0;
  let truncated = false;
  const items = new Map();
  const cursors = new Set();
  for (let page = 0; page < 10; page++) {
    const response = await fetcher('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'Discussion-Dashboard' },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { query, cursor } }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}. Check token permissions or rate limits.`);
    const result = await response.json();
    // A partial response must never replace a previously successful snapshot.
    if (result.errors?.length || !result.data?.search) throw new Error('GitHub could not complete the discussion query. Check token permissions and try again.');
    const data = result.data.search;
    totalCount = data.discussionCount;
    for (const node of data.nodes) {
      if (!node?.id || !node.repository || (!includePrivate && node.repository.isPrivate)) continue;
      items.set(node.id, {
        id: node.id, number: node.number, title: node.title, url: node.url,
        repository: node.repository.nameWithOwner, isPrivate: node.repository.isPrivate,
        author: node.author?.login || 'ghost', category: node.category?.name || '',
        categoryEmoji: node.category?.emoji || '💬', labels: node.labels?.nodes.map(label => label.name) || [],
        comments: node.comments.totalCount, upvotes: node.upvoteCount,
        isAnswered: node.isAnswered, closed: node.closed,
        createdAt: node.createdAt, updatedAt: node.updatedAt
      });
    }
    if (!data.pageInfo.hasNextPage) break;
    if (!data.pageInfo.endCursor || cursors.has(data.pageInfo.endCursor)) throw new Error('GitHub pagination did not advance. Snapshot unchanged.');
    cursors.add(data.pageInfo.endCursor);
    cursor = data.pageInfo.endCursor;
    if (page === 9) truncated = true;
  }
  return {
    schemaVersion: 1, account, generatedAt: new Date().toISOString(),
    coverage: { query, totalCount, loadedCount: items.size, truncated: truncated || totalCount > items.size, visibility: includePrivate ? 'public-and-private' : 'public' },
    items: [...items.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  };
}
