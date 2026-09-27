# Watchlist — design (2026-09-20)

Add a watchlist to `stake.html`: type a ticker, see its latest close and its
1-day, 1-month and 1-year performance.

## Data source

Twelve Data `GET https://api.twelvedata.com/time_series`
`?symbol=X&interval=1day&outputsize=260&apikey=KEY`, one request per ticker.
Verified 2026-09-20: CORS is open (`Access-Control-Allow-Origin: *`); response is
`{meta, values: [{datetime:"YYYY-MM-DD", close:"336.13", ...}], status:"ok"}`,
newest first; errors are `{code, message, status:"error"}`. Free plan: 8 req/min,
800/day. The `demo` key works for AAPL only.

Performance from the closes array:

- 1D: latest vs previous close
- 1M: latest vs first close dated on/before 30 days ago
- 1Y: latest vs first close on/before 365 days ago, else the oldest available

## Persistence

- Watchlist symbols: localStorage `stake.watch.v1` + db doc `stake/watchlist`,
  through the existing `persist()` / `suppress` path.
- Cached closes per ticker: localStorage `stake.watch.cache.v1` only, with
  `fetchedAt`. Re-fetch when older than 15 min or on manual Refresh.
- API key: localStorage `stake.apikey.v1` only — never the shared db doc.

## UI

Section between Trending and Positions. Input with the same autocomplete as the
Add sheet. Row: ticker, price, 1D/1M/1Y chips in gain/loss tones, "as of" line,
remove ×. Tapping a row opens the Add sheet with ticker and price pre-filled.

Errors are per row and never modal: unknown symbol → "not found"; 401 → one
section-level line "API key rejected — check Settings"; 429 → remaining rows
"rate limited — try again in a minute", no retry loop; network failure → cached
numbers if any, else "couldn't load".

## Testing

Pure computation lives between `/* @perf-start */` and `/* @perf-end */` markers
inside the inline script; `tests/perf.test.js` extracts that block and runs it
under `node --test`. DOM and network paths are verified manually in the browser.

## Addendum (2026-09-26): live prices for positions

Positions gain `live` and `asOf`. The refresh queue is the union of watchlist and
position tickers; each successful fetch writes the latest close into matching
positions (`applyLivePrices`, tested). The Add/Edit sheet hides *Price now* when
the ticker has cached bars (one lookup on ticker change if not), and shows it
for anything the API can't resolve. Live positions always track the feed — no
manual override.
