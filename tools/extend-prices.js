// Extends the prices baked into stake.html up to the latest market close.
//
//   node tools/extend-prices.js            # fetch through today
//   node tools/extend-prices.js 2026-10-02 # fetch through a given date
//
// Fetches each ticker's daily closes from Nasdaq for the days after the last
// date in DATES, then appends them to DATES and SERIES in place. The existing
// history is never rewritten. A new day joins the calendar only when at least
// 80% of tickers traded on it; a ticker missing that day carries its previous
// close forward, as the original build did.
//
// Nasdaq's API sends no CORS header, which is why this is a build step and not
// something the page can do at runtime.
"use strict";

var fs = require("fs");
var path = require("path");

var FILE = path.join(__dirname, "..", "stake.html");
var html = fs.readFileSync(FILE, "utf8");

function grab(re, what) {
  var m = html.match(re);
  if (!m) throw new Error("could not find " + what + " in stake.html");
  return m;
}

var datesM = grab(/var DATES = "([^"]*)"/, "DATES");
var seriesM = grab(/var SERIES = (\{[^\n]*\});/, "SERIES");
var DATES = datesM[1].split(",");
var SERIES = JSON.parse(seriesM[1]);
var TICKERS = Object.keys(SERIES);

var last = DATES[DATES.length - 1];
var until = process.argv[2] || new Date().toISOString().slice(0, 10);

function dayAfter(iso) {
  var d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function toIso(us) { // "10/02/2026" -> "2026-10-02"
  var p = us.split("/");
  return p[2] + "-" + p[0] + "-" + p[1];
}

function toCents(s) { return Math.round(Number(String(s).replace(/[$,]/g, "")) * 100); }

function fetchClass(tk, assetclass, from) {
  var url = "https://api.nasdaq.com/api/quote/" + encodeURIComponent(tk) +
    "/historical?assetclass=" + assetclass + "&fromdate=" + from + "&todate=" + until + "&limit=9999";
  return fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      var rows = j && j.data && j.data.tradesTable && j.data.tradesTable.rows;
      if (!rows || !rows.length) return null;
      var out = {};
      rows.forEach(function (row) { out[toIso(row.date)] = toCents(row.close); });
      return out;
    })
    .catch(function () { return null; });
}

// Fetch from the last baked day (not the day after) so the overlap can be
// checked against what is already in the file.
function fetchTicker(tk) {
  return fetchClass(tk, "stocks", last).then(function (got) {
    return got || fetchClass(tk, "etf", last);
  });
}

function main() {
  if (until <= last) {
    console.log("Already current: data runs to " + last + ".");
    return Promise.resolve();
  }
  console.log("Fetching " + TICKERS.length + " tickers, " + dayAfter(last) + " -> " + until);

  var fetched = {};
  var queue = TICKERS.slice();
  function worker() {
    var tk = queue.shift();
    if (!tk) return Promise.resolve();
    return fetchTicker(tk).then(function (got) { fetched[tk] = got; return worker(); });
  }
  var workers = [];
  for (var w = 0; w < 6; w++) workers.push(worker());

  return Promise.all(workers).then(function () {
    var missing = TICKERS.filter(function (tk) { return !fetched[tk]; });
    if (missing.length) console.warn("No data for: " + missing.join(", "));

    // The overlap day must agree with the file, or the source has changed
    // under us (a split, a different share class) and appending would splice
    // two different price histories together.
    var mismatched = TICKERS.filter(function (tk) {
      var got = fetched[tk];
      if (!got || got[last] === undefined) return false;
      var have = Number(SERIES[tk].split(",").pop());
      return Math.abs(got[last] - have) > 1;
    });
    if (mismatched.length) {
      throw new Error("Close on " + last + " disagrees with the file for: " + mismatched.join(", ") +
        ". Not appending; check for splits before re-running.");
    }

    var counts = {};
    TICKERS.forEach(function (tk) {
      Object.keys(fetched[tk] || {}).forEach(function (d) {
        if (d > last && d <= until) counts[d] = (counts[d] || 0) + 1;
      });
    });
    var newDates = Object.keys(counts).filter(function (d) {
      return counts[d] >= TICKERS.length * 0.8;
    }).sort();
    if (!newDates.length) {
      console.log("No new trading days after " + last + ".");
      return;
    }

    TICKERS.forEach(function (tk) {
      var prev = Number(SERIES[tk].split(",").pop());
      var add = newDates.map(function (d) {
        var c = fetched[tk] && fetched[tk][d];
        if (c) prev = c;
        return prev;
      });
      SERIES[tk] += "," + add.join(",");
    });
    DATES = DATES.concat(newDates);

    var out = html
      .replace(datesM[0], function () { return 'var DATES = "' + DATES.join(",") + '"'; })
      .replace(seriesM[0], function () { return "var SERIES = " + JSON.stringify(SERIES) + ";"; });
    fs.writeFileSync(FILE, out);
    console.log("Added " + newDates.length + " days: " + newDates.join(", "));
    console.log("Calendar now " + DATES.length + " days, " + DATES[0] + " -> " + DATES[DATES.length - 1]);
  });
}

main().catch(function (e) { console.error(e.message); process.exit(1); });
