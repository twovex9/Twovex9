/* global window, localStorage */
/**
 * Client rapportages — Supabase data-laag met localStorage als read-cache.
 *
 * Voor de Rapportages-tab op client-detail.html (item 14 / 35 in open-items).
 *
 * Architectuur:
 *  - Source of truth: Supabase tabel `client_rapportages`.
 *  - Cache in localStorage onder "client_rapportages_v1" voor snelle initial render.
 *  - Schrijfacties async naar Supabase, daarna cache update + event firen.
 *  - Bijlagen optioneel via bestaande bucket `client-documents` (hergebruikt
 *    upload-pattern van client-documents-data.js — sectie 6c werkpatronen).
 *
 * Gebruik:
 *   await window.clientRapportagesDB.ready;
 *   var rows = window.clientRapportagesDB.getForClientSync("cl_322");
 *   var saved = await window.clientRapportagesDB.add({
 *     clientId: "cl_322",
 *     titel: "Voortgangsverslag Q2",
 *     inhoud: "Cliënt vertoont positieve...",
 *     status: "concept",
 *     type: "voortgang",
 *     rapportDatum: "2026-05-12",
 *     fileData: "data:application/pdf;base64,..." // optioneel
 *   });
 *   await window.clientRapportagesDB.update(id, { status: "afgerond" });
 *   await window.clientRapportagesDB.archive(id);
 *   await window.clientRapportagesDB.remove(id);
 *   window.addEventListener("ff:client-rapportages-updated", rerender);
 */
(function (global) {
  "use strict";

  var TABLE = "client_rapportages";
  var BUCKET = "client-documents"; // hergebruikt bestaande bucket
  var CACHE_KEY = "client_rapportages_v1";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function isoNow() { return new Date().toISOString(); }

  // In-memory cache is ALTIJD de canonieke bron na bootstrap (volledige data,
  // incl. het zware vrijtekst-veld `inhoud`). localStorage is enkel een
  // snelle-boot-kopie en kan stil falen bij volle quota — dan blijft `_mem`
  // de betrouwbare bron (quota-proof). Zie quota-fix medewerkers/werkuren.
  var _mem = null;

  // Strip het zware vrijtekst-veld `inhoud` ALLEEN uit de localStorage-kopie
  // (niet uit `_mem` en niet uit de DB-payload) zodat de quota niet onnodig
  // volloopt. `_mem` houdt de volledige `inhoud`.
  function slimForCache(items) {
    return (Array.isArray(items) ? items : []).map(function (r) {
      if (!r || typeof r !== "object") return r;
      var c = Object.assign({}, r);
      c.inhoud = "";
      return c;
    });
  }

  function readCache() {
    // _mem wint altijd — heeft de volledige data (incl. inhoud)
    if (_mem != null) return _mem;
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) { _mem = []; return _mem; }
      var p = JSON.parse(raw);
      _mem = Array.isArray(p) ? p : [];
      return _mem;
    } catch (e) { _mem = []; return _mem; }
  }
  function writeCache(items) {
    var safe = Array.isArray(items) ? items : [];
    // 1) IN-MEMORY: altijd volledig (geen quota-risico)
    _mem = safe;
    // 2) localStorage: geslankte kopie (zonder zware `inhoud`) voor snelle boot
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(slimForCache(safe))); } catch (e) { /* quota vol — _mem blijft canoniek */ }
  }

  function dispatchUpdated(source) {
    try {
      global.dispatchEvent(new CustomEvent("ff:client-rapportages-updated", {
        detail: { source: source || "client-rapportages-data" }
      }));
    } catch (e) { /* */ }
  }

  function reportSilent(action, err) {
    console.error("[clientRapportagesDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) {
      global.ffReportSyncFailure("Rapportages — " + action, err);
    }
  }

  function publicUrlFor(storagePath) {
    if (!storagePath || !global.ffSupabase) return null;
    try {
      var res = global.ffSupabase.storage.from(BUCKET).getPublicUrl(storagePath);
      return (res && res.data && res.data.publicUrl) || null;
    } catch (e) { return null; }
  }

  function rowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      clientId: row.client_id || "",
      titel: row.titel || "",
      inhoud: row.inhoud || "",
      status: row.status || "concept",
      type: row.type || "",
      rapportDatum: row.rapport_datum || null,
      tijd: row.tijd ? String(row.tijd).slice(0, 5) : null,
      doelIds: Array.isArray(row.doel_ids) ? row.doel_ids : [],
      auteurId: row.auteur_id || null,
      auteurNaam: row.auteur_naam || "",
      storagePath: row.storage_path || null,
      fileUrl: publicUrlFor(row.storage_path),
      archived: !!row.archived,
      aanmaakdatum: row.aanmaakdatum || isoNow(),
      laatstGewijzigd: row.laatst_gewijzigd || row.aanmaakdatum || isoNow(),
    };
  }

  function objToInsertPayload(o) {
    var safe = o || {};
    var payload = {
      client_id: String(safe.clientId || ""),
      titel: String(safe.titel || "").trim(),
      inhoud: safe.inhoud ? String(safe.inhoud) : null,
      status: safe.status || "concept",
      type: safe.type ? String(safe.type) : null,
      rapport_datum: safe.rapportDatum || null,
      tijd: safe.tijd || null,
      doel_ids: Array.isArray(safe.doelIds) ? safe.doelIds : [],
      storage_path: safe.storagePath || null,
      archived: !!safe.archived,
    };
    if (safe.id && UUID_RE.test(String(safe.id))) payload.id = safe.id;
    return payload;
  }

  function objToUpdatePayload(o) {
    var p = objToInsertPayload(o);
    delete p.id;
    delete p.client_id; // immutable
    return p;
  }

  // RLS (fase 3) eist auteur_id = auth.uid() bij INSERT; auteur_naam voor weergave.
  async function currentAuteur() {
    var id = null;
    try {
      var s = await global.ffSupabase.auth.getSession();
      id = (s && s.data && s.data.session && s.data.session.user && s.data.session.user.id) || null;
    } catch (e) { /* */ }
    var naam = null;
    var prof = global.profilesDB && typeof global.profilesDB.getCurrentSync === "function"
      ? global.profilesDB.getCurrentSync() : null;
    if (prof) {
      naam = ((prof.voornaam || "") + " " + (prof.achternaam || "")).trim() || prof.email || null;
    }
    return { id: id, naam: naam };
  }

  async function fetchAll() {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    var res = await global.ffSupabase
      .from(TABLE)
      .select("*")
      .order("rapport_datum", { ascending: false, nullsFirst: false })
      .order("aanmaakdatum", { ascending: false });
    if (res.error) throw res.error;
    return (res.data || []).map(rowToObj).filter(Boolean);
  }

  // Helpers voor file-upload (kopie van client-documents-data.js pattern)
  function safeFileName(name) {
    return String(name || "bestand")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl || "").split(",");
    if (parts.length < 2) return null;
    var meta = parts[0];
    var b64 = parts[1];
    var mime = "application/octet-stream";
    var m = meta.match(/data:([^;]+)/);
    if (m) mime = m[1];
    try {
      var bin = atob(b64);
      var len = bin.length;
      var arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) {
      return null;
    }
  }

  async function uploadFileIfNeeded(clientId, recordId, fileData, fileName) {
    if (!fileData || !global.ffSupabase) return null;
    var blob = (fileData instanceof Blob) ? fileData : dataUrlToBlob(fileData);
    if (!blob) return null;
    var path = String(clientId) + "/rapport-" + String(recordId) + "-" + safeFileName(fileName || "rapport.pdf");
    var up = await global.ffSupabase.storage.from(BUCKET).upload(path, blob, {
      cacheControl: "3600",
      upsert: true,
    });
    if (up.error) throw up.error;
    return path;
  }

  var readyPromise = null;

  function bootstrap() {
    if (readyPromise) return readyPromise;
    var cached = readCache();
    if (cached.length) dispatchUpdated("cache");
    readyPromise = (async function () {
      try {
        var items = await fetchAll();
        writeCache(items);
        dispatchUpdated("bootstrap");
      } catch (err) {
        reportSilent("bootstrap fetchAll", err);
      }
    })();
    return readyPromise;
  }

  async function refresh() {
    var items = await fetchAll();
    writeCache(items);
    dispatchUpdated("refresh");
    return items;
  }

  async function add(rec) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!rec || !rec.clientId) throw new Error("clientId verplicht");
    if (!rec.titel || !String(rec.titel).trim()) throw new Error("titel verplicht");

    // Eerst INSERT zonder file → ID hebben we nodig voor storage path
    var payload = objToInsertPayload(rec);
    payload.storage_path = null;
    var auteur = await currentAuteur();
    if (!auteur.id) throw new Error("Geen actieve sessie — log opnieuw in");
    payload.auteur_id = auteur.id; // vereist door RLS-insert-policy (fase 3)
    payload.auteur_naam = auteur.naam;
    var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);

    // Optionele file-upload
    if (rec.fileData) {
      try {
        var path = await uploadFileIfNeeded(obj.clientId, obj.id, rec.fileData, rec.fileName);
        if (path) {
          var upd = await global.ffSupabase.from(TABLE).update({ storage_path: path }).eq("id", obj.id).select().single();
          if (!upd.error) obj = rowToObj(upd.data);
        }
      } catch (err) {
        reportSilent("file-upload bij add()", err);
      }
    }

    var cache = readCache();
    cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("add");
    return obj;
  }

  async function update(id, partial) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var existing = getByIdSync(id) || {};
    var merged = Object.assign({}, existing, partial || {});

    // File-upload als fileData is meegegeven
    if (partial && partial.fileData) {
      try {
        var path = await uploadFileIfNeeded(merged.clientId, id, partial.fileData, partial.fileName);
        if (path) merged.storagePath = path;
      } catch (err) {
        reportSilent("file-upload bij update()", err);
      }
    }

    var payload = objToUpdatePayload(merged);
    var res = await global.ffSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    var obj = rowToObj(res.data);
    var cache = readCache();
    var idx = cache.findIndex(function (r) { return r && String(r.id) === String(id); });
    if (idx >= 0) cache[idx] = obj; else cache.unshift(obj);
    writeCache(cache);
    dispatchUpdated("update");
    return obj;
  }

  async function archive(id) { return update(id, { archived: true }); }
  async function restore(id) { return update(id, { archived: false }); }

  async function remove(id) {
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
    if (!id) return false;
    var existing = getByIdSync(id);
    // Verwijder file uit storage indien aanwezig
    if (existing && existing.storagePath) {
      try {
        await global.ffSupabase.storage.from(BUCKET).remove([existing.storagePath]);
      } catch (e) { /* niet kritiek */ }
    }
    var res = await global.ffSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    var cache = readCache().filter(function (r) { return r && String(r.id) !== String(id); });
    writeCache(cache);
    dispatchUpdated("remove");
    return true;
  }

  function getAllSync() { return readCache(); }

  function getByIdSync(id) {
    if (id == null) return null;
    var s = String(id);
    var found = readCache().find(function (r) { return r && String(r.id) === s; });
    return found ? Object.assign({}, found) : null;
  }

  function getForClientSync(clientId) {
    if (!clientId) return [];
    var s = String(clientId);
    return readCache().filter(function (r) { return r && String(r.clientId) === s; });
  }

  global.clientRapportagesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    fetchAll: fetchAll,
    add: add,
    update: update,
    archive: archive,
    restore: restore,
    delete: remove,
    remove: remove,
    getAllSync: getAllSync,
    getByIdSync: getByIdSync,
    getForClientSync: getForClientSync,
  };

  bootstrap();
})(typeof window !== "undefined" ? window : this);
