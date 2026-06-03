-- AI-planning: planner/HR voert namens een medewerker beschikbaarheid in (met optionele tijden).
-- De mobiele ZZP-invoer schrijft rechtstreeks naar dezelfde tabel (eigen rij via RLS);
-- deze SECURITY DEFINER RPC is het office-pad (één code-pad, één tabel).
create or replace function public.beschikbaarheid_zet(
  p_medewerker_id uuid,
  p_datum date,
  p_status text,
  p_begin time without time zone default null,
  p_eind time without time zone default null
) returns jsonb
language plpgsql security definer set search_path to 'pg_catalog','public'
as $func$
declare
  v_actor uuid := auth.uid();
  v_is_planner boolean;
  v_uid uuid;
begin
  if v_actor is null then raise exception 'Niet ingelogd'; end if;
  select (exists(
    select 1 from public.profiles p
    join public.bs2_role_users ru on lower(ru.user_email)=lower(p.email)
    join public.bs2_roles r on r.id=ru.role_id
    where p.id=v_actor and r.slug in ('planner','teamleider','hr','eigenaar','admin','directeur')
  ) or public.is_admin_tier()) into v_is_planner;
  if not v_is_planner then raise exception 'Alleen planners/HR mogen beschikbaarheid invoeren'; end if;
  if p_status not in ('beschikbaar','niet_beschikbaar') then raise exception 'Ongeldige status'; end if;

  select id into v_uid from public.profiles where medewerker_id=p_medewerker_id limit 1;
  if v_uid is null then raise exception 'Geen account/profiel gekoppeld aan deze medewerker'; end if;

  insert into public.medewerker_beschikbaarheid (user_id, medewerker_id, datum, status, begin_tijd, eind_tijd, laatst_gewijzigd)
  values (v_uid, p_medewerker_id, p_datum, p_status,
          case when p_status='beschikbaar' then p_begin else null end,
          case when p_status='beschikbaar' then p_eind else null end,
          now())
  on conflict (user_id, datum) do update
    set status=excluded.status, medewerker_id=excluded.medewerker_id,
        begin_tijd=excluded.begin_tijd, eind_tijd=excluded.eind_tijd, laatst_gewijzigd=now();

  return jsonb_build_object('success', true);
end;
$func$;
revoke execute on function public.beschikbaarheid_zet(uuid,date,text,time,time) from public;
grant execute on function public.beschikbaarheid_zet(uuid,date,text,time,time) to authenticated;
