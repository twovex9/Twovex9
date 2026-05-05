/**
 * Data-laag voor 'locaties' (HR module — referentiedata met adres + kleur).
 *
 * Bron van waarheid: Supabase tabel public.locaties.
 * localStorage["hr_locaties"] dient als read-cache.
 *
 * Public async API:
 *   await window.locatiesDB.bootstrap()
 *   await window.locatiesDB.refresh()
 *   await window.locatiesDB.add({naam, postcode?, huisnummer?, toevoeging?, straat?, plaats?, kleur?})
 *   await window.locatiesDB.update(id, patch)
 *     // patch: {naam?, postcode?, huisnummer?, toevoeging?, straat?, plaats?, kleur?, archived?}
 *   await window.locatiesDB.archive(id)
 *   await window.locatiesDB.restore(id)
 *   await window.locatiesDB.delete(id)
 *
 * Sync helpers:
 *   window.locatiesDB.getAllSync()
 *   window.locatiesDB.ready  (Promise)
 *
 * Backward-compat globals:
 *   getLocaties()              → leest uit cache
 *   locFmtDate(iso)            → ongewijzigd
 *   locComposeAdres(o)         → ongewijzigd
 *   locParseAdresInto(o)       → ongewijzigd
 *   locNormalizeRecord(o)      → ongewijzigd (operatie op cliëntside object)
 *
 * Events:
 *   "besa:locaties-updated" op `window` na elke mutatie of bootstrap.
 */

/* ── Pure utility-functies (worden ook door andere pagina's gebruikt) ── */
function locComposeAdres(o) {
  var straat = (o.straat || "").trim();
  var hn = (o.huisnummer || "").trim();
  var tv = (o.toevoeging || "").trim();
  var pc = (o.postcode || "").replace(/\s+/g, "").trim();
  var pl = (o.plaats || "").trim();
  if (!straat && !pl) return (o.adres && String(o.adres).trim()) || "N/A";
  var left = straat;
  if (hn) left += (left ? " " : "") + hn;
  if (tv) left += (left ? " " : "") + tv;
  left = left.trim();
  if (pc && pl) return left + ", " + pc + " " + pl;
  if (pl) return left + ", " + pl;
  if (pc) return left + ", " + pc;
  return left || "N/A";
}

function locParseAdresInto(o) {
  var adres = (o.adres || "").trim();
  if (!adres || adres === "N/A") return false;
  var parts = adres.split(",").map(function (s) { return s.trim(); });
  if (parts.length < 2) return false;
  var right = parts[parts.length - 1];
  var left = parts.slice(0, -1).join(", ");
  var mPc = right.match(/^(\d{4}[A-Z]{2})\s+(.+)$/i);
  if (mPc) {
    o.postcode = mPc[1].toUpperCase();
    o.plaats = mPc[2].trim();
  } else {
    o.plaats = right;
  }
  var mLeft = left.match(/^(.+?)\s+(\d+[a-zA-Z\-]*)\s*(.*)$/);
  if (mLeft) {
    o.straat = mLeft[1].trim();
    o.huisnummer = mLeft[2].trim();
    o.toevoeging = (mLeft[3] || "").trim();
  } else {
    o.straat = left;
  }
  return true;
}

function locNormalizeRecord(o) {
  var dirty = false;
  if (!o.kleur) {
    o.kleur = "#64748b";
    dirty = true;
  }
  ["postcode", "huisnummer", "toevoeging", "straat", "plaats"].forEach(function (k) {
    if (o[k] === undefined) {
      o[k] = "";
      dirty = true;
    }
  });
  if (!(o.straat || "").trim() && o.adres && o.adres !== "N/A") {
    if (locParseAdresInto(o)) dirty = true;
  }
  return dirty;
}

function locFmtDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  var dd = String(d.getDate()).padStart(2, "0");
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var yy = d.getFullYear();
  var hh = String(d.getHours()).padStart(2, "0");
  var mi = String(d.getMinutes()).padStart(2, "0");
  return dd + "-" + mm + "-" + yy + " " + hh + ":" + mi;
}

/* ── Supabase data-laag ── */
(function (global) {
  "use strict";

  var CACHE_KEY = "hr_locaties";
  var TABLE = "locaties";
  var EVENT_NAME = "besa:locaties-updated";

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      naam: row.naam || "",
      adres: row.adres || "",
      kleur: row.kleur || "#64748b",
      postcode: row.postcode || "",
      huisnummer: row.huisnummer || "",
      toevoeging: row.toevoeging || "",
      straat: row.straat || "",
      plaats: row.plaats || "",
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum,
      laatstGewijzigd: row.laatst_gewijzigd,
    };
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function dispatchUpdated() {
    try { window.dispatchEvent(new CustomEvent(EVENT_NAME)); }
    catch (e) { /* noop */ }
  }

  function writeCache(list) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(list)); }
    catch (e) { /* best effort */ }
    dispatchUpdated();
  }

  async function fetchAll() {
    if (!window.besaSupabase) {
      console.warn("[locatiesDB] Supabase-client niet beschikbaar; cache wordt niet ververst.");
      return readCache();
    }
    var res = await window.besaSupabase
      .from(TABLE)
      .select("*")
      .order("aanmaakdatum", { ascending: true });
    if (res.error) {
      console.error("[locatiesDB] fetchAll error:", res.error);
      throw res.error;
    }
    var list = (res.data || []).map(rowToObj);
    writeCache(list);
    return list;
  }

  var bootstrapPromise = null;
  function bootstrap() {
    if (!bootstrapPromise) {
      bootstrapPromise = (async function () {
        try { await fetchAll(); }
        catch (e) { dispatchUpdated(); }
      })();
    }
    return bootstrapPromise;
  }

  function refresh() {
    bootstrapPromise = null;
    return bootstrap();
  }

  function buildPayload(input) {
    var obj = Object.assign({}, input || {});
    if (obj.postcode != null) obj.postcode = String(obj.postcode).replace(/\s+/g, "");
    locNormalizeRecord(obj);
    obj.adres = locComposeAdres(obj);
    return {
      naam: String(obj.naam || "").trim(),
      adres: obj.adres,
      kleur: obj.kleur || "#64748b",
      postcode: obj.postcode || "",
      huisnummer: obj.huisnummer || "",
      toevoeging: obj.toevoeging || "",
      straat: obj.straat || "",
      plaats: obj.plaats || "",
    };
  }

  async function add(input) {
    var payload = buildPayload(input);
    if (!payload.naam) throw new Error("Naam is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    payload.archived = false;
    var res = await window.besaSupabase
      .from(TABLE)
      .insert(payload)
      .select()
      .single();
    if (res.error) throw res.error;
    var newItem = rowToObj(res.data);
    var list = readCache();
    list.push(newItem);
    writeCache(list);
    return newItem;
  }

  async function update(id, patch) {
    if (!id) throw new Error("id is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");

    // Bouw merged-object op zodat adres opnieuw kan worden samengesteld als
    // adresvelden zijn meegegeven.
    var current = readCache().find(function (l) { return l.id === id; }) || {};
    var merged = Object.assign({}, current, patch || {});
    var rebuiltAdres = locComposeAdres(merged);

    var dbPatch = {};
    var fields = ["naam", "kleur", "postcode", "huisnummer", "toevoeging", "straat", "plaats"];
    fields.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        if (k === "naam") dbPatch.naam = String(patch.naam).trim();
        else if (k === "postcode") dbPatch.postcode = String(patch.postcode || "").replace(/\s+/g, "");
        else dbPatch[k] = patch[k] == null ? "" : String(patch[k]);
      }
    });
    var adresFieldsTouched = ["postcode", "huisnummer", "toevoeging", "straat", "plaats"]
      .some(function (k) { return Object.prototype.hasOwnProperty.call(patch, k); });
    if (adresFieldsTouched) dbPatch.adres = rebuiltAdres;
    if (Object.prototype.hasOwnProperty.call(patch, "archived")) {
      dbPatch.archived = !!patch.archived;
    }
    if (Object.keys(dbPatch).length === 0) return current.id ? current : null;

    var res = await window.besaSupabase
      .from(TABLE)
      .update(dbPatch)
      .eq("id", id)
      .select()
      .single();
    if (res.error) throw res.error;
    var newItem = rowToObj(res.data);
    var list = readCache().map(function (l) { return l.id === id ? newItem : l; });
    writeCache(list);
    return newItem;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!id) throw new Error("id is verplicht.");
    if (!window.besaSupabase) throw new Error("Supabase-client niet beschikbaar.");
    var res = await window.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var list = readCache().filter(function (l) { return l.id !== id; });
    writeCache(list);
    return true;
  }

  function getAllSync() { return readCache(); }

  function getLocatiesCompat() {
    return readCache().map(function (l) { return Object.assign({}, l); });
  }

  var api = {
    bootstrap: bootstrap,
    refresh: refresh,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    getAllSync: getAllSync,
  };

  Object.defineProperty(api, "ready", {
    get: function () { return bootstrap(); },
  });

  global.locatiesDB = api;
  global.getLocaties = getLocatiesCompat;

  // Auto-bootstrap zodra dit script laadt.
  bootstrap();
})(typeof window !== "undefined" ? window : this);
