// The historical-replay core: prices are baked into the page as forward-ordered
// series aligned to a shared trading-day calendar, and the student advances a
// day index through them. Extracted from the @replay block in stake.html.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function loadCore() {
  const html = fs.readFileSync(path.join(__dirname, "..", "stake.html"), "utf8");
  const m = html.match(/\/\* @replay-start \*\/([\s\S]*?)\/\* @replay-end \*\//);
  assert.ok(m, "stake.html has no @replay-start/@replay-end block");
  return new Function(m[1] +
    "\nreturn { perfAt: perfAt, seriesFrom: seriesFrom, rangeFrom: rangeFrom, clockIndex: clockIndex };")();
}

// A calendar with a known shape: one bar per day for 400 days ending 2026-09-25.
function calendar(n) {
  const out = [];
  const end = Date.parse("2026-09-25T00:00:00Z");
  for (let i = n - 1; i >= 0; i--) out.push(new Date(end - i * 86400000).toISOString().slice(0, 10));
  return out;
}

test("performance on day zero has nothing to compare against", () => {
  const { perfAt } = loadCore();
  const r = perfAt([100, 110, 120], calendar(3), 0);
  assert.equal(r.price, 100);
  assert.equal(r.asOf, calendar(3)[0]);
  assert.equal(r.d1, null);
  assert.equal(r.m1, null);
  assert.equal(r.y1, null);
});

test("one-day performance compares against the previous trading day", () => {
  const { perfAt } = loadCore();
  const r = perfAt([100, 110], calendar(2), 1);
  assert.equal(r.price, 110);
  assert.equal(r.d1, 10);
});

test("one-month performance uses the last day on or before thirty days earlier", () => {
  const { perfAt } = loadCore();
  const dates = calendar(40);
  const series = dates.map(function (_, i) { return i === 9 ? 100 : 1; });
  series[39] = 120;
  // day 39 is 2026-09-25; thirty days earlier is 2026-08-26, which is index 9
  const r = perfAt(series, dates, 39);
  assert.equal(dates[9], "2026-08-26");
  assert.equal(r.m1, 20);
});

test("one-year performance uses the last day on or before a year earlier", () => {
  const { perfAt } = loadCore();
  const dates = calendar(400);
  const series = dates.map(function () { return 1; });
  const target = dates.indexOf("2025-09-25");
  assert.ok(target > 0, "the calendar should reach a year back");
  series[target] = 200;
  series[399] = 300;
  const r = perfAt(series, dates, 399);
  assert.equal(r.y1, 50);
});

test("one-year performance falls back to the oldest day when history is short", () => {
  const { perfAt } = loadCore();
  const dates = calendar(5);
  const r = perfAt([100, 1, 1, 1, 150], dates, 4);
  assert.equal(r.y1, 50);
});

test("a gap in the calendar resolves to the nearest earlier day", () => {
  const { perfAt } = loadCore();
  // Friday then Monday: a weekend gap, so "one day ago" is the Friday.
  const dates = ["2026-09-18", "2026-09-21"];
  const r = perfAt([100, 150], dates, 1);
  assert.equal(r.d1, 50);
});

test("a missing or out-of-range series reads as no price rather than throwing", () => {
  const { perfAt } = loadCore();
  assert.equal(perfAt(null, calendar(3), 1), null);
  assert.equal(perfAt([], calendar(3), 1), null);
  assert.equal(perfAt([100, 110], calendar(2), 9), null);
});

test("seriesFrom decodes the baked cent-integer encoding into dollars", () => {
  const { seriesFrom } = loadCore();
  assert.deepEqual(seriesFrom("10000,22277,34107"), [100, 222.77, 341.07]);
  assert.deepEqual(seriesFrom(""), []);
});

// ---- chart range windows ----

test("a one-month range starts at the last day on or before thirty days back", () => {
  const { rangeFrom } = loadCore();
  const dates = calendar(400);
  const i = 399;
  const j = rangeFrom(dates, i, "1M");
  assert.equal(dates[j], "2026-08-26");
});

test("a one-year range starts a year back", () => {
  const { rangeFrom } = loadCore();
  const dates = calendar(400);
  assert.equal(dates[rangeFrom(dates, 399, "1Y")], "2025-09-25");
});

test("the max range starts at the oldest day there is", () => {
  const { rangeFrom } = loadCore();
  assert.equal(rangeFrom(calendar(400), 399, "MAX"), 0);
});

test("a range longer than the available history clamps to the oldest day", () => {
  const { rangeFrom } = loadCore();
  assert.equal(rangeFrom(calendar(10), 9, "1Y"), 0, "ten days of history cannot show a year");
});

// ---- resolving the saved clock ----

test("a saved date resolves to its own day on the calendar", () => {
  const { clockIndex } = loadCore();
  const dates = ["2026-01-02", "2026-01-05", "2026-01-06"];
  assert.equal(clockIndex({ date: "2026-01-05" }, dates, null, 0), 1);
});

test("a saved index from an older, shorter calendar migrates by date", () => {
  const { clockIndex } = loadCore();
  const legacy = ["2026-01-05", "2026-01-06"];
  const dates = ["2025-12-30", "2026-01-02", "2026-01-05", "2026-01-06"];
  // index 1 meant 2026-01-06 on the old calendar; it is index 3 on the new one
  assert.equal(clockIndex({ index: 1 }, dates, legacy, 0), 3);
});

test("an unresolvable saved clock falls back to the replay start", () => {
  const { clockIndex } = loadCore();
  const dates = ["2026-01-02", "2026-01-05"];
  assert.equal(clockIndex({ date: "1999-01-01" }, dates, null, 1), 1);
  assert.equal(clockIndex({}, dates, null, 1), 1);
  assert.equal(clockIndex({ index: 99 }, dates, ["2026-01-02"], 1), 1);
});
