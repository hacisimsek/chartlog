# Data contract

Every script and the site follow this file. Change it first if a format changes.

## Source

Apple RSS v2 feed, no key:

```
https://rss.marketingtools.apple.com/api/v2/{cc}/apps/{top-free|top-paid}/100/apps.json
```

- `{cc}`: one of the 165 lowercase storefront codes in `countries.json` (probed 2026-11-21).
  Other codes return 500/502 or time out slowly, so never probe outside this list.
- Response: `feed.results[]`, each with `id, name, artistName, artworkUrl100, genres[{name}], url, releaseDate, kind`.
  No rank field: rank = array index + 1. About 10% of rows have empty `genres`.
- Small storefronts return fewer than 100 rows (seen: 30–99). That is valid data.
- The feed hangs ~35–40% of requests at random (measured 2026-11-21, same at concurrency 1, 4 and 8) and sometimes returns 500/502/504 or a non-JSON body. Normal responses take 1–3 s. So: 5 s timeout, 6 attempts, concurrency 8; a full run takes ~3–4 minutes, and the daily workflow runs fetch twice (the second pass only retries charts still missing).
- 100 is the max; asking for more returns 500.

Chart kinds in this project: `free` (top-free) and `paid` (top-paid).

## Committed data (`data/`)

### `data/raw/YYYY/YYYY-MM-DD.json` — one file per UTC day, minified

```json
{
  "date": "2026-11-22",
  "fetchedAt": "2026-11-22T03:19:44.120Z",
  "charts": { "tr": { "free": ["1234", "5678"], "paid": ["..."] }, "us": { "...": [] } },
  "failed": ["sb/paid"]
}
```

- `charts[cc][kind]` is the list of app ids in rank order (index 0 = rank 1).
- A chart that failed after all retries is absent from `charts` and listed in `failed` as `"cc/kind"`.
- Re-running on the same date merges: charts that succeed now replace old ones; charts that fail now keep the old value.

### `data/apps.json` — app metadata, minified, keyed by id

```json
{ "1234": { "n": "Name", "a": "Artist", "i": "https://is1-ssl.mzstatic.com/...100x100bb.png", "g": "6023" } }
```

- Updated on each fetch. Name/artist/icon come from the `us` row when the app is in a US chart that day, else from the first country (alphabetical) where it appears. On a partial re-run only `us` rows overwrite an existing entry.
- `g` is the App Store **genre id** (`genres[0].genreId`), not the name: feed names are localized per storefront (e.g. "Productividad", "教育"). The site maps ids to Turkish names. When no row carries a genre (common for the biggest apps), `fetch.mjs` asks the iTunes Lookup API (`https://itunes.apple.com/lookup?country=us&id=…`, batches of 150, 3.5 s apart, max 30 calls per run) for `primaryGenreId`. `"0"` = the lookup returned nothing (not in the US store); it is not retried. A non-numeric `g` (older data) counts as missing.
- App Store link is derived, never stored: `https://apps.apple.com/app/id{id}`.

## Built data (`site/data/`, git-ignored, written by `scripts/build.mjs`)

Definitions (all use the latest raw day `D` and calendar days before it):

- **prevDate / weekAgoDate** (per chart file): `D-1` / `D-7` if that day has this chart, else null. When null, the site shows `p` / `w` = null as "no data", not as "new".

- **points(r)** = `101 - r` (rank 1 → 100 points, rank 100 → 1 point).
- **prev**: rank on `D-1` (null if absent or that day is missing).
- **week ago** `w`: rank on `D-7` (null if absent or that day is missing).
- **risers**: items in today's chart with `w != null` and `w - r > 0`, sorted by `w - r` desc, then `r` asc; top 25.
- **newcomers**: items in today's chart that are absent from every raw day in `D-7..D-1` that has this chart; sorted by `r`; top 25. Empty if no earlier day has this chart.
- **week / month**: window of 7 / 30 calendar days ending at `D`. Per app: `score = Σ points(r)` over days in the window where it is in the chart, `days` = that count, `avg` = mean rank over those days (1 decimal). Sorted by score desc, then avg asc; top 100.
- **global (per kind)**: per app on one day, `score = Σ points(r)` over all countries whose chart for that kind exists that day; `c` = number of those countries; `best` = `[cc, r, n]`: the lowest r, the first cc (alphabetical) with it, and `n` = how many countries share that rank. Global today = top 100 by score desc, then c desc. Global prev/week-ago ranks are the app's rank in the global top 100 of `D-1` / `D-7`. Global week/month: `score` summed over the window's days, `days` = days in that day's global top 100, `avg` = mean global rank over those days.

### `site/data/meta.json`

```json
{ "date": "2026-11-22", "fetchedAt": "...", "days": 31, "first": "2026-10-23",
  "countries": ["ae", "..."], "failed": ["sb/paid"], "built": "..." }
```

`countries` = codes with at least one chart on `D`.

### `site/data/c/{cc}-{kind}.json` and `site/data/c/global-{kind}.json`

```json
{
  "date": "2026-11-22", "cc": "tr", "kind": "free", "prevDate": "2026-11-21", "weekAgoDate": null,
  "today":    [ { "id": "1", "r": 1, "p": 2, "w": 9, "h": [9, 7, 5, null, 3, 2, 1] } ],
  "risers":   [ { "id": "1", "r": 1, "w": 9 } ],
  "newcomers":[ { "id": "1", "r": 3 } ],
  "week":     [ { "id": "1", "score": 650, "days": 7, "avg": 3.4 } ],
  "month":    [ { "id": "1", "score": 2800, "days": 30, "avg": 5.1 } ],
  "apps": { "1": { "n": "...", "a": "...", "i": "...", "g": "..." } }
}
```

- `h` = ranks for `D-6..D` (7 values, null = not in chart or day missing).
- Global files also carry `s` (score), `c` (country count) and `best` on `today` items.
- `apps` holds metadata only for ids that appear in this file, so the page never loads `data/apps.json`.
- A chart file exists only if that chart exists on `D`.

### `site/data/apps/{id}.json` — per-app history, last 90 days

```json
{ "id": "1", "n": "...", "a": "...", "i": "...", "g": "...",
  "dates": ["2026-08-25", "...", "2026-11-22"],
  "ranks": { "tr/free": [null, 4, 3], "us/paid": [null, null, 88] },
  "global": { "free": [null, 12, 9] } }
```

- `dates` = every calendar day in the 90-day window ending at `D` (missing days included, their ranks null).
- `ranks` only includes charts where the app appears at least once in the window.
- `global[kind]` = the app's rank in the global top 100 per date (omitted if never in it).
- Only apps that appear in any chart in the window get a file.

## Limits we design for

- 165 countries × 2 kinds = 330 requests/day. Raw day file ≈ 400–450 KB minified.
- GitHub repo soft limit 1 GB, Pages site 1 GB, 100 GB/month bandwidth.
