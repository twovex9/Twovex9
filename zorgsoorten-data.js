/* Zorgsoorten (demo) — leesbaar via getZorgsoortItems */
(function (global) {
  "use strict";

  var ZS = [
    { id: "zs-1", naam: "Gecombineerd", tarieftype: "week", archived: false },
    { id: "zs-2", naam: "Wlz", tarieftype: "uur", archived: false },
    { id: "zs-3", naam: "Ambulant extern", tarieftype: "uur", archived: false },
    { id: "zs-4", naam: "Fasewonen", tarieftype: "dag", archived: false },
    { id: "zs-5", naam: "Ambulant intern", tarieftype: "uur", archived: false },
    { id: "zs-6", naam: "Verblijf en behandeling", tarieftype: "dag", archived: false }
  ];

  function getZorgsoortItems() {
    return ZS.map(function (x) {
      return Object.assign({}, x);
    });
  }

  function findIndexById(id) {
    for (var i = 0; i < ZS.length; i++) {
      if (ZS[i].id === id) return i;
    }
    return -1;
  }

  function setZorgsoortArchivedById(id, archived) {
    var i = findIndexById(id);
    if (i < 0) return false;
    ZS[i] = Object.assign({}, ZS[i], { archived: !!archived });
    return true;
  }

  function deleteZorgsoortById(id) {
    var next = ZS.filter(function (z) {
      return z.id !== id;
    });
    if (next.length === ZS.length) return false;
    ZS = next;
    return true;
  }

  function addZorgsoort(naam, tarieftype) {
    var n = (naam == null ? "" : String(naam)).trim();
    if (!n) return null;
    var t = String(tarieftype || "").toLowerCase();
    if (t !== "dag" && t !== "uur" && t !== "week") return null;
    var nextNum = 0;
    ZS.forEach(function (z) {
      var m = String(z && z.id ? z.id : "").match(/^zs-(\d+)$/);
      if (m) nextNum = Math.max(nextNum, parseInt(m[1], 10));
    });
    var row = { id: "zs-" + (nextNum + 1), naam: n, tarieftype: t, archived: false };
    ZS.push(row);
    return row;
  }

  global.getZorgsoortItems = getZorgsoortItems;
  global.setZorgsoortArchivedById = setZorgsoortArchivedById;
  global.deleteZorgsoortById = deleteZorgsoortById;
  global.addZorgsoort = addZorgsoort;
})(typeof window !== "undefined" ? window : this);
