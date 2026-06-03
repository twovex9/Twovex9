-- AI-planning: uitnodigen i.p.v. direct toewijzen voor losse ZZP'ers.
-- Twee SECURITY DEFINER RPC's: planner nodigt uit (+ in-app melding naar ZZP),
-- ZZP accepteert ('toegewezen' → teamlid gezet) of weigert ('geweigerd' → planners gemeld).

create or replace function public.dienst_uitnodiging_sturen(
  p_dienst_id text,
  p_medewerker_id uuid,
  p_notitie text default null
) returns jsonb
language plpgsql security definer set search_path to 'pg_catalog','public'
as $func$
declare
  v_actor uuid := auth.uid();
  v_is_planner boolean;
  v_dienst record;
  v_mw_naam text;
  v_planner_naam text;
  v_zzp_uid uuid;
  v_label text;
  v_datum text;
begin
  if v_actor is null then raise exception 'Niet ingelogd'; end if;

  select (exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email)=lower(p.email)
    join public.bs2_roles r on r.id=ru.role_id
    where p.id=v_actor and r.slug in ('planner','teamleider','hr','eigenaar','admin','directeur')
  ) or public.is_admin_tier()) into v_is_planner;
  if not v_is_planner then raise exception 'Alleen planners/HR mogen uitnodigingen sturen'; end if;

  select id, diensttype, locatie, start_iso, teamlid into v_dienst from public.planning where id=p_dienst_id;
  if v_dienst.id is null then raise exception 'Dienst niet gevonden'; end if;

  select btrim(coalesce(voornaam,'')||' '||coalesce(achternaam,'')) into v_mw_naam
    from public.medewerkers where id=p_medewerker_id;
  if coalesce(v_mw_naam,'')='' then raise exception 'Medewerker niet gevonden'; end if;

  insert into public.dienst_uitnodigingen (dienst_id, medewerker_id, status, uitgenodigd_door, notitie)
  values (p_dienst_id, p_medewerker_id, 'uitgenodigd', v_actor, p_notitie)
  on conflict (dienst_id, medewerker_id) do update
    set status='uitgenodigd', uitgenodigd_door=v_actor,
        notitie=coalesce(excluded.notitie, public.dienst_uitnodigingen.notitie);

  select btrim(coalesce(voornaam,'')||' '||coalesce(achternaam,'')) into v_planner_naam
    from public.profiles where id=v_actor;
  select id into v_zzp_uid from public.profiles
    where medewerker_id=p_medewerker_id and coalesce(archived,false)=false limit 1;

  v_label := coalesce(nullif(v_dienst.diensttype,''),'Dienst')
    || case when coalesce(v_dienst.locatie,'')<>'' then ' ('||v_dienst.locatie||')' else '' end;
  v_datum := to_char((v_dienst.start_iso at time zone 'Europe/Amsterdam'),'DD-MM-YYYY');

  if v_zzp_uid is not null then
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    values (v_zzp_uid, 'dienst_uitnodiging', 'Uitnodiging voor een dienst',
      coalesce(nullif(v_planner_naam,''),'De planner')||' nodigt je uit voor '||v_label||' op '||v_datum
        ||'. Accepteer of weiger bij Mijn uitnodigingen.',
      'planning', p_dienst_id);
  end if;

  return jsonb_build_object('success', true, 'medewerker_naam', v_mw_naam, 'genotificeerd', v_zzp_uid is not null);
end;
$func$;
revoke execute on function public.dienst_uitnodiging_sturen(text,uuid,text) from public;
grant execute on function public.dienst_uitnodiging_sturen(text,uuid,text) to authenticated;

create or replace function public.dienst_uitnodiging_antwoord(
  p_dienst_id text,
  p_antwoord text
) returns jsonb
language plpgsql security definer set search_path to 'pg_catalog','public'
as $func$
declare
  v_actor uuid := auth.uid();
  v_mw_id uuid;
  v_mw_naam text;
  v_dienst record;
  v_label text;
  v_datum text;
  v_already_taken boolean := false;
  v_rows int;
begin
  if v_actor is null then raise exception 'Niet ingelogd'; end if;
  if p_antwoord not in ('toegewezen','geweigerd') then raise exception 'Ongeldig antwoord'; end if;

  select medewerker_id into v_mw_id from public.profiles where id=v_actor;
  if v_mw_id is null then raise exception 'Geen medewerker gekoppeld aan je account'; end if;

  update public.dienst_uitnodigingen
    set status=p_antwoord
    where dienst_id=p_dienst_id and medewerker_id=v_mw_id and status='uitgenodigd';
  get diagnostics v_rows = row_count;
  if v_rows=0 then raise exception 'Geen openstaande uitnodiging gevonden'; end if;

  select id, diensttype, locatie, start_iso, teamlid into v_dienst from public.planning where id=p_dienst_id;
  select btrim(coalesce(voornaam,'')||' '||coalesce(achternaam,'')) into v_mw_naam
    from public.medewerkers where id=v_mw_id;
  v_label := coalesce(nullif(v_dienst.diensttype,''),'Dienst')
    || case when coalesce(v_dienst.locatie,'')<>'' then ' ('||v_dienst.locatie||')' else '' end;
  v_datum := to_char((v_dienst.start_iso at time zone 'Europe/Amsterdam'),'DD-MM-YYYY');

  if p_antwoord='toegewezen' then
    if coalesce(btrim(v_dienst.teamlid),'')='' then
      update public.planning set teamlid=v_mw_naam, open_voor_aanmelding=false where id=p_dienst_id;
    else
      v_already_taken := true;
    end if;
  end if;

  insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
  select distinct pr.id,
    case when p_antwoord='toegewezen' then 'dienst_uitnodiging_geaccepteerd' else 'dienst_uitnodiging_geweigerd' end,
    case when p_antwoord='toegewezen' then 'Uitnodiging geaccepteerd' else 'Uitnodiging geweigerd' end,
    v_mw_naam || case when p_antwoord='toegewezen'
      then ' heeft de dienst '||v_label||' op '||v_datum||' geaccepteerd.'
        || case when v_already_taken then ' (let op: dienst was al bezet door iemand anders)' else '' end
      else ' heeft de uitnodiging voor '||v_label||' op '||v_datum||' geweigerd.' end,
    'planning', p_dienst_id
  from public.profiles pr
  join public.bs2_role_users ru on lower(ru.user_email)=lower(pr.email)
  join public.bs2_roles r on r.id=ru.role_id
  where r.slug in ('planner','teamleider','hr','eigenaar','admin','directeur')
    and coalesce(pr.archived,false)=false
    and pr.id is distinct from v_actor;

  return jsonb_build_object('success', true, 'antwoord', p_antwoord, 'already_taken', v_already_taken);
end;
$func$;
revoke execute on function public.dienst_uitnodiging_antwoord(text,text) from public;
grant execute on function public.dienst_uitnodiging_antwoord(text,text) to authenticated;
