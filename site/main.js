import {
  genreName, announce,
  STRINGS as S, el, svgEl, setState, fetchJSON, countryName, appHref, iconEl,
  fmtDate, fmtStamp, fmtNum, fmtAvg, initShell, drawSegments,
} from './common.js';

const KINDS = ['free', 'paid'];
const VIEWS = ['today', 'risers', 'newcomers', 'week', 'month'];
const NEED = { today: 1, risers: 8, newcomers: 8, week: 7, month: 30 };

const content = document.getElementById('content');
const scopeSel = document.getElementById('scope');
const cache = new Map();
let meta = null;
let seq = 0;

function loadChart(scope, kind) {
  const url = `data/c/${scope}-${kind}.json`;
  if (!cache.has(url)) cache.set(url, fetchJSON(url).catch(e => { cache.delete(url); throw e; }));
  return cache.get(url);
}

function parseRoute() {
  const [scope, kind, view] = location.hash.replace(/^#\/?/, '').split('/');
  return {
    scope: scope === 'global' || meta.countries.includes(scope) ? scope : 'global',
    kind: KINDS.includes(kind) ? kind : 'free',
    view: VIEWS.includes(view) ? view : 'today',
  };
}

function go(patch) {
  const r = { ...parseRoute(), ...patch };
  location.hash = `#/${r.scope}/${r.kind}/${r.view}`;
}

async function render() {
  const route = parseRoute();
  const canonical = `#/${route.scope}/${route.kind}/${route.view}`;
  if (location.hash !== canonical) history.replaceState(null, '', canonical);

  scopeSel.value = route.scope;
  for (const b of document.querySelectorAll('[data-kind]')) b.setAttribute('aria-pressed', String(b.dataset.kind === route.kind));
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === route.view));
  document.title = `${countryName(route.scope)} · ${S[route.kind]} · ${S[route.view]} — ${S.site}`;

  const mine = ++seq;
  setState(content, S.loading);
  let chart;
  try {
    chart = await loadChart(route.scope, route.kind);
  } catch {
    if (mine === seq) setState(content, S.loadError, 'state error');
    return;
  }
  if (mine !== seq) return; // a newer route rendered meanwhile
  if (!chart) return setState(content, S.noChart);

  const nodes = [];
  const need = NEED[route.view];
  if (meta.days < need) nodes.push(el('p', { class: 'note' }, S.needDays(meta.days, need)));
  const items = chart[route.view] || [];
  if (items.length) {
    const caption = `${countryName(route.scope)} · ${S[route.kind]} · ${S[route.view]} · ${fmtDate(chart.date)}`;
    nodes.push(TABLES[route.view](items, chart.apps || {}, route.scope === 'global', caption, chart));
  } else if (!nodes.length) {
    nodes.push(el('p', { class: 'state' }, S.noItems));
  }
  content.setAttribute('aria-busy', 'false');
  content.replaceChildren(...nodes);
  announce([...content.querySelectorAll('.note, .state, caption')].map(n => n.textContent).join('. '));
}

// cols: { label, sr?, cls }; rows: arrays of cell values (Node | string | number).
function table(caption, cols, rows) {
  const head = c => (c.sr ? [el('span', { 'aria-hidden': 'true' }, c.label), el('span', { class: 'sr' }, c.sr)] : [c.label]);
  return el('div', { class: 'table-wrap' }, el('table', { class: 'chart' },
    el('caption', { class: 'sr' }, caption),
    el('thead', {}, el('tr', {}, ...cols.map(c => el('th', { scope: 'col', class: c.cls }, ...head(c))))),
    el('tbody', {}, ...rows.map(cells => el('tr', {}, ...cells.map((v, i) => el('td', { class: cols[i].cls }, v))))),
  ));
}

function appCell(id, apps) {
  const m = apps[id] || {};
  const text = el('span', { class: 'app-text' },
    el('span', { class: 'app-name' }, m.n || `#${id}`),
    m.a ? el('span', { class: 'app-artist sec' }, m.a) : null);
  const href = appHref(id);
  return el(href ? 'a' : 'span', { class: 'app-link', href }, iconEl(m.i, 28), text);
}

const genre = (id, apps) => genreName(apps[id]?.g);

// Movement from an older rank `from` to rank `r` (lower is better).
// hasFrom = there is data for that older day; without it a null `from` means "unknown", not "new".
function delta(r, from, hasFrom = true) {
  if (from == null && !hasFrom) {
    return el('span', { class: 'muted', title: S.noPrev }, el('span', { 'aria-hidden': 'true' }, '–'), el('span', { class: 'sr' }, S.noPrev));
  }
  if (from == null) return el('span', { class: 'new' }, S.isNew);
  if (from === r) return el('span', { class: 'same' }, el('span', { 'aria-hidden': 'true' }, '='), el('span', { class: 'sr' }, S.same));
  const n = Math.abs(from - r);
  const up = from > r;
  return el('span', { class: up ? 'up' : 'down' },
    el('span', { 'aria-hidden': 'true' }, (up ? '▲' : '▼') + n),
    el('span', { class: 'sr' }, up ? S.upBy(n) : S.downBy(n)));
}

// best = [cc, r, n]: "TR #1" when one country has the best rank, "#1 · 87 ülke" when several share it.
function bestText(best) {
  if (!best) return '—';
  const [cc, r, n = 1] = best;
  return n > 1 ? S.bestShared(r, n) : `${String(cc).toUpperCase()} #${r}`;
}

function spark(h = []) {
  const vals = h.filter(v => v != null);
  if (!vals.length) return '—';
  const W = 70, H = 18, P = 2;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = i => P + (i * (W - 2 * P)) / Math.max(1, h.length - 1);
  const y = v => (hi === lo ? H / 2 : P + ((v - lo) * (H - 2 * P)) / (hi - lo)); // rank 1 at top
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'spark', 'aria-hidden': 'true', focusable: 'false' });
  drawSegments(svg, h, x, y, 1.6);

  const first = h.findIndex(v => v != null);
  const last = h.at(-1) ?? '—';
  const text = first === h.length - 1 ? S.sparkOnlyToday(last) : S.sparkText(h.length - 1 - first, h[first], last);
  return el('span', { class: 'spark-cell' }, svg, el('span', { class: 'sr' }, text));
}

const C = S.col;
const TABLES = {
  today(items, apps, global, caption, chart) {
    const cols = [
      { label: C.rank, cls: 'rank' },
      { label: C.delta, sr: C.deltaSr, cls: 'delta' },
      { label: C.app, cls: 'app' },
      ...(global ? [
        { label: C.countries, cls: 'num sec' },
        { label: C.best, cls: 'nowrap sec' },
        { label: C.score, cls: 'num' },
      ] : []),
      { label: C.category, cls: 'sec nowrap' },
      { label: C.spark, sr: C.sparkSr, cls: global ? 'spark sec' : 'spark' },
    ];
    return table(caption, cols, items.map(it => [
      it.r, delta(it.r, it.p, Boolean(chart.prevDate)), appCell(it.id, apps),
      ...(global ? [it.c, bestText(it.best), fmtNum(it.s)] : []),
      genre(it.id, apps), spark(it.h),
    ]));
  },
  risers(items, apps, global, caption) {
    const cols = [
      { label: C.rank, cls: 'rank' },
      { label: C.rise, sr: C.riseSr, cls: 'delta' },
      { label: C.app, cls: 'app' },
      { label: C.weekAgo, cls: 'num sec' },
      { label: C.todayRank, cls: 'num' },
    ];
    return table(caption, cols, items.map((it, i) => [i + 1, delta(it.r, it.w), appCell(it.id, apps), it.w, it.r]));
  },
  newcomers(items, apps, global, caption) {
    const cols = [{ label: C.rank, cls: 'rank' }, { label: C.app, cls: 'app' }, { label: C.category, cls: 'sec nowrap' }];
    return table(caption, cols, items.map(it => [it.r, appCell(it.id, apps), genre(it.id, apps)]));
  },
  week: period,
  month: period,
};

function period(items, apps, global, caption) {
  const cols = [
    { label: C.rank, cls: 'rank' },
    { label: C.app, cls: 'app' },
    { label: C.score, cls: 'num' },
    { label: C.days, cls: 'num sec' },
    { label: C.avg, cls: 'num' },
  ];
  return table(caption, cols, items.map((it, i) => [i + 1, appCell(it.id, apps), fmtNum(it.score), it.days, fmtAvg(it.avg)]));
}

function setupHeader() {
  const stamp = fmtStamp(meta.fetchedAt) || fmtDate(meta.date);
  document.getElementById('updated').replaceChildren(S.updated, ' ', el('time', { datetime: meta.fetchedAt || meta.date }, stamp));

  const todayUTC = Date.parse(new Date().toISOString().slice(0, 10));
  if ((todayUTC - Date.parse(meta.date)) / 864e5 > 2) {
    const notice = document.getElementById('stale');
    notice.textContent = S.stale(fmtDate(meta.date));
    notice.hidden = false;
  }

  const countries = meta.countries
    .map(cc => [cc, countryName(cc)])
    .sort((a, b) => a[1].localeCompare(b[1], 'tr'));
  scopeSel.append(
    el('option', { value: 'global' }, S.global),
    ...countries.map(([cc, name]) => el('option', { value: cc }, `${name} (${cc.toUpperCase()})`)),
  );
  scopeSel.addEventListener('change', () => go({ scope: scopeSel.value }));
  for (const b of document.querySelectorAll('[data-kind]')) b.addEventListener('click', () => go({ kind: b.dataset.kind }));
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => go({ view: b.dataset.view }));
}

initShell({ onIconsChange: () => meta && render() });
setState(content, S.loading);
try { meta = await fetchJSON('data/meta.json'); } catch { /* handled below */ }
if (!meta || !Array.isArray(meta.countries)) {
  meta = null;
  setState(content, S.loadError, 'state error');
} else {
  setupHeader();
  addEventListener('hashchange', render);
  render();
}
