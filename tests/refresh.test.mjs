import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const lib = await readFile(new URL('../lib.mjs', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const source = lib.replace(/^export /gm, '') + '\n' + app.replace(/^import[^;]+;\s*/, '');
const now = Date.now();
const row = id => ({ id, title: `Discussion ${id}`, repository: 'milin-chang/repo', author: 'milin-chang', url: 'https://github.com/milin-chang/repo/discussions/1', updatedAt: new Date(now - 3600000).toISOString(), createdAt: new Date(now - 7200000).toISOString(), category: 'General', labels: [], comments: 0, upvotes: 1 });
const snapshot = (time, ids) => ({ schemaVersion: 1, account: 'milin-chang', generatedAt: new Date(time).toISOString(), coverage: {}, items: ids.map(row) });

async function loadApp(responses) {
  const elements = new Map(), timeouts = new Map(), intervals = new Map(), requests = [];
  let timerId = 0;
  const element = key => {
    if (!elements.has(key)) elements.set(key, {
      innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
      events: new Map(), attributes: new Map(), classList: { toggle() {} },
      setAttribute(name, value) { this.attributes.set(name, value); },
      addEventListener(name, handler) { const events = this.events.get(name) || []; events.push(handler); this.events.set(name, events); },
      querySelectorAll() { return []; }
    });
    return elements.get(key);
  };
  const document = { hidden: false, querySelector: element, querySelectorAll() { return []; }, addEventListener() {}, body: { classList: { toggle() {} } } };
  const context = {
    document, window: { addEventListener() {} }, localStorage: { getItem() { return null; }, setItem() {} }, URL, AbortController,
    setTimeout(fn, delay) { const id = ++timerId; timeouts.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timeouts.delete(id); },
    setInterval(fn, delay) { const id = ++timerId; intervals.set(id, { fn, delay }); return id; },
    clearInterval(id) { intervals.delete(id); },
    async fetch(url, options) {
      requests.push({ url, options });
      const response = responses.shift();
      if (typeof response === 'function') return response(options);
      if (!response) throw new Error('No response queued');
      return { ok: true, json: async () => structuredClone(response) };
    }
  };
  await vm.runInNewContext(source, context);
  return { element, timeouts, intervals, requests, click: key => element(key).events.get('click')[0]() };
}

test('refresh reports unchanged data, rejects an older response, and displays newly published discussions', async () => {
  const first = snapshot(now - 60000, ['a']);
  const older = snapshot(now - 120000, []);
  const newer = snapshot(now, ['a', 'b']);
  const ui = await loadApp([first, first, older, newer]);
  await ui.click('#refresh');
  assert.match(ui.element('#refresh-feedback-text').textContent, /尚無新的發布版本/);
  assert.equal(ui.element('#result-count').textContent, 1);
  await ui.click('#refresh');
  assert.match(ui.element('#refresh-feedback-text').textContent, /較舊.*保留/);
  assert.equal(ui.element('#result-count').textContent, 1);
  await ui.click('#refresh');
  assert.match(ui.element('#refresh-feedback-text').textContent, /新增 1 則/);
  assert.equal(ui.element('#result-count').textContent, 2);
  assert.ok(ui.requests.every(request => request.options.cache === 'no-store'));
});

test('opening GitHub asks the user to run the workflow and waits until a newer result is published', async () => {
  const ui = await loadApp([snapshot(now - 60000, ['a']), snapshot(now, ['a', 'b'])]);
  ui.click('#sync-now-link');
  assert.match(ui.element('#refresh-feedback-text').textContent, /請在 GitHub 按 Run workflow/);
  assert.equal(ui.requests.length, 1, 'Opening the link does not pretend to dispatch a workflow');
  const watcher = [...ui.intervals.values()].find(timer => timer.delay === 15000);
  assert.ok(watcher);
  watcher.fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(ui.element('#refresh-feedback-text').textContent, /新增 1 則/);
  assert.equal(ui.element('#result-count').textContent, 2);
  assert.ok(![...ui.intervals.values()].some(timer => timer.delay === 15000));
  assert.equal(ui.element('#stop-sync-watch').hidden, true);
});

test('a timed out refresh unlocks the button and preserves the current discussions', async () => {
  const waitForAbort = options => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  const ui = await loadApp([snapshot(now, ['a']), waitForAbort]);
  const pending = ui.click('#refresh');
  assert.equal(ui.element('#refresh').disabled, true);
  assert.equal(ui.element('#refresh-label').textContent, '檢查中…');
  [...ui.timeouts.values()].find(timer => timer.delay === 15000).fn();
  await pending;
  assert.equal(ui.element('#refresh').disabled, false);
  assert.equal(ui.element('#refresh-label').textContent, '檢查看板更新');
  assert.equal(ui.element('#result-count').textContent, 1);
  assert.match(ui.element('#refresh-feedback-text').textContent, /逾時.*保留原資料/);
});
test('the regular auto-refresh loads published updates and replaces an old no-update message', async () => {
  const first = snapshot(now - 60000, ['a']);
  const ui = await loadApp([first, first, snapshot(now, ['a', 'b'])]);
  await ui.click('#refresh');
  assert.match(ui.element('#refresh-feedback-text').textContent, /尚無新的發布版本/);
  const regularRefresh = [...ui.intervals.values()].find(timer => timer.delay === 5 * 60000);
  assert.ok(regularRefresh);
  regularRefresh.fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.element('#result-count').textContent, 2);
  assert.match(ui.element('#refresh-feedback-text').textContent, /新增 1 則/);
});
