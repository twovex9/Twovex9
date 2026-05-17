/* ============================================================================
 * write-taken.mjs — niet-destructieve import BS2 /api/tasks → BS1
 *
 * Leest C:/Users/sonck/Downloads/bs2-taken.json (recorder-output), pakt de
 * volledige /api/tasks-respons (518 taken, embeds assignee/creator/
 * collaborators/incident) en zet ze via de Supabase REST-API
 * (service_role) in public.taken. 100% BS2-raw blijft in data.bs2_scrape.
 * Idempotent: upsert op id (= BS2 task-id). `taken` was leeg → niet-
 * destructief; geen andere tabel wordt geraakt.
 *
 * DRAAIEN (PowerShell, vanuit besa-suite-etf/):
 *   node --env-file=scripts/.env scripts/write-taken.mjs
 * ==========================================================================*/
import { readFileSync } from "node:fs";

const SUPABASE_URL = "https://boscwvojcggkbdxhlfys.supabase.co";
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

if (!KEY) {
  console.error(
    "FOUT: geen service_role key in env (SUPABASE_SERVICE_ROLE_KEY / " +
      "SERVICE_ROLE_KEY / SERVICE_ROLE / SUPABASE_SERVICE_KEY).\n" +
      "Draai: node --env-file=scripts/.env scripts/write-taken.mjs"
  );
  process.exit(1);
}

const SRC = "C:/Users/sonck/Downloads/bs2-taken.json";

function rest(method, path, body, extra) {
  return fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method,
    headers: Object.assign(
      { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
      extra || {}
    ),
    body: body == null ? undefined : JSON.stringify(body),
  });
}
async function must(resOrP, what) {
  const res = await resOrP;
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(what + " → HTTP " + res.status + " " + t.slice(0, 600));
  }
  return res;
}
function isoOrNull(v) { return v ? v : null; }

async function main() {
  const J = JSON.parse(readFileSync(SRC, "utf8"));
  // Rijkste GET /api/tasks-respons (meeste taken) = de volledige set.
  const lists = (J.records || []).filter(
    (r) => r.path === "/api/tasks" && r.method === "GET" && r.resp && Array.isArray(r.resp.data)
  );
  if (!lists.length) throw new Error("Geen /api/tasks-lijst met data in JSON");
  const full = lists.sort((a, b) => b.resp.data.length - a.resp.data.length)[0];
  const tasks = full.resp.data;
  console.log("Bron: " + tasks.length + " taken (volledige /api/tasks-respons)");

  const rows = tasks.map((t) => ({
    id: t.id,
    bs2_id: t.id,
    title: t.title || null,
    naam: t.title || null,
    description: t.description || null,
    beschrijving: t.description || null,
    due_date: isoOrNull(t.due_date),
    deadline: isoOrNull(t.due_date),
    priority_bs2: t.priority || null,
    status_bs2: t.status || null,
    is_private: !!t.is_private,
    assignee: t.assignee || null,
    creator: t.creator || null,
    collaborators: t.collaborators || [],
    incident: t.incident || null,
    archived: !!t.deleted_at,
    bs2_created_at: isoOrNull(t.created_at),
    bs2_updated_at: isoOrNull(t.updated_at),
    data: { bs2_scrape: t },
    aanmaakdatum: isoOrNull(t.created_at) || new Date().toISOString(),
    laatst_gewijzigd: isoOrNull(t.updated_at) || new Date().toISOString(),
  }));

  for (let i = 0; i < rows.length; i += 100) {
    const slice = rows.slice(i, i + 100);
    await must(
      rest("POST", "taken?on_conflict=id", slice, {
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      "upsert taken [" + i + "]"
    );
    console.log("  geüpsert " + Math.min(i + 100, rows.length) + "/" + rows.length);
  }

  const cnt = await must(
    rest("GET", "taken?select=id", null, { Prefer: "count=exact", Range: "0-0" }),
    "count taken"
  );
  console.log("Supabase taken content-range:", cnt.headers.get("content-range"));
  console.log("KLAAR ✓ — niet-destructief; alleen public.taken gevuld.");
}

main().catch((e) => {
  console.error("IMPORT FOUT:", e && e.message ? e.message : e);
  process.exit(1);
});
