/* ============================================================================
 * write-facturen-invoices.mjs — niet-destructieve import BS2 /api/invoices → BS1
 *
 * Leest C:/Users/sonck/Downloads/bs2-facturen-full.json (full-scrape v2) en
 * zet de employee-invoices via de Supabase REST-API (service_role) in:
 *   public.invoices                       (1 rij per factuur)
 *   public.invoice_billing_fields         (1 rij per factuurregel, FK → factuur)
 *   public.invoice_workflow_transitions   (1 rij per status-overgang, FK → factuur)
 * 100% BS2-raw blijft behouden (`data` jsonb = volledige scrape per entiteit).
 * Strikt LOS van de bestaande `facturen`-tabel (Cliënten/disposition) — die
 * wordt NIET aangeraakt.
 *
 * Idempotent: invoices = upsert op id; child-rijen worden per factuur
 * vervangen (delete-by-invoice_id → insert). Veilig om te herdraaien.
 *
 * DRAAIEN (PowerShell, vanuit future-flow/):
 *   node --env-file=scripts/.env scripts/write-facturen-invoices.mjs
 *
 * Vereist in scripts/.env de Supabase service_role key (één van:
 *   SUPABASE_SERVICE_ROLE_KEY / SERVICE_ROLE_KEY / SERVICE_ROLE /
 *   SUPABASE_SERVICE_KEY). Project-URL staat hieronder hard (publiek).
 * ==========================================================================*/
import { readFileSync } from "node:fs";

const SUPABASE_URL = "https://ukjflilnhigozfoxowmj.supabase.co";
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_KEY;

if (!KEY) {
  console.error(
    "FOUT: geen service_role key in env. Verwacht een van: " +
      "SUPABASE_SERVICE_ROLE_KEY / SERVICE_ROLE_KEY / SERVICE_ROLE / SUPABASE_SERVICE_KEY.\n" +
      "Draai met:  node --env-file=scripts/.env scripts/write-facturen-invoices.mjs"
  );
  process.exit(1);
}

const SRC = "C:/Users/sonck/Downloads/bs2-facturen-full.json";

function rest(method, path, body, extraHeaders) {
  return fetch(SUPABASE_URL + "/rest/v1/" + path, {
    method,
    headers: Object.assign(
      { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" },
      extraHeaders || {}
    ),
    body: body == null ? undefined : JSON.stringify(body),
  });
}
async function must(resOrPromise, what) {
  const res = await resOrPromise;
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(what + " → HTTP " + res.status + " " + t.slice(0, 600));
  }
  return res;
}
function isoOrNull(v) { return v ? v : null; }
async function chunkInsert(table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200);
    await must(
      rest("POST", table, slice, { Prefer: "return=minimal" }),
      "insert " + table + " [" + i + "]"
    );
  }
}

async function main() {
  const J = JSON.parse(readFileSync(SRC, "utf8"));
  const list = J.invoices_list || [];
  const detail = J.invoices_detail || {};

  // Bron per factuur = het detail (rijkste: billing_fields + workflow +
  // client/contact_person); val terug op de lijst-rij.
  const ids = [];
  const invRows = [];
  const bfRows = [];
  const wfRows = [];

  for (const li of list) {
    const id = li && li.id;
    if (!id) continue;
    const d = detail[id] && !detail[id].__error ? detail[id] : li;
    ids.push(id);

    const per = d.period || {};
    const sg = d.system_generated || null;
    const sgLight = sg
      ? {
          mode: sg.mode, period: sg.period, totals: sg.totals,
          billing_summary: sg.billing_summary, generated_at: sg.generated_at,
          metadata: sg.metadata,
        }
      : null;

    invRows.push({
      id,
      number: d.number || null,
      jaar: per.year ?? null,
      maand: per.month ?? null,
      period_formatted: per.formatted || null,
      total_excl_vat: Number(d.total_excl_vat) || 0,
      total: Number(d.total) || 0,
      vat_handling: d.vat_handling || null,
      status: d.status || "draft",
      priority: d.priority || null,
      organization: d.organization || null,
      employee: d.employee || null,
      client: d.client || null,
      contact_person: d.contact_person || null,
      invoice_date: isoOrNull(d.invoice_date),
      expiration_date: isoOrNull(d.expiration_date),
      pdf: d.pdf || null,
      sent_at: isoOrNull(d.sent_at),
      submitted_at: isoOrNull(d.submitted_at),
      rejected_at: isoOrNull(d.rejected_at),
      approved_at: isoOrNull(d.approved_at),
      can_be_submitted: !!d.can_be_submitted,
      can_be_edited: !!d.can_be_edited,
      can_be_approved: !!d.can_be_approved,
      can_be_rejected: !!d.can_be_rejected,
      can_be_marked_under_review: !!d.can_be_marked_under_review,
      system_generated_summary: sgLight,
      gearchiveerd: !!d.deleted_at,
      deleted_at: isoOrNull(d.deleted_at),
      data: { bs2_scrape: d },
      aanmaakdatum: isoOrNull(d.created_at) || new Date().toISOString(),
      laatst_gewijzigd: isoOrNull(d.updated_at) || new Date().toISOString(),
    });

    for (const b of d.billing_fields || []) {
      if (!b || !b.id) continue;
      bfRows.push({
        id: b.id,
        invoice_id: id,
        naam: b.name || null,
        title: b.title || null,
        description: b.description || null,
        unit: b.unit || null,
        price: Number(b.price) || 0,
        amount: Number(b.amount) || 0,
        total: Number(b.total) || 0,
        sort_order: b.order ?? null,
        product: b.product || null,
        comments: b.comments ?? null,
        is_group: !!b.is_group,
        is_blank_row: !!b.is_blank_row,
        is_auto_generated: !!b.is_auto_generated,
        shift: b.shift || null,
        data: b,
        aanmaakdatum: isoOrNull(b.created_at) || new Date().toISOString(),
        laatst_gewijzigd: isoOrNull(b.updated_at) || new Date().toISOString(),
      });
    }
    for (const w of d.workflow_transitions || []) {
      if (!w || !w.id) continue;
      wfRows.push({
        id: w.id,
        invoice_id: id,
        status: w.status || null,
        comment: w.comment || null,
        user_id: (w.user && w.user.id) || null,
        user_name: (w.user && w.user.name) || null,
        created_at: isoOrNull(w.created_at),
        data: w,
      });
    }
  }

  console.log(
    `Bron: ${list.length} facturen → invoices ${invRows.length}, ` +
      `billing_fields ${bfRows.length}, workflow_transitions ${wfRows.length}`
  );

  // 1) invoices upsert (merge op id)
  for (let i = 0; i < invRows.length; i += 100) {
    const slice = invRows.slice(i, i + 100);
    await must(
      rest("POST", "invoices?on_conflict=id", slice, {
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      "upsert invoices [" + i + "]"
    );
  }
  console.log("✓ invoices geüpsert: " + invRows.length);

  // 2) child-rijen per factuur vervangen (idempotent)
  if (ids.length) {
    const inList = "(" + ids.map((x) => '"' + x + '"').join(",") + ")";
    await must(
      rest("DELETE", "invoice_billing_fields?invoice_id=in." + inList, null, { Prefer: "return=minimal" }),
      "delete oude billing_fields"
    );
    await must(
      rest("DELETE", "invoice_workflow_transitions?invoice_id=in." + inList, null, { Prefer: "return=minimal" }),
      "delete oude workflow_transitions"
    );
  }
  await chunkInsert("invoice_billing_fields", bfRows);
  console.log("✓ invoice_billing_fields: " + bfRows.length);
  await chunkInsert("invoice_workflow_transitions", wfRows);
  console.log("✓ invoice_workflow_transitions: " + wfRows.length);

  // 3) controle: tellingen
  const cnt = async (t) => {
    const r = await must(
      rest("GET", t + "?select=id", null, { Prefer: "count=exact", Range: "0-0" }),
      "count " + t
    );
    return r.headers.get("content-range");
  };
  console.log("Supabase invoices content-range:", await cnt("invoices"));
  console.log("Supabase billing_fields content-range:", await cnt("invoice_billing_fields"));
  console.log("Supabase workflow content-range:", await cnt("invoice_workflow_transitions"));
  console.log("KLAAR ✓ — niet-destructief, `facturen` (disposition) onaangeroerd.");
}

main().catch((e) => {
  console.error("IMPORT FOUT:", e && e.message ? e.message : e);
  process.exit(1);
});
