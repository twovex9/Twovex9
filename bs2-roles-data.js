/* global window */
/**
 * bs2-roles-data.js — data-laag voor de Rollen-beheerpagina (1-op-1 BS2).
 *
 * Bron: public.bs2_roles / bs2_permissions / bs2_role_permissions /
 * bs2_role_users / bs2_hierarchy_levels (read-only-gescrapet uit BS2
 * PRODUCTIE, daarna in BS1 beheerbaar). STRIKT los van org_roles /
 * org_role_sections / profiles.rol — die worden niet aangeraakt.
 *
 * window.bs2RolesDB:
 *   ready, refresh,
 *   getLevelsSync(), getRolesSync(), getPermissionsSync()  (catalogus),
 *   getGroupedSync()  -> [{level, roles[]}]  (rollen per hiërarchie-niveau),
 *   loadRoleDetail(id) -> {permSlugs:Set, users:[]},
 *   getProfilesSync()  -> [{naam,email}]  (voor toewijzen),
 *   togglePerm(roleId, slug, on), setLevel(roleId, levelId|null),
 *   addUser(roleId, email, naam), removeUser(roleId, email)
 *
 * Alle mutaties: await Supabase, daarna showActionFeedback (wordt door
 * besa-audit.js automatisch in de audit gelogd met de echte gebruiker).
 */
(function (global) {
  "use strict";

  var _levels = null, _roles = null, _perms = null;
  var readyPromise = null;

  function sb() {
    if (!global.besaSupabase) throw new Error("Supabase client niet geladen");
    return global.besaSupabase;
  }
  function dispatch(src) {
    try { global.dispatchEvent(new CustomEvent("besa:bs2-roles-updated", { detail: { source: src || "data" } })); } catch (e) { /* */ }
  }
  // ⚠️ Een falende READ van een rollen-lijst mag NOOIT de hele app
  // uitloggen. besaReportSyncFailure classificeert een 401/403 als
  // auth-fout → besaHandleAuthFailure → logout. Tijdens page-load racet
  // dit met de sessie-hydratie → /rollen bounce naar login. Daarom: enkel
  // console.warn, NIET escaleren.
  function reportSilent(action, err) {
    try { console.warn("[bs2RolesDB] " + action + " mislukt (geen logout):", err && err.message || err); } catch (e) { /* */ }
  }

  // Leest de persistente Supabase-sessie rechtstreeks uit localStorage.
  // getSession() loopt via de navigator-LockManager en geeft op zware
  // pagina's (zoals /rollen) tijdens de client-hydratie een *transient
  // null* terug, terwijl de sessie wél geldig op schijf staat én de
  // Supabase-client de JWT gewoon meestuurt zodra de eerste query loopt.
  // Dit is exact de #289-aanpak (storedSessionLooksValid in auth-guard.js):
  // localStorage["sb-besa-auth"] is de betrouwbare bron-van-waarheid.
  function storedSessionLooksValid() {
    try {
      var raw = global.localStorage.getItem("sb-besa-auth");
      if (!raw) return false;
      var o = JSON.parse(raw);
      var sess = (o && (o.currentSession || o.session)) || o;
      return !!(sess && sess.refresh_token);
    } catch (e) { return false; }
  }

  // Wacht tot er een bruikbare sessie is vóór we queries vuren — anders
  // 401's tijdens de load-race die de auth-flow verstoren. Resolve zodra
  // óf getSession() een sessie geeft, óf de persistente sessie in
  // localStorage geldig is (refresh_token aanwezig). Die laatste is de
  // betrouwbare bron op zware pagina's waar getSession() transient null
  // teruggeeft — vóór #289 leidde dat tot "geen sessie — overgeslagen"
  // en een lege Rollen-pagina (0 rollen, 0 gebruikers).
  async function waitForSession(maxMs) {
    if (storedSessionLooksValid()) return true;
    var deadline = Date.now() + (maxMs || 8000);
    while (Date.now() < deadline) {
      try {
        var s = await global.besaSupabase.auth.getSession();
        if (s && s.data && s.data.session && s.data.session.user) return true;
      } catch (e) { /* */ }
      if (storedSessionLooksValid()) return true;
      await new Promise(function (r) { setTimeout(r, 250); });
    }
    return storedSessionLooksValid();
  }

  async function fetchAllOnce() {
    var r = sb();
    var out = await Promise.all([
      r.from("bs2_hierarchy_levels").select("id,name,hierarchy_order").order("hierarchy_order", { ascending: true }),
      r.from("bs2_roles").select("id,name,slug,description,users_count,hierarchy_level_id").order("name", { ascending: true }),
      r.from("bs2_permissions").select("slug,perm_group,perm_order,model,is_main,allows_hierarchical_configuration,required_permissions").order("perm_group", { ascending: true }).order("perm_order", { ascending: true }),
    ]);
    for (var i = 0; i < out.length; i++) if (out[i].error) throw out[i].error;
    _levels = out[0].data || [];
    _perms = out[2].data || [];
    // live tellingen per rol uit de koppeltabellen (i.p.v. bevroren users_count)
    var roles = out[1].data || [];
    var rp = await r.from("bs2_role_permissions").select("role_id");
    var ru = await r.from("bs2_role_users").select("role_id");
    if (rp.error) throw rp.error;
    if (ru.error) throw ru.error;
    var pc = {}, uc = {};
    (rp.data || []).forEach(function (x) { pc[x.role_id] = (pc[x.role_id] || 0) + 1; });
    (ru.data || []).forEach(function (x) { uc[x.role_id] = (uc[x.role_id] || 0) + 1; });
    roles.forEach(function (ro) { ro.perm_count = pc[ro.id] || 0; ro.user_count = uc[ro.id] || 0; });
    _roles = roles;
  }

  // bs2_roles / bs2_permissions zijn VASTE catalogi: voor een ingelogde
  // user altijd niet-leeg (14 rollen / 146 permissies). Komt het leeg
  // terug ZÓNDER error terwijl er een geldige sessie op schijf staat,
  // dan vuurde de Supabase-client de query vóór de JWT gehydrateerd was
  // (RLS `to authenticated` → 0 rijen, geen error). Dat is exact waarom
  // rol-detail.html terugkaatste terwijl rollen.html (event-driven,
  // geduldig) het overleefde. Self-healing: herhaal tot er data is of er
  // aantoonbaar geen sessie is. Begrensd (~7s) zodat dit nooit hangt.
  async function fetchAll() {
    for (var attempt = 0; attempt < 24; attempt++) {
      await fetchAllOnce();
      var got = (_roles && _roles.length) && (_perms && _perms.length);
      if (got || !storedSessionLooksValid()) return;
      await new Promise(function (r) { setTimeout(r, 300); });
    }
  }

  function bootstrap() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      try {
        // Wacht op de sessie-rehydratie-guard (supabase-client.js): die zet
        // de persistente sessie deterministisch terug in de client vóór we
        // queries vuren. Zonder dit gaf de client soms instant "Auth
        // session missing" → 0 rijen → lege Rollen / rol-detail-bounce.
        if (global.besaSupabaseReady) {
          try { await global.besaSupabaseReady; } catch (e) { /* */ }
        }
        // Niet vuren vóór er een sessie is (voorkomt 401-race op page-load
        // die /rollen naar login bouncete).
        var ok = await waitForSession(8000);
        if (!ok) { reportSilent("bootstrap", "geen sessie — overgeslagen"); return; }
        await fetchAll(); // self-healing: retryt intern bij 0-rijen-met-sessie
        dispatch("bootstrap");
      } catch (err) {
        // Fout met geldige sessie op schijf → één retry; pas daarna stil
        // rapporteren (geen logout — zie reportSilent).
        if (storedSessionLooksValid()) {
          try {
            await new Promise(function (r) { setTimeout(r, 700); });
            await fetchAll();
            dispatch("bootstrap");
            return;
          } catch (err2) { reportSilent("bootstrap", err2); return; }
        }
        reportSilent("bootstrap", err);
      }
    })();
    return readyPromise;
  }
  async function refresh() { await fetchAll(); dispatch("refresh"); }

  function getLevelsSync() { return _levels || []; }
  function getRolesSync() { return _roles || []; }
  function getPermissionsSync() { return _perms || []; }

  function getGroupedSync() {
    var levels = getLevelsSync().slice();
    var roles = getRolesSync();
    var groups = levels.map(function (l) {
      return { level: l, roles: roles.filter(function (r) { return r.hierarchy_level_id === l.id; }) };
    });
    var zonder = roles.filter(function (r) { return !r.hierarchy_level_id; });
    if (zonder.length) groups.push({ level: { id: null, name: "Niet ingedeeld" }, roles: zonder });
    return groups;
  }

  async function loadRoleDetail(id) {
    var r = sb();
    var out = await Promise.all([
      r.from("bs2_role_permissions").select("permission_slug,is_hierarchical").eq("role_id", id),
      r.from("bs2_role_users").select("user_email,user_name,status").eq("role_id", id).order("user_name", { ascending: true }),
    ]);
    if (out[0].error) throw out[0].error;
    if (out[1].error) throw out[1].error;
    var perms = {};
    (out[0].data || []).forEach(function (x) { perms[x.permission_slug] = { on: true, hier: !!x.is_hierarchical }; });
    return { perms: perms, users: out[1].data || [] };
  }

  // Gebatchte opslag (BS2 "Wijzigingen opslaan"): voeg toe / verwijder /
  // wijzig is_hierarchical in één keer. addRows = [{slug,hier}].
  async function applyPermDiff(roleId, addRows, removeSlugs, hierChanges) {
    var r = sb();
    if (addRows && addRows.length) {
      var ins = await r.from("bs2_role_permissions").upsert(
        addRows.map(function (a) { return { role_id: roleId, permission_slug: a.slug, is_hierarchical: !!a.hier }; }),
        { onConflict: "role_id,permission_slug" }
      );
      if (ins.error) throw ins.error;
    }
    if (removeSlugs && removeSlugs.length) {
      var del = await r.from("bs2_role_permissions").delete().eq("role_id", roleId).in("permission_slug", removeSlugs);
      if (del.error) throw del.error;
    }
    if (hierChanges && hierChanges.length) {
      for (var i = 0; i < hierChanges.length; i++) {
        var h = hierChanges[i];
        var up = await r.from("bs2_role_permissions").update({ is_hierarchical: !!h.hier }).eq("role_id", roleId).eq("permission_slug", h.slug);
        if (up.error) throw up.error;
      }
    }
    var ro = (_roles || []).find(function (x) { return x.id === roleId; });
    if (ro) {
      var add = (addRows && addRows.length) || 0, rem = (removeSlugs && removeSlugs.length) || 0;
      ro.perm_count = Math.max(0, (ro.perm_count || 0) + add - rem);
    }
    dispatch("perm-batch");
  }

  function getProfilesSync() {
    try {
      var ps = (global.profilesDB && global.profilesDB.getAllSync && global.profilesDB.getAllSync()) || [];
      return ps.map(function (p) {
        var naam = [p.voornaam, p.achternaam].filter(Boolean).join(" ").trim() || p.naam || p.email || "";
        return { naam: naam, email: (p.email || "").trim() };
      }).filter(function (p) { return p.email; })
        .sort(function (a, b) { return a.naam.localeCompare(b.naam, "nl", { sensitivity: "base" }); });
    } catch (e) { return []; }
  }

  function bump(roleId, field, delta) {
    var ro = (_roles || []).find(function (x) { return x.id === roleId; });
    if (ro) ro[field] = Math.max(0, (ro[field] || 0) + delta);
  }

  async function togglePerm(roleId, slug, on) {
    var r = sb();
    if (on) {
      var ins = await r.from("bs2_role_permissions").upsert({ role_id: roleId, permission_slug: slug }, { onConflict: "role_id,permission_slug" });
      if (ins.error) throw ins.error;
      bump(roleId, "perm_count", 1);
    } else {
      var del = await r.from("bs2_role_permissions").delete().eq("role_id", roleId).eq("permission_slug", slug);
      if (del.error) throw del.error;
      bump(roleId, "perm_count", -1);
    }
    dispatch("perm");
  }

  async function setLevel(roleId, levelId) {
    var r = sb();
    var up = await r.from("bs2_roles").update({ hierarchy_level_id: levelId || null, laatst_gewijzigd: new Date().toISOString() }).eq("id", roleId);
    if (up.error) throw up.error;
    var ro = (_roles || []).find(function (x) { return x.id === roleId; });
    if (ro) ro.hierarchy_level_id = levelId || null;
    dispatch("level");
  }

  async function addUser(roleId, email, naam) {
    email = String(email || "").trim();
    if (!email) throw new Error("E-mail vereist");
    var r = sb();
    var up = await r.from("bs2_role_users").upsert(
      { role_id: roleId, user_email: email, user_name: naam || null },
      { onConflict: "role_id,user_email" }
    );
    if (up.error) throw up.error;
    bump(roleId, "user_count", 1);
    dispatch("user");
  }

  async function removeUser(roleId, email) {
    var r = sb();
    var del = await r.from("bs2_role_users").delete().eq("role_id", roleId).eq("user_email", email);
    if (del.error) throw del.error;
    bump(roleId, "user_count", -1);
    dispatch("user");
  }

  global.bs2RolesDB = {
    get ready() { return readyPromise || bootstrap(); },
    refresh: refresh,
    getLevelsSync: getLevelsSync,
    getRolesSync: getRolesSync,
    getPermissionsSync: getPermissionsSync,
    getGroupedSync: getGroupedSync,
    loadRoleDetail: loadRoleDetail,
    applyPermDiff: applyPermDiff,
    getProfilesSync: getProfilesSync,
    togglePerm: togglePerm,
    setLevel: setLevel,
    addUser: addUser,
    removeUser: removeUser,
  };

  // GEEN eager bootstrap meer: de page-scripts (rollen.js / rol-detail.js)
  // roepen DB().ready aan ná DOMContentLoaded — dán heeft auth-guard de
  // sessie al afgehandeld. Eager firen bij module-load racete met de
  // sessie-hydratie en triggerde de logout/redirect.
})(typeof window !== "undefined" ? window : this);
