/* global window */
/**
 * client-contactlog-data.js — data-laag voor het contactlogboek
 * (Cliëntmodule 2.0 fase 3, spec §14).
 *
 * Dunne laag bovenop tabel `client_contactlog`. RLS: lezen = zorg-toegang tot
 * de cliënt; toevoegen = zorg-toegang én created_by = eigen user (gekoppelde of
 * locatie-medewerkers + office); bewerken = eigen registraties of office.
 *
 * Typen (DB check-constraint): oudergesprek, verwijzersoverleg, gemeentecontact,
 * schoolcontact, mdo, casusoverleg, overig.
 *
 * Public API (window.clientContactlogDB):
 *   - TYPES / typeLabel(t)
 *   - fetchVoorClient(clientId) → Promise<rows[]> (nieuwste eerst)
 *   - add(rec) / update(id, partial) → Promise<row> (throw bij fout)
 *   - archive(id) / restore(id)
 * Events: `ff:client-contactlog-updated` (window) na elke mutatie.
 */
(function (global) {
  "use strict";

  var TABLE = "client_contactlog";

  var TYPES = ["oudergesprek", "verwijzersoverleg", "gemeentecontact", "schoolcontact", "mdo", "casusoverleg", "overig"];
  var TYPE_LABELS = {
    oudergesprek: "Oudergesprek",
    verwijzersoverleg: "Verwijzersoverleg",
    gemeentecontact: "Gemeentecontact",
    schoolcontact: "Schoolcontact",
    mdo: "MDO",
    casusoverleg: "Casusoverleg",
    overig: "Overig",
  };

  function reportSilent(action, err) {
    if (global.console) console.error("[clientContactlogDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Contactlogboek — " + action, err);
  }

  async function ensureSupabase() {
    if (global.ffSupabaseReady) { try { await global.ffSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.ffSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("ff:client-contactlog-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  async function currentUser() {
    try {
      var s = await global.ffSupabase.auth.getSession();
      return (s && s.data && s.data.session && s.data.session.user) || null;
    } catch (e) { return null; }
  }

  function currentNaam() {
    var p = global.profilesDB && typeof global.profilesDB.getCurrentSync === "function"
      ? global.profilesDB.getCurrentSync() : null;
    if (!p) return null;
    var n = ((p.voornaam || "") + " " + (p.achternaam || "")).trim();
    return n || p.email || null;
  }

  async function fetchVoorClient(clientId) {
    try {
      if (!clientId) return [];
      await ensureSupabase();
      var r = await global.ffSupabase
        .from(TABLE)
        .select("*")
        .eq("client_id", clientId)
        .order("datum", { ascending: false })
        .order("aanmaakdatum", { ascending: false });
      if (r.error) throw r.error;
      return Array.isArray(r.data) ? r.data : [];
    } catch (err) {
      reportSilent("laden", err);
      return [];
    }
  }

  function toPayload(safe) {
    return {
      type: TYPES.indexOf(String(safe.type || "")) >= 0 ? String(safe.type) : "overig",
      datum: safe.datum || null,
      tijd: safe.tijd || null,
      met_wie: safe.metWie ? String(safe.metWie) : null,
      onderwerp: String(safe.onderwerp || "").trim(),
      verslag: safe.verslag ? String(safe.verslag) : null,
      vervolgacties: safe.vervolgacties ? String(safe.vervolgacties) : null,
    };
  }

  // Mutaties — géén catch: page-script toont showError bij falen.
  async function add(rec) {
    await ensureSupabase();
    var safe = rec || {};
    if (!safe.clientId) throw new Error("clientId verplicht");
    if (!String(safe.onderwerp || "").trim()) throw new Error("Onderwerp is verplicht");
    var user = await currentUser();
    if (!user) throw new Error("Geen actieve sessie");
    var payload = toPayload(safe);
    payload.client_id = String(safe.clientId);
    if (!payload.datum) delete payload.datum; // DB-default = vandaag
    payload.created_by = user.id; // vereist door RLS-insert-policy
    payload.created_by_naam = currentNaam();
    var res = await global.ffSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    dispatchUpdated("add");
    return res.data;
  }

  async function update(id, partial) {
    await ensureSupabase();
    if (!id) throw new Error("Geen id meegegeven aan update()");
    var payload = toPayload(partial || {});
    if (!payload.datum) delete payload.datum;
    var res = await global.ffSupabase.from(TABLE).update(payload).eq("id", id).select().single();
    if (res.error) throw res.error;
    dispatchUpdated("update");
    return res.data;
  }

  async function setArchived(id, archived) {
    await ensureSupabase();
    var r = await global.ffSupabase.from(TABLE).update({ archived: !!archived }).eq("id", id).select().single();
    if (r.error) throw r.error;
    dispatchUpdated(archived ? "archive" : "restore");
    return r.data;
  }

  global.clientContactlogDB = {
    TYPES: TYPES.slice(),
    typeLabel: function (t) { return TYPE_LABELS[String(t || "").toLowerCase()] || "Overig"; },
    fetchVoorClient: fetchVoorClient,
    add: add,
    update: update,
    archive: function (id) { return setArchived(id, true); },
    restore: function (id) { return setArchived(id, false); },
  };
})(typeof window !== "undefined" ? window : this);
