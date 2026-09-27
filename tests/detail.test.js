// The stock detail view: a price chart with range buttons, reached by tapping
// a holding or a watchlist row.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage, textOf } = require("./harness");

const START_DATE = "2025-09-24";
const base = (extra) =>
  Object.assign({ "stake.trades.v1": "[]", "stake.starting.v1": "10000", "stake.date.v1": START_DATE }, extra || {});
const holding = JSON.stringify([
  { id: "t1", type: "buy", ticker: "AAPL", shares: 20, price: 252.31, at: "2025-09-24", note: "", opening: false },
]);

function openFromWatch(page) {
  const row = page.el("watchList").children[0];
  page.dispatch(row.children[0], "click");
  return row;
}

test("tapping a watchlist row opens that stock's detail view", () => {
  const page = loadPage({ storage: base({ "stake.watch.v1": '["NVDA"]' }) });
  openFromWatch(page);
  assert.equal(page.el("stockSheet").open, true);
  assert.equal(page.el("stockSym").textContent, "NVDA");
  assert.equal(page.el("stockName").textContent, "Nvidia");
  assert.match(page.el("stockPrice").textContent, /^\$\d/);
});

test("the detail view draws a price chart and offers every range", () => {
  const page = loadPage({ storage: base({ "stake.watch.v1": '["NVDA"]' }) });
  openFromWatch(page);
  assert.match(page.el("stockSvg").innerHTML, /<svg/);
  const labels = page.el("stockRanges").children.map((b) => b.textContent);
  assert.deepEqual(labels, ["1M", "6M", "1Y", "Max"]);
  assert.equal(page.el("stockRanges").children.filter((b) => b.className.includes("on")).length, 1);
});

test("choosing a shorter range redraws with fewer points", () => {
  const page = loadPage({ storage: base({ "stake.watch.v1": '["NVDA"]' }) });
  openFromWatch(page);
  const maxPts = (page.el("stockSvg").innerHTML.match(/L/g) || []).length;

  const oneMonth = page.el("stockRanges").children[0];
  page.dispatch(oneMonth, "click");
  const monthPts = (page.el("stockSvg").innerHTML.match(/L/g) || []).length;

  assert.ok(monthPts > 1, "a month of trading days should still plot");
  assert.ok(monthPts < maxPts, `1M (${monthPts}) should plot fewer days than Max (${maxPts})`);
  assert.equal(page.el("stockRanges").children[0].className.includes("on"), true);
});

test("four years of lookback sit behind the replay start, so 1Y has real data", () => {
  const page = loadPage({ storage: base({ "stake.watch.v1": '["NVDA"]' }) });
  openFromWatch(page);
  page.dispatch(page.el("stockRanges").children[2], "click"); // 1Y
  const pts = (page.el("stockSvg").innerHTML.match(/L/g) || []).length;
  assert.ok(pts > 200, `a year back from the replay start should plot ~250 days, got ${pts}`);
});

test("a holding's detail view shows the position and offers Sell", () => {
  const page = loadPage({ storage: base({ "stake.trades.v1": holding }) });
  page.dispatch(page.el("grid"), "click", { target: page.el("grid").children[0] });
  assert.equal(page.el("stockSheet").open, true);
  assert.equal(page.el("stockPos").hidden, false);
  assert.match(textOf(page.el("stockPos")), /You own .*20.* sh at an average of .*\$252\.31/);
  assert.equal(page.el("stockSell").hidden, false);
});

test("a stock you do not own offers Buy but not Sell", () => {
  const page = loadPage({ storage: base({ "stake.watch.v1": '["NVDA"]' }) });
  openFromWatch(page);
  assert.equal(page.el("stockPos").hidden, true);
  assert.equal(page.el("stockSell").hidden, true);
  assert.equal(page.el("stockBuy").disabled, false);
});

test("Buy in the detail view hands off to the buy sheet with the ticker filled", () => {
  const page = loadPage({ storage: base({ "stake.watch.v1": '["NVDA"]' }) });
  openFromWatch(page);
  page.dispatch(page.el("stockBuy"), "click");
  page.flush();
  assert.equal(page.el("buySheet").open, true);
  assert.equal(page.el("b-ticker").value, "NVDA");
});
