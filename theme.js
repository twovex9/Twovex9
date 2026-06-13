/* theme.js — Future Flow thema-switcher (systeem / donker / licht).
 *
 * De FOUC-preventie (data-theme zetten vóór eerste paint) gebeurt door een
 * kleine inline <script> in de <head> van elke pagina. Dit bestand bevat de
 * tri-state thema-logica en bouwt de switcher-rij die `auth-guard.js` in het
 * gebruikersmenu (tussen "Mijn profiel" en "Uitloggen") plaatst. Het injecteert
 * zelf NIETS meer in de topbar. Volledig additief; één `git revert` van de
 * commit verwijdert het hele systeem.
 *
 * Modi (opgeslagen in localStorage onder "ff-theme"):
 *   - "system" → volgt de OS-voorkeur (prefers-color-scheme), live bijgewerkt.
 *   - "dark"   → altijd donker.
 *   - "light"  → altijd licht (tevens de fallback wanneer niets is opgeslagen).
 */
(function () {
  "use strict";

  var KEY = "ff-theme";
  var MODES = ["system", "dark", "light"];
  var root = document.documentElement;

  function safeGet() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function safeSet(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode e.d. */ }
  }

  function prefersDark() {
    try {
      return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch (e) { return false; }
  }

  // Huidige modus (system/dark/light). Onbekend/leeg → "light" (bestaande default).
  function getMode() {
    var v = safeGet();
    return MODES.indexOf(v) !== -1 ? v : "light";
  }

  // Welk thema een modus oplevert: "dark" of "light".
  function resolve(mode) {
    if (mode === "dark") return "dark";
    if (mode === "system") return prefersDark() ? "dark" : "light";
    return "light";
  }

  function applyResolved() {
    root.setAttribute("data-theme", resolve(getMode()) === "dark" ? "dark" : "light");
  }

  // Fallback als de inline-snippet ontbreekt: pas alsnog toe bij laden.
  applyResolved();

  // In systeem-modus live meebewegen met de OS-voorkeur.
  (function watchSystem() {
    if (!window.matchMedia) return;
    var mq;
    try { mq = window.matchMedia("(prefers-color-scheme: dark)"); } catch (e) { return; }
    var onChange = function () { if (getMode() === "system") applyResolved(); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  })();

  function setMode(mode) {
    if (MODES.indexOf(mode) === -1) mode = "light";
    safeSet(mode);
    applyResolved();
    refreshSwitchers();
  }

  // ── Switcher-UI (3 icoon-knoppen) ──────────────────────────────────────────

  var SVG_SYSTEM =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>';
  var SVG_MOON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var SVG_SUN =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07l1.41-1.41"/><path d="M17.66 6.34l1.41-1.41"/></svg>';

  // Volgorde zoals gevraagd: systeem, donker, licht.
  var OPTIONS = [
    { mode: "system", label: "Systeemkleur", svg: SVG_SYSTEM },
    { mode: "dark", label: "Donker thema", svg: SVG_MOON },
    { mode: "light", label: "Licht thema", svg: SVG_SUN },
  ];

  function styleSeg(btn, active) {
    btn.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "width:34px",
      "height:30px",
      "border:0",
      "border-radius:var(--r-sm,8px)",
      "cursor:pointer",
      "transition:background 0.15s ease,color 0.15s ease",
      "background:" + (active ? "var(--blue)" : "transparent"),
      "color:" + (active ? "#fff" : "var(--text-muted)"),
    ].join(";");
  }

  function refreshSwitchers() {
    var mode = getMode();
    var groups = document.querySelectorAll(".ff-theme-switch");
    for (var i = 0; i < groups.length; i++) {
      var btns = groups[i].querySelectorAll("button[data-mode]");
      for (var j = 0; j < btns.length; j++) {
        var b = btns[j];
        var active = b.getAttribute("data-mode") === mode;
        styleSeg(b, active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      }
    }
  }

  // Bouwt de switcher-rij (label + 3 icoon-knoppen). Geeft een DOM-element terug.
  function buildSwitcher() {
    var row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)";

    var label = document.createElement("span");
    label.textContent = "Thema";
    label.style.cssText = "font-size:13px;color:var(--text)";
    row.appendChild(label);

    var group = document.createElement("div");
    group.className = "ff-theme-switch";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "Thema kiezen");
    group.style.cssText = "display:inline-flex;gap:2px;padding:2px;border:1px solid var(--line);border-radius:var(--r-md,10px);background:var(--surface-alt,#f7f8fa)";

    var mode = getMode();
    OPTIONS.forEach(function (opt) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-mode", opt.mode);
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-label", opt.label);
      b.setAttribute("title", opt.label);
      b.innerHTML = opt.svg;
      styleSeg(b, opt.mode === mode);
      b.setAttribute("aria-pressed", opt.mode === mode ? "true" : "false");
      b.addEventListener("mouseover", function () {
        if (getMode() !== opt.mode) b.style.background = "var(--surface,#fff)";
      });
      b.addEventListener("mouseout", function () {
        if (getMode() !== opt.mode) b.style.background = "transparent";
      });
      b.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setMode(opt.mode);
      });
      group.appendChild(b);
    });

    row.appendChild(group);
    return row;
  }

  window.ffTheme = {
    getMode: getMode,
    setMode: setMode,
    resolved: function () { return resolve(getMode()); },
    buildSwitcher: buildSwitcher,
  };
})();
