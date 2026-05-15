// v3 Fase G.5 + G.6 + G.7 — Admin User Management Edge Function
//
// Endpoints (POST):
//   { action: 'list-users' }
//   { action: 'reset-password', target_id }
//   { action: 'reset-2fa', target_id }
//   { action: 'change-rol', target_id, payload: { rol_id } }
//   { action: 'deactivate', target_id }
//   { action: 'activate', target_id }
//   { action: 'create-user', payload: { email, voornaam, achternaam, rol_id, medewerker_id? } }
//
// Authz: alleen admin-tier (Eigenaar / Admin / Directeur).
// Audit: elke succesvolle actie -> public.audit_log row.
// Geen e-mails: alle createUser/updateUserById calls gebruiken email_confirm:true
// of password-only updates -> Supabase verstuurt geen mail.
//
// Custom SMTP staat off (Fase 0.3) -> dubbele safeguard.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

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

  // ---- 2. Verifieer admin-tier via profiles.rol_id -> org_roles.naam ----
  const { data: actorProfile } = await admin
    .from('profiles')
    .select('rol_id, voornaam, achternaam, email')
    .eq('id', user.id)
    .maybeSingle();
  if (!actorProfile) return json({ error: 'Profile not found' }, 403);

  let actorRolNaam: string | null = null;
  if (actorProfile.rol_id) {
    const { data: actorRol } = await admin.from('org_roles').select('naam').eq('id', actorProfile.rol_id).maybeSingle();
    actorRolNaam = actorRol?.naam || null;
  }
  const ADMIN_TIER = ['Eigenaar', 'Admin', 'Directeur'];
  const isAdminTier = ADMIN_TIER.includes(actorRolNaam || '');
  if (!isAdminTier) return json({ error: `Forbidden — alleen Eigenaar/Admin/Directeur (jouw rol: ${actorRolNaam || 'geen'})` }, 403);

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
        .select('id, email, voornaam, achternaam, rol_id, medewerker_id, archived, must_change_password, must_setup_2fa, aanmaakdatum, laatst_gewijzigd')
        .order('archived', { ascending: true })
        .order('voornaam', { ascending: true });
      if (error) throw error;
      const rolIds = [...new Set((profiles || []).map((p: { rol_id: string | null }) => p.rol_id).filter(Boolean))];
      const rollen = rolIds.length > 0
        ? (await admin.from('org_roles').select('id, naam').in('id', rolIds as string[])).data || []
        : [];
      const rolMap = new Map((rollen as Array<{ id: string; naam: string }>).map((r) => [r.id, r.naam]));
      const targetIds = (profiles || []).map((p: { id: string }) => p.id);
      const factors = targetIds.length > 0
        ? (await admin.schema('auth').from('mfa_factors').select('user_id, status').in('user_id', targetIds)).data || []
        : [];
      const factorMap = new Map<string, boolean>();
      (factors as Array<{ user_id: string; status: string }>).forEach((f) => {
        if (f.status === 'verified') factorMap.set(f.user_id, true);
      });
      const enriched = (profiles || []).map((p: { id: string; rol_id: string | null }) => ({
        ...p,
        rol_naam: p.rol_id ? rolMap.get(p.rol_id) || null : null,
        has_2fa: factorMap.get(p.id) === true,
      }));
      const { data: roles } = await admin.from('org_roles').select('id, naam').order('naam');
      return json({ ok: true, users: enriched, roles: roles || [], actor_id: user.id });
    }

    if (!target_id) return json({ error: 'target_id ontbreekt' }, 400);

    if (target_id === user.id && (action === 'deactivate' || action === 'change-rol')) {
      return json({ error: 'Je kunt je eigen account niet ' + (action === 'deactivate' ? 'deactiveren' : 'van rol wijzigen') + '.' }, 400);
    }

    const targetLabel = await getTargetLabel(target_id);

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

    if (action === 'change-rol') {
      const newRolId = String(payload.rol_id || '');
      if (!newRolId) return json({ error: 'payload.rol_id ontbreekt' }, 400);
      const { data: oldP } = await admin.from('profiles').select('rol_id').eq('id', target_id).maybeSingle();
      const { data: newRol } = await admin.from('org_roles').select('naam').eq('id', newRolId).maybeSingle();
      if (!newRol) return json({ error: 'Onbekende rol_id' }, 400);
      await admin.from('profiles').update({ rol_id: newRolId }).eq('id', target_id);
      await writeAudit(target_id, 'RolGewijzigd', { target: targetLabel, old_rol_id: oldP?.rol_id, new_rol_id: newRolId, new_rol_naam: newRol.naam });
      return json({ ok: true, message: `Rol van ${targetLabel} gewijzigd naar ${newRol.naam}.` });
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
      const rol_id = String(payload.rol_id || '').trim();
      const medewerker_id = payload.medewerker_id ? String(payload.medewerker_id) : null;
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Ongeldig emailadres' }, 400);
      if (!voornaam || !achternaam) return json({ error: 'Voor- en achternaam zijn verplicht' }, 400);
      if (!rol_id) return json({ error: 'Rol is verplicht' }, 400);

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
        rol_id,
        must_change_password: true,
        must_setup_2fa: true,
      };
      if (medewerker_id) updatePayload.medewerker_id = medewerker_id;
      await admin.from('profiles').update(updatePayload).eq('id', newId);
      const { data: newRol } = await admin.from('org_roles').select('naam').eq('id', rol_id).maybeSingle();
      await writeAudit(newId, 'Aangemaakt', { target: `${voornaam} ${achternaam}`, email, rol: newRol?.naam || rol_id });
      return json({
        ok: true,
        user_id: newId,
        message: `${voornaam} ${achternaam} aangemaakt. Initieel wachtwoord: Welkom123. Geef dit mondeling door.`,
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
