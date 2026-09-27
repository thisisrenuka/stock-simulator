// The replay clock: advancing days moves real historical prices, which is the
// whole point of the simulator.
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage, textOf } = require("./harness");
const fs = require("node:fs");
const path = require("node:path");

// Real AAPL closes on consecutive trading days from the baked data:
// 2025-09-24 $252.31, 2025-09-25 $256.87, ... 2025-10-01 $255.45
const START_DATE = "2025-09-24";
const base = (extra) => Object.assign({ "stake.trades.v1": "[]", "stake.starting.v1": "10000" }, extra || {});
const holding10 = JSON.stringify([
  { id: "t1", type: "buy", ticker: "AAPL", shares: 10, price: 252.31, at: "2025-09-24", note: "", opening: false },
]);

test("a fresh run starts on the replay's first day", () => {
  const page = loadPage({ storage: base() });
  assert.match(page.el("clockDate").textContent, /Sep 24, 2025/);
  assert.match(page.el("clockProg").textContent, /day 1 of 253/);
});

test("advancing a day moves to the next trading day", () => {
  const page = loadPage({ storage: base({ "stake.date.v1": START_DATE, "stake.watch.v1": '["AAPL"]' }) });
  page.dispatch(page.el("nextDay"), "click");
  assert.match(page.el("clockDate").textContent, /Sep 25, 2025/);
  assert.match(page.el("clockProg").textContent, /day 2 of 253/);
  assert.match(textOf(page.el("watchList").children[0]), /\$256\.87/);
});

test("advancing a week skips five trading days, not five calendar days", () => {
  const page = loadPage({ storage: base({ "stake.date.v1": START_DATE }) });
  page.dispatch(page.el("nextWeek"), "click");
  // five trading days on from Wed 24 Sep is Wed 1 Oct, skipping the weekend
  assert.match(page.el("clockDate").textContent, /Oct 1, 2025/);
});

test("a holding gains value as the days advance", () => {
  const page = loadPage({ storage: base({ "stake.date.v1": START_DATE, "stake.trades.v1": holding10 }) });
  // bought 10 at 252.31, so nothing has moved yet
  assert.match(page.el("portfolioNum").textContent, /^\$10,000\.00$/);

  page.dispatch(page.el("nextDay"), "click");
  // 10 x (256.87 - 252.31) = 45.60
  assert.match(page.el("portfolioNum").textContent, /^\$10,045\.60$/);
  assert.match(page.el("changeSub").innerHTML, /\$45\.60/);
  assert.match(textOf(page.el("grid").children[0]), /\$45\.60/);
});

test("the day is remembered across a reload", () => {
  const page = loadPage({ storage: base({ "stake.date.v1": START_DATE }) });
  page.dispatch(page.el("nextDay"), "click");
  assert.equal(page.store.get("stake.date.v1"), "2025-09-25");

  const again = loadPage({ storage: Object.fromEntries(page.store) });
  assert.match(again.el("clockDate").textContent, /Sep 25, 2025/);
});

test("the replay stops at the present instead of running off the end", () => {
  const page = loadPage({ storage: base({ "stake.date.v1": "2026-09-23" }) });
  page.dispatch(page.el("nextWeek"), "click");
  assert.match(page.el("clockProg").textContent, /reached the present/);
  assert.equal(page.el("nextDay").disabled, true);
  assert.equal(page.el("nextWeek").disabled, true);
  assert.match(page.el("clockDate").textContent, /Sep 25, 2026/);
});

test("the S&P 500 comparison appears once there is a trade to compare", () => {
  const page = loadPage({ storage: base({ "stake.date.v1": START_DATE, "stake.trades.v1": holding10 }) });
  page.dispatch(page.el("nextWeek"), "click");
  assert.equal(page.el("benchSub").hidden, false);
  assert.match(page.el("benchSub").innerHTML, /S&amp;P 500: .*[+−]\d+\.\d%/);
});

test("a month jump moves about twenty-one trading days", () => {
  const page = loadPage({ storage: base({ "stake.date.v1": START_DATE }) });
  page.dispatch(page.el("nextMonth"), "click");
  assert.match(page.el("clockDate").textContent, /Oct 2[0-9], 2025/);
  assert.match(page.el("clockProg").textContent, /day 22 of 253/);
});

test("skipping to the end lands on the last day of the replay", () => {
  const page = loadPage({ storage: base({ "stake.date.v1": START_DATE }) });
  page.dispatch(page.el("skipEnd"), "click");
  assert.match(page.el("clockDate").textContent, /Sep 25, 2026/);
  assert.match(page.el("clockProg").textContent, /reached the present/);
  assert.equal(page.el("skipEnd").hidden, true, "nothing left to skip to");
});

test("every clock control moves forward, and none moves back", () => {
  const dayNum = (page) => Number(page.el("clockProg").textContent.match(/day (\d+)/)[1]);
  ["nextDay", "nextWeek", "nextMonth", "skipEnd"].forEach((id) => {
    const page = loadPage({ storage: base({ "stake.date.v1": START_DATE }) });
    const before = dayNum(page);
    page.dispatch(page.el(id), "click");
    const after = page.el("clockProg").textContent.match(/day (\d+)/);
    assert.ok(after === null || Number(after[1]) > before, id + " should not move backwards");
  });
});

test("the reason for forward-only is on screen while the replay is running", () => {
  const page = loadPage({ storage: base({ "stake.date.v1": START_DATE }) });
  assert.equal(page.el("clockNote").hidden, false);
  page.dispatch(page.el("skipEnd"), "click");
  assert.equal(page.el("clockNote").hidden, true, "nothing left to explain at the end");
});

test("a clock saved against the older, shorter calendar still lands on its own date", () => {
  // 465 was 2026-07-14 on the 518-day calendar this file used to ship with
  const page = loadPage({ storage: { "stake.trades.v1": "[]", "stake.starting.v1": "10000", "stake.day.v1": "465" } });
  assert.match(page.el("clockDate").textContent, /Jul 14, 2026/);
  assert.equal(page.store.get("stake.date.v1"), "2026-07-14", "and is rewritten as a date");
});

test("the page explains that time only moves forward", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "stake.html"), "utf8");
  assert.match(html, /Time only moves forward/);
  assert.match(html, /cannot go back and trade on a day you have already seen/);
});
