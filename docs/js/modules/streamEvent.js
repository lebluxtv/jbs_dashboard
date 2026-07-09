/******************************************************************
   *                     📦 EVENTS (Twitch subs)
   ******************************************************************/
  function loadEvents(){
    // Loads persisted events list, but:
    // - removes Follow from the clickable list (Subs area)
    // - keeps a pending log so Follow still appears in the Journal
    try {
      const raw = JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]") || [];
      const list = Array.isArray(raw) ? raw : [];

      // Extract follows (log-only)
      const follows = list.filter(e => e && e.type === "Follow");
      const filtered = list.filter(e => !(e && e.type === "Follow"));

      // Persist the cleaned list (so old follows disappear from UI forever)
      try { localStorage.setItem(EVENTS_KEY, JSON.stringify((filtered || []).slice(-MAX_EVENTS))); } catch {}

      // Stash follow logs to print once UI/log is available
      if (follows.length) {
        window.__jbsPendingFollowLogs = (window.__jbsPendingFollowLogs || []);
        for (const f of follows) {
          const u = (f && f.user) ? f.user : "—";
          window.__jbsPendingFollowLogs.push(`FOLLOW: ${u}`);
        }
      }

      return filtered;
    } catch {
      return [];
    }
  }
  function saveEvents(list){ try { localStorage.setItem(EVENTS_KEY, JSON.stringify((list || []).slice(-MAX_EVENTS))); } catch {} }

  let eventsStore = loadEvents();
  let qvUnreadEvents = eventsStore.filter(e => !e.ack).length;

  
  function escapeHtml(s){
    return String(s ?? "")
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#39;");
  }

// Find the "Actif/Inactif" label that sits next to the dot in the Events header
function findEventsStatusLabel(dotEl){
  if (!dotEl) return null;

  // explicit ids (if present in HTML)
  const direct =
    document.querySelector("#events-status-text") ||
    document.querySelector("#events-state-text") ||
    document.querySelector("#events-active-text");
  if (direct) return direct;

  // heuristic: search siblings / parents for a short label containing Actif/Inactif
  let p = dotEl;
  for (let depth = 0; depth < 4 && p; depth++, p = p.parentElement){
    const nodes = p.querySelectorAll("span,div,small,strong");
    for (const n of nodes){
      const t = (n.textContent || "").trim();
      if (!t) continue;
      if (/^(Actif|Inactif)$/i.test(t)) return n;
      if (t.length <= 12 && /Actif|Inactif/i.test(t)) return n;
    }
  }
  // fallback: next element sibling
  const sib = dotEl.nextElementSibling;
  if (sib && (sib.tagName === "SPAN" || sib.tagName === "DIV" || sib.tagName === "SMALL")) return sib;
  return null;
}


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

    if (e.type === "ModWhisper") {
      const u = escapeHtml(e.user ?? e.username ?? "—");
      const msg = escapeHtml(e.message ?? e.text ?? "");
      return `<strong>Message Modérateur :</strong> <span class="modwhisper-user">${u}</span> : <span class="modwhisper-msg">${msg}</span>`;
    }


    if (e.type === "Cheer") {
      const bits = isNum(e.bits) ? e.bits : 0;
      const msg = (e.message ?? e.text ?? e.msg ?? "").toString().trim();
      const msgLine = msg ? `<br><span class="muted">${escapeHtml(msg)}</span>` : "";
      return `<strong>${e.user}</strong> — Cheer <span class="muted">${bits} bits</span>${msgLine}`;
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

    // ✅ Better formatting for Twitch sub events (Tier 1/2/3 vs Prime)
    if (e.type === "Sub" || e.type === "ReSub" || e.type === "CommunitySub" || e.type === "CommunitySubGift" || e.type === "MassSubGift" || e.type === "MassGift") {
      const m = Number(e.months ?? e.duration_months ?? e.cumulativeMonths ?? 0);
      const months = Number.isFinite(m) ? Math.trunc(m) : 0;

      const norm = normalizeSubTier(e);
      const tierLabel = norm.tierLabel;


      const tierTxt = tierLabel ? ` • ${tierLabel}` : "";
      const monthsTxt = months > 0 ? ` • ${months} mois` : "";
      const label = (e.type === "ReSub") ? "ReSub" : (e.type === "Sub" ? "Sub" : e.type);
      const msgRaw = (e.message ?? e.text ?? e.systemMessage ?? e.system_message ?? e.msg ?? "").toString().trim();
const msgLine = msgRaw ? `<br><span class="muted">${escapeHtml(msgRaw)}</span>` : "";
return `<strong>${e.user}</strong> — ${label}<span class="muted">${tierTxt}${monthsTxt}</span>${msgLine}`;
    }

    return `<strong>${e.user}</strong> — ${e.type} • ${e.tier?("Tier "+e.tier):""} • ${e.tierLabel}${e.months>0?` • ${e.months} mois`:""}`;
  }

  function syncEventsStatusUI(){
    setDot(".dot-events", qvUnreadEvents > 0);

    // Sync Actif/Inactif label with the dot state
    try {
      const dot = document.querySelector(".dot-events");
      const label = findEventsStatusLabel(dot);
      if (label) label.textContent = (qvUnreadEvents > 0) ? "Actif" : "Inactif";
    } catch {}

    const bQV = $("#qv-events-count");
    if (bQV) { bQV.textContent = String(qvUnreadEvents); bQV.style.display = qvUnreadEvents > 0 ? "" : "none"; }
    const bTab  = $(".badge-events");
    const bHead = $("#events-counter");
    if (bTab)  setText(bTab, String(qvUnreadEvents));
    if (bHead) setText(bHead, String(qvUnreadEvents));
  }

  
function bestTextColorForBg(hex){
  try {
    const h = String(hex||"").trim();
    const m = /^#([0-9a-f]{6})$/i.exec(h);
    if (!m) return "#fff";
    const n = parseInt(m[1],16);
    const r = (n>>16)&255, g=(n>>8)&255, b=n&255;
    const srgb = [r,g,b].map(v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    const L = 0.2126*srgb[0]+0.7152*srgb[1]+0.0722*srgb[2];
    const contrast = (L1,L2)=> (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    const cWhite = contrast(1, L);
    const cBlack = contrast(L, 0);
    return (cBlack >= cWhite) ? "#000" : "#fff";
  } catch { return "#fff"; }
}

function clamp01(x){ x = Number(x); return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0; }
function hexToRgb(hex){
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex||"").trim());
  if (!m) return null;
  const n = parseInt(m[1],16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function rgbToHex(r,g,b){
  const to2 = v => (Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,"0"));
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
// Mix an accent with black to create a dark tinted background (blackRatio=0..1)
// NOTE: declare with 'var' to be safely hoisted even if this file is loaded in unusual orders.
var mixWithBlack = function(hex, blackRatio){
  const c = hexToRgb(hex);
  if (!c) return "#000";
  const t = 1 - clamp01(blackRatio);
  return rgbToHex(c.r*t, c.g*t, c.b*t);
};
// Expose for debugging (harmless if not in a browser)
try { if (typeof window !== "undefined") window.mixWithBlack = mixWithBlack; } catch {}
function relLuminanceHex(hex){
  const c = hexToRgb(hex);
  if (!c) return 0;
  const srgb = [c.r,c.g,c.b].map(v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
  return 0.2126*srgb[0]+0.7152*srgb[1]+0.0722*srgb[2];
}
function contrastRatioHex(a,b){
  const L1 = relLuminanceHex(a), L2 = relLuminanceHex(b);
  return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
}

function accentColorForEvent(e){
  if (!e || !e.type) return null;
  const t = String(e.type);
  if (t === "ModWhisper") return "#B1FF4D";
  if (t === "Tipeee") return "#FFA1AD";
  if (t === "Cheer")  return "#FE9A37";
  if (t === "Raid")   return "#FB2C36";

  // Subs: Prime / Tier 1/2/3
  if (t === "Sub" || t === "ReSub" || t === "GiftSub" || t === "GiftBomb" ||
      t === "CommunitySub" || t === "CommunitySubGift" || t === "MassSubGift" || t === "MassGift") {
    const tier = normalizeSubTier(e).tierLabel;
    if (tier === "Prime") return "#05DF72";
    if (tier === "Tier 1") return "#74D4FF";
    if (tier === "Tier 2") return "#51A2FF";
    if (tier === "Tier 3") return "#2B7FFF";
    // fallback: if is_prime true but tierLabel missing
    {
      const primeRaw = (e.is_prime ?? e.isPrime);
      const isPrime = (primeRaw === true || primeRaw === 1 || primeRaw === "true" || primeRaw === "1");
      if (isPrime) return "#05DF72";
    }
  }
  return null;
}

function classForEvent(e){
  try{
    const t = String(e?.type || "");
    if (t === "ModWhisper") return "modwhisper";
  } catch {}
  return null;
}


function makeItem(htmlText, onToggle, ack=false, id=null, accent=null, extraClass=null){
    const li = document.createElement("li");
    li.className = "event";
    if (extraClass) li.classList.add(extraClass);
    const a = document.createElement("a");
    a.href = "#";
    a.innerHTML = htmlText;
    a.addEventListener("click", (ev)=>{ ev.preventDefault(); ev.stopPropagation(); try { onToggle?.(); } catch {} });
    li.appendChild(a);

// Accent coloring: colored until clicked; once acked, keep only a 1px colored border
if (accent){
  // New DA:
  // - keep accent as TEXT color
  // - use a very dark tinted background (accent mixed with black)
  // - when acked (clicked): revert to black background + grey text (no border highlight)
  const bgTint = mixWithBlack(accent, 0.86);

  const muted = ()=> a.querySelectorAll(".muted");

  if (!ack){
    li.style.backgroundColor = bgTint;
    li.style.border = "1px solid transparent";
    li.style.color = accent;
    a.style.color = "inherit";
    muted().forEach(el => { el.style.color = "inherit"; el.style.opacity = "0.92"; });

    // If contrast ends up too low (rare), fall back to readable text and keep the accent as a left marker.
    if (contrastRatioHex(accent, bgTint) < 4.5){
      const tc = bestTextColorForBg(bgTint);
      li.style.color = tc;
      muted().forEach(el => { el.style.color = "inherit"; el.style.opacity = "0.92"; });
      li.style.borderLeft = `4px solid ${accent}`;
    }
  } else {
    li.style.backgroundColor = "#000";
    li.style.border = "1px solid transparent";
    li.style.borderLeft = "";
    li.style.color = "#777";
    a.style.color = "inherit";
    muted().forEach(el => { el.style.color = "inherit"; el.style.opacity = "0.85"; });
  }
}
    if (ack) li.classList.add("acked");
    if (id != null) li.dataset.id = String(id);
    return li;
  }

  function appendListItem(listEl, htmlText, onToggle, ack=false, id=null, accent=null, extraClass=null){
    if (!listEl) return;
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains("muted"))
      listEl.removeChild(listEl.firstElementChild);
    const li = makeItem(htmlText, onToggle, ack, id, accent, extraClass);
    listEl.appendChild(li);
    const limit = listEl.classList.contains("list--short") ? 6 : 60;
    while (listEl.children.length > limit) listEl.removeChild(listEl.firstChild);
  }

  function prependListItem(listEl, htmlText, onToggle, ack=false, id=null, accent=null, extraClass=null){
    if (!listEl) return;
    if (listEl.firstElementChild && listEl.firstElementChild.classList.contains("muted"))
      listEl.removeChild(listEl.firstElementChild);
    const li = makeItem(htmlText, onToggle, ack, id, accent, extraClass);
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
      // Follow is log-only (never appears in the clickable list)
      if (e && e.type === "Follow") continue;
      const html = eventLine(e);
      const toggle = ()=>{ e.ack = !e.ack; saveEvents(eventsStore); renderStoredEventsIntoUI(); };
      if (qv)   prependListItem(qv, html, toggle, e.ack, e.id, accentColorForEvent(e), classForEvent(e));
      if (full) prependListItem(full, html, toggle, e.ack, e.id, accentColorForEvent(e), classForEvent(e));
    }
    qvUnreadEvents = eventsStore.filter(e => !e.ack).length;
    syncEventsStatusUI();
  }
  renderStoredEventsIntoUI();

  // Flush any Follow events removed from the list (log-only)
  (function flushPendingFollowLogs(){
    try {
      const arr = window.__jbsPendingFollowLogs;
      if (!Array.isArray(arr) || !arr.length) return;
      for (const line of arr) appendLog?.("#events-log", line);
      window.__jbsPendingFollowLogs = [];
    } catch {}
  })();

  

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

  // Normalize Twitch subscription tier reliably.
  // Some pipelines may incorrectly set tierLabel="Prime" while is_prime is false and sub_tier is missing.
  // We recover Tier 1/2/3 from sub_tier/subTier when present, otherwise from systemMessage/text.
  function normalizeSubTier(e){
    const tierRaw = (e?.sub_tier ?? e?.subTier ?? e?.tier ?? e?.tierLabel ?? "");
    const tierStr = String(tierRaw ?? "");
    const primeRaw = (e?.is_prime ?? e?.isPrime);

    const primeStrict = (primeRaw === true || primeRaw === 1 || primeRaw === "true" || primeRaw === "1");
    if (primeStrict) return { tierLabel: "Prime", isPrime: true };

    // Try explicit tier fields
    const low = tierStr.toLowerCase();
    if (low.includes("1000") || low.includes("tier 1") || low.includes("tier1")) return { tierLabel: "Tier 1", isPrime: false };
    if (low.includes("2000") || low.includes("tier 2") || low.includes("tier2")) return { tierLabel: "Tier 2", isPrime: false };
    if (low.includes("3000") || low.includes("tier 3") || low.includes("tier3")) return { tierLabel: "Tier 3", isPrime: false };

    // Recover from message if available (e.g., "subscribed at tier 3.")
    const msg = String(e?.systemMessage ?? e?.system_message ?? e?.message ?? e?.text ?? e?.msg ?? "").toLowerCase();
    const m = /tier\s*([123])/.exec(msg);
    if (m){
      return { tierLabel: `Tier ${m[1]}`, isPrime: false };
    }

    // Only treat as Prime if the tier string itself says prime AND we couldn't find a numeric tier
    if (low.includes("prime")) return { tierLabel: "Prime", isPrime: true };

    return { tierLabel: tierStr || "", isPrime: false };
  }

  function extractMonths(d){
    const m = Number(d?.cumulativeMonths ?? d?.months ?? d?.streak ?? 0);
    return Number.isFinite(m) ? m : 0;
  }

  function extractBits(d){
    const direct = Number(d?.bits ?? d?.amount ?? d?.count ?? d?.bitsUsed ?? d?.bitsAmount ?? d?.cheerAmount ?? d?.message?.bits);
    if (Number.isFinite(direct)) return Math.trunc(direct);

    // Twitch chat cheer payloads can expose bits through message fragments instead of a top-level field.
    const fragments = Array.isArray(d?.fragments) ? d.fragments
      : Array.isArray(d?.message?.fragments) ? d.message.fragments
      : Array.isArray(d?.message?.parts) ? d.message.parts
      : Array.isArray(d?.parts) ? d.parts
      : [];
    for (const f of fragments){
      const b = Number(f?.bits ?? f?.cheermote?.bits ?? f?.cheer?.bits ?? f?.cheerAmount);
      if (Number.isFinite(b)) return Math.trunc(b);
    }
    return 0;
  }

  function textFromMessageLike(v){
    try{
      if (v == null) return "";
      if (typeof v === "string" || typeof v === "number") return String(v).trim();
      if (Array.isArray(v)) return v.map(textFromMessageLike).join("").trim();
      if (typeof v !== "object") return "";

      const direct = (v.text ?? v.message ?? v.content ?? v.body ?? v.rawInput ?? v.input ?? v.value ?? "").toString().trim();
      if (direct && direct !== "[object Object]") return direct;

      const fragments = Array.isArray(v.fragments) ? v.fragments
        : Array.isArray(v.parts) ? v.parts
        : Array.isArray(v.emotes) ? v.emotes
        : [];
      if (fragments.length){
        const joined = fragments.map(part => textFromMessageLike(part?.text ?? part?.message ?? part)).join("").trim();
        if (joined) return joined;
      }
    } catch {}
    return "";
  }

  function extractCheerMessage(d){
    try{
      const candidates = [
        d?.message,
        d?.text,
        d?.msg,
        d?.rawInput,
        d?.input,
        d?.comment,
        d?.chatMessage,
        d?.messageText,
        d?.message_text,
        d?.body,
        d?.content,
        d?.event?.message,
        d?.data?.message,
        d?.payload?.message
      ];
      for (const c of candidates){
        const txt = textFromMessageLike(c).trim();
        if (txt) return txt;
      }

      // EventSub-style payloads may keep the text in root fragments/parts.
      const fromParts = textFromMessageLike(d?.fragments ?? d?.parts).trim();
      if (fromParts) return fromParts;
    } catch {}
    return "";
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
        count: d?.count,
        message: d?.message,
        text: d?.text,
        rawInput: d?.rawInput,
        fragments: d?.fragments ?? d?.message?.fragments,
        parts: d?.parts ?? d?.message?.parts
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
// ---- TIPEEE SNIFFER (debug) ----
try {
  tipeeeSocket.onAny?.((event, ...args) => {
    console.log("[TIPEEE onAny]", event, args);
  });

  tipeeeSocket.io?.on?.("packet", (p) => {
    console.log("[TIPEEE RAW packet]", p);
  });

  tipeeeSocket.on?.("connect_error", (e) => console.log("[TIPEEE connect_error]", e));
  tipeeeSocket.on?.("error", (e) => console.log("[TIPEEE error]", e));
  tipeeeSocket.on?.("disconnect", (r) => console.log("[TIPEEE disconnect]", r));
} catch (e) {
  console.warn("[TIPEEE sniffer] failed:", e);
}
// -------------------------------

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



// ============================================================================
// UI tweaks requested:
// 1) Move Tipeee connection card BELOW the events reception area (Subs list)
// 2) Add a "Purger les events" button below the Journal with confirmation
// ----------------------------------------------------------------------------
// This is implemented defensively (DOM moves), so minimal/no HTML edits needed.
// ============================================================================

function __findClosestCard(el){
  while (el && el !== document.body) {
    if (el.classList && el.classList.contains("card")) return el;
    el = el.parentElement;
  }
  return null;
}

function __findCardByHeaderText(text){
  const headers = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,legend,.card-title,.title"));
  const match = headers.find(h => (h.textContent || "").trim().toLowerCase() === text.toLowerCase());
  return match ? __findClosestCard(match) : null;
}

function __moveTipeeeCardBetweenActivityAndJournal(){
  const tipeeeDot = document.querySelector("#tipeee-dot");
  if (!tipeeeDot) return;

  const tipeeeCard = __findClosestCard(tipeeeDot);
  if (!tipeeeCard) return;

  // We want: Activity card -> Tipeee card -> Journal card
  // Activity card is the one titled "Activité"
  const activityCard = __findCardByHeaderText("Activité");
  const journalCard  = __findCardByHeaderText("Journal");

  // If we can't find both cards, do nothing (avoid moving in unexpected layouts)
  if (!activityCard || !journalCard) return;

  // If already placed between them, do nothing
  if (activityCard.nextElementSibling === tipeeeCard && tipeeeCard.nextElementSibling === journalCard) return;

  // Ensure we insert the Tipeee card right before the Journal card (i.e., after Activity)
  journalCard.parentNode.insertBefore(tipeeeCard, journalCard);
}

function __ensurePurgeButton(){
  // Find the Journal card (log box)
  let journalCard = __findCardByHeaderText("Journal");
  if (!journalCard) {
    // fallback: the log container in your UI is usually .log or .logbox
    const logEl = document.querySelector(".log, .logbox, #events-log, #log, #journal, #journal-log");
    journalCard = logEl ? __findClosestCard(logEl) : null;
  }
  if (!journalCard) return;

  if (document.querySelector("#btn-events-purge")) return;

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.justifyContent = "flex-end";
  wrap.style.marginTop = "10px";

  const btn = document.createElement("button");
  btn.id = "btn-events-purge";
  btn.type = "button";
  btn.className = "btn";
  btn.textContent = "Purger les events";
  btn.title = "Supprime les events stockés et efface la liste affichée";

  btn.addEventListener("click", () => {
    const ok = window.confirm("Purger tous les events affichés ?\\n\\nCette action est irréversible.");
    if (!ok) return;

    try {
      // Clear the persisted store used by the dashboard
      if (typeof EVENTS_KEY !== "undefined" && EVENTS_KEY) {
        localStorage.removeItem(EVENTS_KEY);
      } else {
        // fallback (known key in your core.js)
        localStorage.removeItem("jbs.events.v1");
      }
    } catch (e) {
      console.warn("[Events purge] localStorage remove failed:", e);
    }

    // Best effort: if your main events module exposes a refresh, call it
    try {
      if (typeof renderStoredEventsIntoUI === "function") renderStoredEventsIntoUI();
    } catch {}
    try {
      if (typeof refreshSubsFromStored === "function") refreshSubsFromStored();
    } catch {}

    // Hard fallback: reload to ensure UI resets cleanly
    setTimeout(() => location.reload(), 50);
  });

  wrap.appendChild(btn);
  journalCard.appendChild(wrap);
}

function __applyEventsUiTweaks(){
  __moveTipeeeCardBetweenActivityAndJournal();
  __ensurePurgeButton();
}

// Run after DOM is ready, and re-run once after a short delay to handle late UI rendering.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    __applyEventsUiTweaks();
    setTimeout(__applyEventsUiTweaks, 300);
  });
} else {
  __applyEventsUiTweaks();
  setTimeout(__applyEventsUiTweaks, 300);
}
