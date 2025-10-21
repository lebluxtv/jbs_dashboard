(function () {
  "use strict";

  // ============================ Helpers ============================
  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

  const SB_PWD_KEY = "sb_ws_password_v1";
  const EVENTS_KEY = "jbs.events.v1";
  const MAX_EVENTS = 200;

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

  // agit sur TOUS les éléments qui matchent
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

  // ------ Items de liste ------
  function makeItem(htmlText, onToggle, ack){
    const li = document.createElement('li');
    li.innerHTML = htmlText;
    if (ack) li.classList.add('ack');

    li.addEventListener('click', (ev) => {
      if ((ev.target.tagName || '').toLowerCase() === 'a') return;
      li.classList.toggle('ack');
      if (typeof onToggle === 'function') onToggle(li.classList.contains('ack'));
      ev.stopPropagation();
    });
    return li;
  }

  function prependListItem(listEl, htmlText, onToggle, ack=false){
    if (!listEl) return;
    const li = makeItem(htmlText, onToggle, ack);

    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')) {
      listEl.removeChild(listEl.firstElementChild);
    }
    listEl.prepend(li);

    const limit = listEl.classList.contains('big') ? 50 : 10;
    while (listEl.children.length > limit) listEl.removeChild(listEl.lastChild);
  }

  function appendListItem(listEl, htmlText, onToggle, ack=false){
    if (!listEl) return;
    const li = makeItem(htmlText, onToggle, ack);

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

  // -------- counters/status centralisés (UNREAD) --------
  function syncEventsStatusUI(){
    // Voyant global Events (tous les points .dot-events)
    setDot('.dot-events', qvUnreadEvents > 0);

    // Badge “quick view” (Overview)
    const bQV = $('#qv-events-count');
    if (bQV){ bQV.textContent = String(qvUnreadEvents); bQV.style.display = qvUnreadEvents>0?'':'none'; }

    // Badge sur l’onglet + badge dans l’entête du panneau
    const bTab  = $('.badge-events');
    const bHead = $('#events-counter');
    if (bTab){  bTab.textContent = String(qvUnreadEvents);  bTab.style.display  = qvUnreadEvents>0?'':'none'; }
    if (bHead){ bHead.textContent = String(qvUnreadEvents); }

    // Libellé “Actif/Inactif” dans Events Checker
    const txt = $('#events-status-text');
    if (txt) txt.textContent = qvUnreadEvents>0 ? 'Actif' : 'Inactif';
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

    // Ordre conservé: plus récents en haut (append du plus récent au plus ancien)
    for (let i = eventsStore.length - 1; i >= 0; i--){
      const e = eventsStore[i];
      const line = `<strong>${e.user}</strong> — <span class="mono">${e.type}</span> • ${e.tierLabel}${e.months>0 ? ` • ${e.months} mois` : ''}`;

      appendListItem(qv, line, (isAck)=>{
        const idx = eventsStore.findIndex(x=>x.id===e.id);
        if (idx>=0){ eventsStore[idx].ack = isAck; saveEvents(eventsStore); }
        qvUnreadEvents += isAck ? -1 : +1;
        qvUnreadEvents = Math.max(0, qvUnreadEvents);
        syncEventsStatusUI();
      }, e.ack);

      appendListItem(full, line, null, e.ack);
    }
    syncEventsStatusUI();
  }
  renderStoredEventsIntoUI();

  // ============================ API publique (UI) ============================
  window.DashboardStatus = {
    setStatus(name, isOn/*, count*/){
      setDot(`.dot-${name}`, !!isOn);

      if (name==='events'){
        // Le statut Events est piloté par le nombre de NON-LUS
        syncEventsStatusUI();
      }

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
        const line = `<strong>${safeUser}</strong> — <span class="mono">${type||'Sub'}</span> • ${tierLabel}${months>0 ? ` • ${months} mois` : ''}`;

        // store
        const evObj = {
          id: Date.now() + Math.random().toString(16).slice(2),
          type: type || 'Sub',
          user: safeUser,
          tierLabel, months,
          ack: false
        };
        eventsStore.push(evObj);
        if (eventsStore.length > MAX_EVENTS) eventsStore = eventsStore.slice(-MAX_EVENTS);
        saveEvents(eventsStore);

        // Quick-view (non-lu par défaut)
        prependListItem($('#qv-events-list'), line, (isAck)=>{
          evObj.ack = isAck; saveEvents(eventsStore);
          qvUnreadEvents += isAck ? -1 : +1;
          qvUnreadEvents = Math.max(0, qvUnreadEvents);
          syncEventsStatusUI();
        }, false);

        // Panneau Events
        prependListItem($('#events-subs-list'), line, null, false);

        // Comptes/états
        qvUnreadEvents += 1;
        syncEventsStatusUI();

        appendLog('#events-log', `${type||'Sub'} ${tierLabel} ${safeUser}${months>0 ? ` (${months} mois)` : ''}`);
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

  // 🔒 Cadenas
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

  // ============================ Connexion Streamer.bot ============================
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
      },

      onDisconnect: (evt = {}) => {
        setWsIndicator(false);
        const el = $('#ws-status');
        const msg = evt.code === 1006
          ? 'Déconnecté — 1006 (auth invalide ?)'
          : `Déconnecté${evt.code ? ' — code '+evt.code : ''}${evt.reason ? ' — '+evt.reason : ''}`;
        if (el) el.textContent = msg;
        if (evt.code === 1006) clearStoredPwd();
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
      }
    });

    try {
      const info = await client.getInfo();
      if (info?.status !== 'ok') throw new Error('info-not-ok');
    } catch { /* ne purge pas le mdp */ }
  }

  initStreamerbotClient();

})();
