(function () {
  "use strict";

  const ctx = window.JBSDashboard;
  if (!ctx || !ctx.utils) {
    console.error("JBSDashboard core manquant: charge core.js avant sb-connection.js");
    return;
  }
  if (ctx.__sbLoaded) return;
  ctx.__sbLoaded = true;

  const { appendLog, getQS, getStoredPwd, setStoredPwd } = ctx.utils;

  /******************************************************************
   *                   🤝 Streamer.bot Actions (CORE SB)
   ******************************************************************/
  let sbClient = null;
  const ACTION_ID_CACHE = new Map();

  async function resolveActionIdByName(name) {
    if (!name) throw new Error("Nom action requis");
    if (ACTION_ID_CACHE.has(name)) return ACTION_ID_CACHE.get(name);
    if (!sbClient) throw new Error("sbClient non initialisé");

    const { actions } = await sbClient.getActions();
    const found = actions.find(a => a.name === name);
    if (!found) throw new Error(`Action introuvable: "${name}"`);
    ACTION_ID_CACHE.set(name, found.id);
    return found.id;
  }

  function sendRawDoActionById(actionId, argsObj) {
    try {
      const sock = sbClient?.socket || sbClient?.ws;
      if (!sock || (sock.readyState !== 1 && sock.readyState !== sock.OPEN)) {
        appendLog("#guess-log", "Erreur: WebSocket non prêt pour DoAction brut.");
        return false;
      }
      const wireArgs = Object.assign({}, argsObj || {}, { _json: JSON.stringify(argsObj || {}) });
      const payload = { request: "DoAction", id: "DoAction", action: { id: actionId }, args: wireArgs };
      sock.send(JSON.stringify(payload));
      return true;
    } catch (e) {
      appendLog("#guess-log", "Erreur DoAction brut: " + (e?.message || e));
      return false;
    }
  }

  async function safeDoAction(actionName, args) {
    try {
      if (!sbClient) { appendLog("#guess-log", "Client Streamer.bot non initialisé."); return; }
      const wire = Object.assign({}, args || {}, { _json: JSON.stringify(args || {}) });
      const actionId = await resolveActionIdByName(actionName);

      // Tentative via client officiel
      try {
        await sbClient.doAction(actionId, wire);
        return;
      } catch (e) {
        appendLog("#guess-log", "doAction client a échoué, fallback DoAction brut…");
      }

      // Fallback brut
      const ok = sendRawDoActionById(actionId, wire);
      if (!ok) appendLog("#guess-log", "Fallback DoAction brut a échoué.");
    } catch (e) {
      appendLog("#guess-log", "Erreur safeDoAction: " + (e?.message || e));
    }
  }

  /******************************************************************
   *                      🔗 WS CONNECT / LIFECYCLE (SB)
   ******************************************************************/
  function setConnectedState(on) {
    ctx.state.isConnected = !!on;
    // Si ton UI a un setConnected / setWsIndicator dans le script actuel, on l'appelle si dispo
    try { window.setConnected?.(!!on); } catch {}
  }

  function reconnectSB() {
    try { window.sbClient?.disconnect?.(); } catch {}
    try { sbClient?.disconnect?.(); } catch {}
    connectSB();
  }

  // VERSION "compat" : identique à ta connectSB corrigée, mais encapsulée ici 
  function connectSB() {
    try {
      const StreamerbotCtor =
        (typeof window.StreamerbotClient === "function" && window.StreamerbotClient) ||
        (typeof window.StreamerbotClient?.default === "function" && window.StreamerbotClient.default);

      if (typeof StreamerbotCtor !== "function") {
        appendLog("#guess-log", "Erreur: StreamerbotClient n’est pas chargé (script manquant ?).");
        return;
      }

      const host = getQS("host") || "127.0.0.1";
      const port = Number(getQS("port") || 8080);

      // Mot de passe : querystring > storage (pas de prompt ici)
      const qsPwd = getQS("pwd");
      if (qsPwd != null) setStoredPwd(qsPwd);
      const storedPwd = (getStoredPwd() || "").trim();
      const password = (qsPwd != null ? (qsPwd || "") : storedPwd);

      // Nettoyage ancienne connexion
      try { window.sbClient?.disconnect?.(); } catch {}
      try { sbClient?.disconnect?.(); } catch {}

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
          // expose global client pour compat
          window.sbClient = sbClient;
          window.client = sbClient;

          ctx.state.sbClient = sbClient;
          setConnectedState(true);

          appendLog("#guess-log", `Connecté à Streamer.bot (${host}:${port})`);

          // IMPORTANT : le resync “GTG Bootstrap / Scores Get” restera dans ton main plus tard.
          // Pour l’instant, on ne change rien : on laisse ton script actuel l’appeler après connexion.
        },

        onDisconnect: () => {
          setConnectedState(false);
          appendLog("#guess-log", "Déconnecté de Streamer.bot.");
        },

        onError: (e) => {
          appendLog("#guess-log", "Erreur Streamer.bot: " + (e?.message || e));
        }
      };

      if (password && password.trim() !== "") {
        clientOpts.password = password.trim();
      }

      sbClient = new StreamerbotCtor(clientOpts);

      // expose global
      window.sbClient = sbClient;
      window.client = sbClient;
      ctx.state.sbClient = sbClient;

      // Route brute des events (compat) → handleSBEvent si présent
      try {
        sbClient.on?.("*", ({ event, data }) => {
          try {
            if (typeof window.handleSBEvent === "function") {
              window.handleSBEvent(event, data);
            } else if (typeof ctx.router?.handleSBEvent === "function") {
              ctx.router.handleSBEvent(event, data);
            }
          } catch (e) {
            appendLog("#guess-log", "handleSBEvent error: " + (e?.message || e));
          }
        });
      } catch {}

      // Debug close reason (comme ton code actuel)
      try {
        const sock = sbClient?.socket || sbClient?.ws;
        if (sock && !sock._debugBound) {
          sock._debugBound = true;
          sock.addEventListener?.("close", (ev) => {
            appendLog("#guess-log", `WS close code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean}`);
            const t = document.getElementById("ws-status");
            if (t) t.title = `WS closed code=${ev.code} reason=${ev.reason}`;
          });
        }
      } catch {}

    } catch (e) {
      appendLog("#guess-log", "Connexion impossible: " + (e?.message || e));
    }
  }

  /******************************************************************
   *                     🧩 Exports (compat + namespace)
   ******************************************************************/
  ctx.sb = Object.assign(ctx.sb || {}, {
    connectSB,
    reconnectSB,
    safeDoAction,
    resolveActionIdByName
  });

  // Compat globale (ton script actuel appelle direct)
  window.connectSB = window.connectSB || connectSB;
  window.reconnectSB = window.reconnectSB || reconnectSB;
  window.safeDoAction = window.safeDoAction || safeDoAction;

})();
