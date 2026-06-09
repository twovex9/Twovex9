/* global window, document */
/**
 * instellingen.js — page-script voor /instellingen.html.
 * Tabs: Mijn profiel (edit voornaam/achternaam) + Notificatietypes (admin CRUD).
 */
(function () {
  "use strict";

  var state = {
    activeTab: "profiel",
    ntSearch: "",
    ntShowArchived: false,
    ntEditingId: null,
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function trashSvg() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="m8 6 1-2h6l1 2"/></svg>';
  }

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  function setTab(name) {
    state.activeTab = name;
    var tabs = [
      { btn: "inst-tab-profiel", panel: "inst-panel-profiel", key: "profiel" },
      // Sprint 18 / S18 — Gebruikers tab (BS2 parity met /settings/users)
      { btn: "inst-tab-gebruikers", panel: "inst-panel-gebruikers", key: "gebruikers" },
      { btn: "inst-tab-mijn-notificaties", panel: "inst-panel-mijn-notificaties", key: "mijn-notificaties" },
      { btn: "inst-tab-notificaties", panel: "inst-panel-notificaties", key: "notificaties" },
      // Sprint 17 / S17 — Entiteiten tab (BS2 parity met /settings/entities)
      { btn: "inst-tab-entiteiten", panel: "inst-panel-entiteiten", key: "entiteiten" },
    ];
    tabs.forEach(function (t) {
      var btn = document.getElementById(t.btn);
      var panel = document.getElementById(t.panel);
      if (!btn || !panel) return;
      var active = (t.key === name);
      btn.classList.toggle("filter-chip--active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      panel.style.display = active ? "" : "none";
    });
    if (name === "notificaties") renderNt();
    else if (name === "mijn-notificaties") renderMijnNotificaties();
    else if (name === "entiteiten") renderEntiteiten();
    else if (name === "gebruikers") renderGebruikers();
  }

  // Beheer-tabs (Gebruikers / Notificatietypes / Entiteiten) zijn admin-only. Sinds de
  // pagina open is voor elke ingelogde gebruiker (iedereen moet z'n eigen profiel +
  // notificaties kunnen beheren — video-feedback eigenaar 2026-06-07) moeten deze tabs
  // hier verborgen worden voor wie geen edit-settings heeft. Admin-tier wint via besaCan.
  function canManageSettings() {
    try {
      if (typeof window.besaIsAdminTier === "function" && window.besaIsAdminTier()) return true;
      return (typeof window.besaCan === "function") && window.besaCan("edit", "settings");
    } catch (e) { return false; }
  }
  function applyAdminTabVisibility() {
    var allowed = canManageSettings();
    ["inst-tab-gebruikers", "inst-tab-notificaties", "inst-tab-entiteiten"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.style.display = allowed ? "" : "none";
    });
    // Stond een verborgen beheer-tab toch actief (bv. uit URL/cache) → terug naar profiel.
    if (!allowed && ["gebruikers", "notificaties", "entiteiten"].indexOf(state.activeTab) !== -1) {
      setTab("profiel");
    }
  }

  // ---------------------------------------------------------------------------
  // Sprint 18 / S18 — Tab: Gebruikers (BS2 parity met /settings/users)
  // ---------------------------------------------------------------------------

  var GEBRUIKERS_COLUMN_CONFIG = [
    { id: "naam", label: "Naam", defaultOn: true, skipToggle: true },
    { id: "email", label: "E-mailadres", defaultOn: true },
    { id: "rollen", label: "Rollen", defaultOn: true },
    { id: "status", label: "Status", defaultOn: true },
    { id: "aanmaakdatum", label: "Aanmaakdatum", defaultOn: true },
  ];
  var GEBRUIKERS_COLUMNS_PREFS_KEY = "inst_gebruikers_columns_v1";

  function readUsrColPrefs() {
    try { var raw = localStorage.getItem(GEBRUIKERS_COLUMNS_PREFS_KEY); return raw ? JSON.parse(raw) || {} : {}; }
    catch (e) { return {}; }
  }
  function writeUsrColPrefs(p) {
    try { localStorage.setItem(GEBRUIKERS_COLUMNS_PREFS_KEY, JSON.stringify(p || {})); } catch (e) { /* */ }
  }
  function setUsrColVisible(colId, visible) {
    document.querySelectorAll('#inst-usr-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyUsrColVisibility() {
    var prefs = readUsrColPrefs();
    GEBRUIKERS_COLUMN_CONFIG.forEach(function (c) {
      var on = (prefs[c.id] != null) ? !!prefs[c.id] : !!c.defaultOn;
      setUsrColVisible(c.id, on);
    });
  }
  function buildUsrColPanel() {
    var list = document.getElementById("inst-usr-columns-list");
    if (!list) return;
    var prefs = readUsrColPrefs();
    list.innerHTML = "";
    GEBRUIKERS_COLUMN_CONFIG.forEach(function (c) {
      if (c.skipToggle) return;
      var on = (prefs[c.id] != null) ? !!prefs[c.id] : !!c.defaultOn;
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "menuitemcheckbox");
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.setAttribute("data-col", c.id);
      btn.className = "column-toggle";
      btn.innerHTML = '<span class="column-toggle-check" aria-hidden="true">' +
        (on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '') +
        '</span><span class="column-toggle-label">' + c.label + '</span>';
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOn = btn.getAttribute("aria-checked") === "true";
        var nextOn = !isOn;
        btn.setAttribute("aria-checked", nextOn ? "true" : "false");
        btn.querySelector(".column-toggle-check").innerHTML = nextOn
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : "";
        var p = readUsrColPrefs();
        p[c.id] = nextOn;
        writeUsrColPrefs(p);
        applyUsrColVisibility();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }
  function wireUsrColPanel() {
    var btn = document.getElementById("inst-usr-columns-menu-btn");
    var panel = document.getElementById("inst-usr-columns-panel");
    if (!btn || !panel) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = btn.getAttribute("aria-expanded") === "true";
      if (open) { panel.setAttribute("hidden", ""); btn.setAttribute("aria-expanded", "false"); }
      else { panel.removeAttribute("hidden"); btn.setAttribute("aria-expanded", "true"); }
    });
    document.addEventListener("click", function () {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    });
    applyUsrColVisibility();
  }
  function escUsr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // bs2-rollen per e-mail (read-only overzicht) — éénmalig ophalen + cachen.
  var _rolesByEmail = null;
  async function loadRolesByEmail() {
    if (_rolesByEmail) return _rolesByEmail;
    var map = {};
    try {
      if (window.besaSupabase) {
        var res = await window.besaSupabase.from("bs2_role_users").select("user_email, bs2_roles!inner(name)");
        if (!res.error && Array.isArray(res.data)) {
          res.data.forEach(function (row) {
            var e = String(row.user_email || "").toLowerCase();
            var nm = row.bs2_roles && row.bs2_roles.name;
            if (!e || !nm) return;
            (map[e] = map[e] || []).push(nm);
          });
          Object.keys(map).forEach(function (e) {
            map[e].sort(function (a, b) { return a.localeCompare(b, "nl"); });
          });
        }
      }
    } catch (e) { /* read-only overzicht — geen blokkade */ }
    _rolesByEmail = map;
    return map;
  }
  async function renderGebruikers() {
    var tbody = document.getElementById("inst-usr-tbody");
    var countEl = document.getElementById("inst-usr-count");
    var searchEl = document.getElementById("inst-usr-search");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-muted)">Gebruikers laden…</td></tr>';
    var q = (searchEl ? searchEl.value : "").trim().toLowerCase();
    try {
      var profiles = window.profilesDB && typeof window.profilesDB.getAllSync === "function"
        ? window.profilesDB.getAllSync() : [];
      if (!profiles.length && window.profilesDB && typeof window.profilesDB.refresh === "function") {
        await window.profilesDB.refresh();
        profiles = window.profilesDB.getAllSync();
      }
      var rolesByEmail = await loadRolesByEmail();
      var filtered = (profiles || []).filter(function (p) {
        if (!p) return false;
        if (!q) return true;
        var rolStr = (rolesByEmail[String(p.email || "").toLowerCase()] || []).join(" ");
        var hay = ((p.voornaam || "") + " " + (p.achternaam || "") + " " + (p.email || "") + " " + rolStr).toLowerCase();
        return hay.indexOf(q) >= 0;
      });
      filtered.sort(function (a, b) {
        var ad = a.aanmaakdatum || "", bd = b.aanmaakdatum || "";
        return bd.localeCompare(ad);
      });
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text-muted)">Geen gebruikers gevonden.</td></tr>';
      } else {
        tbody.innerHTML = filtered.map(function (p) {
          var naam = ((p.voornaam || "") + " " + (p.achternaam || "")).trim() || "(geen naam)";
          var status = '<span style="padding:2px 8px;border-radius:var(--r-pill);background:var(--green-soft);color:var(--green);font-size:var(--font-ui-badge);font-weight:600;">Actief</span>';
          var dt = p.aanmaakdatum ? new Date(p.aanmaakdatum).toLocaleDateString("nl-NL") : "—";
          var rollen = rolesByEmail[String(p.email || "").toLowerCase()] || [];
          var rolHtml = rollen.length
            ? rollen.map(function (n) { return '<span class="gebr-rol-chip">' + escUsr(n) + '</span>'; }).join(" ")
            : "—";
          return '<tr>' +
            '<td data-col="naam">' + escUsr(naam) + '</td>' +
            '<td data-col="email">' + escUsr(p.email || "—") + '</td>' +
            '<td data-col="rollen">' + rolHtml + '</td>' +
            '<td data-col="status">' + status + '</td>' +
            '<td data-col="aanmaakdatum">' + escUsr(dt) + '</td>' +
          '</tr>';
        }).join("");
      }
      if (countEl) countEl.textContent = filtered.length + " van " + (profiles || []).length;
      applyUsrColVisibility();
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--red)">Fout bij laden: ' + escUsr(err.message || String(err)) + '</td></tr>';
    }
  }

  // ---------------------------------------------------------------------------
  // Sprint 17 / S17 — Tab: Entiteiten (read-only metadata-tabel BS2 parity)
  // ---------------------------------------------------------------------------

  /**
   * BS2 toont 7 entity-namen: client, employee, disposition, invoice, quotation,
   * Disposition, Phase. BS1 spiegelt deze + voegt counts uit Supabase toe voor
   * extra waarde. Records ARE de structurele Laravel models — read-only.
   */
  var ENTITEITEN_LIST = [
    { naam: "client",      beschrijving: "Cliënt-entiteit",                   bs1_table: "clienten" },
    { naam: "employee",    beschrijving: "Medewerker-entiteit",              bs1_table: "medewerkers" },
    { naam: "disposition", beschrijving: "Beschikking-entiteit",             bs1_table: "beschikkingen" },
    { naam: "invoice",     beschrijving: "Factuur-entiteit",                 bs1_table: "facturen" },
    { naam: "quotation",   beschrijving: "Offerte-entiteit",                 bs1_table: null },
    { naam: "Disposition", beschrijving: "Beschikking-fase entiteit",        bs1_table: null },
    { naam: "Phase",       beschrijving: "Fase-entiteit (algemeen)",         bs1_table: null },
  ];

  var ENTITEITEN_COLUMN_CONFIG = [
    { id: "naam", label: "Naam", defaultOn: true, skipToggle: true },
    { id: "beschrijving", label: "Beschrijving", defaultOn: true },
    { id: "aantal", label: "Aantal records", defaultOn: true },
  ];
  var ENTITEITEN_COLUMNS_PREFS_KEY = "inst_entiteiten_columns_v1";

  function readEntColumnPrefs() {
    try { var raw = localStorage.getItem(ENTITEITEN_COLUMNS_PREFS_KEY); return raw ? JSON.parse(raw) || {} : {}; }
    catch (e) { return {}; }
  }
  function writeEntColumnPrefs(p) {
    try { localStorage.setItem(ENTITEITEN_COLUMNS_PREFS_KEY, JSON.stringify(p || {})); } catch (e) { /* */ }
  }
  function setEntColVisible(colId, visible) {
    document.querySelectorAll('#inst-ent-table [data-col="' + colId + '"]').forEach(function (cell) {
      cell.classList.toggle("col-hidden", !visible);
    });
  }
  function applyEntColumnVisibility() {
    var prefs = readEntColumnPrefs();
    ENTITEITEN_COLUMN_CONFIG.forEach(function (c) {
      var on = (prefs[c.id] != null) ? !!prefs[c.id] : !!c.defaultOn;
      setEntColVisible(c.id, on);
    });
  }
  function buildEntColumnsPanel() {
    var list = document.getElementById("inst-ent-columns-list");
    if (!list) return;
    var prefs = readEntColumnPrefs();
    list.innerHTML = "";
    ENTITEITEN_COLUMN_CONFIG.forEach(function (c) {
      if (c.skipToggle) return;
      var on = (prefs[c.id] != null) ? !!prefs[c.id] : !!c.defaultOn;
      var li = document.createElement("li");
      li.setAttribute("role", "none");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "menuitemcheckbox");
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.setAttribute("data-col", c.id);
      btn.className = "column-toggle";
      btn.innerHTML = '<span class="column-toggle-check" aria-hidden="true">' +
        (on ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '') +
        '</span><span class="column-toggle-label">' + c.label + '</span>';
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOn = btn.getAttribute("aria-checked") === "true";
        var nextOn = !isOn;
        btn.setAttribute("aria-checked", nextOn ? "true" : "false");
        btn.querySelector(".column-toggle-check").innerHTML = nextOn
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : "";
        var p = readEntColumnPrefs();
        p[c.id] = nextOn;
        writeEntColumnPrefs(p);
        applyEntColumnVisibility();
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function wireEntColumnsPanel() {
    var btn = document.getElementById("inst-ent-columns-menu-btn");
    var panel = document.getElementById("inst-ent-columns-panel");
    if (!btn || !panel) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = btn.getAttribute("aria-expanded") === "true";
      if (open) { panel.setAttribute("hidden", ""); btn.setAttribute("aria-expanded", "false"); }
      else { panel.removeAttribute("hidden"); btn.setAttribute("aria-expanded", "true"); }
    });
    document.addEventListener("click", function () {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    });
    applyEntColumnVisibility();
  }

  function escEnt(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function getEntCount(table) {
    if (!table || !window.besaSupabase) return null;
    try {
      var r = await window.besaSupabase.from(table).select("*", { count: "exact", head: true });
      return r.error ? null : r.count;
    } catch (e) { return null; }
  }

  async function renderEntiteiten() {
    var tbody = document.getElementById("inst-ent-tbody");
    var countEl = document.getElementById("inst-ent-count");
    var searchEl = document.getElementById("inst-ent-search");
    if (!tbody) return;
    var q = (searchEl ? searchEl.value : "").trim().toLowerCase();
    var filtered = ENTITEITEN_LIST.filter(function (e) {
      if (!q) return true;
      return (e.naam + " " + (e.beschrijving || "")).toLowerCase().indexOf(q) >= 0;
    });
    // Bug #67 fix: empty-state placeholder voor consistentie met Gebruikers-tab
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="padding:32px;text-align:center;color:var(--text-muted)">Geen entiteiten gevonden.</td></tr>';
    } else {
      tbody.innerHTML = filtered.map(function (e) {
        return '<tr>' +
          '<td data-col="naam"><code style="font-family:var(--font-mono, monospace);font-size:13px;">' + escEnt(e.naam) + '</code></td>' +
          '<td data-col="beschrijving">' + escEnt(e.beschrijving) + '</td>' +
          '<td data-col="aantal" data-table="' + escEnt(e.bs1_table || "") + '">' + (e.bs1_table ? '<span style="color:var(--text-muted)">laden…</span>' : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
        '</tr>';
      }).join("");
    }
    if (countEl) countEl.textContent = filtered.length + " van " + ENTITEITEN_LIST.length;
    applyEntColumnVisibility();

    // Async laden van counts via Supabase
    for (var i = 0; i < filtered.length; i++) {
      var ent = filtered[i];
      if (!ent.bs1_table) continue;
      (function (table) {
        getEntCount(table).then(function (count) {
          var cells = tbody.querySelectorAll('td[data-col="aantal"][data-table="' + table + '"]');
          cells.forEach(function (cell) {
            cell.innerHTML = count == null ? '<span style="color:var(--red)">?</span>' : '<strong>' + count + '</strong>';
          });
        });
      })(ent.bs1_table);
    }
  }

  // ---------------------------------------------------------------------------
  // Tab: Mijn profiel
  // ---------------------------------------------------------------------------

  function loadProfielForm() {
    var profile = null;
    try {
      if (window.profilesDB && window.profilesDB.getCurrentSync) {
        profile = window.profilesDB.getCurrentSync();
      }
      if (!profile && window.besaCurrentProfile) profile = window.besaCurrentProfile;
    } catch (e) { /* */ }
    if (!profile) return;
    document.getElementById("inst-profiel-voornaam").value = profile.voornaam || "";
    document.getElementById("inst-profiel-achternaam").value = profile.achternaam || "";
    document.getElementById("inst-profiel-email").value = profile.email || "";
    setProfielRolVeld(profile);
  }

  // Toon de echte rollen (bs2_role_users via permissions.js), niet de grove profiles.rol-tekst.
  function setProfielRolVeld(profile) {
    var el = document.getElementById("inst-profiel-rol");
    if (!el) return;
    function paint() {
      var rollen = (window.besaPermissions && typeof window.besaPermissions.getRoleNames === "function")
        ? window.besaPermissions.getRoleNames() : [];
      el.value = rollen.length ? rollen.join(", ") : ((profile && profile.rol) || "");
    }
    paint();
    if (window.besaPermissionsReady && typeof window.besaPermissionsReady.then === "function") {
      window.besaPermissionsReady.then(paint).catch(function () { /* */ });
    }
  }

  async function submitProfielForm(evt) {
    evt.preventDefault();
    var fb = document.getElementById("inst-profiel-feedback");
    var btn = document.getElementById("inst-profiel-save-btn");
    fb.textContent = "";
    fb.style.color = "var(--green)";

    var voornaam = document.getElementById("inst-profiel-voornaam").value.trim();
    var achternaam = document.getElementById("inst-profiel-achternaam").value.trim();

    var profile = window.profilesDB && window.profilesDB.getCurrentSync ? window.profilesDB.getCurrentSync() : null;
    if (!profile || !profile.id) {
      fb.style.color = "var(--red)";
      fb.textContent = "Geen profiel geladen — log opnieuw in.";
      return;
    }

    btn.disabled = true;
    try {
      await window.profilesDB.update(profile.id, { voornaam: voornaam, achternaam: achternaam });
      fb.textContent = "Opgeslagen ✓";
      if (window.showActionFeedback) window.showActionFeedback("saved", "Profiel bijgewerkt");
    } catch (err) {
      fb.style.color = "var(--red)";
      fb.textContent = "Opslaan mislukt: " + (err && err.message || err);
    } finally {
      btn.disabled = false;
      setTimeout(function () { fb.textContent = ""; }, 4000);
    }
  }

  // ---------------------------------------------------------------------------
  // Tab: Mijn notificaties (M2M profile_notification_preferences)
  // ---------------------------------------------------------------------------

  function getCurrentProfileId() {
    if (window.profilesDB && window.profilesDB.getCurrentSync) {
      try {
        var p = window.profilesDB.getCurrentSync();
        if (p && p.id) return p.id;
      } catch (e) { /* */ }
    }
    return null;
  }

  function renderMijnNotificaties() {
    var list = document.getElementById("inst-mn-list");
    var empty = document.getElementById("inst-mn-empty");
    if (!list) return;
    var profileId = getCurrentProfileId();
    var types = (window.notificationTypesDB && window.notificationTypesDB.getAllSync()) || [];
    types = types.filter(function (t) { return t && !t.archived; });
    types.sort(function (a, b) { return String(a.naam || "").localeCompare(String(b.naam || "")); });

    if (!types.length) {
      list.innerHTML = "";
      if (empty) empty.style.display = "";
      return;
    }
    if (empty) empty.style.display = "none";

    list.innerHTML = types.map(function (t) {
      var effective = window.profileNotificationPrefsDB
        ? window.profileNotificationPrefsDB.getEffective(profileId, t.id, t.defaultAan)
        : t.defaultAan;
      var kanaalLabel = ({ in_app: "In-app", email: "E-mail", sms: "SMS", push: "Push" })[t.kanaal] || t.kanaal || "";
      return ''
        + '<div class="inst-mn-row" data-type-id="' + escapeHtml(t.id) + '">'
        + '  <div class="inst-mn-info">'
        + '    <div class="inst-mn-name">' + escapeHtml(t.naam) + '</div>'
        + '    <div class="inst-mn-meta">'
        +        '<span class="inst-mn-kanaal">' + escapeHtml(kanaalLabel) + '</span>'
        + (t.beschrijving ? ' <span class="inst-mn-sep">·</span> <span class="inst-mn-desc">' + escapeHtml(t.beschrijving) + '</span>' : '')
        + '    </div>'
        + '  </div>'
        + '  <label class="switch" title="Notificatie ' + (effective ? 'uitzetten' : 'aanzetten') + '">'
        + '    <input type="checkbox" data-action="toggle-pref" data-type-id="' + escapeHtml(t.id) + '" ' + (effective ? 'checked' : '') + ' />'
        + '    <span class="switch-slider"></span>'
        + '  </label>'
        + '</div>';
    }).join("");
  }

  async function toggleNotifPref(typeId, enabled) {
    var profileId = getCurrentProfileId();
    if (!profileId) {
      if (window.showError) window.showError("Geen actief profiel — log opnieuw in.");
      return;
    }
    if (!window.profileNotificationPrefsDB) return;
    try {
      await window.profileNotificationPrefsDB.setEnabled(profileId, typeId, !!enabled);
      if (window.showActionFeedback) window.showActionFeedback("saved", "Voorkeur opgeslagen");
    } catch (err) {
      if (window.showError) window.showError("Voorkeur opslaan mislukt: " + (err && err.message || err));
      // Re-render om de toggle terug te zetten naar de echte waarde
      renderMijnNotificaties();
    }
  }

  // ---------------------------------------------------------------------------
  // Tab: Notificatietypes
  // ---------------------------------------------------------------------------

  var KANAAL_LABELS = { in_app: "In-app", email: "E-mail", sms: "SMS", push: "Push" };

  function getVisibleNt() {
    var items = (window.notificationTypesDB && window.notificationTypesDB.getAllSync()) || [];
    var q = state.ntSearch.trim().toLowerCase();
    return items.filter(function (n) {
      if (!n) return false;
      if (!!n.archived !== !!state.ntShowArchived) return false;
      if (!q) return true;
      var hay = (n.naam || "") + " " + (n.beschrijving || "") + " " + (n.kanaal || "");
      return hay.toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderNtRow(n) {
    var actions = n.archived
      ? '<div class="hr-row-actions">' +
        '<button class="btn-outline hr-restore-btn" data-action="restore" data-id="' + escapeHtml(n.id) + '">Herstel</button>' +
        '<button class="employee-delete-btn" data-action="purge" data-id="' + escapeHtml(n.id) + '" aria-label="Definitief verwijderen">' + trashSvg() + '</button>' +
        '</div>'
      : '<button class="employee-delete-btn" data-action="archive" data-id="' + escapeHtml(n.id) + '" aria-label="Archiveren">' + trashSvg() + '</button>';
    var nameBtn = '<button class="link-button" data-action="edit" data-id="' + escapeHtml(n.id) + '" style="background:none;border:0;padding:0;color:var(--blue);cursor:pointer;text-align:left;font:inherit;font-weight:600;">' + escapeHtml(n.naam) + '</button>';
    return '<tr>' +
      '<td>' + nameBtn + '</td>' +
      '<td style="color:var(--text-secondary);">' + escapeHtml(n.beschrijving || "") + '</td>' +
      '<td>' + escapeHtml(KANAAL_LABELS[n.kanaal] || n.kanaal) + '</td>' +
      '<td>' + (n.defaultAan ? '<span style="color:var(--green);">✓</span>' : '<span style="color:var(--text-muted);">—</span>') + '</td>' +
      '<td class="hr-actions-cell">' + actions + '</td>' +
    '</tr>';
  }

  function renderNt() {
    var tbody = document.getElementById("inst-nt-tbody");
    if (!tbody) return;
    var items = getVisibleNt();
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:32px;text-align:center;color:var(--text-muted);">Geen notificatietypes gevonden.</td></tr>';
    } else {
      tbody.innerHTML = items.map(renderNtRow).join("");
    }
  }

  function openNtModal(item) {
    state.ntEditingId = item ? item.id : null;
    var modal = document.getElementById("inst-nt-modal");
    document.getElementById("inst-nt-modal-title").textContent = item ? "Notificatietype bewerken" : "Notificatietype toevoegen";
    document.getElementById("inst-nt-edit-id").value = item ? item.id : "";
    document.getElementById("inst-nt-naam").value = item ? item.naam : "";
    document.getElementById("inst-nt-beschrijving").value = item ? (item.beschrijving || "") : "";
    document.getElementById("inst-nt-kanaal").value = item ? (item.kanaal || "in_app") : "in_app";
    document.getElementById("inst-nt-default-aan").checked = item ? !!item.defaultAan : true;
    document.getElementById("inst-nt-submit-btn").textContent = item ? "Opslaan" : "Toevoegen";
    modal.style.display = "flex";
  }
  function closeNtModal() {
    state.ntEditingId = null;
    document.getElementById("inst-nt-modal").style.display = "none";
  }

  async function submitNtForm(evt) {
    evt.preventDefault();
    var submit = document.getElementById("inst-nt-submit-btn");
    var idVal = document.getElementById("inst-nt-edit-id").value;
    var naam = document.getElementById("inst-nt-naam").value.trim();
    if (!naam) {
      document.getElementById("inst-nt-naam").focus();
      return;
    }
    var payload = {
      naam: naam,
      beschrijving: document.getElementById("inst-nt-beschrijving").value,
      kanaal: document.getElementById("inst-nt-kanaal").value,
      defaultAan: document.getElementById("inst-nt-default-aan").checked,
    };
    submit.disabled = true;
    try {
      if (idVal) await window.notificationTypesDB.update(idVal, payload);
      else await window.notificationTypesDB.add(payload);
      if (window.showActionFeedback) window.showActionFeedback("saved", payload.naam);
      closeNtModal();
    } catch (err) {
      if (window.showError) window.showError("Opslaan mislukt: " + (err && err.message || err));
    } finally {
      submit.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Wire events
  // ---------------------------------------------------------------------------

  function wireEvents() {
    document.getElementById("inst-tab-profiel").addEventListener("click", function () { setTab("profiel"); });
    var tabMijnNotif = document.getElementById("inst-tab-mijn-notificaties");
    if (tabMijnNotif) tabMijnNotif.addEventListener("click", function () { setTab("mijn-notificaties"); });
    document.getElementById("inst-tab-notificaties").addEventListener("click", function () { setTab("notificaties"); });
    // Sprint 17 / S17 — Entiteiten tab init
    var tabEnt = document.getElementById("inst-tab-entiteiten");
    if (tabEnt) tabEnt.addEventListener("click", function () { setTab("entiteiten"); });
    var entSearch = document.getElementById("inst-ent-search");
    if (entSearch) entSearch.addEventListener("input", function () { renderEntiteiten(); });
    buildEntColumnsPanel();
    wireEntColumnsPanel();

    // Sprint 18 / S18 — Gebruikers tab init
    var tabUsr = document.getElementById("inst-tab-gebruikers");
    if (tabUsr) tabUsr.addEventListener("click", function () { setTab("gebruikers"); });
    var usrSearch = document.getElementById("inst-usr-search");
    if (usrSearch) usrSearch.addEventListener("input", function () { renderGebruikers(); });
    buildUsrColPanel();
    wireUsrColPanel();
    // Re-render bij profile-updates
    window.addEventListener("besa:profile-updated", function () {
      if (state.activeTab === "gebruikers") renderGebruikers();
    });

    // Beheer-tabs verbergen voor niet-admins. Direct (warme permissie-cache) + opnieuw
    // zodra de permissie-DB-load klaar is (koude cache).
    applyAdminTabVisibility();
    try {
      if (window.besaPermissionsReady && typeof window.besaPermissionsReady.then === "function") {
        window.besaPermissionsReady.then(applyAdminTabVisibility);
      }
    } catch (e) { /* */ }

    // Mijn notificaties: toggle handler (delegated)
    var mnList = document.getElementById("inst-mn-list");
    if (mnList) {
      mnList.addEventListener("change", function (e) {
        var input = e.target;
        if (!input || input.getAttribute("data-action") !== "toggle-pref") return;
        var typeId = input.getAttribute("data-type-id");
        toggleNotifPref(typeId, input.checked);
      });
    }

    document.getElementById("inst-profiel-form").addEventListener("submit", submitProfielForm);

    document.getElementById("inst-nt-add-btn").addEventListener("click", function () { openNtModal(null); });
    document.getElementById("inst-nt-close-btn").addEventListener("click", closeNtModal);
    document.getElementById("inst-nt-cancel-btn").addEventListener("click", closeNtModal);
    document.getElementById("inst-nt-form").addEventListener("submit", submitNtForm);
    document.getElementById("inst-nt-search").addEventListener("input", function (e) { state.ntSearch = e.target.value || ""; renderNt(); });
    document.getElementById("inst-nt-archived-toggle").addEventListener("change", function (e) { state.ntShowArchived = !!e.target.checked; renderNt(); });

    document.getElementById("inst-nt-tbody").addEventListener("click", async function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var id = btn.getAttribute("data-id");
      var item = window.notificationTypesDB.getByIdSync(id);
      if (!item) return;
      var action = btn.getAttribute("data-action");
      try {
        if (action === "edit") openNtModal(item);
        else if (action === "archive") { await window.notificationTypesDB.archive(id); }
        else if (action === "restore") { await window.notificationTypesDB.restore(id); }
        else if (action === "purge") {
          var ok = await window.showSliderConfirmModal({
            title: "Bent u zeker dat dit verwijderd wordt?",
            preview: item.naam || item.id,
            okLabel: "Verwijderen",
            cancelLabel: "Annuleren",
          });
          if (ok) {
            await window.notificationTypesDB.delete(id);
            if (window.showActionFeedback) window.showActionFeedback("deleted", "Notificatie-type");
          }
        }
      } catch (err) {
        if (window.showError) window.showError("Actie mislukt: " + (err && err.message || err));
      }
    });

    window.addEventListener("besa:notification-types-updated", function () {
      renderNt();
      if (state.activeTab === "mijn-notificaties") renderMijnNotificaties();
    });
    window.addEventListener("besa:notification-prefs-updated", function () {
      if (state.activeTab === "mijn-notificaties") renderMijnNotificaties();
    });
    window.addEventListener("besa:profile-updated", loadProfielForm);
  }

  function init() {
    wireEvents();
    loadProfielForm();
    if (window.profilesDB && window.profilesDB.ready) {
      window.profilesDB.ready.then(loadProfielForm);
    }
    if (window.notificationTypesDB) {
      renderNt();
      window.notificationTypesDB.ready.then(renderNt);
    }
    if (window.profileNotificationPrefsDB && window.profileNotificationPrefsDB.ready) {
      window.profileNotificationPrefsDB.ready.then(function () {
        if (state.activeTab === "mijn-notificaties") renderMijnNotificaties();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Bug #68 fix: defensieve globale Escape + Overlay close-ways
  // voor inst-nt-modal (Notificatietype-bewerken modal in Notificatietypes-tab).
  // Spiegelt Bug #61 / #63 / #66 oplossingen voor emp-/beleid-/teams-modals.
  (function initGlobalCloseForInstNtModal() {
    function getModal() { return document.getElementById("inst-nt-modal"); }
    function isVisible(m) {
      if (!m) return false;
      if (m.style && m.style.display === "none") return false;
      return getComputedStyle(m).display !== "none" && !m.hasAttribute("hidden");
    }
    function closeModal(m) {
      if (!m) return;
      m.style.display = "none";
      m.setAttribute("aria-hidden", "true");
    }

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var m = getModal();
      if (m && isVisible(m)) {
        closeModal(m);
        e.stopPropagation();
      }
    });

    var modal = getModal();
    if (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target !== modal) return;
        closeModal(modal);
      });
    }
  })();
})();
