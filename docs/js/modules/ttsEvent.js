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
  const ttsBackendModeText = document.getElementById('tts-backend-mode');
  const ttsCooldownHelp = document.getElementById('tts-cooldown-help');

  // Compatibilité transitoire Dashboard V1 ↔ TTS Reader V1 / V2.
  // Détection automatique : V2 est privilégié si les deux backends sont présents.
  const TTS_V2_CORE_ACTION = "TTS Reader - CORE";
  const TTS_V1_SWITCH_ACTION = "TTS Auto Message Reader Switch ON OFF";
  const TTS_V1_TIMER_ACTION = "TTS Timer Set";
  const TTS_V1_READER_ACTION = "TTS Reader";

  let TTS_BACKEND_MODE = "unknown"; // unknown | v1 | v2 | none
  let lastSentTimer = null;

  function normalizeTtsActionName(value){
    return (value ?? "")
      .toString()
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function setTtsBackendMode(mode){
    TTS_BACKEND_MODE = mode || "none";
    window.JBS_TTS_BACKEND_MODE = TTS_BACKEND_MODE;

    // V1 historique : 1–10 min. V2 : entier >= 1, sans maximum.
    if (ttsTimerInput){
      ttsTimerInput.min = "1";
      ttsTimerInput.step = "1";
      if (TTS_BACKEND_MODE === "v1") {
        ttsTimerInput.max = "10";
        const current = Number(ttsTimerInput.value);
        if (Number.isFinite(current) && current > 10) ttsTimerInput.value = "10";
      } else {
        ttsTimerInput.removeAttribute("max");
      }
    }

    if (ttsBackendModeText){
      if (TTS_BACKEND_MODE === "v2") {
        setText(ttsBackendModeText, "TTS Reader V2");
        ttsBackendModeText.style.color = "#64d98b";
      } else if (TTS_BACKEND_MODE === "v1") {
        setText(ttsBackendModeText, "TTS Reader V1 (legacy)");
        ttsBackendModeText.style.color = "#d9a35f";
      } else if (TTS_BACKEND_MODE === "none") {
        setText(ttsBackendModeText, "Aucun backend TTS détecté");
        ttsBackendModeText.style.color = "#e06a55";
      } else {
        setText(ttsBackendModeText, "Détection…");
        ttsBackendModeText.style.color = "";
      }
    }

    if (ttsCooldownHelp){
      if (TTS_BACKEND_MODE === "v1") {
        setText(ttsCooldownHelp, "Cooldown (1–10 minutes)");
      } else if (TTS_BACKEND_MODE === "v2") {
        setText(ttsCooldownHelp, "Cooldown (minimum 1 minute, sans maximum)");
      } else {
        setText(ttsCooldownHelp, "Cooldown (minutes)");
      }
    }

    try { appendLogDebug?.("tts.backend", { mode: TTS_BACKEND_MODE }); } catch {}
  }

  async function detectTtsBackend(){
    if (!sbClient) return "none";

    try {
      const actionsObj = await sbClient.getActions();
      const actions = Array.isArray(actionsObj?.actions) ? actionsObj.actions : [];
      const byName = new Map(actions.map(a => [normalizeTtsActionName(a?.name), a]));

      const v2 = byName.get(normalizeTtsActionName(TTS_V2_CORE_ACTION));
      const v1Switch = byName.get(normalizeTtsActionName(TTS_V1_SWITCH_ACTION));
      const v1Timer = byName.get(normalizeTtsActionName(TTS_V1_TIMER_ACTION));

      if (v2){
        ACTION_ID_CACHE?.set?.(TTS_V2_CORE_ACTION, v2.id);
        setTtsBackendMode("v2");
        if (v1Switch || v1Timer){
          console.info("[TTS] Backends V1 et V2 détectés : le Dashboard V1 pilote V2 par priorité.");
        }
        return "v2";
      }

      if (v1Switch && v1Timer){
        ACTION_ID_CACHE?.set?.(TTS_V1_SWITCH_ACTION, v1Switch.id);
        ACTION_ID_CACHE?.set?.(TTS_V1_TIMER_ACTION, v1Timer.id);
        const v1Reader = byName.get(normalizeTtsActionName(TTS_V1_READER_ACTION));
        if (v1Reader) ACTION_ID_CACHE?.set?.(TTS_V1_READER_ACTION, v1Reader.id);
        setTtsBackendMode("v1");
        return "v1";
      }

      setTtsBackendMode("none");
      console.warn("[TTS] Aucun backend TTS Reader V1 ou V2 complet détecté.");
      return "none";
    } catch (e) {
      setTtsBackendMode("none");
      console.warn("[TTS] Détection backend impossible :", e);
      return "none";
    }
  }

  async function ensureTtsBackend(){
    if (TTS_BACKEND_MODE === "unknown" || TTS_BACKEND_MODE === "none"){
      return await detectTtsBackend();
    }
    return TTS_BACKEND_MODE;
  }

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
    if (ttsSwitchLabel)      ttsSwitchLabel.style.opacity = val ? '1' : '0.55';

    setTtsStatusUI(val);
  }

  async function readLegacyTtsGlobal(name, fallback){
    try {
      const resp = await sbClient.getGlobal(name);
      if (resp && resp.status === "ok" && resp.variable) return resp.variable.value;
    } catch (e) {
      console.warn(`[TTS V1] Lecture globale ${name} impossible:`, e);
    }
    return fallback;
  }

  // --- Synchronisation initiale avec le backend détecté ---
  async function syncTtsSwitchFromBackend() {
    if (!sbClient) return;
    const mode = await ensureTtsBackend();

    if (mode === "v2"){
      await safeDoAction(TTS_V2_CORE_ACTION, { op: "status" });
      return;
    }

    if (mode === "v1"){
      const enabled = !!(await readLegacyTtsGlobal("ttsAutoReaderEnabled", false));
      const cooldownRaw = Number(await readLegacyTtsGlobal("ttsCooldownMinutes", 3));
      const cooldown = Number.isFinite(cooldownRaw) ? Math.min(10, Math.max(1, Math.round(cooldownRaw))) : 3;
      lastSentTimer = cooldown;
      updateTtsSwitchUI(enabled);
      if (ttsTimerInput) ttsTimerInput.value = cooldown;
      if (ttsTimerLabel) setText(ttsTimerLabel, cooldown + " min");
      return;
    }

    updateTtsSwitchUI(false);
  }

  // --- Envoi ON/OFF vers V1 ou V2 ---
  async function setTtsAutoReader(enabled) {
    if (!sbClient) return;
    const mode = await ensureTtsBackend();

    if (mode === "v2"){
      updateTtsSwitchUI(enabled); // feedback instantané, puis state V2 fait autorité
      await safeDoAction(TTS_V2_CORE_ACTION, {
        op: "setEnabled",
        enabled: !!enabled
      });
      return;
    }

    if (mode === "v1"){
      // L'action V1 historique est un TOGGLE même si elle reçoit mode=on/off.
      // On lit donc d'abord l'état réel pour éviter un basculement involontaire.
      const current = !!(await readLegacyTtsGlobal("ttsAutoReaderEnabled", false));
      if (current !== !!enabled){
        await safeDoAction(TTS_V1_SWITCH_ACTION, { mode: enabled ? "on" : "off" });
      }
      const actual = !!(await readLegacyTtsGlobal("ttsAutoReaderEnabled", enabled));
      updateTtsSwitchUI(actual);
      return;
    }

    updateTtsSwitchUI(false);
    alert("Aucun backend TTS Reader V1 ou V2 détecté dans Streamer.bot.");
  }

  if (ttsSwitchInput) {
    ttsSwitchInput.addEventListener('change', () => {
      setTtsAutoReader(ttsSwitchInput.checked);
    });
  }

  // --- Envoi du cooldown vers V1 ou V2 ---
  async function sendTtsTimer(timerValue) {
    if (!sbClient) return;
    const mode = await ensureTtsBackend();

    const v = Number(timerValue);
    if (!Number.isFinite(v)) return;

    let normalized = Math.max(1, Math.round(v));
    if (mode === "v1") normalized = Math.min(10, normalized);
    if (normalized === lastSentTimer) return;

    lastSentTimer = normalized;
    if (ttsTimerInput) ttsTimerInput.value = normalized;
    if (ttsTimerLabel) setText(ttsTimerLabel, normalized + " min");

    if (mode === "v2"){
      await safeDoAction(TTS_V2_CORE_ACTION, {
        op: "setCooldown",
        minutes: normalized
      });
      return;
    }

    if (mode === "v1"){
      await safeDoAction(TTS_V1_TIMER_ACTION, { timer: normalized });
      return;
    }

    alert("Aucun backend TTS Reader V1 ou V2 détecté dans Streamer.bot.");
  }

  if (ttsTimerInput) {
    const applyTimer = () => sendTtsTimer(ttsTimerInput.value);
    ttsTimerInput.addEventListener('change', applyTimer);
    ttsTimerInput.addEventListener('blur', applyTimer);
  }

  // Appelée par sb-connection.js après chaque connexion / reconnexion.
  async function initTtsBackendCompat(){
    TTS_BACKEND_MODE = "unknown";
    await detectTtsBackend();
    await syncTtsSwitchFromBackend();
  }
  window.initTtsBackendCompat = initTtsBackendCompat;

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

    const pill = document.getElementById("tts-counter");
    if (pill){
      const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
      pill.textContent = String(count);
      pill.style.display = count > 0 ? "inline-flex" : "none";
    }

    const overviewPill = document.getElementById("qv-tts-counter");
    if (overviewPill){
      const count = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
      overviewPill.textContent = String(count);
      overviewPill.style.display = count > 0 ? "inline-flex" : "none";
    }
  }

  function renderTtsQueue(queue){
    const list = document.getElementById("tts-queue-list");
    if (!list) return;

    const items = Array.isArray(queue) ? queue : [];
    list.innerHTML = "";

    if (!items.length){
      const li = document.createElement("li");
      li.className = "tts-empty";
      li.textContent = "Aucun message en file d’attente";
      list.appendChild(li);
      setTtsQueueCount(0);
      return;
    }

    items.slice(0, 20).forEach(item => {
      const li = document.createElement("li");
      const user = (item?.user ?? item?.username ?? "").toString().trim();
      const msg = (item?.message ?? item?.text ?? "").toString().trim();
      const activity = Number(item?.messagesCount ?? item?.activityCount ?? 0);
      const tokens = Number(item?.tokens ?? 0);
      li.textContent = `${user || "—"} — ${msg || "—"}${activity > 1 ? ` · ${activity} msg` : ""}${tokens > 0 ? ` · +${tokens} priorité` : ""}`;
      list.appendChild(li);
    });

    setTtsQueueCount(items.length);
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
        // Lecture forcée immédiate, compatible V1/V2.
        (async () => {
          const mode = await ensureTtsBackend();
          if (mode === "v2") await safeDoAction(TTS_V2_CORE_ACTION, { op: "readNow", reason: "manualDashboardTrigger" });
          else if (mode === "v1") await safeDoAction(TTS_V1_READER_ACTION, { reason: "manualDashboardTrigger" });
        })();
      });
    }

    if (toggleBtn && !toggleBtn._bound){
      toggleBtn._bound = true;
      toggleBtn.addEventListener("click", (e)=>{
        e.preventDefault();
        const newState = !TTS_AUTO_ENABLED;
        setTtsEnabledUI(newState); // feedback instantané
        setTtsAutoReader(newState);
      });
    }
  }

  let __ttsLastRecordedKey = "";

  function recordTtsLastOnce(user, msg, time){
    const u = (user ?? "").toString().trim();
    const m = (msg ?? "").toString().trim();
    if (!u && !m) return;
    const key = `${u}\n${m}\n${time || ""}`;
    if (key === __ttsLastRecordedKey) return;
    __ttsLastRecordedKey = key;
    setTtsLastMessage(u, m);
  }

  function applyTtsConfigFromPayload(d){
    const cooldownMinutes = Number(d.cooldownMinutes ?? d.cooldownMin ?? 0);
    if (Number.isFinite(cooldownMinutes) && cooldownMinutes >= 1){
      const clamped = Math.max(1, Math.round(cooldownMinutes));
      lastSentTimer = clamped;
      if (ttsTimerInput) ttsTimerInput.value = clamped;
      if (ttsTimerLabel) setText(ttsTimerLabel, `${clamped} min`);
      return clamped * 60;
    }
    return Number(d.cooldownSec ?? d.cooldownSeconds ?? d.cooldown ?? 0);
  }

  function parseTtsNextTs(d){
    const direct = Number(d.nextRunUtcMs ?? d.nextRunTs ?? d.nextTs ?? 0);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const iso = d.nextReadAt ?? d.nextRunAt ?? "";
    const parsed = Date.parse(iso);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function handleTtsWidgetEvent(raw){
    const d = raw || {};
    const type = (d.type || d.eventType || d.event_type || "").toString().toLowerCase();
    const widget = (d.widget || "").toString().toLowerCase();

    // Un événement canonique V2 est une preuve directe que le backend V2 est actif.
    // Cela rend l'UI robuste même si getActions() est temporairement indisponible.
    if (widget === "tts-reader" && TTS_BACKEND_MODE !== "v2") {
      setTtsBackendMode("v2");
    }

    // Legacy TTS Reader : conservé pendant la transition V2.
    if (widget === "tts-reader-selection" || type === "ttsselection") {
      const u = d.selectedUser || d.user || d.username || d.displayName || d.display_name || "";
      const msg = d.message || d.text || "";
      recordTtsLastOnce(u, msg, d.time || "");
      if (Array.isArray(d.candidatesPanel)) renderTtsQueue(d.candidatesPanel);
      else if (typeof d.queueCount === "number") setTtsQueueCount(d.queueCount);
      appendLogDebug("tts.selection.legacy", d);
      return;
    }

    if (!type || type === "state" || type === "fullstate"){
      const enabled = !!(d.enabled ?? d.autoEnabled ?? d.isEnabled);
      const queueItems = Array.isArray(d.queue) ? d.queue : (Array.isArray(d.candidatesPanel) ? d.candidatesPanel : null);
      const queueCount = Number(d.queueCount ?? d.queuedCount ?? d.pendingCount ?? d.bufferSize ?? (queueItems ? queueItems.length : 0));
      const nextTs = parseTtsNextTs(d);
      const cooldownSec = applyTtsConfigFromPayload(d);
      const lastUser = d.lastUser ?? d.lastSender ?? d.lastAuthor ?? d.user ?? "";
      const lastMsg = d.lastMessage ?? d.lastText ?? d.lastContent ?? d.message ?? "";

      setTtsEnabledUI(enabled);
      if (queueItems) renderTtsQueue(queueItems);
      else setTtsQueueCount(queueCount);
      setTtsNextRun(nextTs, cooldownSec);
      applyTtsLastEverywhere(lastUser, lastMsg);

      appendLogDebug("tts.state", {
        enabled, queueCount, nextTs, cooldownSec, lastUser, lastMsg, reason: d.reason
      });
      return;
    }

    if (type === "queue" || type === "queueupdate"){
      const queueItems = Array.isArray(d.queue) ? d.queue : (Array.isArray(d.candidatesPanel) ? d.candidatesPanel : []);
      if (queueItems.length || Array.isArray(d.queue)) renderTtsQueue(queueItems);
      else setTtsQueueCount(Number(d.queueCount ?? d.queuedCount ?? d.pendingCount ?? 0));
      appendLogDebug("tts.queue", { queueCount: d.queueCount, reason: d.reason });
      return;
    }

    if (type === "last" || type === "lastread"){
      const lastUser = d.lastUser ?? d.lastSender ?? d.lastAuthor ?? d.user ?? "";
      const lastMsg = d.lastMessage ?? d.lastText ?? d.lastContent ?? d.message ?? "";
      recordTtsLastOnce(lastUser, lastMsg, d.time || "");
      appendLogDebug("tts.last", { lastUser, lastMsg, reason: d.reason, isBreakSilence: d.isBreakSilence });
      return;
    }

    if (type === "config" || type === "cooldown"){
      const cooldownSec = applyTtsConfigFromPayload(d);
      setTtsNextRun(parseTtsNextTs(d), cooldownSec);
      appendLogDebug("tts.config", { cooldownSec });
      return;
    }

    if (type === "log"){
      const message = (d.message ?? d.text ?? "").toString();
      if (message) appendLog("#tts-log", message);
      appendLogDebug("tts.log", d);
      return;
    }
  }

