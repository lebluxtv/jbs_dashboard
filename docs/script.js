(function () {
  "use strict";

  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

  const SB_PWD_KEY = "sb_ws_password_v1";
  const EVENTS_KEY = "jbs.events.v1";
  const MAX_EVENTS = 200;

  const cssEscape = (v)=>{ try { return CSS.escape(String(v)); } catch { return String(v).replace(/[^\w-]/g, '\\$&'); } };
  const isNum = (n)=> typeof n === 'number' && isFinite(n);

  // ---------- tabs / ui helpers ----------
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
  $('#year') && ($('#year').textContent = new Date().getFullYear());

  // ---------- ws indicators ----------
  function setWsIndicator(state){ setDot('#ws-dot', state); const txt = $('#ws-status'); if (txt) txt.textContent = state ? 'Connecté à Streamer.bot' : 'Déconnecté de Streamer.bot'; }
  function setLiveIndicator(isLive){ setDot('#live-dot', !!isLive); const t = $('#live-status'); if (t) t.textContent = isLive ? 'Live' : 'Offline'; }

  // ---------- events store ----------
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

  // ==================== GTG Section ====================

  // Ajout du bouton Reset Score
  const resetScoreBtn = document.createElement('button');
  resetScoreBtn.id = 'gtg-reset-scores';
  resetScoreBtn.textContent = 'Reset Scores';
  resetScoreBtn.className = 'danger-btn';
  resetScoreBtn.title = 'Remet tous les scores à zéro (confirmation requise)';
  const guessControls = $('#guess-controls') || $('#tab-guess');
  if (guessControls) guessControls.appendChild(resetScoreBtn);

  resetScoreBtn.addEventListener('click', async ()=>{
    if (!client) return alert('Streamer.bot non connecté.');
    const confirmReset = confirm("⚠️ Réinitialiser tous les scores GTG ?\nCette action est irréversible.");
    if (!confirmReset) return;
    try {
      await client.doAction({ name: "GTG Scores Reset" });
      appendLog('#guess-log', 'Scores GTG réinitialisés via le dashboard.');
      alert('✅ Scores réinitialisés.');
    } catch (e) {
      console.error(e);
      alert('Erreur : impossible de réinitialiser les scores.');
    }
  });

  // Fonction pour récupérer les scores (appel de GTG Scores Get)
  async function requestScoresFromBackend(){
    if (!client) return;
    try {
      await client.doAction({ name: "GTG Scores Get" });
      appendLog('#guess-log', 'Requête de mise à jour des scores envoyée.');
    } catch(e){
      console.warn('[GTG] Échec récupération des scores', e);
    }
  }

  // ---------- Streamer.bot client ----------
  let client;

  async function initStreamerbotClient() {
    if (typeof StreamerbotClient === 'undefined'){ setWsIndicator(false); const el = $('#ws-status'); if (el) el.textContent = 'Lib @streamerbot/client introuvable'; return; }

    let password;
    try { password = (await ensureSbPassword()).trim(); }
    catch { setWsIndicator(false); const el = $('#ws-status'); if (el) el.textContent = 'Mot de passe requis'; return; }
    if (!password){ setWsIndicator(false); const el = $('#ws-status'); if (el) el.textContent = 'Mot de passe vide'; return; }

    try { await client?.disconnect?.(); } catch {}

    client = new StreamerbotClient({
      host: '127.0.0.1', port: 8080, endpoint: '/', scheme: 'ws', password,
      immediate: true, autoReconnect: true, retries: -1, subscribe: '*', logLevel: 'warn',
      onConnect: async (info) => {
        setWsIndicator(true);
        $('#ws-status') && ($('#ws-status').textContent = `Connecté à Streamer.bot (${info?.version || 'v?'})`);
        await syncTtsSwitchFromBackend();
        await syncGuessFromBackend();
        // 🔁 Nouvelle étape : récupération automatique des scores
        await requestScoresFromBackend();
      },
      onDisconnect: (evt = {}) => {
        setWsIndicator(false);
        const el = $('#ws-status');
        const msg = evt.code === 1006 ? 'Déconnecté — 1006 (auth invalide ?)'
          : `Déconnecté${evt.code ? ' — code '+evt.code : ''}${evt.reason ? ' — '+evt.reason : ''}`;
        if (el) el.textContent = msg;
        if (evt.code === 1006) clearStoredPwd();
      },
      onError: (err) => { const el = $('#ws-status'); if (el) el.textContent = 'Erreur WebSocket'; console.warn('[SB] Error:', err); },
      onData: ({event, data}) => {
        // === GTG Scores Update ===
        if (data?.widget === 'gtg' && data.type === 'scoreUpdate') {
          const lb = Array.isArray(data.leaderboard) ? data.leaderboard : [];
          DashboardStatus.guess.setLeaderboard(lb);
          if (data.lastWinner) {
            DashboardStatus.guess.setLastFound({
              by: data.lastWinner.isStreamer ? 'streamer' : data.lastWinner.user,
              game: data.gameName || ''
            });
          }
          appendLog('#guess-log', `Scores reçus (${lb.length} entrées).`);
          return;
        }
        // === GTG Scores Reset ===
        if (data?.widget === 'gtg' && data.type === 'scoreReset') {
          DashboardStatus.guess.setLeaderboard([]);
          DashboardStatus.guess.setLastFound({ by: '', game: '' });
          appendLog('#guess-log', 'Scores remis à zéro (broadcast).');
          return;
        }
      }
    });
  }

  // ---------- password ----------
  const getQS = (name) => { try { return new URLSearchParams(location.search).get(name); } catch { return null; } };
  function getStoredPwd(){ try { return localStorage.getItem(SB_PWD_KEY) || ""; } catch { return ""; } }
  function setStoredPwd(p){ try { if (p) localStorage.setItem(SB_PWD_KEY, p); } catch {} }
  function clearStoredPwd(){ try { localStorage.removeItem(SB_PWD_KEY); } catch {} }
  async function ensureSbPassword(forcePrompt = false){
    const fromQS = getQS('pw'); if (fromQS && fromQS.trim()) { setStoredPwd(fromQS.trim()); return fromQS.trim(); }
    let pwd = getStoredPwd(); if (!forcePrompt && pwd && pwd.trim()) return pwd.trim();
    const input = window.prompt("Mot de passe WebSocket Streamer.bot :", (pwd || "").trim());
    if (!input || !input.trim()) throw new Error("Aucun mot de passe fourni."); setStoredPwd(input.trim()); return input.trim();
  }

  initStreamerbotClient();
})();
