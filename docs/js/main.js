/******************************************************************
   *                           🐞 Debug toggle + Boot Sequence
   ******************************************************************/
  function installDebugToggleButton(){
    // Évite les doublons si le boot ou le debug existent déjà
    if ($("#gtg-debug-toggle") || $("#gtg-boot-sequence") || $("#gtg-boot-sequence-speed")) return;

    // Bouton Debug
    const debugBtn = document.createElement("button");
    debugBtn.id = "gtg-debug-toggle";
    debugBtn.type = "button";
    debugBtn.title = "Debug verbose (affiche la cible et les payloads echo)";
    debugBtn.textContent = "🐞 Debug";
    debugBtn.className = "btn btn--ghost";
    debugBtn.style.marginLeft = "8px";

    updateDebugBtnVisual(debugBtn);
    debugBtn.addEventListener("click", ()=>{
      DEBUG_VERBOSE = !DEBUG_VERBOSE;
      updateDebugBtnVisual(debugBtn);
      appendLog("#guess-log", `Debug verbose ${DEBUG_VERBOSE?"activé":"désactivé"}`);
    });

    // Bouton Boot Sequence
    const bootBtn = document.createElement("button");
    bootBtn.id = "gtg-boot-sequence";
    bootBtn.type = "button";
    bootBtn.title = "Lancer la séquence de boot GTG (GTG Boot From Terminal)";
    bootBtn.textContent = "Boot Sequence";
    bootBtn.className = "btn btn--ghost";
    bootBtn.style.marginLeft = "8px";

    bootBtn.addEventListener("click", ()=>{
      safeDoAction("GTG Boot From Terminal", { stepNumber: 1 });
    });

    // Bouton Boot Sequence (Speed)
    const bootSpeedBtn = document.createElement("button");
    bootSpeedBtn.id = "gtg-boot-sequence-speed";
    bootSpeedBtn.type = "button";
    bootSpeedBtn.title = "Lancer la séquence de boot GTG en mode rapide (fast=1)";
    bootSpeedBtn.textContent = "Boot Speed";
    bootSpeedBtn.className = "btn btn--ghost";
    bootSpeedBtn.style.marginLeft = "8px";

    bootSpeedBtn.addEventListener("click", ()=>{
      safeDoAction("GTG Boot From Terminal", { stepNumber: 1, fast: 1 });
    });

    // Point d’ancrage commun
    const anchor =
      $("#gtg-reset-scores") ||
      $("#guess-end") ||
      $(".app-header .actions") ||
      $(".toolbar") ||
      $("header") || document.body;

    if (anchor && anchor.insertAdjacentElement){
      if (anchor.id === "gtg-reset-scores" || anchor.id === "guess-end"){
        // ordre: anchor -> Boot -> Debug
        anchor.insertAdjacentElement("afterend", bootBtn);
        bootBtn.insertAdjacentElement("afterend", bootSpeedBtn);
        bootSpeedBtn.insertAdjacentElement("afterend", debugBtn);
      } else {
        anchor.appendChild(bootBtn);
        anchor.appendChild(bootSpeedBtn);
        anchor.appendChild(debugBtn);
      }
    } else {
      document.body.appendChild(bootBtn);
      document.body.appendChild(bootSpeedBtn);
      document.body.appendChild(debugBtn);
    }
  }

  function updateDebugBtnVisual(btn){
    if (!btn) btn = $("#gtg-debug-toggle");
    if (!btn) return;
    if (DEBUG_VERBOSE){
      btn.classList.add("active");
      btn.style.background = "var(--danger, #d73a1d)";
      btn.style.color = "#fff";
      btn.style.border = "none";
    } else {
      btn.classList.remove("active");
      btn.style.background = "";
      btn.style.color = "";
      btn.style.border = "";
    }
  }

  /******************************************************************
   *                         🧭 Quick Nav + Boot
   ******************************************************************/
  function bindOverviewQuickNav(){
    $$(".qv-card").forEach(card=>{
      card.addEventListener("click", ()=>{
        const to = card.getAttribute("data-goto");
        if (to) showTab(to);
      });
    });
  }

  function boot(){
    bindLockButton();
    bindOverviewQuickNav();
    setGuessHandlers();
    installFilterChangeGuard();
    bindFiltersCollapse();
    installDebugToggleButton();
    bindTtsControls(); // === TTS mini-dashboard
    
    clearTtsPlaceholders();
connectSB();
    renderGlobalScore(GTG_TOTALS, GTG_GOAL);
    refreshCancelAbility();
    renderPerGame(null, null);
    enableSecondsModeForDurationInput();   // UI “secondes”
    updatePoolBadge(null);

    // TTS: état par défaut sur l'UI
    setTtsEnabledUI(false);
    setTtsQueueCount(0);
    setTtsLastMessage("", "");
    setTtsNextRun(Number.NaN, Number.NaN);
    updateTtsSwitchUI(false);

    // ===== Watchdog : si on croit être en cours mais qu'aucun timer n'est actif, on débloque localement =====
    setInterval(() => {
    // Watchdog anti état "round running" sans timer (ex: events manquants / état zombie côté SB).
    // 1) Tentative de resync via "GTG Scores Get"
    // 2) Si toujours aucun timer au tick suivant => reset local (pour déverrouiller l'UI)
    if (GTG_RUNNING && GTG_TIMER_ID == null){
      if (!window.__GTG_WD_RESYNC_TRIED){
        window.__GTG_WD_RESYNC_TRIED = true;
        appendLog("#guess-log", "Watchdog: manche 'running' sans timer → resync via GTG Scores Get…");
        safeDoAction("GTG Scores Get", {});
        return;
      }

      appendLog("#guess-log", "Watchdog: aucune manche détectée (pas de timer) → reset état local.");
      setRunning(false);
      GTG_ROUND_ID = null;
      window.__GTG_WD_RESYNC_TRIED = false;
      return;
    }

    // retour à la normale => on réarme
    window.__GTG_WD_RESYNC_TRIED = false;
  }, 5000);
}

  window.addEventListener("DOMContentLoaded", boot);
