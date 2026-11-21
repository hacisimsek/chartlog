import {
  STRINGS as S, el, svgEl, setState, fetchJSON, countryName, chartLabel, iconEl,
  fmtDate, fmtShort, fmtNum, fmtAvg, signed, initShell, drawSegments, genreName, announce, setCanonical,
} from './common.js';

const main = document.getElementById('content');
const id = new URLSearchParams(location.search).get('id') || '';
let app = null;
let selected = null;
let redraw = null;

function seriesList() {
  const list = ['free', 'paid', 'gfree', 'gpaid']
    .filter(kind => Array.isArray(app.global?.[kind]))
    .map(kind => ({ cc: 'global', kind, ranks: app.global[kind] }));
  const rest = Object.entries(app.ranks || {})
    .map(([key, ranks]) => { const [cc, kind] = key.split('/'); return { cc, kind, ranks }; })
    .filter(s => /^[a-z]{2}$/.test(s.cc) && ['free', 'paid', 'gfree', 'gpaid'].includes(s.kind) && Array.isArray(s.ranks))
    .sort((a, b) => recentBest(a.ranks) - recentBest(b.ranks) || a.cc.localeCompare(b.cc) || a.kind.localeCompare(b.kind));
  return [...list, ...rest].map(s => ({ ...s, key: `${s.cc}/${s.kind}`, label: chartLabel(s.cc, s.kind) }));
}

// Best rank in the last 7 days; charts absent this week sort after all present ones.
function recentBest(ranks) {
  const recent = ranks.slice(-7).filter(v => v != null);
  return recent.length ? Math.min(...recent) : 1000 + Math.min(...ranks.filter(v => v != null));
}

function lineChart(dates, ranks, width) {
  const W = Math.max(280, Math.round(width) || 600), H = 220, L = 34, R = 12, T = 10, B = 26;
  const x = i => L + (i * (W - L - R)) / Math.max(1, dates.length - 1);
  const y = r => T + ((r - 1) * (H - T - B)) / 99; // rank 1 at top, 100 at bottom
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'line', 'aria-hidden': 'true', focusable: 'false' });
  for (const r of [1, 25, 50, 75, 100]) {
    svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(r), y2: y(r), class: 'grid' }));
    svg.append(svgEl('text', { x: L - 6, y: y(r) + 4, 'text-anchor': 'end' }, r));
  }
  const last = dates.length - 1;
  for (const i of new Set([0, Math.floor(last / 2), last])) {
    const anchor = i === 0 ? 'start' : i === last ? 'end' : 'middle';
    svg.append(svgEl('text', { x: x(i), y: H - 6, 'text-anchor': anchor }, fmtShort(dates[i])));
  }
  const g = svgEl('g', { class: 'series' });
  drawSegments(g, ranks, x, y, 2.5);
  svg.append(g);
  return svg;
}

function summary(s) {
  let best = null;
  s.ranks.forEach((r, i) => { if (r != null && (best == null || r < best[0])) best = [r, app.dates[i]]; });
  const days = s.ranks.filter(r => r != null).length;
  return S.chartSummary(s.label, app.dates.length, days, best?.[0] ?? '—', fmtDate(best?.[1]), s.ranks.at(-1));
}

// "★ 4.8 (12,435,658 ratings · +41,210 in 30 days) · US App Store · Released May 18, 2023"; missing parts left out.
function ratingLine() {
  const inner = [
    app.rc != null && S.ratingsCount(fmtNum(app.rc)),
    app.rg != null && app.rgd && S.growthIn(signed(app.rg), app.rgd),
  ].filter(Boolean).join(' · ');
  const star = app.r != null || inner ? `★ ${app.r != null ? fmtAvg(app.r) : '—'}` : '';
  const rating = star && (inner ? `${star} (${inner})` : star);
  const released = /^\d{4}-\d{2}-\d{2}$/.test(app.rd || '') && S.releasedOn(fmtDate(app.rd));
  return [rating, rating && S.usSource, released].filter(Boolean).join(' · ');
}

function render() {
  document.title = `${app.n || id} — ${S.site}`;
  const desc = S.appDesc(app.n || `#${id}`, app.a);
  for (const sel of ['meta[name="description"]', 'meta[property="og:description"]']) document.head.querySelector(sel)?.setAttribute('content', desc);
  document.head.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
  const series = seriesList();
  const rating = ratingLine();
  redraw = null;

  const head = el('header', { class: 'app-head' },
    iconEl(app.i, 64),
    el('div', {},
      el('h1', {}, app.n || `#${id}`),
      el('p', { class: 'muted' }, [app.a, genreName(app.g)].filter(x => x && x !== '—').join(' · ')),
      rating && el('p', { class: 'muted' }, rating),
      el('a', { href: `https://apps.apple.com/app/id${id}`, rel: 'noopener', target: '_blank' }, S.openStore)));

  const nodes = [head];
  const dates = Array.isArray(app.dates) ? app.dates : [];
  if (series.length && dates.length) {
    if (!series.some(s => s.key === selected)) selected = series[0].key;
    const sel = el('select', { id: 'series' }, ...series.map(s => el('option', { value: s.key }, s.label)));
    sel.value = selected;
    const box = el('div', { class: 'linechart' });
    const text = el('p', { class: 'summary' });
    redraw = () => {
      const s = series.find(x => x.key === sel.value);
      selected = s.key;
      box.replaceChildren(lineChart(dates, s.ranks, box.clientWidth));
      text.textContent = summary(s);
    };
    sel.addEventListener('change', redraw);
    nodes.push(el('section', {},
      el('h2', {}, S.historyTitle),
      el('p', { class: 'controls' }, el('label', { for: 'series' }, S.seriesLabel), ' ', sel),
      box, text));
  }

  const current = series.filter(s => s.ranks.at(-1) != null).sort((a, b) => a.ranks.at(-1) - b.ranks.at(-1));
  const lastDate = fmtDate(dates.at(-1));
  const section = el('section', {}, el('h2', {}, S.currentTitle(lastDate)));
  if (current.length) {
    section.append(el('div', { class: 'table-wrap' }, el('table', { class: 'chart' },
      el('caption', { class: 'sr' }, S.currentTitle(lastDate)),
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col' }, S.col.chart),
        el('th', { scope: 'col', class: 'sec' }, S.col.country),
        el('th', { scope: 'col', class: 'num' }, S.col.position))),
      el('tbody', {}, ...current.map(s => el('tr', {},
        el('td', {}, el('a', { href: `index.html#/${s.cc}/${s.kind}/today` }, s.label)),
        el('td', { class: 'sec' }, s.cc === 'global' ? '—' : countryName(s.cc)),
        el('td', { class: 'num' }, s.ranks.at(-1))))))));
  } else {
    section.append(el('p', { class: 'state' }, S.notInAnyChart));
  }
  nodes.push(section);

  main.setAttribute('aria-busy', 'false');
  main.replaceChildren(...nodes);
  announce(app.n || `#${app.id}`);
  redraw?.(); // needs the box in the DOM to measure its width
}

initShell({ onIconsChange: () => app && render() });
if (/^\d+$/.test(id)) setCanonical(`app.html?id=${id}`);
addEventListener('resize', () => redraw?.());

if (!/^\d+$/.test(id)) {
  setState(main, S.badId, 'state error');
} else {
  setState(main, S.loading);
  let failed = false;
  try { app = await fetchJSON(`data/apps/${id}.json`); } catch { failed = true; }
  if (failed) setState(main, S.loadError, 'state error');
  else if (app) render();
  else setState(main, S.appNotFound);
}
