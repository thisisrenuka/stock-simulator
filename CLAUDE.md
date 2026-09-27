# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single self-contained file, `stake.html` — a **stock market simulator** for middle and high school students, called **Stake**. The student starts with pretend cash on 2025-09-24 and plays forward through a year of real market history, one day at a time, buying and selling at the actual closing prices.

No build step, no dependencies, no package manager, no network at runtime, and not a git repo. The only external requests are Google Fonts. The file is ~400KB because a year and a half of real prices is baked into it.

One student per device. No accounts, no login, no server — deliberately. See `docs/plans/`.

To run it: open `stake.html` in a browser, or `python3 -m http.server` in this directory and load `http://localhost:8000/stake.html`.

## Tests

```
node --test tests/*.test.js
```

The glob matters — `node --test tests/` fails to resolve on this Node version.

Two kinds of test, both offline:

**Pure core**, extracted from marked blocks in `stake.html`. Anything inside these markers must stay free of DOM and browser globals:
- `/* @portfolio-start */ … /* @portfolio-end */` → `tests/portfolio.test.js` (`portfolioFrom`, `maxAffordable`, `migrateHoldings`)
- `/* @replay-start */ … /* @replay-end */` → `tests/replay.test.js` (`perfAt`, `seriesFrom`, `indexOnOrBefore`)

**Whole-page flows** via `tests/harness.js`, a DOM shim that runs the real `stake.html` script under Node (`buy`, `sell`, `clock`). Three things about the shim matter, each learned from a test that lied:
- `getElementById` resolves **only** ids that appear in the markup, returning `null` otherwise. Without this a test can assert on an element that does not exist and pass. Do not loosen it — add the element to the page.
- `textContent` aggregates descendant text, like a real DOM. Text appended as a text node (the watchlist chips) otherwise reads as `""`.
- The shim does **not** parse HTML. Anything rendered with `innerHTML =` (holding tiles, `splitSub`, `changeSub`, `benchSub`) must be asserted against `.innerHTML`, not `.textContent`.

## Architecture

One IIFE in the `<script>` block, `"use strict"` ES5 (no arrow functions, `let`/`const`, template literals, or modules — match that style).

**Prices are baked in, not fetched.** `DATES` is a shared trading-day calendar (1272 days, 2021-09-01 → 2026-09-25). `SERIES` maps ticker → comma-joined integer cents aligned to `DATES`, decoded lazily by `seriesFrom()` into `seriesCache`. `START` (1019, 2025-09-24) is where the replay begins: four years of lookback behind it so the chart ranges have real data, and 252 trading days to play forward. Data came from Nasdaq's API via `curl` — that API sends no CORS header, so a browser cannot call it, but a build step can. To refresh or extend the dataset, re-run the fetch and re-splice; there is no runtime path to new prices by design.

**The clock is the state, and it only moves forward.** `day` is an index into `DATES`. Every price in the app is `SERIES[tk][day]`. `setDay()` clamps, persists, and re-renders; nothing else may assign to `day`. Advancing is the only thing that moves prices, which is what makes it a simulator rather than a tracker.

**Do not add a way to go back.** Rewinding would let a student advance a day, see a fall, rewind, and sell before it — every decision would then be made with hindsight and the results would mean nothing. Reviewing the past is served instead by the chart crosshair and by History. `clockNote` says this on screen. Forward jumps (`+1 day`, `+1 week`, `+1 month`, `Skip to the end`) are free to add: skipping only costs you the days you skip.

**The clock persists as a DATE** (`stake.date.v1`), not an index, so extending the calendar does not move a saved replay. `clockIndex()` resolves it, falling back to the old index-based `stake.day.v1` by mapping through `LEGACY_DATES` — the 518-day calendar this file shipped with before the history was extended. That migration rewrites storage on load, so `LEGACY_DATES` can be deleted once no old saves are in the wild.

**The trade log is the only stored record.** A trade is `{id, type: "buy"|"sell", ticker, shares, price, at, note, opening}`, where `at` is `DATES[day]` at the moment of the trade. Cash, positions, average cost, and realized gains are *derived* by `portfolioFrom(trades, startingCash)` on every render — never stored. History comes free because it *is* the storage. Average cost, not FIFO, because it is explainable to a twelve-year-old.

**State → persistence → render** is a strict one-way cycle. Handlers mutate `trades`, `startingCash`, `watch`, or `day`, then call `persist()` and `render()`. `render()` recomputes into the module-level `pf` and rebuilds every section; there is no diffing. Never touch the DOM from a handler.

**Dual persistence.** `persist()` writes localStorage (`stake.trades.v1`, `stake.starting.v1`, `stake.watch.v1`, `stake.day.v1`) and, when available, the Claude Artifact db capability via `window.claude.use("db")` (`stake/trades`, `stake/starting`, `stake/watchlist`, `stake/day`). `connect()` returns silently when `window.claude` is absent, so the page works as a plain file.

The `suppress` flag guards the write→snapshot→write echo: `persist()` sets it before its writes and clears it after all resolve, and every snapshot handler bails while set. Any new db write must go through `persist()` or reproduce that guard, or the page loops.

`sanitizeTrades()` / `sanitizeWatch()` are the trust boundary — every path loading external data (localStorage JSON, db snapshots) runs through them.

**Unpriced holdings** (a ticker not in `SERIES`, e.g. migrated from the tracker era) are valued at cost, show "no price" on their tile, and sell at their own average cost for zero gain rather than inventing a price.

**Migration.** `migrateHoldings()` converts tracker-era `stake.holdings.v1` positions into opening buys at their recorded cost, flagged `opening: true`. Runs once, only when `stake.trades.v1` is absent.

**XSS.** Some render paths build HTML strings; user-supplied values there must pass through `escapeHtml()`. Other paths use `textContent` — prefer that.

## Visual design

Robinhood-style: portfolio value, then the chart it moves, then the clock that moves it; holdings and watchlist as list rows with sparklines rather than bordered cards. Hairline dividers and whitespace carry the structure — avoid adding boxes.

**The portfolio chart** plots two series on **one shared dollar scale**: your portfolio value, and what the same starting cash would be worth in the S&P 500. Never give them separate axes — if a second measure is ever added, index both to a common base instead. It is hidden until there is a trade *and* the clock has moved, because a flat line says nothing. Both lines are direct-labelled in `chartFrom`, and the baseline hairline is labelled "$10,000 start" by `chartBase`, an HTML span positioned over the plot (it needs `background:var(--bg)` to mask the lines it sits on). `chartPts` holds the plotted values for the crosshair; the chart stays readable without hover.

**The stock detail view** (`stockSheet`) opens from a holding row or a watchlist row: price, day change, a chart with `1M / 6M / 1Y / Max` ranges from `rangeFrom()`, the position if held, and Buy/Sell. There is no `1D` range because the data is daily closes — one day is two points, and intraday data does not exist here. Focus goes to Close on open, never to Buy.

**Colour rules, checked with the dataviz skill's validator rather than by eye:**
- `--gain` #5FCB9B and `--loss` #DD6F6D against `--bench` #7C93A2 pass CVD separation and WCAG AA on the `--bg` surface. Darker greens sit better in the validator's lightness band but **lose** CVD separation (#3FAE7A fails the normal-vision floor at ΔE 12.7), so brightness wins here — the band is tuned for categorical area fills, not 2px lines on near-black.
- Gain/loss is never colour alone: every figure carries a `+`/`−` or a `▲`/`▼`. `moneyCents()` only signs negatives, so use `signedMoney()` wherever a gain is shown without an accompanying percentage.
- `--bench` is deliberately desaturated. It is a reference line, not a categorical hue; the validator's chroma floor does not apply to it.

**Type.** Figures are tabular (`.mono`) everywhere they stack in columns, and **proportional on the hero only** — equal-width digits read loose at display size. Section heads are 11px uppercase with `.09em` tracking.

**Copy.** Dates carry the year (`fmtDateYear`) because the replay spans 2025→2026. Summary facts are wrapped in `.seg` spans so a line breaks between facts, never mid-phrase.

**Checking layout.** The validator checks colour, not layout, and the DOM harness has no geometry — so render and look. Headless Chrome works:
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=out.png --window-size=620,1400 --force-device-scale-factor=2 file://<preview>`
Seed state by injecting a `localStorage` script after `<body>` in a copy of the page. Note macOS clamps the window to ~500px wide, so a narrower phone viewport has to be simulated with a fixed-width `<iframe>` in a wider window.

## If the page is republished as an Artifact

The `db` behavior depends on a declared runtime capability, not on the HTML alone. Load the `artifact-capabilities` skill before publishing or changing anything touching `window.claude`.
