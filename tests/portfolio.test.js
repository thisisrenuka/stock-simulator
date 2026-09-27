// Runs the pure simulator core that lives inline in stake.html between the
// /* @portfolio-start */ and /* @portfolio-end */ markers.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function loadCore() {
  const html = fs.readFileSync(path.join(__dirname, "..", "stake.html"), "utf8");
  const m = html.match(/\/\* @portfolio-start \*\/([\s\S]*?)\/\* @portfolio-end \*\//);
  assert.ok(m, "stake.html has no @portfolio-start/@portfolio-end block");
  return new Function(m[1] +
    "\nreturn { portfolioFrom: portfolioFrom, maxAffordable: maxAffordable, migrateHoldings: migrateHoldings };")();
}

let n = 0;
const buy = (ticker, shares, price) => ({ id: "t" + ++n, type: "buy", ticker, shares, price, at: "2026-09-01" });
const sell = (ticker, shares, price) => ({ id: "t" + ++n, type: "sell", ticker, shares, price, at: "2026-09-02" });
const held = (p, ticker) => p.positions.filter((x) => x.ticker === ticker)[0];

test("no trades leaves the full starting cash and no positions", () => {
  const { portfolioFrom } = loadCore();
  const p = portfolioFrom([], 10000);
  assert.equal(p.cash, 10000);
  assert.deepEqual(p.positions, []);
  assert.equal(p.realized, 0);
});

test("a buy costs cash and sets average cost to the price paid", () => {
  const { portfolioFrom } = loadCore();
  const p = portfolioFrom([buy("AAPL", 10, 100)], 10000);
  assert.equal(p.cash, 9000);
  assert.equal(held(p, "AAPL").shares, 10);
  assert.equal(held(p, "AAPL").avgCost, 100);
  assert.equal(p.realized, 0);
});

test("two buys at different prices give a weighted average cost", () => {
  const { portfolioFrom } = loadCore();
  const p = portfolioFrom([buy("NVDA", 5, 10), buy("NVDA", 5, 20)], 10000);
  assert.equal(p.cash, 9850);
  assert.equal(held(p, "NVDA").shares, 10);
  assert.equal(held(p, "NVDA").avgCost, 15);
});

test("selling everything returns cash, records the gain, and drops the position", () => {
  const { portfolioFrom } = loadCore();
  const p = portfolioFrom([buy("MSFT", 10, 50), sell("MSFT", 10, 60)], 1000);
  assert.equal(p.cash, 1100);
  assert.equal(p.realized, 100);
  assert.equal(held(p, "MSFT"), undefined);
});

test("a partial sell keeps the average cost and realizes only the sold portion", () => {
  const { portfolioFrom } = loadCore();
  const p = portfolioFrom([buy("MSFT", 10, 50), sell("MSFT", 4, 60)], 1000);
  assert.equal(p.cash, 740);
  assert.equal(p.realized, 40);
  assert.equal(held(p, "MSFT").shares, 6);
  assert.equal(held(p, "MSFT").avgCost, 50);
});

test("a sell is capped at the shares actually owned", () => {
  const { portfolioFrom } = loadCore();
  const p = portfolioFrom([buy("F", 5, 10), sell("F", 100, 20)], 1000);
  assert.equal(p.cash, 1050);
  assert.equal(p.realized, 50);
  assert.equal(held(p, "F"), undefined);
});

test("buying again after selling out starts a fresh average cost", () => {
  const { portfolioFrom } = loadCore();
  const p = portfolioFrom([buy("T", 10, 50), sell("T", 10, 60), buy("T", 5, 100)], 1000);
  assert.equal(p.cash, 600);
  assert.equal(p.realized, 100);
  assert.equal(held(p, "T").shares, 5);
  assert.equal(held(p, "T").avgCost, 100);
});

test("a realized loss is negative", () => {
  const { portfolioFrom } = loadCore();
  const p = portfolioFrom([buy("PFE", 10, 40), sell("PFE", 10, 25)], 1000);
  assert.equal(p.realized, -150);
});

test("maxAffordable buys whole shares only", () => {
  const { maxAffordable } = loadCore();
  assert.equal(maxAffordable(1000, 341.07), 2);
  assert.equal(maxAffordable(1000, 100), 10);
});

test("maxAffordable is zero when one share is out of reach", () => {
  const { maxAffordable } = loadCore();
  assert.equal(maxAffordable(100, 341.07), 0);
  assert.equal(maxAffordable(0, 10), 0);
  assert.equal(maxAffordable(1000, 0), 0);
});

test("old hand-entered holdings migrate to opening buys at their recorded cost", () => {
  const { migrateHoldings, portfolioFrom } = loadCore();
  const trades = migrateHoldings([{ id: "h1", ticker: "ONON", shares: 5, cost: 35, price: 45 }]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].type, "buy");
  assert.equal(trades[0].ticker, "ONON");
  assert.equal(trades[0].shares, 5);
  assert.equal(trades[0].price, 35);
  assert.equal(trades[0].opening, true);
  const p = portfolioFrom(trades, 10000);
  assert.equal(p.cash, 9825);
  assert.equal(held(p, "ONON").avgCost, 35);
});

test("migrateHoldings drops junk rows", () => {
  const { migrateHoldings } = loadCore();
  assert.deepEqual(migrateHoldings(null), []);
  assert.deepEqual(migrateHoldings([{ ticker: "", shares: 5, cost: 1 }]), []);
  assert.deepEqual(migrateHoldings([{ ticker: "X", shares: 0, cost: 1 }]), []);
});
