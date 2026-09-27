// A DOM shim just big enough to run stake.html's script under Node, so the
// buy/sell flows can be exercised without a browser. Not a general DOM: it
// supports exactly what the page uses.
const fs = require("node:fs");
const path = require("node:path");

function makeEl(tag, id) {
  const el = {
    tag: tag || "div",
    id: id || "",
    value: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    open: false,
    tabIndex: 0,
    type: "",
    className: "",
    style: {},
    dataset: {},
    children: [],
    parent: null,
    _listeners: {},
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    setAttribute(k, v) { if (k === "open") this.open = true; this[k] = v; },
    removeAttribute(k) { if (k === "open") this.open = false; },
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    querySelectorAll(sel) {
      const want = sel.replace(/^\./, "");
      const out = [];
      (function walk(n) {
        n.children.forEach(function (c) {
          if (c.tag === want || String(c.className).split(/\s+/).indexOf(want) !== -1) out.push(c);
          walk(c);
        });
      })(this);
      return out;
    },
    closest(sel) {
      const want = sel.replace(/^\./, "");
      let n = this;
      while (n) {
        if (String(n.className).split(/\s+/).indexOf(want) !== -1) return n;
        n = n.parent;
      }
      return null;
    },
    focus() {}, select() {}, scrollIntoView() {},
    showModal() { this.open = true; },
    close() { this.open = false; },
  };
  el.classList = {
    toggle(c, on) {
      const parts = String(el.className).split(/\s+/).filter(Boolean);
      const i = parts.indexOf(c);
      if (on && i === -1) parts.push(c);
      if (!on && i !== -1) parts.splice(i, 1);
      el.className = parts.join(" ");
    },
  };
  Object.defineProperty(el, "innerHTML", {
    get() { return this._html || ""; },
    set(v) { this._html = v; this.children.length = 0; },
  });
  // Real DOM semantics: setting textContent replaces the children, reading it
  // concatenates all descendant text. Without this, text appended as a text
  // node (the watchlist chips do exactly that) reads back as "".
  Object.defineProperty(el, "textContent", {
    get() {
      if (this.children.length) {
        return this.children.map((c) => (c.textContent == null ? "" : c.textContent)).join("");
      }
      return this._text || "";
    },
    set(v) { this._text = String(v); this.children.length = 0; },
  });
  return el;
}

function dispatch(el, type, extra) {
  const ev = Object.assign({ type, target: el, preventDefault() {}, stopPropagation() {} }, extra || {});
  (el._listeners[type] || []).forEach(function (fn) { fn(ev); });
}

// storage: initial localStorage contents. fetchImpl: (url) => Promise
function loadPage(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(__dirname, "..", "stake.html"), "utf8");
  const store = new Map(Object.entries(opts.storage || {}));
  const pending = [];
  const els = new Map();

  // Only ids that really appear in the markup resolve, exactly as a browser
  // behaves — otherwise a test can assert against an element that does not
  // exist and pass for the wrong reason.
  const realIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const document = {
    getElementById(id) {
      if (!realIds.has(id)) return null;
      if (!els.has(id)) els.set(id, makeEl("div", id));
      return els.get(id);
    },
    createElement(tag) { return makeEl(tag, ""); },
    createTextNode(t) { return { tag: "#text", textContent: String(t), children: [], className: "" }; },
  };

  const window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    setTimeout: (fn, ms) => { pending.push(fn); return setTimeout(fn, ms); },
  };

  const calls = [];
  const fetchImpl = opts.fetch || function () { return new Promise(function () {}); };
  const fetch = function (url) { calls.push(url); return fetchImpl(url); };

  const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const run = new Function("document", "window", "fetch", "Promise", js);
  run(document, window, fetch, Promise);

  return {
    el: (id) => document.getElementById(id),
    dispatch,
    store,
    fetchCalls: calls,
    get: (id) => document.getElementById(id),
    // Sheets hand off to each other through setTimeout; run those now so a
    // test does not have to await real time.
    flush: () => { const q = pending.slice(); pending.length = 0; q.forEach((fn) => fn()); },
  };
}

// A Twelve Data style OK response with `n` daily bars ending today.
function bars(n, price) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const day = new Date(d.getTime() - i * 86400000).toISOString().slice(0, 10);
    out.push({ datetime: day, close: String(price - i * 0.1) });
  }
  return out;
}
function okResponse(n, price) {
  return Promise.resolve({ json: () => Promise.resolve({ status: "ok", values: bars(n || 300, price || 100) }) });
}

// All the text a node renders, whether it was built with textContent or with
// innerHTML (the shim does not parse HTML, so both have to be gathered).
// Tests use this instead of child indices so layout changes do not break them.
function textOf(el) {
  if (!el) return "";
  if (el.children && el.children.length) return el.children.map(textOf).join(" ");
  return String(el._html || el.textContent || "");
}

module.exports = { loadPage, dispatch, bars, okResponse, makeEl, textOf };
