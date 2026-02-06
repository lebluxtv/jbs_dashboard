/******************************************************************
 *                     🕵️ Mods Whispers Module
 *  - Receives payloads from Streamer.bot via event-router
 *  - Updates Overview card + "Mods Whispers" tab
 ******************************************************************/
(function(){
  const $  = window.$  || ((s, root=document) => root.querySelector(s));
  const $$ = window.$$ || ((s, root=document) => Array.from(root.querySelectorAll(s)));

  const MAX_ITEMS = 12;
  const ACTIVE_MS = 30_000;

  let lastTs = 0;
  let activeTimer = null;
  let count = 0;

  function setText(el, txt){
    if (!el) return;
    el.textContent = (txt ?? "").toString();
  }

  function setActive(on){
    // dots
    if (typeof window.setDot === "function") {
      window.setDot(".dot-mods", !!on);
    } else {
      $$(".dot-mods").forEach(el => {
        el.classList.remove("on","off");
        el.classList.add(on ? "on" : "off");
      });
    }

    // status labels (overview + tab)
    setText($("#mods-status-text"), on ? "Actif" : "Inactif");
    setText($("#mods-status-text-panel"), on ? "Actif" : "Inactif");
    setText($("#mods-status-inline-text"), on ? "Actif" : "Inactif");
  }

  function bumpActive(){
    lastTs = Date.now();
    setActive(true);
    if (activeTimer) clearTimeout(activeTimer);
    activeTimer = setTimeout(() => {
      // only go inactive if no newer events came in
      if (Date.now() - lastTs >= ACTIVE_MS) setActive(false);
    }, ACTIVE_MS + 50);
  }

  function renderCounter(){
    const els = [$("#qv-mods-counter"), $("#mods-counter"), $("#mods-counter-inline")].filter(Boolean);
    els.forEach(el => {
      el.style.display = count > 0 ? "inline-flex" : "none";
      setText(el, String(count));
    });
  }

  function liLine(from, msg, ts){
    const li = document.createElement("li");
    li.className = "event-item";
    const when = ts ? new Date(ts).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"}) : "";
    // keep it simple & safe (no HTML injection)
    li.textContent = `${when ? "["+when+"] " : ""}${from} — ${msg}`;
    return li;
  }

  function clearEmpty(listEl){
    if (!listEl) return;
    Array.from(listEl.querySelectorAll('.tts-empty')).forEach(n => n.remove());
  }

  function prependList(listEl, node){
    if (!listEl) return;
    clearEmpty(listEl);
    listEl.prepend(node);
    while (listEl.children.length > MAX_ITEMS) listEl.removeChild(listEl.lastElementChild);
  }

  function setLast(from, msg){
    setText($("#overview-mods-last-user"), from || "—");
    setText($("#overview-mods-last-msg"), msg || "Aucun message");
    setText($("#mods-last-user"), from || "—");
    setText($("#mods-last-msg"), msg || "Aucun message");
  }

  function normalizeFlags(payload){
    // accept multiple flag shapes; streamer.bot side may change names
    const f = (payload && payload.flags && typeof payload.flags === "object") ? payload.flags : {};
    const isMod = !!(payload.isModerator ?? payload.isMod ?? f.isModerator ?? f.isMod);
    const from = (payload.from ?? payload.user ?? payload.userName ?? payload.username ?? payload.author ?? "").toString();
    const allow = !!(payload.allow ?? payload.allowed ?? f.allow ?? f.allowed);
    return { isMod, from, allow };
  }

  // Exposed entry-point called by event-router.js
  window.handleModsWhispersWidgetEvent = function(payload){
    try{
      if (!payload || typeof payload !== "object") return;

      const msg = (payload.message ?? payload.text ?? payload.rawInput ?? "").toString();
      if (!msg.trim()) return;

      const { isMod, from, allow } = normalizeFlags(payload);

      // If SB already filtered, we still accept everything.
      // But if a flag "allow/allowed" exists and is false -> drop.
      if ((payload.allow !== undefined || payload.allowed !== undefined || (payload.flags && (payload.flags.allow !== undefined || payload.flags.allowed !== undefined))) && !allow){
        return;
      }

      // optional: if you want client-side reinforcement, uncomment:
      // if (!isMod && from.toLowerCase() !== "lebluxtv") return;

      bumpActive();

      count++;
      renderCounter();
      setLast(from || "—", msg);

      const ts = payload.timestamp ?? Date.now();
      prependList($("#qv-mods-list"), liLine(from || "—", msg, ts));
      prependList($("#mods-whispers-list"), liLine(from || "—", msg, ts));

      if (typeof window.appendLog === "function") {
        window.appendLog("#mods-whispers-log", `Whisper — ${from || "—"} : ${msg}`);
      }

      // Also push into Events Checker (Overview "Events" + Events tab) with a distinct type/format
      try {
        if (typeof eventsStore !== "undefined" && Array.isArray(eventsStore) &&
            typeof saveEvents === "function" && typeof renderStoredEventsIntoUI === "function") {
          eventsStore.push({ id: Date.now(), type: "ModWhisper", user: (from || "—"), message: msg, ack: false });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();

          if (typeof window.appendLog === "function") {
            window.appendLog("#events-log", `Mod Whisper — ${from || "—"} : ${msg}`);
          }
        }
      } catch (_) {}

    } catch(e){
      // stay silent; dashboard must not crash
      if (typeof console !== "undefined") console.warn("[modsWhispers] error", e);
    }
  };

  // init inactive state
  setActive(false);
})();
