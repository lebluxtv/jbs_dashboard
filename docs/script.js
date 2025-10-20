(function () {
  "use strict";

  /* ========================================================================
   * Helpers UI
   * ===================================================================== */
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

  function prependListItem(listEl, htmlText){
    if (!listEl) return;
    const li = document.createElement('li');
    li.innerHTML = htmlText;

    li.addEventListener('click', (ev) => {
      if ((ev.target.tagName || '').toLowerCase() === 'a') return;
      li.classList.toggle('ack');
      ev.stopPropagation();
    });

    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')) {
      listEl.removeChild(listEl.firstElementChild);
    }
    listEl.prepend(li);

    const limit = listEl.classList.contains('big') ? 50 : 10;
    while (listEl.children.length > limit) listEl.removeChild(listEl.lastChild);
  }

  function incBadge(badgeEls, value){
    const v = Math.max(0, value|0);
    badgeEls.forEach(b=>{
      if (!b) return;
      b.textContent = String(v);
      if (b.id === 'qv-events-count') b.style.display = v>0 ? '' : 'none';
    });
  }

  /* ========================================================================
   * Tabs
   * ===================================================================== */
  $$('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  (function initTab(){
    let initial = 'overview';
    try { initial = localStorage.getItem('jbs.activeTab') || 'overview'; } catch {}
    showTab(initial);
  })();

  $$('.qv-card').forEach(c => c.addEventListener('click', () => showTab(c.dataset.goto)));

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ========================================================================
   * En-tête : voyant WebSocket
   * ===================================================================== */
  function setWsIndicator(state){
    const dot = $('#ws-dot');
    const txt = $('#ws-status');
    if (dot){ dot.classList.remove('on','off'); dot.classList.add(state ? 'on' : 'off'); }
    if (txt) txt.textContent = state ? 'Connecté à Streamer.bot' : 'Déconnecté de Streamer.bot';
  }

  /* ========================================================================
   * API publique
   * ===================================================================== */
  window.DashboardStatus = {
    setStatus(name, isOn, count){
      setDot(`.dot-${name}`, !!isOn);

      if (name==='events'){
        const txt = $('#events-status-text'); if (txt) txt.textContent = isOn ? 'Actif':'Inactif';
        const badgeTab = $('.badge-events');
        const badgeHdr = $('#events-counter');
        const badgeQV  = $('#qv-events-count');
        if (typeof count === 'number') incBadge([badgeTab,badgeHdr,badgeQV], count);
      }

      if (name==='tts'){
        const txt = $('#tts-status-text'); if (txt) txt.textContent = isOn ? 'Actif':'Inactif';
      }

      if (name==='guess'){
        const txt = $('#guess-status-text'); if (txt) txt.textContent = isOn ? 'En cours':'En pause';
        const qv  = $('#qv-guess-status');   if (qv)  qv.textContent = isOn ? 'En cours':'En pause';
      }
    },

    events: {
      addSub({user, tierLabel, months}){
        DashboardStatus.setStatus('events', true);
        const badgeTab = $('.badge-events');
        const current = parseInt((badgeTab?.textContent || "0"), 10) || 0;
        incBadge([badgeTab, $('#events-counter'), $('#qv-events-count')], current+1);

        const txt = `<strong>${user}</strong> — ${tierLabel}${months>0 ? ` • ${months} mois` : ''}`;
        prependListItem($('#qv-events-list'), txt);
        prependListItem($('#events-subs-list'), txt);
        appendLog('#events-log', `SUB ${tierLabel} ${user}${months>0 ? ` (${months} mois)` : ''}`);
      },
      log(msg){ appendLog('#events-log', msg); }
    },

    tts: {
      addRead({user, message}){
        DashboardStatus.setStatus('tts', true);
        const safeUser = user || 'user';
        const safeMsg  = message || '';
        const html = `<strong>${safeUser}</strong> — ${safeMsg}`;
        prependListItem($('#qv-tts-list'), html);
        prependListItem($('#tts-read-list'), html);
        appendLog('#tts-log', `TTS lu: ${safeUser}: ${safeMsg}`);
      },
      log(msg){ appendLog('#tts-log', msg); }
    },

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

  /* ========================================================================
   * Gestion du mot de passe
   * ===================================================================== */
  const SB_PWD_KEY = "sb_ws_password_v1";

  function getQS(name) {
    try { return new URLSearchParams(location.search).get(name); }
    catch { return null; }
  }

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

  /* ========================================================================
   * Connexion Streamer.bot
   * ===================================================================== */
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

    console.log(`[SB] Connecting: ws://localhost:8080/  | passLen=${password.length}`);
    client = new StreamerbotClient({
      host: 'localhost',
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
        if (event?.source === 'General' && data?.widget === 'tts-reader-selection') {
          const u = data.selectedUser || data.user || '';
          const t = data.message || '';
          if (u && t) DashboardStatus.tts.addRead({ user: u, message: t });
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
