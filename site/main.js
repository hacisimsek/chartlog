import {
  genreName, announce, compareNames,
  STRINGS as S, el, svgEl, setState, fetchJSON, countryName, appHref, iconEl,
  fmtDate, fmtStamp, fmtNum, fmtAvg, fmtCompact, fmtPct, signed, initShell, drawSegments, LANG,
} from './common.js';

const BASE_TITLE = document.title; // keyword title from index.html; Google indexes the default route's rendered title

const KINDS = ['free', 'paid', 'gfree', 'gpaid'];
// The header has two toggles (apps/games, free/paid); the route keeps one kind: free|paid|gfree|gpaid.
const kindOf = (type, price) => (type === 'games' ? 'g' : '') + price;
const typeOf = kind => (kind.startsWith('g') ? 'games' : 'apps');
const priceOf = kind => kind.replace(/^g/, '');
const VIEWS = ['today', 'risers', 'newcomers', 'week', 'month', 'quarter'];
const NEED = { today: 1, risers: 8, newcomers: 8, week: 7, month: 30, quarter: 90 };
const FILTERABLE = ['today', 'week', 'month', 'quarter'];
const PER_SIGNAL = 5;
const RADAR_KEY = 'chartlog:radarHidden';
const C = S.col;

const $ = id => document.getElementById(id);
const content = $('content');
const signalsBox = $('signals');
const scopeSel = $('scope');
const cache = new Map();
let meta = null;
let seq = 0;
let drawList = null;
let drawRadar = null;

// Built once so checked state and keyboard focus survive re-renders.
const filterBoxes = {
  low: el('input', { type: 'checkbox', id: 'f-low' }),
  recent: el('input', { type: 'checkbox', id: 'f-recent' }),
};
const filterCount = el('span', { class: 'count' });
const filterBar = el('div', { class: 'filters', role: 'group', 'aria-label': S.filtersLabel },
  el('span', { class: 'check' }, filterBoxes.low, el('label', { for: 'f-low' }, S.filterLow)),
  el('span', { class: 'check' }, filterBoxes.recent, el('label', { for: 'f-recent' }, S.filterRecent)),
  filterCount);
const ratingsNote = el('p', { class: 'hint' }, S.ratingsNoteA,
  el('a', { href: 'https://developer.apple.com/app-store/review/guidelines/#copycats', rel: 'noopener' }, S.ratingsNoteLink),
  S.ratingsNoteB);
for (const box of Object.values(filterBoxes)) {
  box.addEventListener('change', () => { drawList?.(); announce(filterCount.textContent); });
}

// rd within the 365 days before the data date.
function passesFilters(m = {}, date) {
  if (filterBoxes.low.checked && !(m.r != null && m.r < 4)) return false;
  if (filterBoxes.recent.checked) {
    const age = (Date.parse(date) - Date.parse(m.rd)) / 864e5;
    if (!(age >= 0 && age <= 365)) return false;
  }
  return true;
}

// Radar can be collapsed so the table is one scroll away; the choice is remembered per browser.
const radarBody = $('radar-body');
const radarBtn = $('radar-toggle');
let radarHidden = false;
try { radarHidden = localStorage.getItem(RADAR_KEY) === '1'; } catch { /* storage blocked: default open */ }
function showRadar() {
  radarBody.hidden = radarHidden;
  radarBtn.setAttribute('aria-expanded', String(!radarHidden));
  radarBtn.textContent = radarHidden ? S.radarShow : S.radarHide;
}
radarBtn.addEventListener('click', () => {
  radarHidden = !radarHidden;
  try { localStorage.setItem(RADAR_KEY, radarHidden ? '1' : '0'); } catch { /* not persisted */ }
  showRadar();
  if (!radarHidden) drawRadar?.(); // the scatter is sized from the visible width
});
showRadar();
// The scatter is drawn at the box width, so redraw when that width changes (rotation, window resize).
let radarWidth = 0;
new ResizeObserver(() => {
  const w = signalsBox.clientWidth;
  if (w && w !== radarWidth) { radarWidth = w; drawRadar?.(); }
}).observe(signalsBox);

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
    view: VIEWS.includes(view) ? view : 'month',
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
  for (const b of document.querySelectorAll('[data-type]')) b.setAttribute('aria-pressed', String(b.dataset.type === typeOf(route.kind)));
  for (const b of document.querySelectorAll('[data-price]')) b.setAttribute('aria-pressed', String(b.dataset.price === priceOf(route.kind)));
  for (const b of document.querySelectorAll('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === route.view));
  const isDefault = route.scope === 'global' && route.kind === 'free' && route.view === 'month';
  document.title = isDefault && LANG === 'en' ? BASE_TITLE : `${countryName(route.scope)} · ${S[route.kind]} · ${S[route.view]} — ${S.titleTail}`;
  $('radar-ctx').textContent = `· ${countryName(route.scope)} · ${S[route.kind]}`;

  const mine = ++seq;
  drawList = null;
  drawRadar = null;
  signalsBox.setAttribute('aria-busy', 'true');
  signalsBox.replaceChildren();
  setState(content, S.loading);
  let chart;
  try {
    chart = await loadChart(route.scope, route.kind);
  } catch {
    if (mine === seq) { signalsBox.setAttribute('aria-busy', 'false'); signalsBox.replaceChildren(el('p', { class: 'state error' }, S.loadError)); setState(content, S.loadError, 'state error'); }
    return;
  }
  if (mine !== seq) return; // a newer route rendered meanwhile
  signalsBox.setAttribute('aria-busy', 'false');
  if (!chart) { signalsBox.replaceChildren(el('p', { class: 'state' }, S.noChart)); return setState(content, S.noChart); }

  const apps = chart.apps || {};
  drawRadar = () => signalsBox.replaceChildren(...signals(chart, apps), ...[scatter(chart.month || [], apps)].filter(Boolean));
  drawRadar();

  const todayById = new Map((chart.today || []).map(t => [t.id, t]));
  const ctx = { apps, todayById, chart };
  const nodes = [];
  const need = NEED[route.view];
  if (meta.days < need) nodes.push(el('p', { class: 'note' }, S.needDays(meta.days, need)));
  const items = (chart[route.view] || []).map((it, i) => ({ ...it, pos: i + 1 })); // pos: rank before filtering
  if (items.length) {
    const caption = `${countryName(route.scope)} · ${S[route.kind]} · ${S[route.view]} · ${fmtDate(chart.date)}`;
    const cols = COLS[route.view](route.scope === 'global');
    const draw = shown => table(caption, cols, shown, ctx);
    if (FILTERABLE.includes(route.view)) {
      const results = el('div');
      drawList = () => {
        const shown = items.filter(it => passesFilters(apps[it.id], chart.date));
        filterCount.textContent = S.filterCount(shown.length, items.length);
        results.replaceChildren(shown.length ? draw(shown) : el('p', { class: 'state' }, S.filterEmpty));
      };
      drawList();
      nodes.push(filterBar, ratingsNote, results);
    } else {
      nodes.push(ratingsNote, draw(items)); // risers/newcomers show US ratings too
    }
  } else if (!nodes.length) {
    nodes.push(el('p', { class: 'state' }, S.noItems));
  }
  content.setAttribute('aria-busy', 'false');
  content.replaceChildren(...nodes);
  announce([...content.querySelectorAll('.note, .state, caption, .count')].map(n => n.textContent).join(' '));
}

function appLink(id, m = {}, size, sub) {
  const href = appHref(id);
  return el(href ? 'a' : 'span', { class: 'app-link', href }, iconEl(m.i, size),
    el('span', { class: 'app-text' }, el('span', { class: 'app-name' }, m.n || `#${id}`),
      sub ? el('span', { class: 'app-sub' }, sub) : null));
}

// ---------- radar: four signals, each a full-width band of up to five apps ----------
function signals(chart, apps) {
  const star = m => (m?.r != null ? `${fmtAvg(m.r)}★` : null);
  const grow = (chart.today || []).map(it => {
    const m = apps[it.id] || {};
    const base = m.rc != null && m.rg != null ? m.rc - m.rg : 0;
    // shortcut: bases under 100 ratings give noisy % jumps, so they are skipped; tune once real history exists.
    return { id: it.id, g: base >= 100 && m.rg > 0 ? m.rg / base : null };
  }).filter(x => x.g != null).sort((a, b) => b.g - a.g);
  const defs = [
    { cls: 'up', title: S.sigRise, why: S.sigRiseWhy, need: NEED.risers, noData: !chart.weekAgoDate, list: chart.risers || [],
      big: it => [signed(it.w - it.r), S.places], sub: it => `#${it.w} → #${it.r}` },
    { cls: '', title: S.sigNew, why: S.sigNewWhy, need: NEED.newcomers, noData: !chart.prevDate && !chart.weekAgoDate, list: chart.newcomers || [],
      big: it => [`#${it.r}`], sub: it => [genreName(apps[it.id]?.g), star(apps[it.id])].filter(x => x && x !== '—').join(' · ') },
    { cls: 'hot', title: S.sigLow, why: S.sigLowWhy, need: 1,
      list: (chart.month || []).filter(it => apps[it.id]?.r < 4).sort((a, b) => b.days - a.days || b.score - a.score),
      big: it => [fmtAvg(apps[it.id].r), '★'],
      sub: it => [S.daysIn(it.days), apps[it.id].rc != null ? `${fmtCompact(apps[it.id].rc)} ${S.ratingsShort}` : null].filter(Boolean).join(' · ') },
    // Growth needs a ratings file from an earlier day, so it needs at least 2 days.
    { cls: 'up', title: S.sigGrow, why: S.sigGrowWhy, need: 2, list: grow,
      big: x => ['+' + fmtPct(x.g)],
      sub: x => [S.growthIn(signed(apps[x.id].rg, fmtCompact), apps[x.id].rgd), star(apps[x.id])].filter(Boolean).join(' · ') },
  ];
  return defs.map((s, i) => {
    const top = s.list.slice(0, PER_SIGNAL);
    return el('section', { class: `signal ${s.cls}`, 'aria-labelledby': `sig-${i}` },
      el('header', {},
        el('h2', { id: `sig-${i}` }, el('span', { class: 'sig-n', 'aria-hidden': 'true' }, String(i + 1)), s.title),
        el('p', { class: 'why' }, s.why, top.length ? ` (${S.shownOf(top.length, s.list.length)})` : null)),
      top.length
        ? el('ol', { class: 'sig-list' }, ...top.map(it => {
          const [num, unit] = s.big(it);
          return el('li', {}, el('span', { class: 'big' }, num, unit ? el('small', {}, ' ', unit) : null),
            appLink(it.id, apps[it.id], 32, s.sub(it)));
        }))
        : el('p', { class: 'state' }, meta.days < s.need ? S.needDays(meta.days, s.need) : s.noData ? S.sigNoData : S.sigNone));
  });
}

// x = 30-day score, y = rating; the shaded corner is "popular (above median) and rated below 4.0".
function scatter(items, apps) {
  const pts = items.filter(it => apps[it.id]?.r != null).map(it => ({ id: it.id, x: it.score, y: apps[it.id].r }));
  if (pts.length < 2) return null;
  const missing = items.length - pts.length;
  const W = Math.max(300, Math.min(760, signalsBox.clientWidth || 760)), H = W < 500 ? 220 : 260;
  const L = 34, R = 10, Tp = 12, B = 30;
  const xs = pts.map(p => p.x).sort((a, b) => a - b);
  const xMax = xs.at(-1) || 1, xMed = xs[Math.floor(xs.length / 2)];
  const yMin = Math.min(3, Math.floor(Math.min(...pts.map(p => p.y)) * 2) / 2);
  const x = v => L + (v / xMax) * (W - L - R);
  const y = v => Tp + ((5 - v) / (5 - yMin)) * (H - Tp - B);
  const quad = p => p.x >= xMed && p.y < 4;
  const nQuad = pts.filter(quad).length;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'scatter', role: 'img', 'aria-label': `${S.scatterTitle}. ${S.scatterSr(pts.length, nQuad)}` });
  svg.append(svgEl('rect', { class: 'quad', x: x(xMed), y: y(4), width: x(xMax) - x(xMed), height: y(yMin) - y(4) }));
  for (let v = yMin; v <= 5; v += 0.5) {
    svg.append(svgEl('line', { class: v === 4 ? 'ref' : 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }),
      svgEl('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, fmtAvg(v)));
  }
  svg.append(
    svgEl('line', { class: 'ref', x1: x(xMed), x2: x(xMed), y1: Tp, y2: H - B }),
    svgEl('text', { x: W - R, y: H - 8, 'text-anchor': 'end' }, S.scatterX),
    svgEl('text', { x: L, y: H - 8 }, '0'),
    svgEl('text', { class: 'quad-label', x: W - R - 4, y: H - B - 6, 'text-anchor': 'end' }, S.quadrant));
  // Point links are for pointer users; keyboard and screen reader users get the list below.
  for (const p of pts) {
    const a = svgEl('a', { href: appHref(p.id) || '#', tabindex: '-1' });
    a.append(svgEl('circle', { class: quad(p) ? 'pt hot' : 'pt', cx: x(p.x).toFixed(1), cy: y(p.y).toFixed(1), r: 4.5 }),
      svgEl('title', {}, `${apps[p.id].n || p.id} · ${fmtAvg(p.y)}★ · ${fmtNum(p.x)}`));
    svg.append(a);
  }
  const list = el('details', { class: 'scatter-list' }, el('summary', {}, S.scatterList),
    el('ol', {}, ...pts.map(p => el('li', { class: quad(p) ? 'low' : null },
      el('a', { href: appHref(p.id) }, apps[p.id].n || `#${p.id}`), ` · ${fmtAvg(p.y)}★ · ${C.score} ${fmtNum(p.x)}`))));
  return el('figure', { class: 'scatter-fig' },
    el('figcaption', {}, el('strong', {}, S.scatterTitle), missing ? el('span', { class: 'muted' }, ' · ', S.noRating(missing)) : null),
    el('div', { class: 'scatter-wrap' }, svg), list);
}

// ---------- table ----------
// cols: { label, sr?, cls, cell(it, ctx) }. Tier classes: t2 hides at ≤640px, t3 at ≤900px.
function table(caption, cols, items, ctx) {
  ctx = { ...ctx, starsMain: cols.includes(col.starsMain) };
  const head = c => (c.sr ? [el('span', { 'aria-hidden': 'true' }, c.label), el('span', { class: 'sr' }, c.sr)] : [c.label]);
  return el('table', { class: 'chart' },
    el('caption', { class: 'sr' }, caption),
    el('thead', {}, el('tr', {}, ...cols.map(c => el('th', { scope: 'col', class: c.cls }, ...head(c))))),
    el('tbody', {}, ...items.map(it => el('tr', {}, ...cols.map(c => el('td', { class: c.cls }, c.cell(it, ctx)))))));
}

// The second line (.m2) only shows on phones, where the secondary columns are hidden.
// noStar: the main column already shows the rating, so the line leaves it out.
function appCell(id, apps, noStar) {
  const m = apps[id] || {};
  const m2 = [genreName(m.g), m.rd?.slice(0, 4), m.r != null && !noStar ? `★${fmtAvg(m.r)}` : null, m.rc != null ? fmtCompact(m.rc) : null]
    .filter(v => v && v !== '—').join(' · ');
  const text = el('span', { class: 'app-text' },
    el('span', { class: 'app-name' }, m.n || `#${id}`),
    m.a ? el('span', { class: 'app-artist' }, m.a) : null,
    m2 ? el('span', { class: 'm2' }, m2) : null);
  const href = appHref(id);
  return el(href ? 'a' : 'span', { class: 'app-link', href }, iconEl(m.i, 24), text);
}

function growth(m = {}) {
  if (m.rg == null || !m.rgd) return '—';
  // Spans differ per app (1..30 days, short while history builds up), so show the span when it is not 30.
  const span = m.rgd < 30 ? ` (${S.daysShort(m.rgd)})` : '';
  return el('span', {}, el('span', { 'aria-hidden': 'true' }, signed(m.rg, fmtCompact) + span),
    el('span', { class: 'sr' }, S.growthIn(signed(m.rg), m.rgd)));
}

// Movement from an older rank `from` to rank `r` (lower is better).
// hasFrom = there is data for that older day; without it a null `from` means "unknown", not "new".
function delta(r, from, hasFrom = true) {
  if (from == null && !hasFrom) {
    return el('span', { class: 'nil', title: S.noPrev }, el('span', { 'aria-hidden': 'true' }, '–'), el('span', { class: 'sr' }, S.noPrev));
  }
  if (from == null) return el('span', { class: 'new' }, S.isNew);
  if (from === r) return el('span', { class: 'nil' }, el('span', { 'aria-hidden': 'true' }, '='), el('span', { class: 'sr' }, S.same));
  const n = Math.abs(from - r);
  const up = from > r;
  return el('span', { class: `pill ${up ? 'up' : 'down'}` },
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
  if (!vals.length) return el('span', { class: 'nil' }, '—');
  const W = 56, H = 16, P = 2;
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const first = h.findIndex(v => v != null);
  const last = h.at(-1);
  const dir = last == null || vals.length < 2 ? '' : h[first] > last ? 'up' : h[first] < last ? 'down' : '';
  const x = i => P + (i * (W - 2 * P)) / Math.max(1, h.length - 1);
  const y = v => (hi === lo ? H / 2 : P + ((v - lo) * (H - 2 * P)) / (hi - lo)); // rank 1 at top
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: `spark ${dir}`, 'aria-hidden': 'true', focusable: 'false' });
  drawSegments(svg, h, x, y, 1.6);
  const text = first === h.length - 1 ? S.sparkOnlyToday(last ?? '—') : S.sparkText(h.length - 1 - first, h[first], last ?? '—');
  return el('span', {}, svg, el('span', { class: 'sr' }, text));
}

const metaOf = (it, ctx) => ctx.apps[it.id] || {};
const stars = (it, ctx) => {
  const r = metaOf(it, ctx).r;
  return r == null ? '—' : el('span', { class: r < 4 ? 'low' : null }, fmtAvg(r));
};

// Shared columns; each view picks its own, momentum (Δ, 7D) right after the name.
const col = {
  rank: { label: C.rank, cls: 'rank', cell: it => it.r },
  pos: { label: C.rank, cls: 'rank', cell: it => it.pos },
  app: { label: C.app, cls: 'app', cell: (it, ctx) => appCell(it.id, ctx.apps, ctx.starsMain) },
  dToday: { label: C.delta, sr: C.deltaSr, cls: 'delta', cell: (it, ctx) => delta(it.r, it.p, Boolean(ctx.chart.prevDate)) },
  // Period views: momentum comes from today's chart; apps that dropped out show a muted dot.
  dPeriod: {
    label: C.delta, sr: C.deltaSr, cls: 'delta',
    cell: (it, ctx) => {
      const t = ctx.todayById.get(it.id);
      return t ? delta(t.r, t.p, Boolean(ctx.chart.prevDate))
        : el('span', { class: 'nil', title: S.notInToday }, el('span', { 'aria-hidden': 'true' }, '·'), el('span', { class: 'sr' }, S.notInToday));
    },
  },
  dRise: { label: C.rise, sr: C.riseSr, cls: 'delta', cell: it => delta(it.r, it.w) },
  spark: { label: C.spark, sr: C.sparkSr, cls: 'spark t2', cell: (it, ctx) => spark((it.h ? it : ctx.todayById.get(it.id))?.h) },
  stars: { label: C.stars, sr: C.starsSr, cls: 'num quiet t2', cell: stars },
  starsMain: { label: C.stars, sr: C.starsSr, cls: 'num main', cell: stars },
  category: { label: C.category, cls: 'quiet t3', cell: (it, ctx) => genreName(metaOf(it, ctx).g) },
  released: { label: C.released, cls: 'num quiet t2', cell: (it, ctx) => metaOf(it, ctx).rd?.slice(0, 4) || '—' },
  ratings: { label: C.ratings, cls: 'num quiet t2', cell: (it, ctx) => (metaOf(it, ctx).rc != null ? fmtCompact(metaOf(it, ctx).rc) : '—') },
  growth: { label: C.growth, sr: C.growthSr, cls: 'num quiet t3', cell: (it, ctx) => growth(metaOf(it, ctx)) },
  gScore: { label: C.score, cls: 'num main', cell: it => fmtNum(it.s) },
  countries: { label: C.countries, cls: 'num quiet t2', cell: it => it.c },
  best: { label: C.best, cls: 'quiet t3', cell: it => bestText(it.best) },
  weekAgo: { label: C.weekAgo, cls: 'num quiet t2', cell: it => it.w },
  todayRank: { label: C.todayRank, cls: 'num main', cell: it => it.r },
  score: { label: C.score, cls: 'num main', cell: it => fmtNum(it.score) },
  days: { label: C.days, cls: 'num quiet t3', cell: it => it.days },
  avg: { label: C.avg, cls: 'num quiet t3', cell: it => fmtAvg(it.avg) },
};

const period = () => [col.pos, col.app, col.dPeriod, col.spark, col.score, col.stars, col.ratings, col.growth, col.released, col.category, col.days, col.avg];
const COLS = {
  today: global => (global
    ? [col.rank, col.app, col.dToday, col.spark, col.gScore, col.countries, col.best, col.stars, col.category]
    : [col.rank, col.app, col.dToday, col.spark, col.starsMain, col.ratings, col.released, col.category]),
  risers: () => [col.pos, col.app, col.dRise, col.spark, col.todayRank, col.weekAgo, col.stars, col.category],
  newcomers: () => [col.rank, col.app, col.starsMain, col.ratings, col.released, col.category],
  week: period,
  month: period,
  quarter: period,
};

function setupHeader() {
  const stamp = fmtStamp(meta.fetchedAt) || fmtDate(meta.date);
  $('updated').replaceChildren(S.updated, ' ', el('time', { datetime: meta.fetchedAt || meta.date }, stamp));

  const todayUTC = Date.parse(new Date().toISOString().slice(0, 10));
  if ((todayUTC - Date.parse(meta.date)) / 864e5 > 2) {
    const notice = $('stale');
    notice.textContent = S.stale(fmtDate(meta.date));
    notice.hidden = false;
  }

  const countries = meta.countries
    .map(cc => [cc, countryName(cc)])
    .sort((a, b) => compareNames(a[1], b[1]));
  scopeSel.append(
    el('option', { value: 'global' }, S.global),
    ...countries.map(([cc, name]) => el('option', { value: cc }, `${name} (${cc.toUpperCase()})`)),
  );
  scopeSel.addEventListener('change', () => go({ scope: scopeSel.value }));
  for (const b of document.querySelectorAll('[data-type]')) b.addEventListener('click', () => go({ kind: kindOf(b.dataset.type, priceOf(parseRoute().kind)) }));
  for (const b of document.querySelectorAll('[data-price]')) b.addEventListener('click', () => go({ kind: kindOf(typeOf(parseRoute().kind), b.dataset.price) }));
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => go({ view: b.dataset.view }));
}

initShell({ onIconsChange: () => meta && render() });
setState(content, S.loading);
try { meta = await fetchJSON('data/meta.json'); } catch { /* handled below */ }
if (!meta || !Array.isArray(meta.countries)) {
  meta = null;
  signalsBox.setAttribute('aria-busy', 'false');
  setState(content, S.loadError, 'state error');
} else {
  setupHeader();
  addEventListener('hashchange', render);
  render();
}
