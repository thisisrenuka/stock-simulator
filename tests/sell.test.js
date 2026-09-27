// The sell flow, driven against the real stake.html script.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./harness");

// Day 265 is 2025-09-24; AAPL closes at $252.31. The student holds 10 bought
// at $200, so there is a real gain to lock in.
const HELD = {
  "stake.starting.v1": "10000",
  "stake.date.v1": "2025-09-24",
  "stake.watch.v1": "[]",
  "stake.trades.v1": JSON.stringify([
    { id: "t1", type: "buy", ticker: "AAPL", shares: 10, price: 200, at: "2025-09-24", note: "", opening: false },
  ]),
};

// Tapping a holding opens its detail view; Sell is reached from there.
function openSell(page) {
  const tile = page.el("grid").children[0];
  assert.ok(tile, "the holding should render a row");
  page.dispatch(page.el("grid"), "click", { target: tile });
  assert.equal(page.el("stockSheet").open, true, "the detail view opens first");
  page.dispatch(page.el("stockSell"), "click");
  page.flush();
  return tile;
}
function sellShares(page, n) {
  page.el("s-shares").value = String(n);
  page.dispatch(page.el("s-shares"), "input");
}

test("a holding tile opens the sell sheet with every share pre-filled", () => {
  const page = loadPage({ storage: HELD });
  openSell(page);
  assert.equal(page.el("sellSheet").open, true);
  assert.equal(page.el("s-shares").value, "10");
  assert.match(page.el("sellQuote").innerHTML, /\$252\.31/);
});

test("selling previews the proceeds and the locked-in gain", () => {
  const page = loadPage({ storage: HELD });
  openSell(page);
  sellShares(page, 4);
  assert.equal(page.el("sellProceeds").textContent, "$1,009.24", "4 x 252.31");
  assert.equal(page.el("sellGain").textContent, "$209.24", "4 x (252.31 - 200)");
  assert.equal(page.el("sellSubmit").disabled, false);
});

test("selling more than you own is refused", () => {
  const page = loadPage({ storage: HELD });
  openSell(page);
  sellShares(page, 99);
  assert.equal(page.el("sellSubmit").disabled, true);
  assert.match(page.el("sellErr").textContent, /only own 10/);
});

test("a completed sell returns the cash and logs the trade", () => {
  const page = loadPage({ storage: HELD });
  openSell(page);
  sellShares(page, 10);
  page.dispatch(page.el("sellForm"), "submit");

  const trades = JSON.parse(page.store.get("stake.trades.v1"));
  assert.equal(trades.length, 2);
  assert.deepEqual(
    { type: trades[1].type, n: trades[1].shares, p: trades[1].price, at: trades[1].at },
    { type: "sell", n: 10, p: 252.31, at: "2025-09-24" }
  );
  // started 10000, spent 2000, sold for 2523.10
  assert.match(page.el("splitSub").innerHTML, /10,523\.10/);
  assert.equal(page.el("grid").children.length, 0, "the position should be gone");
});

test("history lists the trades newest first", () => {
  const page = loadPage({ storage: HELD });
  openSell(page);
  sellShares(page, 10);
  page.dispatch(page.el("sellForm"), "submit");

  const rows = page.el("histList").children;
  assert.equal(rows.length, 2);
  assert.match(rows[0].children[0].children[0].textContent, /^Sold 10 AAPL/);
  assert.match(rows[1].children[0].children[0].textContent, /^Bought 10 AAPL/);
});
