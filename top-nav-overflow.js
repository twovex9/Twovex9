/* top-nav-overflow.js — overflow menu for top navigation */
(function () {
  "use strict";

  const nav = document.querySelector(".top-nav");
  const btn = document.getElementById("top-nav-overflow-btn");
  const panel = document.getElementById("top-nav-overflow-panel");
  if (!nav || !btn || !panel) return;

  const navItems = Array.from(nav.children);

  function normalizeFileName(pathname) {
    const cleaned = String(pathname || "").split("?")[0].split("#")[0];
    const parts = cleaned.split("/").filter(Boolean);
    const last = (parts[parts.length - 1] || "index.html").toLowerCase();
    return last || "index.html";
  }

  function normalizeHash(value) {
    const v = String(value || "").trim().toLowerCase();
    if (!v) return "";
    return v.startsWith("#") ? v : `#${v}`;
  }

  function parseHrefParts(href) {
    const raw = String(href || "").trim();
    if (!raw || raw === "#") return { file: "", hash: "" };
    const [filePart, hashPart] = raw.split("#");
    return {
      file: normalizeFileName(filePart),
      hash: normalizeHash(hashPart || ""),
    };
  }

  function syncTopNavActiveState() {
    const currentFile = normalizeFileName(window.location.pathname);
    const currentHash = normalizeHash(window.location.hash);
    const effectiveHash = currentFile === "werkruimte.html" && !currentHash ? "#urenregistratie" : currentHash;
    const hrPages = new Set([
      "index.html",
      "nieuws.html",
      "competenties.html",
      "competentie-detail.html",
      "opleidingen.html",
      "opleiding-detail.html",
      "locaties.html",
      "locatie-detail.html",
      "salarishuis.html",
      "salarishuis-wijzigingsgeschiedenis.html",
      "bureaus.html",
      "bureau-detail.html",
      "salarisadministratie-exporter.html",
      "compensatie-saldi.html",
      "compensatie-berekeningen.html",
      "compensatie-feestdagen.html",
      "compensatie-diensttypes.html",
      "verzuim.html",
      "medewerker.html"
    ]);
    const planningPages = new Set([
      "planning.html"
    ]);

    const links = Array.from(nav.querySelectorAll(".top-link"));
    links.forEach((link) => link.classList.remove("is-active"));

    let activeLink = links.find((link) => {
      const href = (link.getAttribute("href") || "").trim();
      if (!href || href === "#") return false;
      const parsed = parseHrefParts(href);
      if (parsed.file !== currentFile) return false;
      if (currentFile === "werkruimte.html" && parsed.hash) {
        return parsed.hash === effectiveHash;
      }
      return true;
    });

    if (!activeLink && currentFile === "home.html") {
      activeLink = links.find((link) => link.textContent.trim().startsWith("Home")) || null;
    }

    if (!activeLink && planningPages.has(currentFile)) {
      activeLink = links.find((link) => {
        const label = getTopLinkLabel(link);
        return label === "Planning";
      }) || null;
    }

    if (!activeLink && hrPages.has(currentFile)) {
      activeLink = links.find((link) => {
        return getTopLinkLabel(link) === "HR";
      }) || null;
    }

    const clientenWorkspaceHashes = new Set(["#clienten", "#zorgsoorten", "#beschikkingen", "#incidenten"]);
    if (!activeLink && currentFile === "werkruimte.html" && clientenWorkspaceHashes.has(effectiveHash)) {
      activeLink = links.find((link) => getTopLinkLabel(link) === "Cliënten") || null;
    }

    if (!activeLink && (
      currentFile === "clienten.html" ||
      currentFile === "client-detail.html" ||
      currentFile === "zorgsoorten.html" ||
      currentFile === "zorgsoort-detail.html" ||
      currentFile === "beschikkingen.html" ||
      currentFile === "beschikkingen-dashboard.html" ||
      currentFile === "beschikking-detail.html" ||
      currentFile === "facturen.html" ||
      currentFile === "facturen-importeren.html" ||
      currentFile === "organisatie.html" ||
      currentFile === "organisatie-detail.html" ||
      currentFile === "gemeenten.html" ||
      currentFile === "gemeente-detail.html" ||
      currentFile === "urendeclaraties.html" ||
      currentFile === "uren-budgettering.html" ||
      currentFile === "incidenten.html" ||
      currentFile === "incidenten-dashboard.html" ||
      currentFile === "incidenten-categorieen.html"
    )) {
      activeLink = links.find((link) => getTopLinkLabel(link) === "Cliënten") || null;
    }

    if (!activeLink) {
      activeLink = links.find((link) => link.textContent.trim().startsWith("Home")) || null;
    }

    if (activeLink) activeLink.classList.add("is-active");
  }

  function getTopLinkLabel(link) {
    const clone = link.cloneNode(true);
    clone.querySelectorAll(".top-link-chev").forEach((c) => c.remove());
    return clone.textContent.trim();
  }

  const FALLBACK_ROUTE = "home.html";
  const TOP_ROUTE_BY_LABEL = {
      Home: "home.html",
      Planning: "planning.html",
      Urenregistratie: "werkuren.html",
      HR: "index.html",
      Cliënten: "clienten.html",
      Kilometers: "werkruimte.html#kilometers",
      Taken: "taken.html",
      Medewerkers: "index.html",
      Verlof: "verlof.html",
      Beleid: "beleid.html",
      Audit: "audit.html",
      Organisatie: "teams.html",
      Instellingen: "instellingen.html",
    };
  const DROPDOWN_ROUTE_BY_TITLE = {
      "Overzicht planning": "planning.html",
      "Beheer planningbeheer": "planning.html",
      "Geregistreerde uren": "werkuren.html",
      "Labels": "werkuren-labels.html",
      "Medewerkers": "index.html",
      Cliënten: "clienten.html",
      Zorgsoorten: "zorgsoorten.html",
      Beschikkingen: "beschikkingen.html",
      Facturen: "facturen.html",
      Incidenten: "werkruimte.html#incidenten",
      "Kilometer declaraties": "werkruimte.html#kilometers",
      "Verlofaanvragen": "werkruimte.html#verlof",
      "Rollen": "werkruimte.html#organisatie",
      "Teams": "werkruimte.html#organisatie",
    };

  function resolveTopRoute(link) {
    const label = getTopLinkLabel(link);
    let targetHref = TOP_ROUTE_BY_LABEL[label];
    if (targetHref) return targetHref;

    const parentNavItem = link.closest(".top-nav-item");
    const firstRealSubLink = parentNavItem?.querySelector('.top-dropdown-link[href]:not([href="#"])');
    return firstRealSubLink?.getAttribute("href") || FALLBACK_ROUTE;
  }

  function resolveDropdownRoute(link) {
    const title = link.querySelector(".top-dropdown-title")?.textContent?.trim() || "";
    if (DROPDOWN_ROUTE_BY_TITLE[title]) return DROPDOWN_ROUTE_BY_TITLE[title];

    const parentNavItem = link.closest(".top-nav-item");
    const topLink = parentNavItem?.querySelector(".top-link");
    return topLink ? resolveTopRoute(topLink) : FALLBACK_ROUTE;
  }

  function wireTopDropdownDirectRoutes() {

    nav.querySelectorAll(".top-link").forEach((link) => {
      const currentHref = (link.getAttribute("href") || "").trim();
      if (currentHref && currentHref !== "#") return;

      const targetHref = resolveTopRoute(link);
      link.setAttribute("href", targetHref);
    });

    nav.querySelectorAll(".top-dropdown-link").forEach((link) => {
      const currentHref = (link.getAttribute("href") || "").trim();
      if (currentHref && currentHref !== "#") return;
      link.setAttribute("href", resolveDropdownRoute(link));
    });
  }

  function wireFailsafeNavigation() {
    nav.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const topLink = target.closest(".top-link");
      if (topLink && nav.contains(topLink)) {
        const href = (topLink.getAttribute("href") || "").trim();
        if (href === "" || href === "#") {
          event.preventDefault();
          window.location.href = resolveTopRoute(topLink);
          return;
        }
      }

      const ddLink = target.closest(".top-dropdown-link");
      if (ddLink && nav.contains(ddLink)) {
        const href = (ddLink.getAttribute("href") || "").trim();
        if (href === "" || href === "#") {
          event.preventDefault();
          window.location.href = resolveDropdownRoute(ddLink);
        }
      }
    }, true);
  }

  function getLabel(el) {
    const link = el.classList.contains("top-link") ? el : el.querySelector(".top-link");
    if (!link) return "";
    const clone = link.cloneNode(true);
    clone.querySelectorAll(".top-link-chev").forEach(c => c.remove());
    return clone.textContent.trim();
  }

  function getHref(el) {
    const link = el.classList.contains("top-link") ? el : el.querySelector(".top-link");
    return link ? (link.getAttribute("href") || "#") : "#";
  }

  function isActive(el) {
    const link = el.classList.contains("top-link") ? el : el.querySelector(".top-link");
    return link ? link.classList.contains("is-active") : false;
  }

  function getSubLinks(el) {
    const dd = el.querySelector(".top-dropdown");
    if (!dd) return null;
    const links = [];
    dd.querySelectorAll(".top-dropdown-link").forEach(a => {
      const title = a.querySelector(".top-dropdown-title");
      links.push({
        label: title ? title.textContent.trim() : a.textContent.trim(),
        href: a.getAttribute("href") || "#"
      });
    });
    return links.length ? links : null;
  }

  function resetVisibility() {
    navItems.forEach(item => {
      item.classList.remove("top-nav-hidden");
    });
  }

  let rafId = null;
  const ro = new ResizeObserver(() => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(update);
  });

  let updating = false;

  function update() {
    if (updating) return;
    updating = true;

    ro.unobserve(nav);

    resetVisibility();

    const navRight = nav.getBoundingClientRect().right;
    const btnWidth = 38;
    const threshold = navRight - btnWidth;
    const hiddenItems = [];

    for (let i = navItems.length - 1; i >= 0; i--) {
      const item = navItems[i];
      const rect = item.getBoundingClientRect();
      if (rect.right > navRight + 1) {
        hiddenItems.unshift(item);
      }
    }

    if (hiddenItems.length === 0) {
      btn.classList.remove("is-visible");
      closePanel();
      ro.observe(nav);
      updating = false;
      return;
    }

    hiddenItems.forEach(item => item.classList.add("top-nav-hidden"));

    let stillOverflows = true;
    while (stillOverflows) {
      stillOverflows = false;
      for (const item of navItems) {
        if (item.classList.contains("top-nav-hidden")) continue;
        const rect = item.getBoundingClientRect();
        if (rect.right > threshold) {
          item.classList.add("top-nav-hidden");
          hiddenItems.push(item);
          stillOverflows = true;
          break;
        }
      }
    }

    btn.classList.add("is-visible");
    buildPanel(navItems.filter(i => i.classList.contains("top-nav-hidden")));

    requestAnimationFrame(() => {
      ro.observe(nav);
      updating = false;
    });
  }

  function buildPanel(hiddenItems) {
    panel.innerHTML = "";
    hiddenItems.forEach(item => {
      const label = getLabel(item);
      if (!label) return;

      const href = getHref(item);
      const active = isActive(item);
      const subLinks = getSubLinks(item);

      if (subLinks) {
        const wrapper = document.createElement("div");

        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "top-nav-overflow-item" + (active ? " is-active" : "");
        trigger.innerHTML = label + ' <span style="margin-left:auto;opacity:0.5;font-size:10px">▸</span>';
        wrapper.appendChild(trigger);

        const sub = document.createElement("div");
        sub.style.display = "none";
        sub.style.paddingLeft = "14px";

        subLinks.forEach(sl => {
          const a = document.createElement("a");
          a.href = sl.href;
          a.className = "top-nav-overflow-item";
          a.textContent = sl.label;
          sub.appendChild(a);
        });

        wrapper.appendChild(sub);

        trigger.addEventListener("click", (e) => {
          e.stopPropagation();
          const open = sub.style.display !== "none";
          panel.querySelectorAll("[data-sub-open]").forEach(s => {
            s.style.display = "none";
            s.removeAttribute("data-sub-open");
          });
          if (!open) {
            sub.style.display = "block";
            sub.setAttribute("data-sub-open", "");
          }
        });

        panel.appendChild(wrapper);
      } else {
        const a = document.createElement("a");
        a.href = href;
        a.className = "top-nav-overflow-item" + (active ? " is-active" : "");
        a.textContent = label;
        panel.appendChild(a);
      }
    });
  }

  function closePanel() {
    panel.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = panel.classList.contains("is-open");
    if (open) {
      closePanel();
    } else {
      panel.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
    }
  });

  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", closePanel);

  // ---------------------------------------------------------------------------
  // Top-dropdown viewport clamp (drielaagse aanpak)
  // ---------------------------------------------------------------------------
  // De .top-dropdown elementen openen standaard `left: 0` t.o.v. hun parent.
  // Bij smalle viewports kunnen ze rechts over de viewport-rand vallen — vooral
  // de HR/Cliënten dropdowns die ~300-380px breed zijn. Drie veiligheidslagen:
  //   1) Anker-flip op init en resize: we meten elk dropdown-item en als de
  //      dropdown rechts zou overflowen, ankeren we op `right:0` zodat hij
  //      naar links groeit i.p.v. naar rechts.
  //   2) Live klem op mouseenter/focusin: re-meten en zo nodig finetune
  //      met inline left/right pixels.
  //   3) CSS max-width: 100vw - 16px (in styles.css) als laatste vangnet.
  // ---------------------------------------------------------------------------

  function getDropdownLayoutWidth(dd) {
    // Met visibility:hidden wordt offsetWidth wél correct berekend.
    // Forceer een sync layout met void offsetWidth, dan lees terug.
    void dd.offsetWidth;
    const w = dd.offsetWidth;
    if (w > 0) return w;
    // Fallback: lees min-width uit computed style (CSS-defined).
    const cs = window.getComputedStyle(dd);
    const min = parseFloat(cs.minWidth) || 0;
    return min || 300;
  }

  function applyAnchorFlip(item) {
    const dd = item.querySelector(".top-dropdown");
    if (!dd) return;
    // Reset eerst zodat we de natuurlijke breedte meten.
    dd.style.left = "";
    dd.style.right = "";
    const itemRect = item.getBoundingClientRect();
    const ddWidth = getDropdownLayoutWidth(dd);
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const margin = 8;
    // Zou de dropdown rechts overflowen als hij left:0 blijft?
    if (itemRect.left + ddWidth > vw - margin) {
      // Anker rechts: dropdown groeit naar links vanaf rechter parent-rand.
      dd.style.left = "auto";
      dd.style.right = "0";
      // Als hij dan links zou overflowen (dropdown wijder dan parent_right tot 0),
      // schuif rechts iets in zodat hij niet links over de viewport valt.
      const newLeft = itemRect.right - ddWidth;
      if (newLeft < margin) {
        const shift = margin - newLeft;
        dd.style.right = "-" + Math.ceil(shift) + "px";
      }
    }
  }

  function clampDropdownToViewport(dd) {
    if (!dd) return;
    // Forceer layout vóór meten.
    void dd.offsetWidth;
    const rect = dd.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const margin = 8;
    if (rect.right > vw - margin) {
      // Dropdown overflowt rechts ondanks anker-flip → schuif extra naar links.
      const overflow = rect.right - (vw - margin);
      const currentLeft = parseFloat(dd.style.left) || 0;
      dd.style.left = (currentLeft - Math.ceil(overflow)) + "px";
      dd.style.right = "auto";
    }
    if (rect.left < margin) {
      // Dropdown overflowt links → klem aan linker viewport-rand.
      const parentRect = dd.parentElement.getBoundingClientRect();
      dd.style.left = (margin - parentRect.left) + "px";
      dd.style.right = "auto";
    }
  }

  function setupTopDropdownClamping() {
    const items = Array.from(nav.querySelectorAll(".top-nav-item--dropdown"));
    if (items.length === 0) return;

    function applyAllAnchors() {
      items.forEach(applyAnchorFlip);
    }

    items.forEach((item) => {
      const dd = item.querySelector(".top-dropdown");
      if (!dd) return;
      const onShow = () => {
        // Eerst anker-flippen voor het geval viewport is gewijzigd, dan finetune.
        applyAnchorFlip(item);
        clampDropdownToViewport(dd);
      };
      item.addEventListener("mouseenter", onShow);
      item.addEventListener("focusin", onShow);
    });

    // Initieel + bij resize: anker-flip toepassen.
    applyAllAnchors();
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyAllAnchors, 100);
    });
  }

  // ---------------------------------------------------------------------------
  // Top-dropdown anker-decider (left:0 vs right:0)
  // ---------------------------------------------------------------------------
  // CSS-default is `left: 0`. Voor elk dropdown-item meten we of hij met
  // left:0 binnen de viewport past. Zo niet, flippen we naar `right: 0`
  // (dropdown groeit dan naar links vanaf parent's rechterrand).
  //
  // Resultaat:
  //   - Planning (links in nav): left:0 → groeit naar rechts, past prima.
  //   - HR / Cliënten / Kilometers (rechts in nav): right:0 → groeit naar
  //     links, valt nooit rechts uit de viewport.
  //
  // Wordt herberekend bij window-resize zodat het ook bij grootte-wijzigingen
  // klopt.
  function decideDropdownAnchor(item) {
    const dd = item.querySelector(".top-dropdown");
    if (!dd) return;
    // Reset eerst zodat we de natuurlijke breedte meten.
    dd.style.left = "";
    dd.style.right = "";
    // Forceer layout (visibility:hidden behoudt layout, dus offsetWidth klopt).
    void dd.offsetWidth;
    const itemRect = item.getBoundingClientRect();
    const ddWidth = dd.offsetWidth || 240;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const margin = 8;
    if (itemRect.left + ddWidth > vw - margin) {
      // Overflowt rechts met left:0 → flip naar right:0
      dd.style.left = "auto";
      dd.style.right = "0";
    } else {
      // Past met left:0 — gebruik default
      dd.style.left = "0";
      dd.style.right = "auto";
    }
  }

  function decideAllDropdownAnchors() {
    nav.querySelectorAll(".top-nav-item--dropdown").forEach(decideDropdownAnchor);
  }

  decideAllDropdownAnchors();
  let dropdownResizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(dropdownResizeTimer);
    dropdownResizeTimer = setTimeout(decideAllDropdownAnchors, 100);
  });

  wireTopDropdownDirectRoutes();
  wireFailsafeNavigation();
  syncTopNavActiveState();
  ro.observe(nav);
  update();
})();
