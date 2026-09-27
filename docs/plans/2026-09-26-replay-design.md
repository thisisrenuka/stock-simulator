# Historical replay — design (2026-09-26)

Supersedes the live-price design. The app no longer fetches anything at runtime.

## Why

Requiring every student to sign up for a Twelve Data API key made the app
unusable out of the box. No keyless, CORS-enabled price source exists that a
browser page can call: stooq sits behind a bot wall, Nasdaq's API sends no
CORS header, Yahoo rate-limits. But CORS only restricts browsers — a build step
can fetch freely. So prices are fetched once and baked into the file.

A single frozen snapshot would make a dead simulator (buy at $341, and it stays
$341 forever). Replaying real history instead gives prices that move, with no
network and no invented data.

## Data

Nasdaq `api/quote/{T}/historical`, fetched 2026-09-26 for 118 tickers over
2024-09-01 → 2026-09-26. 4 tickers dropped as delisted or renamed (SQ, WBA, EA,
ATVI). Aligned to a shared calendar of days present for >=80% of tickers (518
days), forward-filled, encoded as comma-joined integer cents. ~348KB.

`START = 265` (2025-09-24): a year of lookback behind it so 1D/1M/1Y are all
meaningful on day one, and 252 trading days to play forward.

## Model

`day` indexes `DATES`. Every price is `SERIES[tk][day]`. `setDay()` is the only
writer. Trades record `at: DATES[day]`. The S&P 500 comparison runs SPY from the
first trade's date to the current day.

## Verified

A full year played out headlessly: 39 AAPL bought at $252.31 on day one ends at
$341.07, turning $10,000 into $13,461.64 — matching real history exactly.
