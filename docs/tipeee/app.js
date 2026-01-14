/* global io */
/**
 * Tipeee Event Catcher - app.js
 * - Tipeee: socket.io -> new-event
 * - Streamer.bot: connexion via StreamerbotClient (même méthode que script (17).js)
 */

let tipeeeSocket = null;

// Streamer.bot client (StreamerbotClient)
let sbClient = null;
let sbConnected = false;
const ACTION_ID_CACHE = new Map();

const LS_KEY = "tipeee_event_catcher_ws_v1";

const state = {
  events: [],
  activeIndex: -1
};

function $(id) { return document.getElementById(id); }

/* =========================
   UI helpers
========================= */

function setTipeeeStatus(connected, text) {
  const dot = $("tipeeeDot");
  const txt = $("tipeeeText");
  if (dot) {
    dot.classList.toggle("on", !!connected);
    dot.classList.toggle("off", !connected);
  }
  if (txt) txt.textContent = "Tipeee: " + (text || (connected ? "Connecté" : "Déconnecté"));
}

function setSbStatus(connected, text) {
  const dot = $("sbDot");
  const txt = $("sbText");
  if (dot) {
    dot.classList.toggle("on", !!connected);
    dot.classList.toggle("off", !connected);
  }
  if (txt) txt.textContent = "SB: " + (text || (connected ? "Connecté" : "Déconnecté"));
}

function safeJson(v) {
  try { return JSON.stringify(v, null, 2); }
  catch { return String(v); }
}

function currencySymbolFromCode(code) {
  const c = String(code || "").trim().toUpperCase();
  // Petit mapping (fallback = code)
  const map = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", CHF: "CHF", CAD: "$", AUD: "$" };
  return map[c] || (c ? c : "");
}

function extractQuick(payload) {
  // On supporte plusieurs formes car Tipeee peut encapsuler
  const ev = payload?.event ?? payload;
  const p = ev?.parameters ?? ev?.data ?? {};

  const currencyCode = (p.currency ?? ev?.currency ?? ev?.project?.currency?.code ?? "");
  const currencySymbol = (ev?.project?.currency?.symbol ?? currencySymbolFromCode(currencyCode));

  return {
    username: p.username ?? ev?.username ?? p.user?.username ?? null,
    amount: p.amount ?? ev?.amount ?? p.total ?? p.value ?? null,
    currencyCode,
    currencySymbol,
    message: p.message ?? ev?.message ?? p.comment ?? null
  };
}

/* =========================
   Events list UI
========================= */

function addEvent(kind, payload) {
  state.events.unshift({ kind, payload, ts: new Date() });
  renderList();
  if ($("chkAutoSelect")?.checked) selectEvent(0);
}

function renderList() {
  const list = $("eventsList");
  if (!list) return;
  list.innerHTML = "";

  state.events.forEach((e, i) => {
    const d = document.createElement("div");
    d.className = "event" + (i === state.activeIndex ? " active" : "");
    d.onclick = () => selectEvent(i);

    const q = extractQuick(e.payload);

    d.innerHTML = `
      <div class="top">
        <span class="badge">${e.kind}</span>
        <span class="meta">${e.ts.toLocaleTimeString()}</span>
      </div>
      <div class="meta">
        <b>${q.username ?? "—"}</b>
        ${q.amount != null ? `• ${q.amount}${q.currencySymbol || ""}` : ""}

        ${q.message ? `• ${q.message}` : ""}
      </div>
    `;
    list.appendChild(d);
  });
}

function selectEvent(i) {
  state.activeIndex = i;
  renderList();

  const e = state.events[i];
  if (!e) return;

  const q = extractQuick(e.payload);
  $("detailKind").textContent = e.kind;
  $("detailUser").textContent = q.username ?? "—";
  $("detailAmount").textContent =
    q.amount != null ? `${q.amount}${q.currencySymbol || ""}` : "—";

  $("detailMsg").textContent = q.message ?? "—";
  $("detailJson").textContent = safeJson(e.payload);
}

function clearEvents() {
  state.events = [];
  state.activeIndex = -1;
  renderList();
}

/* =========================
   LocalStorage settings
========================= */

function saveSettings() {
  const data = {
    tipeeeApiKey: $("tipeeeApiKey")?.value || "",
    projectSlug: $("projectSlug")?.value || "",
    usage: $("usage")?.value || "DASHBOARD",
    transport: $("transport")?.value || "websocket,polling",
    sbWsUrl: $("sbWsUrl")?.value || "ws://127.0.0.1:8080/",
    sbWsPassword: $("sbWsPassword")?.value || "",
    sbActionName: $("sbActionName")?.value || "Tipeee Event Received",
    chkAutoSelect: !!$("chkAutoSelect")?.checked
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
}

function loadSettings() {
  let raw = null;
  try { raw = localStorage.getItem(LS_KEY); } catch {}
  if (!raw) return;
  let data = null;
  try { data = JSON.parse(raw); } catch { return; }
  if (!data) return;

  if ($("tipeeeApiKey")) $("tipeeeApiKey").value = data.tipeeeApiKey || "";
  if ($("projectSlug")) $("projectSlug").value = data.projectSlug || "";
  if ($("usage")) $("usage").value = data.usage || "DASHBOARD";
  if ($("transport")) $("transport").value = data.transport || "websocket,polling";

  if ($("sbWsUrl")) $("sbWsUrl").value = data.sbWsUrl || "ws://127.0.0.1:8080/";
  if ($("sbWsPassword")) $("sbWsPassword").value = data.sbWsPassword || "";
  if ($("sbActionName")) $("sbActionName").value = data.sbActionName || "Tipeee Event Received";
  if ($("chkAutoSelect")) $("chkAutoSelect").checked = !!data.chkAutoSelect;
}

/* =========================
   Streamer.bot (connexion calquée JBS dashboard)
========================= */

// --- QueryString helpers (host/port/pwd) ---
function getQS(key) {
  try { return new URLSearchParams(window.location.search).get(key); }
  catch { return null; }
}

// --- Password storage (optionnel, sans prompt) ---
const SB_PWD_KEY = LS_KEY + "_sb_pwd";

function setStoredPwd(pwd) {
  try { localStorage.setItem(SB_PWD_KEY, String(pwd ?? "")); } catch {}
}
function getStoredPwd() {
  try { return localStorage.getItem(SB_PWD_KEY) || ""; } catch { return ""; }
}

function setConnected(on) {
  setSbStatus(!!on, on ? "Connecté" : "Déconnecté");
}

// Gardé pour compat (mais NON utilisé ici : aucun prompt)
function ensureSbPassword() {
  const qsPwd = (getQS("sbPwd") ?? getQS("pwd"));
  if (qsPwd != null) { setStoredPwd(qsPwd); return qsPwd; }
  const stored = (getStoredPwd() || "").trim();
  return stored;
}

function reconnectSB() {
  try { window.sbClient?.disconnect?.(); } catch {}
  connectSB();
}

function getStreamerbotCtor() {
  return (
    (typeof window.StreamerbotClient === "function" && window.StreamerbotClient) ||
    (typeof window.StreamerbotClient?.default === "function" && window.StreamerbotClient.default) ||
    null
  );
}

function parseSbWsUrl(url) {
  // On accepte ws://127.0.0.1:8080/ ou "127.0.0.1:8080"
  try {
    const u = new URL(url);
    const host = u.hostname || "127.0.0.1";
    const port = Number(u.port || 8080);
    return { host, port };
  } catch {
    const m = String(url || "").trim().match(/^([^:\/\s]+)(?::(\d+))?/);
    if (m) return { host: m[1] || "127.0.0.1", port: Number(m[2] || 8080) };
    return { host: "127.0.0.1", port: 8080 };
  }
}

function handleSBEvent(event, data) {
  // Router SB events si besoin. On reste silencieux pour éviter de spam.
  console.debug("[SB EVENT]", event, data);
}

async function resolveActionIdByName(name) {
  if (!sbClient) throw new Error("Streamer.bot client non initialisé");
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Nom d'action requis");

  if (ACTION_ID_CACHE.has(clean)) return ACTION_ID_CACHE.get(clean);

  const actionsObj = await sbClient.getActions();
  const actions = actionsObj?.actions || [];
  const found = actions.find(a => a.name === clean);

  if (!found) throw new Error(`Action introuvable: "${clean}"`);

  ACTION_ID_CACHE.set(clean, found.id);
  return found.id;
}

function sendRawDoActionById(actionId, argsObj) {
  try {
    const sock = sbClient?.socket || sbClient?.ws;
    if (!sock || (sock.readyState !== 1 && sock.readyState !== sock.OPEN)) {
      console.warn("[SB] WebSocket non prêt pour DoAction brut");
      return false;
    }

    // wire format: args + _json
    const wireArgs = Object.assign({}, argsObj || {}, { _json: JSON.stringify(argsObj || {}) });

    const payload = {
      request: "DoAction",
      id: "DoAction",
      action: { id: actionId },
      args: wireArgs
    };

    sock.send(JSON.stringify(payload));
    return true;
  } catch (e) {
    console.warn("[SB] Erreur DoAction brut:", e);
    return false;
  }
}

async function safeDoAction(actionName, args) {
  try {
    if (!sbClient || !sbConnected) {
      console.warn("[SB] Pas connecté -> action ignorée");
      return;
    }

    const actionId = await resolveActionIdByName(actionName);

    const wire = Object.assign({}, args || {}, { _json: JSON.stringify(args || {}) });

    try {
      await sbClient.doAction(actionId, wire);
      return;
    } catch (e) {
      console.warn("[SB] doAction a échoué, fallback brut...", e);
    }

    const ok = sendRawDoActionById(actionId, wire);
    if (!ok) console.warn("[SB] fallback brut échoué");
  } catch (e) {
    console.warn("[SB] safeDoAction error:", e);
  }
}

// ====== Connexion calquée sur JBS dashboard ======
// - host/port depuis ?host= & ?port= sinon depuis l'input WS URL
// - password envoyé SEULEMENT s'il existe (qs pwd > storage > input)
// - pas de prompt
function connectSB() {
  try {
    const StreamerbotCtor = getStreamerbotCtor();
    if (typeof StreamerbotCtor !== "function") {
      setSbStatus(false, "StreamerbotClient manquant (script non chargé)");
      console.error("[SB] StreamerbotClient manquant. Ajoute le script CDN @streamerbot/client dans index.html.");
      return;
    }

    const qsHost = (getQS("sbHost") ?? getQS("host"));

    const qsPort = (getQS("sbPort") ?? getQS("port"));

    const url = ($("sbWsUrl")?.value || "").trim();
    const parsed = parseSbWsUrl(url);

    const host = (qsHost || parsed.host || "127.0.0.1").trim();
    const port = Number(qsPort || parsed.port || 8080);

    // password : querystring > stored > input
    const qsPwd = (getQS("sbPwd") ?? getQS("pwd"));
    if (qsPwd != null) setStoredPwd(qsPwd);

    const storedPwd = (getStoredPwd() || "").trim();
    const inputPwd = (($("sbWsPassword")?.value || "").trim());

    // si qsPwd existe, même vide => il force (comme JBS)
    const password = (qsPwd != null ? (qsPwd || "") : (storedPwd || inputPwd));

    // Nettoyage ancienne connexion
    try { window.sbClient?.disconnect?.(); } catch {}

    // reset state
    sbClient = null;
    sbConnected = false;
    ACTION_ID_CACHE.clear();

    setSbStatus(false, `Connexion… (${host}:${port})`);

    const clientOpts = {
      host,
      port,
      endpoint: "/",
      subscribe: "*",
      immediate: true,
      autoReconnect: true,
      retries: -1,
      log: false,
      onConnect: () => {
        sbConnected = true;
        setConnected(true);
        setSbStatus(true, `Connecté (${host}:${port})`);

        $("btnConnectSB") && ($("btnConnectSB").disabled = true);
        $("btnDisconnectSB") && ($("btnDisconnectSB").disabled = false);

        // expose global client
        window.sbClient = sbClient;
        window.client = sbClient;

        // wildcard events
        try {
          sbClient.on?.("*", ({ event, data }) => {
            try { handleSBEvent(event, data); }
            catch (e) { console.warn("[SB] handleSBEvent error:", e); }
          });
        } catch {}

        // debug close
        try {
          const sock = sbClient?.socket || sbClient?.ws;
          if (sock && !sock._debugBound) {
            sock._debugBound = true;
            sock.addEventListener?.("close", (ev) => {
              console.warn(`[SB] WS close code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean}`);
            });
          }
        } catch {}

        saveSettings();
      },
      onDisconnect: () => {
        sbConnected = false;
        setConnected(false);
        setSbStatus(false, "Déconnecté");

        $("btnConnectSB") && ($("btnConnectSB").disabled = false);
        $("btnDisconnectSB") && ($("btnDisconnectSB").disabled = true);

        saveSettings();
      },
      onError: (e) => {
        sbConnected = false;
        setConnected(false);
        setSbStatus(false, "Erreur");
        console.warn("[SB] error:", e);
      }
    };

    // password envoyé seulement s'il existe vraiment
    if (password && password.trim() !== "") {
      clientOpts.password = password.trim();
    }

    console.log("[SB] connect to", { host, port, hasPassword: !!clientOpts.password, qs: window.location.search });

    sbClient = new StreamerbotCtor(clientOpts);

    // expose immédiat (optionnel)
    window.sbClient = sbClient;
    window.client = sbClient;

    saveSettings();
  } catch (e) {
    setSbStatus(false, "Connexion impossible");
    console.warn("[SB] Connexion impossible:", e);
  }
}

// Compat : boutons existants
function sbConnect() { connectSB(); }

function sbDisconnect() {
  try { sbClient?.disconnect?.(); } catch {}
  sbClient = null;
  sbConnected = false;
  ACTION_ID_CACHE.clear();
  setConnected(false);
  setSbStatus(false, "Déconnecté");

  $("btnConnectSB") && ($("btnConnectSB").disabled = false);
  $("btnDisconnectSB") && ($("btnDisconnectSB").disabled = true);

  saveSettings();
}


/* =========================
   Tipeee socket.io
========================= */

function connectTipeee() {
  const apiKey = ($("tipeeeApiKey")?.value || "").trim();
  const slug = ($("projectSlug")?.value || "").trim();
  const usage = $("usage")?.value || "DASHBOARD";
  const transports = String($("transport")?.value || "websocket,polling")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  if (!apiKey || !slug) {
    alert("api_key ou slug manquant");
    return;
  }

  saveSettings();

  if (tipeeeSocket) {
    try { tipeeeSocket.disconnect(); } catch {}
    tipeeeSocket = null;
  }

  setTipeeeStatus(false, "Connexion…");

  tipeeeSocket = io("https://sso.tipeee.com", {
    path: "/socket.io/",
    transports,
    query: { access_token: apiKey }
  });

  tipeeeSocket.on("connect", () => {
    setTipeeeStatus(true, "Connecté");

    $("btnConnectTipeee") && ($("btnConnectTipeee").disabled = true);
    $("btnDisconnectTipeee") && ($("btnDisconnectTipeee").disabled = false);

    // abonnement "statistic-user" (pattern que tu as déjà observé)
    setTimeout(() => {
      try {
        tipeeeSocket.emit("statistic-user", {
          user: { username: slug },
          usage
        });
      } catch (e) {
        console.warn("[TIPEEE] statistic-user emit error:", e);
      }
    }, 800);
  });

  tipeeeSocket.on("disconnect", () => {
    setTipeeeStatus(false, "Déconnecté");
    $("btnConnectTipeee") && ($("btnConnectTipeee").disabled = false);
    $("btnDisconnectTipeee") && ($("btnDisconnectTipeee").disabled = true);
  });

  tipeeeSocket.on("connect_error", (e) => {
    setTipeeeStatus(false, "Erreur");
    console.warn("[TIPEEE] connect_error:", e);
  });

  // Event principal
  tipeeeSocket.on("new-event", async (payload) => {
    addEvent("new-event", payload);

    const q = extractQuick(payload);

    // Trigger Streamer.bot action
    const actionName = ($("sbActionName")?.value || "Tipeee Event Received").trim();

    await safeDoAction(actionName, {
      source: "tipeee",
      kind: "new-event",
      username: q.username,
      amount: q.amount,
      currencySymbol: q.currencySymbol,
      currencyCode: q.currencyCode,
      message: q.message,
      raw: payload
    });
  });

  // Optionnel : log brut si d’autres events existent
  tipeeeSocket.onAny?.((event, ...args) => {
    if (event === "new-event") return;
    // Tu peux décommenter si tu veux voir ce qui passe:
    console.debug("[TIPEEE] onAny:", event, args);
  });
}

function disconnectTipeee() {
  try { tipeeeSocket?.disconnect(); } catch {}
  tipeeeSocket = null;
  setTipeeeStatus(false, "Déconnecté");
  $("btnConnectTipeee") && ($("btnConnectTipeee").disabled = false);
  $("btnDisconnectTipeee") && ($("btnDisconnectTipeee").disabled = true);
  saveSettings();
}

/* =========================
   Boot
========================= */

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  // QueryString overrides (utile sur GitHub Pages : storage différent du local)
  // - slug / apiKey
  // - sbUrl / sbPwd
  // NB: ne log rien de sensible (apiKey/pwd)
  const qsApiKey = getQS("apiKey");
  const qsSlug   = getQS("slug");
  const qsSbUrl  = getQS("sbUrl");
  const qsSbPwd  = (getQS("sbPwd") ?? getQS("pwd"));

  if (qsApiKey != null && $("tipeeeApiKey")) $("tipeeeApiKey").value = qsApiKey;
  if (qsSlug   != null && $("projectSlug")) $("projectSlug").value = qsSlug;
  if (qsSbUrl  != null && $("sbWsUrl")) $("sbWsUrl").value = qsSbUrl;
  if (qsSbPwd  != null && $("sbWsPassword")) $("sbWsPassword").value = qsSbPwd;

  // Si on a appliqué des overrides, on persiste pour les prochains refresh
  if (qsApiKey != null || qsSlug != null || qsSbUrl != null || qsSbPwd != null) {
    saveSettings();
  }

  // init status
  setTipeeeStatus(false, "Déconnecté");
  setSbStatus(false, "Déconnecté");


  // Auto-connect (si infos présentes)
  // SB d'abord, puis Tipeee (pour que safeDoAction ait plus de chances de passer)
  const sbUrl = ($("sbWsUrl")?.value || "").trim();
  const forceAuto = (getQS("auto") === "1");
  // sbWsUrl a une valeur par défaut; on auto-connect seulement si forceAuto=1 ou si l'user a des settings persos.
  if (forceAuto || (sbUrl) || (qsSbUrl != null)) {
    setTimeout(() => {
      if (!sbConnected) {
      connectSB();
      // Si le script StreamerbotClient est chargé un poil après, on retente une fois.
      setTimeout(() => { if (!sbConnected) connectSB(); }, 1200);
    }
    }, 200);
  }

  const autoApiKey = ($("tipeeeApiKey")?.value || "").trim();
  const autoSlug   = ($("projectSlug")?.value || "").trim();
  if ((autoApiKey && autoSlug) || (forceAuto && autoApiKey && autoSlug)) {
    setTimeout(() => {
      if (!tipeeeSocket) connectTipeee();
    }, 400);
  }

  // buttons
  $("btnConnectTipeee")?.addEventListener("click", connectTipeee);
  $("btnDisconnectTipeee")?.addEventListener("click", disconnectTipeee);

  $("btnConnectSB")?.addEventListener("click", sbConnect);
  $("btnDisconnectSB")?.addEventListener("click", sbDisconnect);

  $("btnClear")?.addEventListener("click", clearEvents);

  // autosave on change (pratique)
  [
    "tipeeeApiKey", "projectSlug", "usage", "transport",
    "sbWsUrl", "sbWsPassword", "sbActionName", "chkAutoSelect"
  ].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", saveSettings);
    el.addEventListener("input", () => {
      // évite d'écrire 200 fois quand tu tapes vite, mais assez simple:
      // ici on save direct, si tu préfères debounce tu me dis.
      saveSettings();
    });
  });

  // boutons disconnect initial
  $("btnDisconnectTipeee") && ($("btnDisconnectTipeee").disabled = true);
  $("btnDisconnectSB") && ($("btnDisconnectSB").disabled = true);
});
