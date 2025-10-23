(function () {
  "use strict";

  // ===================== Const / Helpers =====================
  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

  const WS_SCHEME      = 'ws';
  const SB_PWD_KEY     = "sb_ws_password_v1";
  const EVENTS_KEY     = "jbs.events.v1";
  const LAST_SETUP_KEY = "gtg.lastSetup.v1";
  const MAX_EVENTS     = 200;

  const cssEscape = (v)=>{ try { return CSS.escape(String(v)); } catch { return String(v).replace(/[^\w-]/g, '\\$&'); } };
  const isNum = (n)=> typeof n === 'number' && Number.isFinite(n);

  // ----- Password storage + querystring -----
  function getStoredPwd(){ try { return localStorage.getItem(SB_PWD_KEY) || ""; } catch { return ""; } }
  function setStoredPwd(v){ try { if (typeof v === 'string') localStorage.setItem(SB_PWD_KEY, v); } catch {} }
  function getQS(name){ try { return new URLSearchParams(location.search).get(name); } catch { return null; } }

  // ===================== Tabs =====================
  function showTab(name){
    $$('.tab').forEach(btn=>{
      const act = btn.dataset.tab===name;
      btn.classList.toggle('active', act);
      btn.setAttribute('aria-selected', act ? 'true':'false');
    });
    $$('.tab-panel').forEach(p=>{
      p.style.display = (p.id===`tab-${name}`) ? 'block' : 'none';
    });
    try { localStorage.setItem('jbs.activeTab', name); } catch {}
  }
  function setDot(selector, on){ $$(selector).forEach(el=>{ el.classList.remove('on','off'); el.classList.add(on ? 'on' : 'off'); }); }
  function appendLog(sel, text){
    const el = $(sel); if (!el) return;
    const p = document.createElement('p');
    const ts = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    p.textContent = `[${ts}] ${text}`;
    el.appendChild(p); el.scrollTop = el.scrollHeight;
  }
  $$('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  (function initTab(){ let initial = 'overview'; try { initial = localStorage.getItem('jbs.activeTab') || 'overview'; } catch {} showTab(initial); })();
  $$('.qv-card').forEach(card => { const t = card.querySelector('[data-tab-target]'); const to = t?.getAttribute('data-tab-target'); if (t && to) t.addEventListener('click', () => showTab(to)); });
  if ($('#year')) $('#year').textContent = new Date().getFullYear();

  // ========== Live / WS indicators =====================
  function setWsIndicator(state){ setDot('#ws-dot', state); const t=$('#ws-status'); if (t) t.textContent = state ? 'Connecté à Streamer.bot' : 'Déconnecté de Streamer.bot'; }
  function setLiveIndicator(isLive){ setDot('#live-dot', !!isLive); const t=$('#live-status'); if (t) t.textContent = isLive ? 'Live' : 'Offline'; }

  // ===================== Events store (overview) =====================
  function loadEvents(){ try { const raw = localStorage.getItem(EVENTS_KEY); const arr = JSON.parse(raw||'[]'); return Array.isArray(arr) ? arr : []; } catch { return []; } }
  function saveEvents(list){ try { const trimmed = (list||[]).slice(-MAX_EVENTS); localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed)); } catch {} }

  let eventsStore = loadEvents();
  let qvUnreadEvents = eventsStore.filter(e=>!e.ack).length;

  function eventLine(e){ return `<strong>${e.user}</strong> — ${e.type} • ${e.tier?('Tier '+e.tier):''} • ${e.tierLabel}${e.months>0 ? ` • ${e.months} mois` : ''}`; }
  function syncEventsStatusUI(){
    setDot('.dot-events', qvUnreadEvents > 0);
    const bQV = $('#qv-events-count'); if (bQV){ bQV.textContent = String(qvUnreadEvents); bQV.style.display = qvUnreadEvents>0?'':'none'; }
    const bTab  = $('.badge-events'); const bHead = $('#events-counter');
    if (bTab)  bTab.textContent  = String(qvUnreadEvents);
    if (bHead) bHead.textContent = String(qvUnreadEvents);
  }
  function addEvent(e){
    eventsStore.push(e);
    saveEvents(eventsStore);
    qvUnreadEvents = eventsStore.filter(e=>!e.ack).length;
    renderStoredEventsIntoUI();
  }
  function markEventAck(id){
    const it = eventsStore.find(x=>x.id===id); if (it){ it.ack = true; saveEvents(eventsStore); renderStoredEventsIntoUI(); }
  }
  function makeItem(htmlText, onToggle, ack=false, id=null){
    const li = document.createElement('li');
    li.className = 'event';
    const a = document.createElement('a');
    a.href='#'; a.innerHTML = htmlText;
    a.addEventListener('click', (ev)=>{ ev.preventDefault(); try { onToggle?.(); } catch {} });
    li.appendChild(a);
    if (ack){ li.classList.add('acked'); }
    if (id!=null) li.dataset.id = String(id);
    return li;
  }
  function appendListItem(listEl, htmlText, onToggle, ack=false, id=null){
    if (!listEl) return; const li = makeItem(htmlText, onToggle, ack, id);
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')) listEl.removeChild(listEl.firstElementChild);
    listEl.appendChild(li); const limit = listEl.classList.contains('list--short') ? 6 : 60; while (listEl.children.length > limit) listEl.removeChild(listEl.firstChild);
  }
  function renderStoredEventsIntoUI(){
    const qv = $('#qv-events-list'); const full = $('#events-subs-list');
    if (qv) qv.innerHTML = ''; if (full) full.innerHTML = '';
    if (!eventsStore.length){
      if (qv) qv.innerHTML = '<li class="muted">Aucun sub récent</li>';
      if (full) full.innerHTML = '<li class="muted">Aucun sub</li>';
      syncEventsStatusUI(); return;
    }
    for (let i = 0; i < eventsStore.length; i++){
      const e = eventsStore[i];
      const html = eventLine(e);
      appendListItem(qv,   html, ()=>{ markEventAck(e.id); }, e.ack, e.id);
      appendListItem(full, html, ()=>{ markEventAck(e.id); }, e.ack, e.id);
    }
    syncEventsStatusUI();
  }
  renderStoredEventsIntoUI();

  // ===================== DashboardStatus =====================
  const DashboardStatus = {
    _areas: new Map(),
    setStatus(area, on){ const sel = `.dot-${cssEscape(area)}`; setDot(sel, !!on); },
    events: {
      addSub({type, user, tierLabel, months}){
        const qv   = $('#qv-events-list');
        const full = $('#events-subs-list');
        const html = `<strong>${user}</strong> — ${type} • ${tierLabel}${months>0?` • ${months} mois`:''}`;
        appendListItem(qv, html, ()=>{}, false, Date.now());
        appendListItem(full, html, ()=>{}, false, Date.now());
        qvUnreadEvents++;
        syncEventsStatusUI();
        appendLog('#events-log', `${type} — ${user} (${tierLabel}${months>0?`, ${months} mois`:''})`);
      }
    },
    guess: (function(){
      let _running=false;
      const $status = $('#guess-running');
      const $shot = $('#guess-shot');
      const $foundBy = $('#guess-found-by');
      const $foundGame = $('#guess-found-game');
      const $winner = $('#guess-winner');
      const $pool = $('#guess-pool');
      const $lb = $('#guess-leaderboard');
      function setStatus(on){ _running=!!on; setDot('#guess-dot', _running); if ($status) $status.textContent = _running ? 'EN COURS' : 'ARRÊTÉ'; }
      function setShot(url){ if ($shot) { if (url) { $shot.src = url; $shot.style.visibility='visible'; } else { $shot.src=''; $shot.style.visibility='hidden'; } } }
      function setLastFound({by, game}){ if ($foundBy) $foundBy.textContent = by||''; if ($foundGame) $foundGame.textContent = game||''; }
      function setWinner(name){ if ($winner) $winner.textContent = name||''; }
      function setPool(n){ if ($pool) $pool.textContent = String(Number.isFinite(n)?n:0); }
      function setLeaderboard(list){
        if (!$lb) return;
        const arr = Array.isArray(list) ? list : [];
        $lb.innerHTML = arr.length ? '' : '<li class="muted">Aucun score</li>';
        for (const it of arr){
          const li = document.createElement('li');
          li.textContent = `${it.user ?? it.name ?? '—'} — ${it.score ?? 0}`;
          $lb.appendChild(li);
        }
      }
      function log(msg){ appendLog('#guess-log', msg); }
      return { setStatus, setShot, setLastFound, setWinner, setPool, setLeaderboard, log };
    })()
  };

  // ===================== Smoothie.js (oscilloscope placeholder) =====================
  let smoothie=null; // (omitted actual chart code here for brevity, kept as in your file)

  // ===================== GTG (Guess The Game) UI =====================
  let GTG_GENRES = [];
  const guessGenreSel        = $('#guess-genre');
  const guessDatalist        = $('#guess-genre-list');
  const guessIncludeInput    = $('#guess-include-input');
  const guessExcludeInput    = $('#guess-exclude-input');
  const guessExcludeChips    = $('#guess-exclude-chips');
  const guessYearFromInput   = $('#guess-year-from');
  const guessYearToInput     = $('#guess-year-to');
  const guessMinRatingSel    = $('#guess-min-rating');
  const guessDurationMinInput= $('#guess-duration');

  const guessLaunchBtn       = $('#guess-launch');
  const guessStopBtn         = $('#guess-stop');
  const guessBootstrapBtn    = $('#guess-bootstrap');
  const guessLoadBtn         = $('#guess-load');
  const guessSaveBtn         = $('#guess-save');
  const guessPoolEl          = $('#guess-pool');

  function setGuessMessage(t){ const el=$('#guess-msg'); if (el) el.textContent = t||''; }

  // ---------- Persist last setup ----------
  function saveLastSetup(setup){
    try { localStorage.setItem(LAST_SETUP_KEY, JSON.stringify(setup||{})); } catch {}
  }
  function loadLastSetup(){
    try { return JSON.parse(localStorage.getItem(LAST_SETUP_KEY)||'{}'); } catch { return {}; }
  }

  function applyLastSetupAfterGenres(){
    const s = loadLastSetup() || {};
    if (s.includeGenreId && guessGenreSel){
      const ok = GTG_GENRES.some(g => String(g.id) === String(s.includeGenreId));
      guessGenreSel.value = ok ? String(s.includeGenreId) : '';
    }
    if (Array.isArray(s.excludeGenreIds)){
      GTG_EXCLUDED.clear();
      for (const id of s.excludeGenreIds){
        if (GTG_GENRES.some(g => String(g.id) === String(id))) GTG_EXCLUDED.add(String(id));
      }
      renderExcludeChips();
    }
    if (isNum(s.yearFrom)) guessYearFromInput.value = String(s.yearFrom);
    if (isNum(s.yearTo))   guessYearToInput.value   = String(s.yearTo);
    if (isNum(s.minRating) && guessMinRatingSel) guessMinRatingSel.value = String(s.minRating);
    if (isNum(s.roundMinutes) && guessDurationMinInput) guessDurationMinInput.value = String(s.roundMinutes);
  }

  // ---------- Launch handler ----------
  function setupLaunchHandler(){
    if (!guessLaunchBtn) return;
    const saveNow = ()=>{
      const raw = collectFilters();
      const { ok, errs, clean } = validateFilters(raw);
      if (!ok){ setGuessMessage('Filtres invalides: ' + errs.join(' ; ')); DashboardStatus.guess.log('Filtres invalides: ' + errs.join(' ; ')); return; }
      saveLastSetup(clean);
      safeDoAction('GTG Start', {
        includeGenreId: clean.includeGenreId,
        excludeGenreIds: clean.excludeGenreIds,
        yearFrom: clean.yearFrom, yearTo: clean.yearTo,
        minRating: clean.minRating,
        roundMinutes: clean.roundMinutes
      });
      requestPoolCount();
    };
    [guessGenreSel, guessYearFromInput, guessYearToInput, guessMinRatingSel, guessDurationMinInput]
      .forEach(el => el && el.addEventListener('change', saveNow));
  }

  // ---------- Year handling ----------
  function parseYear(val){
    const n = Number(val); if (!Number.isFinite(n)) return null;
    if (n < 1970) return 1970;
    if (n > 2100) return 2100;
    return Math.trunc(n);
  }
  function normalizeYearInputs({silent=false}={}){
    const yf = parseYear(guessYearFromInput?.value); const yt = parseYear(guessYearToInput?.value);
    if (guessYearFromInput && yf != null) guessYearFromInput.value = String(yf);
    if (guessYearToInput   && yt != null) guessYearToInput.value   = String(yt);
  }
  guessYearFromInput?.addEventListener('input', () => { normalizeYearInputs(); debounceRequestCount(); });
  guessYearToInput  ?.addEventListener('input', () => { normalizeYearInputs(); debounceRequestCount(); });

  function fillGenresUI(genres){
    GTG_GENRES = Array.isArray(genres) ? genres : [];
    if (guessGenreSel){
      guessGenreSel.innerHTML = `<option value="">— —</option>`;
      for (const g of GTG_GENRES){
        const opt = document.createElement('option');
        opt.value = String(g.id);
        opt.textContent = g.name || `#${g.id}`;
        guessGenreSel.appendChild(opt);
      }
    }
    if (guessDatalist){
      guessDatalist.innerHTML = '';
      for (const g of GTG_GENRES){
        const opt = document.createElement('option');
        opt.value = g.name || `#${g.id}`;
        opt.dataset.id = String(g.id);
        guessDatalist.appendChild(opt);
      }
    }
  }

  // ---------- Include/Exclude logic ----------
  const GTG_EXCLUDED = new Set();

  function toggleExcludeUI(){
    const disabled = !!(guessGenreSel?.value);
    const wrap = $('#guess-exclude-wrap');
    if (wrap){
      wrap.classList.toggle('disabled', disabled);
      wrap.classList.toggle('highlight', !disabled && GTG_EXCLUDED.size>0);
    }
  }

  function renderExcludeChips(){
    if (!guessExcludeChips) return;
    guessExcludeChips.innerHTML = '';
    if (GTG_EXCLUDED.size === 0){
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = '--';
      guessExcludeChips.appendChild(span);
      return;
    }
    for (const id of GTG_EXCLUDED){
      const g = GTG_GENRES.find(x => String(x.id) === String(id));
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = (g?.name || `#${id}`);
      chip.addEventListener('click', () => {
        GTG_EXCLUDED.delete(String(id));
        renderExcludeChips();
        saveLastSetup({ excludeGenreIds: Array.from(GTG_EXCLUDED) });
        requestPoolCount();
      });
      guessExcludeChips.appendChild(chip);
    }
  }

  // grise / active la zone exclusions selon choix d’inclusion + liseré vert
  guessGenreSel?.addEventListener('change', () => { toggleExcludeUI(); requestPoolCount(); });

  function idFromGenreInputText(txt){
    if (!txt) return null;
    const exact = GTG_GENRES.find(g => (g.name || '').toLowerCase() === txt.toLowerCase());
    if (exact) return String(exact.id);
    const opt = Array.from(guessDatalist?.children || []).find(o => (o.value||'').toLowerCase() === txt.toLowerCase());
    if (opt?.dataset?.id) return String(opt.dataset.id);
    return null;
  }

  guessIncludeInput?.addEventListener('change', ()=>{
    const id = idFromGenreInputText(guessIncludeInput.value);
    guessGenreSel.value = id || '';
    toggleExcludeUI();
    requestPoolCount();
  });

  function addExcludeByText(txt){
    const id = idFromGenreInputText(txt);
    if (!id) return;
    GTG_EXCLUDED.add(String(id));
    renderExcludeChips();
    requestPoolCount();
  }
  guessExcludeInput?.addEventListener('change', ()=> addExcludeByText(guessExcludeInput.value));

  // ---------- Save / Load ----------
  guessSaveBtn?.addEventListener('click', ()=>{
    const raw = collectFilters();
    const { ok, errs, clean } = validateFilters(raw);
    if (!ok){ setGuessMessage('Filtres invalides: ' + errs.join(' ; ')); return; }
    saveLastSetup(clean);
    setGuessMessage('Filtres sauvegardés.');
  });

  guessLoadBtn?.addEventListener('click', ()=>{
    const s = loadLastSetup() || {};
    if (s.includeGenreId && guessGenreSel){
      const ok = GTG_GENRES.some(g => String(g.id) === String(s.includeGenreId));
      guessGenreSel.value = ok ? String(s.includeGenreId) : '';
    }
    if (Array.isArray(s.excludeGenreIds)){
      GTG_EXCLUDED.clear();
      for (const id of s.excludeGenreIds){
        if (GTG_GENRES.some(g => String(g.id) === String(id))) GTG_EXCLUDED.add(String(id));
      }
      renderExcludeChips();
    }
    if (isNum(s.yearFrom)) guessYearFromInput.value = String(s.yearFrom);
    if (isNum(s.yearTo))   guessYearToInput.value   = String(s.yearTo);
    if (isNum(s.minRating) && guessMinRatingSel) guessMinRatingSel.value = String(s.minRating);
    if (isNum(s.roundMinutes) && guessDurationMinInput) guessDurationMinInput.value = String(s.roundMinutes);
    setGuessMessage('Filtres chargés.');
    requestPoolCount();
  });

  // ---------- Launch / Stop actions ----------
  guessBootstrapBtn?.addEventListener('click', ()=> safeDoAction('GTG Bootstrap Genres & Years & Ratings', {}));
  guessLaunchBtn?.addEventListener('click', ()=>{
    const { ok, errs, clean } = validateFilters(collectFilters());
    if (!ok){ setGuessMessage('Filtres invalides: ' + errs.join(' ; ')); return; }
    saveLastSetup(clean);
    safeDoAction('GTG Start', {
      includeGenreId: clean.includeGenreId,
      excludeGenreIds: clean.excludeGenreIds,
      yearFrom: clean.yearFrom, yearTo: clean.yearTo,
      minRating: clean.minRating,
      roundMinutes: clean.roundMinutes
    });
  });
  guessStopBtn?.addEventListener('click', ()=> safeDoAction('GTG End', {}));

  // ---------- Debounce for count ----------
  let _countT=null;
  function debounceRequestCount(){ clearTimeout(_countT); _countT = setTimeout(()=> requestPoolCount(), 250); }

  function requestPoolCount(){
    const { ok, errs, clean } = validateFilters(collectFilters());
    if (!ok){ if (guessPoolEl) guessPoolEl.textContent='—'; return; }
    safeDoAction('GTG Games Count', {
      includeGenreId: clean.includeGenreId,
      excludeGenreIds: clean.excludeGenreIds,
      yearFrom: clean.yearFrom, yearTo: clean.yearTo,
      minRating: clean.minRating
    });
  }

  // ---------- Validate / Collect ----------
  const OLDEST_YEAR = 1970;
  const NEWEST_YEAR = new Date().getFullYear()+1;

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
      if (GTG_GENRES.some(g => String(g.id) === s)){ seen.add(s); validExcl.push(s); }
    }
    // Inclusion choisie => exclusions ignorées totalement
    const excludeClean = raw.includeGenreId ? [] : validExcl;

    let yf = raw.yearFrom, yt = raw.yearTo;
    if (yf != null && !isNum(yf)) errs.push("Année (de) invalide.");
    if (yt != null && !isNum(yt)) errs.push("Année (à) invalide.");
    if (isNum(OLDEST_YEAR)){ if (isNum(yf) && yf < OLDEST_YEAR) yf = OLDEST_YEAR; if (isNum(yt) && yt < OLDEST_YEAR) yt = OLDEST_YEAR; }
    if (isNum(NEWEST_YEAR)){ if (isNum(yf) && yf > NEWEST_YEAR) yf = NEWEST_YEAR; if (isNum(yt) && yt > NEWEST_YEAR) yt = NEWEST_YEAR; }
    if (isNum(yf) && isNum(yt) && yt < yf) yt = yf;

    let minRating = raw.minRating;
    if (minRating != null && (!isNum(minRating) || minRating < 0 || minRating > 100)) errs.push("Note minimale invalide.");

    let roundMinutes = Number(raw.durationMin);
    if (!isNum(roundMinutes)) roundMinutes = 2;
    roundMinutes = Math.max(1, Math.min(120, Math.trunc(roundMinutes)));

    return {
      ok: errs.length === 0,
      errs,
      clean: {
        includeGenreId: raw.includeGenreId || null,
        excludeGenreIds: excludeClean,
        yearFrom: isNum(yf) ? yf : null,
        yearTo:   isNum(yt) ? yt : null,
        minRating: (minRating == null ? null : Math.trunc(minRating)),
        roundMinutes
      }
    };
  }

  function collectFilters(){
    normalizeYearInputs({silent:true});
    const includeGenreId = guessGenreSel?.value ? String(guessGenreSel.value) : "";
    const excludeGenreIds = Array.from(GTG_EXCLUDED);
    const yFrom = parseYear(guessYearFromInput?.value);
    const yTo   = parseYear(guessYearToInput?.value);
    const minRating = guessMinRatingSel && guessMinRatingSel.value !== '' ? Number(guessMinRatingSel.value) : null;

    const mins = guessDurationMinInput ? Number(guessDurationMinInput.value) : 2;
    const durationMin = Number.isFinite(mins) ? Math.max(1, Math.min(120, Math.trunc(mins))) : 2;

    return { includeGenreId, excludeGenreIds, yearFrom: yFrom ?? null, yearTo: yTo ?? null, minRating, durationMin };
  }

  // --- debounce util ---
  function debounce(fn, ms){ let t=null; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); }; }

  // ===================== WS Client =====================
  let sbClient=null;
  let wsConnected=false;

  function safeDoAction(actionName, args){
    try {
      if (!sbClient){ appendLog('#ws-log', 'Client Streamer.bot non initialisé.'); return; }
      sbClient.triggerAction({ action: actionName, args: args || {} });
    } catch (e) {
      appendLog('#ws-log', 'Erreur triggerAction: ' + (e?.message||e));
    }
  }

  function startRoundTimer(endMs){
    const el = $('#guess-timer');
    stopRoundTimer();
    if (!el || !Number.isFinite(endMs) || endMs <= Date.now()) return;
    function tick(){
      const ms = Math.max(0, endMs - Date.now());
      const s = Math.ceil(ms/1000);
      const m = Math.floor(s/60);
      const sec = String(s%60).padStart(2,'0');
      el.textContent = `${m}:${sec}`;
      if (ms <= 0) stopRoundTimer();
    }
    tick();
    el.dataset._timer = String(setInterval(tick, 250));
  }
  function stopRoundTimer(){
    const el = $('#guess-timer');
    const id = Number(el?.dataset?._timer);
    if (Number.isFinite(id)) clearInterval(id);
    if (el) el.textContent = '--:--';
    if (el?.dataset) delete el.dataset._timer;
  }

  // ===================== Message Routing =====================
  function handleSBEvent(event, data){
    try {
      // Quick-view counters (live)
      if (event && event.type === 'StreamUpdate'){
        setLiveIndicator(!!data?.live);
      }

      // TTS dashboard compatibility (kept)
      if (event?.source === 'Custom' && event.type === 'DashMessage'){
        const u = data?.user || data?.userName || data?.username || 'Inconnu';
        const t = data?.message || '';
        if (t) appendLog('#tts-log', `${u}: ${t}`);
        return;
      }

      // TTS selection (compat)
      if (data && data.widget === 'tts-reader-selection') {
        const u = displayNameFromAny(data.selectedUser || data.user || ''); const t = data.message || '';
        if (u && t) DashboardStatus.tts.addRead({ user: u, message: t }); return;
      }

      // Subs
      if (event?.source === 'Twitch' && ['Sub','ReSub','GiftSub'].includes(event.type)){
        const d = data || {};
        const user = displayNameFromAny(d.displayName ?? d.user ?? d.userName ?? d.username ?? d.sender ?? d.gifter ?? '—');
        const tierLabel = tierLabelFromAny(d.tier ?? d.plan ?? d.subPlan ?? 'Prime');
        const months = extractMonths(d);
        DashboardStatus.events.addSub({ type: event.type, user, tierLabel, months }); return;
      }

      // ---------- GTG payloads ----------
      if (data && data.widget === 'gtg') {

        if (data.type === 'bootstrap') {
          if (data.error) {
            setGuessMessage('Erreur: ' + data.error);
            DashboardStatus.guess.log('Bootstrap erreur: ' + data.error);
            return;
          }
          const genres = Array.isArray(data.genres) ? data.genres : [];
          fillGenresUI(genres);

          const OL = Number.isFinite(data.oldestYear) ? Number(data.oldestYear) : 1970;
          const NW = Number.isFinite(data.newestYear) ? Number(data.newestYear) : (new Date().getFullYear()+1);
          if (Number.isFinite(OL)) { guessYearFromInput.min = String(OL); guessYearToInput.min = String(OL); }
          if (Number.isFinite(NW)) { guessYearFromInput.max = String(NW); guessYearToInput.max = String(NW); }
          normalizeYearInputs({silent:true});
          fillRatingSteps(data.ratingSteps);
          applyLastSetupAfterGenres();
          const rangeLabel = (isNum(OLDEST_YEAR) && isNum(NEWEST_YEAR)) ? `${OLDEST_YEAR} — ${NEWEST_YEAR}` : 'plage inconnue';
          setGuessMessage(`Genres chargés (${genres.length}). Plage ${rangeLabel}.`);
          DashboardStatus.guess.log(`Genres: ${genres.length}, période: ${rangeLabel}`);

          if (typeof data.poolCount === 'number' && guessPoolEl) {
            guessPoolEl.textContent = String(data.poolCount);
          }
          requestPoolCount();
          return;
        }

        if (data.type === 'count') {
          if (data.error) {
            if (guessPoolEl) guessPoolEl.textContent = '—';
            DashboardStatus.guess.log('Count erreur: ' + data.error);
            appendLog('#guess-log', 'Pool IGDB: erreur (' + (data.error||'') + ')');
          } else {
            const n = Number.isFinite(Number(data.poolCount)) ? Number(data.poolCount) : 0;
            if (guessPoolEl) guessPoolEl.textContent = String(n);
            appendLog('#guess-log', 'Pool IGDB: ' + n + ' jeux correspondant aux filtres.');
          }
          return;
        }

        if (data.type === 'start') {
          if (typeof data.running === 'boolean'){
            DashboardStatus.guess.setStatus(!!data.running);
            DashboardStatus.setStatus('guess', !!data.running);
          }
          if (data.screenshotUrl){ DashboardStatus.guess.setShot(data.screenshotUrl); }
          const endMs = Number(data.roundEndsAt);
          if (Number.isFinite(endMs) && endMs > Date.now()) startRoundTimer(endMs);
          if (typeof data.poolCount === 'number' && guessPoolEl) guessPoolEl.textContent = String(data.poolCount);
          setGuessMessage('Manche lancée');
          return;
        }

        if (data.type === 'reveal') {
          stopRoundTimer();
          if (typeof data.running === 'boolean'){
            DashboardStatus.guess.setStatus(!!data.running);
            DashboardStatus.setStatus('guess', !!data.running);
          }
          if (data.screenshotUrl){ DashboardStatus.guess.setShot(data.screenshotUrl); }
          if (data.gameName){
            DashboardStatus.guess.setLastFound({ by: '', game: data.gameName });
          }
          if (data.lastWinner){
            const winnerName = data.lastWinner.isStreamer ? 'Streamer' : (data.lastWinner.user || '');
            DashboardStatus.guess.setWinner(winnerName);
          }

          // ---- Journal: détails du dernier jeu trouvé + check filtres ----
          try {
            const d = data.details || {};
            const genres = Array.isArray(d.genres) ? d.genres : [];
            const pubs   = Array.isArray(d.publishers) ? d.publishers : [];
            const devs   = Array.isArray(d.developers) ? d.developers : [];
            const note   = (typeof d.rating === 'number') ? Math.round(d.rating) + '%' : '—';
            const year   = (d.year != null) ? String(d.year) : '—';

            // Vérification stricte côté UI
            const vf = validateFilters(collectFilters());
            const f  = vf.clean || {};
            const checks = [];

            if (f.minRating != null){
              const ok = (typeof d.rating === 'number') && (d.rating >= f.minRating);
              checks.push(ok ? 'note ✅' : ('note ❌ (attendu ≥ ' + f.minRating + ')'));
            }

            if (f.yearFrom != null || f.yearTo != null){
              const y = Number(year);
              const inWin = Number.isFinite(y) &&
                (f.yearFrom == null || y >= f.yearFrom) &&
                (f.yearTo   == null || y <= f.yearTo);
              checks.push(inWin ? 'année ✅' : ('année ❌ (attendu ' + (f.yearFrom ?? '—') + '–' + (f.yearTo ?? '—') + ')'));
            }

            if (f.includeGenreId){
              const wanted = (GTG_GENRES.find(g => String(g.id) === String(f.includeGenreId))?.name || '').toLowerCase();
              const ok = wanted && genres.some(g => (g||'').toLowerCase() === wanted);
              checks.push(ok ? 'genre incl. ✅' : 'genre incl. ❌');
            } else if (Array.isArray(f.excludeGenreIds) && f.excludeGenreIds.length){
              const names = f.excludeGenreIds
                .map(id => GTG_GENRES.find(g => String(g.id) === String(id))?.name)
                .filter(Boolean)
                .map(s => s.toLowerCase());
              const hit = genres.some(g => names.includes((g||'').toLowerCase()));
              checks.push(hit ? 'exclu ❌' : 'exclu ✅');
            }

            appendLog('#guess-log',
              'Dernier jeu: ' + (data.gameName || '—') +
              '\nNote: ' + note + ' — Année: ' + year +
              '\nGenres: ' + (genres.join(', ') || '—') +
              '\nPublishers: ' + (pubs.join(', ') || '—') +
              '\nDevs: ' + (devs.join(', ') || '—') +
              '\nCheck filtres: ' + (checks.join(' · ') || '—')
            );
          } catch (e) {
            try { DashboardStatus.guess.log('Reveal details parse error: ' + e.message); } catch {}
          }

          return;
        }

        if (data.type === 'scoreUpdate') {
          const lb = Array.isArray(data.leaderboard) ? data.leaderboard : [];
          DashboardStatus.guess.setLeaderboard(lb);
          if (data.lastWinner){
            const winnerName = data.lastWinner.isStreamer ? 'Streamer' : (data.lastWinner.user || '');
            DashboardStatus.guess.setWinner(winnerName);
          }
          appendLog('#guess-log', `Scores reçus (${lb.length} entrées).`);
          return;
        }

        if (data.type === 'scoreReset') {
          DashboardStatus.guess.setLeaderboard([]);
          DashboardStatus.guess.setLastFound({ by: '', game: '' });
          DashboardStatus.guess.setWinner('');
          appendLog('#guess-log', 'Scores remis à zéro (broadcast).');
          return;
        }

        if (typeof data.running === 'boolean'){ DashboardStatus.guess.setStatus(!!data.running); return; }
      }

      // ... other widgets ignored
    } catch (e) {
      appendLog('#ws-log', 'handleSBEvent error: ' + (e?.message||e));
    }
  }

  // ===================== Streamer.bot Client bootstrap =====================
  function displayNameFromAny(v){ return (v||'').toString(); }
  function tierLabelFromAny(v){
    const s = (v||'').toString().toLowerCase();
    if (s.includes('prime')) return 'Prime';
    if (s.includes('1000') || s.includes('tier 1')) return 'Tier 1';
    if (s.includes('2000') || s.includes('tier 2')) return 'Tier 2';
    if (s.includes('3000') || s.includes('tier 3')) return 'Tier 3';
    return 'Sub';
  }
  function extractMonths(d){
    const m = Number(d?.cumulativeMonths ?? d?.months ?? d?.streak ?? 0);
    return Number.isFinite(m) ? m : 0;
  }

  async function connectSB(){
    try {
      const isHttps = location.protocol === 'https:';
      const scheme = isHttps ? 'wss' : WS_SCHEME;
      const host = location.hostname || 'localhost';
      const port = getQS('port') || '8080';
      const url = `${scheme}://${host}:${port}/`;
      setWsIndicator(false);

      // eslint-disable-next-line no-undef
      sbClient = new StreamerbotClient({ host, port, endpoint: '/', log: false });
      sbClient.on('Open', ()=> { setWsIndicator(true); wsConnected = true; appendLog('#ws-log', 'Connecté.'); requestPoolCount(); });
      sbClient.on('Close', ()=> { setWsIndicator(false); wsConnected = false; appendLog('#ws-log', 'Déconnecté.'); });
      sbClient.on('Error', (e)=> appendLog('#ws-log', 'Erreur: ' + (e?.message||e)));
      sbClient.on('Raw', (msg)=>{
        try {
          const obj = JSON.parse(msg.data || '{}');
          const { event, data } = obj;
          handleSBEvent(event, data);
        } catch(e) {
          // Ignore malformed
        }
      });
    } catch (e) {
      appendLog('#ws-log', 'Connexion impossible: ' + (e?.message||e));
    }
  }

  function fillRatingSteps(steps){
    const sel = guessMinRatingSel; if (!sel) return;
    sel.innerHTML = `<option value="">—</option>`;
    const arr = Array.isArray(steps) && steps.length ? steps : [50,60,70,80,85,90,92,95];
    for (const s of arr){
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = `≥ ${s}%`;
      sel.appendChild(opt);
    }
  }

  // Init
  setupLaunchHandler();
  toggleExcludeUI();
  renderExcludeChips();
  connectSB();

})();
