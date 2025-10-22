(function () {
  "use strict";

  // ============================ Helpers ============================
  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

  const SB_PWD_KEY = "sb_ws_password_v1";
  const EVENTS_KEY = "jbs.events.v1";
  const MAX_EVENTS = 200;

  const cssEscape = (v)=>{
    try { return CSS.escape(String(v)); }
    catch { return String(v).replace(/[^\w-]/g, '\\$&'); }
  };

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

  function setDot(selector, on){
    $$(selector).forEach(el=>{
      el.classList.remove('on','off');
      el.classList.add(on ? 'on' : 'off');
    });
  }

  function appendLog(sel, text){
    const el = $(sel);
    if (!el) return;
    const p = document.createElement('p');
    const ts = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    p.textContent = `[${ts}] ${text}`;
    el.appendChild(p);
    el.scrollTop = el.scrollHeight;
  }

  // ------ Items de liste (avec sync cross-vues) ------
  function makeItem(htmlText, onToggle, ack, id){
    const li = document.createElement('li');
    li.innerHTML = htmlText;
    if (ack) li.classList.add('ack');
    if (id) li.dataset.eid = String(id);

    li.addEventListener('click', (ev) => {
      if ((ev.target.tagName || '').toLowerCase() === 'a') return;

      li.classList.toggle('ack');
      const isAck = li.classList.contains('ack');

      if (id){
        $$(`li[data-eid="${cssEscape(id)}"]`).forEach(other => {
          if (other !== li) other.classList.toggle('ack', isAck);
        });
      }

      if (typeof onToggle === 'function') onToggle(isAck);
      ev.stopPropagation();
    });
    return li;
  }

  function prependListItem(listEl, htmlText, onToggle, ack=false, id=null){
    if (!listEl) return;
    const li = makeItem(htmlText, onToggle, ack, id);

    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')) {
      listEl.removeChild(listEl.firstElementChild);
    }
    listEl.prepend(li);

    const limit = listEl.classList.contains('big') ? 50 : 10;
    while (listEl.children.length > limit) listEl.removeChild(listEl.lastChild);
  }

  function appendListItem(listEl, htmlText, onToggle, ack=false, id=null){
    if (!listEl) return;
    const li = makeItem(htmlText, onToggle, ack, id);

    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')) {
      listEl.removeChild(listEl.firstElementChild);
    }
    listEl.appendChild(li);

    const limit = listEl.classList.contains('big') ? 50 : 10;
    while (listEl.children.length > limit) listEl.removeChild(listEl.firstChild);
  }

  // ============================ Tabs ============================
  $$('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  (function initTab(){
    let initial = 'overview';
    try { initial = localStorage.getItem('jbs.activeTab') || 'overview'; } catch {}
    showTab(initial);
  })();

  // Quick-view : seul le TITRE est cliquable
  $$('.qv-card').forEach(card => {
    const title = card.querySelector('.qv-head h2');
    const target = card.dataset.goto;
    if (title && target) title.addEventListener('click', () => showTab(target));
  });

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ============================ Voyants ============================
  function setWsIndicator(state){
    setDot('#ws-dot', state);
    const txt = $('#ws-status');
    if (txt) txt.textContent = state ? 'Connecté à Streamer.bot' : 'Déconnecté de Streamer.bot';
  }
  function setLiveIndicator(isLive){
    setDot('#live-dot', !!isLive);
    const t = $('#live-status'); if (t) t.textContent = isLive ? 'Live' : 'Offline';
  }

  // ============================ Persistance Events ============================
  function loadEvents(){
    try {
      const raw = localStorage.getItem(EVENTS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function saveEvents(list){
    try {
      const trimmed = (list||[]).slice(0, MAX_EVENTS);
      localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed));
    } catch {}
  }

  let eventsStore = loadEvents();                // [{id,type,user,tierLabel,months,ack}]
  let qvUnreadEvents = eventsStore.filter(e=>!e.ack).length;

  function eventLine(e){
    return `<strong>${e.user}</strong> — <span class="mono">${e.type}</span> • ${e.tierLabel}${e.months>0 ? ` • ${e.months} mois` : ''}`;
  }

  function syncEventsStatusUI(){
    setDot('.dot-events', qvUnreadEvents > 0);

    const bQV = $('#qv-events-count');
    if (bQV){ bQV.textContent = String(qvUnreadEvents); bQV.style.display = qvUnreadEvents>0?'':'none'; }

    const bTab  = $('.badge-events');
    const bHead = $('#events-counter');
    if (bTab){  bTab.textContent = String(qvUnreadEvents);  bTab.style.display  = qvUnreadEvents>0?'':'none'; }
    if (bHead){ bHead.textContent = String(qvUnreadEvents); }

    const txt = $('#events-status-text');
    if (txt) txt.textContent = qvUnreadEvents>0 ? 'Actif' : 'Inactif';
  }

  function updateAckInStore(eventId, isAck){
    const idx = eventsStore.findIndex(x=>x.id===eventId);
    if (idx>=0){
      const before = !!eventsStore[idx].ack;
      eventsStore[idx].ack = isAck;
      saveEvents(eventsStore);
      if (before !== isAck){
        qvUnreadEvents += isAck ? -1 : +1;
        qvUnreadEvents = Math.max(0, qvUnreadEvents);
        syncEventsStatusUI();
      }
    }
  }

  function renderStoredEventsIntoUI(){
    const qv = $('#qv-events-list');
    const full = $('#events-subs-list');
    if (qv){ qv.innerHTML = ''; }
    if (full){ full.innerHTML = ''; }

    if (!eventsStore.length){
      if (qv){ qv.innerHTML = '<li class="muted">Aucun sub récent</li>'; }
      if (full){ full.innerHTML = '<li class="muted">Aucun sub</li>'; }
      syncEventsStatusUI();
      return;
    }

    for (let i = 0; i < eventsStore.length; i++){
      const e = eventsStore[i];
      const line = eventLine(e);
      const handler = (isAck)=> updateAckInStore(e.id, isAck);

      appendListItem(qv,   line, handler, e.ack, e.id);
      appendListItem(full, line, handler, e.ack, e.id);
    }
    syncEventsStatusUI();
  }
  renderStoredEventsIntoUI();

  // ============================ API publique (UI) ============================
  window.DashboardStatus = {
    setStatus(name, isOn){
      setDot(`.dot-${name}`, !!isOn);

      if (name==='events') syncEventsStatusUI();

      if (name==='tts'){
        const txt = $('#tts-status-text'); if (txt) txt.textContent = isOn ? 'Actif':'Inactif';
      }

      if (name==='guess'){
        const txt = $('#guess-status-text'); if (txt) txt.textContent = isOn ? 'En cours':'En pause';
        const qv  = $('#qv-guess-status');   if (qv)  qv.textContent = isOn ? 'En cours':'En pause';
      }
    },

    // --------------------------- Events (SUBS) ---------------------------
    events: {
      addSub({type, user, tierLabel, months}){
        const safeUser = displayNameFromAny(user);
        const e = {
          id: Date.now() + Math.random().toString(16).slice(2),
          type: type || 'Sub',
          user: safeUser,
          tierLabel,
          months: months || 0,
          ack: false
        };
        eventsStore.push(e);
        if (eventsStore.length > MAX_EVENTS) eventsStore = eventsStore.slice(-MAX_EVENTS);
        saveEvents(eventsStore);

        const line = eventLine(e);
        const handler = (isAck)=> updateAckInStore(e.id, isAck);

        prependListItem($('#qv-events-list'),   line, handler, e.ack, e.id);
        prependListItem($('#events-subs-list'), line, handler, e.ack, e.id);

        qvUnreadEvents += 1;
        syncEventsStatusUI();

        appendLog('#events-log', `${e.type} ${e.tierLabel} ${e.user}${e.months>0 ? ` (${e.months} mois)` : ''}`);
      },
      log(msg){ appendLog('#events-log', msg); }
    },

    // --------------------------- TTS ---------------------------
    tts: {
      addRead({user, message}){
        const safeUser = displayNameFromAny(user);
        const safeMsg  = message || '';
        const html = `<strong>${safeUser}</strong> — ${safeMsg}`;
        prependListItem($('#qv-tts-list'), html);
        prependListItem($('#tts-read-list'), html);
        appendLog('#tts-log', `TTS lu: ${safeUser}: ${safeMsg}`);
      },
      log(msg){ appendLog('#tts-log', msg); }
    },

    // --------------------------- Guess --------------------------
    guess: {
      setStatus(running){
        const s = running ? 'En cours' : 'En pause';
        const a = $('#guess-status-info'); if (a) a.textContent = s;
      },
      setLastFound({by, game}){
        const label = by === 'streamer' ? 'Streamer' : (by || '—');
        const text = game ? `${game} (par ${label})` : '—';
        const qv = $('#qv-guess-last'); if (qv) qv.textContent = text;
        const a  = $('#guess-last-info'); if (a) a.textContent = text;
      },
      setLeaderboard(entries){
        const ol1 = $('#qv-guess-board');
        const ol2 = $('#guess-board');
        function fill(ol){
          if (!ol) return;
          ol.innerHTML = '';
          if (!entries || !entries.length){
            const li = document.createElement('li'); li.className='muted'; li.textContent='Aucune donnée'; ol.appendChild(li); return;
          }
          entries.slice(0,10).forEach(e=>{
            const li = document.createElement('li');
            li.innerHTML = `<strong>${e.user || '—'}</strong> — ${e.score ?? 0}`;
            ol.appendChild(li);
          });
        }
        fill(ol1); fill(ol2);
      },
      setShot(url){
        const img = $('#guess-shot');
        if (img) img.src = url || '';
      },
      log(msg){ appendLog('#guess-log', msg); }
    },

    showTab
  };

  // ============================ Normalisation ============================
  function displayNameFromAny(val){
    if (!val) return '—';
    if (typeof val === 'string') return val;
    if (typeof val === 'object'){
      const cands = [
        val.displayName, val.userName, val.username, val.name,
        val.login, val.display, val.channel, val.broadcaster
      ];
      for (const c of cands){
        if (typeof c === 'string' && c.trim()) return c.trim();
      }
      if (typeof val.id === 'string' && val.id.trim()) return val.id.trim();
      if (typeof val.id === 'number') return String(val.id);
    }
    return String(val);
  }

  function parseTierLabelFromPayload(d){
    if (d?.isPrime === true || d?.prime === true || (typeof d?.subPlanName === 'string' && /prime/i.test(d.subPlanName))) {
      return 'Prime';
    }
    const raw0 =
      d?.tier ?? d?.plan ?? d?.tierId ?? d?.level ??
      d?.subTier ?? d?.subscriptionPlan ?? d?.subscription?.plan ?? '';
    const s = String(raw0).toLowerCase().replace(/\s+/g,'');
    if (/prime/.test(s)) return 'Prime';
    if (/(3000|tier3|t3|\b3\b)/.test(s)) return 'T3';
    if (/(2000|tier2|t2|\b2\b)/.test(s)) return 'T2';
    if (/(1000|tier1|t1|\b1\b)/.test(s)) return 'T1';
    if (typeof raw0 === 'number'){ if (raw0===3) return 'T3'; if (raw0===2) return 'T2'; if (raw0===1) return 'T1'; }
    return 'T1';
  }
  function extractMonths(d){
    return Number(
      d?.cumulativeMonths ?? d?.months ?? d?.streak ?? d?.totalMonths ?? d?.subscription?.months ?? 0
    ) || 0;
  }

  // ============================ Password local ============================
  const getQS = (name) => { try { return new URLSearchParams(location.search).get(name); } catch { return null; } };
  function getStoredPwd(){ try { return localStorage.getItem(SB_PWD_KEY) || ""; } catch { return ""; } }
  function setStoredPwd(p){ try { if (p) localStorage.setItem(SB_PWD_KEY, p); } catch {} }
  function clearStoredPwd(){ try { localStorage.removeItem(SB_PWD_KEY); } catch {} }

  (function checkResetPwd(){
    if (getQS('resetpwd') === '1'){
      clearStoredPwd();
      history.replaceState(null, '', location.pathname);
      alert('Mot de passe Streamer.bot effacé localement. Rechargez et saisissez-le à nouveau.');
    }
  })();

  async function ensureSbPassword(forcePrompt = false){
    const fromQS = getQS('pw');
    if (fromQS && fromQS.trim()) { setStoredPwd(fromQS.trim()); return fromQS.trim(); }

    let pwd = getStoredPwd();
    if (!forcePrompt && pwd && pwd.trim()) return pwd.trim();

    const input = window.prompt("Mot de passe WebSocket Streamer.bot :", (pwd || "").trim());
    if (!input || !input.trim()) throw new Error("Aucun mot de passe fourni.");
    setStoredPwd(input.trim());
    return input.trim();
  }

  $('#pw-btn')?.addEventListener('click', async (e)=>{
    e.stopPropagation();
    try {
      clearStoredPwd();
      await ensureSbPassword(true);
      try { await client?.disconnect?.(); } catch {}
      setWsIndicator(false);
      initStreamerbotClient();
    } catch {}
  });

  // ============================ Guess The Game (UI + Backend) ============================
  const guessGenreSel       = $('#guess-genre');
  const guessExcludeInput   = $('#guess-exclude-input');
  const guessDatalist       = $('#guess-genres-datalist');
  const guessExcludeAddBtn  = $('#guess-exclude-add');
  const guessExcludeChips   = $('#guess-exclude-chips');
  const guessYearFromInput  = $('#guess-year-from');
  const guessYearToInput    = $('#guess-year-to');
  const guessBootstrapBtn   = $('#guess-bootstrap');
  const guessStartBtn       = $('#guess-start');
  const guessEndBtn         = $('#guess-end');
  const guessMsg            = $('#guess-msg');
  const guessShotImg        = $('#guess-shot');

  let GTG_GENRES = [];            // [{id,name}]
  let GTG_EXCLUDED = new Set();   // ids exclus

  // gestion des bornes années
  let OLDEST_YEAR = 1970;
  let NEWEST_YEAR = new Date().getFullYear();

  function setGuessMessage(msg){
    if (guessMsg) guessMsg.textContent = msg || '';
  }

  // ------- Validation / Normalisation années -------
  function parseYear(val){
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    return Math.min(NEWEST_YEAR, Math.max(OLDEST_YEAR, Math.trunc(n)));
  }

  function normalizeYearInputs({silent=false} = {}){
    let yf = parseYear(guessYearFromInput?.value);
    let yt = parseYear(guessYearToInput?.value);

    // Ajuste min/max dynamiques
    if (guessYearFromInput) guessYearFromInput.max = String(yt ?? NEWEST_YEAR);
    if (guessYearToInput)   guessYearToInput.min   = String(yf ?? OLDEST_YEAR);

    // Corrige incohérences (yt < yf)
    if (yf != null && yt != null && yt < yf){
      yt = yf; // On aligne "à" sur "de"
      if (guessYearToInput) guessYearToInput.value = String(yt);
      if (!silent) setGuessMessage('Plage corrigée : Année (à) ajustée sur Année (de).');
    }

    // Replace inputs par valeurs clampées (si l’utilisateur a tapé hors bornes)
    if (guessYearFromInput && yf != null) guessYearFromInput.value = String(yf);
    if (guessYearToInput   && yt != null) guessYearToInput.value   = String(yt);
  }

  guessYearFromInput?.addEventListener('input', () => normalizeYearInputs());
  guessYearToInput?.addEventListener('input',   () => normalizeYearInputs());

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
        const o = document.createElement('option');
        o.value = g.name || `#${g.id}`;
        o.dataset.id = String(g.id);
        guessDatalist.appendChild(o);
      }
    }
  }

  function renderExcludeChips(){
    if (!guessExcludeChips) return;
    guessExcludeChips.innerHTML = '';
    if (GTG_EXCLUDED.size === 0){
      const span = document.createElement('span');
      span.className = 'hint';
      span.textContent = 'Aucun genre exclu';
      guessExcludeChips.appendChild(span);
      return;
    }
    for (const id of GTG_EXCLUDED){
      const g = GTG_GENRES.find(x=>String(x.id)===String(id));
      const label = g?.name || `#${id}`;
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${label} <button type="button" title="Retirer">×</button>`;
      chip.querySelector('button').addEventListener('click', ()=>{
        GTG_EXCLUDED.delete(id);
        renderExcludeChips();
      });
      guessExcludeChips.appendChild(chip);
    }
  }

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

  function collectFilters(){
    normalizeYearInputs({silent:true}); // garantit une plage valide
    const includeGenreId = guessGenreSel?.value ? String(guessGenreSel.value) : "";
    const excludeGenreIds = Array.from(GTG_EXCLUDED);
    const yFrom = parseYear(guessYearFromInput?.value);
    const yTo   = parseYear(guessYearToInput?.value);
    return { includeGenreId, excludeGenreIds, yearFrom: yFrom ?? null, yearTo: yTo ?? null };
  }

  async function gtgBootstrap(){
    if (!client) return setGuessMessage('Client SB indisponible.');
    setGuessMessage('Chargement des genres…');
    try{
      const res = await client.doAction({ name: "GTG Bootstrap Genres & Years" });
      if (res?.status !== 'ok'){ throw new Error('bootstrap-failed'); }
      const genres = res?.result?.genres || res?.genres || [];
      OLDEST_YEAR  = Number(res?.result?.oldestYear ?? res?.oldestYear ?? 1970) || 1970;
      NEWEST_YEAR  = Number(res?.result?.newestYear ?? res?.newestYear ?? (new Date().getFullYear())) || new Date().getFullYear();

      fillGenresUI(genres);

      if (guessYearFromInput){
        guessYearFromInput.min = String(OLDEST_YEAR);
        guessYearFromInput.max = String(NEWEST_YEAR);
      }
      if (guessYearToInput){
        guessYearToInput.min = String(OLDEST_YEAR);
        guessYearToInput.max = String(NEWEST_YEAR);
      }

      normalizeYearInputs({silent:true});

      setGuessMessage(`Genres chargés (${genres.length}). Plage ${OLDEST_YEAR} — ${NEWEST_YEAR}.`);
      DashboardStatus.guess.log(`Genres: ${genres.length}, période: ${OLDEST_YEAR}-${NEWEST_YEAR}`);
    }catch(e){
      console.error(e);
      setGuessMessage('Erreur: impossible de charger la liste des genres.');
      DashboardStatus.guess.log(`Erreur bootstrap genres`);
    }
  }

  async function gtgStart(){
    if (!client) return setGuessMessage('Client SB indisponible.');
    const filters = collectFilters();
    setGuessMessage('Sélection d’un jeu…');
    DashboardStatus.setStatus('guess', true);
    DashboardStatus.guess.setStatus(true);
    try{
      const res = await client.doAction({
        name: "GTG Start",
        args: {
          includeGenreId: filters.includeGenreId || null,
          excludeGenreIds: filters.excludeGenreIds || [],
          yearFrom: filters.yearFrom,
          yearTo: filters.yearTo
        }
      });
      if (res?.status !== 'ok') throw new Error('gtg-start-failed');
      const gameName = res?.result?.gameName || res?.gameName || '—';
      const url      = res?.result?.screenshotUrl || res?.screenshotUrl || '';
      if (guessShotImg) guessShotImg.src = url || '';
      DashboardStatus.guess.setLastFound({ by: 'streamer', game: gameName });
      DashboardStatus.guess.setStatus(true);
      DashboardStatus.setStatus('guess', true);
      DashboardStatus.guess.log(`Jeu sélectionné: ${gameName}`);
      setGuessMessage(`OK — ${gameName}`);
    }catch(e){
      console.error(e);
      setGuessMessage('Erreur: aucune sélection possible (réessaie).');
      DashboardStatus.guess.log(`Erreur sélection jeu`);
      DashboardStatus.guess.setStatus(false);
      DashboardStatus.setStatus('guess', false);
    }
  }

  async function gtgEnd(){
    if (!client) return setGuessMessage('Client SB indisponible.');
    try{
      await client.doAction({ name: "GTG End" });
    }catch{}
    DashboardStatus.guess.setStatus(false);
    DashboardStatus.setStatus('guess', false);
    setGuessMessage('En pause');
  }

  // Exclusions — ajout
  if (guessExcludeAddBtn){
    guessExcludeAddBtn.addEventListener('click', ()=>{
      const txt = (guessExcludeInput?.value || '').trim();
      if (!txt){ return; }
      const id = idFromGenreInputText(txt);
      if (!id){ setGuessMessage(`Genre introuvable: “${txt}”`); return; }
      GTG_EXCLUDED.add(String(id));
      guessExcludeInput.value = '';
      renderExcludeChips();
      setGuessMessage('');
    });
  }

  // Bootstrap / Start / End
  guessBootstrapBtn?.addEventListener('click', gtgBootstrap);
  guessStartBtn?.addEventListener('click', gtgStart);
  guessEndBtn?.addEventListener('click', gtgEnd);

  // Sync initiale (statut + screenshot) au connect
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
  }

  // ============================ Connexion & events ============================
  let client;

  async function initStreamerbotClient() {
    if (typeof StreamerbotClient === 'undefined') {
      setWsIndicator(false);
      const el = $('#ws-status');
      if (el) el.textContent = 'Lib @streamerbot/client introuvable';
      return;
    }

    let password;
    try {
      password = (await ensureSbPassword()).trim();
    } catch {
      setWsIndicator(false);
      const el = $('#ws-status');
      if (el) el.textContent = 'Mot de passe requis';
      return;
    }
    if (!password) {
      setWsIndicator(false);
      const el = $('#ws-status');
      if (el) el.textContent = 'Mot de passe vide';
      return;
    }

    try { await client?.disconnect?.(); } catch {}

    client = new StreamerbotClient({
      host: '127.0.0.1',
      port: 8080,
      endpoint: '/',
      scheme: 'ws',
      password,
      immediate: true,
      autoReconnect: true,
      retries: -1,
      subscribe: '*',
      logLevel: 'warn',

      onConnect: async (info) => {
        setWsIndicator(true);
        $('#ws-status') && ($('#ws-status').textContent = `Connecté à Streamer.bot (${info?.version || 'v?'})`);
        await syncTtsSwitchFromBackend();
        await syncGuessFromBackend();
      },

      onDisconnect: (evt = {}) => {
        setWsIndicator(false);
        const el = $('#ws-status');
        const msg = evt.code === 1006
          ? 'Déconnecté — 1006 (auth invalide ?)'
          : `Déconnecté${evt.code ? ' — code '+evt.code : ''}${evt.reason ? ' — '+evt.reason : ''}`;
        if (el) el.textContent = msg;
        if (evt.code === 1006) clearStoredPwd();
        updateTtsSwitchUI(false);
        DashboardStatus.guess.setStatus(false);
        DashboardStatus.setStatus('guess', false);
      },

      onError: (err) => {
        const el = $('#ws-status');
        if (el) el.textContent = 'Erreur WebSocket';
        console.warn('[SB] Error:', err);
      },

      onData: ({event, data}) => {
        // LIVE / OFFLINE
        if (event?.source === 'Twitch' && (event.type === 'StreamOnline' || event.type === 'StreamOffline')) {
          setLiveIndicator(event.type === 'StreamOnline'); return;
        }

        // TTS lus
        if (event?.source === 'General' && data?.widget === 'tts-reader-selection') {
          const u = displayNameFromAny(data.selectedUser || data.user || '');
          const t = data.message || '';
          if (u && t) DashboardStatus.tts.addRead({ user: u, message: t });
          return;
        }

        // SUBS / RESUB / GIFTSUB
        if (event?.source === 'Twitch' && ['Sub','ReSub','GiftSub'].includes(event.type)){
          const d = data || {};
          const user = displayNameFromAny(
            d.displayName ?? d.user ?? d.userName ?? d.username ?? d.sender ?? d.gifter ?? d.userInfo
          );
          const tierLabel = parseTierLabelFromPayload(d);
          const months    = extractMonths(d);
          DashboardStatus.events.addSub({ type: event.type, user, tierLabel, months });
          return;
        }

        // (Optionnel) évènements GTG
        if (event?.source === 'General' && data?.widget === 'gtg'){
          if (typeof data.running === 'boolean'){
            DashboardStatus.guess.setStatus(!!data.running);
            DashboardStatus.setStatus('guess', !!data.running);
          }
          if (data.screenshotUrl){
            DashboardStatus.guess.setShot(data.screenshotUrl);
          }
          if (data.gameName){
            DashboardStatus.guess.setLastFound({ by: data.by || '—', game: data.gameName });
          }
          if (data.log){ DashboardStatus.guess.log(String(data.log)); }
        }
      }
    });

    try {
      const info = await client.getInfo();
      if (info?.status !== 'ok') throw new Error('info-not-ok');
    } catch {}
  }

  // ---- TTS Switch helpers (après init client)
  let ttsSwitchInput = $('#tts-switch');
  const ttsSwitchLabel = $('#tts-switch-label');
  const ttsSwitchLabelText = $('.switch-label-text', ttsSwitchLabel);

  function updateTtsSwitchUI(on){
    if (!ttsSwitchInput) ttsSwitchInput = $('#tts-switch');
    if (!ttsSwitchInput) return;
    const val = !!on;
    ttsSwitchInput.checked = val;
    if (ttsSwitchLabelText) ttsSwitchLabelText.textContent = val ? 'TTS ON' : 'TTS OFF';
    if (ttsSwitchLabel) ttsSwitchLabel.style.opacity = val ? '1' : '0.6';
    DashboardStatus.setStatus('tts', val);
  }

  async function syncTtsSwitchFromBackend(){
    try {
      const resp = await client.getGlobal("ttsAutoReaderEnabled");
      const isOn = resp && resp.status === "ok" ? !!resp.variable?.value : false;
      updateTtsSwitchUI(isOn);
    } catch {
      updateTtsSwitchUI(false);
    }
  }

  async function setTtsAutoReader(enabled){
    try {
      await client.doAction({
        name: "TTS Auto Message Reader Switch ON OFF",
        args: { mode: enabled ? "on" : "off" }
      });
      updateTtsSwitchUI(enabled);
      appendLog('#tts-log', `Auto TTS ${enabled ? 'ON' : 'OFF'} (via bouton)`);
    } catch (e){
      updateTtsSwitchUI(!enabled);
      appendLog('#tts-log', `Erreur: impossible de changer l’état de l’auto TTS`);
      alert("Impossible de changer l’état de l’auto TTS.");
      console.error(e);
    }
  }

  if (ttsSwitchInput){
    ttsSwitchInput.addEventListener('change', () => setTtsAutoReader(!!ttsSwitchInput.checked));
  }

  initStreamerbotClient();

})();
