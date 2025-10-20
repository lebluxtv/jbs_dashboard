(function(){
  "use strict";

  // ========== Helpers UI ==========
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

  // ========== Tabs ==========
  $$('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  (function initTab(){
    let initial = 'overview';
    try { initial = localStorage.getItem('jbs.activeTab') || 'overview'; } catch {}
    showTab(initial);
  })();

  $$('.qv-card').forEach(c => c.addEventListener('click', () => showTab(c.dataset.goto)));

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ========== Header WS indicator ==========
  function setWsIndicator(state){
    const dot = $('#ws-dot');
    const txt = $('#ws-status');
    if (dot){ dot.classList.remove('on','off'); dot.classList.add(state ? 'on' : 'off'); }
    if (txt) txt.textContent = state ? 'Connecté à Streamer.bot' : 'Déconnecté de Streamer.bot';
  }

  // ========== Public API (Overview + pages) ==========
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

    // Events = SUBS uniquement
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

    // TTS lus
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

    // Guess
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

  // ========== Password local ==========
  const SB_PWD_KEY = "sb_ws_password_v1";
  const getQS = (name) => { try { return new URLSearchParams(location.search).get(name); } catch { return null; } };

  function getStoredPwd(){ try { return localStorage.getItem(SB_PWD_KEY) || ""; } catch { return ""; } }
  function setStoredPwd(p){ try { if (p) localStorage.setItem(SB_PWD_KEY, p); } catch {} }
  function clearStoredPwd(){ try { localStorage.removeItem(SB_PWD_KEY); } catch {} }

  // Reset via URL
  (function checkResetPwd(){
    if (getQS('resetpwd') === '1'){
      clearStoredPwd();
      history.replaceState(null, '', location.pathname);
      alert('Mot de passe Streamer.bot effacé localement. Rechargez et saisissez-le à nouveau.');
    }
  })();

  async function ensureSbPassword(forcePrompt = false){
    const ask = getQS('askpwd') === '1';
    let pwd = getStoredPwd();
    if (!forcePrompt && !ask && pwd && pwd.trim()) return pwd.trim();
    const input = window.prompt("Entrez le mot de passe WebSocket de Streamer.bot :", "");
    if (!input || !input.trim()) throw new Error("Aucun mot de passe fourni.");
    setStoredPwd(input.trim());
    return input.trim();
  }

  // Bouton 🔒 → redemander le mdp et reconnecter
  $('#pw-btn')?.addEventListener('click', async (e)=>{
    e.stopPropagation();
    try {
      clearStoredPwd();
      await ensureSbPassword(true);
      try { client?.disconnect?.(); } catch {}
      setWsIndicator(false);
      reconnectAttempts = 0;
      setTimeout(initStreamerbotClient, 100);
    } catch {}
  });

  // ========== Connexion Streamer.bot (lib officielle, comme avant) ==========
  let client = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  function scheduleReconnect(){
    const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempts)); // 1s,2s,4s,...30s
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(initStreamerbotClient, delay);
  }

  async function initStreamerbotClient(){
    // UMD chargé ?
    if (typeof StreamerbotClient === 'undefined'){
      setWsIndicator(false);
      $('#ws-status').textContent = 'Lib @streamerbot/client introuvable';
      return;
    }

    let password;
    try {
      password = await ensureSbPassword();
    } catch {
      setWsIndicator(false);
      return;
    }

    try {
      client = new StreamerbotClient({
        host:'127.0.0.1',
        port:8080,
        endpoint:'/',
        password,          // <= auth gérée par la lib, comme ton ancien code
        subscribe:'*',

        onConnect: async () => {
          reconnectAttempts = 0;
          setWsIndicator(true);

          // Optionnel : info viewers dans title
          try {
            const resp = await client.getActiveViewers();
            $('#ws-status').title = (resp.viewers || []).map(v=>v.display).join(', ') || '';
          } catch { $('#ws-status').title = ''; }
        },

        onDisconnect: () => {
          setWsIndicator(false);
          reconnectAttempts++;
          // si on boucle trop, on force une reprompt
          if (reconnectAttempts >= 3) clearStoredPwd();
          scheduleReconnect();
        }
      });
    } catch (e){
      setWsIndicator(false);
      reconnectAttempts++;
      scheduleReconnect();
      return;
    }

    // Dispatcher d'événements (même logique que ton implémentation)
    client.on('*', ({event,data}) => {
      // --- TTS lus ---
      if (event.source === 'General' && data?.widget === 'tts-reader-selection'){
        const u = data.selectedUser || data.user || '';
        const t = data.message || '';
        if (u && t) DashboardStatus.tts.addRead({ user: u, message: t });
        return;
      }

      // --- SUBS ---
      if (event.source === 'Twitch' && ['Sub','ReSub','GiftSub'].includes(event.type)){
        const d = data || {};
        const user = d.displayName || d.user || d.userName || d.username || '—';
        let tierRaw = (d.tier ?? d.plan ?? d.tierId ?? d.level ?? '').toString().toLowerCase();
        let tierLabel = 'T1';
        if (tierRaw.includes('3000') || tierRaw==='3') tierLabel='T3';
        else if (tierRaw.includes('2000') || tierRaw==='2') tierLabel='T2';
        else if (tierRaw.includes('prime')) tierLabel='Prime';
        else tierLabel='T1';
        const months = Number(d.cumulativeMonths ?? d.months ?? d.streak ?? d.totalMonths ?? 0) || 0;
        DashboardStatus.events.addSub({ user, tierLabel, months });
        return;
      }

      // --- Guess (quand tu broadcastes ces events General) ---
      if (event.source === 'General'){
        if (data?.widget === 'guess-status'){ DashboardStatus.guess.setStatus(!!data.running); return; }
        if (data?.widget === 'guess-found'){ DashboardStatus.guess.setLastFound({ by:data.by, game:data.game }); return; }
        if (data?.widget === 'guess-leaderboard'){
          const entries = Array.isArray(data.entries) ? data.entries : [];
          DashboardStatus.guess.setLeaderboard(entries);
          return;
        }
      }
    });
  }

  // Démarrage
  initStreamerbotClient();

})();
