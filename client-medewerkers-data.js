/* global window */
/**
 * client-medewerkers-data.js — data-laag voor de cliënt↔medewerker-koppeltabel
 * (Cliëntmodule 2.0 fase 3, spec §6 organisatorisch).
 *
 * Dunne laag bovenop tabel `client_medewerkers`. RLS: lezen = zorg-toegang tot
 * de cliënt; schrijven = beoordelaars (GW/zorgcoördinator/directeur/admin-tier).
 * Een koppeling geeft de medewerker ook leestoegang tot het dossier
 * (clienten-RLS + client_zorg_toegang, zie clientmodule_v2_fase3.sql).
 *
 * Rollen (DB check-constraint): begeleider, mentor, zorgcoordinator,
 * gedragswetenschapper.
 *
 * Public API (window.clientMedewerkersDB):
 *   - ROLLEN / rolLabel(r)
 *   - fetchVoorClient(clientId) → Promise<rows[]> (incl. medewerker-naam/functie)
 *   - add({clientId, medewerkerId, rol}) → Promise<row> (throw bij fout)
 *   - remove(id) → Promise<boolean>
 * Events: `besa:client-medewerkers-updated` (window) na elke mutatie.
 */
(function (global) {
  "use strict";

  var TABLE = "client_medewerkers";

  var ROLLEN = ["begeleider", "mentor", "zorgcoordinator", "gedragswetenschapper"];
  var ROL_LABELS = {
    begeleider: "Begeleider",
    mentor: "Mentor",
    zorgcoordinator: "Zorgcoördinator",
    gedragswetenschapper: "Gedragswetenschapper",
  };

  function reportSilent(action, err) {
    if (global.console) console.error("[clientMedewerkersDB] " + action + " mislukt:", err);
    if (global.besaReportSyncFailure) global.besaReportSyncFailure("Cliënt-team — " + action, err);
  }

  async function ensureSupabase() {
    if (global.besaSupabaseReady) { try { await global.besaSupabaseReady; } catch (e) { /* doorgaan */ } }
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
  }

  function dispatchUpdated(source) {
    try { global.dispatchEvent(new CustomEvent("besa:client-medewerkers-updated", { detail: { source: source || "data" } })); } catch (e) { /* */ }
  }

  async function currentUser() {
    try {
      var s = await global.besaSupabase.auth.getSession();
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
      var r = await global.besaSupabase
        .from(TABLE)
        .select("*, medewerkers(voornaam, achternaam, functie, archived)")
        .eq("client_id", clientId)
        .order("aanmaakdatum", { ascending: true });
      if (r.error) throw r.error;
      return (Array.isArray(r.data) ? r.data : []).map(function (row) {
        var m = row.medewerkers || {};
        return {
          id: row.id,
          clientId: row.client_id,
          medewerkerId: row.medewerker_id,
          rol: row.rol || "begeleider",
          naam: ((m.voornaam || "") + " " + (m.achternaam || "")).trim() || "Onbekend",
          functie: m.functie || "",
          medewerkerArchived: !!m.archived,
          aanmaakdatum: row.aanmaakdatum,
        };
      });
    } catch (err) {
      reportSilent("laden", err);
      return [];
    }
  }

  // Mutaties — géén catch: page-script toont showError bij falen.
  async function add(rec) {
    await ensureSupabase();
    var safe = rec || {};
    if (!safe.clientId) throw new Error("clientId verplicht");
    if (!safe.medewerkerId) throw new Error("Kies een medewerker");
    var user = await currentUser();
    var payload = {
      client_id: String(safe.clientId),
      medewerker_id: String(safe.medewerkerId),
      rol: ROLLEN.indexOf(String(safe.rol || "")) >= 0 ? String(safe.rol) : "begeleider",
      created_by: user ? user.id : null,
      created_by_naam: currentNaam(),
    };
    var res = await global.besaSupabase.from(TABLE).insert(payload).select().single();
    if (res.error) throw res.error;
    dispatchUpdated("add");
    return res.data;
  }

  async function remove(id) {
    await ensureSupabase();
    if (!id) return false;
    var res = await global.besaSupabase.from(TABLE).delete().eq("id", id);
    if (res.error) throw res.error;
    dispatchUpdated("remove");
    return true;
  }

  global.clientMedewerkersDB = {
    ROLLEN: ROLLEN.slice(),
    rolLabel: function (r) { return ROL_LABELS[String(r || "").toLowerCase()] || "Begeleider"; },
    fetchVoorClient: fetchVoorClient,
    add: add,
    remove: remove,
  };
})(typeof window !== "undefined" ? window : this);
