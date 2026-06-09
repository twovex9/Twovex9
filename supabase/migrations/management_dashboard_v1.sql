-- ============================================================================
-- HR Module v4 — G45: management_dashboard_v1 RPC gespiegeld naar version control
-- ============================================================================
-- Deze RPC bestond al live op prod (ukjflilnhigozfoxowmj) maar stond niet in de
-- repo. Hier idempotent gespiegeld voor auditeerbaarheid/herbouwbaarheid (G45).
-- Aggregeert financien/HR/planning/incidenten + signalering server-side; gegate
-- via can_view_management() (Eigenaar/Directeur). Gegenereerd via pg_get_functiondef.
-- bs2_roles/bs2_role_users blijven data-tabellen (geen DDL-mirror nodig).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.management_dashboard_v1(p_month text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date := (now() at time zone 'Europe/Amsterdam')::date;
  v_ym text; v_prev_ym text;
  v_bd jsonb;
  v_omzet numeric := 0; v_omzet_prev numeric := 0;
  v_open_cnt int := 0; v_open_bedrag numeric := 0;
  v_afg_cnt int := 0; v_afg_bedrag numeric := 0;
  v_d14_cnt int := 0; v_d14_bedrag numeric := 0; v_d30_cnt int := 0; v_d30_bedrag numeric := 0;
  v_to_declare_total numeric := 0; v_te_ontvangen numeric := 0; v_te_betalen numeric := 0;
  v_liq_ratio numeric; v_liq_status text; v_fin_status text;
  v_actief int; v_loondienst int; v_zzp int; v_stage int;
  v_verz_now int; v_verz_prev int; v_verz_pct numeric; v_verz_pct_prev numeric; v_verz_trend text;
  v_contract7 int; v_contract30 int; v_verlof int; v_hr_status text;
  v_diensten int; v_open_diensten int; v_vereist int; v_ingevuld int; v_bezetting numeric; v_oproepen int; v_plan_status text;
  v_inc_new7 int; v_inc_open48 int; v_inc_open int; v_agressie int; v_medicatie int; v_bycat jsonb;
  v_klacht_beh int; v_klacht_open int; v_inc_status text;
  v_sig jsonb := '[]'::jsonb;
begin
  if not public.can_view_management() then
    raise exception 'Geen toegang tot het management-dashboard';
  end if;

  ------------------------------------------------------------------ FINANCIEN
  v_bd := public.beschikkingen_dashboard_v2(null, null);
  if nullif(p_month,'') is not null then
    v_ym := p_month;
  else
    -- laatste maand mét omzetdata (declaratie loopt ~3 mnd achter)
    select m->>'ym' into v_ym
      from jsonb_array_elements(v_bd->'months') m
      where coalesce((m->>'paid')::numeric,0)+coalesce((m->>'declared_pending')::numeric,0)+coalesce((m->>'to_declare')::numeric,0) > 0
      order by m->>'ym' desc limit 1;
    v_ym := coalesce(v_ym, to_char(v_today,'YYYY-MM'));
  end if;
  v_prev_ym := to_char(to_date(v_ym,'YYYY-MM') - interval '1 month','YYYY-MM');

  select coalesce((m->>'paid')::numeric,0)+coalesce((m->>'declared_pending')::numeric,0)+coalesce((m->>'to_declare')::numeric,0)
    into v_omzet from jsonb_array_elements(v_bd->'months') m where m->>'ym'=v_ym;
  v_omzet := coalesce(v_omzet,0);
  select coalesce((m->>'paid')::numeric,0)+coalesce((m->>'declared_pending')::numeric,0)+coalesce((m->>'to_declare')::numeric,0)
    into v_omzet_prev from jsonb_array_elements(v_bd->'months') m where m->>'ym'=v_prev_ym;
  v_omzet_prev := coalesce(v_omzet_prev,0);

  select count(*), coalesce(sum(bedrag),0) into v_open_cnt, v_open_bedrag
    from facturen where not gearchiveerd and status='Gedeclareerd en in behandeling';
  select count(*), coalesce(sum(coalesce(total_excl_vat,0)),0) into v_afg_cnt, v_afg_bedrag
    from invoices where coalesce(gearchiveerd,false)=false and deleted_at is null and status='rejected';
  select count(*) filter (where age_d>14), coalesce(sum(amount) filter (where age_d>14),0),
         count(*) filter (where age_d>30), coalesce(sum(amount) filter (where age_d>30),0)
    into v_d14_cnt, v_d14_bedrag, v_d30_cnt, v_d30_bedrag
    from (select amount, (v_today - bs2_created_at::date) age_d
          from bs2_disposition_payments where status='declared_pending' and bs2_created_at is not null) q;

  v_to_declare_total := coalesce((v_bd->'achterstand'->>'to_declare_total')::numeric,0)
                      + coalesce((v_bd->'selected'->>'to_declare')::numeric,0);
  v_te_ontvangen := v_open_bedrag + v_to_declare_total;
  select coalesce(sum(coalesce(total,0)),0) into v_te_betalen
    from invoices where coalesce(gearchiveerd,false)=false and deleted_at is null
      and status in ('submitted','under_review','approved');
  v_liq_ratio := case when v_te_betalen>0 then v_te_ontvangen/v_te_betalen else null end;
  v_liq_status := case when v_te_betalen=0 or v_liq_ratio>=2 then 'Voldoende'
                       when v_liq_ratio>=1 then 'Aandacht vereist' else 'Kritiek' end;
  v_fin_status := case when v_d30_cnt>0 or v_afg_cnt>=3 then 'rood'
                       when v_d14_cnt>0 or v_afg_cnt>=1 then 'oranje' else 'groen' end;

  ------------------------------------------------------------------ HR
  select count(*),
         count(*) filter (where dienstverband in ('Loondienst','permanent')),
         count(*) filter (where dienstverband='Inhuur'),
         count(*) filter (where dienstverband='Stagiair')
    into v_actief, v_loondienst, v_zzp, v_stage
    from medewerkers where coalesce(archived,false)=false;
  with act as (select lower(btrim(coalesce(voornaam,'')||' '||coalesce(achternaam,''))) nm
               from medewerkers where coalesce(archived,false)=false),
  vz as (select lower(btrim(coalesce(medewerker,''))) nm, eerst_ziektedag,
                coalesce(werkelijke_terug, date '9999-12-31') terug from verzuim)
  select count(*) filter (where eerst_ziektedag <= v_today and terug > v_today and exists(select 1 from act a where a.nm=vz.nm)),
         count(*) filter (where eerst_ziektedag <= (v_today-30) and terug > (v_today-30) and exists(select 1 from act a where a.nm=vz.nm))
    into v_verz_now, v_verz_prev from vz;
  v_verz_pct := round(coalesce(v_verz_now,0)::numeric / nullif(v_actief,0) * 100, 1);
  v_verz_pct_prev := round(coalesce(v_verz_prev,0)::numeric / nullif(v_actief,0) * 100, 1);
  v_verz_trend := case when v_verz_now>v_verz_prev then 'stijgend' when v_verz_now<v_verz_prev then 'dalend' else 'stabiel' end;
  select count(*) into v_contract7 from medewerkers
    where coalesce(archived,false)=false and data->>'eindeContract' ~ '^\d{2}-\d{2}-\d{4}$'
      and to_date(data->>'eindeContract','DD-MM-YYYY') between v_today and v_today+7;
  select count(*) into v_contract30 from medewerkers
    where coalesce(archived,false)=false and data->>'eindeContract' ~ '^\d{2}-\d{2}-\d{4}$'
      and to_date(data->>'eindeContract','DD-MM-YYYY') between v_today and v_today+30;
  select count(distinct medewerker_id) into v_verlof from verlof_aanvragen
    where coalesce(archived,false)=false and status='goedgekeurd'
      and start_datum <= (date_trunc('week', v_today::timestamp)::date + 6)
      and eind_datum  >= date_trunc('week', v_today::timestamp)::date;
  v_hr_status := case when coalesce(v_verz_pct,0)>8 then 'rood' when coalesce(v_verz_pct,0)>=5 then 'oranje' else 'groen' end;

  ------------------------------------------------------------------ PLANNING
  with t as (
    select greatest(coalesce(vereist_aantal_medewerkers,1),1) vereist,
           case when teamlid is not null and btrim(teamlid)<>'' then 1 else 0 end heeft
    from planning
    where not coalesce(archived,false) and (start_iso at time zone 'UTC')::date = v_today
  )
  select count(*), coalesce(sum(vereist),0), coalesce(sum(least(heeft,vereist)),0),
         count(*) filter (where heeft < vereist)
    into v_diensten, v_vereist, v_ingevuld, v_open_diensten from t;
  v_bezetting := case when v_vereist>0 then round(v_ingevuld::numeric / v_vereist * 100) else 100 end;
  select count(*) into v_oproepen from dienst_uitnodigingen where status='uitgenodigd';
  v_plan_status := case when v_bezetting<85 or v_open_diensten>=3 then 'rood'
                        when v_bezetting<95 or v_open_diensten between 1 and 2 then 'oranje' else 'groen' end;

  ------------------------------------------------------------------ INCIDENTEN & KLACHTEN
  select count(*) filter (where aanmaakdatum >= now()-interval '7 days'),
         count(*) filter (where status<>'opgelost' and aanmaakdatum < now()-interval '48 hours'),
         count(*) filter (where status<>'opgelost')
    into v_inc_new7, v_inc_open48, v_inc_open
    from incidenten where coalesce(archived,false)=false;
  select coalesce(jsonb_agg(jsonb_build_object('naam',categorie,'count',n) order by n desc),'[]'::jsonb)
    into v_bycat from (
      select coalesce(nullif(categorie,''),'Onbekend') categorie, count(*) n
      from incidenten where coalesce(archived,false)=false and status<>'opgelost' group by 1) z;
  select count(*) filter (where categorie in ('Fysieke Agressie','Verbale Agressie')),
         count(*) filter (where categorie='Medicatie')
    into v_agressie, v_medicatie
    from incidenten where coalesce(archived,false)=false and status<>'opgelost';
  select count(*) filter (where status='in_behandeling'), count(*) filter (where status<>'afgehandeld')
    into v_klacht_beh, v_klacht_open from klachten where coalesce(archived,false)=false;
  v_inc_status := case when v_inc_open48>=3 or v_klacht_open>=2 then 'rood'
                       when v_inc_open48 between 1 and 2 or v_klacht_open=1 then 'oranje' else 'groen' end;

  ------------------------------------------------------------------ SIGNALERING
  if coalesce(v_verz_pct,0) > 8 then
    v_sig := v_sig || jsonb_build_object('domein','Medewerkers','ernst','rood','tekst','Ziekteverzuim boven drempelwaarde ('||v_verz_pct||'%)'); end if;
  if v_open_diensten >= 3 then
    v_sig := v_sig || jsonb_build_object('domein','Planning','ernst','rood','tekst',v_open_diensten||' diensten vandaag niet ingevuld'); end if;
  if v_inc_open48 > 0 then
    v_sig := v_sig || jsonb_build_object('domein','Incidenten','ernst','oranje','tekst',v_inc_open48||' incidenten zonder opvolging >48u'); end if;
  if v_d30_cnt > 0 then
    v_sig := v_sig || jsonb_build_object('domein','Financiën','ernst','rood','tekst',v_d30_cnt||' declaratie(s) langer dan 30 dagen openstaand');
  elsif v_d14_cnt > 0 then
    v_sig := v_sig || jsonb_build_object('domein','Financiën','ernst','oranje','tekst',v_d14_cnt||' declaratie(s) langer dan 14 dagen openstaand'); end if;
  if v_afg_cnt >= 3 then
    v_sig := v_sig || jsonb_build_object('domein','Financiën','ernst','rood','tekst',v_afg_cnt||' afgekeurde declaraties');
  elsif v_afg_cnt >= 1 then
    v_sig := v_sig || jsonb_build_object('domein','Financiën','ernst','oranje','tekst',v_afg_cnt||' afgekeurde declaratie(s)'); end if;
  if v_contract7 > 0 then
    v_sig := v_sig || jsonb_build_object('domein','Medewerkers','ernst','rood','tekst',v_contract7||' contract(en) verlopen binnen 7 dagen');
  elsif v_contract30 > 0 then
    v_sig := v_sig || jsonb_build_object('domein','Medewerkers','ernst','oranje','tekst',v_contract30||' contract(en) verlopen binnen 30 dagen'); end if;
  if v_klacht_open > 0 then
    v_sig := v_sig || jsonb_build_object('domein','Incidenten','ernst','oranje','tekst',v_klacht_open||' klacht(en) in behandeling'); end if;

  ------------------------------------------------------------------ RESULT
  return jsonb_build_object(
    'meta', jsonb_build_object('today', v_today, 'month', v_ym, 'prev_month', v_prev_ym, 'generated_at', now()),
    'financien', jsonb_build_object(
      'omzet_maand', round(v_omzet), 'omzet_vorige_maand', round(v_omzet_prev),
      'omzet_ref_ym', v_ym, 'omzet_prev_ym', v_prev_ym,
      'omzet_delta', round(v_omzet - v_omzet_prev),
      'omzet_delta_pct', case when v_omzet_prev>0 then round((v_omzet-v_omzet_prev)/v_omzet_prev*100,1) else null end,
      'open_declaraties_aantal', v_open_cnt, 'open_declaraties_bedrag', round(v_open_bedrag),
      'afgekeurd_aantal', v_afg_cnt, 'afgekeurd_bedrag', round(v_afg_bedrag),
      'declaratie_ouder14_aantal', v_d14_cnt, 'declaratie_ouder30_aantal', v_d30_cnt,
      'nog_te_declareren', round(v_to_declare_total),
      'liquiditeit', jsonb_build_object('te_ontvangen', round(v_te_ontvangen), 'te_betalen', round(v_te_betalen),
                       'netto', round(v_te_ontvangen - v_te_betalen), 'status', v_liq_status),
      'status', v_fin_status),
    'hr', jsonb_build_object(
      'actief_totaal', v_actief, 'loondienst', v_loondienst, 'zzp', v_zzp, 'stage', v_stage,
      'verzuim_aantal', v_verz_now, 'verzuim_pct', coalesce(v_verz_pct,0),
      'verzuim_pct_vorige', coalesce(v_verz_pct_prev,0), 'verzuim_trend', v_verz_trend,
      'contract_7d', v_contract7, 'contract_30d', v_contract30, 'verlof_deze_week', v_verlof, 'status', v_hr_status),
    'planning', jsonb_build_object(
      'diensten_vandaag', v_diensten, 'openstaande_diensten', v_open_diensten,
      'bezetting_pct', v_bezetting, 'ingevuld', v_ingevuld, 'vereist', v_vereist,
      'oproepen_uitstaand', v_oproepen, 'status', v_plan_status),
    'incidenten', jsonb_build_object(
      'nieuw_7d', v_inc_new7, 'zonder_opvolging_48u', v_inc_open48, 'totaal_open', v_inc_open,
      'agressie', v_agressie, 'medicatie', v_medicatie, 'by_category', v_bycat,
      'klachten_in_behandeling', v_klacht_beh, 'klachten_open', v_klacht_open, 'status', v_inc_status),
    'signalering', v_sig
  );
end;
$function$
;

select 'management_dashboard_v1 mirror OK' as result;
