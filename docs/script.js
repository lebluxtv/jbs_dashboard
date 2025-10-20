(function(){
  "use strict";

  // ---------- Helpers ----------
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
    // click = griser / ack
    li.addEventListener('click', (ev) => {
      // si on clique sur un lien dans le contenu, on ignore l'ack
      if ((ev.target.tagName || '').toLowerCase() === 'a') return;
      li.classList.toggle('ack');
      ev.stopPropagation();
    });
    // remove placeholder
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains('muted')) {
      listEl.removeChild(listEl.firstElementChild);
    }
    listEl.prepend(li);
    // garder une taille raisonnable (overview 10, pages 50)
    const limit = listEl.classList.contains('big') ? 50 : 10;
    while (listEl.children.length > limit) listEl.removeChild(listEl.lastChild);
  }

  function incBadge(badgeEls, value){
    const v = Math.max(0, value|0);
    badgeEls.forEach(b=>{
      if (!b) return;
      b.textContent = String(v);
      // sur l'overview, badge caché si 0
      if (b.id === 'qv-events-count') b.style.display = v>0 ? '' : 'none';
    });
  }

  // ---------- Tabs ----------
  $$('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  (function initTab(){
    let initial = 'overview';
    try { initial = localStorage.getItem('jbs.activeTab') || 'overview'; } catch {}
    showTab(initial);
  })();

  // Quick-view cards → goto tab
  $$('.qv-card').forEach(c => c.addEventListener('click', () => showTab(c.dataset.goto)));

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- Public API ----------
  window.DashboardStatus = {
    setStatus(name, isOn, count){
      setDot(`.dot-${name}`, !!isOn);
      // reflect quick-view dots
      if (name==='events') setDot(`#tab-overview .dot-events`, !!isOn);
      if (name==='tts')    setDot(`#tab-overview .dot-tts`, !!isOn);
      if (name==='guess')  setDot(`#tab-overview .dot-guess`, !!isOn);

      if (name==='events'){
        const txt = $('#events-status-text'); if (txt) txt.textContent = isOn ? 'Actif':'Inactif';
        const badgeTab = $('.badge-events');
        const badgeHdr = $('#events-counter');
        const badgeQV  = $('#qv-events-count');
        if (typeof count === 'number') incBadge([badgeTab,badgeHdr,badgeQV], count);
      }
      if (name==='tts'){
        const txt = $('#tts-status-text'); if (txt) txt.textContent = isOn ? 'Actif':'Inactif';
        const st  = $('#tts-state');       if (st)  st.textContent  = isOn ? 'ON':'OFF';
      }
      if (name==='guess'){
        const txt = $('#guess-status-text'); if (txt) txt.textContent = isOn ? 'En cours':'En pause';
        const qv  = $('#qv-guess-status');   if (qv)  qv.textContent = isOn ? 'En cours':'En pause';
      }
    },

    // Events (SUBS uniquement)
    events: {
      addSub({user, tierLabel, months}){
        DashboardStatus.setStatus('events', true);
        // compteur
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

    // TTS
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
        // entries: [{user, score}]
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

  // ---------- WS password handling ----------
  const PWD_KEY = "sb_ws_password_v1";
  function getStoredPwd(){ try { return localStorage.getItem(PWD_KEY) || ""; } catch { return ""; } }
  function setStoredPwd(p){ try { if (p) localStorage.setItem(PWD_KEY, p); } catch {} }
  function clearStoredPwd(){ try { localStorage.removeItem(PWD_KEY); } catch {} }

  (function checkResetPwd(){
    try {
      const qs = new URLSearchParams(location.search);
      if (qs.get('resetpwd') === '1'){
        clearStoredPwd();
        history.replaceState(null, '', location.pathname);
        alert('Mot de passe Streamer.bot effacé localement. Rechargez et saisissez-le à nouveau.');
      }
    } catch {}
  })();

  async function ensurePassword(){
    let pwd = getStoredPwd();
    if (pwd && pwd.trim()) return pwd.trim();
    pwd = window.prompt("Entrez le mot de passe WebSocket de Streamer.bot :", "");
    if (!pwd || !pwd.trim()) throw new Error("Aucun mot de passe fourni.");
    setStoredPwd(pwd.trim());
    return pwd.trim();
  }

  // ---------- WebSocket ----------
  const DEFAULT_WS = "ws://127.0.0.1:8080/"; // ta config locale actuelle
  let ws = null;
  let wsConnected = false;
  let retryMs = 2000;
  const MAX_RETRY = 10000;

  function setWsIndicator(state){
    const dot = $('#ws-dot');
    const txt = $('#ws-status');
    if (dot){ dot.classList.remove('on','off'); dot.classList.add(state ? 'on' : 'off'); }
    if (txt) txt.textContent = state ? 'Connecté à Streamer.bot' : 'Déconnecté de Streamer.bot';
  }

  async function connectWS(){
    let pwd = "";
    try { pwd = await ensurePassword(); }
    catch { setWsIndicator(false); return; }

    try {
      ws = new WebSocket(DEFAULT_WS);

      ws.onopen = () => {
        wsConnected = true;
        setWsIndicator(true);
        try { ws.send(JSON.stringify({ password: pwd })); } catch {}
        DashboardStatus.tts.log("WS connecté");
      };

      ws.onmessage = (e) => {
        let msg; try { msg = JSON.parse(e.data); } catch { return; }

        // ------- TTS lus (payload existant) -------
        if (msg.widget === "tts-reader-selection"){
          const u = msg.selectedUser || msg.user || '';
          const t = msg.message || '';
          if (u && t) DashboardStatus.tts.addRead({ user: u, message: t });
          else DashboardStatus.tts.log(`No selection: ${msg.reason || '—'}`);
          return;
        }

        // ------- SUBS uniquement pour Events -------
        // widgets possibles (défensif) : "sub", "twitch-sub", "twitch.subscription"
        if (msg.widget === "sub" || msg.widget === "twitch-sub" || msg.widget === "twitch.subscription"){
          // champs possibles selon tes scripts/action SB :
          // user / userName / username
          const user = msg.user || msg.userName || msg.username || '—';

          // tier: "1000" | "2000" | "3000" | "Prime" | 1/2/3
          let tierRaw = (msg.tier ?? msg.plan ?? msg.tierId ?? msg.level ?? '').toString().toLowerCase();
          let tierLabel = 'T1';
          if (tierRaw.includes('3000') || tierRaw==='3') tierLabel='T3';
          else if (tierRaw.includes('2000') || tierRaw==='2') tierLabel='T2';
          else if (tierRaw.includes('prime')) tierLabel='Prime';
          else tierLabel='T1';

          // mois cumulés: cumulativeMonths | months | streak | totalMonths
          const months = Number(msg.cumulativeMonths ?? msg.months ?? msg.streak ?? msg.totalMonths ?? 0) || 0;

          DashboardStatus.events.addSub({ user, tierLabel, months });
          return;
        }

        // ------- Guess (structure prête) -------
        if (msg.widget === "guess-status"){
          DashboardStatus.guess.setStatus(!!msg.running);
          return;
        }
        if (msg.widget === "guess-found"){
          DashboardStatus.guess.setLastFound({ by: msg.by, game: msg.game });
          return;
        }
        if (msg.widget === "guess-leaderboard"){
          const entries = Array.isArray(msg.entries) ? msg.entries : [];
          DashboardStatus.guess.setLeaderboard(entries);
          return;
        }

        // autres widgets → ignorer en overview préliminaire
      };

      ws.onclose = () => {
        wsConnected = false;
        setWsIndicator(false);
        setTimeout(connectWS, retryMs);
        retryMs = Math.min(retryMs * 2, MAX_RETRY);
      };

      ws.onerror = () => {
        wsConnected = false;
        setWsIndicator(false);
        try { ws.close(); } catch {}
      };

    } catch (err){
      wsConnected = false;
      setWsIndicator(false);
      setTimeout(connectWS, retryMs);
      retryMs = Math.min(retryMs * 2, MAX_RETRY);
    }
  }

  connectWS();

})();
