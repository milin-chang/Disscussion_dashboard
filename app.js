import { ACCOUNT, REPOSITORY, filterItems, isUnread, relativeTime, githubDiscussionUrl } from './lib.mjs';

const paths = {
  discussions: '<path d="M8 10h.01M12 10h.01M16 10h.01"/><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>',
  github: '<path d="M9 19c-4 1-4-2-6-2M15 22v-4c0-1-.3-2-.8-2.5 3-.3 5.6-1.3 5.6-6A5 5 0 0 0 18.5 6c.1-.4.6-2-.1-3.5 0 0-1-.4-3.6 1.3a13 13 0 0 0-6.6 0C5.7 2 4.6 2.5 4.6 2.5c-.7 2-.2 3-.1 3.5a5 5 0 0 0-1.3 3.5c0 5 3 5.8 5.6 6-.4.5-.8 1.3-.8 2.5v4"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4Z"/>',
  repo: '<path d="M5 4h14v17H7a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Z"/><path d="M4 17h15M9 8h5M9 11h3"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 2l1 4M4 12l1 4a8 8 0 0 0 13 2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  sort: '<path d="M7 4v16m-3-3 3 3 3-3M14 6h7M14 11h5M14 16h3"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  external: '<path d="M14 3h7v7M10 14 21 3M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2.8 2.8 0 0 0-4-4L5 15Z"/>',
  settings: '<path d="m9 3-1 3-2 1-3-1-2 4 3 2v2l-3 2 2 4 3-1 2 1 1 3h5l1-3 2-1 3 1 2-4-3-2v-2l3-2-2-4-3 1-2-1-1-3Z"/><circle cx="12" cy="13" r="3"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  upvote: '<path d="M12 21V4m-6 6 6-6 6 6"/>',
  answer: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.discussions}</svg>`;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function loadState() {
  try {
    const value = JSON.parse(localStorage.getItem('discussion-desk-v1') || '{}');
    return { read: value.read && typeof value.read === 'object' && !Array.isArray(value.read) ? value.read : {}, saved: Array.isArray(value.saved) ? value.saved.filter(id => typeof id === 'string') : [] };
  } catch { return { read: {}, saved: [] }; }
}
let state = { ...loadState(), tab: 'created', query: '', repo: '', category: '', unanswered: false, unread: false, sort: 'updated' };
let snapshot = { items: [], generatedAt: null, coverage: {} };
let realSnapshot = null, demo = false, loadError = false, loading = false, toastTimer;
const repoPalette = ['#79b8ff', '#d2a8ff', '#7ee787', '#ffa657', '#ff9bce', '#76e3ea', '#e8d677', '#b6a4ff', '#ffaaa5', '#a8d98a', '#8fc9ff', '#d4b0d9'];
const repoColors = new Map();
function updateRepoColors() {
  const used = new Set(repoColors.values());
  for (const repo of [...new Set(snapshot.items.map(item => item.repository))].sort()) {
    if (repoColors.has(repo)) continue;
    let hash = 2166136261;
    for (const char of repo) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    let index = hash % repoPalette.length;
    for (let offset = 0; offset < repoPalette.length && used.has(repoPalette[index]); offset++) index = (index + 1) % repoPalette.length;
    const color = used.size < repoPalette.length ? repoPalette[index] : `hsl(${hash % 360} 75% 77%)`;
    repoColors.set(repo, color); used.add(color);
  }
}
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
function notify(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3300); }
function persist() {
  if (demo) return;
  try { localStorage.setItem('discussion-desk-v1', JSON.stringify({ read: state.read, saved: state.saved })); }
  catch { notify('瀏覽器無法儲存狀態；關閉頁面後可能會重設。'); }
}
function openSetup() { $('#setup-dialog').showModal(); }
function clearFilters() {
  Object.assign(state, { query: '', repo: '', category: '', unanswered: false, unread: false });
  $('#search').value = ''; render();
}
function switchTab(tab) { state.tab = tab; render(); }
function rebuildOptions() {
  const repos = [...new Set(snapshot.items.map(item => item.repository))].sort();
  const categories = [...new Set(snapshot.items.map(item => item.category).filter(Boolean))].sort();
  $('#repository').innerHTML = '<option value="">所有儲存庫</option>' + repos.map(repo => `<option value="${esc(repo)}">${esc(repo.split('/').slice(1).join('/'))}</option>`).join('');
  $('#category').innerHTML = '<option value="">所有分類</option>' + categories.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join('');
  if (!repos.includes(state.repo)) state.repo = '';
  if (!categories.includes(state.category)) state.category = '';
  $('#repository').value = state.repo; $('#category').value = state.category;
  $('#repo-total').textContent = repos.length;
  $('#repo-nav').innerHTML = repos.length ? repos.map((repo, i) => `<button data-repo="${esc(repo)}" class="${state.repo === repo ? 'active' : ''}" title="${esc(repo)}"><span class="repo-bullet c${i % 4}"></span><span class="repo-name" style="--repo-color:${repoColors.get(repo)}">${esc(repo.split('/').slice(1).join('/'))}</span><span class="repo-number">${snapshot.items.filter(item => item.repository === repo).length}</span></button>`).join('') : '<p class="muted small">同步後會在這裡顯示儲存庫。</p>';
}
function renderRow(item, recency) {
  const unread = isUnread(item, state.read), saved = state.saved.includes(item.id), link = githubDiscussionUrl(item.url);
  const labels = (item.labels || []).slice(0, 3).map(label => `<span class="tag">${esc(label)}</span>`).join('');
  const title = link ? `<a data-open="${esc(item.id)}" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a>` : `<button class="demo-title" data-demo-open="${esc(item.id)}">${esc(item.title)}</button>`;
  const tint = (0.02 + recency * 0.24).toFixed(3);
  const tail = (0.005 + recency * 0.07).toFixed(3);
  const edge = (0.08 + recency * 0.72).toFixed(3);
  return `<article class="discussion-row ${unread ? '' : 'is-read'}" data-id="${esc(item.id)}" style="--recent-tint:${tint};--recent-tail:${tail};--recent-edge:${edge}"><div class="discussion-icon ${item.isAnswered ? 'answered' : ''}">${icon(item.isAnswered ? 'answer' : 'discussions')}</div><div class="row-main"><div class="row-meta"><span class="repo-text" style="--repo-color:${repoColors.get(item.repository)}" title="${esc(item.repository)}">${esc(item.repository.replace('/', ' / '))}</span>${item.isPrivate ? `<span class="private-lock" title="私人儲存庫" aria-label="私人儲存庫">${icon('lock')}</span>` : ''}<time datetime="${esc(item.updatedAt)}" title="${esc(new Date(item.updatedAt).toLocaleString('zh-TW'))}">${relativeTime(item.updatedAt)}</time></div><h2>${title}${unread ? '<span class="new-dot" aria-label="未讀"></span>' : ''}</h2><div class="row-bottom">${item.category ? `<span class="tag category">${esc(item.category)}</span>` : ''}${labels}${item.isAnswered ? '<span class="tag answered-tag">已解答</span>' : ''}${item.closed ? '<span class="tag">已關閉</span>' : ''}<div class="row-stats"><span aria-label="${item.upvotes} 個讚">${icon('upvote')}${item.upvotes}</span><span aria-label="${item.comments} 則回覆">${icon('discussions')}${item.comments}</span></div></div></div><button class="save-button" data-save="${esc(item.id)}" aria-pressed="${saved}" aria-label="${saved ? '取消收藏' : '收藏'}：${esc(item.title)}" title="${saved ? '取消收藏' : '收藏討論'}">${icon('bookmark')}</button></article>`;
}
function emptyMarkup() {
  if (loadError && !snapshot.generatedAt && !demo) return `<div class="empty-state error-state"><div class="empty-icon">${icon('info')}</div><h2>暫時無法讀取討論</h2><p>資料讀取失敗，請檢查網路連線後再試一次。</p><button class="button primary" data-retry>重新讀取</button></div>`;
  if (!snapshot.generatedAt && !demo) return `<div class="empty-state"><div class="empty-icon">${icon('discussions')}</div><h2>把最近的討論，帶回這裡。</h2><p>連接 milin-chang 的 GitHub Discussions，跨專案的想法與回覆，就有了一個共同的入口。</p><div class="empty-actions"><button class="button primary" data-setup>設定自動同步 ${icon('arrow')}</button><button class="button secondary" data-demo>預覽版型</button></div><p class="hint">設定一次，之後交給 GitHub Actions。</p></div>`;
  if (!snapshot.items.length) return `<div class="empty-state"><div class="empty-icon">${icon('discussions')}</div><h2>目前沒有相關討論</h2><p>這次同步沒有找到可存取的 Discussions。請確認 Token 能讀取目標儲存庫。</p><button class="button secondary" data-setup>檢查同步設定</button></div>`;
  const savedEmpty = state.tab === 'saved' && !state.saved.length;
  return `<div class="empty-state"><div class="empty-icon">${icon(savedEmpty ? 'bookmark' : 'search')}</div><h2>${savedEmpty ? '把想持續關注的，先收藏。' : '沒有符合條件的討論'}</h2><p>${savedEmpty ? '點選討論旁的書籤，下次就能從這裡快速找回來。' : '試試其他關鍵字，或清除篩選看看。'}</p>${savedEmpty ? '<button class="button secondary" data-show-all>瀏覽相關討論</button>' : '<button class="button secondary" data-clear>清除篩選</button>'}</div>`;
}
function renderNotice() {
  const n = $('#notice');
  if (demo) n.innerHTML = `${icon('info')}<p><strong>版型預覽</strong> · 以下為參考圖片延伸的範例資料，並非帳號的即時同步結果。</p><button data-exit-demo>離開預覽</button>`;
  else if (loadError) n.innerHTML = `${icon('info')}<p>最新資料讀取失敗，目前保留上次顯示的內容。</p><button data-retry>重試</button>`;
  else if (snapshot.coverage?.truncated) n.innerHTML = `${icon('info')}<p>顯示最近 ${snapshot.items.length} 則相關討論。GitHub 搜尋最多可取得 1,000 則結果。</p>`;
  else if (snapshot.generatedAt && Date.now() - Date.parse(snapshot.generatedAt) > 6 * 3600000) n.innerHTML = `${icon('info')}<p>資料已超過 6 小時未更新，請查看 Actions 同步狀態。</p><button data-setup>查看設定</button>`;
  else { n.hidden = true; return; }
  n.hidden = false;
}
function render() {
  const items = snapshot.items, visible = filterItems(items, state);
  updateRepoColors();
  // Use the full snapshot so filtering or changing sort never changes a discussion's shade.
  // Equal update times receive the same shade; the newest dates are most prominent.
  const dates = [...new Set(items.map(item => Date.parse(item.updatedAt)))].sort((a, b) => b - a);
  const recency = new Map(dates.map((date, index) => [date, 1 - index / Math.max(1, dates.length - 1)]));
  const counts = { all: items.length, created: items.filter(item => item.author.toLowerCase() === ACCOUNT).length, saved: items.filter(item => state.saved.includes(item.id)).length };
  $$('[data-count]').forEach(el => { el.textContent = counts[el.dataset.count]; });
  $$('[data-tab]').forEach(el => { const active = el.dataset.tab === state.tab; if (el.getAttribute('role') === 'tab') { el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; } else el.classList.toggle('selected', active); });
  document.body.classList.toggle('has-data', Boolean(snapshot.generatedAt) && !demo);
  $('#stat-total').textContent = items.length;
  $('#stat-unread').textContent = items.filter(item => isUnread(item, state.read)).length;
  $('#stat-repos').textContent = new Set(items.map(item => item.repository)).size;
  $('#unread').setAttribute('aria-pressed', String(state.unread)); $('#unanswered').setAttribute('aria-pressed', String(state.unanswered));
  $('#result-count').textContent = visible.length;
  $('#repo-filter-name').textContent = state.repo ? ` / ${state.repo.split('/').pop()}` : '';
  $('#discussion-list').setAttribute('aria-labelledby', `tab-${state.tab}`); $('#discussion-list').setAttribute('aria-busy', 'false');
  $('#discussion-list').innerHTML = visible.length ? visible.map(item => renderRow(item, recency.get(Date.parse(item.updatedAt)) ?? 0)).join('') : emptyMarkup();
  $('#mark-all-read').disabled = !visible.some(item => isUnread(item, state.read));
  $('#sync-time').textContent = demo ? '範例資料 · 未連接 GitHub' : snapshot.generatedAt ? `上次同步：${relativeTime(snapshot.generatedAt)}` : '等待 GitHub Actions 首次同步';
  $('#sync-time').title = snapshot.generatedAt ? new Date(snapshot.generatedAt).toLocaleString('zh-TW') : '';
  $('#sidebar-status').textContent = demo ? '版型預覽中' : snapshot.generatedAt ? '已連接 GitHub Actions' : '等待首次同步';
  rebuildOptions(); renderNotice();
}
async function refresh(announce = true) {
  if (loading) return;
  loading = true; $('#refresh').disabled = true;
  try {
    const response = await fetch(`./data/discussions.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Snapshot unavailable');
    const next = await response.json();
    if (next.schemaVersion !== 1 || next.account !== ACCOUNT || !Array.isArray(next.items)) throw new Error('Invalid snapshot');
    for (const item of next.items) if (!item.id || typeof item.title !== 'string' || typeof item.repository !== 'string' || typeof item.author !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) throw new Error('Invalid discussion');
    if (next.generatedAt !== null && !Number.isFinite(Date.parse(next.generatedAt))) throw new Error('Invalid timestamp');
    realSnapshot = next; if (!demo) snapshot = next; loadError = false;
    if (announce) notify(next.generatedAt ? '已讀取最新的同步資料' : '尚未完成首次同步，請先設定 GitHub Actions');
  } catch { loadError = true; if (announce) notify('無法讀取資料，請稍後再試'); }
  finally { loading = false; $('#refresh').disabled = false; render(); }
}
function enterDemo() {
  if (demo) return;
  realSnapshot = snapshot; demo = true;
  const names = [
    ['uwuowoawa_colledge_ITSC', 'Prevention 業務功能提案：附件二歷史任務查詢與既有 Issue 版本盤點', 'LLM_Suppose', 0, 21],
    ['uwuowoawa_colledge_ITSC', '目前專案流程_AI', 'LLM_Suppose', 1, 39],
    ['uwuowoawa_colledge_ITSC', '目前專案流程', 'General', 0, 53],
    ['uwuowoawa_lab_policy', '相關路徑', 'General', 0, 120],
    ['1_uwuowoawa_colledge_multimedia', '相關的規格', 'Q&A', 3, 780],
    ['lab_survey_paper', '本週論文閱讀與討論筆記', 'General', 2, 1440]
  ];
  snapshot = { generatedAt: null, coverage: {}, items: names.map(([repo, title, category, comments, minutes], i) => ({ id: `demo-${i}`, title, url: '', repository: `${ACCOUNT}/${repo}`, author: ACCOUNT, category, labels: [], comments, upvotes: 1, isAnswered: i === 5, isPrivate: true, closed: false, updatedAt: new Date(Date.now() - minutes * 60000).toISOString(), createdAt: new Date(Date.now() - (minutes + 600) * 60000).toISOString() })) };
  Object.assign(state, { tab: 'created', query: '', repo: '', category: '', unread: false, unanswered: false, read: {}, saved: ['demo-1', 'demo-3'] });
  $('#search').value = ''; render();
}
function exitDemo() { demo = false; snapshot = realSnapshot || { items: [], generatedAt: null, coverage: {} }; Object.assign(state, loadState(), { tab: 'created', query: '', repo: '', category: '', unread: false, unanswered: false }); $('#search').value = ''; render(); }
hydrateIcons();
$('#secret-link').href = `https://github.com/${REPOSITORY}/settings/secrets/actions`;
$('#pages-link').href = `https://github.com/${REPOSITORY}/settings/pages`;
$('#workflow-link').href = `https://github.com/${REPOSITORY}/actions/workflows/discussions.yml`;
$('#setup-link').addEventListener('click', openSetup); $('#account-button').addEventListener('click', openSetup);
$$('.close-dialog').forEach(b => b.addEventListener('click', () => $('#setup-dialog').close()));
$('#setup-dialog').addEventListener('click', event => { if (event.target === $('#setup-dialog')) { const r = $('#setup-dialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#setup-dialog').close(); } });
$$('[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$('.panel-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = $$('.panel-tabs [role=tab]'); let i = tabs.findIndex(tab => tab.dataset.tab === state.tab);
  i = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault(); switchTab(tabs[i].dataset.tab); tabs[i].focus();
});
$('#search').addEventListener('input', e => { state.query = e.target.value; render(); });
$('#unread').addEventListener('click', () => { state.unread = !state.unread; render(); });
$('#unanswered').addEventListener('click', () => { state.unanswered = !state.unanswered; render(); });
$('#category').addEventListener('change', e => { state.category = e.target.value; render(); });
$('#repository').addEventListener('change', e => { state.repo = e.target.value; render(); });
$('#sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
$('#refresh').addEventListener('click', () => refresh());
$('#mark-all-read').addEventListener('click', () => { const visible = filterItems(snapshot.items, state); visible.forEach(item => { state.read[item.id] = item.updatedAt; }); persist(); render(); notify(`已將 ${visible.length} 則討論標為已讀`); });
document.addEventListener('click', event => {
  const b = event.target.closest('button, a'); if (!b) return;
  if (b.hasAttribute('data-setup')) openSetup();
  if (b.hasAttribute('data-demo')) enterDemo();
  if (b.hasAttribute('data-exit-demo')) exitDemo();
  if (b.hasAttribute('data-clear')) clearFilters();
  if (b.hasAttribute('data-retry')) refresh();
  if (b.hasAttribute('data-show-all')) { clearFilters(); switchTab('all'); }
  if (b.dataset.repo) { state.repo = state.repo === b.dataset.repo ? '' : b.dataset.repo; render(); }
  if (b.dataset.save) { const id = b.dataset.save, saved = state.saved.includes(id); state.saved = saved ? state.saved.filter(value => value !== id) : [...state.saved, id]; persist(); render(); notify(saved ? '已取消收藏' : '已加入收藏'); }
  const id = b.dataset.open || b.dataset.demoOpen;
  if (id) { const item = snapshot.items.find(row => row.id === id); if (item) { state.read[id] = item.updatedAt; persist(); setTimeout(render, 0); } if (b.dataset.demoOpen) notify('這是範例討論；同步後可在 GitHub 開啟原文'); }
});
document.addEventListener('keydown', event => { if (event.key === '/' && !event.metaKey && !event.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('#setup-dialog').open) { event.preventDefault(); $('#search').focus(); } });
window.addEventListener('storage', e => { if (e.key === 'discussion-desk-v1' && !demo) { Object.assign(state, loadState()); render(); } });
// Reading this small JSON file does not start an Actions workflow.
setInterval(() => { if (!document.hidden && !demo) refresh(false); }, 5 * 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !demo) refresh(false); });
refresh(false);
