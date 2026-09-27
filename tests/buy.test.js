// The buy flow, driven against the real stake.html script. Prices come from
// the baked replay data, so nothing here touches the network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage, textOf } = require("./harness");

// Day 265 is 2025-09-24, where the replay starts. AAPL closes at $252.31.
const START_DATE = "2025-09-24";
const base = (extra) => Object.assign({ "stake.trades.v1": "[]", "stake.starting.v1": "10000", "stake.date.v1": START_DATE }, extra || {});

function openBuy(page, tk, shares) {
  page.dispatch(page.el("buyBtn"), "click");
  page.el("b-ticker").value = tk;
  page.dispatch(page.el("b-ticker"), "change");
  if (shares !== undefined) {
    page.el("b-shares").value = String(shares);
    page.dispatch(page.el("b-shares"), "input");
  }
}

test("picking a ticker shows its price on the current replay day", () => {
  const page = loadPage({ storage: base() });
  openBuy(page, "AAPL");
  assert.match(page.el("buyQuote").innerHTML, /\$252\.31/);
  assert.match(page.el("buyQuote").innerHTML, /39 shares/, "10000 / 252.31 = 39 whole shares");
});

test("an affordable number of shares enables the Buy button", () => {
  const page = loadPage({ storage: base() });
  openBuy(page, "AAPL", 10);
  assert.equal(page.el("buySubmit").disabled, false);
  assert.equal(page.el("buyCost").textContent, "$2,523.10");
  assert.equal(page.el("buyLeft").textContent, "$7,476.90");
});

test("asking for more shares than the cash allows keeps Buy disabled and names the max", () => {
  const page = loadPage({ storage: base() });
  openBuy(page, "AAPL", 40);
  assert.equal(page.el("buySubmit").disabled, true);
  assert.match(page.el("buyErr").textContent, /39 shares max/);
});

test("a ticker outside the dataset says so instead of silently failing", () => {
  const page = loadPage({ storage: base() });
  openBuy(page, "ZZZZ", 1);
  assert.equal(page.el("buySubmit").disabled, true);
  assert.match(page.el("buyQuote").textContent, /not in this dataset/);
});

test("a completed buy lands in the trade log, dated to the replay day", () => {
  const page = loadPage({ storage: base() });
  openBuy(page, "AAPL", 10);
  page.dispatch(page.el("buyForm"), "submit");

  const trades = JSON.parse(page.store.get("stake.trades.v1"));
  assert.equal(trades.length, 1);
  assert.deepEqual(
    { t: trades[0].ticker, n: trades[0].shares, p: trades[0].price, at: trades[0].at, type: trades[0].type },
    { t: "AAPL", n: 10, p: 252.31, at: "2025-09-24", type: "buy" }
  );
  assert.match(page.el("splitSub").innerHTML, /7,476\.90/, "cash should drop by 10 x 252.31");
});

test("the watchlist shows one-day, one-month and one-year performance", () => {
  const page = loadPage({ storage: base({ "stake.watch.v1": '["AAPL"]' }) });
  const chips = page.el("watchList").children[0].querySelectorAll(".watch-chip");
  assert.equal(chips.length, 3);
  assert.deepEqual(chips.map((c) => c.children[0].textContent), ["1D", "1M", "1Y"]);
  chips.forEach((c) => assert.match(c.textContent, /%/, "each period should show a percentage"));
});
