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
    var rect = btn.getBoundingClientRect();
    var panelWidth = panel.offsetWidth || 252;
    var panelHeight = panel.offsetHeight || 300;
    var vw = w.innerWidth;
    var vh = w.innerHeight;
    var alignRight = rect.left + (rect.width / 2) > vw / 2;
    var preferredLeft = alignRight ? rect.right - panelWidth : rect.left;
    var minLeft = EDGE_MARGIN;
    var maxLeft = vw - panelWidth - EDGE_MARGIN;
    var left = Math.max(minLeft, Math.min(maxLeft, preferredLeft));
    var top = rect.bottom + TOP_GAP;
    var maxTop = vh - panelHeight - EDGE_MARGIN;
    if (top > maxTop) {
      var aboveTop = rect.top - panelHeight - TOP_GAP;
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
          positionPanel(panel);
          break;
        }
      }
    });
    obs.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
    panel.__fpObserver = obs;
    if (!panel.hasAttribute("hidden")) {
      positionPanel(panel);
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

  function init() {
    attachAll();
    watchForNewPanels();
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
