/* global window, document */
/**
 * dienst-recurring-data.js — data-laag voor public.dienst_recurring.
 *
 * BS2-equivalent: "Herhaling" sectie in +Dienst aanmaken modal.
 * - Herhaal iedere {N} weken (1-12)
 * - Eindigt op {date} (required)
 * - Herhaal op {weekday-mask} (array van 1-7)
 *
 * Bij submit: backend gen N losse dienst-records (in JS via expandRecurring()).
 */
(function (global) {
  "use strict";
  if (!global.ffSupabase) return;
  var supa = global.ffSupabase;

  function reportSilent(action, err) {
    console.error("[dienstRecurringDB] " + action + " mislukt:", err);
    if (global.ffReportSyncFailure) global.ffReportSyncFailure("Herhaling — " + action, err);
  }

  async function add(payload) {
    if (!payload || !payload.parent_dienst_id || !payload.end_date || !payload.days_of_week) {
      throw new Error("parent_dienst_id + end_date + days_of_week verplicht");
    }
    var resp = await supa.from("dienst_recurring").insert({
      parent_dienst_id: payload.parent_dienst_id,
      interval_weeks: payload.interval_weeks || 1,
      end_date: payload.end_date,
      days_of_week: payload.days_of_week,
    }).select().single();
    if (resp.error) throw resp.error;
    return resp.data;
  }

  async function getForParent(parentDienstId) {
    var r = await supa.from("dienst_recurring").select("*").eq("parent_dienst_id", parentDienstId).maybeSingle();
    if (r.error) throw r.error;
    return r.data;
  }

  /**
   * Genereert losse dienst-rows voor de herhaling vanaf de parent-dienst.
   * Returns array van te-inserten dienst-rows (zonder id — laat Supabase genereren).
   */
  function expandRecurring(parentDienst, recurringConfig) {
    if (!parentDienst || !recurringConfig) return [];
    if (!recurringConfig.end_date || !recurringConfig.days_of_week) return [];
    var startDate = new Date(parentDienst.start_iso);
    var endDate = new Date(parentDienst.einde_iso);
    var durationMs = endDate.getTime() - startDate.getTime();
    var untilDate = new Date(recurringConfig.end_date + "T23:59:59");
    var intervalWeeks = Math.max(1, parseInt(recurringConfig.interval_weeks, 10) || 1);
    var daysOfWeek = recurringConfig.days_of_week.map(Number); // 1=ma .. 7=zo (ISO)

    var rows = [];
    // Begin in de week NA de start-week, om duplicaten te vermijden
    var cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    var startDayIso = cursor.getDay() === 0 ? 7 : cursor.getDay(); // JS: 0=zo, ISO: 7=zo
    // Skip parent dag zelf
    cursor.setDate(cursor.getDate() + 1);

    while (cursor.getTime() <= untilDate.getTime()) {
      var jsDay = cursor.getDay();
      var isoDay = jsDay === 0 ? 7 : jsDay;
      if (daysOfWeek.indexOf(isoDay) >= 0) {
        // Bereken week-offset van parent
        var weeksFromStart = Math.floor((cursor.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weeksFromStart % intervalWeeks === 0 || weeksFromStart === 0) {
          var rowStart = new Date(cursor);
          rowStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);
          var rowEnd = new Date(rowStart.getTime() + durationMs);
          rows.push({
            // id wordt door planning-data.js gegenereerd (text PK)
            start_iso: rowStart.toISOString(),
            einde_iso: rowEnd.toISOString(),
            diensttype: parentDienst.diensttype,
            afdeling: parentDienst.afdeling,
            functie: parentDienst.functie,
            teamlead: parentDienst.teamlead,
            teamlid: parentDienst.teamlid,
            client: parentDienst.client,
            vestiging: parentDienst.vestiging,
            locatie: parentDienst.locatie,
            conflict: parentDienst.conflict || false,
            pauze_uren: parentDienst.pauze_uren || 0,
            vereist_aantal_medewerkers: parentDienst.vereist_aantal_medewerkers || 1,
            beschrijving: parentDienst.beschrijving || null,
            open_voor_aanmelding: parentDienst.open_voor_aanmelding !== false,
            parent_dienst_id: parentDienst.id,
            data: parentDienst.data || {},
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
  }

  global.dienstRecurringDB = {
    add: add,
    getForParent: getForParent,
    expandRecurring: expandRecurring,
  };
})(window);
