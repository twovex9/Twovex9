/* top-nav-overflow.js — top-navigatie controller.
 *
 * Gedrag:
 *   - De top-nav SCROLT NIET. Past niet elk onderwerp op het scherm (tabblad/
 *     venster te smal), dan schuiven de onderwerpen die niet passen — vanaf
 *     rechts — in een "meer"-menu achter een pijltje (chevron) dat ALTIJD aan
 *     de rechterkant van de balk staat. Wordt de balk breder, dan komen er
 *     vanzelf meer onderwerpen tevoorschijn tot ze allemaal passen; dan
 *     verdwijnt het pijltje. Past alles → geen pijltje.
 *   - De onderwerpen blijven altijd in dezelfde volgorde; we verbergen enkel de
 *     rechterkant in het "meer"-menu (geen herordening → geen verspringen).
 *   - De in-balk dropdowns (Planning/HR/Cliënten/…) staan op position:fixed en
 *     worden hier bij hover/focus correct gepositioneerd en binnen de viewport
 *     geklemd, zodat ze niet worden afgekapt.
 *   - De actieve top-link wordt o.b.v. de huidige pagina gemarkeerd, vóór de
 *     eerste paint (dit script laadt non-defer onderaan de body). Valt het
 *     actieve onderwerp in het "meer"-menu, dan wordt het daar gemarkeerd.
 *
 * Eén gedeeld bestand → het gedrag geldt op elke pagina en voor elke rol.
 */
(function () {
  "use strict";

  const nav = document.querySelector(".top-nav");
  if (!nav) return;

  const overflowBtn = document.getElementById("top-nav-overflow-btn");
  const overflowPanel = document.getElementById("top-nav-overflow-panel");

  // Speling (px) bij het meten. Klein genoeg om het pijltje niet onnodig te
  // tonen, groot genoeg om een afgekapt randje te voorkomen.
  const FIT_TOL = 2;
  const EDGE_TOL = 4;

  function normalizeFileName(pathname) {
    const cleaned = String(pathname || "").split("?")[0].split("#")[0];
    const parts = cleaned.split("/").filter(Boolean);
    let last = (parts[parts.length - 1] || "index.html").toLowerCase();
    // Clean-URL (vercel cleanUrls): /taken -> taken.html
    if (last && last.indexOf(".") === -1) last += ".html";
    return last || "index.html";
  }

  function getTopLinkLabel(link) {
    if (!link) return "";
    const clone = link.cloneNode(true);
    clone.querySelectorAll(".top-link-chev").forEach((c) => c.remove());
    return clone.textContent.trim();
  }

  // -------------------------------------------------------------------------
  // 1) Actieve-markering — pagina → onderwerp (label van de top-link).
  // -------------------------------------------------------------------------
  // Eén bron-van-waarheid; labels moeten EXACT matchen met de top-link teksten.
  const PAGE_TOPIC = {
    // Home
    "home.html": "Home",
    "index.html": "Home",
    // Dashboard
    "management-dashboard.html": "Dashboard",
    // Persoonlijk
    "mijn-proforma-facturen.html": "Mijn facturen",
    "mijn-beschikbaarheid.html": "Mijn beschikbaarheid",
    "mijn-uitnodigingen.html": "Mijn beschikbaarheid",
    "medewerker-agenda.html": "Mijn beschikbaarheid",
    "mijn-uren.html": "Mijn uren",
    // Planning
    "planning.html": "Planning",
    "planning-beheer.html": "Planning",
    "beschikbaarheid-overzicht.html": "Planning",
    "open-diensten.html": "Planning",
    "locaties.html": "Planning",
    "locatie-detail.html": "Planning",
    "hr-diensttypes.html": "Planning",
    // Urenregistratie
    "werkuren.html": "Urenregistratie",
    "werkuren-labels.html": "Urenregistratie",
    "productie-urenregistratie.html": "Urenregistratie",
    "urendeclaraties.html": "Urenregistratie",
    "uren-budgettering.html": "Urenregistratie",
    // HR
    "hr.html": "HR",
    "medewerker.html": "HR",
    "medewerker-detail.html": "HR",
    "medewerkers-overzicht.html": "HR",
    "competenties.html": "HR",
    "competentie-detail.html": "HR",
    "opleidingen.html": "HR",
    "opleiding-detail.html": "HR",
    "contract-sjablonen.html": "HR",
    "inwerk-items.html": "HR",
    "salarishuis.html": "HR",
    "salarishuis-wijzigingsgeschiedenis.html": "HR",
    "bureaus.html": "HR",
    "bureau-detail.html": "HR",
    "salarisadministratie-exporter.html": "HR",
    "loonstroken.html": "HR",
    "verlof.html": "HR",
    "verlofstanden.html": "HR",
    "verlof-uitdienst.html": "HR",
    "plus-minuren.html": "HR",
    "verloftypes.html": "HR",
    "compensatie-saldi.html": "HR",
    "compensatie-berekeningen.html": "HR",
    "compensatie-feestdagen.html": "HR",
    "compensatie-diensttypes.html": "HR",
    "verzuim.html": "HR",
    "nieuws.html": "HR",
    // Cliënten
    "clienten.html": "Cliënten",
    "aanmeldingen.html": "Cliënten",
    "wachtlijst.html": "Cliënten",
    "client-detail.html": "Cliënten",
    "zorgsoorten.html": "Cliënten",
    "zorgsoort-detail.html": "Cliënten",
    "organisatie.html": "Cliënten",
    "organisatie-detail.html": "Cliënten",
    "gemeenten.html": "Cliënten",
    "gemeente-detail.html": "Cliënten",
    "beschikkingen.html": "Cliënten",
    "beschikkingen-dashboard.html": "Cliënten",
    "beschikking-detail.html": "Cliënten",
    "facturen.html": "Cliënten",
    "factuur-detail.html": "Cliënten",
    "facturen-importeren.html": "Cliënten",
    "bezetting.html": "Bezetting",
    // Incidenten en klachten (één gecombineerde top-level dropdown)
    "incidenten.html": "Incidenten en klachten",
    "incidenten-dashboard.html": "Incidenten en klachten",
    "incidenten-categorieen.html": "Incidenten en klachten",
    "incident-melden.html": "Incidenten en klachten",
    "verbeteringsmaatregelen.html": "Incidenten en klachten",
    "klachten.html": "Incidenten en klachten",
    // Kilometers
    "kilometers.html": "Kilometers",
    "km-afstanden.html": "Kilometers",
    "km-afwijkingen.html": "Kilometers",
    // Facturen (top)
    "facturen-te-beoordelen.html": "Facturen",
    "facturen-alle.html": "Facturen",
    "facturen-indiening.html": "Facturen",
    "invoice-detail.html": "Facturen",
    "zzp-facturen.html": "Facturen",
    "zzp-overuren.html": "Facturen",
    "zzp-reconciliatie.html": "Facturen",
    "zzp-bureau-facturen.html": "Facturen",
    "zzp-factuur-detail.html": "Facturen",
    // Taken / Beleid / SharePoint
    "taken.html": "Taken",
    "beleid-documenten.html": "Beleid",
    "beleid.html": "Beleid",
    "sharepoint.html": "SharePoint",
    // Financiën
    "financien-locaties.html": "Financiën",
    "financien-overhead.html": "Financiën",
    "financien-zorgsoorten.html": "Financiën",
    // Audit
    "audit.html": "Audit",
    // Organisatie (top)
    "teams.html": "Organisatie",
    "rollen.html": "Organisatie",
    "rol-detail.html": "Organisatie",
    "gebruikers.html": "Organisatie",
    // Instellingen
    "instellingen.html": "Instellingen",
    "mijn-gegevens.html": "Mijn gegevens",
    "notifications.html": "Instellingen",
  };

  function syncTopNavActiveState() {
    const currentFile = normalizeFileName(window.location.pathname);
    const links = Array.from(nav.querySelectorAll(".top-link"));
    links.forEach((link) => link.classList.remove("is-active"));

    // 1. Directe href-match (clean-URL genormaliseerd).
    let activeLink = links.find((link) => {
      const href = (link.getAttribute("href") || "").trim();
      if (!href || href === "#") return false;
      return normalizeFileName(href) === currentFile;
    });

    // 2. Pagina → onderwerp-map (sub-pagina's zonder eigen top-link).
    if (!activeLink) {
      const topic = PAGE_TOPIC[currentFile];
      if (topic) {
        activeLink = links.find((link) => getTopLinkLabel(link) === topic) || null;
      }
    }

    if (activeLink) activeLink.classList.add("is-active");
  }

  // -------------------------------------------------------------------------
  // 2) Failsafe-navigatie + directe routes (veiligheidsnet voor `#`-hrefs).
  // -------------------------------------------------------------------------
  const FALLBACK_ROUTE = "home";

  function resolveTopRoute(link) {
    const parentNavItem = link && link.closest(".top-nav-item");
    const firstRealSubLink = parentNavItem
      ? parentNavItem.querySelector('.top-dropdown-link[href]:not([href="#"])')
      : null;
    return (firstRealSubLink && firstRealSubLink.getAttribute("href")) || FALLBACK_ROUTE;
  }

  function wireFailsafeNavigation() {
    nav.addEventListener(
      "click",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        const link = target.closest(".top-link, .top-dropdown-link");
        if (!link || !nav.contains(link)) return;
        const href = (link.getAttribute("href") || "").trim();
        if (href === "" || href === "#") {
          event.preventDefault();
          const dest = link.classList.contains("top-link")
            ? resolveTopRoute(link)
            : FALLBACK_ROUTE;
          window.location.href = dest;
        }
      },
      true
    );
  }

  // -------------------------------------------------------------------------
  // 3) Dropdown-positionering (position:fixed → viewport-klem, niet afgekapt).
  // -------------------------------------------------------------------------
  const dropdownItems = Array.from(nav.querySelectorAll(".top-nav-item--dropdown"));
  let openItem = null;
  let closeTimer = null;

  function positionDropdown(item) {
    const dd = item.querySelector(".top-dropdown");
    if (!dd) return;
    const margin = 8;
    const gap = 4;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const r = item.getBoundingClientRect();
    // Reset zodat we de natuurlijke maten meten.
    dd.style.left = "0px";
    dd.style.right = "auto";
    dd.style.maxHeight = "";
    dd.style.overflowX = "";
    dd.style.overflowY = "";
    // Horizontale klem. Gebruik de VISUELE breedte (getBoundingClientRect),
    // consistent met de trigger-positie r — zo klopt de klem ook als de pagina
    // geschaald/gezoomd wordt.
    const w = dd.getBoundingClientRect().width || 300;
    let left = r.left;
    if (left + w > vw - margin) left = vw - margin - w;
    if (left < margin) left = margin;
    dd.style.left = Math.round(left) + "px";
    // Verticale klem: past het menu onder de knop? Zo niet → tegen de knop
    // plakken (geen brug nodig) en interne scroll, zodat het NOOIT onderaan
    // het scherm wordt afgekapt (belangrijk voor de hoge HR/Cliënten mega-menu's
    // op korte of ingezoomde schermen).
    const avail = vh - (r.bottom + gap) - margin;
    if (dd.scrollHeight > avail) {
      dd.style.top = Math.round(r.bottom) + "px";
      dd.style.maxHeight = Math.max(140, vh - r.bottom - margin) + "px";
      dd.style.overflowX = "hidden";
      dd.style.overflowY = "auto";
    } else {
      dd.style.top = Math.round(r.bottom + gap) + "px";
    }
  }

  // Zichtbaarheid wordt in JS beheerd (.is-open op het item), NIET via pure CSS
  // :hover. Reden: (1) de dropdown wordt pas getoond nádat hij correct is
  // gepositioneerd (geen flits op top:0/left:0); (2) een kleine sluitvertraging
  // overbrugt het gaatje tussen knop en dropdown — ook als de dropdown door de
  // viewport-klem horizontaal van de knop is verschoven (rechtse onderwerpen).
  function openDropdown(item) {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    if (openItem && openItem !== item) openItem.classList.remove("is-open");
    openItem = item;
    positionDropdown(item);
    item.classList.add("is-open");
  }

  function closeOpenDropdown() {
    closeTimer = null;
    if (openItem) {
      openItem.classList.remove("is-open");
      openItem = null;
    }
  }

  function scheduleClose() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(closeOpenDropdown, 160);
  }

  function setupDropdowns() {
    dropdownItems.forEach((item) => {
      item.addEventListener("mouseenter", () => openDropdown(item));
      item.addEventListener("mouseleave", scheduleClose);
      item.addEventListener("focusin", () => openDropdown(item));
      item.addEventListener("focusout", (e) => {
        if (!item.contains(e.relatedTarget)) scheduleClose();
      });
    });
  }

  let repositionScheduled = false;
  function scheduleReposition() {
    if (repositionScheduled) return;
    repositionScheduled = true;
    requestAnimationFrame(() => {
      repositionScheduled = false;
      if (openItem) positionDropdown(openItem);
    });
  }

  // -------------------------------------------------------------------------
  // 4) Overflow "meer"-menu — schuif onderwerpen die niet passen naar rechts.
  // -------------------------------------------------------------------------
  // Directe onderwerp-kinderen van de balk (losse links + dropdown-wraps), in
  // hun natuurlijke volgorde. Door permissies verborgen items (display:none)
  // tellen niet mee en komen ook niet in het "meer"-menu.
  function topItems() {
    return Array.from(nav.children).filter(
      (el) =>
        el.nodeType === 1 &&
        (el.classList.contains("top-link") || el.classList.contains("top-nav-item"))
    );
  }

  function isPermHidden(el) {
    // permissions-nav-hide.js verbergt items via inline display:none.
    return !el || el.style.display === "none";
  }

  function topLinkOf(child) {
    return child.classList.contains("top-link") ? child : child.querySelector(".top-link");
  }

  function buildPanelItem(child) {
    const kop = topLinkOf(child);
    const a = document.createElement("a");
    a.className = "top-nav-overflow-item";
    let href = (kop && kop.getAttribute("href") ? kop.getAttribute("href") : "").trim();
    if (!href || href === "#") href = resolveTopRoute(kop);
    a.setAttribute("href", href);
    a.setAttribute("data-href", href);
    a.setAttribute("role", "menuitem");
    a.textContent = getTopLinkLabel(kop);
    if (kop && kop.classList.contains("is-active")) a.classList.add("is-active");
    return a;
  }

  function openPanel() {
    if (!overflowPanel || !overflowBtn) return;
    overflowPanel.classList.add("is-open");
    overflowBtn.setAttribute("aria-expanded", "true");
  }
  function closePanel() {
    if (!overflowPanel || !overflowBtn) return;
    overflowPanel.classList.remove("is-open");
    overflowBtn.setAttribute("aria-expanded", "false");
  }
  function panelIsOpen() {
    return overflowPanel && overflowPanel.classList.contains("is-open");
  }

  function recomputeOverflow() {
    if (!overflowBtn || !overflowPanel) return;

    // Reset: alles weer zichtbaar, paneel leeg, pijltje verborgen.
    const items = topItems();
    items.forEach((el) => el.classList.remove("top-nav-hidden"));
    overflowPanel.innerHTML = "";
    overflowBtn.classList.remove("is-visible");

    const visible = items.filter((el) => !isPermHidden(el));
    if (!visible.length) {
      closePanel();
      return;
    }

    // Past alles binnen de balk (pijltje verborgen)? Dan klaar — geen menu.
    const last = visible[visible.length - 1];
    let navRight = nav.getBoundingClientRect().right;
    if (last.getBoundingClientRect().right <= navRight + FIT_TOL) {
      closePanel();
      return;
    }

    // Er is overloop → toon het pijltje (dat verkleint de balk) en hermeet.
    overflowBtn.classList.add("is-visible");
    navRight = nav.getBoundingClientRect().right;
    const threshold = navRight - EDGE_TOL;

    // Eerste onderwerp (van links) waarvan de rechterrand voorbij de grens valt;
    // dat onderwerp en alles erna gaan naar het "meer"-menu. De voorgaande
    // onderwerpen verschuiven niet (links uitgelijnd), dus één meting volstaat.
    let cutoff = -1;
    for (let i = 0; i < visible.length; i++) {
      if (visible[i].getBoundingClientRect().right > threshold) {
        cutoff = i;
        break;
      }
    }
    if (cutoff === -1) {
      // Het pijltje maakte genoeg ruimte vrij → toch niets te verbergen.
      overflowBtn.classList.remove("is-visible");
      closePanel();
      return;
    }
    if (cutoff === 0) cutoff = 1; // houd minstens één onderwerp in de balk

    for (let i = cutoff; i < visible.length; i++) {
      visible[i].classList.add("top-nav-hidden");
      overflowPanel.appendChild(buildPanelItem(visible[i]));
    }

    if (!overflowPanel.children.length) {
      overflowBtn.classList.remove("is-visible");
      closePanel();
    }
  }

  function wireOverflowMenu() {
    if (!overflowBtn || !overflowPanel) return;

    // Klik op het pijltje → open/sluit. Kliks die uit het paneel zelf komen
    // (een onderwerp) niet als toggle behandelen.
    overflowBtn.addEventListener("click", (e) => {
      if (e.target.closest(".top-nav-overflow-item")) return;
      e.preventDefault();
      if (panelIsOpen()) closePanel();
      else openPanel();
    });

    // Navigatie vanuit het paneel zelf afhandelen (het paneel zit in de knop;
    // zo voorkomen we toggle-conflicten en nested-anchor-eigenaardigheden).
    overflowPanel.addEventListener("click", (e) => {
      const item = e.target.closest(".top-nav-overflow-item");
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      const href = item.getAttribute("data-href") || item.getAttribute("href");
      if (href) window.location.href = href;
    });

    // Buiten klikken / Escape → sluiten.
    document.addEventListener("click", (e) => {
      if (!overflowBtn.contains(e.target)) closePanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });
  }

  // -------------------------------------------------------------------------
  // Publieke hook: permissions-nav-hide.js roept dit aan na het verbergen van
  // rol-beperkte items, zodat actieve-markering + overflow + dropdownpositie
  // kloppen.
  // -------------------------------------------------------------------------
  window.recomputeTopNavOverflow = function () {
    syncTopNavActiveState();
    recomputeOverflow();
    if (openItem) positionDropdown(openItem);
  };

  let overflowScheduled = false;
  function scheduleOverflow() {
    if (overflowScheduled) return;
    overflowScheduled = true;
    requestAnimationFrame(() => {
      overflowScheduled = false;
      recomputeOverflow();
    });
  }

  // --- init ---
  syncTopNavActiveState();
  setupDropdowns();
  wireFailsafeNavigation();
  wireOverflowMenu();
  recomputeOverflow();
  // Nogmaals ná de eerste layout/fontlading: de definitieve breedtes (en dus de
  // overloop) staan pas vast als de fonts geladen zijn.
  requestAnimationFrame(recomputeOverflow);
  window.addEventListener("load", scheduleOverflow);
  try {
    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
      document.fonts.ready.then(scheduleOverflow);
    }
  } catch (e) {
    /* fonts-API onbeschikbaar → init-metingen volstaan */
  }

  window.addEventListener("resize", () => {
    scheduleReposition();
    scheduleOverflow();
  });
  window.addEventListener("scroll", scheduleReposition, true);

  // De balk kan ook breder/smaller worden zonder window-resize (sidebar in-/
  // uitklappen, layout-verschuivingen) → herbereken bij elke maatverandering.
  try {
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => scheduleOverflow());
      ro.observe(nav);
      const track = nav.closest(".top-nav-track");
      if (track) ro.observe(track);
    }
  } catch (e) {
    /* ResizeObserver onbeschikbaar → resize/load-metingen volstaan */
  }
})();
