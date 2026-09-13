/******************************************************************
   *                   🤝 Streamer.bot Actions
   ******************************************************************/
  let sbClient = null;
  const ACTION_ID_CACHE = new Map();

  async function resolveActionIdByName(name){
    if (!name) throw new Error("Nom action requis");
    if (ACTION_ID_CACHE.has(name)) return ACTION_ID_CACHE.get(name);
    const { actions } = await sbClient.getActions();
    const found = actions.find(a => a.name === name);
    if (!found) throw new Error(`Action introuvable: "${name}"`);
    ACTION_ID_CACHE.set(name, found.id);
    return found.id;
  }

  function sendRawDoActionById(actionId, argsObj){
    try {
      const sock = sbClient?.socket || sbClient?.ws;
      if (!sock || (sock.readyState !== 1 && sock.readyState !== sock.OPEN)){
        appendLog("#guess-log", "Erreur: WebSocket non prêt pour DoAction brut.");
        return false;
      }
      const wireArgs = Object.assign({}, argsObj || {}, { _json: JSON.stringify(argsObj || {}) });
      const payload = { request:"DoAction", id:"DoAction", action:{ id: actionId }, args: wireArgs };
      sock.send(JSON.stringify(payload));
      return true;
    } catch (e) {
      appendLog("#guess-log", "Erreur DoAction brut: " + (e?.message || e));
      return false;
    }
  }

  async function safeDoAction(actionName, args){
    try {
      if (!sbClient){ appendLog("#guess-log", "Client Streamer.bot non initialisé."); return; }
      const wire = Object.assign({}, args || {}, { _json: JSON.stringify(args || {}) });
      const actionId = await resolveActionIdByName(actionName);
      try {
        await sbClient.doAction(actionId, wire);
        return;
      } catch (e) {
        appendLog("#guess-log", "doAction client a échoué, fallback DoAction brut…");
      }
      const ok = sendRawDoActionById(actionId, wire);
      if (!ok) appendLog("#guess-log", "Fallback DoAction brut a échoué.");
    } catch (e) {
      appendLog("#guess-log", "Erreur safeDoAction: " + (e?.message || e));
    }
  }

  

/******************************************************************
   *                      🔗 WS CONNECT / LIFECYCLE
   ******************************************************************/
  function setConnected(on){ setWsIndicator(!!on); }

  // Gardé mais plus utilisé pour la connexion auto (la gestion se fait via lock-btn + ?pwd=)
  function ensureSbPassword(){
    const qsPwd = getQS("pwd");
    if (qsPwd != null){ setStoredPwd(qsPwd); return qsPwd; }
    let pwd = getStoredPwd();
    if (!pwd){
      const val = window.prompt("Mot de passe Streamer.bot :", "");
      if (val === null) return "";
      pwd = (val || "").trim();
      setStoredPwd(pwd);
    }
    return pwd;
  }

  function reconnectSB(){
    try { window.sbClient?.disconnect?.(); } catch {}
    connectSB();
  }

  // ====== VERSION CORRIGÉE : pas de password forcé, envoyé seulement s'il existe vraiment ======
  function connectSB(){
    try {
      const StreamerbotCtor =
        (typeof window.StreamerbotClient === "function" && window.StreamerbotClient) ||
        (typeof window.StreamerbotClient?.default === "function" && window.StreamerbotClient.default);

      if (typeof StreamerbotCtor !== "function"){
        appendLog("#guess-log", "Erreur: StreamerbotClient n’est pas chargé (script manquant ?).");
        return;
      }

      const host = getQS("host") || "127.0.0.1";
      const port = Number(getQS("port") || 8080);

      // Gestion du mot de passe : querystring > storage, mais aucun prompt ici
      const qsPwd = getQS("pwd");
      if (qsPwd != null) {
        setStoredPwd(qsPwd);
      }
      const storedPwd = (getStoredPwd() || "").trim();
      const password = (qsPwd != null ? (qsPwd || "") : storedPwd);

      // Nettoyage ancienne connexion
      try { window.sbClient?.disconnect?.(); } catch {}

      const clientOpts = {
        host,
        port,
        endpoint: "/",
        subscribe: "*",
        immediate: true,
        autoReconnect: true,
        retries: -1,
        log: false,
        onData: (payload) => {
          try { window.JBSTwitchChannel?.handleRawData?.(payload); } catch {}
        },
        onConnect: () => {
          window.sbClient = sbClient;
          window.client   = sbClient;
          setConnected(true);
          appendLog("#guess-log", `Connecté à Streamer.bot (${host}:${port})`);
          try { window.JBSTwitchChannel?.onConnected?.(); } catch {}
// NOTE: no manual subscribe here; the client is initialized with subscribe:"*".
          // Re-sync complet à chaque connexion
          safeDoAction("GTG Bootstrap Genres & Years & Ratings", {});
          safeDoAction("GTG Scores Get", {});

          // --- Extension TTS (async encapsulé) ---
          (async () => {
            const client = sbClient;
            if (!client) return;

            // 1) Récupération de l'ID de l'action "TTS Timer Set"
            try {
              const actionsObj = await client.getActions();
              const ttsTimerAction = actionsObj.actions?.find(
                a => a.name === "TTS Timer Set"
              );
              if (ttsTimerAction) {
                TTS_TIMER_ACTION_ID = ttsTimerAction.id;
              } else {
                console.warn('Action "TTS Timer Set" non trouvée dans Streamer.bot');
              }
            } catch (e) {
              console.warn("Erreur récupération des actions Streamer.bot :", e);
            }

            // 2) Récupération de la globale "ttsCooldownMinutes" pour l'UI
            if (ttsTimerInput && ttsTimerLabel) {
              try {
                const cooldownResp = await client.getGlobal("ttsCooldownMinutes");
                if (
                  cooldownResp &&
                  cooldownResp.status === "ok" &&
                  typeof cooldownResp.variable?.value === "number"
                ) {
                  const v = cooldownResp.variable.value;
                  lastSentTimer = v;
                  ttsTimerInput.value = v;
                  ttsTimerLabel.textContent = v + " min";
                }
              } catch (e) {
                console.warn("Erreur récupération ttsCooldownMinutes :", e);
              }
            }

            // 3) Sync initial du switch TTS ON/OFF
            await syncTtsSwitchFromBackend();
          })();
        },
        onDisconnect: () => {
          setConnected(false);
          try { window.JBSTwitchChannel?.onDisconnected?.(); } catch {}
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

      // expose global client pour les autres blocs (optionnel)
      window.sbClient = sbClient;
      window.client   = sbClient;

      try {
        sbClient.on?.("*", ({ event, data }) => {
          try { handleSBEvent(event, data); }
          catch (e) { appendLog("#guess-log", "handleSBEvent error: " + (e?.message || e)); }
        });
      } catch {}

      
      
      

      try {
        const sock = sbClient?.socket || sbClient?.ws;
        if (sock && !sock._debugBound){
          sock._debugBound = true;
          sock.addEventListener?.("close", (ev)=>{
            appendLog("#guess-log", `WS close code=${ev.code} reason="${ev.reason}" wasClean=${ev.wasClean}`);
            const t = $("#ws-status");
            if (t) t.title = `WS closed code=${ev.code} reason=${ev.reason}`;
          });
        }
      } catch {}

      window.sbClient = sbClient;

    } catch (e) {
      appendLog("#guess-log", "Connexion impossible: " + (e?.message || e));
    }
  }

  
