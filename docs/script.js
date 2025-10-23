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
  function setStoredPwd(p){ try { if (typeof p === 'string') localStorage.setItem(SB_PWD_KEY, p); } catch {} }
  function clearStoredPwd(){ try { localStorage.removeItem(SB_PWD_KEY); } catch {} }
  function getQS(name){ try { return new URLSearchParams(location.search).get(name); } catch { return null; } }

  async function ensureSbPassword({ forcePrompt=false } = {}){
    const fromQS = getQS('pw');
    if (fromQS && fromQS.trim()){
      setStoredPwd(fromQS.trim());
      return fromQS.trim();
    }
    let pwd = getStoredPwd();
    if (!forcePrompt && pwd && pwd.trim()){
      return pwd.trim();
    }
    const input = window.prompt("Mot de passe WebSocket Streamer.bot :", (pwd || "").trim());
    const cleaned = (input || "").trim();
    if (cleaned){ setStoredPwd(cleaned); }
    return cleaned;
  }

  // ===================== Tabs / UI helpers =====================
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
  $$('.qv-card').forEach(card => { const t = card.querySelector('.qv-head h2'); const to = card.dataset.goto; if (t && to) t.addEventListener('click', () => showTab(to)); });
  if ($('#year')) $('#year').textContent = new Date().getFullYear();

  // ===================== Live / WS indicators =====================
  function setWsIndicator(state){ setDot('#ws-dot', state); const txt = $('#ws-status'); if (txt) txt.textContent = state ? 'Connecté à Streamer.bot' : 'Déconnecté de Streamer.bot'; }
  function setLiveIndicator(isLive){ setDot('#live-dot', !!isLive); const t = $('#live-status'); if (t) t.textContent = isLive ? 'Live' : 'Offline'; }

  // ===================== Events store (overview) =====================
  function loadEvents(){ try { const raw = localStorage.getItem(EVENTS_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; } catch { return []; } }
  function saveEvents(list){ try { const trimmed = (list||[]).slice(0, MAX_EVENTS); localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed)); } catch {} }

  let eventsStore = loadEvents();
  let qvUnreadEvents = eventsStore.filter(e=>!e.ack).length;

  function eventLine(e){ return `<strong>${e.user}</strong> — <span class="mono">${e.type}</span> • ${e.tierLabel}${e.months>0 ? ` • ${e.months} mois` : ''}`; }
  function syncEventsStatusUI(){
    setDot('.dot-events', qvUnreadEvents > 0);
    const bQV = $('#qv-events-count'); if (bQV){ bQV.textContent = String(qvUnreadEvents); bQV.style.display = qvUnreadEvents>0?'':'none'; }
    const bTab  = $('.badge-events'); const bHead = $('#events-counter');
    if (bTab){  bTab.textContent = String(qvUnreadEvents);  bTab.style.display  = qvUnreadEvents>0?'':'none'; }
    if (bHead){ bHead.textContent = String(qvUnreadEvents); }
    const txt = $('#events-status-text'); if (txt) txt.textContent = qvUnreadEvents>0 ? 'Actif' : 'Inactif';
  }
  function updateAckInStore(eventId, isAck){
    const idx = eventsStore.findIndex(x=>x.id===eventId);
    if (idx>=0){
      const before = !!eventsStore[idx].ack;
      eventsStore[idx].ack = isAck; saveEvents(eventsStore);
      if (before !== isAck){ qvUnreadEvents += isAck ? -1 : +1; qvUnreadEvents = Math.max(0, qvUnreadEvents); syncEventsStatusUI(); }
    }
  }
  function makeItem(htmlText, onToggle, ack, id){
    const li = document.createElement('li'); li.innerHTML = htmlText;
    if (ack) li.classList.add('ack'); if (id) li.dataset.eid = String(id);
    li.addEventListener('click', (ev) => {
      if ((ev.target.tagName || '').toLowerCase() === 'a') return;
      li.classList.toggle('ack'); const isAck = li.classList.contains('ack');
      if (id){ $$(`li[data-eid="${cssEscape(id)}"]`).forEach(other => { if (other !== li) other.classList.toggle('ack', isAck); }); }
      if (typeof onToggle === 'function') onToggle(isAck); ev.stopPropagation();
    });
    return li;
  }
  function prependListItem(listEl, htmlText, onToggle, ack=false, id=null){
    if (!listEl) return; const li = makeItem(htmlText, onToggle, ack, id);
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')) listEl.removeChild(listEl.firstElementChild);
    listEl.prepend(li); const limit = listEl.classList.contains('big') ? 50 : 10; while (listEl.children.length > limit) listEl.removeChild(listEl.lastChild);
  }
  function appendListItem(listEl, htmlText, onToggle, ack=false, id=null){
    if (!listEl) return; const li = makeItem(htmlText, onToggle, ack, id);
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')) listEl.removeChild(listEl.firstElementChild);
    listEl.appendChild(li); const limit = listEl.classList.contains('big') ? 50 : 10; while (listEl.children.length > limit) listEl.removeChild(listEl.firstChild);
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
      const e = eventsStore[i]; const line = eventLine(e); const handler = (isAck)=> updateAckInStore(e.id, isAck);
      appendListItem(qv,   line, handler, e.ack, e.id);
      appendListItem(full, line, handler, e.ack, e.id);
    }
    syncEventsStatusUI();
  }
  renderStoredEventsIntoUI();

  // ===================== Public UI API (DashboardStatus) =====================
  window.DashboardStatus = {
    setStatus(name, isOn){
      setDot(`.dot-${name}`, !!isOn);
      if (name==='events') syncEventsStatusUI();
      if (name==='tts'){ const txt = $('#tts-status-text'); if (txt) txt.textContent = isOn ? 'Actif':'Inactif'; }
      if (name==='guess'){
        const txt = $('#guess-status-text'); if (txt) txt.textContent = isOn ? 'En cours':'En pause';
        const qv  = $('#qv-guess-status');   if (qv)  qv.textContent = isOn ? 'En cours':'En pause';
      }
    },
    events: {
      addSub({type, user, tierLabel, months}){
        const safeUser = displayNameFromAny(user);
        const e = { id: Date.now() + Math.random().toString(16).slice(2), type: type || 'Sub', user: safeUser, tierLabel, months: months || 0, ack: false };
        eventsStore.push(e); if (eventsStore.length > MAX_EVENTS) eventsStore = eventsStore.slice(-[MAX_EVENTS]); saveEvents(eventsStore);
        const line = eventLine(e); const handler = (isAck)=> updateAckInStore(e.id, isAck);
        prependListItem($('#qv-events-list'),   line, handler, e.ack, e.id);
        prependListItem($('#events-subs-list'), line, handler, e.ack, e.id);
        qvUnreadEvents += 1; syncEventsStatusUI();
        appendLog('#events-log', `${e.type} ${e.tierLabel} ${e.user}${e.months>0 ? ` (${e.months} mois)` : ''}`);
      },
      log(msg){ appendLog('#events-log', msg); }
    },
    tts: {
      addRead({user, message}){ const safeUser = displayNameFromAny(user); const safeMsg  = message || '';
        const html = `<strong>${safeUser}</strong> — ${safeMsg}`;
        prependListItem($('#qv-tts-list'), html); prependListItem($('#tts-read-list'), html); appendLog('#tts-log', `TTS lu: ${safeUser}: ${safeMsg}`); },
      log(msg){ appendLog('#tts-log', msg); }
    },
    guess: {
      setStatus(running){ const s = running ? 'En cours' : 'En pause'; const a = $('#guess-status-info'); if (a) a.textContent = s; },
      setLastFound({by, game}){
        const text = game ? `${game}` : '—';
        const a  = $('#guess-last-info'); if (a) a.textContent = text;
        const qv = $('#qv-guess-last');  if (qv) qv.textContent = text;
        if (by) this.setWinner(by);
      },
      setWinner(name){
        const w = $('#guess-winner'); if (w) w.textContent = (name && String(name).trim()) ? String(name) : '—';
      },
      setLeaderboard(entries){
        const ol1 = $('#qv-guess-board'); const ol2 = $('#guess-board');
        function fill(ol){
          if (!ol) return; ol.innerHTML = '';
          if (!entries || !entries.length){ const li = document.createElement('li'); li.className='muted'; li.textContent='Aucune donnée'; ol.appendChild(li); return; }
          entries.slice(0,10).forEach(e=>{ const li = document.createElement('li'); li.innerHTML = `<strong>${e.user || '—'}</strong> — ${e.score ?? 0}`; ol.appendChild(li); });
        }
        fill(ol1); fill(ol2);
      },
      setShot(url){ const img = $('#guess-shot'); if (img) img.src = url || ''; },
      log(msg){ appendLog('#guess-log', msg); }
    },
    showTab
  };

  // ===================== Guess The Game – Filtres + Timer + Pool =====================
  const guessGenreSel         = $('#guess-genre');
  const guessExcludeInput     = $('#guess-exclude-input');
  const guessDatalist         = $('#guess-genres-datalist');
  const guessExcludeChips     = $('#guess-exclude-chips');
  const guessYearFromInput    = $('#guess-year-from');
  const guessYearToInput      = $('#guess-year-to');
  const guessMinRatingSel     = $('#guess-min-rating');
  const guessDurationMinInput = $('#guess-duration-min');
  const guessStartBtn         = $('#guess-start');
  const guessEndBtn           = $('#guess-end');
  const guessMsg              = $('#guess-msg');
  const guessTimerEls         = $$('#guess-timer'); // <-- plusieurs occurences dans l'HTML
  const guessPoolEl           = $('#guess-pool-count');

  let GTG_GENRES = [];
  let GTG_EXCLUDED = new Set();
  let OLDEST_YEAR = null;
  let NEWEST_YEAR = null;

  let GTG_TIMER_ID = null;

  function setGuessMessage(msg){ if (guessMsg) guessMsg.textContent = msg || ''; }

  // ---------- Last Setup ----------
  function loadLastSetup(){
    try { const raw = localStorage.getItem(LAST_SETUP_KEY); if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return obj;
    } catch { return null; }
  }
  function saveLastSetup(partial){
    try {
      const current = loadLastSetup() || {};
      const next = Object.assign({}, current, partial || {});
      localStorage.setItem(LAST_SETUP_KEY, JSON.stringify(next));
    } catch {}
  }

  // ---------- UI helpers (inclu/exclu) ----------
  function styleIncludeSelect(hasValue){
    // met un liseré vert si une valeur est choisie ; sinon styles par défaut
    if (!guessGenreSel) return;
    if (hasValue){
      guessGenreSel.style.borderColor = 'var(--focus)';
      guessGenreSel.style.boxShadow   = '0 0 0 3px rgba(55,204,134,.15)';
    } else {
      guessGenreSel.style.borderColor = '';
      guessGenreSel.style.boxShadow   = '';
    }
  }
  function toggleExcludeUI(){
    const hasInclude = !!(guessGenreSel && guessGenreSel.value);
    const group = guessExcludeChips?.closest('.form-group'); // bloc "Genres à exclure"
    const addBtn = $('#guess-exclude-add');

    if (guessExcludeInput) guessExcludeInput.disabled = hasInclude;
    if (addBtn) addBtn.disabled = hasInclude;

    // applique aussi un style inline pour t’assurer de l’effet même sans CSS dédié
    if (group){
      group.classList.toggle('is-disabled', hasInclude); // pour ton CSS si présent
      group.style.opacity = hasInclude ? '0.55' : '';
      group.style.pointerEvents = hasInclude ? 'none' : '';
    }
    styleIncludeSelect(hasInclude);
  }

  function applyLastSetupAfterGenres(){
    const last = loadLastSetup(); if (!last) { toggleExcludeUI(); return; }

    if (guessGenreSel){
      const has = last.includeGenreId && GTG_GENRES.some(g => String(g.id)===String(last.includeGenreId));
      guessGenreSel.value = has ? String(last.includeGenreId) : "";
    }

    GTG_EXCLUDED = new Set();
    if (Array.isArray(last.excludeGenreIds) && last.excludeGenreIds.length){
      for (const id of last.excludeGenreIds){
        const s = String(id);
        if (GTG_GENRES.some(g => String(g.id)===s)) GTG_EXCLUDED.add(s);
      }
    }
    renderExcludeChips();

    if (guessYearFromInput && isNum(last.yearFrom)) guessYearFromInput.value = String(last.yearFrom);
    if (guessYearToInput   && isNum(last.yearTo))   guessYearToInput.value   = String(last.yearTo);
    normalizeYearInputs({silent:true});

    if (guessMinRatingSel){
      // réapplique la valeur sauvegardée après création des options
      guessMinRatingSel.value = (isNum(last.minRating) ? String(last.minRating) : "");
    }

    if (guessDurationMinInput){
      const dm = isNum(last.roundMinutes) ? Math.max(1, Math.min(120, Math.trunc(last.roundMinutes))) : 2;
      guessDurationMinInput.value = String(dm);
    }

    toggleExcludeUI(); // met à jour grisé + liseré vert
  }

  function attachAutoSaveListeners(){
    const saveNow = ()=> {
      const draft = collectFilters();
      const { clean } = validateFilters(draft);
      saveLastSetup({
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
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    let out = Math.trunc(n);
    if (isNum(OLDEST_YEAR)) out = Math.max(OLDEST_YEAR, out);
    if (isNum(NEWEST_YEAR)) out = Math.min(NEWEST_YEAR, out);
    return out;
  }
  function normalizeYearInputs({silent=false} = {}){
    let yf = parseYear(guessYearFromInput?.value);
    let yt = parseYear(guessYearToInput?.value);

    if (guessYearFromInput){ guessYearFromInput.min = isNum(OLDEST_YEAR)?String(OLDEST_YEAR):""; guessYearFromInput.max = isNum(NEWEST_YEAR)?String(NEWEST_YEAR):""; }
    if (guessYearToInput){   guessYearToInput.min   = isNum(OLDEST_YEAR)?String(OLDEST_YEAR):""; guessYearToInput.max   = isNum(NEWEST_YEAR)?String(NEWEST_YEAR):""; }

    if (yf != null && yt != null && yt < yf){ yt = yf; if (guessYearToInput) guessYearToInput.value = String(yt); if (!silent) setGuessMessage('Plage corrigée : Année (à) ajustée sur Année (de).'); }
    if (guessYearFromInput && yf != null) guessYearFromInput.value = String(yf);
    if (guessYearToInput   && yt != null) guessYearToInput.value   = String(yt);
  }
  guessYearFromInput?.addEventListener('input', () => { normalizeYearInputs(); saveLastSetup({yearFrom: parseYear(guessYearFromInput.value)}); requestPoolCount(); });
  guessYearToInput  ?.addEventListener('input', () => { normalizeYearInputs(); saveLastSetup({yearTo:   parseYear(guessYearToInput.value)});   requestPoolCount(); });

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
        const o = document.createElement('option');
        o.value = g.name || `#${g.id}`;
        o.dataset.id = String(g.id);
        guessDatalist.appendChild(o);
      }
    }
    applyLastSetupAfterGenres();
  }

  function fillRatingSteps(steps){
    const el = guessMinRatingSel; if (!el) return;
    const list = Array.isArray(steps) && steps.length ? steps : [0,50,60,70,80,85,90];
    el.innerHTML = '';
    const none = document.createElement('option'); none.value = ''; none.textContent = '— —'; el.appendChild(none);
    list.filter(n => typeof n === 'number' && isFinite(n))
        .sort((a,b)=>a-b)
        .forEach(v => { const o = document.createElement('option'); o.value = String(v); o.textContent = `≥ ${v}`; el.appendChild(o); });
  }

  function renderExcludeChips(){
    if (!guessExcludeChips) return;
    guessExcludeChips.innerHTML = '';
    if (GTG_EXCLUDED.size === 0){
      const span = document.createElement('span'); span.className = 'hint'; span.textContent = 'Aucun genre exclu'; guessExcludeChips.appendChild(span); return;
    }
    for (const id of GTG_EXCLUDED){
      const g = GTG_GENRES.find(x=>String(x.id)===String(id));
      const label = g?.name || `#${id}`;
      const chip = document.createElement('span');
      chip.className = 'chip chip-excl';
      chip.innerHTML = `${label} <button type="button" title="Retirer">×</button>`;
      chip.querySelector('button').addEventListener('click', ()=>{
        GTG_EXCLUDED.delete(id); renderExcludeChips();
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
    const n = Number(txt);
    if (Number.isFinite(n) && n>0) return String(n);
    const partial = GTG_GENRES.find(g => (g.name||'').toLowerCase().includes(txt.toLowerCase()));
    if (partial) return String(partial.id);
    return null;
  }

  // ===================== Validation forte côté client =====================
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
  function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

  // --- demande de poolCount auprès de Streamer.bot ---
  let client; // Streamer.bot client (unique)
  const requestPoolCount = debounce(async ()=>{
    if (!client) return;
    const draft = collectFilters();
    const { ok, clean } = validateFilters(draft);
    if (!ok) return;
    try { await safeDoAction("GTG Games Count", clean); } catch(e) { /* ignore */ }
  }, 300);

  // ===================== Timer helpers =====================
  function setTimerText(text){
    if (!guessTimerEls || !guessTimerEls.length) return;
    guessTimerEls.forEach(el => { el.textContent = text; });
  }
  function fmtMMSS(ms){
    if (!Number.isFinite(ms) || ms <= 0) return '00:00';
    const s = Math.ceil(ms/1000);
    const m = Math.floor(s/60);
    const r = s % 60;
    return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
  }
  function stopRoundTimer(){
    if (GTG_TIMER_ID){ clearInterval(GTG_TIMER_ID); GTG_TIMER_ID = null; }
    setTimerText('—:—');
  }
  function startRoundTimer(endMs){
    stopRoundTimer();
    const tick = ()=>{
      const remain = endMs - Date.now();
      setTimerText(fmtMMSS(remain));
      if (remain <= 0){ stopRoundTimer(); }
    };
    tick();
    GTG_TIMER_ID = setInterval(tick, 250);
  }

  // ===================== Streamer.bot client / safe doAction =====================
  async function safeDoAction(name, args={}){
    if (!client){ setGuessMessage('Client SB indisponible.'); throw new Error('SB client missing'); }
    const payload = { name: String(name || ''), args: (args && typeof args==='object') ? args : {} };
    if (!payload.name){ throw new Error('Action name required'); }
    try { return await client.doAction(payload); }
    catch (e1){ await new Promise(r=>setTimeout(r, 250)); return client.doAction(payload); }
  }

  async function requestScoresFromBackend(){
    try { await safeDoAction("GTG Scores Get", {}); appendLog('#guess-log', 'Requête de mise à jour des scores envoyée.'); } catch(e){ console.warn('[GTG] Échec récupération scores', e); }
  }

  // ===================== Actions Guess (Bootstrap / Start / End) =====================
  async function gtgBootstrap(){
    if (!client) return setGuessMessage('Client SB indisponible.');
    setGuessMessage('Chargement des genres…');
    try{
      await safeDoAction("GTG Bootstrap Genres & Years & Ratings", {});
      appendLog('#guess-log', 'Bootstrap demandé (genres/années/notes)…');
    }catch(e){
      console.error('[GTG] Bootstrap doAction failed', e);
      setGuessMessage('Erreur: impossible de déclencher le bootstrap.');
      DashboardStatus.guess.log('Erreur bootstrap (doAction).');
    }
  }

  async function gtgStart(){
    if (!client) return setGuessMessage('Client SB indisponible.');
    const draft = collectFilters();
    const { ok, errs, clean } = validateFilters(draft);
    if (!ok){ setGuessMessage(errs[0] || 'Filtres invalides.'); appendLog('#guess-log', 'Start annulé (validation échouée).'); return; }

    saveLastSetup({
      includeGenreId: clean.includeGenreId,
      excludeGenreIds: clean.excludeGenreIds,
      yearFrom: clean.yearFrom, yearTo: clean.yearTo,
      minRating: clean.minRating,
      roundMinutes: clean.roundMinutes
    });

    // Reset affichages
    DashboardStatus.guess.setLastFound({ by: '', game: '' });
    DashboardStatus.guess.setWinner('');

    // Fallback : démarre le timer tout de suite localement (corrigé ensuite par l’event 'start')
    const localEnd = Date.now() + clean.roundMinutes * 60 * 1000;
    startRoundTimer(localEnd);

    setGuessMessage('Manche lancée…');
    DashboardStatus.setStatus('guess', true);
    DashboardStatus.guess.setStatus(true);
    try{
      await safeDoAction("GTG Start", clean);
      appendLog('#guess-log', `Start envoyé (durée=${clean.roundMinutes} min).`);
    }catch(e){
      console.error(e);
      setGuessMessage('Erreur: impossible de lancer la sélection.');
      DashboardStatus.guess.log(`Erreur sélection jeu`);
      DashboardStatus.guess.setStatus(false);
      DashboardStatus.setStatus('guess', false);
      stopRoundTimer();
    }
  }

  async function gtgEnd(){
    if (!client) return setGuessMessage('Client SB indisponible.');
    try{ await safeDoAction("GTG End", {}); }catch{}
    DashboardStatus.guess.setStatus(false);
    DashboardStatus.setStatus('guess', false);
    setGuessMessage('En pause');
    stopRoundTimer();
  }

  // UI listeners
  $('#guess-exclude-add')?.addEventListener('click', ()=>{
    const txt = (guessExcludeInput?.value || '').trim();
    if (!txt) return;
    const id = idFromGenreInputText(txt);
    if (!id){ setGuessMessage(`Genre introuvable: “${txt}”`); return; }
    GTG_EXCLUDED.add(String(id));
    guessExcludeInput.value = '';
    renderExcludeChips();
    saveLastSetup({ excludeGenreIds: Array.from(GTG_EXCLUDED) });
    setGuessMessage('');
    requestPoolCount();
  });

  $('#guess-start')?.addEventListener('click', gtgStart);
  $('#guess-end')  ?.addEventListener('click', gtgEnd);

  attachAutoSaveListeners();

  // ===================== Sync init from backend =====================
  async function syncGuessFromBackend(){
    try{
      const run = await client.getGlobal("GTG_running");
      const isRunning = run?.status === 'ok' ? !!run.variable?.value : false;
      DashboardStatus.guess.setStatus(isRunning);
      DashboardStatus.setStatus('guess', isRunning);
    }catch{}
    try{
      const shot = await client.getGlobal("GTG_current_screenshot_url");
      const url = (shot?.status === 'ok') ? (shot.variable?.value || '') : '';
      if (url) DashboardStatus.guess.setShot(url);
    }catch{}
    try{
      const endTs = await client.getGlobal("GTG_round_end_ts_ms");
      const endMs = endTs?.status === 'ok' ? Number(endTs.variable?.value) : NaN;
      if (Number.isFinite(endMs) && endMs > Date.now()) startRoundTimer(endMs);
    }catch{}
  }

  // ===================== Bouton "Reset Scores" (avec confirmation) =====================
  (function injectResetBtn(){
    const actionsRow = $(`#tab-guess .actions-row`) || $('#tab-guess');
    if (!actionsRow) return;
    if ($('#gtg-reset-scores')) return;
    const btn = document.createElement('button');
    btn.id = 'gtg-reset-scores';
    btn.className = 'btn danger';
    btn.textContent = 'Reset Scores';
    btn.title = 'Remet tous les scores à zéro (confirmation requise)';
    btn.addEventListener('click', async ()=>{
      if (!client) return alert('Streamer.bot non connecté.');
      const ok = confirm("⚠️ Réinitialiser tous les scores GTG ?\nCette action est irréversible.");
      if (!ok) return;
      try { await safeDoAction("GTG Scores Reset", {}); appendLog('#guess-log', 'Scores GTG réinitialisés via le dashboard.'); alert('✅ Scores réinitialisés.'); }
      catch(e){ console.error(e); alert('Erreur : impossible de réinitialiser les scores.'); }
    });
    actionsRow.appendChild(btn);
  })();

  // ===================== Streamer.bot client =====================
  async function initStreamerbotClient(forcePrompt = false) {
    if (typeof StreamerbotClient === 'undefined'){
      setWsIndicator(false);
      const el = $('#ws-status'); if (el) el.textContent = 'Lib @streamerbot/client introuvable';
      return;
    }

    const el = $('#ws-status');
    if (el) el.textContent = 'Connexion…';
    let password = await ensureSbPassword({ forcePrompt });

    if (!password){
      setWsIndicator(false);
      if (el) el.textContent = 'Mot de passe requis';
      return;
    }

    try { await client?.disconnect?.(); } catch {}

    client = new StreamerbotClient({
      host: '127.0.0.1',
      port: 8080,
      endpoint: '/',
      scheme: WS_SCHEME,
      password,
      immediate: true,
      autoReconnect: true,
      retries: -1,
      subscribe: '*',
      logLevel: 'warn',
      onConnect: async (info) => {
        setWsIndicator(true);
        if (el) el.textContent = `Connecté à Streamer.bot (${info?.version || 'v?'})`;

        await syncGuessFromBackend();
        await gtgBootstrap();
        await requestScoresFromBackend();
        await syncTtsSwitchFromBackend();
        requestPoolCount();
        // sync visuel inclu/exclu au tout début
        toggleExcludeUI();
      },
      onDisconnect: async (evt = {}) => {
        setWsIndicator(false);
        if (evt.code === 1006){
          if (el) el.textContent = 'Auth invalide — ressaisir le mot de passe…';
          clearStoredPwd();
          await initStreamerbotClient(true);
          return;
        }
        const msg = `Déconnecté${evt.code ? ' — code '+evt.code : ''}${evt.reason ? ' — '+evt.reason : ''}`;
        if (el) el.textContent = msg;
      },
      onError: (err) => {
        if (el) el.textContent = 'Erreur WebSocket';
        console.warn('[SB] Error:', err);
      },
      onData: ({event, data}) => {
        // Online/offline Twitch
        if (event?.source === 'Twitch' && (event.type === 'StreamOnline' || event.type === 'StreamOffline')) {
          setLiveIndicator(event.type === 'StreamOnline'); return;
        }

        // TTS lus
        if (event?.source === 'General' && data?.widget === 'tts-reader-selection') {
          const u = displayNameFromAny(data.selectedUser || data.user || ''); const t = data.message || '';
          if (u && t) DashboardStatus.tts.addRead({ user: u, message: t }); return;
        }

        // Subs
        if (event?.source === 'Twitch' && ['Sub','ReSub','GiftSub'].includes(event.type)){
          const d = data || {};
          const user = displayNameFromAny(d.displayName ?? d.user ?? d.userName ?? d.username ?? d.sender ?? d.gifter ?? d.userInfo);
          const tierLabel = parseTierLabelFromPayload(d);
          const months    = extractMonths(d);
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
            OLDEST_YEAR = isNum(data.oldestYear) ? data.oldestYear : null;
            NEWEST_YEAR = isNum(data.newestYear) ? data.newestYear : null;
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
            } else {
              if (guessPoolEl) guessPoolEl.textContent = String(data.poolCount ?? 0);
            }
            return;
          }

          if (data.type === 'start') {
            if (data.error) {
              setGuessMessage('Erreur: ' + data.error);
              DashboardStatus.guess.log('Start erreur: ' + data.error);
              DashboardStatus.guess.setStatus(false);
              DashboardStatus.setStatus('guess', false);
              stopRoundTimer();
              return;
            }
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

          if (typeof data.running === 'boolean'){ DashboardStatus.guess.setStatus(!!data.running); DashboardStatus.setStatus('guess', !!data.running); }
          if (data.screenshotUrl){ DashboardStatus.guess.setShot(data.screenshotUrl); }
          if (typeof data.roundEndsAt !== 'undefined') {
            const endMs = Number(data.roundEndsAt);
            if (Number.isFinite(endMs) && endMs > Date.now()) startRoundTimer(endMs);
          }
          if (data.log){ DashboardStatus.guess.log(String(data.log)); }
          return;
        }
      }
    });

    // TTS switch sync
    async function syncTtsSwitchFromBackend(){
      const ttsSwitchInput = $('#tts-switch');
      const ttsSwitchLabel = $('#tts-switch-label');
      const ttsSwitchLabelText = $('.switch-label-text', ttsSwitchLabel);
      function updateTtsSwitchUI(on){
        if (!ttsSwitchInput) return;
        const val = !!on;
        ttsSwitchInput.checked = val;
        if (ttsSwitchLabelText) ttsSwitchLabelText.textContent = val ? 'TTS ON' : 'TTS OFF';
        if (ttsSwitchLabel) ttsSwitchLabel.style.opacity = val ? '1' : '0.6';
        DashboardStatus.setStatus('tts', val);
      }
      async function setTtsAutoReader(enabled){
        try { await safeDoAction("TTS Auto Message Reader Switch ON OFF", { mode: enabled ? "on" : "off" });
          updateTtsSwitchUI(enabled); appendLog('#tts-log', `Auto TTS ${enabled ? 'ON' : 'OFF'} (via bouton)`); }
        catch (e){ updateTtsSwitchUI(!enabled); appendLog('#tts-log', `Erreur: impossible de changer l’état de l’auto TTS`); alert("Impossible de changer l’état de l’auto TTS."); console.error(e); }
      }
      if (ttsSwitchInput){ ttsSwitchInput.addEventListener('change', () => setTtsAutoReader(!!ttsSwitchInput.checked)); }

      try { const resp = await client.getGlobal("ttsAutoReaderEnabled");
        const isOn = resp && resp.status === "ok" ? !!resp.variable?.value : false; updateTtsSwitchUI(isOn); }
      catch { updateTtsSwitchUI(false); }
    }
  }

  // ===================== Utils non-UI =====================
  function displayNameFromAny(val){
    if (!val) return '—';
    if (typeof val === 'string') return val;
    if (typeof val === 'object'){
      const cands = [val.displayName, val.userName, val.username, val.name, val.login, val.display, val.channel, val.broadcaster];
      for (const c of cands){ if (typeof c === 'string' && c.trim()) return c.trim(); }
      if (typeof val.id === 'string' && val.trim) { const s = val.trim(); if (s) return s; }
      if (typeof val.id === 'number') return String(val.id);
    }
    return String(val);
  }
  function parseTierLabelFromPayload(d){
    if (d?.isPrime === true || d?.prime === true || (typeof d?.subPlanName === 'string' && /prime/i.test(d.subPlanName))) return 'Prime';
    const raw0 = d?.tier ?? d?.plan ?? d?.tierId ?? d?.level ?? d?.subTier ?? d?.subscriptionPlan ?? d?.subscription?.plan ?? '';
    const s = String(raw0).toLowerCase().replace(/\s+/g,'');
    if (/prime/.test(s)) return 'Prime';
    if (/(3000|tier3|t3|\b3\b)/.test(s)) return 'T3';
    if (/(2000|tier2|t2|\b2\b)/.test(s)) return 'T2';
    if (/(1000|tier1|t1|\b1\b)/.test(s)) return 'T1';
    if (typeof raw0 === 'number'){ if (raw0===3) return 'T3'; if (raw0===2) return 'T2'; if (raw0===1) return 'T1'; }
    return 'T1';
  }
  function extractMonths(d){ return Number(d?.cumulativeMonths ?? d?.months ?? d?.streak ?? d?.totalMonths ?? d?.subscription?.months ?? 0) || 0; }

  // ===================== Lock button (réglage mot de passe) =====================
  $('#lock-btn')?.addEventListener('click', async ()=>{
    try { await client?.disconnect?.(); } catch {}
    clearStoredPwd();
    setWsIndicator(false);
    const el = $('#ws-status'); if (el) el.textContent = 'Mot de passe requis';
    await initStreamerbotClient(true);
  });

  // ===================== Boot =====================
  initStreamerbotClient();

})();
