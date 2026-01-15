/******************************************************************
   *                     📦 EVENTS (Twitch subs)
   ******************************************************************/
  function loadEvents(){ try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]") || []; } catch { return []; } }
  function saveEvents(list){ try { localStorage.setItem(EVENTS_KEY, JSON.stringify((list || []).slice(-MAX_EVENTS))); } catch {} }

  let eventsStore = loadEvents();
  let qvUnreadEvents = eventsStore.filter(e => !e.ack).length;

  function eventLine(e){
    if (e.type === "GiftBomb") {
      const n = isNum(e.giftCount) ? e.giftCount : (Array.isArray(e.recipients) ? e.recipients.length : 0);
      const recShort = Array.isArray(e.recipients)
        ? e.recipients.slice(0,5).join(", ") + (e.recipients.length > 5 ? "…" : "")
        : "";
      return `<strong>${e.user}</strong> — Gift Bomb <span class="muted">${e.tierLabel||""}${n ? `${e.tierLabel ? " • " : ""}${n} gifts` : ""}</span>${recShort ? `<br><span class="muted">→ ${recShort}</span>` : ""}`;
    }
    if (e.type === "GiftSub") {
      const tierTxt = e.tierLabel ? ` (${e.tierLabel})` : "";
      const toTxt   = e.recipient ? ` <span class="muted">to ${e.recipient}</span>` : "";
      return `<strong>${e.user}</strong> — Gifted sub${tierTxt}${toTxt}`;
    }

    if (e.type === "Cheer") {
      const bits = isNum(e.bits) ? e.bits : 0;
      return `<strong>${e.user}</strong> — Cheer <span class="muted">${bits} bits</span>`;
    }
    if (e.type === "Follow") {
      return `<strong>${e.user}</strong> — Follow`;
    }
    if (e.type === "Raid") {
      const viewers = isNum(e.viewers) ? e.viewers : 0;
      const from = e.from ? ` <span class="muted">from ${e.from}</span>` : "";
      return `<strong>${e.user}</strong> — Raid <span class="muted">${viewers} viewers</span>${from}`;
    }
    if (e.type === "Tipeee") {
  const amountTxt = (e.amount != null && e.amount !== "") ? `${e.currencySymbol || ""}${e.amount}` : "";
  const msg = (e.message || "").trim();
  return `<strong>${e.user}</strong> — Tipeee ${amountTxt ? `<span class="muted">${amountTxt}</span>` : ""}${msg ? `<br><span class="muted">${msg}</span>` : ""}`;
}

    return `<strong>${e.user}</strong> — ${e.type} • ${e.tier?("Tier "+e.tier):""} • ${e.tierLabel}${e.months>0?` • ${e.months} mois`:""}`;
  }

  function syncEventsStatusUI(){
    setDot(".dot-events", qvUnreadEvents > 0);
    const bQV = $("#qv-events-count");
    if (bQV) { bQV.textContent = String(qvUnreadEvents); bQV.style.display = qvUnreadEvents > 0 ? "" : "none"; }
    const bTab  = $(".badge-events");
    const bHead = $("#events-counter");
    if (bTab)  setText(bTab, String(qvUnreadEvents));
    if (bHead) setText(bHead, String(qvUnreadEvents));
  }

  function makeItem(htmlText, onToggle, ack=false, id=null){
    const li = document.createElement("li");
    li.className = "event";
    const a = document.createElement("a");
    a.href = "#";
    a.innerHTML = htmlText;
    a.addEventListener("click", (ev)=>{ ev.preventDefault(); ev.stopPropagation(); try { onToggle?.(); } catch {} });
    li.appendChild(a);
    if (ack) li.classList.add("acked");
    if (id != null) li.dataset.id = String(id);
    return li;
  }

  function appendListItem(listEl, htmlText, onToggle, ack=false, id=null){
    if (!listEl) return;
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains("muted"))
      listEl.removeChild(listEl.firstElementChild);
    const li = makeItem(htmlText, onToggle, ack, id);
    listEl.appendChild(li);
    const limit = listEl.classList.contains("list--short") ? 6 : 60;
    while (listEl.children.length > limit) listEl.removeChild(listEl.firstChild);
  }

  function prependListItem(listEl, htmlText, onToggle, ack=false, id=null){
    if (!listEl) return;
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains("muted"))
      listEl.removeChild(listEl.firstElementChild);
    const li = makeItem(htmlText, onToggle, ack, id);
    listEl.insertBefore(li, listEl.firstChild);
    const limit = listEl.classList.contains("list--short") ? 6 : 60;
    while (listEl.children.length > limit) listEl.removeChild(listEl.lastChild);
  }

  function renderStoredEventsIntoUI(){
    const qv   = $("#qv-events-list");
    const full = $("#events-subs-list");
    if (qv)   qv.innerHTML = "";
    if (full) full.innerHTML = "";
    if (!eventsStore.length){
      if (qv)   qv.innerHTML   = '<li class="muted">Aucun event récent</li>';
      if (full) full.innerHTML = '<li class="muted">Aucun event</li>';
      qvUnreadEvents = 0;
      syncEventsStatusUI();
      return;
    }
    for (let i=0;i<eventsStore.length;i++){
      const e = eventsStore[i];
      const html = eventLine(e);
      const toggle = ()=>{ e.ack = !e.ack; saveEvents(eventsStore); renderStoredEventsIntoUI(); };
      if (qv)   prependListItem(qv, html, toggle, e.ack, e.id);
      if (full) prependListItem(full, html, toggle, e.ack, e.id);
    }
    qvUnreadEvents = eventsStore.filter(e => !e.ack).length;
    syncEventsStatusUI();
  }
  renderStoredEventsIntoUI();

  

/******************************************************************
   *                  🎁 Twitch Sub Events (helpers)
   ******************************************************************/
  const SUB_EVENT_TYPES = new Set(["Sub","ReSub","GiftSub","GiftBomb","MassGift","MassSubGift","CommunitySub","CommunitySubGift"]);

  function extractUserName(d){
    if (!d) return "—";
    if (typeof d === "string") return d;
    if (typeof d.displayName === "string") return d.displayName;
    if (typeof d.userName    === "string") return d.userName;
    if (typeof d.username    === "string") return d.username;
    if (typeof d.user        === "string") return d.user;
    if (typeof d.sender      === "string") return d.sender;
    if (typeof d.gifter      === "string") return d.gifter;
    if (typeof d.login       === "string") return d.login;
    if (typeof d.name        === "string") return d.name;
    if (d.user && typeof d.user === "object"){
      if (typeof d.user.displayName === "string") return d.user.displayName;
      if (typeof d.user.name        === "string") return d.user.name;
      if (typeof d.user.login       === "string") return d.user.login;
    }
    return "—";
  }
  function extractRecipientName(obj){
    if (!obj) return "—";
    if (typeof obj === "string") return obj;
    if (typeof obj.name  === "string" && obj.name)  return obj.name;
    if (typeof obj.login === "string" && obj.login) return obj.login;
    if (typeof obj.id    === "string" && obj.id)    return obj.id;
    return "—";
  }
  function extractRecipientNames(arr){ if (!Array.isArray(arr)) return []; return arr.map(r => extractRecipientName(r)); }
  function tierLabelFromAny(v){
    const s = (v == null ? "" : String(v)).toLowerCase();
    if (s.includes("prime"))  return "Prime";
    if (s.includes("1000") || s.includes("tier 1") || s.includes("tier1")) return "Tier 1";
    if (s.includes("2000") || s.includes("tier 2") || s.includes("tier2")) return "Tier 2";
    if (s.includes("3000") || s.includes("tier 3") || s.includes("tier3")) return "Tier 3";
    return String(v || "");
  }
  function extractMonths(d){
    const m = Number(d?.cumulativeMonths ?? d?.months ?? d?.streak ?? 0);
    return Number.isFinite(m) ? m : 0;
  }

  function extractBits(d){
    const b = Number(d?.bits ?? d?.amount ?? d?.count ?? d?.bitsUsed ?? d?.bitsAmount ?? d?.cheerAmount ?? d?.message?.bits);
    return Number.isFinite(b) ? Math.trunc(b) : 0;
  }
  function extractRaidViewers(d){
    const v = Number(d?.viewers ?? d?.viewerCount ?? d?.raidViewers ?? d?.raidCount ?? d?.amount ?? d?.count);
    return Number.isFinite(v) ? Math.trunc(v) : 0;
  }
  function extractRaiderName(d){
    // Incoming raid: try to identify the raiding channel/user
    return extractUserName(
      d?.raider ??
      d?.from ?? d?.from_user ?? d?.fromUser ?? d?.fromUserName ?? d?.fromUsername ??
      d?.from_broadcaster ?? d?.fromBroadcaster ?? d?.fromBroadcasterUser ?? d?.fromBroadcasterUserName ??
      d?.from_broadcaster_user_name ?? d?.from_broadcaster_user_login ?? d?.from_broadcaster_user_id ??
      d?.raidingBroadcaster ?? d?.raiding_channel ?? d?.raidingChannel ??
      d?.user ??
      d
    );
  }

  function extractFollowName(d){
    // Follow: try to identify the follower user
    return extractUserName(
      d?.follower ??
      d?.followUser ?? d?.followedBy ??
      d?.from ?? d?.from_user ?? d?.fromUser ?? d?.fromUserName ?? d?.fromUsername ??
      d?.user ??
      d?.user_name ?? d?.user_login ?? d?.userName ?? d?.userLogin ?? d?.login ?? d?.username ?? d?.displayName ??
      d
    );
  }


  
  function logSbTwitchEventToConsole(evt, payload){
    try {
      const type = evt?.type || "Unknown";
      console.groupCollapsed(`🟦 [Twitch:${type}] payload`);
      console.log("event:", evt);
      console.log("data :", payload);

      // Quick visibility on top-level keys
      if (payload && typeof payload === "object") {
        console.log("keys:", Object.keys(payload));
      }

      // Common candidate fields (helps mapping fast)
      const d = payload || {};
      const candidates = {
        user: d?.user,
        follower: d?.follower,
        raider: d?.raider,
        from: d?.from,
        from_user: d?.from_user,
        fromUser: d?.fromUser,
        fromBroadcaster: d?.fromBroadcaster,
        from_broadcaster_user_name: d?.from_broadcaster_user_name,
        from_broadcaster_user_login: d?.from_broadcaster_user_login,
        from_broadcaster_user_id: d?.from_broadcaster_user_id,
        displayName: d?.displayName,
        userName: d?.userName,
        username: d?.username,
        login: d?.login,
        name: d?.name,
        bits: d?.bits,
        amount: d?.amount,
        viewers: d?.viewers,
        viewerCount: d?.viewerCount,
        count: d?.count
      };
      console.log("candidates:", candidates);
      console.groupEnd();
    } catch (e) {
      console.warn("Console log error:", e);
    }
  }

function logSbSubEventToConsole(evt, payload){
    try {
      const type = evt?.type || "Unknown";
      console.groupCollapsed(`🟣 [Twitch:${type}]`);
      console.log("event:", evt);
      console.log("data :", payload);
      console.groupEnd();
    } catch (e) {
      console.warn("Console log error:", e);
    }
  }

  /* global io */

// ================================
// 💜 TIPEEE — add-on for Events tab
// ================================
let tipeeeSocket = null;

function currencySymbolFromCode(code) {
  const c = String(code || "").trim().toUpperCase();
  const map = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", CHF: "CHF", CAD: "$", AUD: "$" };
  return map[c] || (c ? c : "");
}

function extractQuickTipeee(payload) {
  // Tipeee peut encapsuler sous payload.event
  const ev = payload?.event ?? payload;
  const p  = ev?.parameters ?? ev?.data ?? {};

  const currencyCode   = (p.currency ?? ev?.currency ?? ev?.project?.currency?.code ?? "");
  const currencySymbol = (ev?.project?.currency?.symbol ?? currencySymbolFromCode(currencyCode));

  return {
    username: p.username ?? ev?.username ?? p.user?.username ?? null,
    amount: p.amount ?? ev?.amount ?? p.total ?? p.value ?? null,
    currencyCode,
    currencySymbol,
    message: p.message ?? ev?.message ?? p.comment ?? null
  };
}

function setTipeeeStatusUI(connected, text){
  const dot = document.querySelector("#tipeee-dot");
  if (dot) {
    dot.classList.remove("on","off");
    dot.classList.add(connected ? "on" : "off");
  }
  const t = document.querySelector("#tipeee-status-text");
  if (t) t.textContent = text || (connected ? "Connecté" : "Déconnecté");
}

function disconnectTipeee(){
  try { tipeeeSocket?.close?.(); } catch {}
  try { tipeeeSocket?.disconnect?.(); } catch {}
  tipeeeSocket = null;

  setTipeeeStatusUI(false, "Déconnecté");

  const btnC = document.querySelector("#btn-tipeee-connect");
  const btnD = document.querySelector("#btn-tipeee-disconnect");
  if (btnC) btnC.disabled = false;
  if (btnD) btnD.disabled = true;

  appendLog?.("#events-log", "TIPEEE: déconnecté.");
}

function connectTipeee(){
  const inpKey  = document.querySelector("#tipeee-api-key");
  const inpSlug = document.querySelector("#tipeee-project-slug");
  const cbAuto  = document.querySelector("#tipeee-autoconnect");

  const apiKey = (inpKey?.value || "").trim();
  const slug   = (inpSlug?.value || "").trim();

  if (!apiKey || !slug){
    appendLog?.("#events-log", "TIPEEE: apiKey ou slug manquant.");
    setTipeeeStatusUI(false, "Paramètres manquants");
    return;
  }

  // persist immédiat
  try { setStoredTipeeeApiKey(apiKey); } catch {}
  try { setStoredTipeeeSlug(slug); } catch {}
  try { setStoredTipeeeAuto(!!cbAuto?.checked); } catch {}

  if (typeof io !== "function"){
    appendLog?.("#events-log", "TIPEEE: socket.io-client non chargé (io introuvable).");
    setTipeeeStatusUI(false, "socket.io manquant");
    return;
  }

  // reset si déjà connecté
  if (tipeeeSocket) disconnectTipeee();

  setTipeeeStatusUI(false, "Connexion…");
  appendLog?.("#events-log", "TIPEEE: connexion…");

  tipeeeSocket = io("https://sso.tipeee.com", {
    path: "/socket.io/",
    transports: ["websocket","polling"],
    query: { access_token: apiKey }
  });

  tipeeeSocket.on("connect", () => {
    setTipeeeStatusUI(true, "Connecté");
    appendLog?.("#events-log", "TIPEEE: connecté ✅");

    const btnC = document.querySelector("#btn-tipeee-connect");
    const btnD = document.querySelector("#btn-tipeee-disconnect");
    if (btnC) btnC.disabled = true;
    if (btnD) btnD.disabled = false;

    // abonnement "statistic-user"
    setTimeout(() => {
      try {
        tipeeeSocket.emit("statistic-user", {
          user: { username: slug },
          usage: "DASHBOARD"
        });
      } catch (e) {
        console.warn("[TIPEEE] statistic-user emit error:", e);
      }
    }, 800);
  });

  tipeeeSocket.on("disconnect", () => {
    setTipeeeStatusUI(false, "Déconnecté");
    appendLog?.("#events-log", "TIPEEE: déconnecté.");

    const btnC = document.querySelector("#btn-tipeee-connect");
    const btnD = document.querySelector("#btn-tipeee-disconnect");
    if (btnC) btnC.disabled = false;
    if (btnD) btnD.disabled = true;
  });

  tipeeeSocket.on("connect_error", (e) => {
    setTipeeeStatusUI(false, "Erreur");
    appendLog?.("#events-log", "TIPEEE: erreur de connexion (voir console).");
    console.warn("[TIPEEE] connect_error:", e);
  });

  tipeeeSocket.on("new-event", (payload) => {
    const q = extractQuickTipeee(payload);

    const user = q.username || "Anonyme";
    const amountTxt = (q.amount != null && q.amount !== "") ? `${q.currencySymbol || ""}${q.amount}` : "";
    const msg = (q.message || "").trim();

    // Ajout dans la même liste Events
    const evObj = {
      id: (typeof makeNonce === "function") ? makeNonce() : String(Date.now()),
      ts: Date.now(),
      source: "tipeee",
      type: "Tipeee",
      user,
      amount: q.amount ?? null,
      currencySymbol: q.currencySymbol || "",
      currencyCode: q.currencyCode || "",
      message: msg || null,
      ack: false
    };

    try {
      eventsStore.push(evObj);
      saveEvents(eventsStore);
      renderStoredEventsIntoUI();
    } catch (err) {
      console.warn("[TIPEEE] push event error:", err);
    }

    appendLog?.("#events-log", `TIPEEE: ${user}${amountTxt ? " — " + amountTxt : ""}${msg ? " — " + msg : ""}`);
  });
}

function initTipeeeUI(){
  const inpKey  = document.querySelector("#tipeee-api-key");
  const inpSlug = document.querySelector("#tipeee-project-slug");
  const cbAuto  = document.querySelector("#tipeee-autoconnect");
  const btnC    = document.querySelector("#btn-tipeee-connect");
  const btnD    = document.querySelector("#btn-tipeee-disconnect");

  if (!inpKey || !inpSlug || !btnC || !btnD) return; // UI pas présent

  // hydrate depuis localStorage
  try { inpKey.value  = getStoredTipeeeApiKey?.() || ""; } catch {}
  try { inpSlug.value = getStoredTipeeeSlug?.() || ""; } catch {}
  try { cbAuto.checked = !!getStoredTipeeeAuto?.(); } catch {}

  btnC.addEventListener("click", connectTipeee);
  btnD.addEventListener("click", disconnectTipeee);

  inpKey.addEventListener("change", ()=>{ try { setStoredTipeeeApiKey(inpKey.value.trim()); } catch {} });
  inpSlug.addEventListener("change", ()=>{ try { setStoredTipeeeSlug(inpSlug.value.trim()); } catch {} });
  cbAuto.addEventListener("change", ()=>{ try { setStoredTipeeeAuto(!!cbAuto.checked); } catch {} });

  btnD.disabled = true;
  setTipeeeStatusUI(false, "Déconnecté");

  // auto-connect
  const canAuto = cbAuto.checked && inpKey.value.trim() && inpSlug.value.trim();
  if (canAuto) connectTipeee();
}

// init au chargement (une fois le DOM prêt)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTipeeeUI);
} else {
  initTipeeeUI();
}

