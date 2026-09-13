(function(){
  "use strict";

  const ACTION_NAME = "JBS Dashboard - Twitch Channel";
  const MAX_SUGGESTIONS = 10;
  const SEARCH_DEBOUNCE_MS = 350;
  const MIN_SEARCH_LENGTH = 2;
  const ACTION_RECHECK_MS = 3000;

  let titleCurrent;
  let titleInput;
  let titleButton;
  let categoryCurrent;
  let categoryInput;
  let categoryButton;
  let categorySuggestions;
  let feedback;

  let connected = false;
  let actionReady = false;
  let actionId = "";
  let actionCheckTimer = null;
  let selectedCategory = null;
  let searchTimer = null;
  let lastSearchRequestId = "";
  let activeSuggestionIndex = -1;
  let visibleSuggestions = [];
  let titlePending = false;
  let categoryPending = false;

  function makeRequestId(prefix){
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeText(value){
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function levenshtein(a, b){
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const previous = new Array(b.length + 1);
    const current = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) previous[j] = j;

    for (let i = 1; i <= a.length; i++){
      current[0] = i;
      for (let j = 1; j <= b.length; j++){
        const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + substitutionCost
        );
      }
      for (let j = 0; j <= b.length; j++) previous[j] = current[j];
    }

    return previous[b.length];
  }

  function categoryScore(name, query){
    const normalizedName = normalizeText(name);
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return 0;
    if (normalizedName === normalizedQuery) return -10000;

    let score = levenshtein(normalizedName, normalizedQuery);
    score += Math.abs(normalizedName.length - normalizedQuery.length) * 0.15;

    if (normalizedName.startsWith(normalizedQuery)) score -= 1000;
    if (normalizedName.split(/\s+/).some(word => word.startsWith(normalizedQuery))) score -= 500;

    const position = normalizedName.indexOf(normalizedQuery);
    if (position >= 0) score -= 250 - Math.min(position, 100);

    return score;
  }

  function setFeedback(message, kind){
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.classList.remove("ok", "error");
    if (kind) feedback.classList.add(kind);
  }

  function hideSuggestions(){
    if (!categorySuggestions || !categoryInput) return;
    categorySuggestions.hidden = true;
    categoryInput.setAttribute("aria-expanded", "false");
    activeSuggestionIndex = -1;
  }

  function updateControlState(){
    const enabled = connected && actionReady;

    if (titleInput) titleInput.disabled = !enabled;
    if (titleButton) titleButton.disabled = !enabled || titlePending;
    if (categoryInput) categoryInput.disabled = !enabled;
    if (categoryButton) categoryButton.disabled = !enabled || categoryPending || !selectedCategory;

    if (!enabled) hideSuggestions();
  }

  function clearActionCheckTimer(){
    if (actionCheckTimer != null){
      clearInterval(actionCheckTimer);
      actionCheckTimer = null;
    }
  }

  function ensureActionCheckTimer(){
    if (!connected || actionReady || actionCheckTimer != null) return;

    actionCheckTimer = setInterval(() => {
      checkActionAvailability(true);
    }, ACTION_RECHECK_MS);
  }

  async function checkActionAvailability(silent){
    if (!connected) return false;

    const client = window.sbClient || window.client;
    if (!client || typeof client.getActions !== "function"){
      actionReady = false;
      actionId = "";
      updateControlState();
      if (!silent) setFeedback("Connexion Streamer.bot indisponible.", "error");
      ensureActionCheckTimer();
      return false;
    }

    const wasReady = actionReady;

    try {
      const response = await client.getActions();
      const action = Array.isArray(response?.actions)
        ? response.actions.find(item => item?.name === ACTION_NAME)
        : null;

      actionReady = !!action && action.enabled !== false && !!action.id;
      actionId = actionReady ? String(action.id) : "";
    } catch {
      actionReady = false;
      actionId = "";
    }

    updateControlState();

    if (!actionReady){
      if (!silent || wasReady){
        setFeedback(`Action Streamer.bot « ${ACTION_NAME} » introuvable ou désactivée.`, "error");
      }
      ensureActionCheckTimer();
      return false;
    }

    clearActionCheckTimer();

    if (!wasReady){
      setFeedback("");
      await requestStatus();
    }

    return true;
  }

  function updateActiveSuggestion(){
    if (!categorySuggestions) return;
    const options = categorySuggestions.querySelectorAll(".stream-category-option");
    options.forEach((option, index) => {
      option.classList.toggle("active", index === activeSuggestionIndex);
      option.setAttribute("aria-selected", index === activeSuggestionIndex ? "true" : "false");
    });

    if (activeSuggestionIndex >= 0 && options[activeSuggestionIndex]){
      options[activeSuggestionIndex].scrollIntoView({ block:"nearest" });
    }
  }

  function selectCategory(category){
    if (!actionReady || !category || !category.id || !category.name) return;

    selectedCategory = {
      id: String(category.id),
      name: String(category.name)
    };

    categoryInput.value = selectedCategory.name;
    updateControlState();
    hideSuggestions();
    setFeedback("");
  }

  function renderSuggestions(categories, query){
    if (!actionReady || !categorySuggestions || !categoryInput) return;

    visibleSuggestions = (Array.isArray(categories) ? categories : [])
      .filter(item => item && item.id && item.name)
      .map(item => ({ id:String(item.id), name:String(item.name) }))
      .sort((a, b) => {
        const scoreDiff = categoryScore(a.name, query) - categoryScore(b.name, query);
        return scoreDiff || a.name.localeCompare(b.name, "fr", { sensitivity:"base" });
      })
      .slice(0, MAX_SUGGESTIONS);

    categorySuggestions.textContent = "";
    activeSuggestionIndex = -1;

    if (!visibleSuggestions.length){
      hideSuggestions();
      return;
    }

    visibleSuggestions.forEach((item, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "stream-category-option";
      option.id = `stream-category-option-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.textContent = item.name;
      option.addEventListener("mousedown", event => event.preventDefault());
      option.addEventListener("click", () => selectCategory(item));
      categorySuggestions.appendChild(option);
    });

    categorySuggestions.hidden = false;
    categoryInput.setAttribute("aria-expanded", "true");
  }

  async function sendOperation(operation, args){
    if (!connected){
      setFeedback("Connexion Streamer.bot indisponible.", "error");
      return false;
    }

    if (!actionReady || !actionId){
      setFeedback(`Action Streamer.bot « ${ACTION_NAME} » indisponible.`, "error");
      updateControlState();
      ensureActionCheckTimer();
      return false;
    }

    const client = window.sbClient || window.client;
    if (!client || typeof client.doAction !== "function"){
      setFeedback("Connexion Streamer.bot indisponible.", "error");
      return false;
    }

    try {
      await client.doAction(actionId, Object.assign({ operation }, args || {}));
      return true;
    } catch (error){
      actionReady = false;
      actionId = "";
      updateControlState();
      ensureActionCheckTimer();
      setFeedback(error?.message || `Action Streamer.bot « ${ACTION_NAME} » indisponible.`, "error");
      return false;
    }
  }

  function requestStatus(){
    return sendOperation("status", { requestId:makeRequestId("status") });
  }

  async function onConnected(){
    connected = true;
    actionReady = false;
    actionId = "";
    updateControlState();
    await checkActionAvailability(false);
  }

  function onDisconnected(){
    connected = false;
    actionReady = false;
    actionId = "";
    titlePending = false;
    categoryPending = false;
    selectedCategory = null;
    lastSearchRequestId = "";
    visibleSuggestions = [];
    clearTimeout(searchTimer);
    searchTimer = null;
    clearActionCheckTimer();
    updateControlState();
    setFeedback("Connexion Streamer.bot indisponible.", "error");
  }

  function scheduleCategorySearch(){
    clearTimeout(searchTimer);
    selectedCategory = null;
    visibleSuggestions = [];
    hideSuggestions();
    updateControlState();

    if (!actionReady) return;

    const query = categoryInput.value.trim();
    if (!query){
      lastSearchRequestId = "";
      visibleSuggestions = [];
      hideSuggestions();
      setFeedback("");
      return;
    }

    searchTimer = setTimeout(() => {
      const id = makeRequestId("search");
      lastSearchRequestId = id;

      // Même avec 1 seul caractère, on laisse l'action Streamer.bot décider
      // localement de ne PAS appeler Twitch. Cela permet de tracer la décision
      // "min_length" dans [JBS_TWITCH_API_AUDIT] sans consommer le quota Twitch.
      sendOperation("searchCategories", { query, requestId:id });

      if (query.length < MIN_SEARCH_LENGTH){
        setFeedback(`Entre au moins ${MIN_SEARCH_LENGTH} caractères pour rechercher une catégorie Twitch.`);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function applyStatus(payload){
    if (titleCurrent && typeof payload.title === "string"){
      titleCurrent.textContent = payload.title || "—";
    }

    if (categoryCurrent && payload.category && typeof payload.category === "object"){
      categoryCurrent.textContent = payload.category.name || "—";
    }
  }

  function handleWidget(payload){
    if (!payload || normalizeText(payload.widget) !== "jbs-twitch-channel") return;

    if (payload.type === "error"){
      setFeedback(payload.message || "Erreur Streamer.bot/Twitch.", "error");

      if (payload.operation === "setTitle") titlePending = false;
      if (payload.operation === "setCategory") categoryPending = false;
      updateControlState();
      return;
    }

    if (payload.type === "searchBlocked"){
      if (payload.requestId !== lastSearchRequestId) return;

      visibleSuggestions = [];
      hideSuggestions();
      setFeedback(payload.message || "Recherche Twitch temporairement suspendue pour préserver le quota API.", "error");
      return;
    }

    if (payload.type === "categories"){
      if (payload.requestId !== lastSearchRequestId) return;

      const currentQuery = categoryInput.value.trim();
      if (normalizeText(currentQuery) !== normalizeText(payload.query || "")) return;

      renderSuggestions(payload.categories, currentQuery);
      if (currentQuery.length >= MIN_SEARCH_LENGTH) setFeedback("");

      const exactMatch = visibleSuggestions.find(
        item => normalizeText(item.name) === normalizeText(currentQuery)
      );
      if (exactMatch){
        selectedCategory = exactMatch;
        updateControlState();
      }
      return;
    }

    if (payload.type === "status"){
      applyStatus(payload);

      if (payload.action === "setTitle"){
        titlePending = false;
        titleInput.value = "";
        updateControlState();
        setFeedback("Titre du stream mis à jour.", "ok");
      } else if (payload.action === "setCategory"){
        categoryPending = false;
        categoryInput.value = "";
        selectedCategory = null;
        visibleSuggestions = [];
        hideSuggestions();
        updateControlState();
        setFeedback("Catégorie du stream mise à jour.", "ok");
      }
    }
  }

  function handleStreamUpdate(data){
    if (!data || typeof data !== "object") return;

    if (titleCurrent && typeof data.status === "string"){
      titleCurrent.textContent = data.status || "—";
    }

    if (categoryCurrent && data.game && typeof data.game === "object"){
      categoryCurrent.textContent = data.game.name || "—";
    }
  }

  function handleRawData(payload){
    if (!payload || typeof payload !== "object") return;

    if (normalizeText(payload.widget) === "jbs-twitch-channel"){
      handleWidget(payload);
      return;
    }

    if (payload.event?.source === "Twitch" && payload.event?.type === "StreamUpdate"){
      handleStreamUpdate(payload.data);
    }
  }

  function bindUi(){
    titleCurrent = document.getElementById("stream-current-title");
    titleInput = document.getElementById("stream-title-input");
    titleButton = document.getElementById("stream-title-update");
    categoryCurrent = document.getElementById("stream-current-category");
    categoryInput = document.getElementById("stream-category-input");
    categoryButton = document.getElementById("stream-category-update");
    categorySuggestions = document.getElementById("stream-category-suggestions");
    feedback = document.getElementById("stream-control-feedback");

    if (!titleInput || !titleButton || !categoryInput || !categoryButton || !categorySuggestions) return;

    updateControlState();

    titleButton.addEventListener("click", async () => {
      if (!actionReady) return;

      const title = titleInput.value.trim();
      if (!title){
        setFeedback("Le titre ne peut pas être vide.", "error");
        return;
      }

      if (title.length > 140){
        setFeedback("Le titre Twitch ne peut pas dépasser 140 caractères.", "error");
        return;
      }

      titlePending = true;
      updateControlState();
      setFeedback("");

      const sent = await sendOperation("setTitle", {
        title,
        requestId:makeRequestId("title")
      });
      if (!sent){
        titlePending = false;
        updateControlState();
      }
    });

    titleInput.addEventListener("keydown", event => {
      if (event.key === "Enter") titleButton.click();
    });

    categoryInput.addEventListener("input", scheduleCategorySearch);

    categoryInput.addEventListener("focus", () => {
      if (actionReady && visibleSuggestions.length && categoryInput.value.trim()){
        categorySuggestions.hidden = false;
        categoryInput.setAttribute("aria-expanded", "true");
      }
    });

    categoryInput.addEventListener("keydown", event => {
      if (event.key === "Escape"){
        hideSuggestions();
        return;
      }

      if (categorySuggestions.hidden){
        if (event.key === "Enter" && selectedCategory){
          event.preventDefault();
          categoryButton.click();
        }
        return;
      }

      if (event.key === "ArrowDown"){
        event.preventDefault();
        activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, visibleSuggestions.length - 1);
        updateActiveSuggestion();
      } else if (event.key === "ArrowUp"){
        event.preventDefault();
        activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
        updateActiveSuggestion();
      } else if (event.key === "Enter" && activeSuggestionIndex >= 0){
        event.preventDefault();
        selectCategory(visibleSuggestions[activeSuggestionIndex]);
      }
    });

    categoryButton.addEventListener("click", async () => {
      if (!actionReady) return;

      if (!selectedCategory){
        setFeedback("Sélectionne une catégorie dans la liste proposée.", "error");
        return;
      }

      categoryPending = true;
      updateControlState();
      setFeedback("");

      const sent = await sendOperation("setCategory", {
        categoryId:selectedCategory.id,
        requestId:makeRequestId("category")
      });
      if (!sent){
        categoryPending = false;
        updateControlState();
      }
    });

    document.addEventListener("click", event => {
      if (!categorySuggestions.contains(event.target) && event.target !== categoryInput){
        hideSuggestions();
      }
    });
  }

  window.JBSTwitchChannel = {
    onConnected,
    onDisconnected,
    handleRawData
  };

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bindUi, { once:true });
  } else {
    bindUi();
  }
})();
