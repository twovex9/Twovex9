/*
 * besa-searchable-select.js
 * -----------------------------------------------------------------------------
 * Maakt een bestaande native <select> doorzoekbaar: je kunt letters typen om de
 * lijst te filteren (bijv. een medewerkers- of clientnaam) in plaats van te
 * scrollen door alle namen. De native <select> blijft de bron van waarheid -
 * we schrijven de gekozen waarde terug en dispatchen 'change'/'input', zodat
 * alle bestaande formulier-logica ongewijzigd blijft werken.
 *
 * Gebruik: zet data-searchable op de <select> in de HTML. Het script enhanced
 * deze automatisch (ook selects die later met opties gevuld worden - de opties
 * worden live uit de <select> gelezen). Of roep handmatig aan:
 *   window.besaSearchableSelect.enhance(selectEl);
 *
 * Volledig op design-tokens -> werkt in licht en donker.
 */
(function (global) {
  "use strict";

  function textOf(opt) {
    return (opt && (opt.textContent || "")).trim();
  }

  function isPlaceholder(opt) {
    // Eerste optie met lege value behandelen we als placeholder ("Selecteer ...").
    return opt && (opt.value === "" || opt.value == null);
  }

  function enhance(select) {
    if (!select || select.nodeName !== "SELECT") return;
    if (select.__bssEnhanced) return;
    select.__bssEnhanced = true;

    // --- Wrapper opbouwen, native select erin verbergen ---------------------
    var wrap = document.createElement("div");
    wrap.className = "bss";
    // Behoud flex-gedrag van de oorspronkelijke select binnen rijen.
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add("bss-native");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");

    var input = document.createElement("input");
    input.type = "text";
    input.className = "im-input bss-input";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-autocomplete", "list");
    if (select.id) input.setAttribute("aria-controls", select.id + "-bss-menu");

    var menu = document.createElement("div");
    menu.className = "bss-menu";
    menu.setAttribute("role", "listbox");
    if (select.id) menu.id = select.id + "-bss-menu";
    menu.hidden = true;

    wrap.appendChild(input);
    wrap.appendChild(menu);

    var open = false;
    var activeIndex = -1;
    var filtered = []; // [{value, label}]

    function placeholderText() {
      var first = select.options[0];
      return first && isPlaceholder(first) ? textOf(first) : "Selecteer...";
    }

    function selectedLabel() {
      var opt = select.options[select.selectedIndex];
      if (!opt || isPlaceholder(opt)) return "";
      return textOf(opt);
    }

    // Toont in het tekstveld wat er nu in de native select geselecteerd is.
    function syncDisplay() {
      if (open) return; // tijdens typen niet overschrijven
      input.value = selectedLabel();
      input.placeholder = placeholderText();
    }

    function allOptions() {
      var out = [];
      for (var i = 0; i < select.options.length; i++) {
        var o = select.options[i];
        if (isPlaceholder(o)) continue;
        if (o.disabled) continue;
        out.push({ value: o.value, label: textOf(o) });
      }
      return out;
    }

    // Voorletter-gericht filteren: een naam telt mee als de hele tekst óf een
    // los woord (voornaam/achternaam/tussenvoegsel) met de getypte letters
    // begint. Zo komt bij "A" iedereen met voorletter A naar boven, bij "Ba"
    // alleen wie met "Ba" begint, enz. Vindt niets met die prefix? Dan vallen
    // we terug op een losse substring-match, zodat een fragment middenin een
    // naam alsnog resultaat geeft.
    function matchesPrefix(label, q) {
      var lo = label.toLowerCase();
      if (lo.indexOf(q) === 0) return true;
      var words = lo.split(/[\s\-]+/);
      for (var i = 0; i < words.length; i++) {
        if (words[i].indexOf(q) === 0) return true;
      }
      return false;
    }

    function renderMenu(query) {
      var q = (query || "").trim().toLowerCase();
      var opts = allOptions();
      if (!q) {
        filtered = opts;
      } else {
        filtered = opts.filter(function (o) { return matchesPrefix(o.label, q); });
        if (filtered.length === 0) {
          filtered = opts.filter(function (o) { return o.label.toLowerCase().indexOf(q) !== -1; });
        }
      }

      menu.innerHTML = "";

      // Wis-optie bovenaan: terug naar de lege/placeholder-waarde (bv. "open
      // dienst" of een filter wissen). Alleen tonen als er nu echt iets gekozen
      // is en de select een placeholder-optie heeft.
      var ph = select.options[0];
      if (ph && isPlaceholder(ph) && String(select.value) !== "") {
        var clearItem = document.createElement("div");
        clearItem.className = "bss-option bss-clear";
        clearItem.setAttribute("role", "option");
        clearItem.dataset.value = "";
        clearItem.textContent = textOf(ph) || "Wissen";
        clearItem.addEventListener("mousedown", function (e) {
          e.preventDefault();
          choose("");
        });
        menu.appendChild(clearItem);
      }

      if (filtered.length === 0) {
        var empty = document.createElement("div");
        empty.className = "bss-empty";
        empty.textContent = "Geen resultaten";
        menu.appendChild(empty);
        activeIndex = -1;
        return;
      }
      var curVal = select.value;
      filtered.forEach(function (o, idx) {
        var item = document.createElement("div");
        item.className = "bss-option";
        item.setAttribute("role", "option");
        item.dataset.value = o.value;
        item.textContent = o.label;
        if (String(o.value) === String(curVal)) item.classList.add("is-selected");
        if (idx === activeIndex) item.classList.add("is-active");
        item.addEventListener("mousedown", function (e) {
          // mousedown i.p.v. click -> voor blur, zodat selectie niet wegvalt.
          e.preventDefault();
          choose(o.value);
        });
        menu.appendChild(item);
      });
    }

    function openMenu() {
      if (open) return;
      open = true;
      input.value = ""; // leeg veld -> toon volledige lijst, klaar om te typen
      activeIndex = -1;
      renderMenu("");
      menu.hidden = false;
      input.setAttribute("aria-expanded", "true");
      wrap.classList.add("is-open");
    }

    function closeMenu(revert) {
      if (!open) return;
      open = false;
      menu.hidden = true;
      input.setAttribute("aria-expanded", "false");
      wrap.classList.remove("is-open");
      activeIndex = -1;
      if (revert !== false) syncDisplay();
    }

    function choose(value) {
      if (String(select.value) !== String(value)) {
        select.value = String(value);
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      closeMenu();
    }

    function moveActive(delta) {
      if (!open) { openMenu(); }
      if (filtered.length === 0) return;
      activeIndex += delta;
      if (activeIndex < 0) activeIndex = filtered.length - 1;
      if (activeIndex >= filtered.length) activeIndex = 0;
      renderMenu(input.value);
      var activeEl = menu.querySelector(".bss-option.is-active");
      if (activeEl && activeEl.scrollIntoView) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }

    // --- Events ---------------------------------------------------------------
    input.addEventListener("focus", openMenu);
    input.addEventListener("click", function () { if (!open) openMenu(); });

    input.addEventListener("input", function () {
      if (!open) open = true;
      activeIndex = -1;
      renderMenu(input.value);
      menu.hidden = false;
      wrap.classList.add("is-open");
    });

    input.addEventListener("keydown", function (e) {
      switch (e.key) {
        case "ArrowDown": e.preventDefault(); moveActive(1); break;
        case "ArrowUp":   e.preventDefault(); moveActive(-1); break;
        case "Enter":
          if (open) {
            e.preventDefault();
            if (activeIndex >= 0 && filtered[activeIndex]) {
              choose(filtered[activeIndex].value);
            } else if (filtered.length === 1) {
              choose(filtered[0].value);
            } else {
              closeMenu();
            }
          }
          break;
        case "Escape":
          if (open) { e.preventDefault(); closeMenu(); }
          break;
        case "Tab":
          closeMenu();
          break;
      }
    });

    input.addEventListener("blur", function () {
      // Korte vertraging zodat een klik op een optie (mousedown) afgehandeld is.
      setTimeout(function () { closeMenu(); }, 120);
    });

    // Klik buiten -> sluiten.
    document.addEventListener("mousedown", function (e) {
      if (open && !wrap.contains(e.target)) closeMenu();
    });

    // Native select verandert (programmatic of via change) -> display bijwerken.
    select.addEventListener("change", syncDisplay);

    // Opties opnieuw gevuld (fillSelect herschrijft innerHTML) -> display + (zo
    // open) menu verversen.
    var mo = new MutationObserver(function () {
      if (open) renderMenu(input.value);
      else syncDisplay();
    });
    mo.observe(select, { childList: true });

    syncDisplay();
  }

  function enhanceAll(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("select[data-searchable]");
    for (var i = 0; i < nodes.length; i++) enhance(nodes[i]);
  }

  function init() {
    enhanceAll(document);
    // Vang selects op die later in de DOM verschijnen (modals e.d.).
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches("select[data-searchable]")) enhance(n);
          if (n.querySelectorAll) enhanceAll(n);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  global.besaSearchableSelect = { enhance: enhance, enhanceAll: enhanceAll };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
