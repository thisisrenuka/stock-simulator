# Stock simulator — design (2026-09-26)

Audience: one middle/high-school student per device. No accounts, no server;
stays a single `stake.html`.

## The shift

Stake was a portfolio TRACKER (type in what you own, including what you paid).
It becomes a SIMULATOR: you start with pretend cash, buy at the live price,
cash is deducted, you can't overspend, selling returns cash and locks in a gain.

## Model

Storage is a trade log; everything else is derived.

    startingCash: number  (chosen on first run, editable in Settings)
    trades: [{ id, type: "buy"|"sell", ticker, shares, price, at, note, opening? }]

`portfolioFrom(trades, startingCash)` returns `{cash, positions, realized}`:

- cash = starting - buy costs + sell proceeds
- positions = net shares per ticker with weighted AVERAGE cost (not FIFO —
  average is explainable to a 12-year-old, which matters more here)
- realized = sum of (sell price - avg cost) x shares at each sell

Whole shares only: "I can only afford 17" is itself the lesson.
Trades execute at the latest daily close (what the free API tier gives).

## Screens

portfolio value -> watchlist (research) -> holdings -> history

Portfolio value = cash + market value of holdings, with the cash/invested split,
change vs starting, and change vs SPY over the same stretch (since first trade).

Buy sheet: ticker, live price, shares, live cost + cash-left, optional "why this
one?" note. Button disables when unaffordable and names the max.
Sell sheet: shares owned, live price, proceeds and realized gain previewed.

## Removed

- Manual "cost per share" and manual "price now" (superseded — you pay the live
  price at the moment you buy; `applyLivePrices` goes away)
- Hardcoded "Trending now" and "Market news": invented, dated Sept 2026. Fine in
  a toy, wrong in something students make decisions from.

## Migration

Old `stake.holdings.v1` positions become opening buys at their recorded cost,
flagged `opening: true` and labelled as such in history.

## Fix log (2026-09-26): "the buy button is not working"

Two causes, both real:

1. `syncBuy()` called `lookupTicker(tk, cb)`, which called `cb()` synchronously
   whenever a price refresh was already in flight. `cb` called `syncBuy()`,
   whose guard was still true, so it recursed until "Maximum call stack size
   exceeded" killed the handler. Replaced with `requestLookup()` +
   `drainLookup()`, which never call back synchronously and ask once per
   ticker. Regression test: tests/buy.test.js, "does not hang the page".
2. Without an API key there is no price, so Buy was permanently disabled with
   no way forward. The welcome sheet now asks for the key, and the buy sheet
   offers a link straight to Settings.

Added tests/harness.js (DOM shim) so these flows are testable without Chrome.
