(function () {
  var CD_STORAGE_KEY = "comp_diensttypes_configs";

  /**
   * Vaste volgorde + labels: gelijk aan planning (Dienst aanmaken → diensttype meerkeuze).
   * Oude labels (MDO, 1 op 1, …) blijven matchen via partToDienstValue.
   */
  var DIENST_TYPES = [
    { value: "training", label: "Training", color: "#f97316" },
    { value: "boventallig", label: "Boventallig", color: "#9b8fd9" },
    { value: "vergadering", label: "Vergadering", color: "#8b2d3a" },
    { value: "waakdienst", label: "WAK-dienst", color: "#a8b892" },
    { value: "achterwacht", label: "Achterwacht", color: "#1e4d2b" },
    { value: "slaapdienst", label: "Slaapdienst", color: "#5c2d91" },
    { value: "late_dienst", label: "Late dienst", color: "#e63946" },
    { value: "tussendienst", label: "Tussendienst", color: "#d4b896" },
    { value: "vroege_dienst", label: "Vroege dienst", color: "#87ceeb" },
    { value: "mdo", label: "M, D, O", color: "#c4a4a4" },
    { value: "1_op_1", label: "Eén op één", color: "#4169e1" }
  ];

  var dienstMetaByValue = {};
  DIENST_TYPES.forEach(function (d) {
    dienstMetaByValue[d.value] = d;
  });

  var headerBtn = document.getElementById("cd-add-header-btn");
  var centerBtn = document.getElementById("cd-add-center-btn");
  var modal = document.getElementById("cd-config-modal");
  var closeBtn = document.getElementById("cd-config-close-btn");
  var cancelBtn = document.getElementById("cd-config-cancel-btn");
  var form = document.getElementById("cd-config-form");
  var selDienst = document.getElementById("cd-form-diensttype");
  var dienstDd = document.getElementById("cd-diensttype-dd");
  var dienstTrigger = document.getElementById("cd-diensttype-trigger");
  var dienstList = document.getElementById("cd-diensttype-listbox");
  var dienstTriggerDot = document.getElementById("cd-diensttype-trigger-dot");
  var dienstTriggerLabel = document.getElementById("cd-diensttype-trigger-label");
  var inpBasis = document.getElementById("cd-form-basis");
  var inpOver = document.getElementById("cd-form-overuren");
  var inpRegels = document.getElementById("cd-form-regels");
  var teamsDd = document.getElementById("cd-teams-dd");
  var teamsTrigger = document.getElementById("cd-teams-trigger");
  var teamsPanel = document.getElementById("cd-teams-panel");
  var teamsTriggerLabel = document.getElementById("cd-teams-trigger-label");
  var emptyState = document.getElementById("cd-empty-state");
  var listState = document.getElementById("cd-list-state");
  var tbody = document.getElementById("cd-tbody");
  var cdTable = document.getElementById("cd-table");

  var delModal = document.getElementById("cd-delete-modal");
  var delSlider = document.getElementById("cd-delete-slider");
  var delConfirmBtn = document.getElementById("cd-delete-confirm-btn");
  var delCancelBtn = document.getElementById("cd-delete-cancel-btn");
  var delCloseBtn = document.getElementById("cd-delete-close-btn");
  var delPreview = document.getElementById("cd-delete-preview");
  var deleteTargetId = null;

  function loadConfigs() {
    try {
      var raw = localStorage.getItem(CD_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(function (c, i) {
            if (!c.id) c.id = "cd_legacy_" + i;
          });
          return parsed;
        }
      }
    } catch (e) {
      console.warn("comp_diensttypes_configs:", e);
    }
    return [];
  }

  function saveConfigs(arr) {
    try {
      localStorage.setItem(CD_STORAGE_KEY, JSON.stringify(arr));
    } catch (e) {
      console.warn("saveConfigs:", e);
    }
  }

  var configs = loadConfigs();
  var sortKey = "";
  var sortDir = "asc";
  var currentPage = 0;
  var rowsSelect = document.getElementById("cd-rows-per-page");
  var rangeEl = document.getElementById("cd-pager-range");
  var pageEl = document.getElementById("cd-pager-page");

  function diensttypeLabel(value) {
    var m = dienstMetaByValue[value];
    return m ? m.label : value || "—";
  }

  function setDiensttypeValue(value) {
    if (selDienst) selDienst.value = value || "";
    var m = value ? dienstMetaByValue[value] : null;
    if (dienstTriggerLabel) {
      dienstTriggerLabel.textContent = m ? m.label : "Selecteer diensttype…";
    }
    if (dienstTriggerDot) {
      if (m) {
        dienstTriggerDot.hidden = false;
        dienstTriggerDot.style.backgroundColor = m.color;
      } else {
        dienstTriggerDot.hidden = true;
        dienstTriggerDot.style.backgroundColor = "";
      }
    }
    if (dienstList) {
      var opts = dienstList.querySelectorAll('[role="option"]');
      opts.forEach(function (li) {
        li.setAttribute("aria-selected", li.getAttribute("data-value") === value ? "true" : "false");
      });
    }
  }

  var dienstListOpen = false;
  var dienstOutsideClose = null;

  function closeDiensttypeList() {
    if (!dienstList || !dienstTrigger) return;
    dienstList.hidden = true;
    dienstTrigger.setAttribute("aria-expanded", "false");
    dienstListOpen = false;
    if (dienstOutsideClose) {
      document.removeEventListener("click", dienstOutsideClose, true);
      dienstOutsideClose = null;
    }
  }

  function openDiensttypeList() {
    if (!dienstList || !dienstTrigger || !dienstDd) return;
    closeTeamsList();
    dienstList.hidden = false;
    dienstTrigger.setAttribute("aria-expanded", "true");
    dienstListOpen = true;
    if (dienstOutsideClose) document.removeEventListener("click", dienstOutsideClose, true);
    dienstOutsideClose = function (e) {
      if (!dienstDd.contains(e.target)) closeDiensttypeList();
    };
    document.addEventListener("click", dienstOutsideClose, true);
  }

  function toggleDiensttypeList() {
    if (dienstListOpen) closeDiensttypeList();
    else openDiensttypeList();
  }

  function buildDiensttypeList() {
    if (!dienstList) return;
    dienstList.innerHTML = "";
    DIENST_TYPES.forEach(function (d) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("data-value", d.value);
      li.className = "cd-diensttype-option";
      li.tabIndex = -1;
      var dot = document.createElement("span");
      dot.className = "cd-diensttype-dot";
      dot.style.backgroundColor = d.color;
      dot.setAttribute("aria-hidden", "true");
      var lab = document.createElement("span");
      lab.className = "cd-diensttype-option-label";
      lab.textContent = d.label;
      li.appendChild(dot);
      li.appendChild(lab);
      li.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setDiensttypeValue(d.value);
        closeDiensttypeList();
        if (dienstTrigger) dienstTrigger.focus();
      });
      dienstList.appendChild(li);
    });
  }

  var TEAM_LABEL_LEGACY = {
    centrum: "Centrum",
    noord: "Noord",
    zuid: "Zuid"
  };

  /** Volgorde: screenshot, WLZ onderaan. */
  var TEAM_OPTIONS = [
    { value: "zijperstraat", label: "Zijperstraat" },
    { value: "voorburggracht", label: "Voorburggracht" },
    { value: "varnebroek", label: "Varnebroek" },
    { value: "magdalenenstraat", label: "Magdalenenstraat" },
    { value: "breedstraat", label: "Breedstraat" },
    { value: "leonard_bramerstraat", label: "Leonard Bramerstraat" },
    { value: "achterwacht", label: "Achterwacht" },
    { value: "ambulant_extern", label: "Ambulant Extern" },
    { value: "wlz", label: "WLZ" }
  ];

  var teamOptionLabelByValue = {};
  TEAM_OPTIONS.forEach(function (o) {
    teamOptionLabelByValue[o.value] = o.label;
  });

  function teamOptionLabel(v) {
    if (teamOptionLabelByValue[v]) return teamOptionLabelByValue[v];
    if (TEAM_LABEL_LEGACY[v]) return TEAM_LABEL_LEGACY[v];
    return v;
  }

  function teamLabel(value) {
    if (value == null || value === "") return "—";
    if (Array.isArray(value)) {
      if (value.length === 0) return "—";
      return value.map(teamOptionLabel).join(", ");
    }
    return teamOptionLabel(value);
  }

  var teamsListOpen = false;
  var teamsOutsideClose = null;

  function getSelectedTeamValues() {
    if (!teamsPanel) return [];
    var out = [];
    teamsPanel.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      if (cb.checked) out.push(cb.value);
    });
    return out;
  }

  function syncTeamsTriggerLabel() {
    if (!teamsTriggerLabel) return;
    var vals = getSelectedTeamValues();
    if (vals.length === 0) {
      teamsTriggerLabel.textContent = "Selecteer team beperkingen (optioneel)…";
      return;
    }
    teamsTriggerLabel.textContent = vals.map(teamOptionLabel).join(", ");
  }

  function setTeamCheckboxes(values) {
    var set = {};
    if (Array.isArray(values)) values.forEach(function (v) {
      set[v] = true;
    });
    else if (values) set[values] = true;
    if (!teamsPanel) return;
    teamsPanel.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.checked = !!set[cb.value];
    });
    syncTeamsTriggerLabel();
  }

  function closeTeamsList() {
    if (!teamsPanel || !teamsTrigger) return;
    teamsPanel.hidden = true;
    teamsTrigger.setAttribute("aria-expanded", "false");
    teamsListOpen = false;
    if (teamsOutsideClose) {
      document.removeEventListener("click", teamsOutsideClose, true);
      teamsOutsideClose = null;
    }
  }

  function openTeamsList() {
    if (!teamsPanel || !teamsTrigger || !teamsDd) return;
    closeDiensttypeList();
    teamsPanel.hidden = false;
    teamsTrigger.setAttribute("aria-expanded", "true");
    teamsListOpen = true;
    if (teamsOutsideClose) document.removeEventListener("click", teamsOutsideClose, true);
    teamsOutsideClose = function (e) {
      if (!teamsDd.contains(e.target)) closeTeamsList();
    };
    document.addEventListener("click", teamsOutsideClose, true);
  }

  function toggleTeamsList() {
    if (teamsListOpen) closeTeamsList();
    else openTeamsList();
  }

  function buildTeamsPanel() {
    if (!teamsPanel) return;
    teamsPanel.innerHTML = "";
    TEAM_OPTIONS.forEach(function (o) {
      var lab = document.createElement("label");
      lab.className = "cd-diensttype-option cd-teams-option";
      var inp = document.createElement("input");
      inp.type = "checkbox";
      inp.value = o.value;
      inp.addEventListener("change", syncTeamsTriggerLabel);
      var span = document.createElement("span");
      span.className = "cd-diensttype-option-label";
      span.textContent = o.label;
      lab.appendChild(inp);
      lab.appendChild(span);
      teamsPanel.appendChild(lab);
    });
  }

  function fmtMult(v) {
    var n = parseFloat(String(v).replace(",", "."));
    if (!isFinite(n)) return String(v);
    var s = String(Math.round(n * 100) / 100);
    return s.replace(".", ",");
  }

  function getSortVal(c, key) {
    if (key === "diensttype") return diensttypeLabel(c.diensttype).toLowerCase();
    if (key === "basis") return Number(c.basis);
    if (key === "overuren") return Number(c.overuren);
    if (key === "regels") return String(c.regels || "").toLowerCase();
    if (key === "teams") return teamLabel(c.teams).toLowerCase();
    return "";
  }

  function sortedConfigs() {
    var list = configs.slice();
    if (!sortKey) return list;
    var numCol = sortKey === "basis" || sortKey === "overuren";
    list.sort(function (a, b) {
      var av = getSortVal(a, sortKey);
      var bv = getSortVal(b, sortKey);
      if (numCol) {
        av = isFinite(Number(av)) ? Number(av) : 0;
        bv = isFinite(Number(bv)) ? Number(bv) : 0;
      }
      var cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }

  function syncSortHeaders() {
    if (!cdTable) return;
    cdTable.querySelectorAll("thead th.th-sort").forEach(function (th) {
      th.classList.remove("th-sort--asc", "th-sort--desc");
      if (sortKey && th.dataset.col === sortKey) {
        th.classList.add(sortDir === "desc" ? "th-sort--desc" : "th-sort--asc");
      }
    });
  }

  function syncEmptyList() {
    var has = configs.length > 0;
    if (emptyState) emptyState.hidden = has;
    if (listState) listState.hidden = !has;
  }

  function getPageSize() {
    return parseInt(rowsSelect ? rowsSelect.value : "15", 10) || 15;
  }

  function clampCdPage() {
    var items = sortedConfigs();
    var total = items.length;
    var pageSize = getPageSize();
    var totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (currentPage >= totalPages) currentPage = Math.max(0, totalPages - 1);
    if (currentPage < 0) currentPage = 0;
  }

  function syncPager() {
    clampCdPage();
    var items = sortedConfigs();
    var pageSize = getPageSize();
    var total = items.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    var start = currentPage * pageSize;
    var onPage = total === 0 ? 0 : Math.min(pageSize, total - start);
    if (rangeEl) {
      rangeEl.textContent = total === 0 ? "0 of 0 total." : onPage + " of " + total + " total.";
    }
    if (pageEl) pageEl.textContent = "Page " + (currentPage + 1) + " of " + totalPages;
    var first = document.getElementById("cd-pager-first");
    var prev = document.getElementById("cd-pager-prev");
    var next = document.getElementById("cd-pager-next");
    var last = document.getElementById("cd-pager-last");
    var atFirst = currentPage <= 0 || total === 0;
    var atLast = currentPage >= totalPages - 1 || total === 0;
    if (first) first.disabled = atFirst;
    if (prev) prev.disabled = atFirst;
    if (next) next.disabled = atLast;
    if (last) last.disabled = atLast;
  }

  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = "";
    clampCdPage();
    var items = sortedConfigs();
    var pageSize = getPageSize();
    var start = currentPage * pageSize;
    var pageRows = items.slice(start, start + pageSize);
    pageRows.forEach(function (c) {
      var tr = document.createElement("tr");
      var td1 = document.createElement("td");
      td1.dataset.col = "diensttype";
      td1.className = "cd-type-table-dienst";
      var meta = dienstMetaByValue[c.diensttype];
      if (meta) {
        var dot = document.createElement("span");
        dot.className = "cd-diensttype-dot cd-diensttype-dot--table";
        dot.style.backgroundColor = meta.color;
        dot.setAttribute("aria-hidden", "true");
        td1.appendChild(dot);
        td1.appendChild(document.createTextNode("\u00a0"));
      }
      td1.appendChild(document.createTextNode(diensttypeLabel(c.diensttype)));
      tr.appendChild(td1);
      var td2 = document.createElement("td");
      td2.dataset.col = "basis";
      td2.textContent = fmtMult(c.basis);
      tr.appendChild(td2);
      var td3 = document.createElement("td");
      td3.dataset.col = "overuren";
      td3.textContent = fmtMult(c.overuren);
      tr.appendChild(td3);
      var td4 = document.createElement("td");
      td4.dataset.col = "regels";
      td4.textContent = c.regels || "—";
      tr.appendChild(td4);
      var td5 = document.createElement("td");
      td5.dataset.col = "teams";
      td5.textContent = teamLabel(c.teams);
      tr.appendChild(td5);
      var tdAct = document.createElement("td");
      tdAct.dataset.col = "acties";
      tdAct.className = "cd-type-td-acties";
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "cd-type-delete-btn";
      delBtn.setAttribute("aria-label", "Configuratie verwijderen");
      delBtn.setAttribute("data-config-id", c.id || "");
      delBtn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
      tdAct.appendChild(delBtn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    syncPager();
  }

  var PLANNING_ITEMS_KEY = "planningItems";

  function partToDienstValue(part) {
    var t = (part || "").trim();
    if (!t) return null;
    var i;
    var lower = t.toLowerCase();
    for (i = 0; i < DIENST_TYPES.length; i++) {
      var d = DIENST_TYPES[i];
      if (d.value === t) return d.value;
      if (d.label.toLowerCase() === lower) return d.value;
    }
    if (lower === "mdo") return "mdo";
    if (lower === "1 op 1") return "1_op_1";
    if (lower === "waakdienst") return "waakdienst";
    if (lower === "wak-dienst" || lower === "wak dienst") return "waakdienst";
    if (lower === "slapdienst" || lower === "slaapdienst") return "slaapdienst";
    return null;
  }

  function planningNamenVoorDiensttypeValue(dienstValue) {
    if (!dienstValue) return [];
    var items = [];
    try {
      var raw = localStorage.getItem(PLANNING_ITEMS_KEY);
      if (raw) items = JSON.parse(raw);
      if (!Array.isArray(items)) return [];
    } catch (e) {
      return [];
    }
    var out = new Set();
    items.forEach(function (it) {
      var s = String((it && it.diensttype) || "");
      s.split(/,\s*/).forEach(function (part) {
        if (partToDienstValue(part) === dienstValue) {
          var tm = (it.teamlid || "").trim() || "—";
          if (tm) out.add(tm);
        }
      });
    });
    return Array.from(out).sort();
  }

  function nochAndereConfigVoorZelfdeDiensttype(alleConfigs, uitsluitenId, dienstValue) {
    if (!dienstValue) return false;
    return alleConfigs.some(function (c) {
      return c && c.id !== uitsluitenId && c.diensttype === dienstValue;
    });
  }

  function deleteConfigById(id) {
    if (!id) return;
    var next = configs.filter(function (c) {
      return c.id !== id;
    });
    if (next.length === configs.length) return;
    configs = next;
    saveConfigs(configs);
    render();
  }

  function syncCdDelSlider() {
    if (!delSlider) return;
    var v = Math.min(100, Math.max(0, parseInt(delSlider.value, 10) || 0));
    delSlider.value = String(v);
    delSlider.style.setProperty("--employee-slider-pct", v + "%");
    delSlider.setAttribute("aria-valuenow", String(v));
    if (delConfirmBtn) delConfirmBtn.disabled = v < 100;
  }

  function resetCdDelSlider() {
    if (delSlider) {
      delSlider.value = "0";
      syncCdDelSlider();
    }
  }

  function openCdDeleteModal(id, previewLabel) {
    deleteTargetId = id;
    if (delPreview) delPreview.textContent = previewLabel || "";
    resetCdDelSlider();
    if (delModal) {
      delModal.removeAttribute("hidden");
      delModal.setAttribute("aria-hidden", "false");
    }
  }

  function closeCdDeleteModal() {
    if (delModal) {
      delModal.setAttribute("hidden", "");
      delModal.setAttribute("aria-hidden", "true");
    }
    deleteTargetId = null;
    resetCdDelSlider();
    if (delPreview) delPreview.textContent = "";
  }

  function confirmCdDelete() {
    if (!deleteTargetId || (delConfirmBtn && delConfirmBtn.disabled)) return;
    var row = configs.find(function (c) {
      return c.id === deleteTargetId;
    });
    if (!row) {
      closeCdDeleteModal();
      return;
    }
    var wouldRemoveLast = !nochAndereConfigVoorZelfdeDiensttype(configs, deleteTargetId, row.diensttype);
    if (wouldRemoveLast) {
      var lab = diensttypeLabel(row.diensttype);
      var namen = planningNamenVoorDiensttypeValue(row.diensttype);
      if (namen.length) {
        window.alert(
          "Dit diensttype is nog in gebruik in de planning. Verwijderen is niet mogelijk totdat dat is opgelost.\n\n" +
            "Geplande medewerker(s) met type \"" +
            lab +
            '":\n' +
            namen.join(", ") +
            "\n\n" +
            "Wijzig of verwijder de betreffende diensten in de planning, of wijs een ander diensttype toe."
        );
        return;
      }
    }
    deleteConfigById(deleteTargetId);
    closeCdDeleteModal();
  }

  if (delSlider) {
    delSlider.addEventListener("input", syncCdDelSlider);
    delSlider.addEventListener("change", syncCdDelSlider);
  }
  if (delConfirmBtn) delConfirmBtn.addEventListener("click", confirmCdDelete);
  if (delCancelBtn) delCancelBtn.addEventListener("click", closeCdDeleteModal);
  if (delCloseBtn) delCloseBtn.addEventListener("click", closeCdDeleteModal);
  if (delModal) {
    delModal.addEventListener("click", function (e) {
      if (e.target === delModal) closeCdDeleteModal();
    });
  }
  syncCdDelSlider();

  function render() {
    syncEmptyList();
    renderTable();
    syncSortHeaders();
  }

  function closeAllCdSortMenus() {
    if (!cdTable) return;
    cdTable.querySelectorAll(".th-sort-menu").forEach(function (menu) {
      menu.setAttribute("hidden", "");
      menu.classList.remove("cd-sort-menu--fixed");
      menu.style.position = "";
      menu.style.left = "";
      menu.style.top = "";
      menu.style.minWidth = "";
      menu.style.zIndex = "";
    });
    cdTable.querySelectorAll("thead th.th-sort").forEach(function (th) {
      th.classList.remove("th-sort-open");
    });
  }

  function openCdSortMenu(menu, triggerBtn) {
    closeAllCdSortMenus();
    if (!menu || !triggerBtn) return;
    var r = triggerBtn.getBoundingClientRect();
    var w = Math.max(140, r.width);
    menu.removeAttribute("hidden");
    menu.classList.add("cd-sort-menu--fixed");
    menu.style.position = "fixed";
    var left = Math.min(r.left, window.innerWidth - w - 12);
    menu.style.left = Math.max(8, left) + "px";
    menu.style.top = r.bottom + 2 + "px";
    menu.style.minWidth = w + "px";
    menu.style.zIndex = "10001";
    var th = triggerBtn.closest("th");
    if (th) th.classList.add("th-sort-open");
  }

  function resetForm() {
    if (form) form.reset();
    if (inpBasis) inpBasis.value = "1";
    if (inpOver) inpOver.value = "1,5";
    if (inpRegels) inpRegels.value = "full_time_only";
    setDiensttypeValue("");
    closeDiensttypeList();
    setTeamCheckboxes([]);
    closeTeamsList();
  }

  function openModal() {
    if (!modal) return;
    resetForm();
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    if (dienstTrigger) dienstTrigger.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    resetForm();
  }

  function onAddClick() {
    openModal();
  }

  if (headerBtn) headerBtn.addEventListener("click", onAddClick);
  if (centerBtn) centerBtn.addEventListener("click", onAddClick);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && cdTable) {
      var menus = cdTable.querySelectorAll(".th-sort-menu");
      var hadOpen = false;
      menus.forEach(function (m) {
        if (!m.hasAttribute("hidden")) hadOpen = true;
      });
      if (hadOpen) {
        closeAllCdSortMenus();
        e.stopPropagation();
        return;
      }
    }
    if (e.key === "Escape" && delModal && !delModal.hasAttribute("hidden")) {
      closeCdDeleteModal();
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape" && teamsListOpen) {
      closeTeamsList();
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape" && dienstListOpen) {
      closeDiensttypeList();
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape" && modal && modal.style.display === "flex") closeModal();
  });

  if (tbody) {
    tbody.addEventListener("click", function (e) {
      var btn = e.target.closest(".cd-type-delete-btn");
      if (!btn || !tbody.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      var id = btn.getAttribute("data-config-id");
      if (!id) return;
      var row = configs.find(function (c) {
        return c.id === id;
      });
      var label = diensttypeLabel(row ? row.diensttype : "");
      openCdDeleteModal(id, label);
    });
  }

  document.addEventListener("click", function () {
    closeAllCdSortMenus();
  });

  document.addEventListener("scroll", closeAllCdSortMenus, true);

  window.addEventListener("resize", closeAllCdSortMenus);

  if (cdTable) {
    cdTable.querySelectorAll(".th-sort-trigger").forEach(function (trigger) {
      trigger.addEventListener("click", function (e) {
        e.stopPropagation();
        var th = trigger.closest("th");
        var menu = th ? th.querySelector(".th-sort-menu") : null;
        if (!menu) return;
        var wasHidden = menu.hasAttribute("hidden");
        if (!wasHidden) {
          closeAllCdSortMenus();
          return;
        }
        openCdSortMenu(menu, trigger);
      });
    });

    cdTable.querySelectorAll(".th-sort-opt").forEach(function (opt) {
      opt.addEventListener("click", function (e) {
        e.stopPropagation();
        var action = opt.dataset.action;
        var th = opt.closest("th");
        var colId = th ? th.dataset.col : null;
        if (!colId) return;
        sortKey = colId;
        sortDir = action === "desc" ? "desc" : "asc";
        currentPage = 0;
        closeAllCdSortMenus();
        render();
      });
    });
  }

  ["first", "prev", "next", "last"].forEach(function (action) {
    var btn = document.getElementById("cd-pager-" + action);
    if (!btn) return;
    btn.addEventListener("click", function () {
      var items = sortedConfigs();
      var pageSize = getPageSize();
      var total = items.length;
      var totalPages = Math.max(1, Math.ceil(total / pageSize));
      if (action === "first") currentPage = 0;
      else if (action === "prev") currentPage = Math.max(0, currentPage - 1);
      else if (action === "next") currentPage = Math.min(totalPages - 1, currentPage + 1);
      else if (action === "last") currentPage = totalPages - 1;
      render();
    });
  });

  if (rowsSelect) {
    rowsSelect.addEventListener("change", function () {
      currentPage = 0;
      render();
    });
  }

  buildDiensttypeList();
  buildTeamsPanel();
  if (teamsTrigger) {
    teamsTrigger.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleTeamsList();
    });
  }
  if (dienstTrigger) {
    dienstTrigger.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleDiensttypeList();
    });
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var dt = selDienst ? selDienst.value : "";
      if (!dt) {
        if (dienstTrigger) dienstTrigger.focus();
        return;
      }
      var basisStr = inpBasis ? inpBasis.value.trim().replace(",", ".") : "";
      var overStr = inpOver ? inpOver.value.trim().replace(",", ".") : "";
      var basis = parseFloat(basisStr);
      var overuren = parseFloat(overStr);
      if (!isFinite(basis) || basis <= 0) {
        if (inpBasis) inpBasis.focus();
        return;
      }
      if (!isFinite(overuren) || overuren <= 0) {
        if (inpOver) inpOver.focus();
        return;
      }
      var regels = inpRegels ? inpRegels.value.trim() : "";
      var teams = getSelectedTeamValues();

      configs.push({
        id: "cd_" + Date.now(),
        diensttype: dt,
        basis: basis,
        overuren: overuren,
        regels: regels || "full_time_only",
        teams: teams
      });
      saveConfigs(configs);
      var ps = getPageSize();
      currentPage = Math.max(0, Math.ceil(configs.length / ps) - 1);
      closeModal();
      render();
    });
  }

  render();
})();
