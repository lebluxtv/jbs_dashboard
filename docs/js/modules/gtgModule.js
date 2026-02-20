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
      updateEndButtonLabelFromStatus();
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

// PATCH: Zoom auto preview (updates under "Manches par round (screenshots)")
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
      const canCancel = (GTG_PARTIE_ACTIVE || GTG_RUNNING)
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

  

// ——— Bouton "Terminer" dynamique (UI only) ———
function updateEndButtonLabelFromStatus(){
  const endBtn = document.getElementById("guess-end");
  if (!endBtn) return;

  // Default label when not running / unknown
  let label = "Terminer";

  if (GTG_RUNNING){
    const st = document.getElementById("gtg-status");
    const txt = st ? (st.textContent || "") : "";
    const m = txt.match(/Manche\s*:\s*(\d+)\s*\/\s*(\d+)/i);
    if (m){
      const idx = Number(m[1]); // 1-based
      const cap = Number(m[2]);
      if (Number.isFinite(idx) && Number.isFinite(cap) && cap > 0){
        label = (idx < cap) ? "Next screen" : "Fin du round";
      }
    }
  }

  if (endBtn.textContent !== label) endBtn.textContent = label;
}

function installEndButtonAutoLabel(){
  if (document._gtgEndBtnLabelInstalled) return;
  document._gtgEndBtnLabelInstalled = true;

  const st = document.getElementById("gtg-status");
  if (st && window.MutationObserver){
    const mo = new MutationObserver(() => updateEndButtonLabelFromStatus());
    mo.observe(st, { childList: true, subtree: true, characterData: true });
  }

  // First pass
  updateEndButtonLabelFromStatus();
}
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installEndButtonAutoLabel, { once:true });
  } else {
    installEndButtonAutoLabel();
  }
