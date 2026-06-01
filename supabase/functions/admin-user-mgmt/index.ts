// Admin User Management Edge Function — geconsolideerd op bs2_role_users (2026-06-01)
//
// Endpoints (POST):
//   { action: 'list-users' }
//   { action: 'reset-password', target_id }
//   { action: 'reset-2fa', target_id }
//   { action: 'deactivate', target_id }
//   { action: 'activate', target_id }
//   { action: 'create-user', payload: { email, voornaam, achternaam, role_ids: string[], medewerker_id? } }
//
// Rollen van BESTAANDE gebruikers worden client-side beheerd via window.bs2RolesDB
// (tabel bs2_role_users, RLS `authenticated`) — exact hetzelfde pad als rol-detail.html.
// Eén code-pad voor rol-toewijzing; deze functie doet alleen auth-admin-zaken + creatie.
//
// Authz: alleen admin-tier (Eigenaar / Admin / Directeur), bepaald via bs2_role_users
//        (bs2_roles.slug) óf profiles.rol = 'admin' (superadmin-klep).
// Audit: elke succesvolle actie -> public.audit_log. Geen e-mails (email_confirm:true).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

const ADMIN_TIER_SLUGS = ['admin', 'eigenaar', 'directeur'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  // ---- 1. Verifieer caller JWT ----
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'No Authorization header' }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Not authenticated' }, 401);

  // ---- 2. Verifieer admin-tier via bs2_role_users (slug) of profiles.rol='admin' ----
  const { data: actorProfile } = await admin
    .from('profiles')
    .select('rol, voornaam, achternaam, email')
    .eq('id', user.id)
    .maybeSingle();
  if (!actorProfile) return json({ error: 'Profile not found' }, 403);

  const actorEmail = String(actorProfile.email || user.email || '').toLowerCase();
  let isAdminTier = actorProfile.rol === 'admin';
  if (!isAdminTier && actorEmail) {
    const { data: actorRoles } = await admin
      .from('bs2_role_users')
      .select('bs2_roles!inner(slug)')
      .ilike('user_email', actorEmail);
    isAdminTier = (actorRoles || []).some(
      (r: { bs2_roles?: { slug?: string } }) => ADMIN_TIER_SLUGS.includes(r.bs2_roles?.slug || ''),
    );
  }
  if (!isAdminTier) {
    return json({ error: 'Forbidden — alleen Eigenaar/Admin/Directeur kunnen gebruikers beheren.' }, 403);
  }

  // ---- 3. Parse body ----
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = String(body.action || '');
  const target_id = String(body.target_id || '');
  const payload = (body.payload || {}) as Record<string, unknown>;

  // ---- 4. Helpers ----
  async function getTargetLabel(id: string): Promise<string> {
    if (!id) return '';
    const { data } = await admin.from('profiles').select('voornaam,achternaam,email').eq('id', id).maybeSingle();
    if (!data) return id;
    const naam = `${data.voornaam || ''} ${data.achternaam || ''}`.trim();
    return naam || data.email || id;
  }
  const actorLabel = `${actorProfile.voornaam || ''} ${actorProfile.achternaam || ''}`.trim() || actorProfile.email || user.email || user.id;

  async function writeAudit(resourceId: string, actie: string, details: Record<string, unknown>, status = 'succes') {
    try {
      await admin.from('audit_log').insert({
        resource: 'Profile',
        resource_id: resourceId,
        actie,
        gebruiker_id: user.id,
        gebruiker_label: actorLabel,
        details: JSON.stringify(details),
        status,
        ip: req.headers.get('x-forwarded-for') || '',
        user_agent: req.headers.get('user-agent') || '',
      });
    } catch (e) {
      console.error('[audit_log] insert failed:', e);
    }
  }

  // ---- 5. Action switch ----
  try {
    if (action === 'list-users') {
      const { data: profiles, error } = await admin
        .from('profiles')
        .select('id, email, voornaam, achternaam, medewerker_id, archived, must_change_password, must_setup_2fa, aanmaakdatum, laatst_gewijzigd')
        .order('archived', { ascending: true })
        .order('voornaam', { ascending: true });
      if (error) throw error;

      // bs2-rollen per e-mail (M2M) — case-insensitief gegroepeerd
      const { data: roleUsers } = await admin
        .from('bs2_role_users')
        .select('user_email, bs2_roles!inner(id, name, slug)');
      const rolesByEmail = new Map<string, Array<{ id: string; name: string; slug: string | null }>>();
      (roleUsers || []).forEach((row: { user_email: string; bs2_roles?: { id: string; name: string; slug: string | null } }) => {
        const e = String(row.user_email || '').toLowerCase();
        const r = row.bs2_roles;
        if (!r) return;
        if (!rolesByEmail.has(e)) rolesByEmail.set(e, []);
        rolesByEmail.get(e)!.push({ id: r.id, name: r.name, slug: r.slug });
      });

      // 2FA-status
      const targetIds = (profiles || []).map((p: { id: string }) => p.id);
      const factors = targetIds.length > 0
        ? (await admin.schema('auth').from('mfa_factors').select('user_id, status').in('user_id', targetIds)).data || []
        : [];
      const factorMap = new Map<string, boolean>();
      (factors as Array<{ user_id: string; status: string }>).forEach((f) => {
        if (f.status === 'verified') factorMap.set(f.user_id, true);
      });

      const enriched = (profiles || []).map((p: { id: string; email: string | null }) => {
        const rollen = (rolesByEmail.get(String(p.email || '').toLowerCase()) || [])
          .sort((a, b) => a.name.localeCompare(b.name, 'nl'));
        return { ...p, rollen, has_2fa: factorMap.get(p.id) === true };
      });

      const { data: allRoles } = await admin.from('bs2_roles').select('id, name, slug').order('name');
      return json({ ok: true, users: enriched, roles: allRoles || [], actor_id: user.id });
    }

    const TARGET_REQUIRED = ['reset-password', 'reset-2fa', 'deactivate', 'activate'];
    if (TARGET_REQUIRED.includes(action) && !target_id) {
      return json({ error: 'target_id ontbreekt' }, 400);
    }
    if (target_id && target_id === user.id && action === 'deactivate') {
      return json({ error: 'Je kunt je eigen account niet deactiveren.' }, 400);
    }

    const targetLabel = target_id ? await getTargetLabel(target_id) : '';

    if (action === 'reset-password') {
      const { error } = await admin.auth.admin.updateUserById(target_id, { password: 'Welkom123' });
      if (error) throw error;
      await admin.from('profiles').update({ must_change_password: true }).eq('id', target_id);
      await writeAudit(target_id, 'WachtwoordGereset', { target: targetLabel, new_password_placeholder: 'Welkom123' });
      return json({ ok: true, message: `Wachtwoord van ${targetLabel} gereset naar Welkom123. Geef dit mondeling door.` });
    }

    if (action === 'reset-2fa') {
      const { data: userFactors } = await admin.schema('auth').from('mfa_factors').select('id').eq('user_id', target_id);
      let deleted = 0;
      for (const f of (userFactors || []) as Array<{ id: string }>) {
        try {
          await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: target_id });
          deleted++;
        } catch {
          await admin.schema('auth').from('mfa_factors').delete().eq('id', f.id);
          deleted++;
        }
      }
      await admin.from('profiles').update({ must_setup_2fa: true }).eq('id', target_id);
      await writeAudit(target_id, '2FAGereset', { target: targetLabel, factors_deleted: deleted });
      return json({ ok: true, message: `2FA van ${targetLabel} gereset (${deleted} factor(s) verwijderd). User krijgt enrollment-wizard bij volgende login.` });
    }

    if (action === 'deactivate' || action === 'activate') {
      const archived = action === 'deactivate';
      await admin.from('profiles').update({ archived }).eq('id', target_id);
      await writeAudit(target_id, archived ? 'Gedeactiveerd' : 'Geactiveerd', { target: targetLabel });
      return json({ ok: true, message: `${targetLabel} ${archived ? 'gedeactiveerd' : 'geactiveerd'}.` });
    }

    if (action === 'create-user') {
      const email = String(payload.email || '').trim().toLowerCase();
      const voornaam = String(payload.voornaam || '').trim();
      const achternaam = String(payload.achternaam || '').trim();
      const medewerker_id = payload.medewerker_id ? String(payload.medewerker_id) : null;
      const roleIds = Array.isArray(payload.role_ids) ? (payload.role_ids as unknown[]).map(String).filter(Boolean) : [];
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Ongeldig emailadres' }, 400);
      if (!voornaam || !achternaam) return json({ error: 'Voor- en achternaam zijn verplicht' }, 400);
      if (roleIds.length === 0) return json({ error: 'Selecteer minstens één rol' }, 400);

      // Valideer dat de rollen bestaan
      const { data: validRoles, error: vErr } = await admin.from('bs2_roles').select('id, name').in('id', roleIds);
      if (vErr) throw vErr;
      if (!validRoles || validRoles.length === 0) return json({ error: 'Onbekende rol(len)' }, 400);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password: 'Welkom123',
        email_confirm: true,
        user_metadata: { naam: `${voornaam} ${achternaam}`, onboarded_via: 'gebruikers-tab' },
      });
      if (cErr) throw cErr;
      const newId = created.user.id;

      const updatePayload: Record<string, unknown> = {
        voornaam,
        achternaam,
        must_change_password: true,
        must_setup_2fa: true,
      };
      if (medewerker_id) updatePayload.medewerker_id = medewerker_id;
      await admin.from('profiles').update(updatePayload).eq('id', newId);

      // Koppel de gekozen rollen via bs2_role_users (nieuw e-mailadres -> geen conflicten)
      const naam = `${voornaam} ${achternaam}`.trim();
      const roleRows = (validRoles as Array<{ id: string; name: string }>).map((r) => ({
        role_id: r.id,
        user_email: email,
        user_name: naam,
        aanmaakdatum: new Date().toISOString(),
      }));
      const { error: rErr } = await admin.from('bs2_role_users').insert(roleRows);
      if (rErr) throw rErr;

      const rolNamen = (validRoles as Array<{ name: string }>).map((r) => r.name);
      await writeAudit(newId, 'Aangemaakt', { target: naam, email, rollen: rolNamen });
      return json({
        ok: true,
        user_id: newId,
        message: `${naam} aangemaakt met rol(len): ${rolNamen.join(', ')}. Initieel wachtwoord: Welkom123. Geef dit mondeling door.`,
      });
    }

    return json({ error: `Onbekende actie: ${action}` }, 400);
  } catch (err) {
    const msg = (err as Error).message || String(err);
    console.error('[admin-user-mgmt] error:', msg);
    if (target_id) await writeAudit(target_id, action, { error: msg }, 'fout');
    return json({ error: msg }, 500);
  }
});
