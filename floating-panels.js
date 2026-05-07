/**
 * floating-panels.js — generieke positionering voor "kolommen-paneel"-stijl
 * dropdowns. Werkt op alle elementen met class .columns-panel, ongeacht waar ze
 * in de DOM zitten of of een ancestor overflow:hidden heeft.
 *
 * Werking:
 * - In CSS: alle .columns-panel hebben position: fixed en hoge z-index
 * - Bij open (hidden-attribute weg): bereken positie op basis van bijbehorende
 *   .columns-btn via getBoundingClientRect.
 * - Slim alignment: knop in rechterhelft → paneel rechts uitlijnen, anders links.
 * - Clamp positie binnen viewport (8px marge).
 * - Re-positioneer bij window resize en scroll.
 *
 * Triggert automatisch op alle .columns-panel die nu of later in de DOM komen.
 */
(function (w) {
  "use strict";

  if (w.__floatingPanelsBound) return;
  w.__floatingPanelsBound = true;

  var EDGE_MARGIN = 8;
  var TOP_GAP = 8;

  function findRelatedButton(panel) {
    if (!panel) return null;
    var labelId = panel.getAttribute("aria-labelledby");
    if (labelId) {
      var byId = document.getElementById(labelId);
      if (byId) return byId;
    }
    var wrap = panel.closest(".columns-dropdown");
    if (wrap) {
      var inWrap = wrap.querySelector(".columns-btn") || wrap.querySelector("button[aria-haspopup]");
      if (inWrap) return inWrap;
    }
    var prev = panel.previousElementSibling;
    while (prev) {
      if (prev.matches && (prev.matches(".columns-btn") || prev.matches("button[aria-haspopup]"))) {
        return prev;
      }
      prev = prev.previousElementSibling;
    }
    var parent = panel.parentElement;
    if (parent) {
      var sib = parent.querySelector(".columns-btn") || parent.querySelector("button[aria-haspopup]");
      if (sib) return sib;
    }
    return null;
  }

  function positionPanel(panel) {
    if (!panel || panel.hasAttribute("hidden")) return;
    var btn = findRelatedButton(panel);
    if (!btn) return;
    var btnRect = btn.getBoundingClientRect();
    var vw = w.innerWidth || document.documentElement.clientWidth;
    var vh = w.innerHeight || document.documentElement.clientHeight;
    // Reset eerst inline left/right zodat we de natuurlijke breedte van het
    // paneel kunnen meten op basis van CSS (width: 252px, max-width: 100vw-16px).
    panel.style.left = "";
    panel.style.right = "";
    // Forceer sync layout en lees de echte rendered breedte met
    // getBoundingClientRect — betrouwbaarder dan offsetWidth tijdens transitions.
    void panel.offsetWidth;
    var panelRect = panel.getBoundingClientRect();
    var panelWidth = panelRect.width || panel.offsetWidth || 252;
    var panelHeight = panelRect.height || panel.offsetHeight || 300;
    // Hard cap: paneel mag nooit breder zijn dan viewport - 16px.
    var capWidth = Math.max(160, vw - 2 * EDGE_MARGIN);
    if (panelWidth > capWidth) {
      panelWidth = capWidth;
      panel.style.width = panelWidth + "px";
    }
    var alignRight = btnRect.left + (btnRect.width / 2) > vw / 2;
    var preferredLeft = alignRight ? btnRect.right - panelWidth : btnRect.left;
    var minLeft = EDGE_MARGIN;
    var maxLeft = vw - panelWidth - EDGE_MARGIN;
    if (maxLeft < minLeft) maxLeft = minLeft;
    var left = Math.max(minLeft, Math.min(maxLeft, preferredLeft));
    var top = btnRect.bottom + TOP_GAP;
    var maxTop = vh - panelHeight - EDGE_MARGIN;
    if (top > maxTop) {
      var aboveTop = btnRect.top - panelHeight - TOP_GAP;
      if (aboveTop >= EDGE_MARGIN) {
        top = aboveTop;
      } else {
        top = Math.max(EDGE_MARGIN, maxTop);
      }
    }
    panel.style.top = top + "px";
    panel.style.left = left + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    // Final defensieve check: lees de positie terug en als hij ondanks alles
    // toch over de rechter rand zou vallen, klem 'm hard.
    var finalRect = panel.getBoundingClientRect();
    if (finalRect.right > vw - EDGE_MARGIN) {
      var correctedLeft = vw - panelWidth - EDGE_MARGIN;
      if (correctedLeft < EDGE_MARGIN) correctedLeft = EDGE_MARGIN;
      panel.style.left = correctedLeft + "px";
    }
    if (finalRect.left < EDGE_MARGIN) {
      panel.style.left = EDGE_MARGIN + "px";
    }
  }

  // Plant een herpositionering op de volgende animation frame zodat we ook
  // kloppen wanneer het paneel net zichtbaar is geworden en het CSS-display
  // nog niet was berekend op het moment dat de Mutation Observer firet.
  function schedulePosition(panel) {
    positionPanel(panel);
    if (typeof w.requestAnimationFrame === "function") {
      w.requestAnimationFrame(function () { positionPanel(panel); });
    }
  }

  function repositionAll() {
    var open = document.querySelectorAll(".columns-panel:not([hidden])");
    for (var i = 0; i < open.length; i += 1) {
      positionPanel(open[i]);
    }
  }

  function attachObserver(panel) {
    if (panel.__fpObserver) return;
    var obs = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var m = mutations[i];
        if (m.attributeName === "hidden" && !panel.hasAttribute("hidden")) {
          schedulePosition(panel);
          break;
        }
      }
    });
    obs.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    panel.__fpObserver = obs;
    if (!panel.hasAttribute("hidden")) {
      schedulePosition(panel);
    }
  }

  function attachAll() {
    var panels = document.querySelectorAll(".columns-panel");
    for (var i = 0; i < panels.length; i += 1) {
      attachObserver(panels[i]);
    }
  }

  function watchForNewPanels() {
    var bodyObs = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var added = mutations[i].addedNodes;
        if (!added) continue;
        for (var j = 0; j < added.length; j += 1) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches(".columns-panel")) {
            attachObserver(node);
          } else if (node.querySelectorAll) {
            var inside = node.querySelectorAll(".columns-panel");
            for (var k = 0; k < inside.length; k += 1) {
              attachObserver(inside[k]);
            }
          }
        }
      }
    });
    bodyObs.observe(document.body, { childList: true, subtree: true });
  }

  // Document-niveau click delegation als extra vangnet: zodra een gebruiker op
  // een .columns-btn klikt, plannen we direct én op de volgende frame een
  // positionering. Dit pakt edge-cases waar de MutationObserver om wat voor
  // reden dan ook niet (op tijd) firet.
  function wireGlobalClickDelegation() {
    document.addEventListener(
      "click",
      function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var btn = t.closest(".columns-btn") || t.closest('button[aria-haspopup="true"]');
        if (!btn) return;
        var wrap = btn.closest(".columns-dropdown");
        var panel = wrap ? wrap.querySelector(".columns-panel") : null;
        if (!panel && btn.id) {
          panel = document.querySelector('.columns-panel[aria-labelledby="' + btn.id + '"]');
        }
        if (!panel) return;
        // Pakt de open-staat na de page-script handler heeft gerund.
        if (typeof w.requestAnimationFrame === "function") {
          w.requestAnimationFrame(function () {
            if (!panel.hasAttribute("hidden")) schedulePosition(panel);
          });
        } else {
          setTimeout(function () {
            if (!panel.hasAttribute("hidden")) schedulePosition(panel);
          }, 0);
        }
      },
      true
    );
  }

  function init() {
    attachAll();
    watchForNewPanels();
    wireGlobalClickDelegation();
    w.addEventListener("resize", repositionAll);
    w.addEventListener("scroll", repositionAll, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  w.__repositionFloatingPanels = repositionAll;
})(window);
