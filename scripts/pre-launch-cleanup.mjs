#!/usr/bin/env node
/**
 * v3 Fase I — Pre-cut-over cleanup
 *
 * Verwijdert ALLE test-residuals vóór go-live:
 *   - Auth users met email zoals %claude-test% of %zzz-claude% of %@example.com
 *   - Profiles + medewerker-records met ZZZ-CLAUDE-TEST prefix in id
 *   - Audit-log entries van test-acties (gegenereerd door test-actors)
 *   - Andere tabellen waar test-records gemarkeerd zijn
 *
 * Standaard --dry-run: toont counts zonder iets te verwijderen.
 * Met --live: voert daadwerkelijk DELETE uit (irreversibel).
 *
 * VEREIST:
 *   SUPABASE_SERVICE_ROLE_KEY env-var
 *
 * GEBRUIK:
 *   $env:SUPABASE_SERVICE_ROLE_KEY = 'eyJ...'
 *   node scripts/pre-launch-cleanup.mjs               # dry-run
 *   node scripts/pre-launch-cleanup.mjs --live        # daadwerkelijk verwijderen
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://boscwvojcggkbdxhlfys.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = process.argv.includes('--live');

if (!SERVICE_KEY) {
  console.error('FOUT: SUPABASE_SERVICE_ROLE_KEY ontbreekt.');
  console.error('Haal de key uit: https://supabase.com/dashboard/project/boscwvojcggkbdxhlfys/settings/api');
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
  Prefer: 'count=exact',
};

async function rest(path, opts = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: { ...HEADERS, ...(opts.method === 'DELETE' ? { Prefer: 'return=minimal,count=exact' } : {}) },
  });
  const count = parseInt(r.headers.get('content-range')?.split('/')?.[1] || '0', 10);
  const data = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${r.status}: ${JSON.stringify(data)}`);
  return { count, data };
}

async function adminAuthGetUsers() {
  const r = await fetch(SUPABASE_URL + '/auth/v1/admin/users?per_page=200', { headers: HEADERS });
  const d = await r.json();
  return d.users || [];
}

async function adminAuthDeleteUser(id) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/admin/users/' + id, { method: 'DELETE', headers: HEADERS });
  if (!r.ok) throw new Error(`DELETE auth.user ${id} → ${r.status}: ${await r.text()}`);
}

async function main() {
  console.log('=================================================');
  console.log('v3 Fase I — Pre-cut-over cleanup');
  console.log('Mode:', LIVE ? '🔴 LIVE (irreversibel DELETE)' : '🔵 DRY-RUN (alleen counts)');
  console.log('URL :', SUPABASE_URL);
  console.log('=================================================\n');

  const report = {};

  // ===== 1. Auth.users met test-emails =====
  console.log('1️⃣  Test-auth-users (email LIKE %claude-test% / %zzz-claude% / %@example.com)...');
  const allAuth = await adminAuthGetUsers();
  const testUsers = allAuth.filter((u) => {
    const e = (u.email || '').toLowerCase();
    return e.includes('claude-test') || e.includes('zzz-claude') || e.endsWith('@example.com');
  });
  report.test_auth_users = testUsers.length;
  if (testUsers.length === 0) {
    console.log('   ✓ 0 test-auth-users gevonden');
  } else {
    console.log(`   • ${testUsers.length} test-auth-users:`);
    testUsers.forEach((u) => console.log(`     - ${u.email} (${u.id})`));
    if (LIVE) {
      for (const u of testUsers) {
        try { await adminAuthDeleteUser(u.id); console.log(`     ✓ verwijderd: ${u.email}`); }
        catch (e) { console.error(`     ✗ FAIL: ${u.email} → ${e.message}`); }
      }
    }
  }
  console.log('');

  // ===== 2. Public records met ZZZ-CLAUDE-TEST prefix =====
  const tabellenMetTextId = ['medewerkers', 'clienten', 'beschikkingen', 'facturen', 'planning'];
  for (const tabel of tabellenMetTextId) {
    console.log(`2️⃣  ${tabel} met id LIKE 'ZZZ-CLAUDE-TEST%'...`);
    try {
      const { count } = await rest(`${tabel}?id=like.ZZZ-CLAUDE-TEST*&select=id`);
      report[tabel] = count;
      if (count === 0) {
        console.log(`   ✓ 0 records`);
      } else {
        console.log(`   • ${count} records om te verwijderen`);
        if (LIVE) {
          await rest(`${tabel}?id=like.ZZZ-CLAUDE-TEST*`, { method: 'DELETE' });
          console.log(`   ✓ ${count} records verwijderd`);
        }
      }
    } catch (e) {
      console.log(`   ⚠️  ${e.message}`);
    }
  }
  console.log('');

  // ===== 3. Audit-log: residual test-acties =====
  // Test-actie patterns die we WEL willen laten staan (echte productie-audit blijft):
  //   - Anything met resource='Profile' + gebruiker_label='Test Medewerker' (van CLEAN RUN tests)
  //   - audit entries waarin details JSON 'ZZZ-Claude' bevat
  console.log('3️⃣  Audit-log entries van test-acties (gebruiker_label="Test Medewerker" of details bevat "ZZZ-Claude")...');
  try {
    const { data: testAudit } = await rest(`audit_log?or=(gebruiker_label.eq.Test%20Medewerker,details.ilike.*ZZZ-Claude*)&select=id,actie,gebruiker_label`);
    report.test_audit_entries = testAudit?.length || 0;
    if (!testAudit || testAudit.length === 0) {
      console.log('   ✓ 0 test-audit-entries');
    } else {
      console.log(`   • ${testAudit.length} test-audit-entries`);
      if (LIVE) {
        await rest(`audit_log?or=(gebruiker_label.eq.Test%20Medewerker,details.ilike.*ZZZ-Claude*)`, { method: 'DELETE' });
        console.log(`   ✓ ${testAudit.length} verwijderd`);
      }
    }
  } catch (e) {
    console.log(`   ⚠️  ${e.message}`);
  }
  console.log('');

  // ===== 4. Active profiles count (sanity) =====
  console.log('4️⃣  Sanity: active profiles + medewerkers counts...');
  try {
    const { count: profilesCount } = await rest('profiles?archived=eq.false&select=id');
    const { count: medewerkersCount } = await rest('medewerkers?or=(archived.is.null,archived.eq.false)&select=id');
    report.active_profiles = profilesCount;
    report.active_medewerkers = medewerkersCount;
    console.log(`   • ${profilesCount} actieve profiles`);
    console.log(`   • ${medewerkersCount} actieve medewerkers`);
  } catch (e) {
    console.log(`   ⚠️  ${e.message}`);
  }
  console.log('');

  // ===== Eindrapport =====
  console.log('=================================================');
  console.log(LIVE ? '🔴 LIVE — Cleanup uitgevoerd' : '🔵 DRY-RUN — Counts hierboven');
  console.log('=================================================');
  console.log(JSON.stringify(report, null, 2));

  if (!LIVE) {
    console.log('\n⚠️  Dit was een DRY-RUN. Geen wijzigingen.');
    console.log('   Run met --live om daadwerkelijk te verwijderen.');
  } else {
    console.log('\n✓ Productie-DB schoongemaakt. Klaar voor go-live.');
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
