// Supabase Edge Function: salarisexport-mail
// Verstuurt de salarisexport (Loket-XLSX, base64) als e-mailbijlage naar de
// salarisadministratie via SMTP (Office 365 / eigen mailserver). Aangeroepen
// vanuit de salarisadministratie-pagina door office-staff (HR/Finance/Eigenaar).
//
// Authz: verify_jwt=true (gateway) + her-check is_office_staff() op de caller.
// Config (incl. SMTP-wachtwoord) staat in public.saladmin_mail_config (DENY-ALL
// RLS) en wordt hier via service_role gelezen — de frontend kan het wachtwoord
// niet lezen. dry_run=true valideert de config en bouwt het bericht ZONDER
// daadwerkelijk te versturen (zodat de hele flow testbaar is zonder echte mail).

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

  // 2. Office-staff check (HR/Finance/Eigenaar/Directeur/… — niet werkvloer)
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

  // 4. Config lezen (service_role — RLS-bypass)
  const { data: cfg, error: cfgErr } = await admin
    .from("saladmin_mail_config").select("*").eq("id", 1).maybeSingle();
  if (cfgErr) return json({ error: "Config lezen mislukt: " + cfgErr.message }, 500);
  if (!cfg) return json({ error: "E-mailinstellingen ontbreken. Stel ze eerst in." }, 400);

  const ontvanger = String(cfg.ontvanger || "").trim();
  const fromEmail = String(cfg.afzender_email || cfg.smtp_user || "").trim();
  const fromName = String(cfg.afzender_naam || "Embrace the Future").trim();

  // Template-vervanging
  const fill = (t: string) => String(t || "")
    .split("{periode}").join(periode)
    .split("{aantal}").join(String(aantal))
    .split("{afzender}").join(fromName);
  const subject = fill(cfg.onderwerp || "Salarisexport {periode}");
  const message = fill(cfg.bericht || "Bijgevoegd de salarisexport voor {periode}.");

  // Validatie van vereiste instellingen
  const missing: string[] = [];
  if (!ontvanger) missing.push("ontvanger");
  if (!cfg.smtp_host) missing.push("SMTP-host");
  if (!cfg.smtp_user) missing.push("SMTP-gebruikersnaam");
  if (!cfg.smtp_pass) missing.push("SMTP-wachtwoord");
  if (!fromEmail) missing.push("afzender-e-mail");

  if (dryRun) {
    return json({
      ok: true, dry_run: true,
      zou_versturen_naar: ontvanger, cc: cfg.cc || "", onderwerp: subject,
      afzender: fromName + " <" + fromEmail + ">",
      bijlage: filename,
      bijlage_bytes: body.xlsx_base64 ? Math.round(body.xlsx_base64.length * 0.75) : 0,
      ontbrekende_instellingen: missing,
      smtp: {
        host: cfg.smtp_host, port: cfg.smtp_port, secure: cfg.smtp_secure,
        gebruiker_ingesteld: !!cfg.smtp_user, wachtwoord_ingesteld: !!cfg.smtp_pass,
      },
    });
  }

  if (missing.length) {
    return json({ error: "E-mailinstellingen onvolledig: " + missing.join(", ") + " ontbreekt. Open ‘E-mailinstellingen’ en vul deze aan." }, 400);
  }
  if (!body.xlsx_base64) return json({ error: "Geen exportbestand meegegeven." }, 400);

  // 5. Versturen via SMTP (Office 365: STARTTLS op 587, of impliciete TLS op 465)
  const client = new SMTPClient({
    connection: {
      hostname: String(cfg.smtp_host),
      port: Number(cfg.smtp_port) || 587,
      tls: String(cfg.smtp_secure) === "ssl", // ssl=465 (impliciete TLS); starttls=587 (upgrade)
      auth: { username: String(cfg.smtp_user), password: String(cfg.smtp_pass) },
    },
  });

  async function writeAudit(status: string, extra: Record<string, unknown>) {
    try {
      await admin.from("audit_log").insert({
        resource: "Salarisadministratie", resource_id: "mail", actie: "SalarisexportVerstuurd",
        gebruiker_id: user.id, gebruiker_label: user.email || user.id,
        details: JSON.stringify({ periode, ontvanger, cc: cfg.cc || "", filename, aantal, ...extra }),
        status,
        ip: req.headers.get("x-forwarded-for") || "", user_agent: req.headers.get("user-agent") || "",
      });
    } catch (_e) { /* audit mag nooit de hoofdactie breken */ }
  }

  try {
    await client.send({
      from: fromName + " <" + fromEmail + ">",
      to: ontvanger,
      cc: cfg.cc ? String(cfg.cc) : undefined,
      subject,
      content: message,
      attachments: [{
        filename,
        encoding: "base64",
        content: String(body.xlsx_base64),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }],
    });
    await client.close();
  } catch (err) {
    try { await client.close(); } catch (_e) { /* */ }
    const msg = (err as Error).message || String(err);
    await writeAudit("fout", { error: msg });
    return json({ error: "Versturen mislukt: " + msg }, 502);
  }

  await writeAudit("succes", {});
  return json({ ok: true, verstuurd_naar: ontvanger, cc: cfg.cc || "", onderwerp: subject, bijlage: filename });
});
