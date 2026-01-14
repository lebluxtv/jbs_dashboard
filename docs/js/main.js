(function () { 
  "use strict";

  // ---------------------------------------------------------------
  // ✅ CORE DEPENDENCIES (provided by js/core.js + js/sb-connection.js)
  // ---------------------------------------------------------------
  const ctx = window.JBSDashboard;
  if (!ctx || !ctx.utils) {
    throw new Error("JBSDashboard core manquant. Charge js/core.js avant js/main.js");
  }

  // Keep local aliases so the legacy code below can stay unchanged.
  const {
    $, $$,
    setText, setDot,
    appendLog, appendLogDebug,
    isNum, makeNonce,
    getQS, getStoredPwd, setStoredPwd
  } = ctx.utils;

  const { EVENTS_KEY, LAST_SETUP_KEY, SB_PWD_KEY, MAX_EVENTS } = ctx.consts;

  // Streamer.bot helpers are exposed globally by js/sb-connection.js
  // (connectSB, reconnectSB, safeDoAction)
  const getSBClient = () => ctx.state.sbClient || window.sbClient || null;

  /******************************************************************
   *                    📦 EVENTS (Twitch subs)
   ******************************************************************/
  function loadEvents(){ try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]"); } catch { return []; } }
  function saveEvents(list){ try { localStorage.setItem(EVENTS_KEY, JSON.stringify(list.slice(0, MAX_EVENTS))); } catch {} }

  // On stocke { id, ts, type, label, user, raw, read:false }
  let eventsStore = loadEvents();

  // Quick nav badge
  const qvUnreadEvents = $("#qv-unread-events");
  const tabUnreadEvents = $("#tab-unread-events");
  const eventsListEl = $("#events-list");
  const btnMarkAllRead = $("#btn-mark-all-read");
  const btnClearEvents = $("#btn-clear-events");

  // Types SB (à adapter selon tes events / payloads)
  const SUB_EVENT_TYPES = new Set([
    "Twitch.Sub",
    "Twitch.Resub",
    "Twitch.GiftSub",
    "Twitch.SubGift",
    "Twitch.Cheer",
    "Twitch.Follow",
    "Twitch.Raid",
    "Twitch.HypeTrain.Start",
    "Twitch.HypeTrain.End"
  ]);

  function eventIdFromPayload(type, data){
    // Id stable minimal : type + user + ts rounded
    const user = data?.user ?? data?.username ?? data?.displayName ?? data?.from ?? "unknown";
    const ts = data?.time ?? data?.timestamp ?? Date.now();
    return `${type}|${user}|${Math.floor(Number(ts)/1000)}`;
  }

  function pushEvent(type, data){
    const id = eventIdFromPayload(type, data);
    if (eventsStore.some(e => e.id === id)) return;

    const user = data?.user ?? data?.username ?? data?.displayName ?? data?.from ?? "";
    const label =
      data?.message ||
      data?.tier ||
      data?.amount ||
      data?.title ||
      "";

    const item = {
      id,
      ts: Date.now(),
      type,
      label: String(label || ""),
      user: String(user || ""),
      raw: data || {},
      read: false
    };

    eventsStore.unshift(item);
    eventsStore = eventsStore.slice(0, MAX_EVENTS);
    saveEvents(eventsStore);
    renderEvents();
  }

  function countUnread(){
    return eventsStore.reduce((acc, e) => acc + (e.read ? 0 : 1), 0);
  }

  function setUnreadBadges(){
    const n = countUnread();
    if (qvUnreadEvents) qvUnreadEvents.textContent = String(n);
    if (tabUnreadEvents) tabUnreadEvents.textContent = String(n);

    if (n <= 0) {
      if (qvUnreadEvents) qvUnreadEvents.style.display = "none";
      if (tabUnreadEvents) tabUnreadEvents.style.display = "none";
    } else {
      if (qvUnreadEvents) qvUnreadEvents.style.display = "";
      if (tabUnreadEvents) tabUnreadEvents.style.display = "";
    }
  }

  function renderEvents(){
    setUnreadBadges();
    if (!eventsListEl) return;

    eventsListEl.innerHTML = "";

    if (!eventsStore.length) {
      const empty = document.createElement("div");
      empty.className = "events-empty";
      empty.textContent = "Aucun événement.";
      eventsListEl.appendChild(empty);
      return;
    }

    for (const e of eventsStore) {
      const row = document.createElement("div");
      row.className = "event-row" + (e.read ? " read" : " unread");
      row.dataset.id = e.id;

      const left = document.createElement("div");
      left.className = "event-left";

      const t = document.createElement("div");
      t.className = "event-type";
      t.textContent = e.type;

      const u = document.createElement("div");
      u.className = "event-user";
      u.textContent = e.user || "";

      const l = document.createElement("div");
      l.className = "event-label";
      l.textContent = e.label || "";

      left.appendChild(t);
      left.appendChild(u);
      left.appendChild(l);

      const right = document.createElement("div");
      right.className = "event-right";

      const ts = document.createElement("div");
      ts.className = "event-ts";
      ts.textContent = new Date(e.ts).toLocaleTimeString();

      const btn = document.createElement("button");
      btn.className = "event-mark";
      btn.textContent = e.read ? "Non lu" : "Lu";
      btn.addEventListener("click", () => {
        e.read = !e.read;
        saveEvents(eventsStore);
        renderEvents();
      });

      right.appendChild(ts);
      right.appendChild(btn);

      row.appendChild(left);
      row.appendChild(right);

      eventsListEl.appendChild(row);
    }
  }

  if (btnMarkAllRead) {
    btnMarkAllRead.addEventListener("click", () => {
      eventsStore.forEach(e => e.read = true);
      saveEvents(eventsStore);
      renderEvents();
    });
  }

  if (btnClearEvents) {
    btnClearEvents.addEventListener("click", () => {
      if (!confirm("Supprimer tous les événements ?")) return;
      eventsStore = [];
      saveEvents(eventsStore);
      renderEvents();
    });
  }

  renderEvents();

  /******************************************************************
   *                         🧭 TABS
   ******************************************************************/
  const TAB_IDS = ["overview", "gtg", "tts", "events"];

  function showTab(id){
    for (const t of TAB_IDS) {
      const panel = $("#tab
