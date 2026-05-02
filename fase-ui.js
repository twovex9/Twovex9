/**
 * Fase → CSS-classes (pills, stippen) — huisstijl in styles.css
 * Uitstraling: In aanvraag oranje, Actief + In zorg helgroen, Verlopen + Uit zorg rood,
 * In dienst gedempt donkergroen, Uit dienst lichtblauw. Zie :root/commentaar in styles.css.
 */
(function (g) {
  "use strict";

  function normClientFase(f) {
    return String(f || "")
      .toLowerCase()
      .trim();
  }

  g.besaFaseClientPillClass = function (f) {
    var t = normClientFase(f);
    if (t === "in aanvraag") return "cl-fase-pill cl-fase-pill--in-aanvraag";
    if (t === "uit zorg") return "cl-fase-pill cl-fase-pill--uit-zorg";
    if (t === "in zorg") return "cl-fase-pill cl-fase-pill--in-zorg";
    return "cl-fase-pill cl-fase-pill--in-zorg";
  };

  g.besaFaseClientSdotClass = function (f) {
    var t = normClientFase(f);
    if (t === "in aanvraag") return "client-detail-sdot--fase-in-aanvraag";
    if (t === "uit zorg") return "client-detail-sdot--fase-uit-zorg";
    if (t === "in zorg") return "client-detail-sdot--fase-in-zorg";
    return "client-detail-sdot--fase-in-zorg";
  };

  g.besaFaseBescDotClass = function (f) {
    f = String(f || "").toLowerCase();
    if (f === "in_aanvraag") return "bdtl-fase-dot bdtl-fase-dot--fase-in-aanvraag";
    if (f === "actief") return "bdtl-fase-dot bdtl-fase-dot--fase-actief";
    if (f === "in_zorg") return "bdtl-fase-dot bdtl-fase-dot--fase-in-zorg";
    if (f === "verlopen") return "bdtl-fase-dot bdtl-fase-dot--fase-verlopen";
    if (f === "uit_zorg") return "bdtl-fase-dot bdtl-fase-dot--fase-uit-zorg";
    if (f === "in_dienst") return "bdtl-fase-dot bdtl-fase-dot--fase-in-dienst";
    if (f === "uit_dienst") return "bdtl-fase-dot bdtl-fase-dot--fase-uit-dienst";
    return "bdtl-fase-dot bdtl-fase-dot--fase-onbekend";
  };
})(typeof window !== "undefined" ? window : this);
