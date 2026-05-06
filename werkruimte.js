const MODULE_CONFIG = {
  urenregistratie: {
    title: "Urenregistratie",
    subtitle: "Geregistreerde uren en labels",
    key: "workspace_urenregistratie",
    seed: [
      { naam: "Weekregistratie team Noord", status: "Actief" },
      { naam: "Urencontrole nachtdienst", status: "Concept" },
      { naam: "Label update: Ambulant extern", status: "Afgerond" },
    ],
  },
  clienten: {
    title: "Cliënten",
    subtitle: "Cliëntbeheer en overzicht",
    key: "workspace_clienten",
    useBureausAsSource: false,
    seed: [],
  },
  zorgsoorten: {
    title: "Zorgsoorten",
    subtitle: "Beheer zorgsoorten",
    key: "workspace_zorgsoorten",
    useBureausAsSource: false,
    seed: [],
  },
  beschikkingen: {
    title: "Beschikkingen",
    subtitle: "Beheer beschikkingen",
    key: "workspace_beschikkingen",
    useBureausAsSource: false,
    seed: [],
  },
  incidenten: {
    title: "Incidenten",
    subtitle: "Incidenten overzicht",
    key: "workspace_incidenten",
    useBureausAsSource: false,
    seed: [],
  },
  kilometers: {
    title: "Kilometers",
    subtitle: "Kilometerdeclaraties en overzichten",
    key: "workspace_kilometers",
    seed: [
      { naam: "Declaraties week 16", status: "Actief" },
      { naam: "Routekosten controle regio Noord", status: "Concept" },
    ],
  },
  taken: {
    title: "Taken",
    subtitle: "Openstaande taken en opvolging",
    key: "workspace_taken",
    seed: [
      { naam: "Controle contractverlenging", status: "Actief" },
      { naam: "Bel client voor evaluatiegesprek", status: "Concept" },
    ],
  },
  verlof: {
    title: "Verlof",
    subtitle: "Verlofaanvragen en statusbeheer",
    key: "workspace_verlof",
    seed: [
      { naam: "Aanvraag zomervakantie team Zuid", status: "Actief" },
      { naam: "Controle ziekmelding dossier", status: "Concept" },
    ],
  },
  beleid: {
    title: "Beleid",
    subtitle: "Beleidsdocumenten en actiepunten",
    key: "workspace_beleid",
    seed: [
      { naam: "Update veiligheidsprotocol BHV", status: "Actief" },
      { naam: "Review AVG-richtlijn", status: "Afgerond" },
    ],
  },
  audit: {
    title: "Audit",
    subtitle: "Auditacties en bevindingen",
    key: "workspace_audit",
    seed: [
      { naam: "Interne audit Q2", status: "Actief" },
      { naam: "Opvolging verbeterpunten", status: "Concept" },
    ],
  },
  organisatie: {
    title: "Organisatie",
    subtitle: "Rollen, teams en organisatiestructuur",
    key: "workspace_organisatie",
    seed: [
      { naam: "Nieuwe teamstructuur 2026", status: "Actief" },
      { naam: "Rolmatrix actualiseren", status: "Concept" },
    ],
  },
  instellingen: {
    title: "Instellingen",
    subtitle: "Systeeminstellingen en configuratie",
    key: "workspace_instellingen",
    seed: [
      { naam: "Notificaties aanpassen", status: "Actief" },
      { naam: "Gebruikersrechten check", status: "Concept" },
    ],
  },
};
const uiState = {
  showArchived: false,
  selectedIds: new Set(),
  pendingArchiveId: "",
  pendingPurgeId: "",
};

function getModuleKeyFromHash() {
  const hash = (window.location.hash || "").replace(/^#/, "").toLowerCase().trim();
  if (MODULE_CONFIG[hash]) return hash;
  return "urenregistratie";
}

function formatNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function showAppToast(message) {
  if (!message) return;
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "app-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showAppToast._timer);
  showAppToast._timer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function getCurrentUserName() {
  try {
    const explicit = (window.localStorage.getItem("currentUserName") || "").trim();
    if (explicit) return explicit;
    const selectedRaw = window.sessionStorage.getItem("selectedEmployee");
    if (selectedRaw) {
      const selected = JSON.parse(selectedRaw);
      const first = String(selected?.voornaam || "").trim();
      const last = String(selected?.achternaam || "").trim();
      const full = `${first} ${last}`.trim();
      if (full) return full;
      if (first) return first;
    }
  } catch {
    // Ignore malformed values.
  }
  return "HR team";
}

function readJsonArray(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readBureauClientNames() {
  return readJsonArray("hr_bureaus")
    .filter((x) => !x.archived)
    .map((x) => String(x.naam || "").trim())
    .filter(Boolean);
}

function normalizeWorkspaceItem(item) {
  if (!item || typeof item !== "object") return null;
  const naam = String(item.naam || item.name || "").trim();
  if (!naam) return null;
  const status = String(item.status || "Actief").trim() || "Actief";
  const updatedAt = String(item.updatedAt || formatNow()).trim() || formatNow();
  const updatedBy = String(item.updatedBy || getCurrentUserName()).trim() || getCurrentUserName();
  const archived = item.archived === true;
  const id = String(item.id || `${Date.now()}-${Math.random()}`);
  return { id, naam, status, updatedAt, updatedBy, archived };
}

function readModuleItems(moduleKey) {
  const cfg = MODULE_CONFIG[moduleKey];
  if (!cfg) return [];
  const stored = readJsonArray(cfg.key).map(normalizeWorkspaceItem).filter(Boolean);
  if (stored.length > 0) {
    return stored;
  }

  const seed = [];
  if (cfg.useBureausAsSource) {
    readBureauClientNames().forEach((name) => {
      seed.push({
        id: `${Date.now()}-${Math.random()}`,
        naam: name,
        status: "Actief",
        updatedAt: formatNow(),
        updatedBy: getCurrentUserName(),
        archived: false,
      });
    });
  }
  if (seed.length === 0) {
    (cfg.seed || []).forEach((item) => {
      seed.push({
        id: `${Date.now()}-${Math.random()}`,
        naam: String(item?.naam || "").trim(),
        status: String(item?.status || "Actief").trim() || "Actief",
        updatedAt: formatNow(),
        updatedBy: getCurrentUserName(),
        archived: false,
      });
    });
  }
  writeModuleItems(moduleKey, seed);
  return seed.map(normalizeWorkspaceItem).filter(Boolean);
}

function writeModuleItems(moduleKey, items) {
  const cfg = MODULE_CONFIG[moduleKey];
  if (!cfg) return;
  try {
    window.localStorage.setItem(cfg.key, JSON.stringify(items));
  } catch {
    // Ignore storage errors in demo mode.
  }
}

function syncClientModuleFromBureaus(items) {
  const byName = new Map(items.map((item) => [item.naam.toLowerCase(), item]));
  const bureauNames = readBureauClientNames();
  let changed = false;
  bureauNames.forEach((name) => {
    const key = name.toLowerCase();
    if (!byName.has(key)) {
      changed = true;
      items.unshift({
        id: `${Date.now()}-${Math.random()}`,
        naam: name,
        status: "Actief",
        updatedAt: formatNow(),
        updatedBy: getCurrentUserName(),
        archived: false,
      });
    }
  });
  return changed;
}

function statusClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "afgerond") return "workspace-status workspace-status--done";
  if (normalized === "concept") return "workspace-status workspace-status--draft";
  return "workspace-status workspace-status--active";
}

function getFilteredItems(moduleKey, search = "") {
  const allItems = readModuleItems(moduleKey);
  const scoped = allItems.filter((item) => (uiState.showArchived ? item.archived : !item.archived));
  const q = (search || "").trim().toLowerCase();
  const visible = scoped.filter((item) =>
    `${item.naam} ${item.status} ${item.updatedAt} ${item.updatedBy}`.toLowerCase().includes(q)
  );
  return { allItems, visible };
}

function renderWorkspace(moduleKey, search = "") {
  const cfg = MODULE_CONFIG[moduleKey];
  if (!cfg) return;
  const { allItems, visible } = getFilteredItems(moduleKey, search);

  const title = document.getElementById("workspace-title");
  const subtitle = document.getElementById("workspace-subtitle");
  const counter = document.getElementById("workspace-counter");
  const stats = document.getElementById("workspace-stats");
  const tbody = document.getElementById("workspace-table-body");
  const empty = document.getElementById("workspace-empty");
  const addTitle = document.getElementById("workspace-add-title");
  const bulkArchiveBtn = document.getElementById("workspace-bulk-archive-btn");
  const bulkRestoreBtn = document.getElementById("workspace-bulk-restore-btn");
  const selectAll = document.getElementById("workspace-select-all");
  const archivedToggle = document.getElementById("workspace-show-archived");
  const selectedVisible = visible.filter((x) => uiState.selectedIds.has(x.id));
  const allSelectedVisible = visible.length > 0 && selectedVisible.length === visible.length;
  const hasArchivedInSelection = selectedVisible.some((x) => x.archived);
  const hasActiveInSelection = selectedVisible.some((x) => !x.archived);

  if (title) title.textContent = cfg.title;
  if (subtitle) subtitle.textContent = cfg.subtitle;
  if (counter) counter.textContent = `${visible.length} records`;
  if (addTitle) addTitle.textContent = `${cfg.title}: item toevoegen`;
  if (archivedToggle) archivedToggle.checked = uiState.showArchived;
  if (selectAll) {
    selectAll.checked = allSelectedVisible;
    selectAll.indeterminate = selectedVisible.length > 0 && !allSelectedVisible;
  }
  if (bulkArchiveBtn) bulkArchiveBtn.disabled = !hasActiveInSelection;
  if (bulkRestoreBtn) bulkRestoreBtn.disabled = !hasArchivedInSelection;

  if (stats) {
    const active = allItems.filter((x) => x.status === "Actief").length;
    const draft = allItems.filter((x) => x.status === "Concept").length;
    const done = allItems.filter((x) => x.status === "Afgerond").length;
    const archived = allItems.filter((x) => x.archived).length;
    stats.innerHTML = "";
    [
      { label: "Actief", value: active },
      { label: "Concept", value: draft },
      { label: "Afgerond", value: done },
      { label: "Gearchiveerd", value: archived },
      { label: "Totaal", value: allItems.length },
    ].forEach((card) => {
      const el = document.createElement("div");
      el.className = "workspace-stat";
      el.innerHTML = `<span class="workspace-stat-label">${card.label}</span><strong class="workspace-stat-value">${card.value}</strong>`;
      stats.appendChild(el);
    });
  }

  if (!tbody || !empty) return;
  tbody.innerHTML = "";
  const archivedView = uiState.showArchived;
  const trashIcon =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>';
  visible.forEach((item) => {
    const tr = document.createElement("tr");
    const actionCell = archivedView
      ? `<td class="workspace-trash-cell">
          <div class="hr-row-actions">
            <button type="button" class="btn-outline hr-restore-btn" data-id="${item.id}">Herstel</button>
            <button type="button" class="employee-delete-btn workspace-purge-btn" data-id="${item.id}" aria-label="Definitief verwijderen">${trashIcon}</button>
          </div>
        </td>`
      : `<td class="workspace-trash-cell">
          <button type="button" class="employee-delete-btn" data-id="${item.id}" aria-label="Item archiveren">${trashIcon}</button>
        </td>`;
    tr.innerHTML = `
      <td><input type="checkbox" class="table-checkbox workspace-row-check" data-id="${item.id}" ${uiState.selectedIds.has(item.id) ? "checked" : ""} aria-label="Selecteer rij" /></td>
      <td>${item.naam || "—"}</td>
      <td><span class="${statusClass(item.status)}">${item.status || "—"}</span></td>
      <td>${item.updatedAt || "—"}</td>
      <td>${item.updatedBy || "—"}</td>
      ${actionCell}
    `;
    tbody.appendChild(tr);
  });
  empty.textContent = `Geen items gevonden voor ${cfg.title}.`;
  empty.hidden = visible.length > 0;
}

function initModal(getModuleKey, onChanged) {
  const modal = document.getElementById("workspace-add-modal");
  const openBtn = document.getElementById("workspace-add-btn");
  const closeBtn = document.getElementById("workspace-add-close-btn");
  const cancelBtn = document.getElementById("workspace-add-cancel-btn");
  const form = document.getElementById("workspace-add-form");
  const nameInput = document.getElementById("workspace-item-name");
  const statusInput = document.getElementById("workspace-item-status");
  if (!modal || !form || !nameInput || !statusInput) return;

  function open() {
    modal.removeAttribute("hidden");
    modal.setAttribute("aria-hidden", "false");
    nameInput.focus();
  }
  function close() {
    modal.setAttribute("hidden", "");
    modal.setAttribute("aria-hidden", "true");
    form.reset();
  }

  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  cancelBtn?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const moduleKey = getModuleKey();
    const name = nameInput.value.trim();
    const status = statusInput.value.trim() || "Actief";
    if (!name) return;
    const items = readModuleItems(moduleKey);
    items.unshift({
      id: `${Date.now()}-${Math.random()}`,
      naam: name,
      status,
      updatedAt: formatNow(),
      updatedBy: getCurrentUserName(),
      archived: false,
    });
    writeModuleItems(moduleKey, items);
    onChanged();
    showAppToast("Item toegevoegd");
    close();
  });
}

function initWerkruimte() {
  let currentModule = getModuleKeyFromHash();

  function closeArchiveModal() {
    const modal = document.getElementById("workspace-archive-modal");
    const slider = document.getElementById("workspace-archive-slider");
    const confirm = document.getElementById("workspace-archive-confirm-btn");
    const preview = document.getElementById("workspace-archive-preview");
    uiState.pendingArchiveId = "";
    if (modal) {
      modal.setAttribute("hidden", "");
      modal.setAttribute("aria-hidden", "true");
    }
    if (slider) {
      slider.value = "0";
      slider.style.setProperty("--employee-slider-pct", "0%");
      slider.setAttribute("aria-valuenow", "0");
    }
    if (confirm) confirm.disabled = true;
    if (preview) preview.textContent = "";
  }

  function syncArchiveSlider() {
    const slider = document.getElementById("workspace-archive-slider");
    const confirm = document.getElementById("workspace-archive-confirm-btn");
    if (!slider || !confirm) return;
    const v = Math.min(100, Math.max(0, parseInt(slider.value, 10) || 0));
    slider.value = String(v);
    slider.style.setProperty("--employee-slider-pct", `${v}%`);
    slider.setAttribute("aria-valuenow", String(v));
    confirm.disabled = v < 100;
  }

  function openArchiveModal(id) {
    const item = readModuleItems(currentModule).find((x) => x.id === id);
    if (!item) return;
    uiState.pendingArchiveId = id;
    const modal = document.getElementById("workspace-archive-modal");
    const preview = document.getElementById("workspace-archive-preview");
    const slider = document.getElementById("workspace-archive-slider");
    if (preview) preview.textContent = item.naam || "—";
    if (slider) {
      slider.value = "0";
      syncArchiveSlider();
    }
    if (modal) {
      modal.removeAttribute("hidden");
      modal.setAttribute("aria-hidden", "false");
      window.setTimeout(() => document.getElementById("workspace-archive-cancel-btn")?.focus(), 30);
    }
  }

  function confirmArchive() {
    if (!uiState.pendingArchiveId) return;
    const slider = document.getElementById("workspace-archive-slider");
    if (Number(slider?.value || 0) < 100) return;
    const id = uiState.pendingArchiveId;
    const items = readModuleItems(currentModule).map((item) => {
      if (item.id !== id) return item;
      return { ...item, archived: true, updatedAt: formatNow(), updatedBy: getCurrentUserName() };
    });
    writeModuleItems(currentModule, items);
    uiState.selectedIds.delete(id);
    closeArchiveModal();
    rerender();
    showAppToast("Item gearchiveerd");
  }

  function closePurgeModal() {
    uiState.pendingPurgeId = "";
    const modal = document.getElementById("workspace-purge-modal");
    const slider = document.getElementById("workspace-purge-slider");
    const confirm = document.getElementById("workspace-purge-confirm-btn");
    const preview = document.getElementById("workspace-purge-preview");
    if (modal) {
      modal.setAttribute("hidden", "");
      modal.setAttribute("aria-hidden", "true");
    }
    if (slider) {
      slider.value = "0";
      slider.style.setProperty("--employee-slider-pct", "0%");
      slider.setAttribute("aria-valuenow", "0");
    }
    if (confirm) confirm.disabled = true;
    if (preview) preview.textContent = "";
  }

  function syncPurgeSlider() {
    const slider = document.getElementById("workspace-purge-slider");
    const confirm = document.getElementById("workspace-purge-confirm-btn");
    if (!slider || !confirm) return;
    const v = Math.min(100, Math.max(0, parseInt(slider.value, 10) || 0));
    slider.value = String(v);
    slider.style.setProperty("--employee-slider-pct", `${v}%`);
    slider.setAttribute("aria-valuenow", String(v));
    confirm.disabled = v < 100;
  }

  function openPurgeModal(id) {
    const item = readModuleItems(currentModule).find((x) => x.id === id);
    if (!item) return;
    uiState.pendingPurgeId = id;
    const modal = document.getElementById("workspace-purge-modal");
    const preview = document.getElementById("workspace-purge-preview");
    const slider = document.getElementById("workspace-purge-slider");
    if (preview) preview.textContent = item.naam || "—";
    if (slider) {
      slider.value = "0";
      syncPurgeSlider();
    }
    if (modal) {
      modal.removeAttribute("hidden");
      modal.setAttribute("aria-hidden", "false");
      window.setTimeout(() => document.getElementById("workspace-purge-cancel-btn")?.focus(), 30);
    }
  }

  function confirmPurge() {
    if (!uiState.pendingPurgeId) return;
    const slider = document.getElementById("workspace-purge-slider");
    if (Number(slider?.value || 0) < 100) return;
    const id = uiState.pendingPurgeId;
    const next = readModuleItems(currentModule).filter((x) => x.id !== id);
    writeModuleItems(currentModule, next);
    uiState.selectedIds.delete(id);
    closePurgeModal();
    rerender();
    showAppToast("Item definitief verwijderd");
  }

  function exportVisibleToCsv() {
    const { visible } = getFilteredItems(currentModule, document.getElementById("workspace-search")?.value || "");
    if (!visible.length) {
      if (typeof window.showActionFeedback === "function") {
        window.showActionFeedback("info", "Geen gegevens", "Er zijn geen records om te exporteren.");
      } else {
        showAppToast("Geen records om te exporteren");
      }
      return;
    }
    const header = ["Naam", "Status", "Laatst bijgewerkt", "Door"];
    const rows = visible.map((x) => [x.naam, x.status, x.updatedAt, x.updatedBy]);
    const escapeCsv = (v) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const filename = `${currentModule}-${new Date().toISOString().slice(0, 10)}.csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (typeof window.showActionFeedback === "function") {
      window.showActionFeedback("exported", filename);
    } else {
      showAppToast("CSV export gestart");
    }
  }

  function rerender() {
    currentModule = getModuleKeyFromHash();
    renderWorkspace(currentModule, document.getElementById("workspace-search")?.value || "");
  }

  const searchInput = document.getElementById("workspace-search");
  searchInput?.addEventListener("input", rerender);
  document.getElementById("workspace-export-btn")?.addEventListener("click", exportVisibleToCsv);
  document.getElementById("workspace-show-archived")?.addEventListener("change", (event) => {
    uiState.showArchived = !!event.target.checked;
    uiState.selectedIds.clear();
    rerender();
  });
  document.getElementById("workspace-select-all")?.addEventListener("change", (event) => {
    const { visible } = getFilteredItems(currentModule, document.getElementById("workspace-search")?.value || "");
    if (event.target.checked) {
      visible.forEach((item) => uiState.selectedIds.add(item.id));
    } else {
      visible.forEach((item) => uiState.selectedIds.delete(item.id));
    }
    rerender();
  });
  document.getElementById("workspace-bulk-archive-btn")?.addEventListener("click", () => {
    const selected = new Set(uiState.selectedIds);
    if (!selected.size) return;
    const items = readModuleItems(currentModule).map((item) => {
      if (!selected.has(item.id)) return item;
      return { ...item, archived: true, updatedAt: formatNow(), updatedBy: getCurrentUserName() };
    });
    writeModuleItems(currentModule, items);
    uiState.selectedIds.clear();
    rerender();
    showAppToast("Selectie gearchiveerd");
  });
  document.getElementById("workspace-bulk-restore-btn")?.addEventListener("click", () => {
    const selected = new Set(uiState.selectedIds);
    if (!selected.size) return;
    const items = readModuleItems(currentModule).map((item) => {
      if (!selected.has(item.id)) return item;
      return { ...item, archived: false, updatedAt: formatNow(), updatedBy: getCurrentUserName() };
    });
    writeModuleItems(currentModule, items);
    uiState.selectedIds.clear();
    rerender();
    showAppToast("Selectie hersteld");
  });
  document.getElementById("workspace-reset-btn")?.addEventListener("click", () => {
    const cfg = MODULE_CONFIG[currentModule];
    if (!cfg) return;
    window.localStorage.removeItem(cfg.key);
    uiState.selectedIds.clear();
    rerender();
    showAppToast("Module gereset");
  });

  document.getElementById("workspace-table-body")?.addEventListener("click", (event) => {
    const rowCb = event.target.closest(".workspace-row-check");
    if (rowCb) {
      const id = String(rowCb.getAttribute("data-id") || "");
      if (id) {
        if (rowCb.checked) uiState.selectedIds.add(id);
        else uiState.selectedIds.delete(id);
      }
      rerender();
      return;
    }

    const restoreEl = event.target.closest(".hr-restore-btn");
    if (restoreEl) {
      event.preventDefault();
      event.stopPropagation();
      const id = String(restoreEl.getAttribute("data-id") || "");
      if (!id) return;
      const items = readModuleItems(currentModule).map((item) =>
        item.id === id ? { ...item, archived: false, updatedAt: formatNow(), updatedBy: getCurrentUserName() } : item
      );
      writeModuleItems(currentModule, items);
      uiState.selectedIds.delete(id);
      rerender();
      showAppToast("Item hersteld");
      return;
    }

    if (event.target.closest(".workspace-purge-btn")) {
      event.preventDefault();
      event.stopPropagation();
      const id = String(event.target.closest(".workspace-purge-btn").getAttribute("data-id") || "");
      if (id) openPurgeModal(id);
      return;
    }

    const btn = event.target.closest(".employee-delete-btn");
    if (btn) {
      event.preventDefault();
      event.stopPropagation();
      const id = String(btn.getAttribute("data-id") || "");
      if (!id) return;
      openArchiveModal(id);
      return;
    }
  });

  document.getElementById("workspace-archive-close-btn")?.addEventListener("click", closeArchiveModal);
  document.getElementById("workspace-archive-cancel-btn")?.addEventListener("click", closeArchiveModal);
  document.getElementById("workspace-archive-slider")?.addEventListener("input", syncArchiveSlider);
  document.getElementById("workspace-archive-confirm-btn")?.addEventListener("click", confirmArchive);
  document.getElementById("workspace-archive-modal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeArchiveModal();
  });
  document.getElementById("workspace-purge-close-btn")?.addEventListener("click", closePurgeModal);
  document.getElementById("workspace-purge-cancel-btn")?.addEventListener("click", closePurgeModal);
  document.getElementById("workspace-purge-slider")?.addEventListener("input", syncPurgeSlider);
  document.getElementById("workspace-purge-confirm-btn")?.addEventListener("click", confirmPurge);
  document.getElementById("workspace-purge-modal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closePurgeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeArchiveModal();
      closePurgeModal();
    }
  });

  window.addEventListener("hashchange", () => {
    rerender();
  });

  initModal(() => currentModule, rerender);
  rerender();
}

initWerkruimte();
