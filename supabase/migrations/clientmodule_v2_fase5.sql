-- ============================================================
-- Cliëntmodule 2.0 — FASE 5: dashboards + KPI + drill-down
-- 1. clientdash_context()  → wie ben ik + welke views mag ik zien
-- 2. clientdash_caseload_gw(p_email)  → GW-caseload §17
-- 3. clientdash_zorgcoordinator()     → zorgcoörd §18
-- 4. clientdash_directeur()           → directeur §19
-- 5. clientdash_eigenaar()            → eigenaar §20 (omzet/demografie/products)
-- 6. clientdash_kpi()                 → KPI §21
-- ============================================================

create or replace function public.clientdash_context()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_rollen text[];
  v_admin boolean := false;
  v_views text[] := '{}'::text[];
begin
  select array_agg(distinct r.slug)
    into v_rollen
    from public.profiles p
    join public.bs2_role_users u on lower(u.user_email) = lower(p.email)
    join public.bs2_roles r on r.id = u.role_id
   where p.id = auth.uid();
  v_rollen := coalesce(v_rollen, '{}'::text[]);
  v_admin := exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin')
          or v_rollen && array['admin','eigenaar','directeur'];

  if v_admin or 'gedragswetenschapper' = any(v_rollen) then v_views := array_append(v_views, 'caseload_gw'); end if;
  if v_admin or 'teamleider' = any(v_rollen) then v_views := array_append(v_views, 'zorgcoordinator'); end if;
  if v_admin or 'directeur' = any(v_rollen) then v_views := array_append(v_views, 'directeur'); end if;
  if v_admin or 'eigenaar' = any(v_rollen) then v_views := array_append(v_views, 'eigenaar'); end if;
  if v_admin or v_rollen && array['eigenaar','directeur','teamleider','gedragswetenschapper','beleid'] then
    v_views := array_append(v_views, 'kpi');
  end if;

  return jsonb_build_object('rollen', v_rollen, 'admin_tier', v_admin, 'views', v_views,
    'tarieven_zichtbaar', v_admin or v_rollen && array['finance','eigenaar','directeur','admin']);
end; $$;
revoke all on function public.clientdash_context() from public, anon;
grant execute on function public.clientdash_context() to authenticated;

-- Caseload GW: cliënten die aan deze GW gekoppeld zijn (via client_medewerkers
-- rol=gedragswetenschapper OF legacy clienten.data->>'gedragswetenschapper_email').
create or replace function public.clientdash_caseload_gw()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_ctx jsonb := public.clientdash_context();
  v_email text;
  v_admin boolean := (v_ctx->>'admin_tier')::boolean;
  v_clients jsonb;
  v_kpi jsonb;
  v_today date := current_date;
begin
  if not v_admin and not ('caseload_gw' = any(array(select jsonb_array_elements_text(v_ctx->'views')))) then
    raise exception 'Geen toegang tot caseload-GW';
  end if;
  select email into v_email from public.profiles where id = auth.uid();

  with eigen as (
    select c.* from public.clienten c
     where coalesce(c.archived,false) = false
       and c.reis_status in ('actief','tijdelijk_gepauzeerd','intake_gepland','wachtlijst','plaatsing_gepland','intake_afgerond')
       and (
            lower(coalesce(c.data->>'gedragswetenschapper_email','')) = lower(coalesce(v_email,''))
         or exists (select 1 from public.client_medewerkers cm
                     join public.profiles p2 on p2.medewerker_id = cm.medewerker_id
                    where cm.client_id = c.id and cm.rol = 'gedragswetenschapper'
                      and lower(p2.email) = lower(coalesce(v_email,'')))
         or v_admin
       )
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'client_id', e.id,
    'naam', btrim(coalesce(e.voornaam,'') || ' ' || coalesce(e.achternaam,'')),
    'reis_status', e.reis_status,
    'locatie', e.locatie,
    'zorgplan_titel', zp.titel,
    'zorgplan_status', zp.status,
    'evaluatiemoment', zp.evaluatiemoment,
    'dagen_tot_evaluatie', case when zp.evaluatiemoment is null then null else (zp.evaluatiemoment - v_today) end,
    'signaleringsplan_actief', exists(select 1 from public.signaleringsplannen sp where sp.client_id=e.id and sp.status='actief' and not sp.archived),
    'open_issues', (select count(*) from public.client_dossier_issues di where di.client_id=e.id and di.opgelost_op is null)
  ) order by e.achternaam, e.voornaam), '[]'::jsonb)
    into v_clients
    from eigen e
    left join lateral (
      select id, titel, status, evaluatiemoment from public.zorgplannen
       where client_id = e.id and status = 'actief' and not archived
       order by actief_sinds desc nulls last limit 1
    ) zp on true;

  select jsonb_build_object(
    'totaal_caseload', jsonb_array_length(v_clients),
    'evaluaties_30d', (select count(*) from jsonb_array_elements(v_clients) e where (e->>'dagen_tot_evaluatie')::int is not null and (e->>'dagen_tot_evaluatie')::int between 0 and 30),
    'zonder_zorgplan', (select count(*) from jsonb_array_elements(v_clients) e where e->>'zorgplan_titel' is null),
    'open_issues_totaal', (select coalesce(sum((e->>'open_issues')::int), 0) from jsonb_array_elements(v_clients) e)
  ) into v_kpi;

  return jsonb_build_object('clienten', v_clients, 'kpi', v_kpi);
end; $$;
revoke all on function public.clientdash_caseload_gw() from public, anon;
grant execute on function public.clientdash_caseload_gw() to authenticated;

-- Zorgcoordinator: alle cliënten + KPI's per locatie
create or replace function public.clientdash_zorgcoordinator()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_ctx jsonb := public.clientdash_context();
  v_admin boolean := (v_ctx->>'admin_tier')::boolean;
  v_per_locatie jsonb; v_open_zaken jsonb;
begin
  if not v_admin and not ('zorgcoordinator' = any(array(select jsonb_array_elements_text(v_ctx->'views')))) then
    raise exception 'Geen toegang tot zorgcoörd-dashboard';
  end if;

  with akt as (
    select coalesce(nullif(btrim(locatie),''),'(onbekend)') as locatie, count(*) as totaal,
           count(*) filter (where reis_status='actief') as actief,
           count(*) filter (where reis_status='tijdelijk_gepauzeerd') as gepauzeerd,
           count(*) filter (where reis_status='wachtlijst') as wachtlijst,
           count(*) filter (where reis_status='intake_gepland') as intake_gepland
      from public.clienten where not archived
       and reis_status in ('actief','tijdelijk_gepauzeerd','intake_gepland','wachtlijst','plaatsing_gepland','intake_afgerond')
      group by 1
  )
  select coalesce(jsonb_agg(row_to_json(akt) order by akt.totaal desc), '[]'::jsonb)
    into v_per_locatie from akt;

  select coalesce(jsonb_agg(jsonb_build_object(
    'client_id', c.id, 'naam', btrim(coalesce(c.voornaam,'')||' '||coalesce(c.achternaam,'')),
    'aantal_issues', i.aantal, 'rood', i.rood, 'oranje', i.oranje
  ) order by i.rood desc, i.aantal desc), '[]'::jsonb)
    into v_open_zaken
    from (
      select client_id,
             count(*) as aantal,
             count(*) filter (where ernst='rood') as rood,
             count(*) filter (where ernst='oranje') as oranje
        from public.client_dossier_issues
       where opgelost_op is null
       group by client_id
       order by 3 desc, 2 desc limit 20
    ) i
    join public.clienten c on c.id = i.client_id;

  return jsonb_build_object('per_locatie', v_per_locatie, 'top_open_issues', v_open_zaken);
end; $$;
revoke all on function public.clientdash_zorgcoordinator() from public, anon;
grant execute on function public.clientdash_zorgcoordinator() to authenticated;

-- Directeur: organisatie-overzicht (caseload + omzet-indicatie + funnel)
create or replace function public.clientdash_directeur()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_ctx jsonb := public.clientdash_context();
  v_admin boolean := (v_ctx->>'admin_tier')::boolean;
  v_kpi jsonb; v_funnel jsonb; v_omzet jsonb;
begin
  if not v_admin and not ('directeur' = any(array(select jsonb_array_elements_text(v_ctx->'views')))) then
    raise exception 'Geen toegang tot directeur-dashboard';
  end if;

  select jsonb_build_object(
    'actief', (select count(*) from public.clienten where reis_status='actief' and not archived),
    'wachtlijst', (select count(*) from public.clienten where reis_status='wachtlijst' and not archived),
    'aanmeldingen_30d', (select count(*) from public.client_aanmeldingen where aanmaakdatum > now() - interval '30 days'),
    'uitstroom_90d', (select count(*) from public.clienten where reis_status='uitgestroomd' and laatst_gewijzigd > now() - interval '90 days'),
    'beschikkingen_verlopen_60d', (select count(*) from public.beschikkingen where not coalesce(gearchiveerd,false) and eind_iso between current_date and current_date + 60),
    'open_dossier_issues', (select count(*) from public.client_dossier_issues where opgelost_op is null)
  ) into v_kpi;

  select coalesce(jsonb_agg(jsonb_build_object('status', status, 'aantal', n) order by n desc), '[]'::jsonb)
    into v_funnel
    from (
      select reis_status as status, count(*) as n
        from public.clienten where not archived
        group by reis_status
    ) f;

  -- Omzet-indicatie per gemeente (alleen voor admin-tier zichtbaar in UI).
  if v_admin or (v_ctx->>'tarieven_zichtbaar')::boolean then
    select coalesce(jsonb_agg(jsonb_build_object('gemeente', coalesce(nullif(gemeente,''),'(onbekend)'), 'omzet', omzet, 'aantal_facturen', aantal) order by omzet desc), '[]'::jsonb)
      into v_omzet
      from (
        select c.gemeente, sum(coalesce(f.bedrag,0)) as omzet, count(*) as aantal
          from public.facturen f
          join public.clienten c on (c.id = f.client_id or c.data->>'bs2_id' = f.client_id)
         where not coalesce(f.gearchiveerd,false) and f.aanmaakdatum > now() - interval '12 months'
         group by c.gemeente order by 2 desc nulls last limit 12
      ) o;
  else
    v_omzet := '[]'::jsonb;
  end if;

  return jsonb_build_object('kpi', v_kpi, 'funnel', v_funnel, 'omzet_per_gemeente', v_omzet);
end; $$;
revoke all on function public.clientdash_directeur() from public, anon;
grant execute on function public.clientdash_directeur() to authenticated;

-- Eigenaar: clientele/gemeente/demografie/products
create or replace function public.clientdash_eigenaar()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_ctx jsonb := public.clientdash_context();
  v_admin boolean := (v_ctx->>'admin_tier')::boolean;
  v_groei jsonb; v_demo jsonb; v_producten jsonb;
begin
  if not v_admin and not ('eigenaar' = any(array(select jsonb_array_elements_text(v_ctx->'views')))) then
    raise exception 'Geen toegang tot eigenaar-dashboard';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('maand', maand, 'aantal', n) order by maand), '[]'::jsonb)
    into v_groei
    from (
      select to_char(date_trunc('month', aanmaakdatum), 'YYYY-MM') as maand, count(*) as n
        from public.client_aanmeldingen
        where aanmaakdatum > now() - interval '12 months'
        group by 1 order by 1
    ) g;

  select jsonb_build_object(
    'totaal', count(*),
    'jongens', count(*) filter (where lower(coalesce(data->>'geslacht','')) in ('m','man','jongen','male')),
    'meisjes', count(*) filter (where lower(coalesce(data->>'geslacht','')) in ('v','vrouw','meisje','female')),
    'leeftijd_gem', round(avg(extract(year from age(coalesce((data->>'geboortedatum')::date, current_date)))) ::numeric, 1)
  ) into v_demo from public.clienten
   where not archived and reis_status in ('actief','tijdelijk_gepauzeerd');

  select coalesce(jsonb_agg(jsonb_build_object('product', product, 'aantal', n) order by n desc), '[]'::jsonb)
    into v_producten
    from (
      select coalesce(nullif(productcode,''), nullif(naam,''), '(onbekend)') as product, count(*) as n
        from public.beschikkingen
       where not coalesce(gearchiveerd,false)
       group by 1 order by 2 desc limit 12
    ) p;

  return jsonb_build_object('aanmeldingen_per_maand', v_groei, 'demografie', v_demo, 'producten', v_producten);
end; $$;
revoke all on function public.clientdash_eigenaar() from public, anon;
grant execute on function public.clientdash_eigenaar() to authenticated;

-- KPI-view §21
create or replace function public.clientdash_kpi()
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_ctx jsonb := public.clientdash_context();
  v_admin boolean := (v_ctx->>'admin_tier')::boolean;
  v_funnel jsonb; v_kpi jsonb;
begin
  if not v_admin and not ('kpi' = any(array(select jsonb_array_elements_text(v_ctx->'views')))) then
    raise exception 'Geen toegang tot KPI-dashboard';
  end if;

  select jsonb_build_object(
    'aanmeldtrechter', jsonb_build_object(
      'aanmeldingen_90d', (select count(*) from public.client_aanmeldingen where aanmaakdatum > now() - interval '90 days'),
      'goedgekeurd_90d', (select count(*) from public.client_aanmeldingen where status='goedgekeurd' and aanmaakdatum > now() - interval '90 days'),
      'afgewezen_90d', (select count(*) from public.client_aanmeldingen where status='afgewezen' and aanmaakdatum > now() - interval '90 days')),
    'actieve_clienten', (select count(*) from public.clienten where reis_status='actief' and not archived),
    'verblijfsduur_dagen_med', (select percentile_cont(0.5) within group (order by extract(epoch from (laatst_gewijzigd - aanmaakdatum))/86400)::int
                                  from public.clienten where reis_status='uitgestroomd' and laatst_gewijzigd > now() - interval '180 days'),
    'pct_actief_met_actief_zorgplan',
      (select case when count(*) filter (where reis_status='actief') = 0 then 0 else
        round(100.0 * count(*) filter (where reis_status='actief' and exists(select 1 from public.zorgplannen zp where zp.client_id=c.id and zp.status='actief' and not zp.archived))
        / count(*) filter (where reis_status='actief'), 1) end
        from public.clienten c where not archived),
    'pct_actief_met_signaleringsplan',
      (select case when count(*) filter (where reis_status='actief') = 0 then 0 else
        round(100.0 * count(*) filter (where reis_status='actief' and exists(select 1 from public.signaleringsplannen sp where sp.client_id=c.id and sp.status='actief' and not sp.archived))
        / count(*) filter (where reis_status='actief'), 1) end
        from public.clienten c where not archived)
  ) into v_kpi;

  select coalesce(jsonb_agg(jsonb_build_object('status', status, 'aantal', n) order by n desc), '[]'::jsonb)
    into v_funnel
    from (
      select reis_status as status, count(*) as n from public.clienten where not archived group by reis_status
    ) f;

  return jsonb_build_object('kpi', v_kpi, 'funnel', v_funnel);
end; $$;
revoke all on function public.clientdash_kpi() from public, anon;
grant execute on function public.clientdash_kpi() to authenticated;
