// Pure computations for the built data. Definitions: docs/DATA.md, "Built data".
// "days" everywhere is an object { "YYYY-MM-DD": rawDayFile }; a missing day is a missing key.
// "lists" is an object { date: [id, ...] in rank order } (undefined = no chart that day).

export const points = r => 101 - r;

export function addDays(date, n) {
  const t = new Date(date + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

// n calendar days ending at `end`, oldest first.
export function dateRange(end, n) {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
}

const rankMap = list => list && new Map(list.map((id, i) => [id, i + 1]));

export function chartLists(days, cc, kind) {
  const lists = {};
  for (const [d, f] of Object.entries(days)) lists[d] = f.charts[cc]?.[kind];
  return lists;
}

// Top 100 of a window of n days ending at D. Without `scores`, score = Σ points(r);
// with `scores` ({ date: Map id -> score }), score is summed from it over every window day.
export function windowTop(lists, D, n, scores) {
  const acc = new Map();
  const dates = dateRange(D, n);
  for (const d of dates) {
    lists[d]?.forEach((id, i) => {
      let a = acc.get(id);
      if (!a) acc.set(id, (a = { id, score: 0, days: 0, sum: 0 }));
      a.days++;
      a.sum += i + 1;
      if (!scores) a.score += points(i + 1);
    });
  }
  if (scores) {
    for (const d of dates) {
      if (!scores[d]) continue;
      for (const a of acc.values()) a.score += scores[d].get(a.id) ?? 0;
    }
  }
  return [...acc.values()]
    .map(a => ({ a, avg: a.sum / a.days }))
    .sort((x, y) => y.a.score - x.a.score || x.avg - y.avg)
    .slice(0, 100)
    .map(({ a, avg }) => ({ id: a.id, score: a.score, days: a.days, avg: Math.round(avg * 10) / 10 }));
}

// today / risers / newcomers / week / month for one ranked series; null if no list on D.
export function chartView(lists, D, scores) {
  if (!lists[D]) return null;
  const h = dateRange(D, 7).map(d => rankMap(lists[d]));
  const prev = h[5];
  const weekAgo = rankMap(lists[addDays(D, -7)]);
  const today = lists[D].map((id, i) => ({
    id,
    r: i + 1,
    p: prev?.get(id) ?? null,
    w: weekAgo?.get(id) ?? null,
    h: h.map(m => m?.get(id) ?? null),
  }));
  const risers = today
    .filter(x => x.w !== null && x.w - x.r > 0)
    .sort((a, b) => b.w - b.r - (a.w - a.r) || a.r - b.r)
    .slice(0, 25)
    .map(({ id, r, w }) => ({ id, r, w }));
  const earlier = dateRange(addDays(D, -1), 7).map(d => lists[d]).filter(Boolean);
  const seen = new Set(earlier.flat());
  const newcomers = earlier.length
    ? today.filter(x => !seen.has(x.id)).slice(0, 25).map(({ id, r }) => ({ id, r }))
    : [];
  // prevDate/weekAgoDate tell the site whether p/w = null means "not in the chart" or "no data that day".
  const prevDate = prev ? addDays(D, -1) : null;
  const weekAgoDate = weekAgo ? addDays(D, -7) : null;
  return { prevDate, weekAgoDate, today, risers, newcomers, week: windowTop(lists, D, 7, scores), month: windowTop(lists, D, 30, scores) };
}

// Global standing for one kind on one raw day; null if no country has that chart.
export function globalDay(day, kind) {
  const m = new Map();
  let any = false;
  for (const cc of Object.keys(day.charts).sort()) {
    const list = day.charts[cc][kind];
    if (!list) continue;
    any = true;
    list.forEach((id, i) => {
      const r = i + 1;
      let g = m.get(id);
      if (!g) m.set(id, (g = { id, s: 0, c: 0, best: [cc, r, 0] }));
      g.s += points(r);
      g.c++;
      // best = [cc, r, n]: lowest rank, the first (alphabetical) cc with it, and how many countries share it.
      if (r < g.best[1]) g.best = [cc, r, 1];
      else if (r === g.best[1]) g.best[2]++;
    });
  }
  if (!any) return null;
  const top = [...m.values()].sort((a, b) => b.s - a.s || b.c - a.c).slice(0, 100);
  return { top, scores: new Map([...m.values()].map(g => [g.id, g.s])) };
}

// Global series for one kind. Full score maps are kept only for the 30-day month window (memory).
export function globalSeries(days, kind, D) {
  const lists = {}, tops = {}, scores = {};
  const monthStart = addDays(D, -29);
  for (const [d, f] of Object.entries(days)) {
    const g = globalDay(f, kind);
    if (!g) continue;
    tops[d] = g.top;
    lists[d] = g.top.map(x => x.id);
    if (d >= monthStart && d <= D) scores[d] = g.scores;
  }
  return { lists, tops, scores };
}

export function globalView(series, D) {
  const v = chartView(series.lists, D, series.scores);
  if (!v) return null;
  v.today.forEach((x, i) => {
    const t = series.tops[D][i];
    Object.assign(x, { s: t.s, c: t.c, best: t.best });
  });
  return v;
}

// Per-app history over the 90 days ending at D. globalLists = { kind: lists }.
// Returns { dates, apps: Map id -> { ranks, global } }.
export function appHistory(days, D, globalLists) {
  const dates = dateRange(D, 90);
  const apps = new Map();
  const get = id => {
    let a = apps.get(id);
    if (!a) apps.set(id, (a = { ranks: {}, global: {} }));
    return a;
  };
  const put = (obj, key, k, r) => ((obj[key] ??= Array(dates.length).fill(null))[k] = r);
  dates.forEach((d, k) => {
    const f = days[d];
    if (!f) return;
    for (const [cc, kinds] of Object.entries(f.charts)) {
      for (const [kind, list] of Object.entries(kinds)) list.forEach((id, i) => put(get(id).ranks, `${cc}/${kind}`, k, i + 1));
    }
    for (const [kind, lists] of Object.entries(globalLists)) lists[d]?.forEach((id, i) => put(get(id).global, kind, k, i + 1));
  });
  return { dates, apps };
}
