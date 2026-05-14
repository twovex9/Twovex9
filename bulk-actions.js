/* global window */
/**
 * bulk-actions.js — Fase E.10 — Bulk-acties helper
 *
 * Per user-keuze #21: 1-op-1 BS2 bulk-acties. Performante mutations
 * via Postgres RPC ipv N individuele UPDATEs.
 *
 * Server-side RPCs (LIVE in Supabase):
 *   - public.bulk_archive_clienten(ids text[], archived bool)
 *   - public.bulk_archive_medewerkers(ids uuid[], archived bool)
 *
 * Client-side gebruik:
 *   var result = await besaBulkActions.archiveClienten(ids, true);
 *   // result = { success: true, affected: N, action: 'archiveren' }
 *
 * Audit-log: 1 entry per bulk-call met 'BULK:N' resource_id.
 */
(function (global) {
  "use strict";

  async function archiveClienten(ids, archived) {
    if (!global.besaSupabase) throw new Error("Supabase niet geladen");
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("Geen ids opgegeven");
    var res = await global.besaSupabase.rpc("bulk_archive_clienten", {
      p_ids: ids,
      p_archived: archived !== false,  // default true (archiveren)
    });
    if (res.error) throw res.error;
    return res.data;
  }

  async function archiveMedewerkers(ids, archived) {
    if (!global.besaSupabase) throw new Error("Supabase niet geladen");
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("Geen ids opgegeven");
    var res = await global.besaSupabase.rpc("bulk_archive_medewerkers", {
      p_ids: ids,
      p_archived: archived !== false,
    });
    if (res.error) throw res.error;
    return res.data;
  }

  global.besaBulkActions = {
    archiveClienten: archiveClienten,
    archiveMedewerkers: archiveMedewerkers,
  };
})(typeof window !== "undefined" ? window : this);
