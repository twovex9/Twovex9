-- ============================================================================
-- Opmerking / vraag van de ZZP'er aan de financiële afdeling (los van afkeuren).
-- Werkt op elke status (ook vragen over de planning/diensten). Thread = transitions
-- met data->>'soort' = 'opmerking'. Reviewer kan in dezelfde thread terugreageren.
-- ============================================================================
create or replace function public.zzp_factuur_opmerking(p_factuur_id uuid, p_tekst text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_mij uuid := public.current_medewerker_id();
  v_reviewer boolean := public.zzp_factuur_is_reviewer();
  v_email text := (select email from public.profiles where id=auth.uid());
  v_naam  text := (select btrim(coalesce(voornaam,'')||' '||coalesce(achternaam,'')) from public.profiles where id=auth.uid());
  v_fac public.zzp_facturen;
  v_is_eigenaar boolean;
  v_actor text;
  v_maand text;
begin
  if coalesce(btrim(p_tekst),'') = '' then
    return jsonb_build_object('error','Opmerking mag niet leeg zijn.');
  end if;
  select * into v_fac from public.zzp_facturen where id=p_factuur_id;
  if not found then return jsonb_build_object('error','factuur niet gevonden'); end if;

  v_is_eigenaar := (v_fac.medewerker_id is not null and v_fac.medewerker_id = v_mij);
  if not (v_is_eigenaar or v_reviewer) then
    return jsonb_build_object('error','geen toegang'); end if;
  v_actor := case when v_is_eigenaar and not v_reviewer then 'zzp' else 'controleur' end;

  v_maand := (array['januari','februari','maart','april','mei','juni','juli','augustus',
                    'september','oktober','november','december'])[v_fac.maand] || ' ' || v_fac.jaar::text;

  insert into public.zzp_factuur_transitions(factuur_id, status, actor_email, actor_naam, actor_type, comment, data)
  values (p_factuur_id, v_fac.status, v_email, v_naam, v_actor, p_tekst,
          jsonb_build_object('soort','opmerking'));

  if v_actor = 'zzp' then
    -- ZZP'er stelt een vraag → financiële afdeling / reviewers
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    select distinct pr.id, 'zzp_factuur', 'Opmerking bij factuur',
      coalesce(v_fac.medewerker_naam,'Een ZZP''er')||' plaatste een opmerking bij de factuur voor '
        ||coalesce(v_fac.locatie,'?')||' ('||v_maand||'): '||p_tekst,
      'zzp_factuur', p_factuur_id::text
    from public.profiles pr
    join public.bs2_role_users ru on lower(btrim(pr.email)) = lower(btrim(ru.user_email))
    join public.bs2_roles r on r.id = ru.role_id
    where r.slug in ('finance','salarisadministratie','eigenaar','directeur','admin');
  else
    -- Reviewer reageert → terug naar de ZZP'er
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    select pr.id, 'zzp_factuur', 'Reactie op je factuur',
      'De financiële afdeling reageerde op je factuur voor '||coalesce(v_fac.locatie,'?')||' ('||v_maand||'): '||p_tekst,
      'zzp_factuur', p_factuur_id::text
    from public.profiles pr where pr.medewerker_id = v_fac.medewerker_id;
  end if;

  return jsonb_build_object('ok', true, 'actor_type', v_actor);
end $fn$;
