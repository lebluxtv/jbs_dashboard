(function () {
  "use strict";

  /******************************************************************
   *                    🔧 DOM SHORTCUTS & HELPERS
   ******************************************************************/
  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

  const EVENTS_KEY     = "jbs.events.v1";
  const LAST_SETUP_KEY = "gtg.lastSetup.v1";
  const SB_PWD_KEY     = "sb_ws_password_v1";
  const MAX_EVENTS     = 100;

  const isNum = (n)=> typeof n === 'number' && Number.isFinite(n);
  const makeNonce = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);

  function getStoredPwd(){ try { return localStorage.getItem(SB_PWD_KEY) || ""; } catch { return ""; } }
  function setStoredPwd(v){ try { localStorage.setItem(SB_PWD_KEY, v || ""); } catch {} }

  function getQS(name){ try { return new URLSearchParams(location.search).get(name); } catch { return null; } }

  function appendLog(sel, text){
    const el = $(sel); if (!el) return;
    const ts = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const p = document.createElement('p');
    p.textContent = `[${ts}] ${text}`;
    el.appendChild(p); el.scrollTop = el.scrollHeight;
  }

  function setDot(selector, on){
    $$(selector).forEach(el=>{
      el.classList.remove('on','off');
      el.classList.add(on ? 'on' : 'off');
    });
  }

  // helpers statut/timer multi-emplacements
  function setStatusText(txt){
    $$('#guess-status-text, #gtg-status-text').forEach(el => { if (el) el.textContent = txt; });
  }
  function setTimerText(txt){
    $$('#guess-timer, #gtg-timer').forEach(el => { if (el) el.textContent = txt; });
  }

  /******************************************************************
   *                         🔒 LOCK / PASSWORD
   ******************************************************************/
  function setLockVisual(){
    const btn = $('#lock-btn');
    if (!btn) return;
    const hasPwd = !!getStoredPwd();
    btn.classList.toggle('locked', hasPwd);
  }

  function bindLockButton(){
    const btn = $('#lock-btn');
    if (!btn || btn._bound) return;
    btn._bound = true;

    btn.addEventListener('click', (ev)=>{
      ev.preventDefault();
      const current = getStoredPwd();
      const val = window.prompt('Mot de passe Streamer.bot (laisser vide pour effacer) :', current);
      if (val === null) return;
      setStoredPwd(val || '');
      setLockVisual();
      reconnectSB();
    });

    setLockVisual();
  }

  /******************************************************************
   *                        📊 OVERVIEW EVENTS
   ******************************************************************/
  function loadEvents(){ try { return JSON.parse(localStorage.getItem(EVENTS_KEY)||'[]') || []; } catch { return []; } }
  function saveEvents(list){ try { localStorage.setItem(EVENTS_KEY, JSON.stringify((list||[]).slice(-MAX_EVENTS))); } catch {} }

  let eventsStore = loadEvents();
  let qvUnreadEvents = eventsStore.filter(e=>!e.ack).length;

  function eventLine(e){
    if (e.type === 'GiftBomb') {
      const n = isNum(e.giftCount) ? e.giftCount : (Array.isArray(e.recipients) ? e.recipients.length : 0);
      const recShort = Array.isArray(e.recipients) ? e.recipients.slice(0,5).join(', ') + (e.recipients.length>5 ? '…' : '') : '';
      return `<strong>${e.user}</strong> — Gift Bomb <span class="muted">${e.tierLabel || ''}${n?`${e.tierLabel?' • ':''}${n} gifts`:''}</span>` + (recShort?`<br><span class="muted">→ ${recShort}</span>`:'');
    }
    if (e.type === 'GiftSub') {
      const tierTxt = e.tierLabel ? ` (${e.tierLabel})` : '';
      const toTxt = e.recipient ? ` <span class="muted">to ${e.recipient}</span>` : '';
      return `<strong>${e.user}</strong> — Gifted sub${tierTxt}${toTxt}`;
    }
    return `<strong>${e.user}</strong> — ${e.type} • ${e.tier?('Tier '+e.tier):''} • ${e.tierLabel}${e.months>0 ? ` • ${e.months} mois` : ''}`;
  }

  function syncEventsStatusUI(){
    setDot('.dot-events', qvUnreadEvents > 0);
    const bQV = $('#qv-events-count'); if (bQV){ bQV.textContent = String(qvUnreadEvents); bQV.style.display = qvUnreadEvents>0?'':'none'; }
    const bTab  = $('.badge-events');
    const bHead = $('#events-counter');
    if (bTab)  bTab.textContent  = String(qvUnreadEvents);
    if (bHead) bHead.textContent = String(qvUnreadEvents);
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
    if (!listEl) return;
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')) listEl.removeChild(listEl.firstElementChild);
    const li = makeItem(htmlText, onToggle, ack, id);
    listEl.appendChild(li);
    const limit = listEl.classList.contains('list--short') ? 6 : 60;
    while (listEl.children.length > limit) listEl.removeChild(listEl.firstChild);
  }
  function prependListItem(listEl, htmlText, onToggle, ack=false, id=null){
    if (!listEl) return;
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')){
      listEl.removeChild(listEl.firstElementChild);
    }
    const li = makeItem(htmlText, onToggle, ack, id);
    listEl.insertBefore(li, listEl.firstChild);
    const limit = listEl.classList.contains('list--short') ? 6 : 60;
    while (listEl.children.length > limit) listEl.removeChild(listEl.lastChild);
  }

  function renderStoredEventsIntoUI(){
    const qv   = $('#qv-events-list');
    const full = $('#events-subs-list');
    if (qv)   qv.innerHTML   = '';
    if (full) full.innerHTML = '';

    if (!eventsStore.length){
      if (qv)   qv.innerHTML   = '<li class="muted">Aucun sub récent</li>';
      if (full) full.innerHTML = '<li class="muted">Aucun sub</li>';
      qvUnreadEvents = 0;
      syncEventsStatusUI();
      return;
    }

    for (let i=0; i<eventsStore.length; i++){
      const e = eventsStore[i];
      const html = eventLine(e);
      const toggle = ()=>{
        e.ack = !e.ack;
        saveEvents(eventsStore);
        renderStoredEventsIntoUI();
      };
      if (qv)   prependListItem(qv,   html, toggle, e.ack, e.id);
      if (full) prependListItem(full, html, toggle, e.ack, e.id);
    }

    qvUnreadEvents = eventsStore.filter(e=>!e.ack).length;
    syncEventsStatusUI();
  }

  renderStoredEventsIntoUI();

  /******************************************************************
   *                         🧭 TABS & STATUS
   ******************************************************************/
  function showTab(name){
    $$('.tab').forEach(btn=>{
      const act = btn.dataset.tab===name;
      btn.classList.toggle('active', act);
    });
    $$('.tab-panel').forEach(p=>{
      p.style.display = (p.id===`${'tab-'+name}`) ? 'block' : 'none';
    });
    try { localStorage.setItem('jbs.activeTab', name); } catch {}
  }
  $$('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  (function initTab(){ let initial='overview'; try { initial = localStorage.getItem('jbs.activeTab') || 'overview'; } catch {} showTab(initial); })();

  function setWsIndicator(state){
    setDot('#ws-dot', state);
    const t=$('#ws-status');
    if (t) t.textContent = state ? 'Connecté à Streamer.bot' : 'Déconnecté de Streamer.bot';
  }
  function setLiveIndicator(isLive){
    setDot('#live-dot', !!isLive);
    const t=$('#live-status'); if (t) t.textContent = isLive ? 'Live' : 'Offline';
  }

  /******************************************************************
   *                  🔐 GTG RUNNING: LOCK DES FILTRES
   ******************************************************************/
  let GTG_RUNNING = false;

  function getFilterControls() {
    const roots = [
      document.querySelector('#filters'),
      document.querySelector('.filters'),
      document.querySelector('[data-filters]'),
      document.querySelector('form#filtersForm')
    ].filter(Boolean);

    const ctrls = new Set();
    roots.forEach(root => {
      root.querySelectorAll('input, select, textarea, button').forEach(el => {
        const id = (el.id || '').toLowerCase();
        const cls = (el.className || '').toLowerCase();
        const txt = (el.textContent || '').toLowerCase();
        const isStartEnd =
          id.includes('start') || id.includes('end') ||
          cls.includes('start') || cls.includes('end') ||
          txt.includes('lancer') || txt.includes('terminer') || txt.includes('stop');
        if (!isStartEnd) ctrls.add(el);
      });
    });
    return Array.from(ctrls);
  }

  function setFiltersLocked(locked) {
    const ctrls = getFilterControls();
    ctrls.forEach(el => {
      el.disabled = locked;
      if (locked) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
    });
    document.body.classList.toggle('gtg-running', !!locked);
  }

  function setRunning(running) {
    GTG_RUNNING = !!running;
    setFiltersLocked(GTG_RUNNING);
  }

  function installFilterChangeGuard(){
    if (document._gtgGuardInstalled) return;
    document._gtgGuardInstalled = true;
    ['change','input'].forEach(evt => {
      document.addEventListener(evt, (e) => {
        if (!GTG_RUNNING) return;
        const target = e.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
        const inFilters =
          target.closest('#filters, .filters, [data-filters], form#filtersForm') != null;
        if (!inFilters) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        target.disabled = true;
        console.warn('Filtres verrouillés pendant la manche GTG en cours.');
      }, true);
    });
  }

  /******************************************************************
   *                      🎮 GTG FILTERS & UI BINDINGS
   ******************************************************************/
  let GTG_GENRES = [];
  const guessGenreSel         = $('#guess-genre');
  const guessDatalist         = $('#guess-genres-datalist');
  const guessExcludeInput     = $('#guess-exclude-input');
  const guessExcludeAddBtn    = $('#guess-exclude-add');
  const guessExcludeChips     = $('#guess-exclude-chips');
  const guessYearFromInput    = $('#guess-year-from');
  const guessYearToInput      = $('#guess-year-to');
  const guessMinRatingSel     = $('#guess-min-rating');
  const guessDurationMinInput = $('#guess-duration-min');

  const guessStartBtn         = $('#guess-start');
  const guessEndBtn           = $('#guess-end');
  const guessMsgEl            = $('#guess-msg');

  function setGuessMessage(t){ if (guessMsgEl) guessMsgEl.textContent = t||''; }

  const GTG_EXCLUDED = new Set();

  function renderExcludeChips(){
    if (!guessExcludeChips) return;
    guessExcludeChips.innerHTML = '';
    if (GTG_EXCLUDED.size === 0){
      const span = document.createElement('span');
      span.className = 'hint';
      span.textContent = 'Tu peux laisser vide, ou exclure plusieurs genres.';
      guessExcludeChips.appendChild(span);
      return;
    }
    for (const id of GTG_EXCLUDED){
      const g = GTG_GENRES.find(x => String(x.id) === String(id));
      const chip = document.createElement('button');
      chip.className = 'chip chip-excl';
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

  function parseYear(val){
    const n = Number(val); if (!Number.isFinite(n)) return null;
    if (n < 1970) return 1970;
    if (n > 2100) return 2100;
    return Math.trunc(n);
  }

  function normalizeYearInputs(){
    const yf = parseYear(guessYearFromInput?.value);
    const yt = parseYear(guessYearToInput?.value);
    if (guessYearFromInput && yf != null) guessYearFromInput.value = String(yf);
    if (guessYearToInput   && yt != null) guessYearToInput.value   = String(yt);
  }

  function idFromGenreInputText(txt){
    if (!txt) return null;
    const exact = GTG_GENRES.find(g => (g.name || '').toLowerCase() === txt.toLowerCase());
    if (exact) return String(exact.id);
    const opt = Array.from(guessDatalist?.children || []).find(o => (o.value||'').toLowerCase() === txt.toLowerCase());
    if (opt?.dataset?.id) return String(opt.dataset.id);
    return null;
  }

  function fillGenresUI(genres){
    GTG_GENRES = Array.isArray(genres) ? genres : [];
    if (guessGenreSel){
      guessGenreSel.innerHTML = `<option value="">— Aucun —</option>`;
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

  function saveLastSetup(setup){
    const old = loadLastSetup();
    const merged = Object.assign({}, old, setup||{});
    try { localStorage.setItem(LAST_SETUP_KEY, JSON.stringify(merged)); } catch {}
  }
  function loadLastSetup(){
    try { return JSON.parse(localStorage.getItem(LAST_SETUP_KEY)||'{}') || {}; } catch { return {}; }
  }

  function applyLastSetupAfterGenres(){
    const s = loadLastSetup() || {};
    // include
    if (s.includeGenreId && guessGenreSel){
      const ok = GTG_GENRES.some(g => String(g.id) === String(s.includeGenreId));
      guessGenreSel.value = ok ? String(s.includeGenreId) : '';
    } else if (guessGenreSel){
      guessGenreSel.value = '';
    }
    // exclude
    GTG_EXCLUDED.clear();
    if (Array.isArray(s.excludeGenreIds)){
      for (const id of s.excludeGenreIds){
        if (GTG_GENRES.some(g => String(g.id) === String(id))) GTG_EXCLUDED.add(String(id));
      }
    }
    renderExcludeChips();
    // years
    if (isNum(s.yearFrom)) guessYearFromInput.value = String(s.yearFrom);
    if (isNum(s.yearTo))   guessYearToInput.value   = String(s.yearTo);
    // rating
    if (guessMinRatingSel){
      if (isNum(s.minRating)) guessMinRatingSel.value = String(s.minRating);
      else guessMinRatingSel.value = '';
    }
    // duration
    if (isNum(s.roundMinutes) && guessDurationMinInput) guessDurationMinInput.value = String(s.roundMinutes);
  }

  function collectFilters(){
    normalizeYearInputs();
    const includeGenreId = guessGenreSel?.value ? String(guessGenreSel.value) : "";
    const excludeGenreIds = Array.from(GTG_EXCLUDED);
    const yFrom = parseYear(guessYearFromInput?.value);
    const yTo   = parseYear(guessYearToInput?.value);
    const minRating = (guessMinRatingSel && guessMinRatingSel.value !== '') ? Number(guessMinRatingSel.value) : null;
    const mins = guessDurationMinInput ? Number(guessDurationMinInput.value) : 2;
    const durationMin = Number.isFinite(mins) ? Math.max(1, Math.min(120, Math.trunc(mins))) : 2;

    return { includeGenreId, excludeGenreIds, yearFrom: yFrom ?? null, yearTo: yTo ?? null, minRating, durationMin };
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
      if (GTG_GENRES.some(g => String(g.id) === s)){ seen.add(s); validExcl.push(s); }
    }
    const excludeClean = raw.includeGenreId ? [] : validExcl;

    let yf = raw.yearFrom, yt = raw.yearTo;
    if (yf != null && !isNum(yf)) errs.push("Année (de) invalide.");
    if (yt != null && !isNum(yt)) errs.push("Année (à) invalide.");
    if (isNum(yf) && yf < 1970) yf = 1970;
    if (isNum(yt) && yt < 1970) yt = 1970;
    if (isNum(yf) && isNum(yt) && yt < yf) yt = yf;

    const cap = new Date().getFullYear();
    if (isNum(yf) && yf > cap) yf = cap;
    if (isNum(yt) && yt > cap) yt = cap;

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

  // Normalisation locale (pour comparer à filtersEcho)
  function normalizeForEcho(clean){
    return {
      includeGenreId: clean.includeGenreId || "",
      excludeGenreIds: (Array.isArray(clean.excludeGenreIds) ? clean.excludeGenreIds : [])
        .map(String).filter(Boolean).sort(),
      yearFrom: clean.yearFrom ?? null,
      yearTo: clean.yearTo ?? null,
      minRating: clean.minRating ?? null
    };
  }
  function sameFilters(a,b){
    if (!a || !b) return false;
    if (String(a.includeGenreId||"") !== String(b.includeGenreId||"")) return false;
    const ax = (a.excludeGenreIds||[]).map(String).sort();
    const bx = (b.excludeGenreIds||[]).map(String).sort();
    if (ax.length !== bx.length) return false;
    for (let i=0;i<ax.length;i++) if (ax[i]!==bx[i]) return false;
    if (String(a.yearFrom||"") !== String(b.yearFrom||"")) return false;
    if (String(a.yearTo||"")   !== String(b.yearTo||""))   return false;
    if (String(a.minRating||"")!== String(b.minRating||""))return false;
    return true;
  }

  /******************************************************************
   *            🚀 ENVOI D’ACTIONS — ROBUSTE (avec fallback brut)
   ******************************************************************/
  let sbClient = null;

  const ACTION_ID_CACHE = new Map();
  async function resolveActionIdByName(name){
    if (!name) throw new Error('Nom action requis');
    if (ACTION_ID_CACHE.has(name)) return ACTION_ID_CACHE.get(name);
    const { actions } = await sbClient.getActions();
    const found = actions.find(a => a.name === name);
    if (!found) throw new Error(`Action introuvable: "${name}"`);
    ACTION_ID_CACHE.set(name, found.id);
    return found.id;
  }

  function sendRawDoActionById(actionId, argsObj){
    try {
      const sock = sbClient?.socket;
      if (!sock || sock.readyState !== 1) {
        appendLog('#guess-log', 'Erreur: WebSocket non prêt pour DoAction brut.');
        return false;
      }
      const wireArgs = Object.assign({}, argsObj || {}, { _json: JSON.stringify(argsObj || {}) });
      const payload = {
        request: 'DoAction',
        id: 'DoAction',
        action: { id: actionId },
        args: wireArgs
      };
      sock.send(JSON.stringify(payload));
      return true;
    } catch (e){
      appendLog('#guess-log', 'Erreur DoAction brut: ' + (e?.message||e));
      return false;
    }
  }

  async function safeDoAction(actionName, args){
    try {
      if (!sbClient){ appendLog('#guess-log', 'Client Streamer.bot non initialisé.'); return; }
      const wire = Object.assign({}, args || {}, { _json: JSON.stringify(args || {}) });
      const actionId = await resolveActionIdByName(actionName);
      try {
        await sbClient.doAction(actionId, wire);
        return;
      } catch (e) {
        appendLog('#guess-log', 'doAction client a échoué, fallback DoAction brut…');
      }
      const ok = sendRawDoActionById(actionId, wire);
      if (!ok) appendLog('#guess-log', 'Fallback DoAction brut a échoué.');
    } catch (e) {
      appendLog('#guess-log', 'Erreur safeDoAction: ' + (e?.message||e));
    }
  }

  /******************************************************************
   *                       🎛️ HANDLERS & START/END
   ******************************************************************/
  function setGuessHandlers(){
    const debounce = (fn,ms)=>{ let t=null; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
    const debounceCount = debounce(requestPoolCount, 400);

    [guessGenreSel, guessYearFromInput, guessYearToInput, guessMinRatingSel, guessDurationMinInput].forEach(el=>{
      if (!el) return;
      el.addEventListener('change', ()=>{ debounceCount(); });
      if (el === guessYearFromInput || el === guessYearToInput){
        el.addEventListener('input', ()=>{ debounceCount(); });
      }
    });

    guessExcludeAddBtn?.addEventListener('click', ()=>{
      const id = idFromGenreInputText(guessExcludeInput?.value || '');
      if (id){ GTG_EXCLUDED.add(String(id)); renderExcludeChips(); requestPoolCount(); }
      if (guessExcludeInput) guessExcludeInput.value = '';
    });

    // LANCER
    guessStartBtn?.addEventListener('click', ()=>{
      const { ok, errs, clean } = validateFilters(collectFilters());
      if (!ok){ setGuessMessage('Filtres invalides: ' + errs.join(' ; ')); return; }

      // Sauvegarde du preset dès maintenant
      saveLastSetup({
        includeGenreId: clean.includeGenreId,
        excludeGenreIds: clean.excludeGenreIds,
        yearFrom: clean.yearFrom, yearTo: clean.yearTo,
        minRating: clean.minRating,
        roundMinutes: clean.roundMinutes
      });

      const nonce = makeNonce();
      const durationSec = (clean.roundMinutes || 2) * 60;

      safeDoAction('GTG Start', {
        nonce,
        includeGenreId: clean.includeGenreId,
        excludeGenreIds: clean.excludeGenreIds,
        yearFrom: clean.yearFrom, yearTo: clean.yearTo,
        minRating: clean.minRating,
        durationSec
      });

      setRunning(true);
      setDot('.dot-guess', true);
      setStatusText('En cours'); // maj des deux emplacements
    });

    // TERMINER
    guessEndBtn?.addEventListener('click', ()=>{
      safeDoAction('GTG End', {});
      setRunning(false);
      setDot('.dot-guess', false);
      setStatusText('Terminé');
      stopRoundTimer();
    });

    renderExcludeChips();
  }

  /******************************************************************
   *                       ⏱️ ROUND TIMER UTILS
   ******************************************************************/
  let GTG_TIMER_ID = null;
  let GTG_TIMER_END = 0;

  function startRoundTimer(endMs){
    stopRoundTimer();
    if (!Number.isFinite(endMs) || endMs <= Date.now()){
      setTimerText('--:--');
      return;
    }
    GTG_TIMER_END = endMs;
    function tick(){
      const ms = Math.max(0, GTG_TIMER_END - Date.now());
      const s = Math.ceil(ms/1000);
      const m = Math.floor(s/60);
      const sec = String(s%60).padStart(2,'0');
      setTimerText(`${m}:${sec}`); // 🔁 maj de TOUS les emplacements
      if (ms <= 0) stopRoundTimer();
    }
    tick();
    GTG_TIMER_ID = setInterval(tick, 250);
  }
  function stopRoundTimer(){
    if (GTG_TIMER_ID != null) clearInterval(GTG_TIMER_ID);
    GTG_TIMER_ID = null;
    GTG_TIMER_END = 0;
    setTimerText('--:--'); // remet partout
  }

  /******************************************************************
   *                 🌐 STREAMER.BOT CLIENT
   ******************************************************************/
  function setConnected(on){ setWsIndicator(!!on); }

  function ensureSbPassword(){
    const qsPwd = getQS('pwd');
    if (qsPwd != null) { setStoredPwd(qsPwd); return qsPwd; }
    let pwd = getStoredPwd();
    if (!pwd) {
      const val = window.prompt('Mot de passe Streamer.bot :', '');
      if (val === null) return "";
      pwd = val.trim();
      setStoredPwd(pwd);
    }
    return pwd;
  }

  function reconnectSB(){
    try { if (window.sbClient && sbClient && typeof sbClient.disconnect === 'function') sbClient.disconnect(); } catch {}
    connectSB();
  }

  function connectSB(){
    try {
      const host = getQS('host') || '127.0.0.1';
      const port = Number(getQS('port') || 8080);
      const password = ensureSbPassword();

      // eslint-disable-next-line no-undef
      sbClient = new StreamerbotClient({
        host,
        port,
        endpoint: '/',
        password,
        subscribe: '*',
        immediate: true,
        autoReconnect: true,
        retries: -1,
        log: false,
        onConnect: ()=>{
          setConnected(true);
          appendLog('#guess-log', `Connecté à Streamer.bot (${host}:${port})`);
          // on attend bootstrap pour restaurer les filtres puis on fera le count
          safeDoAction('GTG Bootstrap Genres & Years & Ratings', {});
        },
        onDisconnect: ()=>{
          setConnected(false);
          appendLog('#guess-log', 'Déconnecté de Streamer.bot.');
        },
        onError: (e)=>{
          appendLog('#guess-log', 'Erreur Streamer.bot: ' + (e?.message||e));
        }
      });

      sbClient.on('*', ({ event, data }) => {
        try { handleSBEvent(event, data); } catch (e) {
          appendLog('#guess-log', 'handleSBEvent error: ' + (e?.message||e));
        }
      });

      try {
        const sock = sbClient?.socket;
        if (sock && !sock._debugBound) {
          sock._debugBound = true;
          sock.addEventListener('close', (ev)=>{
            appendLog('#guess-log', `WS close code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean}`);
          });
        }
      } catch {}
    } catch (e) {
      appendLog('#guess-log', 'Connexion impossible: ' + (e?.message||e));
    }
  }

  /******************************************************************
   *                    📬 ROUTAGE DES MESSAGES
   ******************************************************************/
  function extractUserName(d){
    if (!d) return '—';
    if (typeof d.displayName === 'string') return d.displayName;
    if (typeof d.userName === 'string')    return d.userName;
    if (typeof d.username === 'string')    return d.username;
    if (typeof d.user === 'string')        return d.user;
    if (typeof d.sender === 'string')      return d.sender;
    if (typeof d.gifter === 'string')      return d.gifter;
    if (typeof d.login === 'string')       return d.login;
    if (typeof d.name === 'string')        return d.name;
    if (d.displayName && typeof d.displayName === 'object'){
      if (typeof d.displayName.displayName === 'string') return d.displayName.displayName;
      if (typeof d.displayName.name === 'string')        return d.displayName.name;
    }
    if (d.user && typeof d.user === 'object'){
      if (typeof d.user.displayName === 'string') return d.user.displayName;
      if (typeof d.user.name === 'string')        return d.user.name;
      if (typeof d.user.login === 'string')       return d.user.login;
    }
    return '—';
  }

  function extractRecipientName(obj){
    if (!obj) return '—';
    if (typeof obj === 'string') return obj;
    if (typeof obj.name  === 'string' && obj.name)  return obj.name;
    if (typeof obj.login === 'string' && obj.login) return obj.login;
    if (typeof obj.id    === 'string' && obj.id)    return obj.id;
    return '—';
  }

  function extractRecipientNames(arr){
    if (!Array.isArray(arr)) return [];
    return arr.map(r => extractRecipientName(r));
  }

  function tierLabelFromAny(v){
    if (v == null) return '';
    const s = String(v).toLowerCase();
    if (s.includes('prime')) return 'Prime';
    if (s.includes('1000') || s.includes('tier 1') || s.includes('tier1')) return 'Tier 1';
    if (s.includes('2000') || s.includes('tier 2') || s.includes('tier2')) return 'Tier 2';
    if (s.includes('3000') || s.includes('tier 3') || s.includes('tier3')) return 'Tier 3';
    return String(v);
  }
  function extractMonths(d){
    const m = Number(d?.cumulativeMonths ?? d?.months ?? d?.streak ?? 0);
    return Number.isFinite(m) ? m : 0;
  }

  const SUB_EVENT_TYPES = new Set([
    'Sub','ReSub','GiftSub','GiftBomb',
    'MassGift','MassSubGift','CommunitySub','CommunitySubGift'
  ]);

  function logSbSubEventToConsole(evt, payload){
    try {
      const type = evt?.type || 'Unknown';
      console.groupCollapsed(`🟣 [Twitch:${type}]`);
      console.log('event:', evt);
      console.log('data :', payload);
      if (type === 'GiftBomb') {
        const gifter = extractUserName(payload?.user || payload);
        const total  = Number.isFinite(Number(payload?.total)) ? Number(payload.total)
                      : (Array.isArray(payload?.recipients) ? payload.recipients.length : null);
        const tier   = tierLabelFromAny(payload?.sub_tier ?? payload?.tier ?? payload?.plan ?? payload?.subPlan);
        const rec    = extractRecipientNames(payload?.recipients);
        console.log('gifter    :', gifter);
        console.log('tier      :', tier);
        console.log('total     :', total);
        console.log('recipients:', rec);
      } else if (type === 'GiftSub') {
        const gifter = extractUserName(payload?.user || payload);
        const recip  = extractRecipientName(payload?.recipient);
        const tier   = tierLabelFromAny(payload?.subTier ?? payload?.tier ?? payload?.plan ?? payload?.subPlan);
        console.log('gifter   :', gifter);
        console.log('recipient:', recip);
        console.log('tier     :', tier);
      } else {
        console.log('tier     :', payload?.tier ?? payload?.plan ?? payload?.subPlan ?? payload?.subTier ?? 'Prime');
        console.log('months   :', payload?.cumulativeMonths ?? payload?.months ?? payload?.streak ?? '—');
        console.log('gifter   :', payload?.gifter ?? payload?.sender ?? '—');
      }
      console.groupEnd();
    } catch (e){
      console.warn('Console log error:', e);
    }
  }

  function handleSBEvent(event, data){
    try {
      if (event && event.type === 'StreamUpdate'){ setLiveIndicator(!!data?.live); }

      if (event?.source === 'Custom' && event.type === 'DashMessage'){
        const u = extractUserName(data) || 'Inconnu';
        const t = data?.message || '';
        if (t) appendLog('#tts-log', `${u}: ${t}`);
        return;
      }

      if (event?.source === 'Twitch' && SUB_EVENT_TYPES.has(event.type)){
        logSbSubEventToConsole(event, data);

        if (event.type === 'GiftBomb') {
          const d = data || {};
          const gifter     = extractUserName(d.user || d);
          const recipients = extractRecipientNames(d.recipients);
          const giftCount  = Number.isFinite(Number(d.total)) ? Number(d.total)
                            : (Array.isArray(d.recipients) ? d.recipients.length : 0);
          const tierLabel  = tierLabelFromAny(d.sub_tier ?? d.tier ?? d.plan ?? d.subPlan);

          eventsStore.push({
            id: Date.now(),
            type: 'GiftBomb',
            user: gifter,
            tierLabel,
            months: 0,
            ack: false,
            recipients,
            giftCount
          });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();

          appendLog('#events-log', `GiftBomb — ${gifter} (${tierLabel}${giftCount?`, ${giftCount} gifts`:''}) → ${recipients.join(', ') || '—'}`);
          return;
        }

        if (event.type === 'GiftSub') {
          const d = data || {};
          const gifter    = extractUserName(d.user || d);
          const recipient = extractRecipientName(d.recipient);
          const tierLabel = tierLabelFromAny(d.subTier ?? d.tier ?? d.plan ?? d.subPlan);

          eventsStore.push({
            id: Date.now(),
            type: 'GiftSub',
            user: gifter,
            tierLabel,
            months: 0,
            ack: false,
            recipient
          });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();

          appendLog('#events-log', `GiftSub — ${gifter}${tierLabel?` (${tierLabel})`:''} → ${recipient || '—'}`);
          return;
        }

        const d = data || {};
        const user = extractUserName(d);
        const tierLabel = tierLabelFromAny(d.tier ?? d.plan ?? d.subPlan ?? d.subTier ?? 'Prime');
        const months = extractMonths(d);

        eventsStore.push({ id: Date.now(), type: event.type, user, tierLabel, months: months||0, ack: false });
        saveEvents(eventsStore);
        renderStoredEventsIntoUI();

        appendLog('#events-log', `${event.type} — ${user} (${tierLabel}${months>0?`, ${months} mois`:''})`);
        return;
      }

      // ---------- GTG payloads ----------
      if (data && data.widget === 'gtg') {

        if (data.type === 'bootstrap') {
          if (data.error) { setGuessMessage('Erreur: ' + data.error); return; }

          const genres = Array.isArray(data.genres) ? data.genres : [];
          fillGenresUI(genres);

          const OLServer = Number.isFinite(data.oldestYear) ? Number(data.oldestYear) : 1970;
          const NWServer = Number.isFinite(data.newestYear) ? Number(data.newestYear) : (new Date().getFullYear());
          const nowY = new Date().getFullYear();
          const OL = Math.min(OLServer, nowY);
          const NW = Math.min(NWServer, nowY);

          if (guessYearFromInput){ guessYearFromInput.min = String(OL); guessYearFromInput.max = String(NW); }
          if (guessYearToInput){   guessYearToInput.min   = String(OL); guessYearToInput.max   = String(NW); }

          // bornes par défaut si vides (seront écrasées par le preset)
          const yf0 = parseYear(guessYearFromInput?.value);
          const yt0 = parseYear(guessYearToInput?.value);
          if (guessYearFromInput && (yf0==null || yf0<OL || yf0>NW)) guessYearFromInput.value = String(OL);
          if (guessYearToInput   && (yt0==null || yt0<OL || yt0>NW || yt0<Number(guessYearFromInput.value))) guessYearToInput.value = String(NW);

          normalizeYearInputs();

          fillRatingSteps(Array.isArray(data.ratingSteps) && data.ratingSteps.length ? data.ratingSteps : [0,50,60,70,80,85,90]);

          // ✅ restauration complète du preset
          applyLastSetupAfterGenres();

          setGuessMessage(`Genres chargés (${genres.length}). Période ${OL} — ${NW}`);

          // ✅ Count après restauration
          requestPoolCount();
          return;
        }

        if (data.type === 'count') {
          if (data.error) {
            appendLog('#guess-log', 'Pool IGDB: erreur (' + (data.error||'') + ')');
          } else {
            const n = Number.isFinite(Number(data.poolCount)) ? Number(data.poolCount) : 0;

            const fNow  = normalizeForEcho(validateFilters(collectFilters()).clean);
            const fEcho = data.filtersEcho || null;
            const same  = fEcho ? sameFilters(fEcho, fNow) : false;

            appendLog(
              '#guess-log',
              `Pool IGDB: ${n} jeux correspondant aux filtres. (args ${same ? 'OK ✅' : 'DIFF ❌'})` +
              (fEcho
                ? `\n↳ echo={include:${fEcho.includeGenreId||''}, exclude:[${(fEcho.excludeGenreIds||[]).join(',')}], years:${fEcho.yearFrom}-${fEcho.yearTo}, min:${fEcho.minRating==null?'—':fEcho.minRating}}`
                : '')
            );
          }
          return;
        }

        if (data.type === 'start') {
          setRunning(true);
          setDot('.dot-guess', true);
          setStatusText('En cours');

          const endMs = Number(data.endsAtUtcMs ?? data.roundEndsAt);
          if (Number.isFinite(endMs) && endMs > Date.now()) startRoundTimer(endMs);

          if (data.filtersEcho) {
            const fNow  = normalizeForEcho(validateFilters(collectFilters()).clean);
            const same  = sameFilters(data.filtersEcho, fNow);
            appendLog('#guess-log', `Start args ${same ? 'OK ✅' : 'DIFF ❌'}`);
          }

          setGuessMessage('Manche lancée');
          return;
        }

        if (data.type === 'reveal') {
          stopRoundTimer();
          setRunning(false);
          setDot('.dot-guess', !!data.running);
          setStatusText(data.running ? 'En cours' : 'Terminé');

          const gameName = data.game?.name || data.gameName || '—';
          const a=$('#guess-last-info'); if (a) a.textContent = gameName;

          if (data.lastWinner){
            const winnerName = data.lastWinner.isStreamer ? 'Streamer' : (data.lastWinner.user || '');
            const w=$('#guess-winner'); if (w) w.textContent = winnerName || '—';
          }

          try {
            const d = data.details || {};
            const genres = Array.isArray(d.genres) ? d.genres : [];
            const pubs   = Array.isArray(d.publishers) ? d.publishers : [];
            const devs   = Array.isArray(d.developers) ? d.developers : [];
            const note   = (typeof d.rating === 'number') ? Math.round(d.rating) + '%' : '—';
            const year   = (d.year != null) ? String(d.year) : '—';

            const { clean:f } = validateFilters(collectFilters());
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
                .filter(Boolean).map(s => s.toLowerCase());
              const hit = genres.some(g => names.includes((g||'').toLowerCase()));
              checks.push(hit ? 'exclu ❌' : 'exclu ✅');
            }

            appendLog('#guess-log',
              'Dernier jeu: ' + gameName +
              '\nNote: ' + note + ' — Année: ' + year +
              '\nGenres: ' + (genres.join(', ') || '—') +
              '\nPublishers: ' + (pubs.join(', ') || '—') +
              '\nDevs: ' + (devs.join(', ') || '—') +
              '\nCheck filtres: ' + (checks.join(' · ') || '—')
            );
          } catch (e) {
            appendLog('#guess-log', 'Reveal details parse error: ' + (e?.message||e));
          }
          return;
        }

        if (data.type === 'scoreUpdate') {
          const lb = Array.isArray(data.leaderboard) ? data.leaderboard : [];
          const $lb = $('#guess-board');
          if ($lb){
            $lb.innerHTML = lb.length ? '' : '<li class="muted">Aucune donnée</li>';
            for (const it of lb){
              const li = document.createElement('li');
              li.textContent = `${it.user ?? it.name ?? '—'} — ${it.score ?? 0}`;
              $lb.appendChild(li);
            }
          }
          if (data.lastWinner){
            const winnerName = data.lastWinner.isStreamer ? 'Streamer' : (data.lastWinner.user || '');
            const w=$('#guess-winner'); if (w) w.textContent = winnerName || '—';
          }
          appendLog('#guess-log', `Scores reçus (${lb.length} entrées).`);
          return;
        }

        if (data.type === 'scoreReset') {
          const $lb = $('#guess-board');
          if ($lb){ $lb.innerHTML = '<li class="muted">Aucune donnée</li>'; }
          const w=$('#guess-winner'); if (w) w.textContent = '—';
          const last=$('#guess-last-info'); if (last) last.textContent = '—';
          appendLog('#guess-log', 'Scores remis à zéro (broadcast).');
          return;
        }
      }
    } catch (e) {
      appendLog('#guess-log', 'handleSBEvent error: ' + (e?.message||e));
    }
  }

  function fillRatingSteps(steps){
    const sel = $('#guess-min-rating'); if (!sel) return;
    sel.innerHTML = `<option value="">—</option>`;
    const arr = Array.isArray(steps) && steps.length ? steps : [0,50,60,70,80,85,90];
    for (const s of arr){
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = `≥ ${s}%`;
      sel.appendChild(opt);
    }
  }

  /******************************************************************
   *                📞 GAMES COUNT (à chaque changement)
   ******************************************************************/
  function requestPoolCount(){
    const { ok, clean } = validateFilters(collectFilters());
    if (!ok) return;

    const nowYear = new Date().getFullYear();
    const safeYearFrom = (typeof clean.yearFrom === 'number' && Number.isFinite(clean.yearFrom))
      ? clean.yearFrom
      : 1970;
    const safeYearTo = (typeof clean.yearTo === 'number' && Number.isFinite(clean.yearTo))
      ? Math.min(clean.yearTo, nowYear)
      : nowYear;

    const safeMin = (typeof clean.minRating === 'number' && Number.isFinite(clean.minRating))
      ? Math.max(0, Math.min(100, Math.trunc(clean.minRating)))
      : null;

    // sauvegarde automatique du preset
    saveLastSetup({
      includeGenreId: clean.includeGenreId || null,
      excludeGenreIds: Array.isArray(clean.excludeGenreIds) ? clean.excludeGenreIds : [],
      yearFrom: safeYearFrom,
      yearTo: safeYearTo,
      minRating: safeMin,
      roundMinutes: clean.roundMinutes
    });

    const payload = {
      nonce: makeNonce(),
      includeGenreId: clean.includeGenreId || "",
      excludeGenreIds: Array.isArray(clean.excludeGenreIds) ? clean.excludeGenreIds : [],
      yearFrom: safeYearFrom,
      yearTo: safeYearTo,
      minRating: safeMin
    };

    appendLog('#guess-log', `→ FRONT send count: { include:${payload.includeGenreId||''}, exclude:[${payload.excludeGenreIds.join(',')}], years:${payload.yearFrom}-${payload.yearTo}, min:${payload.minRating==null?'—':payload.minRating} }`);
    safeDoAction('GTG Games Count', payload);
  }

  /******************************************************************
   *                         🔊 TTS PANEL (UI only)
   ******************************************************************/
  function updateTtsUI(isOn){
    setDot('.dot-tts', !!isOn);
    const labelText = $('.switch-label-text');
    if (labelText) labelText.textContent = isOn ? 'TTS ON' : 'TTS OFF';
    const ov = $('#tts-status-text');
    if (ov) ov.textContent = isOn ? 'Actif' : 'Inactif';
    appendLog('#tts-log', `TTS ${isOn ? 'activé' : 'désactivé'}`);
  }

  function bindTtsSwitch(){
    const ttsSwitch = $('#tts-switch');
    if (!ttsSwitch || ttsSwitch._bound) return;
    ttsSwitch._bound = true;
    updateTtsUI(!!ttsSwitch.checked);
    ttsSwitch.addEventListener('change', ()=>{
      updateTtsUI(!!ttsSwitch.checked);
    });
  }

  /******************************************************************
   *                              INIT
   ******************************************************************/
  function boot(){
    bindLockButton();
    setGuessHandlers();
    bindTtsSwitch();
    installFilterChangeGuard();
    connectSB();
  }

  boot();

})();
