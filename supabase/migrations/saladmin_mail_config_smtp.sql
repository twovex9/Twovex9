-- Salarisexport e-mailconfiguratie (SMTP + ontvanger + templates).
-- Bevat het SMTP-wachtwoord → DENY-ALL RLS: bewust GEEN policies, zodat
-- anon/authenticated de tabel niet kunnen lezen of schrijven. Alleen de
-- service_role (edge function salarisexport-mail, RLS-bypass) leest direct.
-- De frontend leest/schrijft uitsluitend via de SECURITY DEFINER RPC's
-- hieronder (office-staff only); die geven het wachtwoord NOOIT terug.
create table if not exists public.saladmin_mail_config (
  id smallint primary key default 1,
  ontvanger text not null default '',
  cc text not null default '',
  onderwerp text not null default 'Salarisexport {periode} — Embrace the Future',
  bericht text not null default E'Beste,\n\nBijgevoegd vinden jullie de salarisexport voor {periode} ({aantal} medewerkers).\n\nMet vriendelijke groet,\n{afzender}',
  afzender_naam text not null default 'Embrace the Future',
  afzender_email text not null default '',
  smtp_host text not null default 'smtp.office365.com',
  smtp_port integer not null default 587,
  smtp_secure text not null default 'starttls',   -- 'starttls' (587) | 'ssl' (465)
  smtp_user text not null default '',
  smtp_pass text not null default '',
  laatst_gewijzigd timestamptz not null default now(),
  gewijzigd_door text not null default '',
  constraint saladmin_mail_config_singleton check (id = 1)
);

alter table public.saladmin_mail_config enable row level security;
-- (bewust geen policies → deny-all voor anon/authenticated)

-- Eén configrij klaarzetten + standaard-ontvanger.
insert into public.saladmin_mail_config (id, ontvanger)
values (1, 'rassoud@dehoogewaerder.nl')
on conflict (id) do nothing;

-- READ: geeft de config terug ZONDER wachtwoord (alleen een vlag of het is
-- ingesteld). Alleen office-staff.
create or replace function public.saladmin_mail_config_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r public.saladmin_mail_config;
begin
  if not public.is_office_staff() then
    raise exception 'Geen toegang tot salarisadministratie-instellingen';
  end if;
  select * into r from public.saladmin_mail_config where id = 1;
  if not found then
    return jsonb_build_object('bestaat', false);
  end if;
  return jsonb_build_object(
    'bestaat', true,
    'ontvanger', r.ontvanger,
    'cc', r.cc,
    'onderwerp', r.onderwerp,
    'bericht', r.bericht,
    'afzender_naam', r.afzender_naam,
    'afzender_email', r.afzender_email,
    'smtp_host', r.smtp_host,
    'smtp_port', r.smtp_port,
    'smtp_secure', r.smtp_secure,
    'smtp_user', r.smtp_user,
    'wachtwoord_ingesteld', (coalesce(r.smtp_pass, '') <> ''),
    'laatst_gewijzigd', r.laatst_gewijzigd,
    'gewijzigd_door', r.gewijzigd_door
  );
end;
$$;

-- WRITE: upsert config. Het wachtwoord wordt ALLEEN overschreven als een
-- niet-lege p_smtp_pass wordt meegegeven (anders blijft het bestaande staan).
-- Office-staff.
create or replace function public.saladmin_mail_config_zet(
  p_ontvanger text,
  p_cc text,
  p_onderwerp text,
  p_bericht text,
  p_afzender_naam text,
  p_afzender_email text,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_secure text,
  p_smtp_user text,
  p_smtp_pass text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare actor text;
begin
  if not public.is_office_staff() then
    raise exception 'Geen toegang tot salarisadministratie-instellingen';
  end if;
  select coalesce(
    (select nullif(trim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')), '')
       from public.profiles where id = auth.uid()),
    auth.uid()::text
  ) into actor;
  insert into public.saladmin_mail_config (id) values (1) on conflict (id) do nothing;
  update public.saladmin_mail_config set
    ontvanger      = coalesce(p_ontvanger, ontvanger),
    cc             = coalesce(p_cc, cc),
    onderwerp      = coalesce(p_onderwerp, onderwerp),
    bericht        = coalesce(p_bericht, bericht),
    afzender_naam  = coalesce(p_afzender_naam, afzender_naam),
    afzender_email = coalesce(p_afzender_email, afzender_email),
    smtp_host      = coalesce(p_smtp_host, smtp_host),
    smtp_port      = coalesce(p_smtp_port, smtp_port),
    smtp_secure    = coalesce(p_smtp_secure, smtp_secure),
    smtp_user      = coalesce(p_smtp_user, smtp_user),
    smtp_pass      = case when coalesce(p_smtp_pass, '') <> '' then p_smtp_pass else smtp_pass end,
    laatst_gewijzigd = now(),
    gewijzigd_door = actor
  where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.saladmin_mail_config_get() to authenticated;
grant execute on function public.saladmin_mail_config_zet(text,text,text,text,text,text,text,integer,text,text,text) to authenticated;
