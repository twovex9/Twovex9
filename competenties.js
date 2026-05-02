const STORAGE_KEY = "competenties";

function genId() {
  return "comp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function getCompetencies() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    let changed = false;
    list.forEach(c => { if (!c.id) { c.id = genId(); changed = true; } });
    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return list;
  } catch { return []; }
}

function saveCompetencies(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function deleteCompetency(id) {
  if (!id) return false;
  const list = getCompetencies().filter((c) => c.id !== id);
  saveCompetencies(list);
  return true;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${yy} ${hh}:${mi}`;
}

function countMedewerkers(compNaam) {
  try {
    const raw = localStorage.getItem("employees");
    const list = raw ? JSON.parse(raw) : [];
    return list.filter((e) => e.competentie === compNaam).length;
  } catch { return 0; }
}

(function () {
  const tbody = document.getElementById("comp-tbody");
  const searchInput = document.getElementById("comp-search");
  const archivedToggle = document.getElementById("comp-archived-toggle");
  const rangeEl = document.getElementById("comp-pager-range");
  const pageEl = document.getElementById("comp-pager-page");
  const rowsSelect = document.getElementById("comp-rows-per-page");
  const checkAll = document.getElementById("comp-check-all");

  let sortKey = "";
  let sortDir = "asc";
  let currentPage = 0;

  function getPageSize() {
    return parseInt(rowsSelect?.value || "15", 10);
  }

  function getFilteredCompetencies() {
    const showArchived = archivedToggle ? archivedToggle.checked : false;
    let items = getCompetencies().filter((c) => (showArchived ? c.archived === true : !c.archived));
    const query = (searchInput?.value || "").trim().toLowerCase();
    if (query) {
      items = items.filter((c) => c.naam.toLowerCase().includes(query));
    }

    if (sortKey) {
      items = items.slice();
      items.sort((a, b) => {
        let av = a[sortKey] ?? "";
        let bv = b[sortKey] ?? "";
        if (sortKey === "medewerkers") {
          av = countMedewerkers(a.naam);
          bv = countMedewerkers(b.naam);
        }
        if (typeof av === "string") av = av.toLowerCase();
        if (typeof bv === "string") bv = bv.toLowerCase();
        let cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "desc" ? -cmp : cmp;
      });
    }

    return items;
  }

  function render() {
    const items = getFilteredCompetencies();

    const pageSize = getPageSize();
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    const start = currentPage * pageSize;
    const page = items.slice(start, start + pageSize);

    tbody.innerHTML = "";
    if (page.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = "Geen competenties gevonden";
      td.style.textAlign = "center";
      td.style.padding = "24px";
      td.style.color = "#9ca3af";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      page.forEach((c) => {
        const tr = document.createElement("tr");
        tr.dataset.compId = c.id;
        tr.dataset.compNaam = c.naam;
        tr.style.cursor = "pointer";

        const tdCheck = document.createElement("td");
        tdCheck.innerHTML = '<input type="checkbox" class="comp-row-check" />';
        tr.appendChild(tdCheck);

        const tdNaam = document.createElement("td");
        tdNaam.dataset.col = "naam";
        tdNaam.textContent = c.naam;
        tr.appendChild(tdNaam);

        const tdMed = document.createElement("td");
        tdMed.dataset.col = "medewerkers";
        tdMed.textContent = countMedewerkers(c.naam);
        tr.appendChild(tdMed);

        const tdAanmaak = document.createElement("td");
        tdAanmaak.dataset.col = "aanmaakdatum";
        tdAanmaak.textContent = fmtDate(c.aanmaakdatum);
        tr.appendChild(tdAanmaak);

        const tdGewijzigd = document.createElement("td");
        tdGewijzigd.dataset.col = "laatst-gewijzigd";
        tdGewijzigd.textContent = fmtDate(c.laatstGewijzigd);
        tr.appendChild(tdGewijzigd);

        const tdDel = document.createElement("td");
        tdDel.style.textAlign = "center";
        const showArcC = archivedToggle ? archivedToggle.checked : false;
        const trashSvgC = '<svg class="employee-delete-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        if (showArcC) {
          const wrapC = document.createElement("div");
          wrapC.className = "hr-row-actions";
          const resC = document.createElement("button");
          resC.type = "button";
          resC.className = "btn-outline hr-restore-btn";
          resC.setAttribute("data-comp-id", c.id);
          resC.textContent = "Herstel";
          const pC = document.createElement("button");
          pC.type = "button";
          pC.className = "employee-delete-btn comp-purge-btn";
          pC.setAttribute("aria-label", "Definitief verwijderen");
          pC.innerHTML = trashSvgC;
          wrapC.appendChild(resC);
          wrapC.appendChild(pC);
          tdDel.appendChild(wrapC);
        } else {
          const delBtnC = document.createElement("button");
          delBtnC.type = "button";
          delBtnC.className = "employee-delete-btn comp-archive-btn";
          delBtnC.setAttribute("aria-label", "Competentie archiveren");
          delBtnC.innerHTML = trashSvgC;
          tdDel.appendChild(delBtnC);
        }
        tr.appendChild(tdDel);

        tbody.appendChild(tr);
      });
    }

    applyColumnVisibility();

    if (rangeEl) rangeEl.textContent = `${pageSize} of ${total} total.`;
    if (pageEl) pageEl.textContent = `Page ${currentPage + 1} of ${totalPages}`;

    const first = document.getElementById("comp-pager-first");
    const prev = document.getElementById("comp-pager-prev");
    const next = document.getElementById("comp-pager-next");
    const last = document.getElementById("comp-pager-last");
    if (first) first.disabled = currentPage === 0;
    if (prev) prev.disabled = currentPage === 0;
    if (next) next.disabled = currentPage >= totalPages - 1;
    if (last) last.disabled = currentPage >= totalPages - 1;

    if (checkAll) checkAll.checked = false;
  }

  // Pagination
  ["first", "prev", "next", "last"].forEach((action) => {
    const btn = document.getElementById("comp-pager-" + action);
    if (!btn) return;
    btn.addEventListener("click", () => {
      const total = getFilteredCompetencies().length;
      const totalPages = Math.max(1, Math.ceil(total / getPageSize()));
      if (action === "first") currentPage = 0;
      else if (action === "prev") currentPage = Math.max(0, currentPage - 1);
      else if (action === "next") currentPage = Math.min(totalPages - 1, currentPage + 1);
      else if (action === "last") currentPage = totalPages - 1;
      render();
    });
  });

  if (rowsSelect) rowsSelect.addEventListener("change", () => { currentPage = 0; render(); });
  if (searchInput) searchInput.addEventListener("input", () => { currentPage = 0; render(); });
  if (archivedToggle) archivedToggle.addEventListener("change", () => { currentPage = 0; render(); });

  // Column toggle (same pattern as index.html)
  const columnsBtn = document.getElementById("columns-menu-btn");
  const columnsPanel = document.getElementById("columns-panel");

  function setColumnVisible(colId, visible) {
    document.querySelectorAll(`#comp-table [data-col="${colId}"]`).forEach((cell) => {
      cell.classList.toggle("col-hidden", !visible);
    });
  }

  function applyColumnVisibility() {
    document.querySelectorAll(".column-toggle").forEach((btn) => {
      const colId = btn.dataset.col;
      const visible = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", visible);
      setColumnVisible(colId, visible);
    });
  }

  document.querySelectorAll(".column-toggle").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      btn.classList.toggle("is-checked");
      const visible = btn.classList.contains("is-checked");
      btn.setAttribute("aria-checked", visible);
      setColumnVisible(btn.dataset.col, visible);
    });
  });

  if (columnsBtn && columnsPanel) {
    columnsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !columnsPanel.hidden;
      columnsPanel.hidden = !open ? false : true;
      columnsPanel.hidden = open;
      columnsBtn.setAttribute("aria-expanded", !open);
    });
    columnsPanel.addEventListener("click", (e) => e.stopPropagation());
  }

  document.addEventListener("click", () => {
    if (columnsPanel) { columnsPanel.hidden = true; columnsBtn?.setAttribute("aria-expanded", "false"); }
    document.querySelectorAll(".th-sort-menu").forEach((m) => m.setAttribute("hidden", ""));
  });

  // Sort menus
  document.querySelectorAll(".th-sort-trigger").forEach((trigger) => {
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const th = trigger.closest("th");
      const menu = th?.querySelector(".th-sort-menu");
      if (!menu) return;
      const wasHidden = menu.hasAttribute("hidden");
      document.querySelectorAll(".th-sort-menu").forEach((m) => m.setAttribute("hidden", ""));
      if (wasHidden) menu.removeAttribute("hidden");
    });
  });

  document.querySelectorAll(".th-sort-opt").forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = opt.dataset.action;
      const th = opt.closest("th");
      const colId = th?.dataset.col;
      if (!colId) return;

      if (action === "hide") {
        const toggle = document.querySelector(`.column-toggle[data-col="${colId}"]`);
        if (toggle) {
          toggle.classList.remove("is-checked");
          toggle.setAttribute("aria-checked", "false");
        }
        setColumnVisible(colId, false);
      } else {
        sortKey = colId;
        sortDir = action;
        render();
      }
      document.querySelectorAll(".th-sort-menu").forEach((m) => m.setAttribute("hidden", ""));
    });
  });

  // Check all
  if (checkAll) {
    checkAll.addEventListener("change", () => {
      tbody.querySelectorAll(".comp-row-check").forEach((cb) => { cb.checked = checkAll.checked; });
    });
  }

  // Add competentie modal
  const addBtn = document.getElementById("comp-add-btn");
  const addModal = document.getElementById("comp-add-modal");
  const addCloseBtn = document.getElementById("comp-add-close-btn");
  const addCancelBtn = document.getElementById("comp-add-cancel-btn");
  const addForm = document.getElementById("comp-add-form");

  function openAddModal() { if (addModal) addModal.style.display = ""; }
  function closeAddModal() { if (addModal) addModal.style.display = "none"; }

  if (addBtn) addBtn.addEventListener("click", openAddModal);
  if (addCloseBtn) addCloseBtn.addEventListener("click", closeAddModal);
  if (addCancelBtn) addCancelBtn.addEventListener("click", closeAddModal);
  if (addModal) addModal.addEventListener("click", (e) => { if (e.target === addModal) closeAddModal(); });

  if (addForm) {
    addForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const naam = document.getElementById("comp-add-naam")?.value?.trim();
      if (!naam) return;
      const list = getCompetencies();
      const now = new Date().toISOString();
      list.push({ id: genId(), naam, aanmaakdatum: now, laatstGewijzigd: now, archived: false });
      saveCompetencies(list);
      document.getElementById("comp-add-naam").value = "";
      closeAddModal();
      render();
    });
  }

  // Delete modal
  const delModal = document.getElementById("comp-delete-modal");
  const delSlider = document.getElementById("comp-delete-slider");
  const delConfirmBtn = document.getElementById("comp-delete-confirm-btn");
  const delCancelBtn = document.getElementById("comp-delete-cancel-btn");
  const delCloseBtn = document.getElementById("comp-delete-close-btn");
  const delPreview = document.getElementById("comp-delete-preview");
  let deleteTarget = null;
  let deleteTargetNaam = "";

  const cpModal = document.getElementById("comp-purge-modal");
  const cpSlider = document.getElementById("comp-purge-slider");
  const cpConfirmBtn = document.getElementById("comp-purge-confirm-btn");
  const cpCancelBtn = document.getElementById("comp-purge-cancel-btn");
  const cpCloseBtn = document.getElementById("comp-purge-close-btn");
  const cpPreview = document.getElementById("comp-purge-preview");
  let compPurgeTarget = null;

  function syncDelSlider() {
    const v = Math.min(100, Math.max(0, parseInt(delSlider.value, 10) || 0));
    delSlider.value = String(v);
    delSlider.style.setProperty("--employee-slider-pct", `${v}%`);
    delSlider.setAttribute("aria-valuenow", String(v));
    if (delConfirmBtn) delConfirmBtn.disabled = v < 100;
  }

  function resetDelSlider() {
    if (delSlider) { delSlider.value = "0"; syncDelSlider(); }
  }

  function openDeleteModal(id, naam) {
    deleteTarget = id;
    deleteTargetNaam = naam;
    if (delPreview) delPreview.textContent = naam;
    resetDelSlider();
    if (delModal) { delModal.removeAttribute("hidden"); delModal.setAttribute("aria-hidden", "false"); }
  }

  function closeDeleteModal() {
    if (delModal) { delModal.setAttribute("hidden", ""); delModal.setAttribute("aria-hidden", "true"); }
    deleteTarget = null;
    deleteTargetNaam = "";
    resetDelSlider();
    if (delPreview) delPreview.textContent = "";
  }

  function syncCompPurgeSlider() {
    if (!cpSlider) return;
    const v = Math.min(100, Math.max(0, parseInt(cpSlider.value, 10) || 0));
    cpSlider.value = String(v);
    cpSlider.style.setProperty("--employee-slider-pct", `${v}%`);
    cpSlider.setAttribute("aria-valuenow", String(v));
    if (cpConfirmBtn) cpConfirmBtn.disabled = v < 100;
  }

  function resetCompPurgeSlider() {
    if (cpSlider) {
      cpSlider.value = "0";
      syncCompPurgeSlider();
    }
  }

  function openCompPurgeModal(id, naam) {
    compPurgeTarget = id;
    if (cpPreview) cpPreview.textContent = naam;
    resetCompPurgeSlider();
    if (cpModal) {
      cpModal.removeAttribute("hidden");
      cpModal.setAttribute("aria-hidden", "false");
    }
  }

  function closeCompPurgeModal() {
    if (cpModal) {
      cpModal.setAttribute("hidden", "");
      cpModal.setAttribute("aria-hidden", "true");
    }
    compPurgeTarget = null;
    resetCompPurgeSlider();
    if (cpPreview) cpPreview.textContent = "";
  }

  function confirmCompPurge() {
    if (!compPurgeTarget || (cpConfirmBtn && cpConfirmBtn.disabled)) return;
    deleteCompetency(compPurgeTarget);
    closeCompPurgeModal();
    render();
  }

  function confirmDelete() {
    if (!deleteTarget || (delConfirmBtn && delConfirmBtn.disabled)) return;
    const now = new Date().toISOString();
    const list = getCompetencies().map((c) =>
      c.id === deleteTarget ? { ...c, archived: true, laatstGewijzigd: now } : c
    );
    saveCompetencies(list);
    closeDeleteModal();
    render();
  }

  tbody.addEventListener("click", (e) => {
    const resCmp = e.target.closest(".hr-restore-btn");
    if (resCmp && resCmp.getAttribute("data-comp-id")) {
      e.preventDefault();
      e.stopPropagation();
      const ridc = resCmp.getAttribute("data-comp-id");
      const nowC = new Date().toISOString();
      const lstC = getCompetencies().map((c) =>
        c.id === ridc ? { ...c, archived: false, laatstGewijzigd: nowC } : c
      );
      saveCompetencies(lstC);
      render();
      return;
    }
    const purC = e.target.closest(".comp-purge-btn");
    if (purC) {
      e.preventDefault();
      e.stopPropagation();
      const trPc = purC.closest("tr");
      if (trPc && trPc.dataset.compId) openCompPurgeModal(trPc.dataset.compId, trPc.dataset.compNaam || "");
      return;
    }
    const delBtn = e.target.closest(".comp-archive-btn");
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      const tr = delBtn.closest("tr");
      if (tr && tr.dataset.compId) openDeleteModal(tr.dataset.compId, tr.dataset.compNaam || "");
      return;
    }

    if (e.target.closest("input[type='checkbox']")) return;

    const tr = e.target.closest("tr");
    if (tr && tr.dataset.compId) {
      window.location.href = "competentie-detail.html?id=" + encodeURIComponent(tr.dataset.compId);
    }
  });

  if (delSlider) { delSlider.addEventListener("input", syncDelSlider); delSlider.addEventListener("change", syncDelSlider); }
  if (delConfirmBtn) delConfirmBtn.addEventListener("click", confirmDelete);
  if (delCancelBtn) delCancelBtn.addEventListener("click", closeDeleteModal);
  if (delCloseBtn) delCloseBtn.addEventListener("click", closeDeleteModal);
  if (delModal) delModal.addEventListener("click", (e) => { if (e.target === delModal) closeDeleteModal(); });

  if (cpSlider) {
    cpSlider.addEventListener("input", syncCompPurgeSlider);
    cpSlider.addEventListener("change", syncCompPurgeSlider);
  }
  if (cpConfirmBtn) cpConfirmBtn.addEventListener("click", confirmCompPurge);
  if (cpCancelBtn) cpCancelBtn.addEventListener("click", closeCompPurgeModal);
  if (cpCloseBtn) cpCloseBtn.addEventListener("click", closeCompPurgeModal);
  if (cpModal) {
    cpModal.addEventListener("click", (e) => {
      if (e.target === cpModal) closeCompPurgeModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (cpModal && !cpModal.hasAttribute("hidden")) {
      closeCompPurgeModal();
      e.preventDefault();
    }
  });

  // Top nav active state
  const topLinks = document.querySelectorAll(".top-link");
  topLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = (link.getAttribute("href") || "").trim();
      if (href === "#" || href === "") {
        event.preventDefault();
        topLinks.forEach((l) => l.classList.remove("is-active"));
        link.classList.add("is-active");
      }
    });
  });

  // Sidebar active (don't block real hrefs)
  const sideLinks = document.querySelectorAll(".side-link");
  sideLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = (link.getAttribute("href") || "").trim();
      if (href === "#" || href === "") {
        event.preventDefault();
        sideLinks.forEach((l) => l.classList.remove("is-active"));
        link.classList.add("is-active");
      }
    });
  });

  render();
})();
