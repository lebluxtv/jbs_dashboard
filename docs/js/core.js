(function () {
  "use strict";

  if (window.JBSDashboard && window.JBSDashboard.__coreLoaded) return;

  const $  = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

  function setText(el, txt) {
    if (!el) return;
    el.textContent = (txt == null) ? "" : String(txt);
  }

  const EVENTS_KEY     = "jbs.events.v1";
  const LAST_SETUP_KEY = "gtg.lastSetup.v1";
  const SB_PWD_KEY     = "sb_ws_password_v1";
  const MAX_EVENTS     = 100;

  const isNum = (n) => typeof n === "number" && Number.isFinite(n);
  const makeNonce = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const DEBUG_TARGET_ONLY = true;
  let DEBUG_VERBOSE = false;

  function replacerNoHuge(_k, v) {
    if (typeof v === "string" && v.length > 500) return v.slice(0, 500) + "…";
    return v;
  }

  function getStoredPwd() {
    try { return localStorage.getItem(SB_PWD_KEY) || ""; } catch { return ""; }
  }
  function setStoredPwd(v) {
    try { localStorage.setItem(SB_PWD_KEY, v || ""); } catch {}
  }
  function getQS(name) {
    try { return new URLSearchParams(location.search).get(name); } catch { return null; }
  }

  function appendLog(sel, text) {
    const el = $(sel); if (!el) return;
    const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const p = document.createElement("p");
    p.textContent = `[${ts}] ${text}`;
    el.appendChild(p);
    el.scrollTop = el.scrollHeight;
  }

  function appendLogDebug(tag, obj) {
    if (!DEBUG_VERBOSE) return;

    if (DEBUG_TARGET_ONLY) {
      if (tag !== "target") return;
    }

    let line = `DEBUG: ${tag}`;
    if (obj !== undefined) {
      try {
        line += (typeof obj === "string") ? (" " + obj) : (" " + JSON.stringify(obj, replacerNoHuge, 0));
      } catch {}
    }
    appendLog("#guess-log", line);
  }

  function setDot(selector, on) {
    $$(selector).forEach(el => {
      el.classList.remove("on", "off");
      el.classList.add(on ? "on" : "off");
    });
  }

  // Mini event bus
  const _bus = new Map();
  function busOn(evt, fn) {
    if (!evt || typeof fn !== "function") return () => {};
    if (!_bus.has(evt)) _bus.set(evt, new Set());
    _bus.get(evt).add(fn);
    return () => { try { _bus.get(evt)?.delete(fn); } catch {} };
  }
  function busEmit(evt, payload) {
    const set = _bus.get(evt);
    if (!set || !set.size) return;
    for (const fn of Array.from(set)) { try { fn(payload); } catch {} }
  }

  window.JBSDashboard = Object.assign(window.JBSDashboard || {}, {
    __coreLoaded: true,
    state: Object.assign({ sbClient: null, isConnected: false }, (window.JBSDashboard && window.JBSDashboard.state) || {}),
    consts: { EVENTS_KEY, LAST_SETUP_KEY, SB_PWD_KEY, MAX_EVENTS },
    utils: { $, $$, setText, setDot, appendLog, appendLogDebug, isNum, makeNonce, getQS, getStoredPwd, setStoredPwd },
    debug: {
      get verbose() { return DEBUG_VERBOSE; },
      set verbose(v) { DEBUG_VERBOSE = !!v; },
      targetOnly: DEBUG_TARGET_ONLY
    },
    bus: { on: busOn, emit: busEmit }
  });

  // Compat globals (temporary)
  window.$  = window.$  || $;
  window.$$ = window.$$ || $$;
  window.appendLog = window.appendLog || appendLog;
  window.appendLogDebug = window.appendLogDebug || appendLogDebug;
  window.getQS = window.getQS || getQS;
  window.getStoredPwd = window.getStoredPwd || getStoredPwd;
  window.setStoredPwd = window.setStoredPwd || setStoredPwd;
  window.setText = window.setText || setText;
  window.setDot = window.setDot || setDot;

})();
