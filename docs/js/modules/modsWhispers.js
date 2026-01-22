(function(){
  "use strict";

  // -------------------------------------------------------------
  // Mods Whispers module (JBS Dashboard)
  // - Receives Streamer.bot payloads (Whispers trigger) routed by event-router.js
  // - Displays last message + small history (Overview + dedicated tab)
  // -------------------------------------------------------------

  const MAX_ITEMS = 20;
  const ACTIVE_TIMEOUT_MS = 30_000;

  let activeTimer = null;
  let count = 0;
  const items = [];

  const $  = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

  function safeText(el, txt){
    if (!el) return;
    el.textContent = (txt == null) ? "" : String(txt);
  }

  function setDots(on){
    $$(".dot-mods").forEach(el=>{
      el.classList.remove("on","off");
      el.classList.add(on ? "on" : "off");
    });
  }

  function setStatus(txt){
    ["mods-status-text", "mods-status-main-text"].forEach(id=>{
      const el = document.getElementById(id);
      if (el) safeText(el, txt);
    });
  }

  function setCounters(){
    const qv = document.getElementById("qv-mods-counter");
    const main = document.getElementById("mods-counter");
    const val = String(count);

    if (qv){
      safeText(qv, val);
      qv.style.display = count > 0 ? "inline-flex" : "none";
    }
    if (main){
      safeText(main, val);
      main.style.display = count > 0 ? "inline-flex" : "none";
    }
  }

  function appendLogLine(text){
    const log = document.getElementById("mods-whispers-log");
    if (!log) return;

    const ts = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    const p = document.createElement("p");
    p.textContent = `[${ts}] ${text}`;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  function clearEmptyLi(ul){
    if (!ul) return;
    const li = ul.querySelector("li");
    if (li && li.classList.contains("muted") && /aucun/i.test(li.textContent || "")){
      ul.innerHTML = "";
    }
  }

  function renderLists(){
    const qvList = document.getElementById("qv-mods-list");
    const mainList = document.getElementById("mods-whispers-list");

    if (qvList){
      qvList.innerHTML = "";
      for (const it of items){
        const li = document.createElement("li");
        li.textContent = `${it.user} : ${it.message}`;
        qvList.appendChild(li);
      }
    }

    if (mainList){
      mainList.innerHTML = "";
      for (const it of items){
        const li = document.createElement("li");
        li.textContent = `${it.user} : ${it.message}`;
        mainList.appendChild(li);
      }
      if (!items.length){
        const li = document.createElement("li");
        li.className = "muted";
        li.textContent = "Aucun message";
        mainList.appendChild(li);
      }
    }
  }

  function setLastEverywhere(user, msg){
    safeText(document.getElementById("overview-mods-last-user"), user || "—");
    safeText(document.getElementById("overview-mods-last-msg"), msg || "Aucun message");
    safeText(document.getElementById("mods-last-user"), user || "—");
    safeText(document.getElementById("mods-last-msg"), msg || "Aucun message");
  }

  function startActivePulse(){
    setDots(true);
    setStatus("Actif");
    if (activeTimer) clearTimeout(activeTimer);
    activeTimer = setTimeout(()=>{
      setDots(false);
      setStatus("Inactif");
      activeTimer = null;
    }, ACTIVE_TIMEOUT_MS);
  }

  function extractBool(payload, keys){
    for (const k of keys){
      if (!k) continue;
      const v = payload?.[k];
      if (v === true || v === 1 || v === "1" || v === "true") return true;
      if (v === false || v === 0 || v === "0" || v === "false") return false;
    }
    return null;
  }

  function pickString(payload, keys){
    for (const k of keys){
      const v = payload?.[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  }

  function isAllowed(payload){
    // You said you’ll set flags yourself: we accept several common ones
    const direct = extractBool(payload, ["allow", "allowed", "isAllowed", "isModMessage", "isModeratorMessage"]);
    if (direct === true) return true;

    const isBroadcaster = extractBool(payload, ["isBroadcaster", "isStreamer", "broadcaster"]);
    const isLeBlux      = extractBool(payload, ["isLeBluxTv", "isLeBlux", "isOwner"]);
    const isMod         = extractBool(payload, ["isMod", "isModerator", "moderator"]);

    // Also accept nested flags object
    const f = payload?.flags && typeof payload.flags === "object" ? payload.flags : null;
    const nested = (f ? (
      extractBool(f, ["allow", "allowed", "isBroadcaster", "isLeBluxTv", "isLeBlux", "isMod", "isModerator"])
    ) : null);

    return (isBroadcaster === true) || (isLeBlux === true) || (isMod === true) || (nested === true);
  }

  // -------------------------------------------------------------
  // Public entry point (called by event-router.js)
  // -------------------------------------------------------------
  window.handleModsWhispersWidgetEvent = function(payload){
    try{
      if (!payload || typeof payload !== "object") return;

      if (!isAllowed(payload)) return;

      const user = pickString(payload, ["user", "from", "username", "userName", "displayName", "author"]) || "—";
      const msg  = pickString(payload, ["message", "text", "content", "whisper", "body"]);

      if (!msg) return;

      // state
      count++;
      items.unshift({ user, message: msg });
      if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;

      // UI
      startActivePulse();
      setCounters();
      setLastEverywhere(user, msg);
      renderLists();

      appendLogLine(`Whisper — ${user} : ${msg}`);
    } catch (e){
      try {
        // best-effort debug log if your global helper exists
        if (typeof appendLogDebug === "function") appendLogDebug("modsWhispers.error", { message: e?.message || String(e) });
      } catch {}
    }
  };

  // Init default UI state (in case tab is opened before any message)
  document.addEventListener("DOMContentLoaded", ()=>{
    try{
      setDots(false);
      setStatus("Inactif");
      setCounters();
      renderLists();
    } catch {}
  });

})();
