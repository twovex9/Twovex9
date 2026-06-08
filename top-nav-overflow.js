/* top-nav-overflow.js — top-navigatie controller.
 *
 * Historie: dit bestand verborg vroeger "overlopende" top-nav items in een
 * "meer"-menu. Dat veroorzaakte het verspringen/verdwijnen/flikkeren van
 * onderwerpen bij navigatie (welke items werden verborgen hing af van de
 * paginabreedte én de actieve-item-breedte, en gebeurde ná de eerste paint).
 *
 * Nieuw gedrag (stabiel):
 *   - De top-nav verbergt NIETS meer. Alle onderwerpen staan altijd in dezelfde
 *     volgorde. Past niet alles op het scherm? Dan scrollt de balk horizontaal
 *     (CSS overflow-x:auto). De scrollpositie wordt bewaard in sessionStorage
 *     zodat de balk bij elke paginawissel op exact dezelfde plek blijft staan.
 *   - Dropdowns staan op position:fixed (CSS) en worden hier bij hover/focus
 *     correct gepositioneerd en binnen de viewport geklemd, zodat ze niet door
 *     de scroll-container worden afgekapt.
 *   - De actieve top-link wordt o.b.v. de huidige pagina gemarkeerd, vóór de
 *     eerste paint (dit script laadt non-defer onderaan de body).
 */
(function () {
  "use strict";

  const nav = document.querySelector(".top-nav");
  if (!nav) return;

  const SCROLL_KEY = "besa-topnav-scroll";

  function normalizeFileName(pathname) {
    const cleaned = String(pathname || "").split("?")[0].split("#")[0];
    const parts = cleaned.split("/").filter(Boolean);
    let last = (parts[parts.length - 1] || "index.html").toLowerCase();
    // Clean-URL (vercel cleanUrls): /taken -> taken.html
    if (last && last.indexOf(".") === -1) last += ".html";
    return last || "index.html";
  }

  function getTopLinkLabel(link) {
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
    "urendeclaraties.html": "Cliënten",
    "uren-budgettering.html": "Cliënten",
    "facturen-importeren.html": "Cliënten",
    "incidenten.html": "Cliënten",
    "incidenten-dashboard.html": "Cliënten",
    "incidenten-categorieen.html": "Cliënten",
    "incident-melden.html": "Cliënten",
    "verbeteringsmaatregelen.html": "Cliënten",
    "klachten.html": "Cliënten",
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
    "mijn-gegevens.html": "Instellingen",
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
    const parentNavItem = link.closest(".top-nav-item");
    const firstRealSubLink = parentNavItem?.querySelector(
      '.top-dropdown-link[href]:not([href="#"])'
    );
    return firstRealSubLink?.getAttribute("href") || FALLBACK_ROUTE;
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
  // 4) Scrollpositie bewaren zodat de balk op dezelfde plek blijft staan.
  // -------------------------------------------------------------------------
  function restoreScroll() {
    try {
      const saved = parseInt(sessionStorage.getItem(SCROLL_KEY) || "0", 10);
      if (saved > 0) nav.scrollLeft = saved;
    } catch (e) {
      /* sessionStorage onbeschikbaar → geen restore */
    }
  }

  let saveScheduled = false;
  function saveScrollSoon() {
    if (saveScheduled) return;
    saveScheduled = true;
    requestAnimationFrame(() => {
      saveScheduled = false;
      try {
        sessionStorage.setItem(SCROLL_KEY, String(Math.round(nav.scrollLeft)));
      } catch (e) {
        /* negeren */
      }
    });
  }

  // Verticaal muiswiel boven de balk → horizontaal scrollen (alleen als nodig).
  function wireWheelScroll() {
    nav.addEventListener(
      "wheel",
      (e) => {
        if (nav.scrollWidth <= nav.clientWidth) return;
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        const atStart = nav.scrollLeft <= 0;
        const atEnd = nav.scrollLeft >= nav.scrollWidth - nav.clientWidth - 1;
        // Aan de rand: blokkeer niet, laat de pagina gewoon verticaal scrollen.
        if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
        nav.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false }
    );
  }

  // -------------------------------------------------------------------------
  // Publieke hook: permissions-nav-hide.js roept dit aan na het verbergen van
  // rol-beperkte items, zodat actieve-markering + dropdownpositie kloppen.
  // -------------------------------------------------------------------------
  window.recomputeTopNavOverflow = function () {
    syncTopNavActiveState();
    if (openItem) positionDropdown(openItem);
  };

  // --- init ---
  restoreScroll();
  // Nogmaals ná de eerste layout/fontlading: bij init kan de nav nog niet
  // scrollbaar zijn (breedte nog niet definitief), waardoor de browser de
  // herstelde scrollLeft naar 0 zou klemmen.
  requestAnimationFrame(restoreScroll);
  syncTopNavActiveState();
  setupDropdowns();
  wireFailsafeNavigation();
  wireWheelScroll();

  nav.addEventListener("scroll", () => {
    saveScrollSoon();
    scheduleReposition();
  });
  window.addEventListener("scroll", scheduleReposition, true);
  window.addEventListener("resize", scheduleReposition);
})();
