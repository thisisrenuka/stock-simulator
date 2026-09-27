// The portfolio chart: two series on one shared dollar scale.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./harness");

const START_DATE = "2025-09-24";
const held = JSON.stringify([
  { id: "t1", type: "buy", ticker: "AAPL", shares: 30, price: 252.31, at: "2025-09-24", note: "", opening: false },
]);
const base = (extra) => Object.assign({ "stake.starting.v1": "10000", "stake.date.v1": START_DATE }, extra || {});

test("there is no chart before anything has been bought", () => {
  const page = loadPage({ storage: base({ "stake.trades.v1": "[]" }) });
  page.dispatch(page.el("nextWeek"), "click");
  assert.equal(page.el("chart").hidden, true, "a flat line of untouched cash says nothing");
});

test("there is no chart on the very first day, with nothing to plot yet", () => {
  const page = loadPage({ storage: base({ "stake.trades.v1": held }) });
  assert.equal(page.el("chart").hidden, true);
});

test("the chart appears once the clock has moved past the first trade", () => {
  const page = loadPage({ storage: base({ "stake.trades.v1": held }) });
  page.dispatch(page.el("nextWeek"), "click");
  assert.equal(page.el("chart").hidden, false);
  const svg = page.el("chartSvg").innerHTML;
  assert.equal((svg.match(/<path/g) || []).length, 2, "your line and the benchmark, no more");
  assert.match(svg, /stroke="var\(--bench\)"/, "the benchmark is the recessive neutral");
  assert.match(svg, /aria-label="Your portfolio against the S and P 500/);
});

test("both series are named, so identity is never colour alone", () => {
  const page = loadPage({ storage: base({ "stake.trades.v1": held }) });
  page.dispatch(page.el("nextWeek"), "click");
  assert.match(page.el("chartFrom").innerHTML, /You/);
  assert.match(page.el("chartFrom").innerHTML, /S&amp;P 500/);
  assert.match(page.el("chartTo").textContent, /Sep 24, 2025 → Oct 1, 2025/);
});

test("a losing portfolio draws in the loss colour, a winning one in the gain colour", () => {
  const win = loadPage({ storage: base({ "stake.trades.v1": held, "stake.date.v1": START_DATE }) });
  for (let i = 0; i < 60; i++) win.dispatch(win.el("nextWeek"), "click");
  assert.match(win.el("chartSvg").innerHTML, /stroke="var\(--gain\)" stroke-width="2"/);

  // LCID fell hard over this stretch, so the same starting cash ends lower
  const lose = loadPage({
    storage: base({
      "stake.trades.v1": JSON.stringify([
        { id: "t1", type: "buy", ticker: "LCID", shares: 400, price: 21.4, at: "2025-09-24", note: "", opening: false },
      ]),
    }),
  });
  for (let i = 0; i < 60; i++) lose.dispatch(lose.el("nextWeek"), "click");
  assert.match(lose.el("chartSvg").innerHTML, /stroke="var\(--loss\)" stroke-width="2"/);
});

test("holdings rows carry a sparkline once there is history behind them", () => {
  const page = loadPage({ storage: base({ "stake.trades.v1": held }) });
  page.dispatch(page.el("nextWeek"), "click");
  const row = page.el("grid").children[0];
  const spark = row.children[1].innerHTML;
  assert.match(spark, /<svg class="row-spark"/);
  assert.match(spark, /stroke-width="1\.5"/, "sparklines stay thin");
});
