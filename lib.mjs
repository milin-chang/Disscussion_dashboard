export const ACCOUNT = 'milin-chang';
export const REPOSITORY = 'milin-chang/Disscussion_dashboard';
export function snapshotFreshness(generatedAt, now = Date.now()) {
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) return 'missing';
  return now - timestamp > 90 * 60000 ? 'stale' : 'fresh';
}
export function recentRepositories(items, discussionLimit = 40, repoLimit = 5) {
  const recent = items.filter(item => item.repository && Number.isFinite(Date.parse(item.updatedAt)))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, discussionLimit);
  const repos = new Map();
  for (const item of recent) {
    const repo = repos.get(item.repository);
    if (repo) repo.count++;
    else repos.set(item.repository, { repository: item.repository, updatedAt: item.updatedAt, count: 1 });
  }
  return [...repos.values()].slice(0, repoLimit);
}
export function isUnread(item, read = {}) {
  return !read[item.id] || Date.parse(item.updatedAt) > Date.parse(read[item.id]);
}
export function filterItems(items, { tab = 'created', query = '', repo = '', category = '', unanswered = false, unread = false, sort = 'updated', read = {}, saved = [] } = {}) {
  const term = query.trim().toLocaleLowerCase();
  return items.filter(item => {
    if (tab === 'created' && item.author?.toLowerCase() !== ACCOUNT) return false;
    if (tab === 'saved' && !saved.includes(item.id)) return false;
    if (repo && item.repository !== repo) return false;
    if (category && item.category !== category) return false;
    if (unanswered && item.isAnswered) return false;
    if (unread && !isUnread(item, read)) return false;
    return !term || [item.title, item.repository, item.category, ...(item.labels || [])].join(' ').toLocaleLowerCase().includes(term);
  }).sort((a, b) => sort === 'comments'
    ? b.comments - a.comments || Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    : Date.parse(sort === 'created' ? b.createdAt : b.updatedAt) - Date.parse(sort === 'created' ? a.createdAt : a.updatedAt));
}
export function relativeTime(value, now = Date.now()) {
  const ms = now - Date.parse(value);
  if (!Number.isFinite(ms)) return '尚未同步';
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`;
  if (minutes < 43200) return `${Math.floor(minutes / 1440)} 天前`;
  return new Date(value).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
}
export function githubDiscussionUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://github.com' && /^\/[\w.-]+\/[\w.-]+\/discussions\/\d+\/?$/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}
