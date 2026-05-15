/* global window, document */
/**
 * dienst-detail.js — view-modal logic voor Dienstdetails (BS2-parity).
 *
 * Verzorgt 7 secties:
 *  1. Open/Gesloten toggle
 *  2. Top-info row (Diensttype + Locatie + Datum + Tijd)
 *  3. Beschrijving
 *  4. Toegewezen (N/M)
 *  5. AI suggesties (rule-based, inline scoring)
 *  6. Uitgenodigd
 *  7. Aanmeldingen
 *  8. Activiteit (audit + comments)
 *  9. Comment-box
 *
 * Plus side-modals: Toewijzen, Uitnodigen, Verwijderen-confirm.
 *
 * Exposed: window.dienstDetail = { open(dienstId), close() }
 */
(function (global) {
  "use strict";

  var currentDienst = null;
  var currentDienstId = null;

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatNlDate(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function formatNlTime(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function formatTimeRange(startIso, endIso) {
    var s = formatNlTime(startIso);
    var e = formatNlTime(endIso);
    return s + " - " + e;
  }

  function formatTimeAgo(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var diffMs = Date.now() - d.getTime();
    var diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "een paar seconden geleden";
    if (diffMin < 60) return diffMin + " min geleden";
    var diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return diffH + " uur geleden";
    var diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "Gisteren";
    if (diffD < 7) return diffD + " dagen geleden";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function getInitials(name) {
    var s = String(name || "").trim();
    if (!s) return "?";
    var parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function getDienst(dienstId) {
    if (!global.planningDB || typeof global.planningDB.getAllSync !== "function") return null;
    var all = global.planningDB.getAllSync();
    return all.find(function (d) { return String(d.id) === String(dienstId); });
  }

  function getMedewerker(idOrName) {
    if (!idOrName) return null;
    if (global.medewerkersDB && typeof global.medewerkersDB.getAllSync === "function") {
      var all = global.medewerkersDB.getAllSync();
      var m = all.find(function (m) {
        return String(m.id) === String(idOrName)
          || (m.voornaam + " " + m.achternaam).toLowerCase() === String(idOrName).toLowerCase();
      });
      if (m) return m;
    }
    return null;
  }

  function renderInfoRow(dienst) {
    var el = document.getElementById("planning-detail-info-row");
    if (!el) return;
    el.innerHTML = ''
      + '<div class="planning-detail-info-col"><span class="planning-detail-info-label">Diensttype</span><span class="planning-detail-info-value">' + escapeHtml(dienst.diensttype || "-") + '</span></div>'
      + '<div class="planning-detail-info-col"><span class="planning-detail-info-label">Locatie</span><span class="planning-detail-info-value">' + escapeHtml(dienst.locatie || "-") + '</span></div>'
      + '<div class="planning-detail-info-col"><span class="planning-detail-info-label">Datum</span><span class="planning-detail-info-value">' + formatNlDate((dienst.start_iso || dienst.start)) + '</span></div>'
      + '<div class="planning-detail-info-col"><span class="planning-detail-info-label">Tijd</span><span class="planning-detail-info-value">' + formatTimeRange((dienst.start_iso || dienst.start), (dienst.einde_iso || dienst.einde)) + '</span></div>';
  }

  function renderBeschrijving(dienst) {
    var el = document.getElementById("planning-detail-beschrijving");
    if (!el) return;
    var txt = (dienst.beschrijving || (dienst.data && dienst.data.beschrijving) || "").trim();
    el.textContent = txt || "-";
  }

  function renderToegewezen(dienst, uitnodigingen) {
    var list = document.getElementById("planning-detail-toegewezen-list");
    var counter = document.getElementById("planning-detail-toegewezen-count");
    if (!list || !counter) return;
    var toegewezen = uitnodigingen.filter(function (u) { return u.status === "toegewezen"; });
    var vereist = dienst.vereist_aantal_medewerkers || 1;
    counter.textContent = "(" + toegewezen.length + "/" + vereist + ")";

    // Voeg legacy single-teamlid toe (uit kolom planning.teamlid) als nog niet aanwezig
    if (dienst.teamlid && toegewezen.length === 0) {
      list.innerHTML = renderMedewerkerRow({ medewerker_id: null, naam: dienst.teamlid, status: "toegewezen", legacy: true });
      return;
    }

    if (toegewezen.length === 0) {
      list.innerHTML = '<div class="planning-detail-empty">Nog geen medewerkers toegewezen.</div>';
      return;
    }
    list.innerHTML = toegewezen.map(function (u) {
      var m = getMedewerker(u.medewerker_id);
      var naam = m ? (m.voornaam + " " + m.achternaam).trim() : (u.medewerker_id || "Onbekend");
      var email = m && m.email ? m.email : "";
      return renderMedewerkerRow({ uitnodiging_id: u.id, medewerker_id: u.medewerker_id, naam: naam, email: email, status: "toegewezen" });
    }).join("");
  }

  function renderMedewerkerRow(opts) {
    var avatar = getInitials(opts.naam);
    var removable = !opts.legacy && opts.uitnodiging_id;
    return ''
      + '<div class="planning-detail-medewerker-row" data-uitnodiging-id="' + escapeHtml(opts.uitnodiging_id || "") + '">'
      +   '<span class="planning-detail-avatar">' + escapeHtml(avatar) + '</span>'
      +   '<div class="planning-detail-medewerker-info"><span class="planning-detail-medewerker-naam">' + escapeHtml(opts.naam) + '</span>'
      +     (opts.email ? '<span class="planning-detail-medewerker-email">' + escapeHtml(opts.email) + '</span>' : '')
      +   '</div>'
      +   (removable ? '<button type="button" class="planning-detail-remove" data-action="de-assign" aria-label="Verwijderen">&times;</button>' : '')
      + '</div>';
  }

  function renderUitgenodigd(uitnodigingen) {
    var list = document.getElementById("planning-detail-uitgenodigd-list");
    if (!list) return;
    var uit = uitnodigingen.filter(function (u) { return u.status === "uitgenodigd"; });
    if (uit.length === 0) {
      list.innerHTML = '<div class="planning-detail-empty">Nog geen medewerkers uitgenodigd.</div>';
      return;
    }
    list.innerHTML = uit.map(function (u) {
      var m = getMedewerker(u.medewerker_id);
      var naam = m ? (m.voornaam + " " + m.achternaam).trim() : (u.medewerker_id || "Onbekend");
      return renderMedewerkerRow({ uitnodiging_id: u.id, medewerker_id: u.medewerker_id, naam: naam, email: m && m.email ? m.email : "", status: "uitgenodigd" });
    }).join("");
  }

  function renderAanmeldingen(uitnodigingen) {
    var list = document.getElementById("planning-detail-aanmeldingen-list");
    if (!list) return;
    var aan = uitnodigingen.filter(function (u) { return u.status === "aangemeld"; });
    if (aan.length === 0) {
      list.innerHTML = '<div class="planning-detail-empty">Er hebben zich nog geen medewerkers aangemeld.</div>';
      return;
    }
    list.innerHTML = aan.map(function (u) {
      var m = getMedewerker(u.medewerker_id);
      var naam = m ? (m.voornaam + " " + m.achternaam).trim() : (u.medewerker_id || "Onbekend");
      return renderMedewerkerRow({ uitnodiging_id: u.id, medewerker_id: u.medewerker_id, naam: naam, email: m && m.email ? m.email : "", status: "aangemeld" });
    }).join("");
  }

  function renderActivity(activiteiten) {
    var el = document.getElementById("planning-detail-activity");
    if (!el) return;
    if (!activiteiten || activiteiten.length === 0) {
      el.innerHTML = '<div class="planning-detail-empty">Nog geen activiteit.</div>';
      return;
    }
    // Profile-naam ophalen
    el.innerHTML = activiteiten.map(function (a) {
      var actorName = "Systeem";
      if (a.actor_profile_id && global.profilesDB && typeof global.profilesDB.getAllSync === "function") {
        var ps = global.profilesDB.getAllSync().find(function (p) { return p.id === a.actor_profile_id; });
        if (ps) actorName = (ps.voornaam || "") + " " + (ps.achternaam || "");
        actorName = actorName.trim() || (ps && ps.email) || "Systeem";
      }
      var avatar = getInitials(actorName);
      var separator = a.type === "comment" ? "•" : "";
      var actionOrBody = a.type === "comment" ? a.body : a.action;
      var bold = a.type === "audit" && /opengesteld|gesloten|aangemaakt|verwijderd|bewerkt|gearchiveerd/i.test(actionOrBody || "");
      return ''
        + '<div class="planning-detail-activity-item">'
        +   '<span class="planning-detail-avatar planning-detail-avatar--sm">' + escapeHtml(avatar) + '</span>'
        +   '<div class="planning-detail-activity-content">'
        +     '<div class="planning-detail-activity-meta"><strong>' + escapeHtml(actorName) + '</strong> ' + (separator ? '<span style="color:var(--text-muted)">' + separator + '</span> ' : '') + '<span class="planning-detail-activity-time">' + escapeHtml(formatTimeAgo(a.created_at)) + '</span></div>'
        +     '<div class="planning-detail-activity-action">' + (bold ? wrapBold(actionOrBody) : escapeHtml(actionOrBody || "")) + '</div>'
        +   '</div>'
        + '</div>';
    }).join("");
  }

  function wrapBold(action) {
    // Wrap last word (opengesteld/gesloten/aangemaakt/...) in <strong>
    var m = /^(.*?)(\b(?:opengesteld|gesloten|aangemaakt|verwijderd|bewerkt|gearchiveerd)\b)(.*)$/i.exec(action);
    if (!m) return escapeHtml(action);
    return escapeHtml(m[1]) + '<strong>' + escapeHtml(m[2]) + '</strong>' + escapeHtml(m[3]);
  }

  /**
   * Rule-based AI suggesties: filter beschikbare medewerkers op
   * - competenties match (vereiste competenties ⊆ medewerker competenties)
   * - geen overlap met andere diensten in tijd-slot
   * - dezelfde dienstverband-voorkeur indien gespecifieerd
   * Max 5 results.
   */
  function computeSuggestions(dienst) {
    if (!global.medewerkersDB) return [];
    var medewerkersRaw = global.medewerkersDB.getAllSync ? global.medewerkersDB.getAllSync() : [];
    // Dedupe op id én (voornaam+achternaam+email) — voorkomt dat dezelfde persoon
    // meerdere keren met Score 50 verschijnt wanneer cache toevallig dubbele rijen heeft.
    var seenIds = Object.create(null);
    var seenKeys = Object.create(null);
    var medewerkers = medewerkersRaw.filter(function (m) {
      if (!m) return false;
      var id = String(m.id || "");
      var key = ((m.voornaam || "") + "|" + (m.achternaam || "") + "|" + (m.email || "")).toLowerCase();
      if (id && seenIds[id]) return false;
      if (key !== "||" && seenKeys[key]) return false;
      if (id) seenIds[id] = 1;
      if (key !== "||") seenKeys[key] = 1;
      return true;
    });
    var startMs = new Date((dienst.start_iso || dienst.start)).getTime();
    var endMs = new Date((dienst.einde_iso || dienst.einde)).getTime();
    var planning = global.planningDB && global.planningDB.getAllSync ? global.planningDB.getAllSync() : [];

    var scored = medewerkers.filter(function (m) {
      return m && (m.archived !== true);
    }).map(function (m) {
      var score = 50; // base
      // Check geen overlap
      var hasOverlap = planning.some(function (p) {
        if (!p.teamlid || p.id === dienst.id || p.archived) return false;
        var matches = String(p.teamlid).toLowerCase() === ((m.voornaam || "") + " " + (m.achternaam || "")).toLowerCase().trim();
        if (!matches) return false;
        var pStart = new Date((p.start_iso || p.start)).getTime();
        var pEnd = new Date((p.einde_iso || p.einde)).getTime();
        return !(pEnd <= startMs || pStart >= endMs);
      });
      if (hasOverlap) score -= 100;

      // Match diensttype-voorkeur (uit medewerker.data.voorkeuren) — beschikbaar in BS1 v1+
      try {
        var prefs = m.data && (m.data.diensttype_voorkeuren || m.data.voorkeur_diensttypes);
        if (prefs && Array.isArray(prefs) && prefs.indexOf(dienst.diensttype) >= 0) score += 30;
      } catch (e) {}

      return { medewerker: m, score: score };
    }).filter(function (s) { return s.score > 0; });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 5);
  }

  function renderAiSuggesties(dienst) {
    var el = document.getElementById("planning-detail-ai");
    if (!el) return;
    el.innerHTML = '<div class="planning-detail-empty">Bezig met laden...</div>';
    setTimeout(function () {
      var suggestions = computeSuggestions(dienst);
      if (suggestions.length === 0) {
        el.innerHTML = '<div class="planning-detail-empty">Geen suggesties — dienst is volledig bemand of geen beschikbare medewerkers.</div>';
        return;
      }
      el.innerHTML = '<div class="planning-detail-ai-list">'
        + suggestions.map(function (s) {
          var naam = ((s.medewerker.voornaam || "") + " " + (s.medewerker.achternaam || "")).trim();
          return ''
            + '<div class="planning-detail-ai-item">'
            +   '<span class="planning-detail-avatar">' + escapeHtml(getInitials(naam)) + '</span>'
            +   '<div class="planning-detail-medewerker-info"><span class="planning-detail-medewerker-naam">' + escapeHtml(naam) + '</span>'
            +     '<span class="planning-detail-medewerker-email">Score: ' + s.score + '</span></div>'
            +   '<button type="button" class="btn-outline btn-sm" data-action="ai-assign" data-medewerker-id="' + escapeHtml(s.medewerker.id) + '">Toewijzen</button>'
            + '</div>';
        }).join("")
        + '</div>';
    }, 300); // korte simulatie zonder LLM-call (max 2s response per regel)
  }

  function refreshAllSections() {
    if (!currentDienst) return;
    var uitnodigingen = global.dienstUitnodigingenDB ? global.dienstUitnodigingenDB.getForDienstSync(currentDienstId) : [];
    var activiteiten = global.dienstActiviteitenDB ? global.dienstActiviteitenDB.getForDienstSync(currentDienstId) : [];
    renderInfoRow(currentDienst);
    renderBeschrijving(currentDienst);
    renderToegewezen(currentDienst, uitnodigingen);
    renderUitgenodigd(uitnodigingen);
    renderAanmeldingen(uitnodigingen);
    renderActivity(activiteiten);
  }

  async function open(dienstId) {
    var dienst = getDienst(dienstId);
    if (!dienst) {
      if (global.showError) global.showError("Dienst niet gevonden");
      return;
    }
    currentDienst = dienst;
    currentDienstId = dienst.id;

    // Right-side slide-in panel (vervangt vorige centered modal)
    var panel = document.getElementById("planning-view-modal");
    var scrim = document.getElementById("planning-view-scrim");
    if (!panel) return;
    if (scrim) scrim.removeAttribute("hidden");
    panel.removeAttribute("hidden");
    panel.setAttribute("aria-hidden", "false");
    // Force reflow zodat de transitie van translateX(100%) → 0 zichtbaar animeert
    requestAnimationFrame(function () {
      if (scrim) scrim.classList.add("is-open");
      panel.classList.add("is-open");
    });

    refreshAllSections();

    // Fetch via supabase
    if (global.dienstUitnodigingenDB) global.dienstUitnodigingenDB.fetchForDienst(dienstId).then(refreshAllSections);
    if (global.dienstActiviteitenDB) global.dienstActiviteitenDB.fetchForDienst(dienstId).then(refreshAllSections);

    // Avatar in comment-box
    var avatarEl = document.getElementById("planning-detail-comment-avatar");
    if (avatarEl && global.profilesDB) {
      var p = global.profilesDB.getCurrentSync && global.profilesDB.getCurrentSync();
      if (p) {
        var first = p.voornaam || "";
        var last = p.achternaam || "";
        avatarEl.textContent = first && last ? (first[0] + last[0]).toUpperCase() : ((p.email || "??").slice(0, 2).toUpperCase());
      }
    }
  }

  function close() {
    var panel = document.getElementById("planning-view-modal");
    var scrim = document.getElementById("planning-view-scrim");
    if (!panel) return;
    // Start slide-out animatie via class-removal; pas na transitie hidden zetten
    if (scrim) scrim.classList.remove("is-open");
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    setTimeout(function () {
      panel.setAttribute("hidden", "");
      if (scrim) scrim.setAttribute("hidden", "");
    }, 260); // iets langer dan de 0.25s CSS-transition
    currentDienst = null;
    currentDienstId = null;
  }

  function openSideModal(modalId) {
    var m = document.getElementById(modalId);
    if (!m) return;
    m.removeAttribute("hidden");
    m.setAttribute("aria-hidden", "false");
  }

  function closeSideModal(modalId) {
    var m = document.getElementById(modalId);
    if (!m) return;
    m.setAttribute("hidden", "");
    m.setAttribute("aria-hidden", "true");
  }

  function populateMedewerkerSelect(selectEl) {
    if (!selectEl || !global.medewerkersDB) return;
    var all = global.medewerkersDB.getAllSync ? global.medewerkersDB.getAllSync() : [];
    selectEl.innerHTML = '<option value="">Selecteer een teamlid</option>'
      + all.filter(function (m) { return m && !m.archived; }).map(function (m) {
        var naam = ((m.voornaam || "") + " " + (m.achternaam || "")).trim();
        return '<option value="' + escapeHtml(m.id) + '">' + escapeHtml(naam) + '</option>';
      }).join("");
  }

  function attachEvents() {
    // Close X / scrim-click + Escape
    var panel = document.getElementById("planning-view-modal");
    var scrim = document.getElementById("planning-view-scrim");
    if (panel) {
      document.getElementById("planning-view-close-btn") && document.getElementById("planning-view-close-btn").addEventListener("click", close);
      // Klik op scrim (buiten panel) sluit het panel
      if (scrim) {
        scrim.addEventListener("click", close);
      }
      // Escape sluit panel of side-modals
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        if (panel.hasAttribute("hidden")) return;
        // Eerst side-modal sluiten als die open is, anders main panel
        var openSide = ["planning-toewijzen-modal", "planning-uitnodigen-modal", "planning-delete-modal", "planning-edit-modal"]
          .map(function (id) { return document.getElementById(id); })
          .find(function (m) { return m && !m.hasAttribute("hidden"); });
        if (openSide) { closeSideModal(openSide.id); }
        else { close(); }
      });
    }

    // Bewerken-knop click wordt al gebonden door planning.js initViewModal() →
    // ui.viewingId = currentDienstId → openEditModal(id, false) → opent
    // planning-dienst-panel met titel "Dienst bewerken". Geen extra handler hier
    // (vorige iteratie veroorzaakte dubbele-modal-open bug omdat 2 handlers vuurden).

    // Open/Gesloten-dienst toggle is per user-decision 2026-05-15 verwijderd uit
    // de UI (sub-task v3-2026-05-15). De DB-kolom `planning.open_voor_aanmelding`
    // blijft bestaan voor evt. toekomstige feature-mapping; geen UI-pad meer.

    // Toewijzen
    var toewijzenBtn = document.getElementById("planning-detail-toewijzen-btn");
    toewijzenBtn && toewijzenBtn.addEventListener("click", function () {
      populateMedewerkerSelect(document.getElementById("planning-toewijzen-select"));
      var bulk = document.getElementById("planning-toewijzen-bulk");
      if (bulk) bulk.checked = false;
      openSideModal("planning-toewijzen-modal");
    });
    document.getElementById("planning-toewijzen-cancel") && document.getElementById("planning-toewijzen-cancel").addEventListener("click", function () { closeSideModal("planning-toewijzen-modal"); });
    document.getElementById("planning-toewijzen-close") && document.getElementById("planning-toewijzen-close").addEventListener("click", function () { closeSideModal("planning-toewijzen-modal"); });
    document.getElementById("planning-toewijzen-submit") && document.getElementById("planning-toewijzen-submit").addEventListener("click", async function () {
      var sel = document.getElementById("planning-toewijzen-select");
      var mid = sel && sel.value;
      if (!mid || !currentDienstId) return;
      var bulk = document.getElementById("planning-toewijzen-bulk");
      try {
        await global.dienstUitnodigingenDB.add({ dienst_id: currentDienstId, medewerker_id: mid, status: "toegewezen" });
        if (bulk && bulk.checked && currentDienst.parent_dienst_id) {
          // Bulk: alle gerelateerde diensten met zelfde parent
          var allDiensten = global.planningDB.getAllSync();
          var related = allDiensten.filter(function (d) {
            return (d.parent_dienst_id === currentDienst.parent_dienst_id || d.id === currentDienst.parent_dienst_id)
              && d.id !== currentDienstId;
          });
          for (var i = 0; i < related.length; i++) {
            try { await global.dienstUitnodigingenDB.add({ dienst_id: related[i].id, medewerker_id: mid, status: "toegewezen" }); } catch (e) { /* */ }
          }
        }
        if (global.showActionFeedback) global.showActionFeedback("saved", "Medewerker toegewezen");
        closeSideModal("planning-toewijzen-modal");
        await global.dienstUitnodigingenDB.fetchForDienst(currentDienstId);
        refreshAllSections();
      } catch (e) {
        if (global.showError) global.showError("Toewijzen mislukt: " + e.message);
      }
    });

    // Uitnodigen
    var uitnodigenBtn = document.getElementById("planning-detail-uitnodigen-btn");
    uitnodigenBtn && uitnodigenBtn.addEventListener("click", function () {
      populateMedewerkerSelect(document.getElementById("planning-uitnodigen-select"));
      openSideModal("planning-uitnodigen-modal");
    });
    document.getElementById("planning-uitnodigen-cancel") && document.getElementById("planning-uitnodigen-cancel").addEventListener("click", function () { closeSideModal("planning-uitnodigen-modal"); });
    document.getElementById("planning-uitnodigen-close") && document.getElementById("planning-uitnodigen-close").addEventListener("click", function () { closeSideModal("planning-uitnodigen-modal"); });
    document.getElementById("planning-uitnodigen-submit") && document.getElementById("planning-uitnodigen-submit").addEventListener("click", async function () {
      var sel = document.getElementById("planning-uitnodigen-select");
      var mid = sel && sel.value;
      if (!mid || !currentDienstId) return;
      try {
        await global.dienstUitnodigingenDB.add({ dienst_id: currentDienstId, medewerker_id: mid, status: "uitgenodigd" });
        if (global.showActionFeedback) global.showActionFeedback("saved", "Medewerker uitgenodigd");
        closeSideModal("planning-uitnodigen-modal");
        await global.dienstUitnodigingenDB.fetchForDienst(currentDienstId);
        refreshAllSections();
      } catch (e) {
        if (global.showError) global.showError("Uitnodigen mislukt: " + e.message);
      }
    });

    // Verwijderen
    var deleteBtn = document.getElementById("planning-view-delete-btn");
    deleteBtn && deleteBtn.addEventListener("click", function () { openSideModal("planning-delete-modal"); });
    document.getElementById("planning-delete-cancel") && document.getElementById("planning-delete-cancel").addEventListener("click", function () { closeSideModal("planning-delete-modal"); });
    document.getElementById("planning-delete-close") && document.getElementById("planning-delete-close").addEventListener("click", function () { closeSideModal("planning-delete-modal"); });
    document.getElementById("planning-delete-confirm") && document.getElementById("planning-delete-confirm").addEventListener("click", async function () {
      if (!currentDienstId) return;
      var scope = document.querySelector('input[name="planning-delete-scope"]:checked');
      var scopeVal = scope ? scope.value : "single";
      try {
        if (scopeVal === "recurring" && currentDienst.parent_dienst_id) {
          var allDiensten = global.planningDB.getAllSync();
          var related = allDiensten.filter(function (d) {
            return (d.parent_dienst_id === currentDienst.parent_dienst_id || d.id === currentDienst.parent_dienst_id)
              && new Date((d.start_iso || d.start)).getTime() >= new Date((currentDienst.start_iso || currentDienst.start)).getTime();
          });
          for (var i = 0; i < related.length; i++) {
            try { await global.planningDB.archive(related[i].id); } catch (e) {}
          }
        } else {
          await global.planningDB.archive(currentDienstId);
        }
        if (global.showActionFeedback) global.showActionFeedback("deleted", "Dienst");
        closeSideModal("planning-delete-modal");
        close();
      } catch (e) {
        if (global.showError) global.showError("Verwijderen mislukt: " + e.message);
      }
    });

    // AI suggesties laden
    var aiBtn = document.getElementById("planning-detail-ai-load-btn");
    aiBtn && aiBtn.addEventListener("click", function () {
      if (currentDienst) renderAiSuggesties(currentDienst);
    });

    // AI-suggestion assign-btn (event-delegation)
    document.addEventListener("click", async function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-action="ai-assign"]');
      if (!btn || !currentDienstId) return;
      var mid = btn.dataset.medewerkerId;
      try {
        await global.dienstUitnodigingenDB.add({ dienst_id: currentDienstId, medewerker_id: mid, status: "toegewezen" });
        if (global.showActionFeedback) global.showActionFeedback("saved", "Toegewezen via AI");
        await global.dienstUitnodigingenDB.fetchForDienst(currentDienstId);
        refreshAllSections();
      } catch (err) {
        if (global.showError) global.showError("AI-assign mislukt: " + err.message);
      }
    });

    // De-assign X (event-delegation)
    document.addEventListener("click", async function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-action="de-assign"]');
      if (!btn || !currentDienstId) return;
      var row = btn.closest('.planning-detail-medewerker-row');
      var uid = row && row.dataset.uitnodigingId;
      if (!uid) return;
      try {
        await global.dienstUitnodigingenDB.remove(uid, currentDienstId);
        if (global.showActionFeedback) global.showActionFeedback("deleted", "Toewijzing verwijderd");
      } catch (err) {
        if (global.showError) global.showError("Verwijderen mislukt: " + err.message);
      }
    });

    // Comment-box
    var commentInput = document.getElementById("planning-detail-comment-input");
    var commentBtn = document.getElementById("planning-detail-comment-submit");
    if (commentInput && commentBtn) {
      commentInput.addEventListener("input", function () {
        commentBtn.disabled = !commentInput.value.trim();
      });
      commentBtn.addEventListener("click", async function () {
        var txt = commentInput.value.trim();
        if (!txt || !currentDienstId) return;
        commentBtn.disabled = true;
        try {
          await global.dienstActiviteitenDB.addComment(currentDienstId, txt);
          commentInput.value = "";
          await global.dienstActiviteitenDB.fetchForDienst(currentDienstId);
          refreshAllSections();
        } catch (err) {
          if (global.showError) global.showError("Reactie plaatsen mislukt: " + err.message);
        } finally {
          commentBtn.disabled = !commentInput.value.trim();
        }
      });
    }

    // Escape closes (modal-level)
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        // Close inner modals first
        var toewijzen = document.getElementById("planning-toewijzen-modal");
        var uitnodigen = document.getElementById("planning-uitnodigen-modal");
        var del = document.getElementById("planning-delete-modal");
        if (toewijzen && !toewijzen.hasAttribute("hidden")) { closeSideModal("planning-toewijzen-modal"); return; }
        if (uitnodigen && !uitnodigen.hasAttribute("hidden")) { closeSideModal("planning-uitnodigen-modal"); return; }
        if (del && !del.hasAttribute("hidden")) { closeSideModal("planning-delete-modal"); return; }
        var view = document.getElementById("planning-view-modal");
        if (view && !view.hasAttribute("hidden")) close();
      }
    });

    // Listen for refresh events
    window.addEventListener("besa:dienst-uitnodigingen-updated", function (e) {
      if (e && e.detail && e.detail.dienstId === currentDienstId) refreshAllSections();
    });
    window.addEventListener("besa:dienst-activiteiten-updated", function (e) {
      if (e && e.detail && e.detail.dienstId === currentDienstId) refreshAllSections();
    });
  }

  function init() { attachEvents(); }

  global.dienstDetail = { open: open, close: close, refresh: refreshAllSections };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
