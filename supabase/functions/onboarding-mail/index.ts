// Supabase Edge Function: onboarding-mail (G30)
// Mailt de teken-, upload- of inwerklink rechtstreeks naar de (nieuwe)
// medewerker vanuit de onboarding-flow in het dossier. Hergebruikt het
// SMTP-mechanisme + config van salarisexport-mail (saladmin_mail_config,
// DENY-ALL RLS; service_role leest hem hier — frontend ziet het wachtwoord
// nooit). dry_run=true valideert config + bouwt het bericht zonder versturen.
//
// Authz: verify_jwt=true (gateway) + her-check is_office_staff() op de caller.

// @ts-expect-error Deno-only remote import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-expect-error Deno-only remote import
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (req: Request) => Promise<Response> | Response): void };

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

type Kind = "upload" | "teken" | "inwerk";

const TEMPLATES: Record<Kind, { subject: string; intro: string; actie: string }> = {
  upload: {
    subject: "Documenten aanleveren voor je indiensttreding",
    intro: "Voor je indiensttreding bij {org} hebben we nog enkele documenten van je nodig (zoals je identiteitsbewijs, VOG en diploma's).",
    actie: "Upload je documenten via deze beveiligde link:",
  },
  teken: {
    subject: "Je contract staat klaar om te ondertekenen",
    intro: "Je contract bij {org} staat voor je klaar. Je kunt het online bekijken en digitaal ondertekenen.",
    actie: "Onderteken je contract via deze beveiligde link:",
  },
  inwerk: {
    subject: "Je inwerkprogramma staat klaar",
    intro: "Welkom bij {org}! Je inwerkprogramma staat voor je klaar: video's en documenten die je doorneemt en aftekent.",
    actie: "Start je inwerkprogramma via deze beveiligde link:",
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Caller-JWT + office-check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Niet geautoriseerd" }, 401);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "Niet geautoriseerd" }, 401);
  const { data: isOffice, error: offErr } = await userClient.rpc("is_office_staff");
  if (offErr) return json({ error: "Autorisatiecheck mislukt: " + offErr.message }, 500);
  if (!isOffice) return json({ error: "Geen toegang — alleen kantoor/HR mag onboarding-mails versturen." }, 403);

  // 2. Body
  let body: { kind?: string; medewerker_id?: string; link?: string; dry_run?: boolean } = {};
  try { body = await req.json(); } catch { return json({ error: "Ongeldige aanvraag" }, 400); }
  const kind = String(body.kind || "") as Kind;
  const medewerkerId = String(body.medewerker_id || "");
  const link = String(body.link || "");
  const dryRun = !!body.dry_run;
  if (!TEMPLATES[kind]) return json({ error: "Onbekend mailtype." }, 400);
  if (!medewerkerId) return json({ error: "Geen medewerker opgegeven." }, 400);
  // De link moet naar onze eigen app wijzen — geen open redirect/relay.
  if (!/^https:\/\/[a-z0-9-]+\.vercel\.app\//.test(link) && !/^https:\/\/(www\.)?futureflow[a-z0-9.-]*\//.test(link)) {
    return json({ error: "Ongeldige link." }, 400);
  }

  // 3. Medewerker-e-mail ophalen (service_role; RLS-onafhankelijk)
  const mwRes = await admin.from("medewerkers")
    .select("voornaam, achternaam, email, data").eq("id", medewerkerId).maybeSingle();
  if (mwRes.error || !mwRes.data) return json({ error: "Medewerker niet gevonden." }, 404);
  const mw = mwRes.data as { voornaam?: string; achternaam?: string; email?: string; data?: Record<string, unknown> };
  const mwEmail = String(mw.email || (mw.data && (mw.data.email as string)) || "").trim();
  if (!mwEmail || !/.+@.+\..+/.test(mwEmail)) {
    return json({ error: "Deze medewerker heeft nog geen geldig e-mailadres in het dossier." }, 400);
  }
  const mwNaam = [mw.voornaam, mw.achternaam].filter(Boolean).join(" ").trim() || "collega";

  // 4. SMTP-config (gedeeld met salarisexport-mail)
  const { data: cfg, error: cfgErr } = await admin
    .from("saladmin_mail_config").select("*").eq("id", 1).maybeSingle();
  if (cfgErr) return json({ error: "Config lezen mislukt: " + cfgErr.message }, 500);
  if (!cfg) return json({ error: "E-mailinstellingen ontbreken. Stel ze eerst in bij Salarisadministratie → E-mailinstellingen." }, 400);

  const fromEmail = String(cfg.afzender_email || cfg.smtp_user || "").trim();
  const fromName = String(cfg.afzender_naam || "Embrace the Future").trim();
  const tpl = TEMPLATES[kind];
  const subject = tpl.subject;
  const message =
    `Beste ${mwNaam},\n\n` +
    tpl.intro.split("{org}").join(fromName) + "\n\n" +
    tpl.actie + "\n" + link + "\n\n" +
    "Deze link is persoonlijk — deel hem niet met anderen.\n\n" +
    `Met vriendelijke groet,\n${fromName}`;

  const missing: string[] = [];
  if (!cfg.smtp_host) missing.push("SMTP-host");
  if (!cfg.smtp_user) missing.push("SMTP-gebruikersnaam");
  if (!cfg.smtp_pass) missing.push("SMTP-wachtwoord");
  if (!fromEmail) missing.push("afzender-e-mail");

  if (dryRun) {
    return json({
      ok: true, dry_run: true, zou_versturen_naar: mwEmail, onderwerp: subject,
      afzender: fromName + " <" + fromEmail + ">", bericht: message,
      ontbrekende_instellingen: missing,
    });
  }
  if (missing.length) {
    return json({ error: "E-mailinstellingen onvolledig: " + missing.join(", ") + " ontbreekt. Vul ze aan bij Salarisadministratie → E-mailinstellingen." }, 400);
  }

  const client = new SMTPClient({
    connection: {
      hostname: String(cfg.smtp_host),
      port: Number(cfg.smtp_port) || 587,
      tls: String(cfg.smtp_secure) === "ssl",
      auth: { username: String(cfg.smtp_user), password: String(cfg.smtp_pass) },
    },
  });

  async function writeAudit(status: string, extra: Record<string, unknown>) {
    try {
      await admin.from("audit_log").insert({
        resource: "Onboarding", resource_id: medewerkerId, actie: "OnboardingMailVerstuurd",
        gebruiker_id: user.id, gebruiker_label: user.email || user.id,
        details: JSON.stringify({ kind, ontvanger: mwEmail, ...extra }),
        status,
        ip: req.headers.get("x-forwarded-for") || "", user_agent: req.headers.get("user-agent") || "",
      });
    } catch (_e) { /* audit mag de hoofdactie nooit breken */ }
  }

  try {
    await client.send({ from: fromName + " <" + fromEmail + ">", to: mwEmail, subject, content: message });
    await client.close();
  } catch (err) {
    try { await client.close(); } catch (_e) { /* */ }
    const msg = (err as Error).message || String(err);
    await writeAudit("fout", { error: msg });
    return json({ error: "Versturen mislukt: " + msg }, 502);
  }

  await writeAudit("succes", {});
  return json({ ok: true, verstuurd_naar: mwEmail, onderwerp: subject });
});
