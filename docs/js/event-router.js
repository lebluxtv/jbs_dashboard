/******************************************************************
   *                       🧠 Handle SB Events
   ******************************************************************/
  const asArray = (v)=> Array.isArray(v) ? v : (v == null ? [] : [v]);
  const joinList = (arr)=> (Array.isArray(arr) && arr.length) ? arr.join(", ") : "—";
  const pickNum = (...keys)=>{ for (const v of keys){ if (isNum(v)) return Math.trunc(v); } return null; };

// --- Unwrap payload helpers (Streamer.bot events sometimes nest custom payload under .data/.payload/.args) ---
function unwrapEventPayload(raw){
  let d = raw;
  for (let i = 0; i < 3; i++){
    if (!d || typeof d !== "object") break;

    // Most common wrappers
    const cand1 = d.data;
    const cand2 = d.payload;
    const cand3 = d.args;

    const looksLikeWidget = (o)=> o && typeof o === "object" && ("widget" in o || "type" in o || "message" in o || "user" in o);

    if (looksLikeWidget(cand1)) { d = cand1; continue; }
    if (looksLikeWidget(cand2)) { d = cand2; continue; }
    if (looksLikeWidget(cand3)) { d = cand3; continue; }

    break;
  }
  return d;
}


function updateOverviewTtsLast(user, msg){
  // Best-effort: don't assume overview DOM ids exist
  const candidates = [
    { u:"overview-tts-last-user", m:"overview-tts-last-msg" },
    { u:"overview-tts-user",      m:"overview-tts-msg" },
    { u:"ov-tts-user",            m:"ov-tts-msg" },
    { u:"tts-overview-user",      m:"tts-overview-msg" }
  ];
  for (const c of candidates){
    const uEl = document.getElementById(c.u);
    const mEl = document.getElementById(c.m);
    if (uEl || mEl){
      if (uEl){
        uEl.textContent = user || "";
        uEl.style.fontSize = "16px";
        uEl.style.lineHeight = "1.2";
      }
      if (mEl){
        mEl.textContent = msg || "";
        mEl.style.fontSize = "16px";
        mEl.style.lineHeight = "1.2";
      }
      return true;
    }
  }
  // Also support a single combined element if present
  const combinedIds = ["overview-tts-last", "overview-tts", "ov-tts-last"];
  for (const id of combinedIds){
    const el = document.getElementById(id);
    if (el){
      el.textContent = (user && msg) ? `${user} — ${msg}` : (user || msg || "");
      el.style.fontSize = "16px";
      el.style.lineHeight = "1.2";
      return true;
    }
  }
  return false;
}

function appendTtsToJournal(user, msg){
  // Try common ids first
  const ids = ["tts-journal", "ttsJournal", "tts-journal-box", "tts-journal-textarea", "tts-log", "ttsLog"];
  const u = (user ?? "").toString().trim();
  const m = (msg  ?? "").toString().trim();
  if (!u && !m) return false;

  const ts = new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
  const line = (u && m) ? `${ts} — ${u} : ${m}` : `${ts} — ${u || m}`;

  for (const id of ids){
    const el = document.getElementById(id);
    if (!el) continue;

    if ("value" in el){
      el.value = (el.value ? (el.value + "\n") : "") + line;
      // keep it readable without forcing scroll
      el.style.fontSize = "14px";
      el.style.lineHeight = "1.25";
      return true;
    }
    // non-textarea container
    const div = document.createElement("div");
    div.textContent = line;
    el.appendChild(div);
    el.style.fontSize = "14px";
    el.style.lineHeight = "1.25";
    return true;
  }
  return false;
}

function applyTtsLastEverywhere(user, msg){
  const u = (user ?? "").toString().trim();
  const m = (msg  ?? "").toString().trim();
  if (!u && !m) return;

  // IMPORTANT: this is used by "state" refresh payloads.
  // We only want to UPDATE the UI, not add entries to journal/history.
  setTtsLastMessage(u, m, { record: false });
  updateOverviewTtsLast(u, m);
}





  function extractYearFromGame(g){
    if (!g || typeof g !== "object") return null;
    const direct = pickNum(g.year, g.releaseYear, g.first_release_year);
    if (direct != null) return direct;
    const ts = (isNum(g.first_release_date) ? g.first_release_date
            : isNum(g.releaseDate)        ? g.releaseDate
            : isNum(g.firstReleaseDate)   ? g.firstReleaseDate : null);
    if (ts != null){
      const ms = ts > 10000000000 ? ts : ts * 1000;
      const y = new Date(ms).getUTCFullYear();
      if (isNum(y) && y >= 1970 && y <= 2100) return y;
    }
    return null;
  }
function extractTargetNameFromPayload(d){
  if (!d) return null;
  return d.gameDebug?.name
      || d.game?.name
      || d.runningState?.gameName
      || d.runningState?.game?.name
      || d.target?.name
      || d.answerName
      || d.gameName
      || null;
}


  // ===== perGame : support v4/v5 (racine, runningState.perGame, champs legacy) =====
  function getPerGamePairFromAny(data){
    if (!data || typeof data !== "object") return { idx:null, goal:null };
    let src = data;
    try {
      if (src.perGame && typeof src.perGame === "object") {
        src = src.perGame;
      } else if (src.runningState && typeof src.runningState === "object" &&
                 src.runningState.perGame && typeof src.runningState.perGame === "object") {
        src = src.runningState.perGame;
      }
    } catch {}
    const idx = pickNum(
      src.roundIndex,
      src.perGameRoundIndex,
      src.perGameIndex,
      src.subRoundIndex
    );
    const goal = pickNum(
      src.roundGoal,
      src.perGameRoundCountGoal,
      src.perGameGoal,
      src.subRoundMax
    );
    return { idx, goal };
  }

  function handleSBEvent(event, data){
    try {
      const payload = unwrapEventPayload(data);
      if (event && event.type === "StreamUpdate"){
        setLiveIndicator(!!payload?.live);
      }

      // ===== TTS reader widget (via General.Custom / Broadcast.Custom) =====
      if (payload && typeof payload === "object") {
        const widgetName = (payload.widget || "").toString().toLowerCase();

        // ✅ Noms "legacy" déjà supportés
        if (widgetName === "ttsreader"
          || widgetName === "tts_dashboard"
          || widgetName === "tts-autoreader"
          || widgetName === "tts_auto_message_reader"
          || widgetName === "tts-dashboard") {
          handleTtsWidgetEvent(payload);
          return;
        }

        // ✅ Noms réels utilisés par ton dashboard TTS
        if (widgetName === "tts-reader-selection") {
          handleTtsWidgetEvent({
            type: "lastread",
            lastUser: (payload.user ?? payload.selectedUser ?? payload.lastUser ?? payload.lastSender ?? payload.author ?? ""),
            lastMessage: (payload.message ?? payload.text ?? payload.lastMessage ?? payload.lastText ?? payload.content ?? "")
          });
          return;
        }

        if (widgetName === "tts-reader-tick") {
          // On passe tout le payload : handleTtsWidgetEvent sait piocher les champs (enabled/queue/next/cooldown)
          handleTtsWidgetEvent(Object.assign({ type: "state" }, payload));
          return;
        }


// ===== Mods Whispers widget =====
if (widgetName === "modswhispers" || widgetName === "mods_whispers" || widgetName === "mods-whispers") {
  if (typeof window.handleModsWhispersWidgetEvent === "function") {
    window.handleModsWhispersWidgetEvent(payload);
  }
  return;
}

        // tts-catcher : utile côté dashboard TTS (chat buffer). Ici on ne l'utilise pas, mais on garde le payload en debug.
        if (widgetName === "tts-catcher") {
          appendLogDebug("tts-catcher.raw", data);
          return;
        }
      }

      if (event?.source === "Twitch"){

        // ===== Cheer (bits) =====
        if (event.type === "Cheer"){
          logSbTwitchEventToConsole(event, data);
          const d = data || {};
          const user = extractUserName(d.user || d);
          const bits = extractBits(d);
          eventsStore.push({ id: Date.now(), type:"Cheer", user, bits, ack:false });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();
          appendLog("#events-log", `Cheer — ${user} (${bits} bits)`);
          appendLogDebug("twitch.cheer", { user, bits });
          return;
        }

        // ===== Follow =====
        if (event.type === "Follow"){
          logSbTwitchEventToConsole(event, data);
          const d = data || {};
          const user = extractFollowName(d);
          eventsStore.push({ id: Date.now(), type:"Follow", user, ack:false });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();
          appendLog("#events-log", `Follow — ${user}`);
          appendLogDebug("twitch.follow", { user });
          return;
        }

        // ===== Incoming Raid =====
        if (event.type === "Raid"){
          logSbTwitchEventToConsole(event, data);
          const d = data || {};
          const from = extractRaiderName(d);
          const user = from; // affichage principal = raider
          const viewers = extractRaidViewers(d);
          eventsStore.push({ id: Date.now(), type:"Raid", user, from, viewers, ack:false });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();
          appendLog("#events-log", `Raid — ${from} (${viewers} viewers)`);
          appendLogDebug("twitch.raid", { from, viewers });
          return;
        }

        // ===== Subs-related events =====
        if (SUB_EVENT_TYPES.has(event.type)){
        logSbSubEventToConsole(event, data);

        // Helper: collect message text (Twitch resub often provides `text` or `parts[].text`)
        const buildSubMessage = (d)=>{
          try{
            const msg = (d?.message ?? "").toString().trim();
            if (msg) return msg;
            const txt = (d?.text ?? "").toString().trim();
            if (txt) return txt;
            const sm  = (d?.systemMessage ?? d?.system_message ?? "").toString().trim();
            if (sm) return sm;
            if (Array.isArray(d?.parts)){
              const joined = d.parts.map(p => (p && p.text != null) ? String(p.text) : "").join("").trim();
              if (joined) return joined;
            }
          } catch {}
          return "";
        };

        if (event.type === "GiftBomb"){
          const d = data || {};
          const gifter     = extractUserName(d.user || d);
          const recipients = extractRecipientNames(d.recipients);
          const giftCount  = Number.isFinite(Number(d.total)) ? Number(d.total) : (Array.isArray(d.recipients) ? d.recipients.length : 0);

          const subTierRaw = (d.sub_tier ?? d.subTier ?? d.subTierRaw ?? d.sub_tier_raw ?? d.tier ?? d.plan ?? d.subPlan ?? null);
          const isPrimeRaw = (d.is_prime ?? d.isPrime ?? null);

          const tierLabel  = tierLabelFromAny(subTierRaw ?? ((isPrimeRaw === true || isPrimeRaw === 1 || isPrimeRaw === "true" || isPrimeRaw === "1") ? "prime" : ""));

          eventsStore.push({
            id: Date.now(),
            type:"GiftBomb",
            user: gifter,
            tierLabel,
            sub_tier: subTierRaw,
            is_prime: isPrimeRaw,
            months:0,
            ack:false,
            recipients,
            giftCount,
            message: buildSubMessage(d)
          });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();
          appendLog("#events-log", `GiftBomb — ${gifter} (${tierLabel}${giftCount?`, ${giftCount} gifts`:""}) → ${recipients.join(", ")||"—"}`);
          return;
        }

        if (event.type === "GiftSub"){
          const d = data || {};
          const gifter    = extractUserName(d.user || d);
          const recipient = extractRecipientName(d.recipient);

          const subTierRaw = (d.sub_tier ?? d.subTier ?? d.subTierRaw ?? d.sub_tier_raw ?? d.tier ?? d.plan ?? d.subPlan ?? null);
          const isPrimeRaw = (d.is_prime ?? d.isPrime ?? null);

          const tierLabel = tierLabelFromAny(subTierRaw ?? ((isPrimeRaw === true || isPrimeRaw === 1 || isPrimeRaw === "true" || isPrimeRaw === "1") ? "prime" : ""));

          eventsStore.push({
            id: Date.now(),
            type:"GiftSub",
            user: gifter,
            tierLabel,
            sub_tier: subTierRaw,
            is_prime: isPrimeRaw,
            months:0,
            ack:false,
            recipient,
            message: buildSubMessage(d)
          });
          saveEvents(eventsStore);
          renderStoredEventsIntoUI();
          appendLog("#events-log", `GiftSub — ${gifter}${tierLabel?` (${tierLabel})`:""} → ${recipient||"—"}`);
          return;
        }

        // Default: Sub / ReSub / CommunitySub / MassGift / etc.
        const d = data || {};
        const user   = extractUserName(d.user || d);

        // IMPORTANT:
        // - Never default to "Prime"
        // - Prefer sub_tier + is_prime coming from Streamer.bot payload
        const subTierRaw = (d.sub_tier ?? d.subTier ?? d.subTierRaw ?? d.sub_tier_raw ?? d.subTierId ?? d.sub_tier_id ?? null);
        const isPrimeRaw = (d.is_prime ?? d.isPrime ?? null);

        const tierLabel = tierLabelFromAny(
          subTierRaw
          ?? d.tier ?? d.plan ?? d.subPlan ?? d.subTier
          ?? ((isPrimeRaw === true || isPrimeRaw === 1 || isPrimeRaw === "true" || isPrimeRaw === "1") ? "prime" : "")
          ?? ""
        );

        const months = extractMonths(d) || 0;
        const msg = buildSubMessage(d);

        eventsStore.push({
          id: Date.now(),
          type: event.type,
          user,
          tierLabel,
          sub_tier: subTierRaw,
          is_prime: isPrimeRaw,
          months,
          // also keep raw fields for richer UI formatting
          systemMessage: d.systemMessage ?? d.system_message ?? null,
          text: d.text ?? null,
          message: d.message ?? null,
          ack:false
        });
        saveEvents(eventsStore);
        renderStoredEventsIntoUI();
        appendLog("#events-log", `${event.type} — ${user} (${tierLabel}${months>0?`, ${months} mois`:""})${msg?` : ${msg}`:""}`);
        return;
      }
      }

      if (data && payload.widget === "gtg") {

        // ——— gagnant instantané du round ———
        if (data.type === "roundWinner"){
          const label = data.user || data.displayName || data.userName || data.name || "—";
          setWinnerLabel(label);
          appendLog("#guess-log", `Gagnant du round: ${label}${data.isStreamer ? " (Streamer)" : ""}`);
          return;
        }

        if (data.type === "partieUpdate"){
          setPartieIdUI(data.partieId || "");
          if (Number.isFinite(data.goalScore)) setGoalScoreUI(data.goalScore);
          const pg = getPerGamePairFromAny(data);
          renderPerGame(pg.idx, pg.goal);

          // IMPORTANT: "partieUpdate" décrit l'état de la PARTIE (active/idle), pas l'état d'une manche.
          // Une partie peut rester active entre deux manches (donc sans timer). On ne doit PAS verrouiller l'UI de manche ici.
          const partieActive = (data.partieActive === true) || (String(data.state || "").toLowerCase() === "running");
          try { setPartieActive(partieActive); } catch {}

          // Si la partie n'est pas active, on force l'UI en pause + purge timer/round.
          if (!partieActive || data.state === "Ended" || data.state === "Idle"){
            setRunning(false);
            stopRoundTimer();
            GTG_ROUND_ID = null;
          }

          appendLogDebug("partieUpdate", { partieId: data.partieId, goalScore: data.goalScore, state: data.state, partieActive, perGame: pg });
          return;
        }

        if (data.type === "partieEnd"){
          // ===== Winner / statut partie =====
          const rawWinner = (data.winner ?? "").toString().toLowerCase();
          const isCancelled = (rawWinner === "cancelled" || rawWinner === "canceled");
                    let winnerLabel = "—";
          let logWinner   = "";

          if (rawWinner) {
            switch (rawWinner) {
              case "streamer":
                winnerLabel = "Streamer";
                logWinner   = "Streamer";
                break;
              case "viewers":
              case "chat":
                winnerLabel = "Viewers";
                logWinner   = "Viewers";
                break;
              case "draw":
              case "tie":
                winnerLabel = "Égalité";
                logWinner   = "égalité";
                break;
              case "cancelled":
              case "canceled":
                winnerLabel = "Annulé";
                logWinner   = "annulation";
                break;
              default:
                winnerLabel = String(data.winner);
                logWinner   = String(data.winner);
                break;
            }
          }

          setWinnerLabel(winnerLabel);

          // ===== Scores finaux (totals ou champs à plat) =====
          let totals;
          if (data.totals && typeof data.totals === "object") {
            totals = {
              streamer: Number(data.totals.streamer) || 0,
              viewers:  Number(data.totals.viewers)  || 0
            };
          } else {
            totals = {
              streamer: Number(data.streamerScore ?? data.streamer) || 0,
              viewers:  Number(data.viewersScore  ?? data.viewers)  || 0
            };
          }

          if (isCancelled) {
            // Annulation : on réinitialise l'affichage des scores comme en fin de partie.
            totals = { streamer: 0, viewers: 0 };
          }

          GTG_TOTALS = totals;

          if (Number.isFinite(data.goalScore)) {
            GTG_GOAL = Number(data.goalScore);
          }

          renderGlobalScore(GTG_TOTALS, GTG_GOAL);
          refreshCancelAbility();

          // ===== Log détaillé =====
          const baseMsg     = isCancelled ? "Partie annulée." : "Partie terminée.";
          const extraWinner = logWinner ? ` Gagnant: ${logWinner}.` : "";
          const extraScore  =
            ` Score final — Streamer: ${GTG_TOTALS.streamer} / Viewers: ${GTG_TOTALS.viewers}` +
            (Number.isFinite(GTG_GOAL) ? ` (objectif ${GTG_GOAL})` : "") +
            ".";
          appendLog("#guess-log", baseMsg + extraWinner + extraScore);
          appendLogDebug("partieEnd.payload", data);

          // ===== Reset état local =====
          try { setPartieActive(false); } catch {}
          setRunning(false);
          stopRoundTimer();
          GTG_ROUND_ID = null;
          renderPerGame(null, null);

          // ===== HOOK OBS #3 optionnel =====
          // Emplacement prêt pour un éventuel FX OBS de fin de match.
          /*
          safeDoAction("GTG Match Winner OBS FX", {
            winner:        rawWinner || null,
            winnerLabel,               // label lisible
            streamerScore: GTG_TOTALS.streamer,
            viewersScore:  GTG_TOTALS.viewers,
            goalScore:     GTG_GOAL
          });
          */

          return;
        }

        if (data.type === "bootstrap"){
          if (data.error){ guessMsg("Erreur: " + data.error); return; }

          const genres = Array.isArray(data.genres) ? data.genres : [];
          fillGenresUI(genres);

          const OLServer = Number.isFinite(data.oldestYear) ? Number(data.oldestYear) : 1970;
          const NWServer = Number.isFinite(data.newestYear) ? Number(data.newestYear) : (new Date().getFullYear());
          const nowY = new Date().getFullYear();
          const OL = Math.min(OLServer, nowY);
          const NW = Math.min(NWServer, nowY);

          if (guessYearFromInput){ guessYearFromInput.min = String(OL); guessYearFromInput.max = String(NW); }
          if (guessYearToInput){   guessYearToInput.min   = String(OL); guessYearToInput.max   = String(NW); }

          const yf0 = parseYear(guessYearFromInput?.value);
          const yt0 = parseYear(guessYearToInput?.value);
          if (guessYearFromInput && (yf0 == null || yf0 < OL || yf0 > NW)) guessYearFromInput.value = String(OL);
          if (guessYearToInput   && (yt0 == null || yt0 < OL || yt0 > NW || yt0 < Number(guessYearFromInput.value))) guessYearToInput.value = String(NW);

          normalizeYearInputs();

          // Nouveau schéma ratings: { userRatingSteps, userVotesSteps, criticRatingSteps, criticVotesSteps }
          const ratingsCfg = (data.ratings && typeof data.ratings === "object") ? data.ratings : null;
          let ratingSteps = null;
          if (ratingsCfg) {
            if (Array.isArray(ratingsCfg.userRatingSteps) && ratingsCfg.userRatingSteps.length) {
              ratingSteps = ratingsCfg.userRatingSteps;
            } else if (Array.isArray(ratingsCfg.criticRatingSteps) && ratingsCfg.criticRatingSteps.length) {
              ratingSteps = ratingsCfg.criticRatingSteps;
            }
          }
          fillRatingStepsAll(ratingSteps || [0,50,60,70,80,85,90]);

          applyLastSetupAfterGenres();
          saveLastSetupFromUI();

          const pg = getPerGamePairFromAny(data);
          renderPerGame(pg.idx, pg.goal);

          guessMsg(`Genres chargés (${genres.length}). Période ${OL} — ${NW}`);
          appendLogDebug("bootstrap.echo", {
            ratings: data.ratings,
            oldestYear: data.oldestYear,
            newestYear: data.newestYear,
            perGame: pg
          });

          // Demande de pool immédiate
          requestPoolCount();

          // Harmoniser l'UI “secondes”
          enableSecondsModeForDurationInput();
          return;
        }

        if (data.type === "count"){
          const f = (data.filtersEcho && typeof data.filtersEcho === "object") ? data.filtersEcho : data;
          const n = (Number.isFinite(data.poolCount) ? data.poolCount : Number.isFinite(data.count) ? data.count : 0);

          const logSig = JSON.stringify({
            includeGenreId: f.includeGenreId ?? null,
            excludeGenreIds: Array.isArray(f.excludeGenreIds) ? f.excludeGenreIds.slice().sort() : [],
            yearFrom: f.yearFrom ?? null,
            yearTo:   f.yearTo   ?? null,
            minUserRating:   f.minUserRating   ?? null,
            minUserVotes:    f.minUserVotes    ?? null,
            minCriticRating: f.minCriticRating ?? null,
            minCriticVotes:  f.minCriticVotes  ?? null
          });
          const now = Date.now();
          if (LAST_COUNT_LOG_SIG !== logSig || (now - LAST_COUNT_LOG_TS) > 1500){
            appendLog("#guess-log", `Pool: ${n} jeux`);
            LAST_COUNT_LOG_SIG = logSig;
            LAST_COUNT_LOG_TS  = now;
          }
          appendLogDebug("count.filtersEcho", f);
          guessMsg(`Jeux correspondants: ${n}`);
          updatePoolBadge(n);
          return;
        }

        if (data.type === "start"){
          if (data.roundId) GTG_ROUND_ID = String(data.roundId);
          setRunning(true);

          const endMs = Number.isFinite(data.endsAtUtcMs) ? Number(data.endsAtUtcMs)
                      : Number.isFinite(data.endTs)      ? Number(data.endTs)
                      : Number.isFinite(data.endsAt)      ? Number(data.endsAt) : NaN;
          if (Number.isFinite(endMs)) startRoundTimer(endMs);

const targetName = extractTargetNameFromPayload(data);
if (targetName) appendLogDebug("target", targetName);



          const pg = getPerGamePairFromAny(data);
          renderPerGame(pg.idx, pg.goal);

          appendLog("#guess-log", "Manche démarrée");
          appendLogDebug("start.payload", data);
          refreshCancelAbility();
          return;
        }

        if (data.type === "tick"){
          const endMs = Number.isFinite(data.endsAtUtcMs) ? Number(data.endsAtUtcMs)
                      : Number.isFinite(data.endTs)      ? Number(data.endTs)
                      : Number.isFinite(data.endsAt)      ? Number(data.endsAt) : NaN;
          if (Number.isFinite(endMs)) startRoundTimer(endMs);
          appendLogDebug("tick.payload", { endsAtUtcMs: data.endsAtUtcMs ?? data.endTs ?? data.endsAt });
          return;
        }

        if (data.type === "reveal"){
          const g = data.game || {};
          const name = g.name || "—";
          const d = (data.details && typeof data.details === "object") ? data.details : {};

          const year         = isNum(d.year) ? d.year : extractYearFromGame(g);
          const userRating   = pickNum(d.userRating);
          const userVotes    = pickNum(d.userVotes);
          const criticRating = pickNum(d.criticRating);
          const criticVotes  = pickNum(d.criticVotes);
          const companies    = asArray(d.companies);

          const parts = [];
          if (isNum(year)) parts.push(String(year));
          if (userRating != null)  parts.push(`Users: ${userRating}%${userVotes?` (${userVotes})`:""}`);
          if (criticRating != null)parts.push(`Critics: ${criticRating}%${criticVotes?` (${criticVotes})`:""}`);
          if (companies.length)    parts.push(`Éditeur/Studio: ${joinList(companies)}`);

          const lw = data.lastWinner && typeof data.lastWinner === "object" ? data.lastWinner : null;
          const winner = lw ? (lw.user || lw.name || lw.label) : (data.winner || "");

          $("#guess-last-info")   && ($("#guess-last-info").textContent   = name);
          $("#qv-guess-last")     && ($("#qv-guess-last").textContent     = name);
          setWinnerLabel(winner);
          $("#guess-reveal-name") && ($("#guess-reveal-name").textContent = name);
          $("#guess-reveal-year") && ($("#guess-reveal-year").textContent = isNum(year) ? String(year) : "—");
          $("#guess-reveal-users")   && ($("#guess-reveal-users").textContent   =
            (userRating != null ? `${userRating}%` : "—") + (userVotes ? ` (${userVotes})` : ""));
          $("#guess-reveal-critics") && ($("#guess-reveal-critics").textContent =
            (criticRating != null ? `${criticRating}%` : "—") + (criticVotes ? ` (${criticVotes})` : ""));
          $("#guess-reveal-devs") && ($("#guess-reveal-devs").textContent = (companies && companies.length ? joinList(companies) : "—"));
          $("#guess-reveal-pubs") && ($("#guess-reveal-pubs").textContent = (companies && companies.length ? joinList(companies) : "—"));

          const pg = getPerGamePairFromAny(data);
          renderPerGame(pg.idx, pg.goal);

          setRunning(false);
          stopRoundTimer();
          GTG_ROUND_ID = null;

          const extra = parts.length ? ` — ${parts.join(" • ")}` : "";
          appendLog("#guess-log", `Réponse: ${name}${extra}${winner?` (gagnant: ${winner})`:""}`);
          appendLogDebug("reveal.payload", data);
          refreshCancelAbility();
          return;
        }

        if (data.type === "scoreUpdate" || data.type === "resume" || data.type === "scoreReset"){
          updateLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : []);

          const rs = data.runningState && typeof data.runningState === "object" ? data.runningState : null;
          if (rs) {
            if (rs.running === true) {
              if (rs.roundId) GTG_ROUND_ID = String(rs.roundId);
              setRunning(true);
              if (Number.isFinite(rs.endsAtUtcMs)) startRoundTimer(Number(rs.endsAtUtcMs));
            } else if (rs.running === false) {
              setRunning(false);
              stopRoundTimer();
              GTG_ROUND_ID = null;
            }
          }

          const t = (data.totals && typeof data.totals === "object")
            ? { streamer: Number(data.totals.streamer)||0, viewers: Number(data.totals.viewers)||0 }
            : { streamer: Number(data.streamer)||0,       viewers: Number(data.viewers)||0 };

          GTG_TOTALS = t;

          if (Number.isFinite(data.goalScore)) {
            GTG_GOAL = Number(data.goalScore);
          } else if (data.partie && Number.isFinite(data.partie.goalScore)) {
            GTG_GOAL = Number(data.partie.goalScore);
          }

          renderGlobalScore(GTG_TOTALS, GTG_GOAL);
          refreshCancelAbility();

          const pg = getPerGamePairFromAny(rs || data);
          renderPerGame(pg.idx, pg.goal);

          const lw = data.lastWinner && typeof data.lastWinner === "object" ? data.lastWinner : null;
          if (lw) setWinnerLabel(lw.user || lw.name || lw.label || "—");

          if (data.type === "scoreReset") appendLog("#guess-log", "Scores réinitialisés.");
          appendLogDebug(data.type + ".payload", data);
          return;
        }
      }

    } catch (e) {
      appendLog("#guess-log", "handleSBEvent outer error: " + (e?.message || e));
    }
  }

  
