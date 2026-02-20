  "use strict";

  /******************************************************************
   *                    🔧 DOM SHORTCUTS & HELPERS
   ******************************************************************/
  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
const DEBUG_TARGET_ONLY = true; // <- quand true, on n'affiche QUE le nom du jeu à deviner

  const EVENTS_KEY     = "jbs.events.v1";
  const LAST_SETUP_KEY = "gtg.lastSetup.v1";
  const SB_PWD_KEY     = "sb_ws_password_v1";
  // Tipeee (Events tab) local persistence
  const TIPEEE_APIKEY_KEY = "jbs.tipeee.apiKey.v1";
  const TIPEEE_SLUG_KEY   = "jbs.tipeee.slug.v1";
  const TIPEEE_AUTO_KEY   = "jbs.tipeee.autoconnect.v1";
  const MAX_EVENTS     = 100;

  const isNum = (n)=> typeof n === 'number' && Number.isFinite(n);
  const makeNonce = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);

  // Small DOM helper used across modules
  // - accepts a selector string or an element
  // - never throws if target is missing
  function setText(target, text){
    let el = null;
    if (typeof target === "string") el = $(target);
    else el = target;
    if (!el) return;
    el.textContent = (text == null) ? "" : String(text);
  }

  // Debug verbose (session only, no persistence)
  let DEBUG_VERBOSE = false;

  function getStoredPwd(){ try { return localStorage.getItem(SB_PWD_KEY) || ""; } catch { return ""; } }
  function setStoredPwd(v){ try { localStorage.setItem(SB_PWD_KEY, v || ""); } catch {} }

  // ---- Tipeee settings (localStorage)
  function getStoredTipeeeApiKey(){ try { return localStorage.getItem(TIPEEE_APIKEY_KEY) || ""; } catch { return ""; } }
  function setStoredTipeeeApiKey(v){ try { localStorage.setItem(TIPEEE_APIKEY_KEY, String(v || "")); } catch {} }

  function getStoredTipeeeSlug(){ try { return localStorage.getItem(TIPEEE_SLUG_KEY) || ""; } catch { return ""; } }
  function setStoredTipeeeSlug(v){ try { localStorage.setItem(TIPEEE_SLUG_KEY, String(v || "")); } catch {} }

  function getStoredTipeeeAuto(){
    try { return (localStorage.getItem(TIPEEE_AUTO_KEY) || "0") === "1"; }
    catch { return false; }
  }
  function setStoredTipeeeAuto(v){
    try { localStorage.setItem(TIPEEE_AUTO_KEY, v ? "1" : "0"); }
    catch {}
  }
  function getQS(name){ try { return new URLSearchParams(location.search).get(name); } catch { return null; } }

  function appendLog(sel, text){
    const el = $(sel); if (!el) return;
    const ts = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    const p = document.createElement('p');
    p.textContent = "[${ts}] ".replace("${ts}", ts) + text;
    el.appendChild(p);
    el.scrollTop = el.scrollHeight;
  }

function appendLogDebug(tag, obj){
  if (!DEBUG_VERBOSE) return;

  // Mode strict : on n'affiche QUE le nom du jeu à deviner
  if (typeof DEBUG_TARGET_ONLY !== "undefined" && DEBUG_TARGET_ONLY) {
    if (tag !== "target") return;
  }

  let line = `DEBUG: ${tag}`;
  if (obj !== undefined) {
    try {
      line += (typeof obj === "string")
        ? " " + obj
        : " " + JSON.stringify(obj, replacerNoHuge, 0);
    } catch {}
  }
  appendLog("#guess-log", line);
}



  function replacerNoHuge(_k, v){
    if (typeof v === "string" && v.length > 500) return v.slice(0,500) + "…";
    return v;
  }

  function setDot(selector, on){
    $$(selector).forEach(el => {
      el.classList.remove("on","off");
      el.classList.add(on ? "on" : "off");
    });
  }

  function setStatusText(txt){
    $$("#guess-status-text, #gtg-status-text, #guess-status-info, #qv-guess-status").forEach(el => {
      if (el) setText(el, txt);
    });
  }

  function setTimerText(txt){
    $$("#guess-timer, #gtg-timer").forEach(el => { el.textContent = txt; });
  }

  function setRoundNote(running){
    const txt = running ? "Manche lancée" : "Manche terminée";
    let targets = $$("#guess-round-note, #gtg-round-note, .round-note");
    if (!targets.length) {
      const scope = $("#guess-start")?.closest("#filters, .filters, form, .panel, .card, section") || document;
      const candidates = Array.from(scope.querySelectorAll("small, .muted, .hint, span, div"))
        .filter(el => el && typeof el.textContent === "string");
      const m = candidates.find(el => /manche\s+(lancée|terminée)/i.test(el.textContent.trim()));
      if (m) targets = [m];
    }
    targets.forEach(el => { el.textContent = txt; });
    document.body.dataset.round = running ? "running" : "ended";
  }

  /* ====== Nouveaux états & helpers pour Score global / Annulation / Gagnant ====== */
  let GTG_TOTALS = { streamer: 0, viewers: 0 };
  let GTG_GOAL   = null;

  let GTG_PARTIE_ACTIVE = false;

  function setPartieActive(active){
    GTG_PARTIE_ACTIVE = !!active;
    refreshCancelAbility();
  }

  function renderGlobalScore(totals, goal){
    const s   = $("#qv-score-streamer") || $("#score-streamer") || $("#score-streamer-val") || $("#gtg-score-streamer");
    const v   = $("#qv-score-viewers")  || $("#score-viewers")  || $("#score-viewers-val") || $("#gtg-score-viewers");
    const gEl = $("#qv-goal-score")     || $("#goal-score-badge") || $("#score-goal-val") || $("#gtg-goal-score");

    if (s) setText(s, String(Number.isFinite(totals?.streamer) ? totals.streamer : 0));
    if (v) setText(v, String(Number.isFinite(totals?.viewers)  ? totals.viewers  : 0));
    if (gEl) setText(gEl, Number.isFinite(goal) ? String(goal) : "—");
  }

  function setWinnerLabel(label){
    const w = $("#guess-winner");
    if (w) setText(w, label && String(label).trim() ? String(label) : "—");
  }

  function refreshCancelAbility(){
    const btn = $("#gtg-series-cancel");
    if (!btn) return;
    const canCancel = (GTG_PARTIE_ACTIVE || GTG_RUNNING)
      && Number.isFinite(GTG_GOAL)
      && (GTG_TOTALS.streamer < GTG_GOAL && GTG_TOTALS.viewers < GTG_GOAL);
    btn.disabled = !canCancel;
  }

  // ——— Helpers partie / objectif ———
  function setGoalScoreUI(goal){
    const t = $("#gtg-target-score");
    if (t && Number.isFinite(goal)) t.value = String(goal);
    const badges = $$(".goal-score, #qv-goal-score, #goal-score-badge, #gtg-goal-score");
    badges.forEach(b => b.textContent = Number.isFinite(goal) ? String(goal) : "—");
    GTG_GOAL = Number.isFinite(goal) ? goal : null;
    renderGlobalScore(GTG_TOTALS, GTG_GOAL);
    refreshCancelAbility();
  }
  function setPartieIdUI(pid){
    const els = $$("#partie-id, #qv-partie-id");
    els.forEach(e => { e.textContent = pid || "—"; });
  }

  // ——— Sous-manche / Manches par jeu ———
  function renderPerGame(index, goal){
    const note = $("#gtg-pergame-note");
    const st   = $("#gtg-pergame-status");
    const idx  = Number.isFinite(index) ? Math.max(1, Math.min(5, Math.trunc(index))) : null;
    const cap  = Number.isFinite(goal)  ? Math.max(1, Math.min(5, Math.trunc(goal)))  : null;
    const text = (idx && cap) ? `${idx} / ${cap}` : "—";
    if (note) setText(note, `Sous-manche : ${text}`);
    if (st) setText(st, text);
  }


// ===========================
// GTG : Zoom auto preview (UI only)
// ===========================
const GTG_ZOOM_PREVIEW_MAP = {
  1: ["x2"],
  2: ["x2.5", "x2"],
  3: ["x3.3", "x2.5", "x2"],
  4: ["x5", "x3.3", "x2.5", "x2"],
  5: ["x10", "x5", "x3.3", "x2.5", "x2"]
};

function updateZoomPreview(perGameGoal){
  const el = document.getElementById("gtg-zoom-preview");
  if (!el) return;

  const v = Number(perGameGoal);
  const goal = Number.isFinite(v) ? Math.max(1, Math.min(5, Math.trunc(v))) : 1;

  const seq = GTG_ZOOM_PREVIEW_MAP[goal];
  el.textContent = seq ? ("Zoom auto : " + seq.join(" → ")) : "Zoom auto : —";
}


  function setLockVisual(){
    const btn = $("#lock-btn"); if (!btn) return;
    const hasPwd = !!getStoredPwd();
    btn.classList.toggle("locked", hasPwd);
    btn.title = hasPwd ? "Mot de passe défini (clic pour modifier, clic droit pour effacer)" : "Définir le mot de passe Streamer.bot";
  }

  function bindLockButton(){
    const btn = $("#lock-btn"); if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener("click", (ev)=>{
      ev.preventDefault();
      const current = getStoredPwd();
      const val = window.prompt("Mot de passe Streamer.bot (laisser vide pour effacer) :", current);
      if (val === null) return;
      setStoredPwd(val || "");
      setLockVisual();
      reconnectSB();
    });
    btn.addEventListener("contextmenu", (ev)=>{
      ev.preventDefault();
      setStoredPwd("");
      setLockVisual();
      reconnectSB();
    });
    setLockVisual();
  }


// --- RAW PAYLOAD LOGGING (can be noisy) -------------------------------------
function safeJsonStringify(obj, space = 2, maxLen = 25000){
  // Handles circular refs and truncates to keep UI responsive
  const seen = new WeakSet();
  let s = "";
  try {
    s = JSON.stringify(obj, (k, v) => {
      // Best-effort redaction of obvious secrets (still logs "everything else")
      if (typeof k === "string" && /(token|api[_-]?key|secret|password)/i.test(k)) return "[REDACTED]";
      if (v && typeof v === "object") {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    }, space);
  } catch (e) {
    try { s = String(obj); } catch { s = "[Unstringifiable]"; }
  }
  if (typeof s === "string" && s.length > maxLen) {
    s = s.slice(0, maxLen) + "\n…[TRUNCATED]…";
  }
  return s;
}

// --- RAW PAYLOAD DEBUG -> CONSOLE -------------------------------------------
// Keeps Journal readable: events are summarized in UI, full payloads go to DevTools.
function logPayloadToConsole(label, payload){
  try {
    if (console.groupCollapsed) console.groupCollapsed(label);
    console.log(payload);
    if (console.groupEnd) console.groupEnd();
  } catch (e) {
    try { console.log(label, payload); } catch {}
  }
}
