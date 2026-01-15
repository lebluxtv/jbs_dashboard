/******************************************************************
   *                 🎙️ TTS SWITCH + TIMER (intégration SB)
   ******************************************************************/
  // ======== TTS Reader (intégration avec Streamer.bot) ========
  const ttsSwitchInput      = document.getElementById('tts-switch');
  const ttsSwitchLabel      = document.getElementById('tts-switch-label');
  const ttsSwitchLabelText  = ttsSwitchLabel
    ? ttsSwitchLabel.querySelector('.switch-label-text')
    : null;

  const ttsStatusMain   = document.getElementById('tts-status-main-text');
  const ttsStatusInline = document.getElementById('tts-status-inline-text');
  const ttsStatusOverview = document.getElementById('tts-status-text');

  const ttsTimerInput = document.getElementById('tts-timer');
  const ttsTimerLabel = document.getElementById('tts-timer-label');

  // ID d'action côté Streamer.bot pour "TTS Timer Set"
  let TTS_TIMER_ACTION_ID = null;
  // Dernière valeur envoyée au script pour éviter le spam
  let lastSentTimer = null;

  // --- Mise à jour du texte + points de statut ---
  function setTtsStatusUI(enabled) {
    const val = !!enabled;
    const txt = val ? 'Actif' : 'Inactif';

    if (ttsStatusMain) setText(ttsStatusMain, txt);
    if (ttsStatusInline) setText(ttsStatusInline, txt);
    if (ttsStatusOverview) setText(ttsStatusOverview, txt);

    setDot('.dot-tts', val);
  }

  // --- Mise à jour visuelle du switch ---
  function updateTtsSwitchUI(enabled) {
    const val = !!enabled;

    if (ttsSwitchInput)      ttsSwitchInput.checked = val;
    if (ttsSwitchLabelText) setText(ttsSwitchLabelText, val ? 'TTS ON' : 'TTS OFF');
    if (ttsSwitchLabel)      ttsSwitchLabel.style.opacity   = val ? '1' : '0.55';

    // toujours synchroniser les textes + pastilles
    setTtsStatusUI(val);
  }

  // --- Sync initial depuis la globale "ttsAutoReaderEnabled" ---
  async function syncTtsSwitchFromBackend() {
    if (!sbClient) return;
    try {
      const resp = await sbClient.getGlobal("ttsAutoReaderEnabled");
      let val = false;
      if (resp && resp.status === "ok") {
        val = !!resp.variable?.value;
      }
      updateTtsSwitchUI(val);
    } catch (e) {
      console.warn("Erreur récupération ttsAutoReaderEnabled:", e);
      updateTtsSwitchUI(false);
    }
  }

  // --- Envoi ON/OFF vers Streamer.bot ---
  async function setTtsAutoReader(enabled) {
    if (!sbClient) return;

    try {
      const args = { mode: enabled ? "on" : "off" };
      const wire = Object.assign({}, args, { _json: JSON.stringify(args) });
      const actionId = await resolveActionIdByName("TTS Auto Message Reader Switch ON OFF");

      try {
        await sbClient.doAction(actionId, wire);
        updateTtsSwitchUI(enabled);
        return;
      } catch (e) {
        console.error("Erreur doAction Switch ON/OFF (client):", e);
        const ok = sendRawDoActionById(actionId, args);
        if (!ok) throw e;
        updateTtsSwitchUI(enabled);
      }
    } catch (e) {
      console.error("Erreur Switch ON/OFF:", e);
      updateTtsSwitchUI(!enabled);
      alert("Erreur lors du changement d'état du TTS Auto Reader.");
    }
  }

  if (ttsSwitchInput) {
    ttsSwitchInput.addEventListener('change', () => {
      setTtsAutoReader(ttsSwitchInput.checked);
    });
  }

  // --- Envoi du timer (cooldown en minutes) ---
  function sendTtsTimer(timerValue) {
    if (!sbClient) return;
    if (!TTS_TIMER_ACTION_ID) {
      console.warn("TTS_TIMER_ACTION_ID non initialisé, on ignore.");
      return;
    }

    const v = Number(timerValue);
    if (!Number.isFinite(v)) return;

    const clamped = Math.min(10, Math.max(1, Math.round(v)));
    if (clamped === lastSentTimer) return;

    lastSentTimer = clamped;

    const args = { timer: clamped };
    const wire = Object.assign({}, args, { _json: JSON.stringify(args) });

    sbClient
      .doAction(TTS_TIMER_ACTION_ID, wire)
      .catch(e => console.error("Erreur doAction TTS Timer Set :", e));

    if (ttsTimerInput)  ttsTimerInput.value = clamped;
    if (ttsTimerLabel) setText(ttsTimerLabel, clamped + " min");
  }

  if (ttsTimerInput) {
    const applyTimer = () => {
      const v = ttsTimerInput.value;
      sendTtsTimer(v);
    };

    ttsTimerInput.addEventListener('change', applyTimer);
    ttsTimerInput.addEventListener('blur', applyTimer);
  }

  /******************************************************************
   *                 🎙️ TTS AUTO MESSAGE READER (mini-dashboard)
   ******************************************************************/
  let TTS_AUTO_ENABLED = false;

  function formatDelay(ms){
    if (!Number.isFinite(ms) || ms <= 0) return "—";
    const totalSec = Math.round(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m <= 0) return `${s}s`;
    return `${m}m${s>0?` ${s}s`:""}`;
  }

  function setTtsEnabledUI(on){
    TTS_AUTO_ENABLED = !!on;

    // Centralise tout : switch + textes + pastilles
    updateTtsSwitchUI(on);

    const toggle = $("#tts-toggle-auto");
    if (toggle){
      toggle.textContent = on ? "Désactiver l'auto" : "Activer l'auto";
      toggle.classList.toggle("on", on);
    }
  }

  function setTtsQueueCount(n){
    const el = $("#tts-queue-count");
    if (el) setText(el, Number.isFinite(n) ? String(n) : "—");
  }

  
// Small helper: accept either a DOM element or a jQuery object
function setText(target, text) {
  if (!target) return;
  const el = (target.jquery ? target[0] : target);
  if (!el) return;
  el.textContent = (text ?? "");
}



function clearTtsPlaceholders(){
  // If there is no activity yet, we don't want placeholder text / fake entries.
  const last = document.getElementById("tts-last-read-text");
  if (last && /aucun\s+tts/i.test((last.textContent || "").trim())) last.textContent = "";

  const q = document.getElementById("tts-queue-list");
  if (q){
    Array.from(q.querySelectorAll(".tts-empty, .muted")).forEach(n => n.remove());
  }

  const h = document.getElementById("tts-history-list");
  if (h){
    h.style.display = "none";
    Array.from(h.querySelectorAll(".tts-empty, .muted")).forEach(n => n.remove());
  }

  // hide the "Historique des TTS lus" title if present (same card)
  const card = h ? h.parentElement : null;
  if (card){
    const titles = Array.from(card.querySelectorAll("h3"));
    const histTitle = titles.find(x => /historique\s+des\s+tts/i.test((x.textContent||"").trim()));
    if (histTitle) histTitle.style.display = "none";
  }
}

// ===========================
// TTS : History + Overview sync
// ===========================
// internal state to avoid duplicating the current "last TTS" into the overview history list
let __overviewTtsLastUser = "";
let __overviewTtsLastMsg  = "";


function appendToTtsHistory(user, msg){
  try {
    const u = (user ?? "").toString().trim();
    const m = (msg  ?? "").toString().trim();
    if (!u && !m) return;

    // We do NOT duplicate the current "last TTS" inside the overview list.
    // Instead, the overview list stores the *previous* last TTS (history).
    const prevU = (__overviewTtsLastUser ?? "").toString();
    const prevM = (__overviewTtsLastMsg  ?? "").toString();
    const hasPrev = (prevU.trim() || prevM.trim()) && !(prevU === u && prevM === m);

    // 1) Overview "last TTS"
    try { updateOverviewTtsLast(u, m); } catch (e) {}
    __overviewTtsLastUser = u;
    __overviewTtsLastMsg  = m;

    // 2) Full TTS panel history list is disabled (redondant avec le journal)
    const full = document.getElementById("tts-history-list");
    if (full){
      full.style.display = "none";
      const first = full.firstElementChild;
      if (first && (first.classList.contains("tts-empty") || first.classList.contains("muted"))) full.removeChild(first);
    }

    // 3) Overview list ("Messages lus") — store history, not the current last
    const qv = document.getElementById("qv-tts-list");
    if (qv){
      const first = qv.firstElementChild;
      if (first && (first.classList.contains("muted") || first.classList.contains("tts-empty"))) qv.removeChild(first);

      if (hasPrev){
        const li = document.createElement("li");
        li.textContent = (prevU.trim() && prevM.trim()) ? `${prevU} : ${prevM}` : (prevU.trim() || prevM.trim());
        qv.insertBefore(li, qv.firstChild);

        while (qv.children.length > 8) qv.removeChild(qv.lastChild);
      }
    }
  } catch (e) {
    // Never throw from UI sync (must not break GTG / other panels)
    try { console.warn("[TTS] appendToTtsHistory error:", e); } catch {}
  }
}

// Keep journal logging separate (best-effort)
function appendToTtsJournalLine(user, msg){
  try { appendTtsToJournal(user, msg); } catch (e) {}
}

function setTtsLastMessage(user, msg, opts){
    // Support multiple DOM layouts (older/newer) without breaking anything.
    const u = (user ?? "").toString().trim();
    const m = (msg  ?? "").toString().trim();
    if (!u && !m) return;

    const record = !(opts && opts.record === false);

    // Newer layout: split fields
    const uEl = $("#tts-last-user");
    const mEl = $("#tts-last-msg");
    if (uEl) setText(uEl, u);
    if (mEl) setText(mEl, m);

    // Older layout: single line field (this is what your current UI actually uses)
    const comboEl = $("#tts-last-read-text") || $("#tts-last-read") || $("#ttsLastReadText");
    if (comboEl) setText(comboEl, (u && m) ? `${u} — ${m}` : (u || m));

    // Overview card (if present)
    try { updateOverviewTtsLast(u, m); } catch (e) {}

    if (record){
      // Keep history + journal in sync (best-effort)
      appendToTtsHistory(u, m);
      appendToTtsJournalLine(u, m);
    }
}

  function setTtsNextRun(nextMs, cooldownSec){
    const nextEl = $("#tts-next-run");
    const cdEl   = $("#tts-cooldown");
    if (nextEl){
      if (Number.isFinite(nextMs) && nextMs > 0){
        const delay = Math.max(0, nextMs - Date.now());
        nextEl.textContent = formatDelay(delay);
      } else {
        nextEl.textContent = "—";
      }
    }
    if (cdEl){
      cdEl.textContent = Number.isFinite(cooldownSec) && cooldownSec > 0
        ? `${Math.round(cooldownSec)}s`
        : "—";
    }
  }

  function bindTtsControls(){
    const openBtn  = $("#tts-open-dashboard");
    const forceBtn = $("#tts-force-read");
    const toggleBtn = $("#tts-toggle-auto");

    if (openBtn && !openBtn._bound){
      openBtn._bound = true;
      openBtn.addEventListener("click", (e)=>{
        e.preventDefault();
        // Lien vers ton dashboard TTS dédié si tu en as un
        const href = openBtn.getAttribute("data-href") || openBtn.getAttribute("href") || "tts_dashboard.html";
        window.open(href, "_blank");
      });
    }

    if (forceBtn && !forceBtn._bound){
      forceBtn._bound = true;
      forceBtn.addEventListener("click", (e)=>{
        e.preventDefault();
        // Lecture forcée immédiate
        safeDoAction("TTS Reader", { reason: "manualDashboardTrigger" });
      });
    }

    if (toggleBtn && !toggleBtn._bound){
      toggleBtn._bound = true;
      toggleBtn.addEventListener("click", (e)=>{
        e.preventDefault();
        const newState = !TTS_AUTO_ENABLED;
        setTtsEnabledUI(newState); // feedback instantané
        safeDoAction("TTS Timer Set", {
          enabled: newState
        });
      });
    }
  }

  function handleTtsWidgetEvent(raw){
    const d = raw || {};
    // On accepte plusieurs formes de payload pour être tolérant
    const type = (d.type || d.eventType || d.event_type || "").toString().toLowerCase();
    const widget = (d.widget || "").toString().toLowerCase();

    // Support the payload format used by the standalone TTS dashboard
    // (Supports widget="tts-reader-selection" + eventType="ttsSelection")
    if (widget === "tts-reader-selection" || type === "ttsselection") {
      const u = d.selectedUser || d.user || d.username || d.displayName || d.display_name || "";
      const msg = d.message || d.text || "";
      if (u || msg) setTtsLastMessage(u, msg);
      if (Array.isArray(d.candidatesPanel)) setTtsQueueCount(d.candidatesPanel.length);
      if (typeof d.queueCount === "number") setTtsQueueCount(d.queueCount);
      try { console.debug("[TTS] selection payload:", d); } catch (e) {}
      return;
    }


    if (!type || type === "state" || type === "fullstate"){
      const enabled = !!(d.enabled ?? d.autoEnabled ?? d.isEnabled);
      const queue   = Number(d.queueCount ?? d.queuedCount ?? d.pendingCount ?? d.bufferSize ?? 0);
      const nextTs  = Number(d.nextRunUtcMs ?? d.nextRunTs ?? d.nextTs ?? 0);
      const cooldownSec = Number(d.cooldownSec ?? d.cooldownSeconds ?? d.cooldown ?? 0);
      const lastUser = d.lastUser ?? d.lastSender ?? d.lastAuthor ?? "";
      const lastMsg  = d.lastMessage ?? d.lastText ?? d.lastContent ?? "";

      setTtsEnabledUI(enabled);
      setTtsQueueCount(queue);
      setTtsNextRun(nextTs, cooldownSec);
      applyTtsLastEverywhere(lastUser, lastMsg);

      appendLogDebug("tts.state", {
        enabled, queue, nextTs, cooldownSec, lastUser, lastMsg
      });
      return;
    }

    if (type === "queue" || type === "queueupdate"){
      const queue   = Number(d.queueCount ?? d.queuedCount ?? d.pendingCount ?? 0);
      setTtsQueueCount(queue);
      appendLogDebug("tts.queue", { queue });
      return;
    }

    if (type === "last" || type === "lastread"){
      const lastUser = d.lastUser ?? d.lastSender ?? d.lastAuthor ?? "";
      const lastMsg  = d.lastMessage ?? d.lastText ?? d.lastContent ?? "";
      setTtsLastMessage(lastUser, lastMsg);
      appendLogDebug("tts.last", { lastUser, lastMsg });
      return;
    }

    if (type === "config" || type === "cooldown"){
      const cooldownSec = Number(d.cooldownSec ?? d.cooldownSeconds ?? d.cooldown ?? 0);
      setTtsNextRun(Number.NaN, cooldownSec);
      appendLogDebug("tts.config", { cooldownSec });
      return;
    }
  }

  
