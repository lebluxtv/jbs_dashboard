(function(){
  "use strict";

  // ---------- helpers ----------
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

  // ---------- tabs ----------
  $$('.tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  (function initTab(){
    let initial = 'overview';
    try { initial = localStorage.getItem('jbs.activeTab') || 'overview'; } catch {}
    showTab(initial);
  })();

  $$('.qv-card').forEach(c => c.addEventListener('click', () => showTab(c.dataset.goto)));

  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- header WS indicator ----------
  function setWsIndicator(state){
    const dot = $('#ws-dot');
    const txt = $('#ws-status');
    if (dot){ dot.classList.remove('on','off'); dot.classList.add(state ? 'on' : 'off'); }
    if (txt) txt.textContent = state ? 'Connecté à Streamer.bot' : 'Déconnecté de Streamer.bot';
  }

  // ---------- public API for panels ----------
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
        const label = by === 'streamer'
::contentReference[oaicite:0]{index=0}
