-- overuren-melding-planner-directeur.sql (gegenereerd uit live defs)
-- 1) melding 'Overuren te beoordelen' → teamleider/zorgcoördinator + planner + directeur
-- 2) planner mag overuren beoordelen (open + beoordelen RPC)
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.zzp_overuren_open()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not (coalesce(public.is_admin_tier(),false) or exists(
      select 1 from public.bs2_role_users ru
      join public.profiles p on lower(btrim(p.email))=lower(btrim(ru.user_email))
      join public.bs2_roles r on r.id=ru.role_id
      where p.id=auth.uid() and r.slug in ('teamleider','planner')))
    then jsonb_build_object('unauthorized', true)
  else jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'regel_id', rg.id, 'factuur_id', rg.factuur_id, 'medewerker', f.medewerker_naam,
      'bureau', f.bureau, 'locatie', f.locatie, 'jaar', f.jaar, 'maand', f.maand,
      'dag', rg.dag, 'datum', rg.datum, 'start_iso', rg.start_iso, 'einde_huidig', rg.einde_iso,
      'pauze_uren', rg.pauze_uren, 'proforma_uren', rg.proforma_uren,
      'ingediend_uren', coalesce(rg.ingediend_uren, rg.proforma_uren),
      'verschil', round((coalesce(rg.ingediend_uren, rg.proforma_uren) - rg.proforma_uren)::numeric, 2),
      'tarief', coalesce(rg.ingediend_tarief, rg.proforma_tarief),
      'status', coalesce(rg.overuren_status,'aangevraagd')
    ) order by f.medewerker_naam, rg.datum)
    from public.zzp_factuur_regels rg
    join public.zzp_facturen f on f.id=rg.factuur_id
    where not rg.verwijderd
      and round(coalesce(rg.ingediend_uren,rg.proforma_uren),2) <> round(rg.proforma_uren,2)
      and f.status in ('ingediend','in_behandeling')
      and coalesce(rg.overuren_status,'aangevraagd') not in ('goedgekeurd','afgewezen')), '[]'::jsonb)) end;
$function$;

CREATE OR REPLACE FUNCTION public.zzp_overuren_beoordelen(p_regel_id uuid, p_actie text, p_reden text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_tl boolean := coalesce(public.is_admin_tier(),false) or exists (
    select 1 from public.bs2_role_users ru
    join public.profiles p on lower(btrim(p.email))=lower(btrim(ru.user_email))
    join public.bs2_roles r on r.id=ru.role_id
    where p.id=auth.uid() and r.slug in ('teamleider','planner'));
  v_naam text := (select btrim(coalesce(voornaam,'')||' '||coalesce(achternaam,'')) from public.profiles where id=auth.uid());
  v_rg public.zzp_factuur_regels%rowtype;
  v_fac public.zzp_facturen%rowtype;
  v_oud timestamptz; v_nieuw timestamptz; v_zzp_user uuid;
begin
  if not v_is_tl then return jsonb_build_object('error','alleen een zorgcoördinator, planner of directeur kan dit beoordelen'); end if;
  select * into v_rg from public.zzp_factuur_regels where id=p_regel_id;
  if not found then return jsonb_build_object('error','regel niet gevonden'); end if;
  select * into v_fac from public.zzp_facturen where id=v_rg.factuur_id;

  if p_actie='goedkeuren' then
    if v_rg.planning_dienst_id is not null then
      select einde_iso into v_oud from public.planning where id=v_rg.planning_dienst_id;
      v_nieuw := v_rg.start_iso + make_interval(secs => (coalesce(v_rg.ingediend_uren,v_rg.proforma_uren)+coalesce(v_rg.pauze_uren,0))*3600);
      -- DIEHARD: gerichte update op EXACT deze dienst; oude eindtijd bewaard in de regel (omkeerbaar)
      update public.planning set einde_iso = v_nieuw, laatst_gewijzigd=now() where id=v_rg.planning_dienst_id;
    end if;
    update public.zzp_factuur_regels set overuren_status='goedgekeurd',
      overuren_oude_einde=coalesce(v_oud, overuren_oude_einde), overuren_nieuwe_einde=v_nieuw,
      overuren_teamleider=v_naam, overuren_behandeld_op=now(), laatst_gewijzigd=now()
     where id=p_regel_id;
  elsif p_actie='afwijzen' then
    update public.zzp_factuur_regels set overuren_status='afgewezen', overuren_reden=p_reden,
      overuren_teamleider=v_naam, overuren_behandeld_op=now(),
      ingediend_uren=proforma_uren, ingediend_bedrag=round(proforma_uren*coalesce(ingediend_tarief,proforma_tarief),2),
      gewijzigd=(round(coalesce(ingediend_tarief,proforma_tarief),2) <> round(proforma_tarief,2)),
      laatst_gewijzigd=now()
     where id=p_regel_id;
    perform public.zzp_factuur_herbereken(v_rg.factuur_id);
  else
    return jsonb_build_object('error','onbekende actie');
  end if;

  select p.id into v_zzp_user from public.profiles p where p.medewerker_id = v_fac.medewerker_id limit 1;
  if v_zzp_user is not null then
    insert into public.notifications(user_id, type, title, body, related_entity_type, related_entity_id)
    values (v_zzp_user, 'zzp_overuren',
      case when p_actie='goedkeuren' then 'Uren-wijziging goedgekeurd' else 'Uren-wijziging afgewezen' end,
      case when p_actie='goedkeuren' then 'Je aangepaste uren voor '||coalesce(to_char(v_rg.datum,'DD-MM'),'?')||' zijn goedgekeurd en in de planning verwerkt.'
           else 'Je uren-wijziging voor '||coalesce(to_char(v_rg.datum,'DD-MM'),'?')||' is afgewezen: '||coalesce(p_reden,'')||'. De geplande uren blijven gelden.' end,
      'zzp_factuur', v_rg.factuur_id::text);
  end if;
  return jsonb_build_object('ok', true, 'actie', p_actie, 'oude_einde', v_oud, 'nieuwe_einde', v_nieuw);
end $function$;

CREATE OR REPLACE FUNCTION public.zzp_factuur_opslaan(p_factuur_id uuid, p_eigen_factuurnummer text DEFAULT NULL::text, p_logo_url text DEFAULT NULL::text, p_extra jsonb DEFAULT NULL::jsonb, p_regels jsonb DEFAULT NULL::jsonb, p_indienen boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fac public.zzp_facturen%rowtype;
  v_mij uuid := public.current_medewerker_id();
  v_reviewer boolean := public.zzp_factuur_is_reviewer();
  v_email text := (select email from public.profiles where id=auth.uid());
  v_naam text := (select btrim(coalesce(voornaam,'')||' '||coalesce(achternaam,'')) from public.profiles where id=auth.uid());
  r jsonb; v_uren numeric; v_tarief numeric;
begin
  select * into v_fac from public.zzp_facturen where id=p_factuur_id;
  if not found then return jsonb_build_object('error','factuur niet gevonden'); end if;
  if not (v_reviewer or v_fac.medewerker_id = v_mij) then return jsonb_build_object('error','geen toegang'); end if;
  if v_fac.status in ('goedgekeurd','klaar_voor_betaling') then
    return jsonb_build_object('error','factuur is al goedgekeurd en niet meer bewerkbaar'); end if;

  if p_regels is not null then
    for r in select value from jsonb_array_elements(p_regels) loop
      v_uren   := coalesce(nullif(r->>'ingediend_uren','')::numeric,  (select ingediend_uren   from public.zzp_factuur_regels where id=(r->>'id')::uuid));
      v_tarief := coalesce(nullif(r->>'ingediend_tarief','')::numeric,(select ingediend_tarief from public.zzp_factuur_regels where id=(r->>'id')::uuid));
      update public.zzp_factuur_regels rg set
        ingediend_uren   = v_uren,
        ingediend_tarief = v_tarief,
        ingediend_bedrag = round(coalesce(v_uren,0)*coalesce(v_tarief,0),2),
        verwijderd = coalesce((r->>'verwijderd')::boolean, rg.verwijderd),
        gewijzigd  = (round(coalesce(v_uren,0),2) <> round(rg.proforma_uren,2)
                      or round(coalesce(v_tarief,0),2) <> round(rg.proforma_tarief,2)),
        laatst_gewijzigd = now()
      where rg.id=(r->>'id')::uuid and rg.factuur_id=p_factuur_id;
    end loop;
  end if;

  update public.zzp_facturen f set
    eigen_factuurnummer = coalesce(p_eigen_factuurnummer, f.eigen_factuurnummer),
    logo_url      = coalesce(p_logo_url, f.logo_url),
    extra_gegevens= coalesce(p_extra, f.extra_gegevens),
    status        = case when p_indienen then 'ingediend' else f.status end,
    submitted_at  = case when p_indienen and f.submitted_at is null then now() else f.submitted_at end
  where f.id=p_factuur_id;

  perform public.zzp_factuur_herbereken(p_factuur_id);

  insert into public.zzp_factuur_transitions (factuur_id, status, actor_email, actor_naam, actor_type, comment)
  values (p_factuur_id, (select status from public.zzp_facturen where id=p_factuur_id), v_email, v_naam,
          case when v_fac.medewerker_id = v_mij then 'zzp' else 'controleur' end,
          case when p_indienen then 'Ingediend door ' || coalesce(v_naam,'ZZP''er') else 'Bijgewerkt' end);

  -- Fase 4: teamleider(s) notificeren bij ingediende factuur met uren-wijziging (nog niet goedgekeurd)
  if p_indienen and exists (
    select 1 from public.zzp_factuur_regels rg
    where rg.factuur_id=p_factuur_id and not rg.verwijderd
      and round(coalesce(rg.ingediend_uren,rg.proforma_uren),2) <> round(rg.proforma_uren,2)
      and coalesce(rg.overuren_status,'') <> 'goedgekeurd'
  ) then
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    select distinct p.id, 'zzp_overuren', 'Overuren te beoordelen',
      coalesce(v_fac.medewerker_naam,'Een ZZP''er') || ' heeft de uren aangepast op de factuur van ' ||
        coalesce(v_fac.locatie,'?') || '. Beoordeel de overuren: keur goed of af.',
      'zzp_factuur', p_factuur_id::text
    from public.profiles p
    join public.bs2_role_users ru on lower(btrim(p.email)) = lower(btrim(ru.user_email))
    join public.bs2_roles r on r.id = ru.role_id
    where r.slug in ('teamleider','planner','directeur');
  end if;

  return (select to_jsonb(f) from public.zzp_facturen f where f.id=p_factuur_id);
end $function$;
