(function () {
  "use strict";

  // ============================ Helpers ============================
  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

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
    const el = $(selector);
    if (!el) return;
    el.classList.remove('on','off');
    el.classList.add(on ? 'on' : 'off');
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

  // insère un <li> et branche le toggle ACK (marquer lu)
  function prependListItem(listEl, htmlText, onToggle){
    if (!listEl) return;
    const li = document.createElement('li');
    li.innerHTML = htmlText;

    li.addEventListener('click', (ev) => {
      if ((ev.target.tagName || '').toLowerCase() === 'a') return; // liens OK
      li.classList.toggle('ack');
      if (typeof onToggle === 'function') onToggle(li.classList.contains('ack'));
      ev.stopPropagation();
    });

    // supprime placeholder muted
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')) {
      listEl.removeChild(listEl.firstElementChild);
    }
    listEl.prepend(li);

    // limite taille (10 par défaut, 50 pour .big)
    const limit = listEl.classList.contains('big') ? 50 : 10;
    while (listEl.children.length > limit) listEl.removeChild(listEl.lastChild);
  }

  // ============================ Tabs ============================
  $$('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  (function initTab(){
    let initial = 'overview';
    try { initial = localStorage.getItem('jbs.activeTab') || 'overview'; } catch {}
    showTab(initial);
  })();

  // Quick-view : seul le TITRE est cliquable (ouvre l’onglet)
  $$('.qv-card').forEach(card => {
    const title = card.querySelector('.qv-head h2');
    const target = card.dataset.goto;
    if (title && target) title.addEventListener('click', () => showTab(target));
  });

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ============================ Header : voyant WS ============================
  function setWsIndicator(state){
    const dot = $('#ws-dot');
    const txt = $('#ws-status');
    if (dot){ dot.classList.remove('on','off'); dot.classList.add(state ? 'on' : 'off'); }
    if (txt) txt.textContent = state ? 'Connecté à Streamer.bot' : 'Déconnecté de Streamer.bot';
  }

  // ============================ API publique (UI) ============================
  // compteur UNREAD pour le quick-view Events (seuls les non gris)
  let qvUnreadEvents = 0;
  function refreshQvEventsBadge(){
    const b = $('#qv-events-count');
    if (!b) return;
    b.textContent = String(qvUnreadEvents);
    b.style.display = qvUnreadEvents > 0 ? '' : 'none';
  }

  window.DashboardStatus = {
    setStatus(name, isOn, count){
      setDot(`.dot-${name}`, !!isOn);

      if (name==='events'){
        const txt = $('#events-status-text'); if (txt) txt.textContent = isOn ? 'Actif':'Inactif';
        // badges "globaux" (onglet + header) = total events (pas "non-lus")
        const badgeTab = $('.badge-events');
        const badgeHdr = $('#events-counter');
        if (typeof count === 'number'){
          [badgeTab,badgeHdr].forEach(b=>{ if (b) b.textContent = String(Math.max(0,count|0)); });
        }
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
      addSub({user, tierLabel, months}){
        DashboardStatus.setStatus('events', true);

        // total (onglet + entête)
        const badgeTab = $('.badge-events');
        const badgeHdr = $('#events-counter');
        const current = parseInt((badgeTab && badgeTab.textContent || "0"), 10) || 0;
        [badgeTab,badgeHdr].forEach(b=>{ if (b) b.textContent = String(current+1); });

        const safeUser = (typeof user === 'string') ? user : displayNameOf(user);
        const txt = `<strong>${safeUser}</strong> — ${tierLabel}${months>0 ? ` • ${months} mois` : ''}`;

        // Quick-view (compte "non lus")
        prependListItem($('#qv-events-list'), txt, (isAck)=>{
          qvUnreadEvents += isAck ? -1 : +1;
          qvUnreadEvents = Math.max(0, qvUnreadEvents);
          refreshQvEventsBadge();
        });
        qvUnreadEvents += 1;
        refreshQvEventsBadge();

        // Panneau Events (liste principale)
        prependListItem($('#events-subs-list'), txt);

        appendLog('#events-log', `SUB ${tierLabel} ${safeUser}${months>0 ? ` (${months} mois)` : ''}`);
      },
      log(msg){ appendLog('#events-log', msg); }
    },

    // --------------------------- TTS ---------------------------
    tts: {
      addRead({user, message}){
        DashboardStatus.setStatus('tts', true);
        const safeUser = displayNameOf(user);
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
        DashboardStatus.setStatus('guess', !!running);
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

  // ============================ Normalisation noms ============================
  function displayNameOf(u){
    if (!u) return '—';
    if (typeof u === 'string') return u;
    if (typeof u === 'object'){
      if (typeof u.displayName === 'string') return u.displayName;
      if (typeof u.userName === 'string')    return u.userName;
      if (typeof u.username === 'string')    return u.username;
      if (typeof u.name === 'string')        return u.name;
      if (typeof u.login === 'string')       return u.login;
      if (typeof u.id === 'string')          return u.id;
    }
    return String(u);
  }

  // ============================ Password local ============================
  const SB_PWD_KEY = "sb_ws_password_v1";
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

  // 🔒 Cadenas = ressaisir mdp + reconnexion
  $('#pw-btn')?.addEventListener('click', async (e)=>{
    e.stopPropagation();
    try {
      clearStoredPwd();
      await ensureSbPassword(true);
      try { await client?.disconnect?.(); } catch {}
      setWsIndicator(false);
      initStreamerbotClient();
    } catch {/* user canceled */}
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

    // Remets '127.0.0.1' si besoin.
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

      onConnect: (info) => {
        setWsIndicator(true);
        const el = $('#ws-status');
        if (el) el.textContent = `Connecté à Streamer.bot (${info?.version || 'v?'})`;
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
        // TTS lus
        if (event?.source === 'General' && data?.widget === 'tts-reader-selection') {
          const u = displayNameOf(data.selectedUser || data.user || '');
          const t = data.message || '';
          if (u && t) DashboardStatus.tts.addRead({ user: u, message: t });
          return;
        }

        // SUBS / RESUB / GIFTSUB
        if (event?.source === 'Twitch' && ['Sub','ReSub','GiftSub'].includes(event.type)){
          const d = data || {};

          const user = displayNameOf(
            d.displayName ?? d.user ?? d.userName ?? d.username ?? d.sender ?? d.gifter
          );

          let raw = (d.tier ?? d.plan ?? d.tierId ?? d.level ?? '').toString().toLowerCase();
          let tierLabel = 'T1';
          if (raw.includes('3000') || raw==='3')      tierLabel = 'T3';
          else if (raw.includes('2000') || raw==='2') tierLabel = 'T2';
          else if (raw.includes('prime'))             tierLabel = 'Prime';

          const months = Number(
            d.cumulativeMonths ?? d.months ?? d.streak ?? d.totalMonths ?? 0
          ) || 0;

          DashboardStatus.events.addSub({ user, tierLabel, months });
          return;
        }
      }
    });

    try {
      const info = await client.getInfo();
      if (info?.status !== 'ok') throw new Error('info-not-ok');
    } catch {
      setWsIndicator(false);
      const el = $('#ws-status');
      if (el) el.textContent = 'Auth KO — ressaisis le mot de passe';
      clearStoredPwd();
    }
  }

  initStreamerbotClient();

})();
