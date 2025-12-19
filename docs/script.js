(function () { 
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
  const MAX_EVENTS     = 100;

  const isNum = (n)=> typeof n === 'number' && Number.isFinite(n);
  const makeNonce = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);

  // Debug verbose (session only, no persistence)
  let DEBUG_VERBOSE = false;

  function getStoredPwd(){ try { return localStorage.getItem(SB_PWD_KEY) || ""; } catch { return ""; } }
  function setStoredPwd(v){ try { localStorage.setItem(SB_PWD_KEY, v || ""); } catch {} }
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
    const canCancel = GTG_RUNNING
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

  /******************************************************************
   *                     📦 EVENTS (Twitch subs)
   ******************************************************************/
  function loadEvents(){ try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]") || []; } catch { return []; } }
  function saveEvents(list){ try { localStorage.setItem(EVENTS_KEY, JSON.stringify((list || []).slice(-MAX_EVENTS))); } catch {} }

  let eventsStore = loadEvents();
  let qvUnreadEvents = eventsStore.filter(e => !e.ack).length;

  function eventLine(e){
    if (e.type === "GiftBomb") {
      const n = isNum(e.giftCount) ? e.giftCount : (Array.isArray(e.recipients) ? e.recipients.length : 0);
      const recShort = Array.isArray(e.recipients)
        ? e.recipients.slice(0,5).join(", ") + (e.recipients.length > 5 ? "…" : "")
        : "";
      return `<strong>${e.user}</strong> — Gift Bomb <span class="muted">${e.tierLabel||""}${n ? `${e.tierLabel ? " • " : ""}${n} gifts` : ""}</span>${recShort ? `<br><span class="muted">→ ${recShort}</span>` : ""}`;
    }
    if (e.type === "GiftSub") {
      const tierTxt = e.tierLabel ? ` (${e.tierLabel})` : "";
      const toTxt   = e.recipient ? ` <span class="muted">to ${e.recipient}</span>` : "";
      return `<strong>${e.user}</strong> — Gifted sub${tierTxt}${toTxt}`;
    }

    if (e.type === "Cheer") {
      const bits = isNum(e.bits) ? e.bits : 0;
      return `<strong>${e.user}</strong> — Cheer <span class="muted">${bits} bits</span>`;
    }
    if (e.type === "Follow") {
      return `<strong>${e.user}</strong> — Follow`;
    }
    if (e.type === "Raid") {
      const viewers = isNum(e.viewers) ? e.viewers : 0;
      const from = e.from ? ` <span class="muted">from ${e.from}</span>` : "";
      return `<strong>${e.user}</strong> — Raid <span class="muted">${viewers} viewers</span>${from}`;
    }
    return `<strong>${e.user}</strong> — ${e.type} • ${e.tier?("Tier "+e.tier):""} • ${e.tierLabel}${e.months>0?` • ${e.months} mois`:""}`;
  }

  function syncEventsStatusUI(){
    setDot(".dot-events", qvUnreadEvents > 0);
    const bQV = $("#qv-events-count");
    if (bQV) { bQV.textContent = String(qvUnreadEvents); bQV.style.display = qvUnreadEvents > 0 ? "" : "none"; }
    const bTab  = $(".badge-events");
    const bHead = $("#events-counter");
    if (bTab)  setText(bTab, String(qvUnreadEvents));
    if (bHead) setText(bHead, String(qvUnreadEvents));
  }

  function makeItem(htmlText, onToggle, ack=false, id=null){
    const li = document.createElement("li");
    li.className = "event";
    const a = document.createElement("a");
    a.href = "#";
    a.innerHTML = htmlText;
    a.addEventListener("click", (ev)=>{ ev.preventDefault(); ev.stopPropagation(); try { onToggle?.(); } catch {} });
    li.appendChild(a);
    if (ack) li.classList.add("acked");
    if (id != null) li.dataset.id = String(id);
    return li;
  }

  function appendListItem(listEl, htmlText, onToggle, ack=false, id=null){
    if (!listEl) return;
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains("muted"))
      listEl.removeChild(listEl.firstElementChild);
    const li = makeItem(htmlText, onToggle, ack, id);
    listEl.appendChild(li);
    const limit = listEl.classList.contains("list--short") ? 6 : 60;
    while (listEl.children.length > limit) listEl.removeChild(listEl.firstChild);
  }

  function prependListItem(listEl, htmlText, onToggle, ack=false, id=null){
    if (!listEl) return;
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains("muted"))
      listEl.removeChild(listEl.firstElementChild);
    const li = makeItem(htmlText, onToggle, ack, id);
    listEl.insertBefore(li, listEl.firstChild);
    const limit = listEl.classList.contains("list--short") ? 6 : 60;
    while (listEl.children.length > limit) listEl.removeChild(listEl.lastChild);
  }

  function renderStoredEventsIntoUI(){
    const qv   = $("#qv-events-list");
    const full = $("#events-subs-list");
    if (qv)   qv.innerHTML = "";
    if (full) full.innerHTML = "";
    if (!eventsStore.length){
      if (qv)   qv.innerHTML   = '<li class="muted">Aucun event récent</li>';
      if (full) full.innerHTML = '<li class="muted">Aucun event</li>';
      qvUnreadEvents = 0;
      syncEventsStatusUI();
      return;
    }
    for (let i=0;i<eventsStore.length;i++){
      const e = eventsStore[i];
      const html = eventLine(e);
      const toggle = ()=>{ e.ack = !e.ack; saveEvents(eventsStore); renderStoredEventsIntoUI(); };
      if (qv)   prependListItem(qv, html, toggle, e.ack, e.id);
      if (full) prependListItem(full, html, toggle, e.ack, e.id);
    }
    qvUnreadEvents = eventsStore.filter(e => !e.ack).length;
    syncEventsStatusUI();
  }
  renderStoredEventsIntoUI();

  /******************************************************************
   *                             🧭 TABS
   ******************************************************************/
  function showTab(name){
    $$(".tab").forEach(btn => {
      const act = btn.dataset.tab === name;
      btn.classList.toggle("active", act);
      btn.setAttribute("aria-selected", act ? "true" : "false");
    });
    $$(".tab-panel").forEach(p => {
      p.style.display = (p.id === ('tab-' + name)) ? "block" : "none";
    });
    try { localStorage.setItem("jbs.activeTab", name); } catch {}
  }
  $$(".tab").forEach(btn => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
  (function initTab(){ let initial="overview"; try { initial = localStorage.getItem("jbs.activeTab") || "overview"; } catch {} showTab(initial); })();

  /******************************************************************
   *                         🔌 WS INDICATORS
   ******************************************************************/
  function setWsIndicator(state){
    setDot("#ws-dot", state);
    const t = $("#ws-status");
    if (t) setText(t, state ? "Connecté à Streamer.bot" : "Déconnecté de Streamer.bot");
  }
  function setLiveIndicator(isLive){
    setDot("#live-dot", !!isLive);
    const t = $("#live-status");
    if (t) setText(t, isLive ? "Live" : "Offline");
  }

  /******************************************************************
   *                      🎯 GTG — RUN STATE & FILTERS
   ******************************************************************/
  let GTG_RUNNING = false;

  function getFilterControls(){
    const roots = [document.querySelector("#filters"), document.querySelector(".filters"), document.querySelector("[data-filters]"), document.querySelector("form#filtersForm")].filter(Boolean);
    const ctrls = new Set();
    roots.forEach(root => {
      root.querySelectorAll("input, select, textarea, button").forEach(el => {
        const id  = (el.id || "").toLowerCase();
        const cls = (el.className || "").toLowerCase();
        const txt = (el.textContent || "").toLowerCase();
        const isStartEnd = id.includes("start") || id.includes("end") || cls.includes("start") || cls.includes("end") || txt.includes("lancer") || txt.includes("terminer") || txt.includes("stop");
        if (!isStartEnd) ctrls.add(el);
      });
    });
    return Array.from(ctrls);
  }

  function setFiltersLocked(locked){
    const ctrls = getFilterControls();
    ctrls.forEach(el => {
      el.disabled = locked;
      if (locked) el.setAttribute("aria-disabled","true");
      else el.removeAttribute("aria-disabled");
    });
    document.body.classList.toggle("gtg-running", !!locked);
  }

  function setRunning(running){
    // DEBUG: trace tous les changements d'état (origine visible dans la stack)
    try {
      console.log("[DEBUG setRunning]", running, new Error().stack.split("\n")[1] || "");
    } catch {}

    GTG_RUNNING = !!running;
    setFiltersLocked(GTG_RUNNING);
    const startBtn = $("#guess-start");
    const endBtn   = $("#guess-end");
    if (startBtn) startBtn.disabled = GTG_RUNNING;
    if (endBtn)   endBtn.disabled   = !GTG_RUNNING;
    const seriesCancel = $("#gtg-series-cancel");
    if (seriesCancel) seriesCancel.disabled = !GTG_RUNNING;

    setDot(".dot-guess", GTG_RUNNING);
    setStatusText(GTG_RUNNING ? "En cours" : "En pause");
    setRoundNote(GTG_RUNNING);
    refreshCancelAbility();
  }

  function installFilterChangeGuard(){
    if (document._gtgGuardInstalled) return;
    document._gtgGuardInstalled = true;
    ["change","input"].forEach(evt => {
      document.addEventListener(evt, (e)=>{
        if (!GTG_RUNNING) return;
        const target = e.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
        const inFilters = target.closest("#filters, .filters, [data-filters], form#filtersForm") != null;
        if (!inFilters) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        target.disabled = true;
        console.warn("Filtres verrouillés pendant la manche GTG en cours.");
      }, true);
    });
  }

  let GTG_GENRES = [];
  const guessGenreSel           = $("#guess-genre");
  const guessDatalist           = $("#guess-genres-datalist");
  const guessExcludeInput       = $("#guess-exclude-input");
  const guessExcludeAddBtn      = $("#guess-exclude-add");
  const guessExcludeChips       = $("#guess-exclude-chips");
  const guessYearFromInput      = $("#guess-year-from");
  const guessYearToInput        = $("#guess-year-to");
  const guessMinUserRatingSel   = $("#guess-min-user-rating");
  const guessMinUserVotesInput  = $("#guess-min-user-votes");
  const guessMinCriticRatingSel = $("#guess-min-critic-rating");
  const guessMinCriticVotesInput= $("#guess-min-critic-votes");
  const guessDurationMinInput   = $("#guess-duration-min"); // id conservé
  const guessTargetScoreInput   = $("#gtg-target-score");
  const perGameGoalInput        = $("#gtg-pergame-goal"); // NEW
  const zoomLevelInput          = $("#gtg-zoom-level");   // NEW: niveau de zoom logique "Partie"
  const guessStartBtn           = $("#guess-start");
  const guessEndBtn             = $("#guess-end");
  const seriesCancelBtn         = $("#gtg-series-cancel");
  const guessMsgEl              = $("#guess-msg");

  // —— seconds-mode pour la durée ——  
  const DURATION_MIN_SEC = 10;     // 10 secondes mini
  const DURATION_MAX_SEC = 7200;   // 120 min

  function coerceDurationSeconds(raw){
    let n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) n = 120;        // défaut 120s
    n = Math.max(DURATION_MIN_SEC, Math.min(DURATION_MAX_SEC, Math.trunc(n)));
    return n;
  }

  function enableSecondsModeForDurationInput(){
    if (!guessDurationMinInput) return;
    const lbl = document.querySelector('label[for="guess-duration-min"]');
    if (lbl) setText(lbl, "Durée d'une manche (secondes)");
    guessDurationMinInput.min = String(DURATION_MIN_SEC);
    guessDurationMinInput.max = String(DURATION_MAX_SEC);
    if (!guessDurationMinInput.placeholder) guessDurationMinInput.placeholder = "ex: 120";
    // ⚠️ pas de conversion automatique ici (évite de multiplier 90s→5400s)
  }

  const guessMsg = (t)=>{ if (guessMsgEl) setText(guessMsgEl, t || ""); };

  const GTG_EXCLUDED = new Set();

  function renderExcludeChips(){
    if (!guessExcludeChips) return;
    guessExcludeChips.innerHTML = "";
    if (GTG_EXCLUDED.size === 0){
      const span = document.createElement("span");
      span.className = "hint";
      span.textContent = "Tu peux laisser vide, ou exclure plusieurs genres.";
      guessExcludeChips.appendChild(span);
      return;
    }
    for (const id of GTG_EXCLUDED){
      const g = GTG_GENRES.find(x => String(x.id) === String(id));
      const chip = document.createElement("button");
      chip.className = "chip chip-excl";
      chip.textContent = (g?.name || `#${id}`);
      chip.addEventListener("click", ()=>{
        GTG_EXCLUDED.delete(String(id));
        renderExcludeChips();
        saveLastSetup({ excludeGenreIds: Array.from(GTG_EXCLUDED) });
        requestPoolCount();
      });
      guessExcludeChips.appendChild(chip);
    }
  }

  function parseYear(val){
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    if (n < 1970) return 1970;
    if (n > 2100) return 2100;
    return Math.trunc(n);
  }
  function normalizeYearInputs(){
    const yf = parseYear(guessYearFromInput?.value);
    const yt = parseYear(guessYearToInput?.value);
    if (guessYearFromInput && yf != null) guessYearFromInput.value = String(yf);
    if (guessYearToInput && yt != null)   guessYearToInput.value   = String(yt);
  }

  function idFromGenreInputText(txt){
    if (!txt) return null;
    const exact = GTG_GENRES.find(g => (g.name || "").toLowerCase() === txt.toLowerCase());
    if (exact) return String(exact.id);
    const opt = Array.from(guessDatalist?.children || []).find(o => (o.value || "").toLowerCase() === txt.toLowerCase());
    if (opt?.dataset?.id) return String(opt.dataset.id);
    return null;
  }

  function fillGenresUI(genres){
    GTG_GENRES = Array.isArray(genres) ? genres : [];
    if (guessGenreSel){
      guessGenreSel.innerHTML = `<option value="">— Aucun —</option>`;
      for (const g of GTG_GENRES){
        const opt = document.createElement("option");
        opt.value = String(g.id);
        opt.textContent = g.name || `#${g.id}`;
        guessGenreSel.appendChild(opt);
      }
    }
    if (guessDatalist){
      guessDatalist.innerHTML = "";
      for (const g of GTG_GENRES){
        const opt = document.createElement("option");
        opt.value = g.name || `#${g.id}`;
        opt.dataset.id = String(g.id);
        guessDatalist.appendChild(opt);
      }
    }
  }

  function saveLastSetup(setup){
    const old = loadLastSetup();
    const merged = Object.assign({}, old, setup || {});
    try { localStorage.setItem(LAST_SETUP_KEY, JSON.stringify(merged)); } catch {}
  }
  function loadLastSetup(){
    try { return JSON.parse(localStorage.getItem(LAST_SETUP_KEY) || "{}") || {}; } catch { return {}; }
  }

  function collectFilters(){
    normalizeYearInputs();
    const includeGenreId = guessGenreSel?.value ? String(guessGenreSel.value) : "";
    const excludeGenreIds = Array.from(GTG_EXCLUDED);
    const yFrom = parseYear(guessYearFromInput?.value);
    const yTo   = parseYear(guessYearToInput?.value);
    const minUserRating   = (guessMinUserRatingSel && guessMinUserRatingSel.value !== "") ? Number(guessMinUserRatingSel.value) : null;
    const minUserVotes    = (guessMinUserVotesInput && guessMinUserVotesInput.value !== "") ? Number(guessMinUserVotesInput.value) : null;
    const minCriticRating = (guessMinCriticRatingSel && guessMinCriticRatingSel.value !== "") ? Number(guessMinCriticRatingSel.value) : null;
    const minCriticVotes  = (guessMinCriticVotesInput && guessMinCriticVotesInput.value !== "") ? Number(guessMinCriticVotesInput.value) : null;

    // —— maintenant en secondes ——  
    const secRaw = guessDurationMinInput ? Number(guessDurationMinInput.value) : 120;
    const durationSec = coerceDurationSeconds(secRaw);

    const tgt             = guessTargetScoreInput ? Number(guessTargetScoreInput.value) : null;
    const targetScore     = Number.isFinite(tgt) ? Math.max(1, Math.min(999, Math.trunc(tgt))) : null;
    const perGameGoalRaw  = perGameGoalInput ? Number(perGameGoalInput.value) : 1;
    const perGameRoundCountGoal = Number.isFinite(perGameGoalRaw) ? Math.max(1, Math.min(5, Math.trunc(perGameGoalRaw))) : 1;

    // —— zoomLevel: NOM DE FILTRE OBS (ex: "Zoom_x10") ——  
    let zoomLevel = null;
    if (zoomLevelInput) {
      const rawZoom = (zoomLevelInput.value || "").trim();
      zoomLevel = rawZoom || null;   // on laisse null ici, le défaut sera géré dans validateFilters
    }

    return {
      includeGenreId,
      excludeGenreIds,
      yearFrom: yFrom ?? null,
      yearTo:   yTo ?? null,
      minUserRating,
      minUserVotes,
      minCriticRating,
      minCriticVotes,
      durationSec,              // seconds
      targetScore,
      perGameRoundCountGoal,
      zoomLevel                 // NEW: envoyé dans GTG Start
    };
  }


  function getCurrentSetupFromUI(){
    const { clean } = validateFilters(collectFilters());
    return {
      includeGenreId:           clean.includeGenreId,
      excludeGenreIds:          clean.excludeGenreIds,
      yearFrom:                 clean.yearFrom,
      yearTo:                   clean.yearTo,
      minUserRating:            clean.minUserRating,
      minUserVotes:             clean.minUserVotes,
      minCriticRating:          clean.minCriticRating,
      minCriticVotes:           clean.minCriticVotes,
      roundSeconds:             clean.roundSeconds,           // persist
      targetScore:              clean.targetScore,
      perGameRoundCountGoal:    clean.perGameRoundCountGoal,
      zoomLevel:                clean.zoomLevel               // persist aussi
    };
  }

  function saveLastSetupFromUI(){ try { saveLastSetup(getCurrentSetupFromUI()); } catch {} }

  function applyLastSetupAfterGenres(){
    const s = loadLastSetup() || {};
    if (s.includeGenreId && guessGenreSel) {
      const ok = GTG_GENRES.some(g => String(g.id) === String(s.includeGenreId));
      guessGenreSel.value = ok ? String(s.includeGenreId) : "";
    } else if (guessGenreSel) {
      guessGenreSel.value = "";
    }

    GTG_EXCLUDED.clear();
    if (Array.isArray(s.excludeGenreIds)) {
      for (const id of s.excludeGenreIds) {
        if (GTG_GENRES.some(g => String(g.id) === String(id))) GTG_EXCLUDED.add(String(id));
      }
    }
    renderExcludeChips();

    if (isNum(s.yearFrom)) guessYearFromInput.value = String(s.yearFrom);
    if (isNum(s.yearTo))   guessYearToInput.value   = String(s.yearTo);

    if (guessMinUserRatingSel) {
      if (isNum(s.minUserRating)) guessMinUserRatingSel.value = String(s.minUserRating);
      else guessMinUserRatingSel.value = "";
    }
    if (guessMinUserVotesInput) {
      if (isNum(s.minUserVotes)) guessMinUserVotesInput.value = String(Math.max(0, Math.trunc(s.minUserVotes)));
      else guessMinUserVotesInput.value = "";
    }
    if (guessMinCriticRatingSel) {
      if (isNum(s.minCriticRating)) guessMinCriticRatingSel.value = String(s.minCriticRating);
      else guessMinCriticRatingSel.value = "";
    }
    if (guessMinCriticVotesInput) {
      if (isNum(s.minCriticVotes)) guessMinCriticVotesInput.value = String(Math.max(0, Math.trunc(s.minCriticVotes)));
      else guessMinCriticVotesInput.value = "";
    }

    // —— priorité au nouveau champ roundSeconds, fallback roundMinutes (legacy) ——  
    if (guessDurationMinInput){
      if (isNum(s.roundSeconds)) {
        guessDurationMinInput.value = String(coerceDurationSeconds(s.roundSeconds));
      } else if (isNum(s.roundMinutes)) {
        guessDurationMinInput.value = String(coerceDurationSeconds(s.roundMinutes * 60));
      }
    }

    if (isNum(s.targetScore)  && guessTargetScoreInput) guessTargetScoreInput.value  = String(s.targetScore);
    if (isNum(s.perGameRoundCountGoal) && perGameGoalInput) perGameGoalInput.value = String(Math.max(1, Math.min(5, Math.trunc(s.perGameRoundCountGoal))));

    // PATCH: refresh zoom preview after restore
    updateZoomPreview(isNum(s.perGameRoundCountGoal) ? s.perGameRoundCountGoal : 1);

    // —— zoomLevel persisté (nom de filtre OBS) ——   
    if (s.zoomLevel != null && zoomLevelInput){
      zoomLevelInput.value = String(s.zoomLevel);
    }
  }

  function validateFilters(raw){
    const errs = [];

    if (raw.includeGenreId){
      const ok = GTG_GENRES.some(g => String(g.id) === String(raw.includeGenreId));
      if (!ok) errs.push("Genre d'inclusion invalide.");
    }

    const validExcl = [];
    const seen = new Set();
    for (const id of (raw.excludeGenreIds || [])){
      const s = String(id);
      if (seen.has(s)) continue;
      if (GTG_GENRES.some(g => String(g.id) === s)){
        seen.add(s);
        validExcl.push(s);
      }
    }
    const excludeClean = validExcl;

    let yf = raw.yearFrom, yt = raw.yearTo;
    if (yf != null && !isNum(yf)) errs.push("Année (de) invalide.");
    if (yt != null && !isNum(yt)) errs.push("Année (à) invalide.");
    if (isNum(yf) && yf < 1970) yf = 1970;
    if (isNum(yt) && yt < 1970) yt = 1970;
    if (isNum(yf) && isNum(yt) && yt < yf) yt = yf;
    const cap = new Date().getFullYear();
    if (isNum(yf) && yf > cap) yf = cap;
    if (isNum(yt) && yt > cap) yt = cap;

    function cleanPct(v, label){
      if (v == null) return null;
      if (!isNum(v) || v < 0 || v > 100){ errs.push(`${label} invalide.`); return null; }
      return Math.trunc(v);
    }
    let minUserRating   = cleanPct(raw.minUserRating,   "Note minimale (users)");
    let minCriticRating = cleanPct(raw.minCriticRating, "Note minimale (critics)");

    function cleanVotes(v, label){
      if (v == null) return null;
      if (!isNum(v) || v < 0){ errs.push(`${label} invalide.`); return null; }
      return Math.min(100000, Math.trunc(v));
    }
    let minUserVotes   = cleanVotes(raw.minUserVotes,   "Votes min (users)");
    let minCriticVotes = cleanVotes(raw.minCriticVotes, "Votes min (critics)");

    // —— seconds (compat minutes si raw.durationMin présent) ——  
    let roundSeconds = Number(raw.durationSec ?? raw.durationMin ?? 120);
    roundSeconds = coerceDurationSeconds(roundSeconds);

    let targetScore = raw.targetScore;
    if (targetScore != null && !isNum(targetScore)){ errs.push("Score cible invalide."); targetScore = null; }
    if (isNum(targetScore)) targetScore = Math.max(1, Math.min(999, Math.trunc(targetScore)));

    // NEW: perGameRoundCountGoal (1..5)
    let perGameRoundCountGoal = Number(raw.perGameRoundCountGoal);
    if (!isNum(perGameRoundCountGoal)) perGameRoundCountGoal = 1;
    perGameRoundCountGoal = Math.max(1, Math.min(5, Math.trunc(perGameRoundCountGoal)));

    // NEW: zoomLevel = nom de filtre OBS (ou null)
    let zoomLevel = raw.zoomLevel;
    if (zoomLevel != null && typeof zoomLevel === "string") {
      zoomLevel = zoomLevel.trim();
      if (!zoomLevel) zoomLevel = null;
    }

    return {
      ok: errs.length === 0,
      errs,
      clean: {
        includeGenreId: raw.includeGenreId || null,
        excludeGenreIds: excludeClean,
        yearFrom: isNum(yf) ? yf : null,
        yearTo:   isNum(yt) ? yt : null,
        minUserRating:   (minUserRating   == null ? null : minUserRating),
        minUserVotes:    (minUserVotes    == null ? null : minUserVotes),
        minCriticRating: (minCriticRating == null ? null : minCriticRating),
        minCriticVotes:  (minCriticVotes  == null ? null : minCriticVotes),
        roundSeconds,                     // seconds
        targetScore,
        perGameRoundCountGoal,
        zoomLevel                         // renvoyé vers GTG Start
      }
    };
  }

  function sameFilters(a,b){
    if (!a || !b) return false;
    if (String(a.includeGenreId || "") !== String(b.includeGenreId || "")) return false;

    const ax = (a.excludeGenreIds || []).map(String).sort();
    const bx = (b.excludeGenreIds || []).map(String).sort();
    if (ax.length !== bx.length) return false;
    for (let i=0;i<ax.length;i++) if (ax[i] !== bx[i]) return false;

    if (String(a.yearFrom || "") !== String(b.yearFrom || "")) return false;
    if (String(a.yearTo   || "") !== String(b.yearTo   || "")) return false;
    if (String(a.minUserRating   || "") !== String(b.minUserRating   || "")) return false;
    if (String(a.minUserVotes    || "") !== String(b.minUserVotes    || "")) return false;
    if (String(a.minCriticRating || "") !== String(b.minCriticRating || "")) return false;
    if (String(a.minCriticVotes  || "") !== String(b.minCriticVotes  || "")) return false;
    if (String(a.roundSeconds || "") !== String(b.roundSeconds || "")) return false;
    if (String(a.targetScore || "") !== String(b.targetScore || "")) return false;
    if (String(a.perGameRoundCountGoal || "") !== String(b.perGameRoundCountGoal || "")) return false;
    if (String(a.zoomLevel || "") !== String(b.zoomLevel || "")) return false;

    return true;
  }

  /******************************************************************
   *                   🤝 Streamer.bot Actions
   ******************************************************************/
  let sbClient = null;
  const ACTION_ID_CACHE = new Map();

  async function resolveActionIdByName(name){
    if (!name) throw new Error("Nom action requis");
    if (ACTION_ID_CACHE.has(name)) return ACTION_ID_CACHE.get(name);
    const { actions } = await sbClient.getActions();
    const found = actions.find(a => a.name === name);
    if (!found) throw new Error(`Action introuvable: "${name}"`);
    ACTION_ID_CACHE.set(name, found.id);
    return found.id;
  }

  function sendRawDoActionById(actionId, argsObj){
    try {
      const sock = sbClient?.socket || sbClient?.ws;
      if (!sock || (sock.readyState !== 1 && sock.readyState !== sock.OPEN)){
        appendLog("#guess-log", "Erreur: WebSocket non prêt pour DoAction brut.");
        return false;
      }
      const wireArgs = Object.assign({}, argsObj || {}, { _json: JSON.stringify(argsObj || {}) });
      const payload = { request:"DoAction", id:"DoAction", action:{ id: actionId }, args: wireArgs };
      sock.send(JSON.stringify(payload));
      return true;
    } catch (e) {
      appendLog("#guess-log", "Erreur DoAction brut: " + (e?.message || e));
      return false;
    }
  }

  async function safeDoAction(actionName, args){
    try {
      if (!sbClient){ appendLog("#guess-log", "Client Streamer.bot non initialisé."); return; }
      const wire = Object.assign({}, args || {}, { _json: JSON.stringify(args || {}) });
      const actionId = await resolveActionIdByName(actionName);
      try {
        await sbClient.doAction(actionId, wire);
        return;
      } catch (e) {
        appendLog("#guess-log", "doAction client a échoué, fallback DoAction brut…");
      }
      const ok = sendRawDoActionById(actionId, wire);
      if (!ok) appendLog("#guess-log", "Fallback DoAction brut a échoué.");
    } catch (e) {
      appendLog("#guess-log", "Erreur safeDoAction: " + (e?.message || e));
    }
  }

  /******************************************************************
   *                        🎮 Handlers UI GTG
   ******************************************************************/
  let GTG_ROUND_ID = null;

  function setGuessHandlers(){
    const debounce = (fn, ms) => { let t=null; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
    const debounceCount   = debounce(requestPoolCount, 400);
    const debouncePersist = debounce(saveLastSetupFromUI, 250);

    [guessGenreSel, guessYearFromInput, guessYearToInput, guessMinUserRatingSel, guessMinUserVotesInput, guessMinCriticRatingSel, guessMinCriticVotesInput, guessDurationMinInput, guessTargetScoreInput, perGameGoalInput, zoomLevelInput]
      .forEach(el=>{
        if (!el) return;
        el.addEventListener("change", ()=>{ debounceCount(); debouncePersist(); });
        if (el === guessYearFromInput || el === guessYearToInput || el === guessMinUserVotesInput || el === guessMinCriticVotesInput || el === guessDurationMinInput || el === guessTargetScoreInput || el === perGameGoalInput || el === zoomLevelInput){
          el.addEventListener("input", ()=>{ debounceCount(); debouncePersist(); });
        }
      });

// PATCH: Zoom auto preview (updates under "Nb de manches par jeu")
if (perGameGoalInput){
  const refresh = ()=>{
    const v = Number(perGameGoalInput.value);
    const goal = Number.isFinite(v) ? Math.max(1, Math.min(5, Math.trunc(v))) : 1;
    updateZoomPreview(goal);
  };
  perGameGoalInput.addEventListener("input", refresh);
  perGameGoalInput.addEventListener("change", refresh);
  refresh(); // init
}

    // maj goal en live pour l’UI/annulation
    if (guessTargetScoreInput){
      guessTargetScoreInput.addEventListener("input", ()=>{
        const g = Number(guessTargetScoreInput.value);
        GTG_GOAL = Number.isFinite(g) ? g : null;
        renderGlobalScore(GTG_TOTALS, GTG_GOAL);
        refreshCancelAbility();
      });
    }

    guessExcludeAddBtn?.addEventListener("click", ()=>{
      const id = idFromGenreInputText(guessExcludeInput?.value || "");
      if (id){
        GTG_EXCLUDED.add(String(id));
        renderExcludeChips();
        saveLastSetup({ excludeGenreIds: Array.from(GTG_EXCLUDED) });
        requestPoolCount();
      }
      if (guessExcludeInput) guessExcludeInput.value = "";
    });

    guessStartBtn?.addEventListener("click", ()=>{
      const { ok, errs, clean } = validateFilters(collectFilters());
      if (!ok){ guessMsg("Filtres invalides: " + errs.join(" ; ")); return; }

      saveLastSetup({
        includeGenreId:  clean.includeGenreId,
        excludeGenreIds: clean.excludeGenreIds,
        yearFrom:        clean.yearFrom,
        yearTo:          clean.yearTo,
        minUserRating:   clean.minUserRating,
        minUserVotes:    clean.minUserVotes,
        minCriticRating: clean.minCriticRating,
        minCriticVotes:  clean.minCriticVotes,
        roundSeconds:    clean.roundSeconds,        // persist seconds
        targetScore:     clean.targetScore,
        perGameRoundCountGoal: clean.perGameRoundCountGoal,
        zoomLevel:       clean.zoomLevel            // persist zoom
      });

      const nonce = makeNonce();
      const durationSec = clean.roundSeconds || 120;
      const durationMs  = durationSec * 1000;

      if (guessStartBtn) {
        guessStartBtn.disabled = true;
        setTimeout(()=>{ if (!GTG_RUNNING) guessStartBtn.disabled = false; }, 1500);
      }

      safeDoAction("GTG Start", {
        nonce,
        includeGenreId: clean.includeGenreId,
        excludeGenreIds: clean.excludeGenreIds,
        yearFrom: clean.yearFrom,
        yearTo:   clean.yearTo,
        minUserRating:   clean.minUserRating,
        minUserVotes:    (isNum(clean.minUserVotes)    && clean.minUserVotes    > 0) ? Math.trunc(clean.minUserVotes)    : null,
        minCriticRating: clean.minCriticRating,
        minCriticVotes:  (isNum(clean.minCriticVotes)  && clean.minCriticVotes  > 0) ? Math.trunc(clean.minCriticVotes)  : null,
        durationSec,                                   // seconds -> C# reçoit la durée
        durationMs,
        targetScore: (isNum(clean.targetScore) ? Math.trunc(clean.targetScore) : null),
        perGameRoundCountGoal: clean.perGameRoundCountGoal,
        zoomLevel: clean.zoomLevel                     // 🔴 envoyé à GTG Start
      });

      appendLogDebug("GTG Start args", { durationSec, durationMs, perGameRoundCountGoal: clean.perGameRoundCountGoal, zoomLevel: clean.zoomLevel });
    });

    guessEndBtn?.addEventListener("click", ()=>{
      if (!GTG_ROUND_ID){
        appendLog("#guess-log", "End ignoré: aucun roundId en cours (pas de manche active).");
        return;
      }
      safeDoAction("GTG End", { roundId: GTG_ROUND_ID, reason: "manual" });
    });

    $("#gtg-reset-scores")?.addEventListener("click", ()=>{
      if (!confirm("Remettre tous les scores à zéro ?")) return;
      safeDoAction("GTG Scores Reset", {});
    });

    // Annulation protégée + interdite si objectif atteint
    seriesCancelBtn?.addEventListener("click", ()=>{
      const canCancel = GTG_RUNNING
        && Number.isFinite(GTG_GOAL)
        && (GTG_TOTALS.streamer < GTG_GOAL && GTG_TOTALS.viewers < GTG_GOAL);

      if (!canCancel){
        appendLog("#guess-log", "Annulation refusée : score cible déjà atteinte ou partie inactive.");
        return;
      }
      if (!confirm("Confirmer l’annulation de la partie ?")) return;

      safeDoAction("GTG End", {
        roundId: GTG_ROUND_ID || "",
        reason: "seriesCancel",
        cancel: true
      });
    });

    renderExcludeChips();
  }

  /******************************************************************
   *                    🔻 Filtres: collapse / expand
   ******************************************************************/
  const filtersCard  = $("#filters-card");
  const filtersHead  = $("#filters-head");
  const poolBadgeEl  = $("#filters-pool-badge");
  let   isFiltersCollapsed = false;

  function setFiltersCollapsed(collapsed){
    isFiltersCollapsed = !!collapsed;
    if (filtersCard) filtersCard.classList.toggle("collapsed", isFiltersCollapsed);
    if (filtersHead) filtersHead.setAttribute("aria-expanded", isFiltersCollapsed ? "false" : "true");
  }
  function toggleFiltersCollapsed(){ setFiltersCollapsed(!isFiltersCollapsed); }
  function bindFiltersCollapse(){
    if (!filtersHead) return;
    setFiltersCollapsed(false);
    if (filtersHead._bound) return;
    filtersHead._bound = true;
    filtersHead.addEventListener("click", (e)=>{
      if (e.target.closest("button, a, input, select, label")) return;
      toggleFiltersCollapsed();
    });
    filtersHead.addEventListener("keydown", (e)=>{
      if (e.key === "Enter" || e.key === " "){ e.preventDefault(); toggleFiltersCollapsed(); }
    });
  }
  function updatePoolBadge(count){
    if (!poolBadgeEl) return;
    poolBadgeEl.textContent = (Number.isFinite(count) && count >= 0) ? String(count) : "—";
  }

  /******************************************************************
   *                           ⏱ Timer
   ******************************************************************/
  let GTG_TIMER_ID   = null;
  let GTG_TIMER_END  = 0;
  let GTG_TIMER_SENT = false;

  // ====== FIX : filet de sécurité si la manche se termine sans retour d'events ======
  function autoEndIfNeeded(){
    if (GTG_TIMER_SENT) return;
    GTG_TIMER_SENT = true;

    // On force la fin de manche côté UI pour éviter le Start bloqué.
    const prevRoundId = GTG_ROUND_ID || null;
    setRunning(false);
    GTG_ROUND_ID = null;

    if (!prevRoundId){
      appendLog("#guess-log", "Timer=0, roundId inconnu → End sans roundId (pas de manche active côté UI).");
      safeDoAction("GTG End", { reason: "timeout" });
      return;
    }
    appendLog("#guess-log", `Timer écoulé → demande "GTG End" pour roundId=${prevRoundId}`);
    safeDoAction("GTG End", { roundId: prevRoundId, reason: "timeout" });
  }

  function startRoundTimer(endMs){
    stopRoundTimer();
    GTG_TIMER_SENT = false;
    if (!Number.isFinite(endMs) || endMs <= Date.now()){
      setTimerText("--:--");
      return;
    }
    GTG_TIMER_END = endMs;
    function tick(){
      const ms = Math.max(0, GTG_TIMER_END - Date.now());
      const s  = Math.ceil(ms / 1000);
      const m  = Math.floor(s / 60);
      const sec = String(s % 60).padStart(2, "0");
      setTimerText(`${m}:${sec}`);
      if (ms <= 0){
        stopRoundTimer();
        autoEndIfNeeded();
      }
    }
    tick();
    GTG_TIMER_ID = setInterval(tick, 250);
  }

  function stopRoundTimer(){
    if (GTG_TIMER_ID != null) clearInterval(GTG_TIMER_ID);
    GTG_TIMER_ID = null;
    GTG_TIMER_END = 0;
    setTimerText("--:--");
  }

  /******************************************************************
   *                      🔗 WS CONNECT / LIFECYCLE
   ******************************************************************/
  function setConnected(on){ setWsIndicator(!!on); }

  // Gardé mais plus utilisé pour la connexion auto (la gestion se fait via lock-btn + ?pwd=)
  function ensureSbPassword(){
    const qsPwd = getQS("pwd");
    if (qsPwd != null){ setStoredPwd(qsPwd); return qsPwd; }
    let pwd = getStoredPwd();
    if (!pwd){
      const val = window.prompt("Mot de passe Streamer.bot :", "");
      if (val === null) return "";
      pwd = (val || "").trim();
      setStoredPwd(pwd);
    }
    return pwd;
  }

  function reconnectSB(){
    try { window.sbClient?.disconnect?.(); } catch {}
    connectSB();
  }

  // ====== VERSION CORRIGÉE : pas de password forcé, envoyé seulement s'il existe vraiment ======
  function connectSB(){
    try {
      const StreamerbotCtor =
        (typeof window.StreamerbotClient === "function" && window.StreamerbotClient) ||
        (typeof window.StreamerbotClient?.default === "function" && window.StreamerbotClient.default);

      if (typeof StreamerbotCtor !== "function"){
        appendLog("#guess-log", "Erreur: StreamerbotClient n’est pas chargé (script manquant ?).");
        return;
      }

      const host = getQS("host") || "127.0.0.1";
      const port = Number(getQS("port") || 8080);

      // Gestion du mot de passe : querystring > storage, mais aucun prompt ici
      const qsPwd = getQS("pwd");
      if (qsPwd != null) {
        setStoredPwd(qsPwd);
      }
      const storedPwd = (getStoredPwd() || "").trim();
      const password = (qsPwd != null ? (qsPwd || "") : storedPwd);

      // Nettoyage ancienne connexion
      try { window.sbClient?.disconnect?.(); } catch {}

      const clientOpts = {
        host,
        port,
        endpoint: "/",
        subscribe: "*",
        immediate: true,
        autoReconnect: true,
        retries: -1,
        log: false,
        onConnect: () => {
          window.sbClient = sbClient;
          window.client   = sbClient;
          setConnected(true);
          appendLog("#guess-log", `Connecté à Streamer.bot (${host}:${port})`);
// NOTE: no manual subscribe here; the client is initialized with subscribe:"*".
          // Re-sync complet à chaque connexion
          safeDoAction("GTG Bootstrap Genres & Years & Ratings", {});
          safeDoAction("GTG Scores Get", {});

          // --- Extension TTS (async encapsulé) ---
          (async () => {
            const client = sbClient;
            if (!client) return;

            // 1) Récupération de l'ID de l'action "TTS Timer Set"
            try {
              const actionsObj = await client.getActions();
              const ttsTimerAction = actionsObj.actions?.find(
                a => a.name === "TTS Timer Set"
              );
              if (ttsTimerAction) {
                TTS_TIMER_ACTION_ID = ttsTimerAction.id;
              } else {
                console.warn('Action "TTS Timer Set" non trouvée dans Streamer.bot');
              }
            } catch (e) {
              console.warn("Erreur récupération des actions Streamer.bot :", e);
            }

            // 2) Récupération de la globale "ttsCooldownMinutes" pour l'UI
            if (ttsTimerInput && ttsTimerLabel) {
              try {
                const cooldownResp = await client.getGlobal("ttsCooldownMinutes");
                if (
                  cooldownResp &&
                  cooldownResp.status === "ok" &&
                  typeof cooldownResp.variable?.value === "number"
                ) {
                  const v = cooldownResp.variable.value;
                  lastSentTimer = v;
                  ttsTimerInput.value = v;
                  ttsTimerLabel.textContent = v + " min";
                }
              } catch (e) {
                console.warn("Erreur récupération ttsCooldownMinutes :", e);
              }
            }

            // 3) Sync initial du switch TTS ON/OFF
            await syncTtsSwitchFromBackend();
          })();
        },
        onDisconnect: () => {
          setConnected(false);
          appendLog("#guess-log", "Déconnecté de Streamer.bot.");
        },
        onError: (e) => {
          appendLog("#guess-log", "Erreur Streamer.bot: " + (e?.message || e));
        }
      };

      if (password && password.trim() !== "") {
        clientOpts.password = password.trim();
      }

      sbClient = new StreamerbotCtor(clientOpts);

      // expose global client pour les autres blocs (optionnel)
      window.sbClient = sbClient;
      window.client   = sbClient;

      try {
        sbClient.on?.("*", ({ event, data }) => {
          try { handleSBEvent(event, data); }
          catch (e) { appendLog("#guess-log", "handleSBEvent error: " + (e?.message || e)); }
        });
      } catch {}

      
      
      

      try {
        const sock = sbClient?.socket || sbClient?.ws;
        if (sock && !sock._debugBound){
          sock._debugBound = true;
          sock.addEventListener?.("close", (ev)=>{
            appendLog("#guess-log", `WS close code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean}`);
            const t = $("#ws-status");
            if (t) t.title = `WS closed code=${ev.code} reason=${ev.reason}`;
          });
        }
      } catch {}

      window.sbClient = sbClient;

    } catch (e) {
      appendLog("#guess-log", "Connexion impossible: " + (e?.message || e));
    }
  }

  /******************************************************************
   *                     📈 Ratings & Leaderboard
   ******************************************************************/
  let LAST_COUNT_SEND_SIG = null;
  let LAST_COUNT_SEND_TS  = 0;
  let LAST_COUNT_LOG_SIG  = null;
  let LAST_COUNT_LOG_TS   = 0;

  function fillRatingStepsAll(steps){
    const list = Array.isArray(steps) && steps.length ? steps : [0,50,60,70,80,85,90];
    function fillSelect(sel){
      if (!sel) return;
      const cur = sel.value || "";
      sel.innerHTML = `<option value="">——</option>`;
      list.forEach(v=>{
        const opt = document.createElement("option");
        opt.value = String(v);
        opt.textContent = `${v}`;
        sel.appendChild(opt);
      });
      if (cur && Array.from(sel.options).some(o => o.value === cur)) sel.value = cur;
    }
    fillSelect(guessMinUserRatingSel);
    fillSelect(guessMinCriticRatingSel);
  }

  function updateLeaderboard(list){
    const sorted = Array.isArray(list) ? list.slice().sort((a,b)=>(b.score??b.points??0)-(a.score??a.points??0)) : [];
    const top = sorted.slice(0,50);

    const el = $("#guess-board");
    const qv = $("#qv-guess-board");
    function render(into){
      if (!into) return;
      into.innerHTML = "";
      if (!top.length){
        into.innerHTML = '<li class="muted">Aucune donnée</li>';
        return;
      }
      for (const item of top){
        const name  = item.name || item.user || "—";
        const score = item.score ?? item.points ?? 0;
        const li = document.createElement("li");
        li.textContent = `${name} — ${score}`;
        into.appendChild(li);
      }
    }
    render(el);
    render(qv);
  }

  /******************************************************************
   *                  🎁 Twitch Sub Events (helpers)
   ******************************************************************/
  const SUB_EVENT_TYPES = new Set(["Sub","ReSub","GiftSub","GiftBomb","MassGift","MassSubGift","CommunitySub","CommunitySubGift"]);

  function extractUserName(d){
    if (!d) return "—";
    if (typeof d === "string") return d;
    if (typeof d.displayName === "string") return d.displayName;
    if (typeof d.userName    === "string") return d.userName;
    if (typeof d.username    === "string") return d.username;
    if (typeof d.user        === "string") return d.user;
    if (typeof d.sender      === "string") return d.sender;
    if (typeof d.gifter      === "string") return d.gifter;
    if (typeof d.login       === "string") return d.login;
    if (typeof d.name        === "string") return d.name;
    if (d.user && typeof d.user === "object"){
      if (typeof d.user.displayName === "string") return d.user.displayName;
      if (typeof d.user.name        === "string") return d.user.name;
      if (typeof d.user.login       === "string") return d.user.login;
    }
    return "—";
  }
  function extractRecipientName(obj){
    if (!obj) return "—";
    if (typeof obj === "string") return obj;
    if (typeof obj.name  === "string" && obj.name)  return obj.name;
    if (typeof obj.login === "string" && obj.login) return obj.login;
    if (typeof obj.id    === "string" && obj.id)    return obj.id;
    return "—";
  }
  function extractRecipientNames(arr){ if (!Array.isArray(arr)) return []; return arr.map(r => extractRecipientName(r)); }
  function tierLabelFromAny(v){
    const s = (v == null ? "" : String(v)).toLowerCase();
    if (s.includes("prime"))  return "Prime";
    if (s.includes("1000") || s.includes("tier 1") || s.includes("tier1")) return "Tier 1";
    if (s.includes("2000") || s.includes("tier 2") || s.includes("tier2")) return "Tier 2";
    if (s.includes("3000") || s.includes("tier 3") || s.includes("tier3")) return "Tier 3";
    return String(v || "");
  }
  function extractMonths(d){
    const m = Number(d?.cumulativeMonths ?? d?.months ?? d?.streak ?? 0);
    return Number.isFinite(m) ? m : 0;
  }

  function extractBits(d){
    const b = Number(d?.bits ?? d?.amount ?? d?.count ?? d?.bitsUsed ?? d?.bitsAmount ?? d?.cheerAmount ?? d?.message?.bits);
    return Number.isFinite(b) ? Math.trunc(b) : 0;
  }
  function extractRaidViewers(d){
    const v = Number(d?.viewers ?? d?.viewerCount ?? d?.raidViewers ?? d?.raidCount ?? d?.amount ?? d?.count);
    return Number.isFinite(v) ? Math.trunc(v) : 0;
  }
  function extractRaiderName(d){
    // Incoming raid: try to identify the raiding channel/user
    return extractUserName(
      d?.raider ??
      d?.from ?? d?.from_user ?? d?.fromUser ?? d?.fromUserName ?? d?.fromUsername ??
      d?.from_broadcaster ?? d?.fromBroadcaster ?? d?.fromBroadcasterUser ?? d?.fromBroadcasterUserName ??
      d?.from_broadcaster_user_name ?? d?.from_broadcaster_user_login ?? d?.from_broadcaster_user_id ??
      d?.raidingBroadcaster ?? d?.raiding_channel ?? d?.raidingChannel ??
      d?.user ??
      d
    );
  }

  function extractFollowName(d){
    // Follow: try to identify the follower user
    return extractUserName(
      d?.follower ??
      d?.followUser ?? d?.followedBy ??
      d?.from ?? d?.from_user ?? d?.fromUser ?? d?.fromUserName ?? d?.fromUsername ??
      d?.user ??
      d?.user_name ?? d?.user_login ?? d?.userName ?? d?.userLogin ?? d?.login ?? d?.username ?? d?.displayName ??
      d
    );
  }


  
  function logSbTwitchEventToConsole(evt, payload){
    try {
      const type = evt?.type || "Unknown";
      console.groupCollapsed(`🟦 [Twitch:${type}] payload`);
      console.log("event:", evt);
      console.log("data :", payload);

      // Quick visibility on top-level keys
      if (payload && typeof payload === "object") {
        console.log("keys:", Object.keys(payload));
      }

      // Common candidate fields (helps mapping fast)
      const d = payload || {};
      const candidates = {
        user: d?.user,
        follower: d?.follower,
        raider: d?.raider,
        from: d?.from,
        from_user: d?.from_user,
        fromUser: d?.fromUser,
        fromBroadcaster: d?.fromBroadcaster,
        from_broadcaster_user_name: d?.from_broadcaster_user_name,
        from_broadcaster_user_login: d?.from_broadcaster_user_login,
        from_broadcaster_user_id: d?.from_broadcaster_user_id,
        displayName: d?.displayName,
        userName: d?.userName,
        username: d?.username,
        login: d?.login,
        name: d?.name,
        bits: d?.bits,
        amount: d?.amount,
        viewers: d?.viewers,
        viewerCount: d?.viewerCount,
        count: d?.count
      };
      console.log("candidates:", candidates);
      console.groupEnd();
    } catch (e) {
      console.warn("Console log error:", e);
    }
  }

function logSbSubEventToConsole(evt, payload){
    try {
      const type = evt?.type || "Unknown";
      console.groupCollapsed(`🟣 [Twitch:${type}]`);
      console.log("event:", evt);
      console.log("data :", payload);
      console.groupEnd();
    } catch (e) {
      console.warn("Console log error:", e);
    }
  }

  /******************************************************************
   *                    📊 Count & Filters → SB
   ******************************************************************/
  function requestPoolCount(){
    const raw = collectFilters();
    const { ok, errs, clean } = validateFilters(raw);
    if (!ok){ guessMsg("Filtres invalides: " + errs.join(" ; ")); return; }

    const sig = JSON.stringify(clean);
    const now = Date.now();
    if (LAST_COUNT_SEND_SIG === sig && (now - LAST_COUNT_SEND_TS) < 1500) return;
    LAST_COUNT_SEND_SIG = sig;
    LAST_COUNT_SEND_TS  = now;

    safeDoAction("GTG Games Count", {
      includeGenreId:  clean.includeGenreId,
      excludeGenreIds: clean.excludeGenreIds,
      yearFrom: clean.yearFrom,
      yearTo:   clean.yearTo,
      minUserRating:   clean.minUserRating,
      minUserVotes:    (isNum(clean.minUserVotes)    && clean.minUserVotes    > 0) ? Math.trunc(clean.minUserVotes)    : null,
      minCriticRating: clean.minCriticRating,
      minCriticVotes:  (isNum(clean.minCriticVotes)  && clean.minCriticVotes  > 0) ? Math.trunc(clean.minCriticVotes)  : null
      // zoomLevel volontairement ignoré ici, il n'impacte pas le pool
    });
  }

  /******************************************************************
   *                 🎙️ TTS SWITCH + TIMER (intégration SB)
   ******************************************************************/
  // ======== TTS Reader (intégration avec Streamer.bot) ========
  const ttsSwitchInput      = document.getElementById('tts-switch');
  const ttsSwitchLabel      = document.getElementById('tts-switch-label');
  const ttsSwitchLabelText  = ttsSwitchLabel
    ? ttsSwitchLabel.querySelector('.switch-label-text')
    : null;

  const ttsStatusMain   = document.getElementById('tts-status-main-text');
  const ttsStatusInline = document.getElementById('tts-status-inline-text');
  const ttsStatusOverview = document.getElementById('tts-status-text');

  const ttsTimerInput = document.getElementById('tts-timer');
  const ttsTimerLabel = document.getElementById('tts-timer-label');

  // ID d'action côté Streamer.bot pour "TTS Timer Set"
  let TTS_TIMER_ACTION_ID = null;
  // Dernière valeur envoyée au script pour éviter le spam
  let lastSentTimer = null;

  // --- Mise à jour du texte + points de statut ---
  function setTtsStatusUI(enabled) {
    const val = !!enabled;
    const txt = val ? 'Actif' : 'Inactif';

    if (ttsStatusMain) setText(ttsStatusMain, txt);
    if (ttsStatusInline) setText(ttsStatusInline, txt);
    if (ttsStatusOverview) setText(ttsStatusOverview, txt);

    setDot('.dot-tts', val);
  }

  // --- Mise à jour visuelle du switch ---
  function updateTtsSwitchUI(enabled) {
    const val = !!enabled;

    if (ttsSwitchInput)      ttsSwitchInput.checked = val;
    if (ttsSwitchLabelText) setText(ttsSwitchLabelText, val ? 'TTS ON' : 'TTS OFF');
    if (ttsSwitchLabel)      ttsSwitchLabel.style.opacity   = val ? '1' : '0.55';

    // toujours synchroniser les textes + pastilles
    setTtsStatusUI(val);
  }

  // --- Sync initial depuis la globale "ttsAutoReaderEnabled" ---
  async function syncTtsSwitchFromBackend() {
    if (!sbClient) return;
    try {
      const resp = await sbClient.getGlobal("ttsAutoReaderEnabled");
      let val = false;
      if (resp && resp.status === "ok") {
        val = !!resp.variable?.value;
      }
      updateTtsSwitchUI(val);
    } catch (e) {
      console.warn("Erreur récupération ttsAutoReaderEnabled:", e);
      updateTtsSwitchUI(false);
    }
  }

  // --- Envoi ON/OFF vers Streamer.bot ---
  async function setTtsAutoReader(enabled) {
    if (!sbClient) return;

    try {
      const args = { mode: enabled ? "on" : "off" };
      const wire = Object.assign({}, args, { _json: JSON.stringify(args) });
      const actionId = await resolveActionIdByName("TTS Auto Message Reader Switch ON OFF");

      try {
        await sbClient.doAction(actionId, wire);
        updateTtsSwitchUI(enabled);
        return;
      } catch (e) {
        console.error("Erreur doAction Switch ON/OFF (client):", e);
        const ok = sendRawDoActionById(actionId, args);
        if (!ok) throw e;
        updateTtsSwitchUI(enabled);
      }
    } catch (e) {
      console.error("Erreur Switch ON/OFF:", e);
      updateTtsSwitchUI(!enabled);
      alert("Erreur lors du changement d'état du TTS Auto Reader.");
    }
  }

  if (ttsSwitchInput) {
    ttsSwitchInput.addEventListener('change', () => {
      setTtsAutoReader(ttsSwitchInput.checked);
    });
  }

  // --- Envoi du timer (cooldown en minutes) ---
  function sendTtsTimer(timerValue) {
    if (!sbClient) return;
    if (!TTS_TIMER_ACTION_ID) {
      console.warn("TTS_TIMER_ACTION_ID non initialisé, on ignore.");
      return;
    }

    const v = Number(timerValue);
    if (!Number.isFinite(v)) return;

    const clamped = Math.min(10, Math.max(1, Math.round(v)));
    if (clamped === lastSentTimer) return;

    lastSentTimer = clamped;

    const args = { timer: clamped };
    const wire = Object.assign({}, args, { _json: JSON.stringify(args) });

    sbClient
      .doAction(TTS_TIMER_ACTION_ID, wire)
      .catch(e => console.error("Erreur doAction TTS Timer Set :", e));

    if (ttsTimerInput)  ttsTimerInput.value = clamped;
    if (ttsTimerLabel) setText(ttsTimerLabel, clamped + " min");
  }

  if (ttsTimerInput) {
    const applyTimer = () => {
      const v = ttsTimerInput.value;
      sendTtsTimer(v);
    };

    ttsTimerInput.addEventListener('change', applyTimer);
    ttsTimerInput.addEventListener('blur', applyTimer);
  }

  /******************************************************************
   *                 🎙️ TTS AUTO MESSAGE READER (mini-dashboard)
   ******************************************************************/
  let TTS_AUTO_ENABLED = false;

  function formatDelay(ms){
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m <= 0) return `${s}s`;
    return `${m}m${s>0?` ${s}s`:""}`;
  }

  function setTtsEnabledUI(on){
    TTS_AUTO_ENABLED = !!on;

    // Centralise tout : switch + textes + pastilles
    updateTtsSwitchUI(on);

    const toggle = $("#tts-toggle-auto");
    if (toggle){
      toggle.textContent = on ? "Désactiver l'auto" : "Activer l'auto";
      toggle.classList.toggle("on", on);
    }
  }

  function setTtsQueueCount(n){
    const el = $("#tts-queue-count");
    if (el) setText(el, Number.isFinite(n) ? String(n) : "—");
  }

  
// Small helper: accept either a DOM element or a jQuery object
function setText(target, text) {
  if (!target) return;
  const el = (target.jquery ? target[0] : target);
  if (!el) return;
  el.textContent = (text ?? "");
}



function clearTtsPlaceholders(){
  // If there is no activity yet, we don't want placeholder text / fake entries.
  const last = document.getElementById("tts-last-read-text");
  if (last && /aucun\s+tts/i.test((last.textContent || "").trim())) last.textContent = "";

  const q = document.getElementById("tts-queue-list");
  if (q){
    Array.from(q.querySelectorAll(".tts-empty, .muted")).forEach(n => n.remove());
  }

  const h = document.getElementById("tts-history-list");
  if (h){
    h.style.display = "none";
    Array.from(h.querySelectorAll(".tts-empty, .muted")).forEach(n => n.remove());
  }

  // hide the "Historique des TTS lus" title if present (same card)
  const card = h ? h.parentElement : null;
  if (card){
    const titles = Array.from(card.querySelectorAll("h3"));
    const histTitle = titles.find(x => /historique\s+des\s+tts/i.test((x.textContent||"").trim()));
    if (histTitle) histTitle.style.display = "none";
  }
}

// ===========================
// TTS : History + Overview sync
// ===========================
// internal state to avoid duplicating the current "last TTS" into the overview history list
let __overviewTtsLastUser = "";
let __overviewTtsLastMsg  = "";


function appendToTtsHistory(user, msg){
  try {
    const u = (user ?? "").toString().trim();
    const m = (msg  ?? "").toString().trim();
    if (!u && !m) return;

    // We do NOT duplicate the current "last TTS" inside the overview list.
    // Instead, the overview list stores the *previous* last TTS (history).
    const prevU = (__overviewTtsLastUser ?? "").toString();
    const prevM = (__overviewTtsLastMsg  ?? "").toString();
    const hasPrev = (prevU.trim() || prevM.trim()) && !(prevU === u && prevM === m);

    // 1) Overview "last TTS"
    try { updateOverviewTtsLast(u, m); } catch (e) {}
    __overviewTtsLastUser = u;
    __overviewTtsLastMsg  = m;

    // 2) Full TTS panel history list is disabled (redondant avec le journal)
    const full = document.getElementById("tts-history-list");
    if (full){
      full.style.display = "none";
      const first = full.firstElementChild;
      if (first && (first.classList.contains("tts-empty") || first.classList.contains("muted"))) full.removeChild(first);
    }

    // 3) Overview list ("Messages lus") — store history, not the current last
    const qv = document.getElementById("qv-tts-list");
    if (qv){
      const first = qv.firstElementChild;
      if (first && (first.classList.contains("muted") || first.classList.contains("tts-empty"))) qv.removeChild(first);

      if (hasPrev){
        const li = document.createElement("li");
        li.textContent = (prevU.trim() && prevM.trim()) ? `${prevU} : ${prevM}` : (prevU.trim() || prevM.trim());
        qv.insertBefore(li, qv.firstChild);

        while (qv.children.length > 8) qv.removeChild(qv.lastChild);
      }
    }
  } catch (e) {
    // Never throw from UI sync (must not break GTG / other panels)
    try { console.warn("[TTS] appendToTtsHistory error:", e); } catch {}
  }
}

// Keep journal logging separate (best-effort)
function appendToTtsJournalLine(user, msg){
  try { appendTtsToJournal(user, msg); } catch (e) {}
}

function setTtsLastMessage(user, msg, opts){
    // Support multiple DOM layouts (older/newer) without breaking anything.
    const u = (user ?? "").toString().trim();
    const m = (msg  ?? "").toString().trim();
    if (!u && !m) return;

    const record = !(opts && opts.record === false);

    // Newer layout: split fields
    const uEl = $("#tts-last-user");
    const mEl = $("#tts-last-msg");
    if (uEl) setText(uEl, u);
    if (mEl) setText(mEl, m);

    // Older layout: single line field (this is what your current UI actually uses)
    const comboEl = $("#tts-last-read-text") || $("#tts-last-read") || $("#ttsLastReadText");
    if (comboEl) setText(comboEl, (u && m) ? `${u} — ${m}` : (u || m));

    // Overview card (if present)
    try { updateOverviewTtsLast(u, m); } catch (e) {}

    if (record){
      // Keep history + journal in sync (best-effort)
      appendToTtsHistory(u, m);
      appendToTtsJournalLine(u, m);
    }
}

  function setTtsNextRun(nextMs, cooldownSec){
    const nextEl = $("#tts-next-run");
    const cdEl   = $("#tts-cooldown");
    if (nextEl){
      if (Number.isFinite(nextMs) && nextMs > 0){
        const delay = Math.max(0, nextMs - Date.now());
        nextEl.textContent = formatDelay(delay);
      } else {
        nextEl.textContent = "—";
      }
    }
    if (cdEl){
      cdEl.textContent = Number.isFinite(cooldownSec) && cooldownSec > 0
        ? `${Math.round(cooldownSec)}s`
        : "—";
    }
  }

  function bindTtsControls(){
    const openBtn  = $("#tts-open-dashboard");
    const forceBtn = $("#tts-force-read");
    const toggleBtn = $("#tts-toggle-auto");

    if (openBtn && !openBtn._bound){
      openBtn._bound = true;
      openBtn.addEventListener("click", (e)=>{
        e.preventDefault();
        // Lien vers ton dashboard TTS dédié si tu en as un
        const href = openBtn.getAttribute("data-href") || openBtn.getAttribute("href") || "tts_dashboard.html";
        window.open(href, "_blank");
      });
    }

    if (forceBtn && !forceBtn._bound){
      forceBtn._bound = true;
      forceBtn.addEventListener("click", (e)=>{
        e.preventDefault();
        // Lecture forcée immédiate
        safeDoAction("TTS Reader", { reason: "manualDashboardTrigger" });
      });
    }

    if (toggleBtn && !toggleBtn._bound){
      toggleBtn._bound = true;
      toggleBtn.addEventListener("click", (e)=>{
        e.preventDefault();
        const newState = !TTS_AUTO_ENABLED;
        setTtsEnabledUI(newState); // feedback instantané
        safeDoAction("TTS Timer Set", {
          enabled: newState
        });
      });
    }
  }

  function handleTtsWidgetEvent(raw){
    const d = raw || {};
    // On accepte plusieurs formes de payload pour être tolérant
    const type = (d.type || d.eventType || d.event_type || "").toString().toLowerCase();
    const widget = (d.widget || "").toString().toLowerCase();

    // Support the payload format used by the standalone TTS dashboard
    // (Supports widget="tts-reader-selection" + eventType="ttsSelection")
    if (widget === "tts-reader-selection" || type === "ttsselection") {
      const u = d.selectedUser || d.user || d.username || d.displayName || d.display_name || "";
      const msg = d.message || d.text || "";
      if (u || msg) setTtsLastMessage(u, msg);
      if (Array.isArray(d.candidatesPanel)) setTtsQueueCount(d.candidatesPanel.length);
      if (typeof d.queueCount === "number") setTtsQueueCount(d.queueCount);
      try { console.debug("[TTS] selection payload:", d); } catch (e) {}
      return;
    }


    if (!type || type === "state" || type === "fullstate"){
      const enabled = !!(d.enabled ?? d.autoEnabled ?? d.isEnabled);
      const queue   = Number(d.queueCount ?? d.queuedCount ?? d.pendingCount ?? d.bufferSize ?? 0);
      const nextTs  = Number(d.nextRunUtcMs ?? d.nextRunTs ?? d.nextTs ?? 0);
      const cooldownSec = Number(d.cooldownSec ?? d.cooldownSeconds ?? d.cooldown ?? 0);
      const lastUser = d.lastUser ?? d.lastSender ?? d.lastAuthor ?? "";
      const lastMsg  = d.lastMessage ?? d.lastText ?? d.lastContent ?? "";

      setTtsEnabledUI(enabled);
      setTtsQueueCount(queue);
      setTtsNextRun(nextTs, cooldownSec);
      applyTtsLastEverywhere(lastUser, lastMsg);

      appendLogDebug("tts.state", {
        enabled, queue, nextTs, cooldownSec, lastUser, lastMsg
      });
      return;
    }

    if (type === "queue" || type === "queueupdate"){
      const queue   = Number(d.queueCount ?? d.queuedCount ?? d.pendingCount ?? 0);
      setTtsQueueCount(queue);
      appendLogDebug("tts.queue", { queue });
      return;
    }

    if (type === "last" || type === "lastread"){
      const lastUser = d.lastUser ?? d.lastSender ?? d.lastAuthor ?? "";
      const lastMsg  = d.lastMessage ?? d.lastText ?? d.lastContent ?? "";
      setTtsLastMessage(lastUser, lastMsg);
      appendLogDebug("tts.last", { lastUser, lastMsg });
      return;
    }

    if (type === "config" || type === "cooldown"){
      const cooldownSec = Number(d.cooldownSec ?? d.cooldownSeconds ?? d.cooldown ?? 0);
      setTtsNextRun(Number.NaN, cooldownSec);
      appendLogDebug("tts.config", { cooldownSec });
      return;
    }
  }

  /******************************************************************
   *                       🧠 Handle SB Events
   ******************************************************************/
  const asArray = (v)=> Array.isArray(v) ? v : (v == null ? [] : [v]);
  const joinList = (arr)=> (Array.isArray(arr) && arr.length) ? arr.join(", ") : "—";
  const pickNum = (...keys)=>{ for (const v of keys){ if (isNum(v)) return Math.trunc(v); } return null; };

// --- Unwrap payload helpers (Streamer.bot events sometimes nest custom payload under .data/.payload/.args) ---
function unwrapEventPayload(raw){
  let d = raw;
  for (let i = 0; i < 3; i++){
    if (!d || typeof d !== "object") break;

    // Most common wrappers
    const cand1 = d.data;
    const cand2 = d.payload;
    const cand3 = d.args;

    const looksLikeWidget = (o)=> o && typeof o === "object" && ("widget" in o || "type" in o || "message" in o || "user" in o);

    if (looksLikeWidget(cand1)) { d = cand1; continue; }
    if (looksLikeWidget(cand2)) { d = cand2; continue; }
    if (looksLikeWidget(cand3)) { d = cand3; continue; }

    break;
  }
  return d;
}


function updateOverviewTtsLast(user, msg){
  // Best-effort: don't assume overview DOM ids exist
  const candidates = [
    { u:"overview-tts-last-user", m:"overview-tts-last-msg" },
    { u:"overview-tts-user",      m:"overview-tts-msg" },
    { u:"ov-tts-user",            m:"ov-tts-msg" },
    { u:"tts-overview-user",      m:"tts-overview-msg" }
  ];
  for (const c of candidates){
    const uEl = document.getElementById(c.u);
    const mEl = document.getElementById(c.m);
    if (uEl || mEl){
      if (uEl){
        uEl.textContent = user || "";
        uEl.style.fontSize = "16px";
        uEl.style.lineHeight = "1.2";
      }
      if (mEl){
        mEl.textContent = msg || "";
        mEl.style.fontSize = "16px";
        mEl.style.lineHeight = "1.2";
      }
      return true;
    }
  }
  // Also support a single combined element if present
  const combinedIds = ["overview-tts-last", "overview-tts", "ov-tts-last"];
  for (const id of combinedIds){
    const el = document.getElementById(id);
    if (el){
      el.textContent = (user && msg) ? `${user} — ${msg}` : (user || msg || "");
      el.style.fontSize = "16px";
      el.style.lineHeight = "1.2";
      return true;
    }
  }
  return false;
}

function appendTtsToJournal(user, msg){
  // Try common ids first
  const ids = ["tts-journal", "ttsJournal", "tts-journal-box", "tts-journal-textarea", "tts-log", "ttsLog"];
  const u = (user ?? "").toString().trim();
  const m = (msg  ?? "").toString().trim();
  if (!u && !m) return false;

  const ts = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const line = (u && m) ? `${ts} — ${u} : ${m}` : `${ts} — ${u || m}`;

  for (const id of ids){
    const el = document.getElementById(id);
    if (!el) continue;

    if ("value" in el){
      el.value = (el.value ? (el.value + "\n") : "") + line;
      // keep it readable without forcing scroll
      el.style.fontSize = "14px";
      el.style.lineHeight = "1.25";
      return true;
    }
    // non-textarea container
    const div = document.createElement("div");
    div.textContent = line;
    el.appendChild(div);
    el.style.fontSize = "14px";
    el.style.lineHeight = "1.25";
    return true;
  }
  return false;
}

function applyTtsLastEverywhere(user, msg){
  const u = (user ?? "").toString().trim();
  const m = (msg  ?? "").toString().trim();
  if (!u && !m) return;

  // IMPORTANT: this is used by "state" refresh payloads.
  // We only want to UPDATE the UI, not add entries to journal/history.
  setTtsLastMessage(u, m, { record: false });
  updateOverviewTtsLast(u, m);
}





  function extractYearFromGame(g){
    if (!g || typeof g !== "object") return null;
    const direct = pickNum(g.year, g.releaseYear, g.first_release_year);
    if (direct != null) return direct;
    const ts = (isNum(g.first_release_date) ? g.first_release_date
            : isNum(g.releaseDate)        ? g.releaseDate
            : isNum(g.firstReleaseDate)   ? g.firstReleaseDate : null);
    if (ts != null){
      const ms = ts > 10000000000 ? ts : ts * 1000;
      const y = new Date(ms).getUTCFullYear();
      if (isNum(y) && y >= 1970 && y <= 2100) return y;
    }
    return null;
  }
  function extractTargetNameFromPayload(d){
    if (!d) return null;
    return d.gameDebug?.name || d.target?.name || d.answerName || d.gameName || null;
  }

  // ===== perGame : support v4/v5 (racine, runningState.perGame, champs legacy) =====
  function getPerGamePairFromAny(data){
    if (!data || typeof data !== "object") return { idx:null, goal:null };
    let src = data;
    try {
      if (src.perGame && typeof src.perGame === "object") {
        src = src.perGame;
      } else if (src.runningState && typeof src.runningState === "object" &&
                 src.runningState.perGame && typeof src.runningState.perGame === "object") {
        src = src.runningState.perGame;
      }
    } catch {}
    const idx = pickNum(
      src.roundIndex,
      src.perGameRoundIndex,
      src.perGameIndex,
      src.subRoundIndex
    );
    const goal = pickNum(
      src.roundGoal,
      src.perGameRoundCountGoal,
      src.perGameGoal,
      src.subRoundMax
    );
    return { idx, goal };
  }

  function handleSBEvent(event, data){
    try {
      const payload = unwrapEventPayload(data);
      if (event && event.type === "StreamUpdate"){
        setLiveIndicator(!!payload?.live);
      }

      // ===== TTS reader widget (via General.Custom / Broadcast.Custom) =====
      if (payload && typeof payload === "object") {
        const widgetName = (payload.widget || "").toString().toLowerCase();

        // ✅ Noms "legacy" déjà supportés
        if (widgetName === "ttsreader"
          || widgetName === "tts_dashboard"
          || widgetName === "tts-autoreader"
          || widgetName === "tts_auto_message_reader"
          || widgetName === "tts-dashboard") {
          handleTtsWidgetEvent(payload);
          return;
        }

        // ✅ Noms réels utilisés par ton dashboard TTS
        if (widgetName === "tts-reader-selection") {
          handleTtsWidgetEvent({
            type: "lastread",
            lastUser: (payload.user ?? payload.selectedUser ?? payload.lastUser ?? payload.lastSender ?? payload.author ?? ""),
            lastMessage: (payload.message ?? payload.text ?? payload.lastMessage ?? payload.lastText ?? payload.content ?? "")
          });
          return;
        }

        if (widgetName === "tts-reader-tick") {
          // On passe tout le payload : handleTtsWidgetEvent sait piocher les champs (enabled/queue/next/cooldown)
          handleTtsWidgetEvent(Object.assign({ type: "state" }, payload));
          return;
        }

        // tts-catcher : utile côté dashboard TTS (chat buffer). Ici on ne l'utilise pas, mais on garde le payload en debug.
        if (widgetName === "tts-catcher") {
          appendLogDebug("tts-catcher.raw", data);
          return;
        }
      }

      if (event?.source === "Twitch"){

        // ===== Cheer (bits) =====
        if (event.type === "Cheer"){
          logSbTwitchEventToConsole(event, data);
          const d = data || {};
          const user = extractUserName(d.user || d);
          const bits = extractBits(d);
          eventsStore.push({ id: Date.now(), type:"Cheer", user, bits, ack:false });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();
          appendLog("#events-log", `Cheer — ${user} (${bits} bits)`);
          appendLogDebug("twitch.cheer", { user, bits });
          return;
        }

        // ===== Follow =====
        if (event.type === "Follow"){
          logSbTwitchEventToConsole(event, data);
          const d = data || {};
          const user = extractFollowName(d);
          eventsStore.push({ id: Date.now(), type:"Follow", user, ack:false });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();
          appendLog("#events-log", `Follow — ${user}`);
          appendLogDebug("twitch.follow", { user });
          return;
        }

        // ===== Incoming Raid =====
        if (event.type === "Raid"){
          logSbTwitchEventToConsole(event, data);
          const d = data || {};
          const from = extractRaiderName(d);
          const user = from; // affichage principal = raider
          const viewers = extractRaidViewers(d);
          eventsStore.push({ id: Date.now(), type:"Raid", user, from, viewers, ack:false });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();
          appendLog("#events-log", `Raid — ${from} (${viewers} viewers)`);
          appendLogDebug("twitch.raid", { from, viewers });
          return;
        }

        // ===== Subs-related events =====
        if (SUB_EVENT_TYPES.has(event.type)){
        logSbSubEventToConsole(event, data);

        if (event.type === "GiftBomb"){
          const d = data || {};
          const gifter     = extractUserName(d.user || d);
          const recipients = extractRecipientNames(d.recipients);
          const giftCount  = Number.isFinite(Number(d.total)) ? Number(d.total) : (Array.isArray(d.recipients) ? d.recipients.length : 0);
          const tierLabel  = tierLabelFromAny(d.sub_tier ?? d.tier ?? d.plan ?? d.subPlan);

          eventsStore.push({ id: Date.now(), type:"GiftBomb", user: gifter, tierLabel, months:0, ack:false, recipients, giftCount });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();
          appendLog("#events-log", `GiftBomb — ${gifter} (${tierLabel}${giftCount?`, ${giftCount} gifts`:""}) → ${recipients.join(", ")||"—"}`);
          return;
        }

        if (event.type === "GiftSub"){
          const d = data || {};
          const gifter    = extractUserName(d.user || d);
          const recipient = extractRecipientName(d.recipient);
          const tierLabel = tierLabelFromAny(d.subTier ?? d.tier ?? d.plan ?? d.subPlan);

          eventsStore.push({ id: Date.now(), type:"GiftSub", user: gifter, tierLabel, months:0, ack:false, recipient });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();
          appendLog("#events-log", `GiftSub — ${gifter}${tierLabel?` (${tierLabel})`:""} → ${recipient||"—"}`);
          return;
        }

        const d = data || {};
        const user      = extractUserName(d);
        const tierLabel = tierLabelFromAny(d.tier ?? d.plan ?? d.subPlan ?? d.subTier ?? "Prime");
        const months    = extractMonths(d);

        eventsStore.push({ id: Date.now(), type: event.type, user, tierLabel, months: months || 0, ack:false });
        saveEvents(eventsStore);
        renderStoredEventsIntoUI();
        appendLog("#events-log", `${event.type} — ${user} (${tierLabel}${months>0?`, ${months} mois`:""})`);
        return;
      }
      }

      if (data && payload.widget === "gtg") {

        // ——— gagnant instantané du round ———
        if (data.type === "roundWinner"){
          const label = data.user || data.displayName || data.userName || data.name || "—";
          setWinnerLabel(label);
          appendLog("#guess-log", `Gagnant du round: ${label}${data.isStreamer ? " (Streamer)" : ""}`);
          return;
        }

        if (data.type === "partieUpdate"){
          setPartieIdUI(data.partieId || "");
          if (Number.isFinite(data.goalScore)) setGoalScoreUI(data.goalScore);
          const pg = getPerGamePairFromAny(data);
          renderPerGame(pg.idx, pg.goal);

          if (data.state === "Running"){
            setRunning(true);
          } else if (data.state === "Ended" || data.state === "Idle"){
            setRunning(false);
            stopRoundTimer();
            GTG_ROUND_ID = null;
          }
          appendLogDebug("partieUpdate", { partieId: data.partieId, goalScore: data.goalScore, state: data.state, perGame: pg });
          return;
        }

        if (data.type === "partieEnd"){
          // ===== Winner / statut partie =====
          const rawWinner = (data.winner ?? "").toString().toLowerCase();
          let winnerLabel = "—";
          let logWinner   = "";

          if (rawWinner) {
            switch (rawWinner) {
              case "streamer":
                winnerLabel = "Streamer";
                logWinner   = "Streamer";
                break;
              case "viewers":
              case "chat":
                winnerLabel = "Viewers";
                logWinner   = "Viewers";
                break;
              case "draw":
              case "tie":
                winnerLabel = "Égalité";
                logWinner   = "égalité";
                break;
              case "cancelled":
              case "canceled":
                winnerLabel = "Annulé";
                logWinner   = "annulation";
                break;
              default:
                winnerLabel = String(data.winner);
                logWinner   = String(data.winner);
                break;
            }
          }

          setWinnerLabel(winnerLabel);

          // ===== Scores finaux (totals ou champs à plat) =====
          let totals;
          if (data.totals && typeof data.totals === "object") {
            totals = {
              streamer: Number(data.totals.streamer) || 0,
              viewers:  Number(data.totals.viewers)  || 0
            };
          } else {
            totals = {
              streamer: Number(data.streamerScore ?? data.streamer) || 0,
              viewers:  Number(data.viewersScore  ?? data.viewers)  || 0
            };
          }

          GTG_TOTALS = totals;

          if (Number.isFinite(data.goalScore)) {
            GTG_GOAL = Number(data.goalScore);
          }

          renderGlobalScore(GTG_TOTALS, GTG_GOAL);
          refreshCancelAbility();

          // ===== Log détaillé =====
          const isCancelled = (rawWinner === "cancelled" || rawWinner === "canceled");
          const baseMsg     = isCancelled ? "Partie annulée." : "Partie terminée.";
          const extraWinner = logWinner ? ` Gagnant: ${logWinner}.` : "";
          const extraScore  =
            ` Score final — Streamer: ${GTG_TOTALS.streamer} / Viewers: ${GTG_TOTALS.viewers}` +
            (Number.isFinite(GTG_GOAL) ? ` (objectif ${GTG_GOAL})` : "") +
            ".";
          appendLog("#guess-log", baseMsg + extraWinner + extraScore);
          appendLogDebug("partieEnd.payload", data);

          // ===== Reset état local =====
          setRunning(false);
          stopRoundTimer();
          GTG_ROUND_ID = null;
          renderPerGame(null, null);

          // ===== HOOK OBS #3 optionnel =====
          // Emplacement prêt pour un éventuel FX OBS de fin de match.
          /*
          safeDoAction("GTG Match Winner OBS FX", {
            winner:        rawWinner || null,
            winnerLabel,               // label lisible
            streamerScore: GTG_TOTALS.streamer,
            viewersScore:  GTG_TOTALS.viewers,
            goalScore:     GTG_GOAL
          });
          */

          return;
        }

        if (data.type === "bootstrap"){
          if (data.error){ guessMsg("Erreur: " + data.error); return; }

          const genres = Array.isArray(data.genres) ? data.genres : [];
          fillGenresUI(genres);

          const OLServer = Number.isFinite(data.oldestYear) ? Number(data.oldestYear) : 1970;
          const NWServer = Number.isFinite(data.newestYear) ? Number(data.newestYear) : (new Date().getFullYear());
          const nowY = new Date().getFullYear();
          const OL = Math.min(OLServer, nowY);
          const NW = Math.min(NWServer, nowY);

          if (guessYearFromInput){ guessYearFromInput.min = String(OL); guessYearFromInput.max = String(NW); }
          if (guessYearToInput){   guessYearToInput.min   = String(OL); guessYearToInput.max   = String(NW); }

          const yf0 = parseYear(guessYearFromInput?.value);
          const yt0 = parseYear(guessYearToInput?.value);
          if (guessYearFromInput && (yf0 == null || yf0 < OL || yf0 > NW)) guessYearFromInput.value = String(OL);
          if (guessYearToInput   && (yt0 == null || yt0 < OL || yt0 > NW || yt0 < Number(guessYearFromInput.value))) guessYearToInput.value = String(NW);

          normalizeYearInputs();

          // Nouveau schéma ratings: { userRatingSteps, userVotesSteps, criticRatingSteps, criticVotesSteps }
          const ratingsCfg = (data.ratings && typeof data.ratings === "object") ? data.ratings : null;
          let ratingSteps = null;
          if (ratingsCfg) {
            if (Array.isArray(ratingsCfg.userRatingSteps) && ratingsCfg.userRatingSteps.length) {
              ratingSteps = ratingsCfg.userRatingSteps;
            } else if (Array.isArray(ratingsCfg.criticRatingSteps) && ratingsCfg.criticRatingSteps.length) {
              ratingSteps = ratingsCfg.criticRatingSteps;
            }
          }
          fillRatingStepsAll(ratingSteps || [0,50,60,70,80,85,90]);

          applyLastSetupAfterGenres();
          saveLastSetupFromUI();

          const pg = getPerGamePairFromAny(data);
          renderPerGame(pg.idx, pg.goal);

          guessMsg(`Genres chargés (${genres.length}). Période ${OL} — ${NW}`);
          appendLogDebug("bootstrap.echo", {
            ratings: data.ratings,
            oldestYear: data.oldestYear,
            newestYear: data.newestYear,
            perGame: pg
          });

          // Demande de pool immédiate
          requestPoolCount();

          // Harmoniser l'UI “secondes”
          enableSecondsModeForDurationInput();
          return;
        }

        if (data.type === "count"){
          const f = (data.filtersEcho && typeof data.filtersEcho === "object") ? data.filtersEcho : data;
          const n = (Number.isFinite(data.poolCount) ? data.poolCount : Number.isFinite(data.count) ? data.count : 0);

          const logSig = JSON.stringify({
            includeGenreId: f.includeGenreId ?? null,
            excludeGenreIds: Array.isArray(f.excludeGenreIds) ? f.excludeGenreIds.slice().sort() : [],
            yearFrom: f.yearFrom ?? null,
            yearTo:   f.yearTo   ?? null,
            minUserRating:   f.minUserRating   ?? null,
            minUserVotes:    f.minUserVotes    ?? null,
            minCriticRating: f.minCriticRating ?? null,
            minCriticVotes:  f.minCriticVotes  ?? null
          });
          const now = Date.now();
          if (LAST_COUNT_LOG_SIG !== logSig || (now - LAST_COUNT_LOG_TS) > 1500){
            appendLog("#guess-log", `Pool: ${n} jeux`);
            LAST_COUNT_LOG_SIG = logSig;
            LAST_COUNT_LOG_TS  = now;
          }
          appendLogDebug("count.filtersEcho", f);
          guessMsg(`Jeux correspondants: ${n}`);
          updatePoolBadge(n);
          return;
        }

        if (data.type === "start"){
          if (data.roundId) GTG_ROUND_ID = String(data.roundId);
          setRunning(true);

          const endMs = Number.isFinite(data.endsAtUtcMs) ? Number(data.endsAtUtcMs)
                      : Number.isFinite(data.endTs)      ? Number(data.endTs)
                      : Number.isFinite(data.endsAt)      ? Number(data.endsAt) : NaN;
          if (Number.isFinite(endMs)) startRoundTimer(endMs);

const targetName = extractTargetNameFromPayload(data);
if (targetName) appendLogDebug("target", targetName);



          const pg = getPerGamePairFromAny(data);
          renderPerGame(pg.idx, pg.goal);

          appendLog("#guess-log", "Manche démarrée");
          appendLogDebug("start.payload", data);
          refreshCancelAbility();
          return;
        }

        if (data.type === "tick"){
          const endMs = Number.isFinite(data.endsAtUtcMs) ? Number(data.endsAtUtcMs)
                      : Number.isFinite(data.endTs)      ? Number(data.endTs)
                      : Number.isFinite(data.endsAt)      ? Number(data.endsAt) : NaN;
          if (Number.isFinite(endMs)) startRoundTimer(endMs);
          appendLogDebug("tick.payload", { endsAtUtcMs: data.endsAtUtcMs ?? data.endTs ?? data.endsAt });
          return;
        }

        if (data.type === "reveal"){
          const g = data.game || {};
          const name = g.name || "—";
          const d = (data.details && typeof data.details === "object") ? data.details : {};

          const year         = isNum(d.year) ? d.year : extractYearFromGame(g);
          const userRating   = pickNum(d.userRating);
          const userVotes    = pickNum(d.userVotes);
          const criticRating = pickNum(d.criticRating);
          const criticVotes  = pickNum(d.criticVotes);
          const companies    = asArray(d.companies);

          const parts = [];
          if (isNum(year)) parts.push(String(year));
          if (userRating != null)  parts.push(`Users: ${userRating}%${userVotes?` (${userVotes})`:""}`);
          if (criticRating != null)parts.push(`Critics: ${criticRating}%${criticVotes?` (${criticVotes})`:""}`);
          if (companies.length)    parts.push(`Éditeur/Studio: ${joinList(companies)}`);

          const lw = data.lastWinner && typeof data.lastWinner === "object" ? data.lastWinner : null;
          const winner = lw ? (lw.user || lw.name || lw.label) : (data.winner || "");

          $("#guess-last-info")   && ($("#guess-last-info").textContent   = name);
          $("#qv-guess-last")     && ($("#qv-guess-last").textContent     = name);
          setWinnerLabel(winner);
          $("#guess-reveal-name") && ($("#guess-reveal-name").textContent = name);
          $("#guess-reveal-year") && ($("#guess-reveal-year").textContent = isNum(year) ? String(year) : "—");
          $("#guess-reveal-users")   && ($("#guess-reveal-users").textContent   =
            (userRating != null ? `${userRating}%` : "—") + (userVotes ? ` (${userVotes})` : ""));
          $("#guess-reveal-critics") && ($("#guess-reveal-critics").textContent =
            (criticRating != null ? `${criticRating}%` : "—") + (criticVotes ? ` (${criticVotes})` : ""));
          $("#guess-reveal-devs") && ($("#guess-reveal-devs").textContent = (companies && companies.length ? joinList(companies) : "—"));
          $("#guess-reveal-pubs") && ($("#guess-reveal-pubs").textContent = (companies && companies.length ? joinList(companies) : "—"));

          const pg = getPerGamePairFromAny(data);
          renderPerGame(pg.idx, pg.goal);

          setRunning(false);
          stopRoundTimer();
          GTG_ROUND_ID = null;

          const extra = parts.length ? ` — ${parts.join(" • ")}` : "";
          appendLog("#guess-log", `Réponse: ${name}${extra}${winner?` (gagnant: ${winner})`:""}`);
          appendLogDebug("reveal.payload", data);
          refreshCancelAbility();
          return;
        }

        if (data.type === "scoreUpdate" || data.type === "resume" || data.type === "scoreReset"){
          updateLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : []);

          const rs = data.runningState && typeof data.runningState === "object" ? data.runningState : null;
          if (rs) {
            if (rs.running === true) {
              if (rs.roundId) GTG_ROUND_ID = String(rs.roundId);
              setRunning(true);
              if (Number.isFinite(rs.endsAtUtcMs)) startRoundTimer(Number(rs.endsAtUtcMs));
            } else if (rs.running === false) {
              setRunning(false);
              stopRoundTimer();
              GTG_ROUND_ID = null;
            }
          }

          const t = (data.totals && typeof data.totals === "object")
            ? { streamer: Number(data.totals.streamer)||0, viewers: Number(data.totals.viewers)||0 }
            : { streamer: Number(data.streamer)||0,       viewers: Number(data.viewers)||0 };

          GTG_TOTALS = t;

          if (Number.isFinite(data.goalScore)) {
            GTG_GOAL = Number(data.goalScore);
          } else if (data.partie && Number.isFinite(data.partie.goalScore)) {
            GTG_GOAL = Number(data.partie.goalScore);
          }

          renderGlobalScore(GTG_TOTALS, GTG_GOAL);
          refreshCancelAbility();

          const pg = getPerGamePairFromAny(rs || data);
          renderPerGame(pg.idx, pg.goal);

          const lw = data.lastWinner && typeof data.lastWinner === "object" ? data.lastWinner : null;
          if (lw) setWinnerLabel(lw.user || lw.name || lw.label || "—");

          if (data.type === "scoreReset") appendLog("#guess-log", "Scores réinitialisés.");
          appendLogDebug(data.type + ".payload", data);
          return;
        }
      }

    } catch (e) {
      appendLog("#guess-log", "handleSBEvent outer error: " + (e?.message || e));
    }
  }

  /******************************************************************
   *                           🐞 Debug toggle + Boot Sequence
   ******************************************************************/
  function installDebugToggleButton(){
    // Évite les doublons si le boot ou le debug existent déjà
    if ($("#gtg-debug-toggle") || $("#gtg-boot-sequence")) return;

    // Bouton Debug
    const debugBtn = document.createElement("button");
    debugBtn.id = "gtg-debug-toggle";
    debugBtn.type = "button";
    debugBtn.title = "Debug verbose (affiche la cible et les payloads echo)";
    debugBtn.textContent = "🐞 Debug";
    debugBtn.className = "btn btn--ghost";
    debugBtn.style.marginLeft = "8px";

    updateDebugBtnVisual(debugBtn);
    debugBtn.addEventListener("click", ()=>{
      DEBUG_VERBOSE = !DEBUG_VERBOSE;
      updateDebugBtnVisual(debugBtn);
      appendLog("#guess-log", `Debug verbose ${DEBUG_VERBOSE?"activé":"désactivé"}`);
    });

    // Bouton Boot Sequence
    const bootBtn = document.createElement("button");
    bootBtn.id = "gtg-boot-sequence";
    bootBtn.type = "button";
    bootBtn.title = "Lancer la séquence de boot GTG (GTG Boot From Terminal)";
    bootBtn.textContent = "Boot Sequence";
    bootBtn.className = "btn btn--ghost";
    bootBtn.style.marginLeft = "8px";

    bootBtn.addEventListener("click", ()=>{
      safeDoAction("GTG Boot From Terminal", { stepNumber: 1 });
    });

    // Point d’ancrage commun
    const anchor =
      $("#gtg-reset-scores") ||
      $("#guess-end") ||
      $(".app-header .actions") ||
      $(".toolbar") ||
      $("header") || document.body;

    if (anchor && anchor.insertAdjacentElement){
      if (anchor.id === "gtg-reset-scores" || anchor.id === "guess-end"){
        // ordre: anchor -> Boot -> Debug
        anchor.insertAdjacentElement("afterend", bootBtn);
        bootBtn.insertAdjacentElement("afterend", debugBtn);
      } else {
        anchor.appendChild(bootBtn);
        anchor.appendChild(debugBtn);
      }
    } else {
      document.body.appendChild(bootBtn);
      document.body.appendChild(debugBtn);
    }
  }

  function updateDebugBtnVisual(btn){
    if (!btn) btn = $("#gtg-debug-toggle");
    if (!btn) return;
    if (DEBUG_VERBOSE){
      btn.classList.add("active");
      btn.style.background = "var(--danger, #d73a1d)";
      btn.style.color = "#fff";
      btn.style.border = "none";
    } else {
      btn.classList.remove("active");
      btn.style.background = "";
      btn.style.color = "";
      btn.style.border = "";
    }
  }

  /******************************************************************
   *                         🧭 Quick Nav + Boot
   ******************************************************************/
  function bindOverviewQuickNav(){
    $$(".qv-card").forEach(card=>{
      card.addEventListener("click", ()=>{
        const to = card.getAttribute("data-goto");
        if (to) showTab(to);
      });
    });
  }

  function boot(){
    bindLockButton();
    bindOverviewQuickNav();
    setGuessHandlers();
    installFilterChangeGuard();
    bindFiltersCollapse();
    installDebugToggleButton();
    bindTtsControls(); // === TTS mini-dashboard
    
    clearTtsPlaceholders();
connectSB();
    renderGlobalScore(GTG_TOTALS, GTG_GOAL);
    refreshCancelAbility();
    renderPerGame(null, null);
    enableSecondsModeForDurationInput();   // UI “secondes”
    updatePoolBadge(null);

    // TTS: état par défaut sur l'UI
    setTtsEnabledUI(false);
    setTtsQueueCount(0);
    setTtsLastMessage("", "");
    setTtsNextRun(Number.NaN, Number.NaN);
    updateTtsSwitchUI(false);

    // ===== Watchdog : si on croit être en cours mais qu'aucun timer n'est actif, on débloque localement =====
    setInterval(()=>{
      if (GTG_RUNNING && GTG_TIMER_ID == null) {
        appendLog("#guess-log", "Watchdog: aucune manche détectée (pas de timer) → reset état local.");
        setRunning(false);
        GTG_ROUND_ID = null;
      }
    }, 5000);
  }

  window.addEventListener("DOMContentLoaded", boot);

})();
