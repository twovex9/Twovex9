/* global window, document */
/**
 * optimistic-lock.js — Fase E.11 — Optimistic locking helper voor concurrent edits.
 *
 * Doel: voorkomen dat user A wijzigingen van user B overschrijft wanneer beide
 * tegelijk dezelfde record bewerken (last-write-wins probleem).
 *
 * Patroon:
 *   1. Render-tijd: data-laag onthoudt `laatstGewijzigd` per record
 *   2. Submit-tijd: data-laag stuurt `expectedUpdatedAt` mee
 *   3. Server (RPC `check_optimistic_lock`): check if DB-timestamp matches
 *   4. Conflict → 409-error → toon conflict-modal aan user
 *
 * Server-side SQL-helper: `public.check_optimistic_lock(table, id, client_updated_at)`
 * gedefinieerd in `supabase/migrations/v3_fase_e1_schema_gaps.sql`.
 *
 * Usage in data-laag:
 *   var conflict = await window.ffOptimisticLock.check("medewerkers", id, lastKnownUpdatedAt);
 *   if (conflict) {
 *     window.ffOptimisticLock.showConflictModal({recordName: "Oumaima Achefay"});
 *     return;
 *   }
 *   await supabase.from("medewerkers").update(payload).eq("id", id);
 */
(function (global) {
  "use strict";

  /**
   * Check of een record nog niet door iemand anders is bewerkt sinds laatste fetch.
   *
   * @param {string} tableName - public tabel-naam (zie SQL-functie voor whitelist)
   * @param {string} id - record-id (text of uuid, beide werken)
   * @param {string} clientUpdatedAt - ISO-string van laatst-bekende updated_at
   * @returns {Promise<boolean>} - true = NO conflict (safe to update), false = CONFLICT
   */
  async function check(tableName, id, clientUpdatedAt) {
    if (!global.ffSupabase) {
      console.warn("[optimistic-lock] ffSupabase niet geladen, skip check");
      return true;  // fail-open
    }
    if (!clientUpdatedAt) {
      console.warn("[optimistic-lock] geen client updated_at, skip check");
      return true;  // fail-open
    }
    try {
      var res = await global.ffSupabase.rpc("check_optimistic_lock", {
        p_table_name: tableName,
        p_id: String(id),
        p_client_updated_at: clientUpdatedAt,
      });
      if (res.error) {
        console.error("[optimistic-lock] RPC error:", res.error);
        return true;  // fail-open (don't block on RPC failures)
      }
      return res.data === true;
    } catch (err) {
      console.error("[optimistic-lock] exception:", err);
      return true;  // fail-open
    }
  }

  /**
   * Toont conflict-modal aan user. Wacht tot user de keuze maakt:
   * - "Reload": pagina herladen om laatste data te zien
   * - "Cancel": modal sluiten zonder reload
   *
   * @param {{recordName?: string, message?: string}} opts
   * @returns {Promise<"reload"|"cancel">}
   */
  function showConflictModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      // Build modal overlay (matches BS1 huisstijl)
      var overlay = document.createElement("div");
      overlay.className = "modal-overlay modal-overlay--confirm";
      overlay.id = "ff-optimistic-lock-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.style.cssText = "display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99998;" +
        "align-items:center;justify-content:center;";

      var dialog = document.createElement("div");
      dialog.className = "modal-dialog";
      dialog.style.cssText = "background:var(--surface,#fff);border-radius:var(--r-xl,16px);" +
        "max-width:480px;width:90%;padding:0;box-shadow:0 12px 48px rgba(0,0,0,0.24);";

      dialog.innerHTML = '' +
        '<div class="modal-header" style="padding:20px 24px 0;border-bottom:1px solid var(--line,#e5e7eb);padding-bottom:14px;">' +
          '<h2 class="modal-title" style="margin:0;font-size:18px;color:var(--text,#1a1a1a);">Wijziging geblokkeerd — record is door iemand anders gewijzigd</h2>' +
        '</div>' +
        '<div class="modal-body" style="padding:18px 24px;color:var(--text-secondary,#444);">' +
          '<p style="margin:0 0 12px;">' +
            (opts.message ||
              ('Deze ' + (opts.recordName ? '"' + escapeHtml(opts.recordName) + '"' : 'record') +
               ' is sinds je laatste view gewijzigd door iemand anders.')) +
          '</p>' +
          '<p style="margin:0;color:var(--text-muted,#666);font-size:13px;">' +
            'Klik op <strong>Pagina herladen</strong> om de laatste versie te zien. ' +
            'Je wijzigingen zijn nog niet opgeslagen.' +
          '</p>' +
        '</div>' +
        '<div class="modal-footer" style="padding:14px 24px 20px;display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--line,#e5e7eb);">' +
          '<button type="button" class="btn-outline" id="ff-ol-cancel">Annuleren</button>' +
          '<button type="button" class="btn-primary" id="ff-ol-reload">Pagina herladen</button>' +
        '</div>';

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      function cleanup(answer) {
        overlay.remove();
        resolve(answer);
      }

      document.getElementById("ff-ol-cancel").addEventListener("click", function () { cleanup("cancel"); });
      document.getElementById("ff-ol-reload").addEventListener("click", function () {
        cleanup("reload");
        window.location.reload();
      });

      // Escape + Overlay-click close ways
      function escHandler(e) {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", escHandler);
          cleanup("cancel");
        }
      }
      document.addEventListener("keydown", escHandler);
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) cleanup("cancel");
      });
    });
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  global.ffOptimisticLock = {
    check: check,
    showConflictModal: showConflictModal,
  };
})(typeof window !== "undefined" ? window : this);
