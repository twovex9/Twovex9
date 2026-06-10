// Supabase Edge Function: salarisexport-mail
// Verstuurt de salarisexport (Loket-XLSX, base64) als e-mailbijlage naar de
// salarisadministratie. PRIMAIR via Microsoft Graph (OAuth2 client-credentials —
// futureproof, geen basis-SMTP), met SMTP als fallback. Aangeroepen vanuit de
// salarisadministratie-pagina door office-staff (HR/Finance/Eigenaar).
//
// Authz: verify_jwt=true (gateway) + her-check is_office_staff() op de caller.
// Graph-secrets staan als EDGE-SECRETS (niet in de DB):
//   GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET / GRAPH_MAIL_FROM
// Niet-geheime instellingen (ontvanger/cc/onderwerp/bericht) blijven in
// public.saladmin_mail_config. SMTP-fallback gebruikt smtp_* uit die tabel.
// dry_run=true valideert de config + bouwt het bericht ZONDER te versturen.

// @ts-expect-error Deno-only remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error Deno-only remote import
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

declare const Deno: { env: { get(k: string): string | undefined } };

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

interface Body {
  xlsx_base64?: string;
  filename?: string;
  periode?: string;
  aantal?: number;
  dry_run?: boolean;
}

// ── Microsoft Graph helpers ────────────────────────────────────────────────
function graphConfig() {
  const tenant = Deno.env.get("GRAPH_TENANT_ID") || "";
  const clientId = Deno.env.get("GRAPH_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GRAPH_CLIENT_SECRET") || "";
  const from = Deno.env.get("GRAPH_MAIL_FROM") || "";
  return { tenant, clientId, clientSecret, from, complete: !!(tenant && clientId && clientSecret && from) };
}

async function graphToken(cfg: { tenant: string; clientId: string; clientSecret: string }): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(`https://login.microsoftonline.com/${cfg.tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("Graph-token mislukt: " + (j.error_description || j.error || r.status));
  return j.access_token as string;
}

async function graphSendMail(
  token: string,
  from: string,
  to: string,
  cc: string,
  subject: string,
  text: string,
  filename: string,
  xlsxBase64: string,
): Promise<void> {
  const toRecipients = to.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
  const ccRecipients = (cc || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean)
    .map((address) => ({ emailAddress: { address } }));
  const message: Record<string, unknown> = {
    subject,
    body: { contentType: "Text", content: text },
    toRecipients,
    attachments: [{
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: filename,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      contentBytes: xlsxBase64,
    }],
  };
  if (ccRecipients.length) message.ccRecipients = ccRecipients;

  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!(r.status === 202 || r.ok)) {
    let msg = String(r.status);
    try { const j = await r.json(); msg = j.error?.message || JSON.stringify(j); } catch { /* */ }
    throw new Error("Graph sendMail mislukt: " + msg);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Caller-JWT verifiëren
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Niet geautoriseerd" }, 401);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Niet geautoriseerd" }, 401);

  // 2. Office-staff check
  const { data: isOffice, error: offErr } = await userClient.rpc("is_office_staff");
  if (offErr) return json({ error: "Autorisatiecheck mislukt: " + offErr.message }, 500);
  if (!isOffice) return json({ error: "Geen toegang — alleen kantoor/HR mag de salarisexport versturen." }, 403);

  // 3. Body
  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { return json({ error: "Ongeldige aanvraag" }, 400); }
  const dryRun = !!body.dry_run;
  const periode = String(body.periode || "");
  const aantal = Number(body.aantal || 0);
  const filename = String(body.filename || ("Salarisexport_" + periode.replace(/\s+/g, "_") + ".xlsx"));

  // 4. Niet-geheime config lezen (service_role)
  const { data: cfg, error: cfgErr } = await admin
    .from("saladmin_mail_config").select("*").eq("id", 1).maybeSingle();
  if (cfgErr) return json({ error: "Config lezen mislukt: " + cfgErr.message }, 500);
  if (!cfg) return json({ error: "E-mailinstellingen ontbreken. Stel ze eerst in." }, 400);

  const ontvanger = String(cfg.ontvanger || "").trim();
  const graph = graphConfig();
  const useGraph = graph.complete;
  const fromEmail = useGraph ? graph.from : String(cfg.afzender_email || cfg.smtp_user || "").trim();
  const fromName = String(cfg.afzender_naam || "Embrace the Future").trim();

  const fill = (t: string) => String(t || "")
    .split("{periode}").join(periode)
    .split("{aantal}").join(String(aantal))
    .split("{afzender}").join(fromName);
  const subject = fill(cfg.onderwerp || "Salarisexport {periode}");
  const message = fill(cfg.bericht || "Bijgevoegd de salarisexport voor {periode}.");

  // Validatie — afhankelijk van transport
  const missing: string[] = [];
  if (!ontvanger) missing.push("ontvanger");
  if (useGraph) {
    if (!graph.from) missing.push("GRAPH_MAIL_FROM");
  } else {
    if (!cfg.smtp_host) missing.push("SMTP-host");
    if (!cfg.smtp_user) missing.push("SMTP-gebruikersnaam");
    if (!cfg.smtp_pass) missing.push("SMTP-wachtwoord");
    if (!fromEmail) missing.push("afzender-e-mail");
    // Als noch Graph-secrets noch SMTP volledig: meld de Graph-route als voorkeur.
    if (!graph.tenant && !graph.clientId && !graph.clientSecret && !cfg.smtp_host) {
      missing.push("Microsoft-Graph-secrets (GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET/MAIL_FROM) óf SMTP-instellingen");
    }
  }

  if (dryRun) {
    return json({
      ok: true, dry_run: true,
      transport: useGraph ? "microsoft-graph" : "smtp",
      zou_versturen_naar: ontvanger, cc: cfg.cc || "", onderwerp: subject,
      afzender: fromName + " <" + fromEmail + ">",
      bijlage: filename,
      bijlage_bytes: body.xlsx_base64 ? Math.round(body.xlsx_base64.length * 0.75) : 0,
      ontbrekende_instellingen: missing,
      graph_geconfigureerd: useGraph,
    });
  }

  if (missing.length) {
    return json({ error: "E-mailinstellingen onvolledig: " + missing.join(", ") + ". Vul deze aan." }, 400);
  }
  if (!body.xlsx_base64) return json({ error: "Geen exportbestand meegegeven." }, 400);

  async function writeAudit(status: string, extra: Record<string, unknown>) {
    try {
      await admin.from("audit_log").insert({
        resource: "Salarisadministratie", resource_id: "mail", actie: "SalarisexportVerstuurd",
        gebruiker_id: user.id, gebruiker_label: user.email || user.id,
        details: JSON.stringify({ periode, ontvanger, cc: cfg.cc || "", filename, aantal, transport: useGraph ? "graph" : "smtp", ...extra }),
        status,
        ip: req.headers.get("x-forwarded-for") || "", user_agent: req.headers.get("user-agent") || "",
      });
    } catch (_e) { /* audit mag nooit de hoofdactie breken */ }
  }

  // 5. Versturen — Graph (voorkeur) of SMTP-fallback
  try {
    if (useGraph) {
      const token = await graphToken(graph);
      await graphSendMail(token, graph.from, ontvanger, String(cfg.cc || ""), subject, message, filename, String(body.xlsx_base64));
    } else {
      const client = new SMTPClient({
        connection: {
          hostname: String(cfg.smtp_host),
          port: Number(cfg.smtp_port) || 587,
          tls: String(cfg.smtp_secure) === "ssl",
          auth: { username: String(cfg.smtp_user), password: String(cfg.smtp_pass) },
        },
      });
      try {
        await client.send({
          from: fromName + " <" + fromEmail + ">",
          to: ontvanger,
          cc: cfg.cc ? String(cfg.cc) : undefined,
          subject,
          content: message,
          attachments: [{
            filename, encoding: "base64", content: String(body.xlsx_base64),
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }],
        });
      } finally { try { await client.close(); } catch (_e) { /* */ } }
    }
  } catch (err) {
    const msg = (err as Error).message || String(err);
    await writeAudit("fout", { error: msg });
    return json({ error: "Versturen mislukt: " + msg }, 502);
  }

  await writeAudit("succes", {});
  return json({ ok: true, transport: useGraph ? "microsoft-graph" : "smtp", verstuurd_naar: ontvanger, cc: cfg.cc || "", onderwerp: subject, bijlage: filename });
});
