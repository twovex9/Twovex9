-- =====================================================================
-- incident_analyse_module.sql — Incidentanalyse, risico & kwaliteit (ETF)
-- ---------------------------------------------------------------------
-- Analytische laag bovenop de bestaande incidenten / klachten /
-- verbeteringsmaatregelen-tabellen. Het systeem registreert niet alleen,
-- maar signaleert patronen, trends en risico's vóór escalatie. Voegt toe:
--
--   1. incident_ernst_config — beheerbare ernst-weging (1-4) + tags
--      (agressie / weglopen / veiligheid / politie / zelfbeschadiging /
--      middelen) per incidentcategorie. Seeded met de echte ETF-categorieën;
--      onbekende categorieën vallen terug op een regex-heuristiek.
--   2. incident_verrijkt — view die incidenten verrijkt met de effectieve
--      locatie (via cliënt als incident.locatie_id leeg is), cliënt-/melder-/
--      gedragswetenschappernaam en de ernst + tags uit de config.
--   3. incident_advies_beslissingen — decisions-only tabel (open/opgepakt/
--      afgewezen) gekeyd op een deterministische `sleutel` (zelfde patroon
--      als workforce_aanbeveling_beslissingen). De signalen/adviezen zelf
--      worden live berekend; enkel de menselijke beslissing persisteert.
--   4. incident_analyse_context() — rol-context (niveau / kan_zien /
--      is_directie / is_eigenaar / naam) op basis van _taken_kijk_niveau.
--   5. AI-engine (deterministische heuristiek, GEEN LLM):
--        - incident_signalen()       herhalingsdetectie + adviezen
--        - incident_risicoscores()   dynamische score + groen/oranje/rood
--        - incident_top()            Top 10 risicocliënten/locaties/trends
--        - incident_dimensie()       analyse per dimensie + vorige periode
--        - incident_positieve_kpis() kwaliteitsdashboard (positieve KPI's)
--        - incident_directie_kpis()  managementinformatie
--        - incident_eigenaar_kpis()  strategisch (kwartaal/jaar-op-jaar)
--        - incident_maatregel_effect() effectmeting verbetermaatregelen
--        - incident_advies_beslis()  beslissing opslaan + notificatie directie
--
-- "AI" = deterministische regel-/heuristiek-engine, consistent met de
-- workforce- en planning-modules. Het systeem signaleert UITSLUITEND
-- patronen; menselijke beoordeling blijft altijd noodzakelijk (geen
-- automatische conclusies, met name bij medewerker-analyses). Volledig
-- idempotent. Read-RPC's gegate op niveau <= 3, directie-acties <= 1.
-- RLS authenticated-only.
--
-- Uitvoeren op productie (ukjflilnhigozfoxowmj):
--   node scripts/db-exec.mjs --file supabase/migrations/incident_analyse_module.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ernst-weging + tags per incidentcategorie (beheerbaar door Beleid).
-- ---------------------------------------------------------------------
create table if not exists public.incident_ernst_config (
  categorie            text primary key,
  ernst                int  not null default 2,   -- 1 (licht) .. 4 (zeer ernstig)
  is_agressie          boolean not null default false,
  is_weglopen          boolean not null default false,
  is_veiligheid        boolean not null default false,
  is_politie           boolean not null default false,
  is_zelfbeschadiging  boolean not null default false,
  is_middelen          boolean not null default false,
  laatst_gewijzigd     timestamptz not null default now()
);
alter table public.incident_ernst_config enable row level security;
drop policy if exists "auth kan incident_ernst_config lezen" on public.incident_ernst_config;
create policy "auth kan incident_ernst_config lezen"
  on public.incident_ernst_config for select to authenticated using (true);
drop policy if exists "auth kan incident_ernst_config toevoegen" on public.incident_ernst_config;
create policy "auth kan incident_ernst_config toevoegen"
  on public.incident_ernst_config for insert to authenticated with check (true);
drop policy if exists "auth kan incident_ernst_config bewerken" on public.incident_ernst_config;
create policy "auth kan incident_ernst_config bewerken"
  on public.incident_ernst_config for update to authenticated using (true) with check (true);

-- Seed met de echte ETF-categorieën (idempotent — overschrijft niet als al aanwezig).
insert into public.incident_ernst_config
  (categorie, ernst, is_agressie, is_weglopen, is_veiligheid, is_politie, is_zelfbeschadiging, is_middelen) values
  ('Fysieke Agressie',               4, true,  false, true,  false, false, false),
  ('Verbale Agressie',               2, true,  false, true,  false, false, false),
  ('Delinquent Gedrag',              3, false, false, true,  true,  false, false),
  ('Vermist',                        3, false, true,  true,  false, false, false),
  ('Middelenbezit',                  2, false, false, true,  false, false, true),
  ('Suïcidepoging',                  4, false, false, true,  false, true,  false),
  ('Suïcidale Uitingen',             3, false, false, true,  false, true,  false),
  ('SGOG',                           4, false, false, true,  true,  false, false),
  ('Medicatie',                      2, false, false, false, false, false, true),
  ('Automutilatie',                  3, false, false, true,  false, true,  false),
  ('Datalek',                        2, false, false, false, false, false, false),
  ('Vrijheidsbeperkende Maatregelen',3, false, false, true,  false, false, false),
  ('Letsel',                         3, false, false, true,  false, false, false)
on conflict (categorie) do nothing;

-- ---------------------------------------------------------------------
-- 2. Verrijkte incident-view. Effectieve locatie = incident.locatie_id
--    (indien gezet) anders de cliënt-locatie. Ernst & tags uit de config
--    met een regex-fallback voor categorieën die nog niet geconfigureerd zijn.
-- ---------------------------------------------------------------------
create or replace view public.incident_verrijkt as
select
  i.id,
  i.client_id,
  i.categorie,
  i.status,
  i.melder_id,
  i.beoordelaar_id,
  i.incident_datum,
  i.tijdstip_van_dag,
  i.actor_type,
  i.aanmaakdatum,
  i.laatst_gewijzigd,
  coalesce(nullif(trim(l.naam), ''), nullif(trim(c.locatie), ''), 'Onbekend') as locatie_naam,
  nullif(trim(coalesce(c.voornaam, '') || ' ' || coalesce(c.achternaam, '')), '') as client_naam,
  nullif(trim(c.data->>'gedragswetenschapper_naam'), '') as gw_naam,
  nullif(trim(coalesce(m.voornaam, '') || ' ' || coalesce(m.achternaam, '')), '') as melder_naam,
  e.ernst,
  e.is_agressie,
  e.is_weglopen,
  e.is_veiligheid,
  e.is_politie,
  e.is_zelfbeschadiging,
  e.is_middelen,
  -- NL-label voor het dienst-tijdstip (genormaliseerd; data bevat EN-codes).
  case lower(coalesce(i.tijdstip_van_dag, ''))
    when 'morning'        then 'Ochtend'
    when 'vroege_ochtend' then 'Ochtend'
    when 'ochtend'        then 'Ochtend'
    when 'midday'         then 'Middag'
    when 'middag'         then 'Middag'
    when 'afternoon'      then 'Namiddag'
    when 'late_middag'    then 'Namiddag'
    when 'evening'        then 'Avond'
    when 'avond'          then 'Avond'
    when 'night'          then 'Nacht'
    when 'nacht'          then 'Nacht'
    else 'Onbekend'
  end as tijdstip_label
from public.incidenten i
left join public.clienten   c on c.id = i.client_id
left join public.locaties   l on l.id = i.locatie_id
left join public.medewerkers m on m.id = i.melder_id
left join lateral (
  select
    coalesce(cfg.ernst, case
      when i.categorie ~* 'suïcide|suicide|sgog|seksueel|letsel'        then 4
      when i.categorie ~* 'agress|delinq|vermis|weglop|vrijheidsbep|automutil|geweld' then 3
      else 2 end) as ernst,
    coalesce(cfg.is_agressie,         i.categorie ~* 'agress|geweld')                              as is_agressie,
    coalesce(cfg.is_weglopen,         i.categorie ~* 'vermis|weglop|onttrekk')                     as is_weglopen,
    coalesce(cfg.is_veiligheid,       i.categorie ~* 'agress|geweld|vermis|suïcide|suicide|letsel|sgog|seksueel|delinq|vrijheidsbep') as is_veiligheid,
    coalesce(cfg.is_politie,          i.categorie ~* 'delinq|politie|aangifte')                    as is_politie,
    coalesce(cfg.is_zelfbeschadiging, i.categorie ~* 'automutil|suïcide|suicide|zelfbesch')        as is_zelfbeschadiging,
    coalesce(cfg.is_middelen,         i.categorie ~* 'middel|medicatie|drugs|alcohol')             as is_middelen
  from (select 1) _
  left join public.incident_ernst_config cfg on lower(cfg.categorie) = lower(i.categorie)
) e on true
where coalesce(i.archived, false) = false;

-- ---------------------------------------------------------------------
-- 3. Beslissingen-tabel voor signalen/adviezen (decisions-only).
-- ---------------------------------------------------------------------
create table if not exists public.incident_advies_beslissingen (
  id                   uuid primary key default gen_random_uuid(),
  sleutel              text not null unique,   -- deterministische signaal-signatuur
  type                 text,
  entiteit_type        text,                   -- client | locatie | medewerker | gedragswetenschapper | tijd | categorie | maatregel
  entiteit             text,
  titel                text,
  status               text not null default 'open',  -- 'open' | 'opgepakt' | 'afgewezen'
  notitie              text,
  besloten_door        uuid,
  besloten_door_naam   text,
  besloten_op          timestamptz,
  aanmaakdatum         timestamptz default now(),
  laatst_gewijzigd     timestamptz default now()
);
create index if not exists incident_advies_beslis_type_idx on public.incident_advies_beslissingen (type, status);
alter table public.incident_advies_beslissingen enable row level security;
drop policy if exists "auth kan incident_advies lezen" on public.incident_advies_beslissingen;
create policy "auth kan incident_advies lezen"
  on public.incident_advies_beslissingen for select to authenticated using (true);
drop policy if exists "auth kan incident_advies toevoegen" on public.incident_advies_beslissingen;
create policy "auth kan incident_advies toevoegen"
  on public.incident_advies_beslissingen for insert to authenticated with check (true);
drop policy if exists "auth kan incident_advies bewerken" on public.incident_advies_beslissingen;
create policy "auth kan incident_advies bewerken"
  on public.incident_advies_beslissingen for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 4. Rol-context voor de UI (hergebruikt het taken-niveaumodel).
--    niveau 1 = eigenaar/admin/directeur/teamleider · 3 = office/beleid/
--    gedragswetenschapper · 5 = medewerker. Analyse zichtbaar t/m niveau 3;
--    directie-/eigenaar-views op niveau <= 1 (+ eigenaar/admin-slug).
-- ---------------------------------------------------------------------
create or replace function public.incident_analyse_context()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  with me as (select lower(email) as email from public.profiles where id = auth.uid())
  select jsonb_build_object(
    'niveau',      public._taken_kijk_niveau(auth.uid()),
    'kan_zien',    public._taken_kijk_niveau(auth.uid()) <= 3,
    'is_directie', public._taken_kijk_niveau(auth.uid()) <= 1,
    'is_eigenaar', exists (
        select 1 from public.bs2_role_users ru
        join public.bs2_roles r on r.id = ru.role_id
        where lower(ru.user_email) = (select email from me)
          and r.slug in ('eigenaar','admin')
      ) or public.is_admin_tier(),
    'naam',        public._productie_naam(auth.uid())
  );
$$;
grant execute on function public.incident_analyse_context() to authenticated;

-- ---------------------------------------------------------------------
-- 5a. AI-herhalingsdetectie + adviezen.
--     Eén signaal per knelpunt met deterministische `sleutel` zodat een
--     beslissing herbruikbaar persisteert. Het systeem signaleert enkel —
--     menselijke beoordeling blijft noodzakelijk.
-- ---------------------------------------------------------------------
create or replace function public.incident_signalen(p_dagen int default 90)
returns table(
  sleutel text, type text, niveau text,
  entiteit_type text, entiteit text,
  titel text, onderbouwing text, advies text,
  acties jsonb, data jsonb,
  status text, notitie text, besloten_door_naam text, besloten_op timestamptz
)
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select (now() at time zone 'Europe/Amsterdam')::date as pe,
           (now() at time zone 'Europe/Amsterdam')::date - greatest(coalesce(p_dagen,90),14) as ps,
           (now() at time zone 'Europe/Amsterdam')::date - 2*greatest(coalesce(p_dagen,90),14) as ps2,
           to_char((now() at time zone 'Europe/Amsterdam')::date,'YYYY-MM') as pk
  ),
  iv as (
    select v.*,
           (v.incident_datum::date >= (select ps from params)) as in_window,
           (v.incident_datum::date >= (select ps2 from params)
            and v.incident_datum::date < (select ps from params)) as in_prev
    from public.incident_verrijkt v
    where v.incident_datum::date >= (select ps2 from params)
  ),
  -- ── A. Cliënt-risicoprofiel ──────────────────────────────────────────
  cl as (
    select client_id,
           max(client_naam) as naam,
           max(locatie_naam) as locatie,
           count(*) filter (where in_window) as n,
           count(*) filter (where in_window and incident_datum::date >= (select pe from params)-14) as n14,
           count(*) filter (where in_window and is_agressie) as agr,
           count(*) filter (where in_window and is_agressie and incident_datum::date >= (select pe from params)-14) as agr14,
           count(*) filter (where in_window and is_weglopen) as weg,
           count(*) filter (where in_window and is_veiligheid) as vei,
           count(*) filter (where in_window and ernst >= 4) as kritiek,
           count(*) filter (where in_prev) as n_prev
    from iv
    where client_id is not null
    group by client_id
  ),
  sig_client as (
    select
      'client|'||cl.client_id||'|'||(select pk from params) as sleutel,
      'client_risicoprofiel'::text as type,
      (case when cl.agr14 >= 3 or cl.kritiek >= 1 or cl.n14 >= 5 then 'hoog' else 'let_op' end)::text as niveau,
      'client'::text as entiteit_type,
      coalesce(cl.naam, 'Onbekende cliënt')::text as entiteit,
      ('Verhoogd risicoprofiel cliënt: '||coalesce(cl.naam,'onbekend'))::text as titel,
      (
        cl.n::text||' incidenten in de periode'
        ||case when cl.agr14 >= 3 then ' · '||cl.agr14||' agressie-incidenten in 14 dagen' else '' end
        ||case when cl.weg >= 2 then ' · '||cl.weg||' keer vermist/weglopen' else '' end
        ||case when cl.kritiek >= 1 then ' · '||cl.kritiek||' zeer ernstig incident' else '' end
        ||case when cl.n_prev > 0 then ' (vorige periode: '||cl.n_prev||')' else '' end
        ||'. Locatie: '||coalesce(cl.locatie,'onbekend')||'.'
      )::text as onderbouwing,
      'Plan een extra MDO, herzie het begeleidings- en veiligheidsplan en overweeg extra inzet van de gedragswetenschapper.'::text as advies,
      jsonb_build_array('Extra MDO inplannen','Begeleidingsplan herzien','Veiligheidsplan herzien','Extra inzet gedragswetenschapper') as acties,
      jsonb_build_object('incidenten',cl.n,'agressie',cl.agr,'weglopen',cl.weg,'veiligheid',cl.vei,'kritiek',cl.kritiek,'vorige_periode',cl.n_prev) as data
    from cl
    where cl.agr14 >= 3 or cl.weg >= 3 or cl.n14 >= 5 or cl.n >= 6 or cl.kritiek >= 1
  ),
  -- ── B. Locatie-veiligheidsrisico (stijging t.o.v. vorige periode) ───────
  loc as (
    select locatie_naam as locatie,
           count(*) filter (where in_window) as n,
           count(*) filter (where in_prev)   as n_prev,
           count(*) filter (where in_window and is_agressie) as agr,
           count(*) filter (where in_window and is_politie)  as pol
    from iv
    where locatie_naam <> 'Onbekend'
    group by locatie_naam
  ),
  sig_loc as (
    select
      'locatie|'||loc.locatie||'|'||(select pk from params) as sleutel,
      'locatie_veiligheidsrisico'::text as type,
      (case when loc.n_prev > 0 and loc.n >= loc.n_prev*1.5 then 'hoog' else 'let_op' end)::text as niveau,
      'locatie'::text as entiteit_type,
      loc.locatie::text as entiteit,
      ('Locatie vertoont verhoogd veiligheidsrisico: '||loc.locatie)::text as titel,
      (
        case when loc.n_prev >= 3
             then round((loc.n - loc.n_prev)*100.0/loc.n_prev)||'% stijging incidenten t.o.v. vorige periode ('||loc.n_prev||' → '||loc.n||')'
             else 'toename van '||loc.n_prev||' naar '||loc.n||' incidenten t.o.v. vorige periode' end
        ||case when loc.agr > 0 then ' · '||loc.agr||' fysieke/verbale agressie' else '' end
        ||case when loc.pol > 0 then ' · '||loc.pol||' met mogelijk politiecontact' else '' end
        ||'.'
      )::text as onderbouwing,
      'Bespreek de toename in het teamoverleg, evalueer de bezetting en begeleidingsintensiteit en overweeg een locatiebrede verbetermaatregel.'::text as advies,
      jsonb_build_array('Teamoverleg agenderen','Bezetting evalueren','Verbetermaatregel opstellen') as acties,
      jsonb_build_object('incidenten',loc.n,'vorige_periode',loc.n_prev,'agressie',loc.agr,'politie',loc.pol) as data
    from loc
    where loc.n >= 5 and loc.n_prev > 0 and loc.n >= loc.n_prev*1.3
  ),
  -- ── C. Medewerker-betrokkenheid (NOOIT een oordeel — enkel patroon) ──────
  mw as (
    select melder_id, max(melder_naam) as naam,
           count(*) filter (where in_window) as n,
           count(*) filter (where in_window and is_agressie) as agr
    from iv
    where melder_id is not null
    group by melder_id
  ),
  mw_stat as (select avg(n)::numeric as gem, count(*) as aantal from mw),
  sig_mw as (
    select
      'medewerker|'||mw.melder_id||'|'||(select pk from params) as sleutel,
      'medewerker_betrokkenheid'::text as type,
      'let_op'::text as niveau,
      'medewerker'::text as entiteit_type,
      coalesce(mw.naam,'Onbekende medewerker')::text as entiteit,
      ('Analyse aanbevolen — '||coalesce(mw.naam,'medewerker'))::text as titel,
      (
        mw.n::text||' betrokken incidentmeldingen in de periode'
        ||' (gemiddelde collega: '||round((select gem from mw_stat),1)||')'
        ||case when mw.agr > 0 then ' · '||mw.agr||' rond agressie' else '' end
        ||'. Dit is GEEN oordeel over functioneren — het systeem signaleert uitsluitend een patroon. Menselijke beoordeling blijft noodzakelijk.'
      )::text as onderbouwing,
      'Ga in gesprek ter ondersteuning, kijk naar werkdruk/dienstverdeling en bied zo nodig training of intervisie aan.'::text as advies,
      jsonb_build_array('Ondersteunend gesprek','Werkdruk bekijken','Training/intervisie aanbieden') as acties,
      jsonb_build_object('incidenten',mw.n,'agressie',mw.agr,'gemiddelde',round((select gem from mw_stat),1)) as data
    from mw, mw_stat
    where (select aantal from mw_stat) >= 2 and mw.n >= greatest((select gem from mw_stat)*1.5, 8)
  ),
  -- ── D. Gedragswetenschapper-caseload (ondersteuning, geen beoordeling) ──
  gw as (
    select gw_naam,
           count(*) filter (where in_window) as n,
           count(*) filter (where in_window and is_agressie) as agr,
           count(*) filter (where in_window and is_weglopen) as weg,
           count(*) filter (where in_window and is_veiligheid) as vei,
           count(distinct client_id) filter (where in_window) as clienten
    from iv
    where gw_naam is not null
    group by gw_naam
  ),
  sig_gw as (
    select
      'gedragswetenschapper|'||gw.gw_naam||'|'||(select pk from params) as sleutel,
      'gedragswetenschapper_caseload'::text as type,
      'let_op'::text as niveau,
      'gedragswetenschapper'::text as entiteit_type,
      gw.gw_naam::text as entiteit,
      ('Opvallende caseload-belasting — '||gw.gw_naam)::text as titel,
      (
        gw.n||' incidenten over '||gw.clienten||' cliënten in de caseload'
        ||case when gw.agr > 0 then ' · '||gw.agr||' agressie' else '' end
        ||case when gw.weg > 0 then ' · '||gw.weg||' weglopen' else '' end
        ||'. Bedoeld voor ondersteuning en kwaliteitsverbetering, niet als beoordeling van functioneren.'
      )::text as onderbouwing,
      'Bied ondersteuning bij de caseload en bekijk of extra inzet of herverdeling helpt.'::text as advies,
      jsonb_build_array('Caseload bespreken','Extra inzet overwegen','Herverdeling bekijken') as acties,
      jsonb_build_object('incidenten',gw.n,'clienten',gw.clienten,'agressie',gw.agr,'weglopen',gw.weg) as data
    from gw
    where gw.n >= 8
  ),
  -- ── E. Tijdspatroon (concentratie in een dienstdeel) ─────────────────────
  tot as (select count(*) filter (where in_window) as n from iv),
  tijd as (
    select tijdstip_label, count(*) filter (where in_window) as n,
           count(*) filter (where in_window and is_weglopen) as weg
    from iv where tijdstip_label <> 'Onbekend'
    group by tijdstip_label
  ),
  sig_tijd as (
    select
      'tijd|'||tijd.tijdstip_label||'|'||(select pk from params) as sleutel,
      'tijd_patroon'::text as type,
      'info'::text as niveau,
      'tijd'::text as entiteit_type,
      tijd.tijdstip_label::text as entiteit,
      ('Incidenten concentreren zich tijdens '||lower(tijd.tijdstip_label)||'diensten')::text as titel,
      (
        round(tijd.n*100.0/nullif((select n from tot),0))||'% van alle incidenten valt in de '||lower(tijd.tijdstip_label)||' ('||tijd.n||' incidenten)'
        ||case when tijd.weg > 0 then ' · waarvan '||tijd.weg||' weglopen' else '' end||'.'
      )::text as onderbouwing,
      ('Evalueer de bezetting en begeleidingsintensiteit tijdens '||lower(tijd.tijdstip_label)||'diensten.')::text as advies,
      jsonb_build_array('Bezetting dienstdeel evalueren','Begeleidingsintensiteit bijstellen') as acties,
      jsonb_build_object('incidenten',tijd.n,'aandeel_pct',round(tijd.n*100.0/nullif((select n from tot),0)),'weglopen',tijd.weg) as data
    from tijd
    where tijd.n >= 10 and tijd.n*100.0/nullif((select n from tot),0) >= 35
  ),
  -- ── F. Categorie-trend (stijging org-breed) ─────────────────────────────
  cat as (
    select categorie,
           count(*) filter (where in_window) as n,
           count(*) filter (where in_prev)   as n_prev
    from iv group by categorie
  ),
  sig_cat as (
    select
      'trend|'||cat.categorie||'|'||(select pk from params) as sleutel,
      'categorie_trend'::text as type,
      'let_op'::text as niveau,
      'categorie'::text as entiteit_type,
      cat.categorie::text as entiteit,
      ('Toename '||lower(cat.categorie))::text as titel,
      (case when cat.n_prev >= 3
            then round((cat.n - cat.n_prev)*100.0/cat.n_prev)||'% stijging t.o.v. vorige periode ('||cat.n_prev||' → '||cat.n||' incidenten).'
            else 'toename van '||cat.n_prev||' naar '||cat.n||' incidenten t.o.v. vorige periode.' end)::text as onderbouwing,
      'Analyseer de onderliggende oorzaak en bepaal of een gerichte verbetermaatregel nodig is.'::text as advies,
      jsonb_build_array('Oorzaakanalyse','Gerichte verbetermaatregel') as acties,
      jsonb_build_object('incidenten',cat.n,'vorige_periode',cat.n_prev) as data
    from cat
    where cat.n >= 5 and cat.n_prev > 0 and cat.n >= cat.n_prev*1.4
  ),
  alle as (
    select * from sig_client
    union all select * from sig_loc
    union all select * from sig_mw
    union all select * from sig_gw
    union all select * from sig_tijd
    union all select * from sig_cat
  )
  select a.sleutel, a.type, a.niveau, a.entiteit_type, a.entiteit,
         a.titel, a.onderbouwing, a.advies, a.acties, a.data,
         coalesce(b.status,'open') as status, b.notitie, b.besloten_door_naam, b.besloten_op
  from alle a
  left join public.incident_advies_beslissingen b on b.sleutel = a.sleutel
  order by (case a.niveau when 'hoog' then 0 when 'let_op' then 1 else 2 end),
           (case when coalesce(b.status,'open') = 'open' then 0 else 1 end),
           a.titel;
$function$;
grant execute on function public.incident_signalen(int) to authenticated;

-- ---------------------------------------------------------------------
-- 5b. Dynamische risicoscores per cliënt (groen/oranje/rood).
-- ---------------------------------------------------------------------
create or replace function public.incident_risicoscores(p_dagen int default 30)
returns table(
  client_id text, client_naam text, locatie text,
  incidenten int, agressie int, weglopen int, veiligheid int, politie int, zelfbeschadiging int,
  kritiek int, herhaling int, score int, kleur text, laatste timestamptz
)
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select (now() at time zone 'Europe/Amsterdam')::date - greatest(coalesce(p_dagen,30),7) as ps
  ),
  win as (
    select * from public.incident_verrijkt
    where incident_datum::date >= (select ps from params) and client_id is not null
  ),
  herh as (
    select client_id, max(cnt) as max_cat
    from (select client_id, categorie, count(*) cnt from win group by client_id, categorie) z
    group by client_id
  ),
  agg as (
    select w.client_id,
           max(w.client_naam) as client_naam,
           max(w.locatie_naam) as locatie,
           count(*)::int as incidenten,
           count(*) filter (where w.is_agressie)::int as agressie,
           count(*) filter (where w.is_weglopen)::int as weglopen,
           count(*) filter (where w.is_veiligheid)::int as veiligheid,
           count(*) filter (where w.is_politie)::int as politie,
           count(*) filter (where w.is_zelfbeschadiging)::int as zelfbeschadiging,
           count(*) filter (where w.ernst >= 4)::int as kritiek,
           coalesce(sum(w.ernst),0) as ernst_som,
           max(w.incident_datum) as laatste
    from win w group by w.client_id
  )
  select
    a.client_id, a.client_naam, a.locatie,
    a.incidenten, a.agressie, a.weglopen, a.veiligheid, a.politie, a.zelfbeschadiging, a.kritiek,
    greatest(coalesce(h.max_cat,1)-1,0)::int as herhaling,
    least(100, (a.ernst_som*5 + a.weglopen*8 + a.politie*10 + a.zelfbeschadiging*12
                + greatest(coalesce(h.max_cat,1)-1,0)*6))::int as score,
    (case
       when least(100, (a.ernst_som*5 + a.weglopen*8 + a.politie*10 + a.zelfbeschadiging*12 + greatest(coalesce(h.max_cat,1)-1,0)*6)) >= 55 then 'rood'
       when least(100, (a.ernst_som*5 + a.weglopen*8 + a.politie*10 + a.zelfbeschadiging*12 + greatest(coalesce(h.max_cat,1)-1,0)*6)) >= 25 then 'oranje'
       else 'groen' end)::text as kleur,
    a.laatste
  from agg a left join herh h on h.client_id = a.client_id
  order by score desc, a.incidenten desc;
$function$;
grant execute on function public.incident_risicoscores(int) to authenticated;

-- ---------------------------------------------------------------------
-- 5c. Top 10 risicocliënten / risicolocaties / trends (één payload).
-- ---------------------------------------------------------------------
create or replace function public.incident_top(p_dagen int default 90)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select (now() at time zone 'Europe/Amsterdam')::date as pe,
           (now() at time zone 'Europe/Amsterdam')::date - greatest(coalesce(p_dagen,90),14) as ps,
           (now() at time zone 'Europe/Amsterdam')::date - 2*greatest(coalesce(p_dagen,90),14) as ps2
  ),
  iv as (
    select v.*,
           (v.incident_datum::date >= (select ps from params)) as in_window,
           (v.incident_datum::date >= (select ps2 from params) and v.incident_datum::date < (select ps from params)) as in_prev
    from public.incident_verrijkt v
    where v.incident_datum::date >= (select ps2 from params)
  ),
  top_cl as (
    select coalesce(client_naam,'Onbekend') as naam, max(locatie_naam) as locatie,
           count(*) filter (where in_window) as n,
           count(*) filter (where in_window and ernst>=4) as kritiek,
           coalesce(sum(ernst) filter (where in_window),0) as ernst_som
    from iv where client_id is not null group by client_id, client_naam
    having count(*) filter (where in_window) > 0
    order by ernst_som desc, n desc limit 10
  ),
  top_loc as (
    select locatie_naam as locatie,
           count(*) filter (where in_window) as n,
           count(*) filter (where in_window and is_veiligheid) as veiligheid,
           count(*) filter (where in_prev) as n_prev
    from iv where locatie_naam <> 'Onbekend' group by locatie_naam
    having count(*) filter (where in_window) > 0
    order by n desc limit 10
  ),
  top_trend as (
    select categorie,
           count(*) filter (where in_window) as n,
           count(*) filter (where in_prev) as n_prev
    from iv group by categorie
    having count(*) filter (where in_window) > 0
    order by (count(*) filter (where in_window)) - (count(*) filter (where in_prev)) desc limit 10
  )
  select jsonb_build_object(
    'clienten', coalesce((select jsonb_agg(jsonb_build_object(
        'naam',naam,'locatie',locatie,'incidenten',n,'kritiek',kritiek,'ernst_som',ernst_som)) from top_cl),'[]'::jsonb),
    'locaties', coalesce((select jsonb_agg(jsonb_build_object(
        'locatie',locatie,'incidenten',n,'veiligheid',veiligheid,'vorige_periode',n_prev,
        'trend_pct', case when n_prev>0 then round((n-n_prev)*100.0/n_prev) else null end)) from top_loc),'[]'::jsonb),
    'trends', coalesce((select jsonb_agg(jsonb_build_object(
        'categorie',categorie,'incidenten',n,'vorige_periode',n_prev,
        'verschil', n-n_prev,
        'trend_pct', case when n_prev>0 then round((n-n_prev)*100.0/n_prev) else null end)) from top_trend),'[]'::jsonb)
  );
$function$;
grant execute on function public.incident_top(int) to authenticated;

-- ---------------------------------------------------------------------
-- 5d. Analyse per dimensie (cliënt/locatie/medewerker/gedragswetenschapper/
--     tijd/categorie/actor) incl. vergelijking met de vorige even-lange periode.
-- ---------------------------------------------------------------------
create or replace function public.incident_dimensie(
  p_dim text default 'locatie', p_dagen int default 90)
returns table(
  label text, incidenten int, vorige int, trend_pct numeric,
  ernst_gem numeric, agressie int, weglopen int, veiligheid int, opgelost int
)
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select (now() at time zone 'Europe/Amsterdam')::date - greatest(coalesce(p_dagen,90),7) as ps,
           (now() at time zone 'Europe/Amsterdam')::date - 2*greatest(coalesce(p_dagen,90),7) as ps2
  ),
  iv as (
    select v.*,
      (case lower(coalesce(p_dim,'locatie'))
         when 'client'              then coalesce(v.client_naam,'Onbekend')
         when 'cliënt'              then coalesce(v.client_naam,'Onbekend')
         when 'medewerker'          then coalesce(v.melder_naam,'Onbekend')
         when 'gedragswetenschapper' then coalesce(v.gw_naam,'Onbekend / niet gekoppeld')
         when 'tijd'                then v.tijdstip_label
         when 'categorie'           then v.categorie
         when 'actor'               then coalesce(v.actor_type,'Onbekend')
         else v.locatie_naam end) as dim,
      (v.incident_datum::date >= (select ps from params)) as in_window,
      (v.incident_datum::date >= (select ps2 from params) and v.incident_datum::date < (select ps from params)) as in_prev
    from public.incident_verrijkt v
    where v.incident_datum::date >= (select ps2 from params)
  )
  select
    dim as label,
    count(*) filter (where in_window)::int as incidenten,
    count(*) filter (where in_prev)::int as vorige,
    case when count(*) filter (where in_prev) > 0
         then round((count(*) filter (where in_window) - count(*) filter (where in_prev))*100.0
                    / count(*) filter (where in_prev), 0)
         else null end as trend_pct,
    round(avg(ernst) filter (where in_window), 1) as ernst_gem,
    count(*) filter (where in_window and is_agressie)::int as agressie,
    count(*) filter (where in_window and is_weglopen)::int as weglopen,
    count(*) filter (where in_window and is_veiligheid)::int as veiligheid,
    count(*) filter (where in_window and status = 'opgelost')::int as opgelost
  from iv
  group by dim
  having count(*) filter (where in_window) > 0
  order by count(*) filter (where in_window) desc;
$function$;
grant execute on function public.incident_dimensie(text, int) to authenticated;

-- ---------------------------------------------------------------------
-- 5e. Positieve KPI's — kwaliteitsdashboard (waar gaat het goed?).
-- ---------------------------------------------------------------------
create or replace function public.incident_positieve_kpis(p_dagen int default 90)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select (now() at time zone 'Europe/Amsterdam')::date as pe,
           (now() at time zone 'Europe/Amsterdam')::date - greatest(coalesce(p_dagen,90),14) as ps,
           (now() at time zone 'Europe/Amsterdam')::date - 2*greatest(coalesce(p_dagen,90),14) as ps2
  ),
  iv as (
    select v.*,
      (v.incident_datum::date >= (select ps from params)) as in_window,
      (v.incident_datum::date >= (select ps2 from params) and v.incident_datum::date < (select ps from params)) as in_prev
    from public.incident_verrijkt v
    where v.incident_datum::date >= (select ps2 from params)
  ),
  -- Dagen zonder incident per locatie (laatste incident → vandaag).
  dagen_zonder as (
    select locatie_naam as locatie,
           ((select pe from params) - max(incident_datum)::date) as dagen,
           max(incident_datum) as laatste
    from public.incident_verrijkt where locatie_naam <> 'Onbekend'
    group by locatie_naam order by dagen desc
  ),
  -- Cliënten met afnemende incidenten (window < vorige window).
  dalers as (
    select coalesce(client_naam,'Onbekend') as naam, max(locatie_naam) as locatie,
           count(*) filter (where in_window) as n, count(*) filter (where in_prev) as n_prev
    from iv where client_id is not null group by client_id, client_naam
    having count(*) filter (where in_prev) > 0 and count(*) filter (where in_window) < count(*) filter (where in_prev)
    order by (count(*) filter (where in_prev) - count(*) filter (where in_window)) desc limit 10
  ),
  -- Locaties/teams met de grootste verbetering.
  team_verbetering as (
    select locatie_naam as locatie,
           count(*) filter (where in_window) as n, count(*) filter (where in_prev) as n_prev
    from iv where locatie_naam <> 'Onbekend' group by locatie_naam
    having count(*) filter (where in_prev) > 0 and count(*) filter (where in_window) < count(*) filter (where in_prev)
    order by (count(*) filter (where in_prev) - count(*) filter (where in_window)) desc limit 10
  ),
  -- Gemiddelde tijd tot herstel (incident → opgelost), in dagen.
  hersteltijd as (
    select round(avg(extract(epoch from (laatst_gewijzigd - incident_datum))/86400.0)::numeric, 1) as dagen,
           count(*) as n
    from public.incident_verrijkt
    where status = 'opgelost' and laatst_gewijzigd >= incident_datum
      and incident_datum::date >= (select ps from params)
  ),
  maatregelen as (
    select count(*) filter (where afgerond) as afgerond,
           count(*) filter (where not afgerond and not coalesce(archived,false)) as lopend
    from public.verbeteringsmaatregelen
  )
  select jsonb_build_object(
    'dagen_zonder', coalesce((select jsonb_agg(jsonb_build_object('locatie',locatie,'dagen',dagen,'laatste',laatste)) from (select * from dagen_zonder limit 10) z),'[]'::jsonb),
    'dalers', coalesce((select jsonb_agg(jsonb_build_object('naam',naam,'locatie',locatie,'nu',n,'eerder',n_prev,'minder',n_prev-n)) from dalers),'[]'::jsonb),
    'team_verbetering', coalesce((select jsonb_agg(jsonb_build_object('locatie',locatie,'nu',n,'eerder',n_prev,'minder',n_prev-n,'pct',round((n_prev-n)*100.0/nullif(n_prev,0)))) from team_verbetering),'[]'::jsonb),
    'hersteltijd_dagen', (select dagen from hersteltijd),
    'hersteltijd_n', (select n from hersteltijd),
    'maatregelen_afgerond', (select afgerond from maatregelen),
    'maatregelen_lopend', (select lopend from maatregelen)
  );
$function$;
grant execute on function public.incident_positieve_kpis(int) to authenticated;

-- ---------------------------------------------------------------------
-- 5f. Directie-KPI's (managementinformatie).
-- ---------------------------------------------------------------------
create or replace function public.incident_directie_kpis(p_dagen int default 90)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with params as (
    select (now() at time zone 'Europe/Amsterdam')::date as pe,
           (now() at time zone 'Europe/Amsterdam')::date - greatest(coalesce(p_dagen,90),14) as ps,
           (now() at time zone 'Europe/Amsterdam')::date - 2*greatest(coalesce(p_dagen,90),14) as ps2
  ),
  iv as (
    select v.*,
      (v.incident_datum::date >= (select ps from params)) as in_window,
      (v.incident_datum::date >= (select ps2 from params) and v.incident_datum::date < (select ps from params)) as in_prev
    from public.incident_verrijkt v
    where v.incident_datum::date >= (select ps2 from params)
  ),
  loc as (
    select locatie_naam,
           count(*) filter (where in_window) as n, count(*) filter (where in_prev) as n_prev
    from iv where locatie_naam <> 'Onbekend' group by locatie_naam
  )
  select jsonb_build_object(
    'incidenten', (select count(*) filter (where in_window) from iv),
    'incidenten_vorig', (select count(*) filter (where in_prev) from iv),
    'trend_pct', (select case when count(*) filter (where in_prev)>0
                    then round((count(*) filter (where in_window)-count(*) filter (where in_prev))*100.0/count(*) filter (where in_prev))
                    else null end from iv),
    'ernstige', (select count(*) filter (where in_window and ernst>=4) from iv),
    'open', (select count(*) filter (where in_window and status<>'opgelost') from iv),
    'opgelost_pct', (select case when count(*) filter (where in_window)>0
                      then round(count(*) filter (where in_window and status='opgelost')*100.0/count(*) filter (where in_window))
                      else null end from iv),
    'doorlooptijd_dagen', (select round(avg(extract(epoch from (laatst_gewijzigd-incident_datum))/86400.0)::numeric,1)
                             from public.incident_verrijkt
                             where status='opgelost' and laatst_gewijzigd>=incident_datum
                               and incident_datum::date >= (select ps from params)),
    'locaties_risico', (select count(*) from loc where n>=5 and n_prev>0 and n>=n_prev*1.3),
    'inspectierisico', (select count(*) filter (where in_window and ernst>=4 and status<>'opgelost') from iv),
    'open_maatregelen', (select count(*) from public.verbeteringsmaatregelen where not afgerond and not coalesce(archived,false))
  );
$function$;
grant execute on function public.incident_directie_kpis(int) to authenticated;

-- ---------------------------------------------------------------------
-- 5g. Eigenaar-KPI's (strategisch: kwartaal-op-kwartaal & jaar-op-jaar).
-- ---------------------------------------------------------------------
create or replace function public.incident_eigenaar_kpis()
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with d as (select (now() at time zone 'Europe/Amsterdam')::date as today),
  iv as (select * from public.incident_verrijkt),
  q as (
    select
      count(*) filter (where incident_datum::date >= (select today from d)-90) as q_huidig,
      count(*) filter (where incident_datum::date >= (select today from d)-180 and incident_datum::date < (select today from d)-90) as q_vorig,
      count(*) filter (where incident_datum::date >= (select today from d)-365) as j_huidig,
      count(*) filter (where incident_datum::date >= (select today from d)-730 and incident_datum::date < (select today from d)-365) as j_vorig,
      count(*) filter (where incident_datum::date >= (select today from d)-90 and ernst>=4) as ernstig_q,
      count(*) filter (where incident_datum::date >= (select today from d)-180 and incident_datum::date < (select today from d)-90 and ernst>=4) as ernstig_q_vorig
    from iv
  ),
  comp as (
    select case when count(*)>0 then round(count(*) filter (where status='opgelost')*100.0/count(*)) else null end as compliance,
           round(avg(extract(epoch from (laatst_gewijzigd-incident_datum))/86400.0) filter (where status='opgelost' and laatst_gewijzigd>=incident_datum)::numeric,1) as doorlooptijd
    from iv where incident_datum::date >= (select today from d)-90
  ),
  toploc as (
    select locatie_naam, count(*) n from iv
    where incident_datum::date >= (select today from d)-90 and locatie_naam<>'Onbekend'
    group by locatie_naam order by count(*) desc limit 1
  )
  select jsonb_build_object(
    'q_huidig',(select q_huidig from q), 'q_vorig',(select q_vorig from q),
    'q_pct', (select case when q_vorig>0 then round((q_huidig-q_vorig)*100.0/q_vorig) else null end from q),
    'j_huidig',(select j_huidig from q), 'j_vorig',(select j_vorig from q),
    'j_pct', (select case when j_vorig>0 then round((j_huidig-j_vorig)*100.0/j_vorig) else null end from q),
    'ernstig_q',(select ernstig_q from q), 'ernstig_q_vorig',(select ernstig_q_vorig from q),
    'compliance',(select compliance from comp),
    'doorlooptijd_dagen',(select doorlooptijd from comp),
    'top_locatie',(select locatie_naam from toploc), 'top_locatie_n',(select n from toploc),
    'open_maatregelen', (select count(*) from public.verbeteringsmaatregelen where not afgerond and not coalesce(archived,false))
  );
$function$;
grant execute on function public.incident_eigenaar_kpis() to authenticated;

-- ---------------------------------------------------------------------
-- 5h. Effectmeting verbetermaatregelen — org-brede incidenten 30 dagen
--     vóór vs 30 dagen ná de peildatum (aanmaakdatum) van elke maatregel.
-- ---------------------------------------------------------------------
create or replace function public.incident_maatregel_effect()
returns table(
  id text, titel text, peildatum date, voor int, na int, effect_pct numeric, oordeel text
)
language sql stable security definer set search_path to 'public'
as $function$
  with m as (
    select id, titel, aanmaakdatum::date as peil
    from public.verbeteringsmaatregelen
    where not coalesce(archived,false)
      and aanmaakdatum::date <= (now() at time zone 'Europe/Amsterdam')::date - 14
  )
  select
    m.id, m.titel, m.peil,
    (select count(*)::int from public.incident_verrijkt v
       where v.incident_datum::date >= m.peil-30 and v.incident_datum::date < m.peil) as voor,
    (select count(*)::int from public.incident_verrijkt v
       where v.incident_datum::date >= m.peil and v.incident_datum::date < m.peil+30) as na,
    (select case when c0>0 then round((c1-c0)*100.0/c0) else null end
       from (select
               (select count(*) from public.incident_verrijkt v where v.incident_datum::date >= m.peil-30 and v.incident_datum::date < m.peil) c0,
               (select count(*) from public.incident_verrijkt v where v.incident_datum::date >= m.peil and v.incident_datum::date < m.peil+30) c1
            ) z) as effect_pct,
    (select case
       when c0 = 0 then 'onvoldoende data'
       when c1 <= c0*0.8 then 'positief'
       when c1 >= c0*1.1 then 'negatief'
       else 'geen aantoonbaar effect' end
       from (select
               (select count(*) from public.incident_verrijkt v where v.incident_datum::date >= m.peil-30 and v.incident_datum::date < m.peil) c0,
               (select count(*) from public.incident_verrijkt v where v.incident_datum::date >= m.peil and v.incident_datum::date < m.peil+30) c1
            ) z) as oordeel
  from m
  order by m.peil desc;
$function$;
grant execute on function public.incident_maatregel_effect() to authenticated;

-- ---------------------------------------------------------------------
-- 5i. Beslissing op een signaal/advies opslaan (+ notificatie directie).
--     SECURITY DEFINER met harde niveau<=3-check.
-- ---------------------------------------------------------------------
create or replace function public.incident_advies_beslis(
  p_sleutel text, p_type text, p_entiteit_type text, p_entiteit text, p_titel text,
  p_status text, p_notitie text default null)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_naam text := public._productie_naam(auth.uid());
  v_id uuid;
begin
  if public._taken_kijk_niveau(v_uid) > 3 then
    raise exception 'Geen rechten om een signaal te beoordelen (alleen management/kwaliteit).';
  end if;
  if p_status not in ('open','opgepakt','afgewezen') then
    raise exception 'Ongeldige status: %', p_status;
  end if;

  insert into public.incident_advies_beslissingen
    (sleutel, type, entiteit_type, entiteit, titel, status, notitie,
     besloten_door, besloten_door_naam, besloten_op)
  values (p_sleutel, p_type, p_entiteit_type, p_entiteit, p_titel, p_status, p_notitie,
     case when p_status <> 'open' then v_uid end,
     case when p_status <> 'open' then v_naam end,
     case when p_status <> 'open' then now() end)
  on conflict (sleutel) do update set
    status = p_status,
    notitie = coalesce(p_notitie, public.incident_advies_beslissingen.notitie),
    besloten_door = case when p_status <> 'open' then v_uid else public.incident_advies_beslissingen.besloten_door end,
    besloten_door_naam = case when p_status <> 'open' then v_naam else public.incident_advies_beslissingen.besloten_door_naam end,
    besloten_op = case when p_status <> 'open' then now() else public.incident_advies_beslissingen.besloten_op end,
    laatst_gewijzigd = now()
  returning id into v_id;

  if p_status <> 'open' then
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    select pr.id, 'incident_signaal',
           'Incidentsignaal ' || p_status || ': ' || coalesce(p_titel,'risicosignaal'),
           coalesce(v_naam,'Iemand') || ' heeft het incidentsignaal ''' || coalesce(p_titel,'signaal') ||
             ''' als ''' || p_status || ''' gemarkeerd.',
           'incident_analyse', p_sleutel
    from public.profiles pr
    where public._taken_kijk_niveau(pr.id) <= 1
      and pr.id is distinct from v_uid;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', p_status);
end;
$function$;
grant execute on function public.incident_advies_beslis(text,text,text,text,text,text,text) to authenticated;

-- =====================================================================
-- Einde incident_analyse_module.sql
-- =====================================================================
