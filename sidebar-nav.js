/* Zijbalk: uitklapbare groepen (bv. Salarishuis) */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-side-group]").forEach(function (group) {
      var btn = group.querySelector(".side-group__toggle");
      var panel = group.querySelector(".side-group__panel");
      if (!btn || !panel) return;

      btn.addEventListener("click", function () {
        var open = group.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        panel.hidden = !open;
      });
    });
  });
})();
