/* global window */
/**
 * permissions-gate.js — pagina-gate per rol/permissie.
 *
 * Werkt op basis van `window.FF_PAGE_PERMISSIONS` (uit permissions-page-map.js)
 * en `window.ffCan` / `window.ffPermissions` (uit permissions.js).
 *
 * Flow:
 *   1. Skip op login.html en als geen pathname (root).
 *   2. Wacht op `ffPermissionsReady` zodat rol/permissies geladen zijn.
 *   3. Lookup de pagina in de map. Geen entry of `null` → toegang OK.
 *   4. Admin-tier wint altijd.
 *   5. `{allowedRoles}` → controleer rol-namen.
 *      `{action, entity}` → `ffCan(action, entity)`.
 *   6. Geen toegang → `sessionStorage`-flash + `location.replace('home.html')`.
 *
 * Laad NA permissions.js en permissions-page-map.js, vóór page-script.
 */
(function (global) {
  "use strict";

  function currentPageName() {
    try {
      var path = (global.location && global.location.pathname) || "";
      if (!path) return "";
      var parts = path.split("/").filter(Boolean);
      if (parts.length === 0) return "home.html";
      var last = parts[parts.length - 1].toLowerCase();
      // Strip query/hash (location.pathname doet dat al, maar voor zekerheid):
      var qIdx = last.indexOf("?");
      if (qIdx !== -1) last = last.substring(0, qIdx);
      var hIdx = last.indexOf("#");
      if (hIdx !== -1) last = last.substring(0, hIdx);
      // Vercel clean URLs (/audit i.p.v. /audit.html) — voeg .html toe
      // zodat de lookup in FF_PAGE_PERMISSIONS werkt.
      if (last && last.indexOf(".") === -1) last += ".html";
      return last;
    } catch (e) {
      return "";
    }
  }

  function setFlash(msg) {
    try {
      global.sessionStorage && global.sessionStorage.setItem("ff-flash", msg);
    } catch (e) { /* ok */ }
  }

  // Toon een eventueel gezette flash-melding (bv. na een geen-toegang-redirect)
  // als nette, thema-bewuste banner. Eenmalig: de melding wordt na tonen gewist.
  function renderFlash(msg) {
    var doc = global.document;
    if (!doc || !doc.body) return;
    try {
      var bar = doc.createElement("div");
      bar.setAttribute("role", "alert");
      bar.style.cssText = [
        "position:fixed", "top:16px", "left:50%", "transform:translateX(-50%)",
        "z-index:5000", "max-width:min(520px,94vw)", "display:flex",
        "align-items:flex-start", "gap:10px", "padding:13px 16px", "border-radius:14px",
        "background:var(--surface,#fff)", "color:var(--text,#111)",
        "border:1px solid var(--red,#dc2626)", "box-shadow:0 12px 40px rgba(0,0,0,.22)",
        "font-size:14px", "line-height:1.4", "font-family:inherit"
      ].join(";");
      var icon = doc.createElement("span");
      icon.textContent = "🔒"; // 🔒
      icon.style.cssText = "flex:none;font-size:16px";
      var txt = doc.createElement("div");
      txt.style.cssText = "flex:1";
      txt.textContent = msg;
      var close = doc.createElement("button");
      close.type = "button";
      close.setAttribute("aria-label", "Sluiten");
      close.textContent = "×";
      close.style.cssText = "flex:none;border:0;background:transparent;color:var(--text-muted,#737373);font-size:18px;line-height:1;cursor:pointer;padding:0 2px";
      close.addEventListener("click", function () { try { bar.remove(); } catch (e) { /* ok */ } });
      bar.appendChild(icon); bar.appendChild(txt); bar.appendChild(close);
      doc.body.appendChild(bar);
      global.setTimeout(function () { try { bar.remove(); } catch (e) { /* ok */ } }, 7000);
    } catch (e) { /* ok */ }
  }

  function showAccessFlash() {
    var msg = null;
    try { msg = global.sessionStorage && global.sessionStorage.getItem("ff-flash"); } catch (e) { msg = null; }
    if (!msg) return;
    try { global.sessionStorage.removeItem("ff-flash"); } catch (e) { /* ok */ }
    var doc = global.document;
    if (doc && doc.body) renderFlash(msg);
    else if (doc) doc.addEventListener("DOMContentLoaded", function () { renderFlash(msg); });
  }

  // ── Helpers voor de flash-vrije gate ──────────────────────────────────────
  function getRoleNames() {
    try {
      return (global.ffPermissions && typeof global.ffPermissions.getRoleNames === "function")
        ? (global.ffPermissions.getRoleNames() || []) : [];
    } catch (e) { return []; }
  }

  // Onthul de paginacontent (zet de visibility:hidden uit styles.css uit).
  function revealPage() {
    try { global.document.documentElement.classList.add("ff-page-ready"); } catch (e) {}
  }

  // Zijn de permissies al geladen (cache of DB)? Zo ja → synchrone beslissing
  // mogelijk vóór de eerste paint (geen flits van geblokkeerde content).
  function permsLoaded() {
    try {
      return !!(global.ffPermissions && typeof global.ffPermissions.debug === "function"
        && global.ffPermissions.debug().loaded);
    } catch (e) { return false; }
  }

  function removeDenyPanel() {
    try {
      var p = global.document.getElementById("ff-denied-panel");
      if (p && p.parentNode) p.parentNode.removeChild(p);
    } catch (e) {}
  }

  // Toon DIRECT een nette "Geen toegang"-pagina i.p.v. de inhoud — de content
  // blijft verborgen (visibility:hidden), dus er is nooit een flits van de
  // pagina-inhoud gevolgd door een melding/redirect.
  function denyPage() {
    var doc = global.document;
    if (!doc) return;
    if (!doc.body) { doc.addEventListener("DOMContentLoaded", denyPage); return; }
    if (doc.getElementById("ff-denied-panel")) return;
    var wrap = doc.createElement("div");
    wrap.id = "ff-denied-panel";
    wrap.className = "ff-denied-panel";
    wrap.setAttribute("role", "alert");
    wrap.innerHTML =
      '<div class="ff-denied-card">' +
        '<div class="ff-denied-ico" aria-hidden="true">🔒</div>' +
        '<h1>Geen toegang</h1>' +
        '<p>Je hebt geen toegang tot deze pagina.</p>' +
        '<a href="home" class="btn-primary">Terug naar home</a>' +
      '</div>';
    doc.body.appendChild(wrap);
  }

  // Synchrone toegangsbeslissing op basis van de (reeds geladen) permissies.
  // Retourneert "ok" | "denied" | { redirect: "<url>" }.
  function decide() {
    var page = currentPageName();
    if (!page || page === "login.html") return "ok";

    // Detacheringsbureau-account = UITSLUITEND de bureau-factuurpagina.
    try {
      var rnames = getRoleNames();
      if (rnames.length === 1 && rnames[0] === "Detacheringsbureau" && page !== "zzp-bureau-facturen.html") {
        return { redirect: "zzp-bureau-facturen" };
      }
    } catch (e) { /* doorgaan */ }

    var map = global.FF_PAGE_PERMISSIONS || {};
    var req = map[page];
    if (req === null || req === undefined) return "ok";   // expliciet/standaard open

    // Rol-uitsluiting (deniedRoles) — geldt ook voor admin-tier, dus vóór de bypass.
    if (Array.isArray(req.deniedRoles)) {
      var dRoles = getRoleNames();
      for (var di = 0; di < req.deniedRoles.length; di++) {
        if (dRoles.indexOf(req.deniedRoles[di]) !== -1) return "denied";
      }
      if (!Array.isArray(req.allowedRoles) && !req.action) return "ok";
    }

    // Admin-tier wint — behalve bij strict-pagina's (bv. Financiën).
    try {
      if (!req.strict && typeof global.ffIsAdminTier === "function" && global.ffIsAdminTier()) return "ok";
    } catch (e) { /* doorgaan */ }

    // Mode A: allowedRoles
    if (Array.isArray(req.allowedRoles)) {
      var roles = getRoleNames();
      for (var i = 0; i < req.allowedRoles.length; i++) {
        if (roles.indexOf(req.allowedRoles[i]) !== -1) return "ok";
      }
      return "denied";
    }
    // Mode B: ffCan(action, entity)
    if (req.action) {
      try {
        return ((typeof global.ffCan === "function") && global.ffCan(req.action, req.entity)) ? "ok" : "denied";
      } catch (e) { return "denied"; }
    }
    return "ok";
  }

  var decided = null; // "ok" | "denied" | "redirect"
  function act(d) {
    if (d && d.redirect) {
      if (decided === "redirect") return;
      decided = "redirect";
      try { global.location.replace(d.redirect); } catch (e) { global.location.href = d.redirect; }
      return;
    }
    if (d === "denied") {
      // Blokkeer de pagina NOOIT op (tijdelijk) lege rollen. Een lege rollenset
      // betekent vrijwel altijd een koude of door cross-tab sessie-collisie
      // verstoorde permissie-cache — NIET dat de gebruiker geen toegang heeft.
      // Het ondoorzichtige full-screen deny-paneel (position:fixed; inset:0)
      // zou op pagina's met één scroll-route (bv. het management-dashboard, waar
      // body{overflow:hidden} en alleen het document scrollt) ALLES dichtzetten
      // (scroll én klik) zonder herstel zolang de DB-load traag is of leeg
      // terugkomt. Daarom: alleen echt weigeren als de rollen BEKEND én
      // ontoereikend zijn. Bij lege rollen tonen we de pagina (de data wordt
      // sowieso server-side via RLS beschermd) en laat de autoritatieve stap 2
      // (na DB-load) een eventuele echte weigering alsnog beslissen.
      if (getRoleNames().length === 0) {
        if (decided === null) revealPage();
        return;
      }
      if (decided === "denied") return;
      decided = "denied";
      denyPage();
      return;
    }
    // "ok": als de cache eerder (onterecht) blokkeerde maar de DB toegang geeft,
    // herstel dan: paneel weg en content tonen.
    if (decided === "denied") removeDenyPanel();
    decided = "ok";
    revealPage();
  }

  function run() {
    var page = currentPageName();
    if (!page || page === "login.html") { revealPage(); return; }
    showAccessFlash(); // backward-compat (oude flash-meldingen); nieuwe flow zet geen flash meer

    // 1) Warme cache: beslis SYNCHROON vóór de eerste paint.
    if (permsLoaded()) act(decide());

    // 2) Autoritatief na auth + permissie-DB-load (koude cache beslist hier).
    Promise.resolve()
      .then(function () { return global.ffSupabaseReady; })
      .then(function () { return global.ffPermissionsReady; })
      .then(function () { act(decide()); })
      .catch(function () { if (decided === null) revealPage(); });

    // 3) Fail-safe: als er na korte tijd nog niets beslist is (DB hangt), de
    //    content alsnog tonen i.p.v. eindeloos blanco te blijven.
    try { global.setTimeout(function () { if (decided === null) revealPage(); }, 3000); } catch (e) {}

    // 4) Ultiem vangnet: zelfs als de Promise-keten hierboven onverwacht throwt
    //    voordat de fail-safe geregistreerd is, onthul de content uiterlijk bij
    //    window 'load' zodat de pagina nooit permanent verborgen/geblokkeerd
    //    blijft. Idempotent — revealPage voegt alleen een class toe.
    try {
      global.addEventListener("load", function () { if (decided === null) revealPage(); });
    } catch (e) { /* ok */ }
  }

  // Start zodra het script geladen is — de Promises binnen run() wachten zelf.
  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})(typeof window !== "undefined" ? window : this);
