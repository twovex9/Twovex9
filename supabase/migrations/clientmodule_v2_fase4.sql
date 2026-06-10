-- ============================================================
-- Cliëntmodule 2.0 — FASE 4: automatische bewaking
--   1. client_dossier_issues + check-engine (§12, 7 checks)
--   2. evaluatiebewaking (§13) — log-tabel + cron-RPC
--   3. beschikking_verloop_herinneringen uitbreiden:
--        GW-lookup ook via client_medewerkers (rol=gedragswetenschapper)
--   4. Cron-jobs (dagelijks)
-- Idempotent. Uitvoeren: node scripts/db-exec.mjs --file supabase/migrations/clientmodule_v2_fase4.sql
-- ============================================================

-- ---------- 1. client_dossier_issues ----------
create table if not exists public.client_dossier_issues (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clienten(id) on delete cascade,
  issue_type text not null,
  ernst text not null default 'oranje',
  tekst text not null,
  gedetecteerd_op timestamptz not null default now(),
  opgelost_op timestamptz,
  unique (client_id, issue_type)
);
alter table public.client_dossier_issues drop constraint if exists client_dossier_issues_ernst_check;
alter table public.client_dossier_issues add constraint client_dossier_issues_ernst_check
  check (ernst in ('rood','oranje','info'));
alter table public.client_dossier_issues drop constraint if exists client_dossier_issues_type_check;
alter table public.client_dossier_issues add constraint client_dossier_issues_type_check
  check (issue_type in (
    'beschikking_ontbreekt','beschikking_verlopen',
    'zorgplan_ontbreekt','zorgplan_evaluatie_verlopen',
    'evaluatie_te_laat',
    'handtekening_ontbreekt',
    'signaleringsplan_ontbreekt',
    'verplichte_documenten_ontbreken'
  ));
create index if not exists client_dossier_issues_client_idx on public.client_dossier_issues (client_id);
create index if not exists client_dossier_issues_open_idx on public.client_dossier_issues (opgelost_op) where opgelost_op is null;

alter table public.client_dossier_issues enable row level security;
drop policy if exists "bureau_lockout" on public.client_dossier_issues;
create policy "bureau_lockout" on public.client_dossier_issues
  as restrictive for all to authenticated
  using ((select not public.is_bureau_only_user()))
  with check ((select not public.is_bureau_only_user()));
drop policy if exists "dossier_issues select zorg-toegang" on public.client_dossier_issues;
create policy "dossier_issues select zorg-toegang" on public.client_dossier_issues
  for select to authenticated using (public.client_zorg_toegang(client_id));

-- ---------- evaluatie_log ----------
create table if not exists public.client_evaluatie_log (
  id uuid primary key default gen_random_uuid(),
  zorgplan_id uuid not null references public.zorgplannen(id) on delete cascade,
  user_id uuid not null,
  milestone int not null,
  notification_id uuid,
  aanmaakdatum timestamptz not null default now(),
  unique (zorgplan_id, user_id, milestone)
);
alter table public.client_evaluatie_log enable row level security;
drop policy if exists "evaluatie_log office read" on public.client_evaluatie_log;
create policy "evaluatie_log office read" on public.client_evaluatie_log
  for select to authenticated using (public.is_office_clientviewer() or public.is_admin(auth.uid()));

-- ---------- 2. client_dossier_controle() — 7 checks ----------
create or replace function public.client_dossier_controle(p_dry_run boolean default false)
returns table(processed int, nieuwe_issues int, opgeloste_issues int)
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_processed int := 0; v_nieuw int := 0; v_opgelost int := 0;
  cl record;
  besch_eind date; besch_dagen int;
  zp record;
  signpl_actief boolean;
  intake_id uuid; intake_status text;
  v_huidige text[]; v_target text[]; v_type text; v_ernst text; v_tekst text;
begin
  for cl in
    select id, voornaam, achternaam, reis_status
    from public.clienten
    where coalesce(reis_status,'') in ('actief','tijdelijk_gepauzeerd')
      and coalesce(archived, false) = false
  loop
    v_processed := v_processed + 1;
    v_target := '{}'::text[];

    -- 1. Beschikking ontbreekt / verlopen
    select b.eind_iso, (b.eind_iso - v_today)
      into besch_eind, besch_dagen
      from public.beschikkingen b
     where (b.client_id = cl.id or b.client_id = (select c2.data->>'bs2_id' from public.clienten c2 where c2.id = cl.id))
       and not coalesce(b.gearchiveerd, false) and b.eind_iso is not null
     order by b.eind_iso desc limit 1;
    if besch_eind is null then
      v_target := array_append(v_target, 'beschikking_ontbreekt|rood|Geen beschikking gevonden voor deze cliënt');
    elsif besch_eind < v_today then
      v_target := array_append(v_target, 'beschikking_verlopen|rood|Beschikking is verlopen op ' || to_char(besch_eind, 'DD-MM-YYYY'));
    end if;

    -- 2. Zorgplan ontbreekt / evaluatie verlopen
    select * into zp from public.zorgplannen
     where client_id = cl.id and status = 'actief' and not archived
     order by actief_sinds desc nulls last limit 1;
    if zp.id is null then
      v_target := array_append(v_target, 'zorgplan_ontbreekt|rood|Geen actief zorgplan');
    elsif zp.evaluatiemoment is not null and zp.evaluatiemoment < v_today then
      v_target := array_append(v_target, 'zorgplan_evaluatie_verlopen|rood|Evaluatiemoment verstreken op ' || to_char(zp.evaluatiemoment, 'DD-MM-YYYY'));
    end if;

    -- 3. Signaleringsplan ontbreekt
    signpl_actief := exists (select 1 from public.signaleringsplannen
                              where client_id = cl.id and status = 'actief' and not archived);
    if not signpl_actief then
      v_target := array_append(v_target, 'signaleringsplan_ontbreekt|oranje|Geen actief signaleringsplan');
    end if;

    -- 4. Handtekeningen ontbreken (intake-verklaringen: privacy + toestemming + huisregels)
    if not exists (
      select 1 from public.client_ondertekeningen
       where client_id = cl.id and status = 'ondertekend'
         and verklaring_type in ('privacy','toestemming','huisregels')
    ) then
      v_target := array_append(v_target, 'handtekening_ontbreekt|rood|Verplichte verklaringen (privacy/toestemming/huisregels) niet (volledig) ondertekend');
    end if;

    -- 5. Verplichte documenten ontbreken (identiteitsbewijs in client_documents.type)
    if not exists (
      select 1 from public.client_documents
       where client_id = cl.id and not coalesce(archived, false)
         and lower(coalesce(type,'')) in ('identiteit','identiteitsbewijs','id','legitimatie','identiteitsbewijs (kopie)')
    ) then
      v_target := array_append(v_target, 'verplichte_documenten_ontbreken|oranje|Identiteitsbewijs ontbreekt in dossier-documenten');
    end if;

    -- 6/7. Worden via 2 (zorgplan_evaluatie_verlopen) en 1 (beschikking-paden) afgedekt;
    --      'evaluatie_te_laat' reserveren voor toekomstige aparte evaluaties.

    -- Upsert: vergelijk huidige open issues met nieuwe set
    select coalesce(array_agg(issue_type), '{}'::text[])
      into v_huidige
      from public.client_dossier_issues
     where client_id = cl.id and opgelost_op is null;

    -- Sluit issues die niet meer voorkomen
    if not p_dry_run then
      update public.client_dossier_issues
         set opgelost_op = now()
       where client_id = cl.id and opgelost_op is null
         and issue_type <> all (
           array(select split_part(t, '|', 1) from unnest(v_target) as t)
         );
      get diagnostics v_opgelost = row_count;
    end if;

    -- Voeg nieuwe issues toe / refresh tekst
    if array_length(v_target, 1) is not null then
      foreach v_type in array v_target loop
        declare
          parts text[] := string_to_array(v_type, '|');
          itype text := parts[1]; ier text := parts[2]; itekst text := parts[3];
        begin
          if not p_dry_run then
            insert into public.client_dossier_issues (client_id, issue_type, ernst, tekst)
            values (cl.id, itype, ier, itekst)
            on conflict (client_id, issue_type) do update
              set ernst = excluded.ernst,
                  tekst = excluded.tekst,
                  opgelost_op = null,
                  gedetecteerd_op = case when client_dossier_issues.opgelost_op is null
                                         then client_dossier_issues.gedetecteerd_op
                                         else now() end;
            v_nieuw := v_nieuw + 1;
          end if;
        end;
      end loop;
    end if;
  end loop;
  return query select v_processed, v_nieuw, v_opgelost;
end; $$;
revoke all on function public.client_dossier_controle(boolean) from public, anon, authenticated;

-- Notificeer alle nieuwe rode issues naar GW (via client_medewerkers) +
-- gekoppelde zorgcoördinator + directeur. Dedup via notifications-type+entity.
create or replace function public.client_dossier_issues_notificeer()
returns int
language plpgsql security definer
set search_path to 'public'
as $$
declare v_notif int := 0; v_issue record; v_user record; v_titel text; v_body text; v_klant text;
begin
  for v_issue in
    select i.id, i.client_id, i.issue_type, i.ernst, i.tekst,
           btrim(coalesce(c.voornaam,'') || ' ' || coalesce(c.achternaam,'')) as client_naam
      from public.client_dossier_issues i
      join public.clienten c on c.id = i.client_id
     where i.opgelost_op is null
       and i.gedetecteerd_op > now() - interval '25 hours'
  loop
    v_titel := 'Dossier ' || v_issue.client_naam || ': ' || v_issue.tekst;
    v_body  := v_issue.tekst || ' (ernst: ' || v_issue.ernst || ').';
    for v_user in
      select distinct p.id as user_id
        from public.profiles p
       where coalesce(p.archived, false) = false and p.email is not null
         and (
           -- directeur / teamleider
           exists (
             select 1 from public.bs2_role_users u
             join public.bs2_roles ro on ro.id = u.role_id
             where ro.slug in ('directeur','teamleider')
               and lower(u.user_email) = lower(p.email)
           )
           -- gekoppelde medewerker rol gedragswetenschapper / zorgcoordinator
           or exists (
             select 1 from public.client_medewerkers cm
             where cm.client_id = v_issue.client_id
               and cm.medewerker_id = p.medewerker_id
               and cm.rol in ('gedragswetenschapper','zorgcoordinator')
           )
           -- legacy GW via clienten.data
           or lower(p.email) = lower(nullif(btrim((select c2.data->>'gedragswetenschapper_email' from public.clienten c2 where c2.id = v_issue.client_id)), ''))
         )
    loop
      if not exists (
        select 1 from public.notifications n
         where n.user_id = v_user.user_id
           and n.type = 'client_dossier_issue'
           and n.related_entity_type = 'client_dossier_issue'
           and n.related_entity_id = v_issue.id::text
      ) then
        insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
        values (v_user.user_id, 'client_dossier_issue', v_titel, v_body, 'client_dossier_issue', v_issue.id::text);
        v_notif := v_notif + 1;
      end if;
    end loop;
  end loop;
  return v_notif;
end; $$;
revoke all on function public.client_dossier_issues_notificeer() from public, anon, authenticated;

-- ---------- 3. evaluatiebewaking 30/14/0 dagen ----------
create or replace function public.zorgplan_evaluatie_herinneringen(p_dry_run boolean default false)
returns table(processed int, inserted int, skipped int)
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_milestones int[] := array[30,14,0];
  v_processed int := 0; v_inserted int := 0; v_skipped int := 0;
  v_m int; r record; rec record;
  v_titel text; v_body text; v_notif_id uuid; v_dagen int;
begin
  for r in
    select z.id as zp_id, z.client_id, z.titel, z.evaluatiemoment,
           (z.evaluatiemoment - v_today) as dagen,
           btrim(coalesce(c.voornaam,'') || ' ' || coalesce(c.achternaam,'')) as client_naam
      from public.zorgplannen z
      join public.clienten c on c.id = z.client_id
     where z.status = 'actief' and not z.archived
       and z.evaluatiemoment is not null
       and (z.evaluatiemoment - v_today) between 0 and 30
  loop
    v_dagen := r.dagen;
    select min(m) into v_m from unnest(v_milestones) as m where m >= v_dagen;
    if v_m is null then v_m := 0; end if;
    v_processed := v_processed + 1;

    v_titel := 'Zorgplan-evaluatie ' || case when v_dagen <= 0 then 'vandaag'
      when v_dagen = 1 then 'morgen' else 'over ' || v_dagen || ' dagen' end || ': ' || r.client_naam;
    v_body := 'Het zorgplan "' || r.titel || '" van ' || r.client_naam ||
              ' moet geëvalueerd worden op ' || to_char(r.evaluatiemoment, 'DD-MM-YYYY') || '.';

    for rec in
      select distinct p.id as user_id
        from public.profiles p
       where coalesce(p.archived, false) = false and p.email is not null
         and (
           exists (
             select 1 from public.bs2_role_users u
             join public.bs2_roles ro on ro.id = u.role_id
             where ro.slug in ('teamleider','gedragswetenschapper')
               and lower(u.user_email) = lower(p.email)
           )
           or exists (
             select 1 from public.client_medewerkers cm
             where cm.client_id = r.client_id and cm.medewerker_id = p.medewerker_id
               and cm.rol in ('gedragswetenschapper','zorgcoordinator')
           )
         )
    loop
      if exists (
        select 1 from public.client_evaluatie_log l
         where l.zorgplan_id = r.zp_id and l.user_id = rec.user_id and l.milestone = v_m
      ) then
        v_skipped := v_skipped + 1; continue;
      end if;
      if not p_dry_run then
        insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
        values (rec.user_id, 'zorgplan_evaluatie_herinnering', v_titel, v_body, 'zorgplan', r.zp_id::text)
        returning id into v_notif_id;
        insert into public.client_evaluatie_log (zorgplan_id, user_id, milestone, notification_id)
        values (r.zp_id, rec.user_id, v_m, v_notif_id);
      end if;
      v_inserted := v_inserted + 1;
    end loop;
  end loop;
  return query select v_processed, v_inserted, v_skipped;
end; $$;
revoke all on function public.zorgplan_evaluatie_herinneringen(boolean) from public, anon, authenticated;

-- ---------- 4. beschikking_verloop_herinneringen uitbreiden: GW via client_medewerkers ----------
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='beschikking_verloop_herinneringen';
  if v_def is not null and v_def not like '%client_medewerkers%' then
    -- Voeg gekoppelde GW-/zorgcoörd-medewerkers toe als ontvanger.
    execute replace(v_def,
      'or (r.gw_email is not null and lower(p.email) = r.gw_email)',
      'or (r.gw_email is not null and lower(p.email) = r.gw_email)
          or exists (
            select 1 from public.client_medewerkers cm
            join public.clienten c2 on c2.id = cm.client_id
            where (c2.data->>''bs2_id'' = r.besch_id or c2.id = r.besch_id) is null
              and cm.medewerker_id = p.medewerker_id
              and cm.rol in (''gedragswetenschapper'',''zorgcoordinator'')
              and (c2.id = (select client_id from public.beschikkingen where id::text = r.besch_id)
                   or c2.data->>''bs2_id'' = (select client_id from public.beschikkingen where id::text = r.besch_id))
          )');
  end if;
end $$;

-- ---------- Eenvoudige lees-RPC voor dossier-issues (UI-kaart) ----------
create or replace function public.client_dossier_issues_voor_client(p_client_id text)
returns table(id uuid, issue_type text, ernst text, tekst text, gedetecteerd_op timestamptz)
language sql stable security definer
set search_path to 'public'
as $$
  select id, issue_type, ernst, tekst, gedetecteerd_op
    from public.client_dossier_issues
   where client_id = p_client_id and opgelost_op is null
     and public.client_zorg_toegang(p_client_id)
   order by case ernst when 'rood' then 0 when 'oranje' then 1 else 2 end, gedetecteerd_op;
$$;
revoke all on function public.client_dossier_issues_voor_client(text) from public, anon;
grant execute on function public.client_dossier_issues_voor_client(text) to authenticated;

-- ---------- Cron-jobs ----------
do $$
begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    -- Dagelijkse dossiercontrole 06:00 + notificaties direct erna 06:05
    perform cron.unschedule(jobid) from cron.job where jobname = 'client-dossier-controle-dagelijks';
    perform cron.schedule('client-dossier-controle-dagelijks', '0 6 * * *',
      $sql$ select public.client_dossier_controle(false); select public.client_dossier_issues_notificeer(); $sql$);
    perform cron.unschedule(jobid) from cron.job where jobname = 'zorgplan-evaluatie-herinnering-dagelijks';
    perform cron.schedule('zorgplan-evaluatie-herinnering-dagelijks', '0 7 * * *',
      $sql$ select public.zorgplan_evaluatie_herinneringen(false); $sql$);
  end if;
end $$;
