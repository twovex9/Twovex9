/* global window, document, localStorage */
/**
 * taak-thread-data.js — data-laag voor de taak-gespreksdraad + bijlagen.
 *
 * Twee tabellen, één bestand (worden altijd samen in de taakdetail gebruikt):
 *   - public.taak_comments  → window.taakCommentsDB
 *   - public.taak_bijlagen  + Storage bucket `taak-bijlagen` → window.taakBijlagenDB
 *
 * RLS dwingt af dat je alleen comments/bijlagen ziet van taken die je via de
 * hiërarchie mag zien (zie migratie taak_comments_bijlagen_tabellen).
 *
 * Events: `besa:taak-thread-updated` (detail { taakId }) na elke mutatie.
 */
(function (global) {
  "use strict";

  var T_COMMENTS = "taak_comments";
  var T_BIJLAGEN = "taak_bijlagen";
  var BUCKET = "taak-bijlagen";

  function client() { return global.besaSupabase || null; }

  function reportSilent(action, err) {
    console.error("[taakThreadDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Taak-draad — " + action, err);
  }

  function isoNow() { return new Date().toISOString(); }

  function emit(taakId) {
    try {
      global.dispatchEvent(new CustomEvent("besa:taak-thread-updated", { detail: { taakId: taakId } }));
    } catch (e) { /* */ }
  }

  function safeName(name) {
    return String(name || "bestand")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 120);
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(",");
    var meta = parts[0] || "";
    var b64 = parts[1] || "";
    var mimeMatch = /data:([^;]+)/.exec(meta);
    var mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
    var bin = atob(b64);
    var len = bin.length;
    var arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // Huidige gebruiker → { id (auth.users.id), naam }.
  function currentUser() {
    var prof = global.besaCurrentProfile ||
      (global.profilesDB && global.profilesDB.getCurrentSync && global.profilesDB.getCurrentSync());
    var id = (prof && prof.id) || null;
    var naam = "";
    try {
      if (prof && prof.medewerker_id && global.medewerkersDB) {
        var m = global.medewerkersDB.getByIdSync(prof.medewerker_id);
        if (m) naam = ((m.voornaam || "") + " " + (m.achternaam || "")).trim();
      }
    } catch (e) { /* */ }
    if (!naam && prof) naam = prof.email || "";
    return { id: id, naam: naam };
  }

  // ===================== COMMENTS =====================
  var _comments = {}; // taakId → array

  function commentRowToObj(row) {
    if (!row) return null;
    return {
      id: row.id,
      taakId: row.taak_id,
      auteurId: row.auteur_id || null,
      auteurNaam: row.auteur_naam || "",
      tekst: row.tekst || "",
      createdAt: row.created_at || null,
    };
  }

  async function listComments(taakId) {
    if (!taakId || !client()) return [];
    try {
      var resp = await client().from(T_COMMENTS).select("*")
        .eq("taak_id", taakId)
        .order("created_at", { ascending: true });
      if (resp.error) throw resp.error;
      var arr = (resp.data || []).map(commentRowToObj).filter(Boolean);
      _comments[taakId] = arr;
      return arr;
    } catch (err) {
      reportSilent("comments laden", err);
      return _comments[taakId] || [];
    }
  }

  function listCommentsSync(taakId) { return _comments[taakId] || []; }

  async function addComment(rec) {
    rec = rec || {};
    var taakId = rec.taakId;
    if (!taakId) throw new Error("taakId vereist");
    if (!client()) throw new Error("Supabase client niet geladen");
    var u = currentUser();
    var payload = {
      taak_id: taakId,
      auteur_id: u.id,
      auteur_naam: u.naam || "",
      tekst: String(rec.tekst || "").trim(),
    };
    var resp = await client().from(T_COMMENTS).insert(payload).select().single();
    if (resp.error) throw resp.error;
    var obj = commentRowToObj(resp.data);
    if (!_comments[taakId]) _comments[taakId] = [];
    _comments[taakId].push(obj);
    emit(taakId);
    return obj;
  }

  async function removeComment(id, taakId) {
    if (!client()) throw new Error("Supabase client niet geladen");
    var resp = await client().from(T_COMMENTS).delete().eq("id", id);
    if (resp.error) throw resp.error;
    if (taakId && _comments[taakId]) {
      _comments[taakId] = _comments[taakId].filter(function (c) { return c.id !== id; });
    }
    emit(taakId);
    return true;
  }

  // ===================== BIJLAGEN =====================
  var _bijlagen = {}; // taakId → array

  function bijlageRowToObj(row) {
    if (!row) return null;
    var pubUrl = "";
    try {
      if (row.storage_path) {
        var r = client().storage.from(BUCKET).getPublicUrl(row.storage_path);
        pubUrl = (r && r.data && r.data.publicUrl) || "";
      }
    } catch (e) { /* */ }
    return {
      id: row.id,
      taakId: row.taak_id,
      commentId: row.comment_id || null,
      naam: row.naam || "",
      fileMime: row.file_mime || "",
      fileSize: row.file_size || 0,
      storagePath: row.storage_path || null,
      url: pubUrl,
      uploaderId: row.uploader_id || null,
      uploaderNaam: row.uploader_naam || "",
      createdAt: row.created_at || null,
      archived: !!row.archived,
    };
  }

  async function listBijlagen(taakId) {
    if (!taakId || !client()) return [];
    try {
      var resp = await client().from(T_BIJLAGEN).select("*")
        .eq("taak_id", taakId)
        .eq("archived", false)
        .order("created_at", { ascending: true });
      if (resp.error) throw resp.error;
      var arr = (resp.data || []).map(bijlageRowToObj).filter(Boolean);
      _bijlagen[taakId] = arr;
      return arr;
    } catch (err) {
      reportSilent("bijlagen laden", err);
      return _bijlagen[taakId] || [];
    }
  }

  function listBijlagenSync(taakId) { return _bijlagen[taakId] || []; }

  async function uploadFile(taakId, docId, fileData, fileName, fileMime) {
    var path = taakId + "/" + docId + "-" + safeName(fileName);
    var blob = dataUrlToBlob(fileData);
    var up = await client().storage.from(BUCKET).upload(path, blob, {
      contentType: fileMime || blob.type || "application/octet-stream",
      upsert: true,
    });
    if (up.error) throw up.error;
    return path;
  }

  async function addBijlage(rec) {
    rec = rec || {};
    var taakId = rec.taakId;
    if (!taakId) throw new Error("taakId vereist");
    if (!rec.fileData) throw new Error("Geen bestand");
    if (!client()) throw new Error("Supabase client niet geladen");
    var u = currentUser();
    var docId = "tb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    var storagePath = await uploadFile(taakId, docId, rec.fileData, rec.fileName, rec.fileMime);
    var payload = {
      id: docId,
      taak_id: taakId,
      comment_id: rec.commentId || null,
      naam: rec.fileName || rec.naam || "bestand",
      storage_path: storagePath,
      file_mime: rec.fileMime || "",
      file_size: rec.fileSize || 0,
      uploader_id: u.id,
      uploader_naam: u.naam || "",
      archived: false,
    };
    var resp = await client().from(T_BIJLAGEN).insert(payload).select().single();
    if (resp.error) throw resp.error;
    var obj = bijlageRowToObj(resp.data);
    if (!_bijlagen[taakId]) _bijlagen[taakId] = [];
    _bijlagen[taakId].push(obj);
    emit(taakId);
    return obj;
  }

  async function removeBijlage(id, taakId) {
    if (!client()) throw new Error("Supabase client niet geladen");
    var path = null;
    (_bijlagen[taakId] || []).forEach(function (b) { if (b.id === id) path = b.storagePath; });
    try { if (path) await client().storage.from(BUCKET).remove([path]); } catch (e) { /* best-effort */ }
    var resp = await client().from(T_BIJLAGEN).delete().eq("id", id);
    if (resp.error) throw resp.error;
    if (taakId && _bijlagen[taakId]) {
      _bijlagen[taakId] = _bijlagen[taakId].filter(function (b) { return b.id !== id; });
    }
    emit(taakId);
    return true;
  }

  // Laad comments + bijlagen samen (handig voor de detail-modal).
  async function loadThread(taakId) {
    var r = await Promise.all([listComments(taakId), listBijlagen(taakId)]);
    return { comments: r[0], bijlagen: r[1] };
  }

  global.taakCommentsDB = {
    list: listComments,
    listSync: listCommentsSync,
    add: addComment,
    remove: removeComment,
  };
  global.taakBijlagenDB = {
    list: listBijlagen,
    listSync: listBijlagenSync,
    add: addBijlage,
    remove: removeBijlage,
  };
  global.taakThreadDB = {
    load: loadThread,
    currentUser: currentUser,
  };
})(typeof window !== "undefined" ? window : this);
