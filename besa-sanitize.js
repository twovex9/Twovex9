/* global window, document, DOMParser */
/**
 * besa-sanitize.js — minimale, afhankelijkheidsvrije HTML-sanitizer voor
 * door gebruikers ingevoerde rich-text (nieuwsberichten, medewerker-notities,
 * verzuim-/beschikking-notities, planning-omschrijvingen).
 *
 * Probleem (audit 2026-06-09): deze velden worden via `innerHTML` gerenderd en
 * bevatten vrije, door (mogelijk niet-vertrouwde) gebruikers opgeslagen HTML →
 * stored-XSS. Escapen kan niet, want de opmaak (vet/cursief/lijsten/links) moet
 * behouden blijven. Daarom: parse de HTML inert via DOMParser en laat alleen een
 * veilige allowlist van tags/attributen door; verwijder scripts, event-handlers
 * (on*) en gevaarlijke URL-schema's (javascript:/vbscript:/data: m.u.v. images).
 *
 * Gebruik:  el.innerHTML = window.besaSanitizeHtml(opgeslagenHtml);
 *
 * DOMParser voert tijdens het parsen geen scripts uit en laadt geen resources,
 * dus het parsen zelf is veilig; na het schonen is de innerHTML veilig toe te
 * kennen.
 */
(function (global) {
  "use strict";

  // Opmaak-tags die de rich-text-editor (execCommand) en nieuws-editor maken.
  var ALLOWED_TAGS = {
    A: 1, ABBR: 1, B: 1, BLOCKQUOTE: 1, BR: 1, CODE: 1, DIV: 1, EM: 1, H1: 1,
    H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, HR: 1, I: 1, IMG: 1, LI: 1, OL: 1, P: 1,
    PRE: 1, S: 1, SPAN: 1, STRONG: 1, SUB: 1, SUP: 1, TABLE: 1, TBODY: 1, TD: 1,
    TH: 1, THEAD: 1, TR: 1, U: 1, UL: 1
  };
  var ALLOWED_ATTR = {
    href: 1, src: 1, alt: 1, title: 1, colspan: 1, rowspan: 1, start: 1, type: 1
  };

  function safeUrl(value) {
    var s = String(value == null ? "" : value).trim();
    // Blokkeer scripting-schema's; sta http(s), mailto, tel, relatieve paden en
    // (alleen voor afbeeldingen) data:image-base64 toe.
    if (/^javascript:/i.test(s) || /^vbscript:/i.test(s)) return "";
    if (/^data:/i.test(s) && !/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(s)) return "";
    return s;
  }

  function cleanElement(node) {
    var children = Array.prototype.slice.call(node.childNodes);
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c.nodeType === 1) {
        var tag = c.tagName ? c.tagName.toUpperCase() : "";
        if (!ALLOWED_TAGS[tag]) {
          // Niet-toegestane tag (script/style/iframe/object/…) volledig weg,
          // inclusief inhoud (geen CSS/JS-tekst laten doorlekken).
          c.parentNode.removeChild(c);
          continue;
        }
        var attrs = Array.prototype.slice.call(c.attributes);
        for (var a = 0; a < attrs.length; a++) {
          var name = attrs[a].name.toLowerCase();
          if (name.indexOf("on") === 0 || !ALLOWED_ATTR[name]) {
            c.removeAttribute(attrs[a].name);
            continue;
          }
          if (name === "href" || name === "src") {
            var u = safeUrl(attrs[a].value);
            if (!u) c.removeAttribute(attrs[a].name);
            else c.setAttribute(attrs[a].name, u);
          }
        }
        if (tag === "A") {
          c.setAttribute("rel", "noopener noreferrer nofollow");
          c.setAttribute("target", "_blank");
        }
        cleanElement(c);
      } else if (c.nodeType === 8) {
        // HTML-commentaar weg (kan conditional-comment-trucs bevatten).
        c.parentNode.removeChild(c);
      }
      // Tekst-nodes (nodeType 3) blijven ongemoeid.
    }
  }

  function sanitizeHtml(html) {
    var input = String(html == null ? "" : html);
    if (!input) return "";
    try {
      var doc = new DOMParser().parseFromString(input, "text/html");
      cleanElement(doc.body);
      return doc.body.innerHTML;
    } catch (e) {
      // Fallback: volledig escapen i.p.v. ruwe HTML doorlaten.
      var div = document.createElement("div");
      div.textContent = input;
      return div.innerHTML;
    }
  }

  global.besaSanitizeHtml = sanitizeHtml;
})(typeof window !== "undefined" ? window : this);
