-- ============================================================================
-- Betaaltermijn bij goedkeuren + meldingen naar de ZZP'er bij goed-/afkeuren.
-- Goedkeuren = klaar voor betaling (conventie gelijk aan zzp_bureau_accordeer).
-- ============================================================================

alter table public.zzp_facturen
  add column if not exists betaaltermijn_dagen integer,
  add column if not exists betaaldatum date;

comment on column public.zzp_facturen.betaaltermijn_dagen is 'Aantal dagen tot betaling, handmatig ingevoerd door de controleur bij goedkeuren (bijv. 40 of 60).';
comment on column public.zzp_facturen.betaaldatum is 'Verwachte betaaldatum = goedkeuringsdatum + betaaltermijn_dagen.';

create or replace function public.zzp_factuur_beoordelen(
  p_factuur_id uuid,
  p_actie text,
  p_reden text default null,
  p_betaaltermijn_dagen integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_reviewer boolean := public.zzp_factuur_is_reviewer();
  v_email text := (select email from public.profiles where id=auth.uid());
  v_naam  text := (select btrim(coalesce(voornaam,'')||' '||coalesce(achternaam,'')) from public.profiles where id=auth.uid());
  v_status text;
  v_fac public.zzp_facturen;
  v_betaaldatum date;
  v_termijn integer;
  v_maand text;
begin
  if not v_reviewer then return jsonb_build_object('error','geen rechten om te beoordelen'); end if;
  select * into v_fac from public.zzp_facturen where id=p_factuur_id;
  if not found then return jsonb_build_object('error','factuur niet gevonden'); end if;

  v_maand := (array['januari','februari','maart','april','mei','juni','juli','augustus',
                    'september','oktober','november','december'])[v_fac.maand] || ' ' || v_fac.jaar::text;

  if p_actie = 'goedkeuren' then
    v_termijn := coalesce(p_betaaltermijn_dagen, v_fac.betaaltermijn_dagen);
    if v_termijn is null or v_termijn < 0 then
      return jsonb_build_object('error','Betaaltermijn (dagen) is verplicht bij goedkeuren.');
    end if;
    v_betaaldatum := current_date + v_termijn;
    v_status := 'goedgekeurd';
    update public.zzp_facturen set
      status='goedgekeurd', approved_at=now(), rejected_at=null, afwijzing_reden=null,
      betaaltermijn_dagen=v_termijn, betaaldatum=v_betaaldatum, betaling_klaar_op=now(),
      laatst_gewijzigd=now()
    where id=p_factuur_id;
  elsif p_actie = 'afwijzen' then
    if coalesce(btrim(p_reden),'')='' then
      return jsonb_build_object('error','Reden is verplicht bij afwijzen.'); end if;
    v_status := 'afgewezen';
    update public.zzp_facturen set
      status='afgewezen', rejected_at=now(), afwijzing_reden=p_reden,
      betaaltermijn_dagen=null, betaaldatum=null, betaling_klaar_op=null,
      laatst_gewijzigd=now()
    where id=p_factuur_id;
  else
    return jsonb_build_object('error','onbekende actie');
  end if;

  insert into public.zzp_factuur_transitions(factuur_id, status, actor_email, actor_naam, actor_type, comment)
  values (p_factuur_id, v_status, v_email, v_naam, 'controleur',
          case when p_actie='afwijzen' then 'Afgewezen: '||p_reden
               else 'Goedgekeurd — betaaltermijn '||v_termijn||' dagen, betaling op '||to_char(v_betaaldatum,'DD-MM-YYYY') end);

  -- Melding naar de ZZP'er (eigenaar van de factuur).
  if p_actie='goedkeuren' then
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    select pr.id, 'zzp_factuur', 'Factuur goedgekeurd',
      'Je factuur voor '||coalesce(v_fac.locatie,'?')||' ('||v_maand||') is goedgekeurd en staat klaar voor betaling op '
        ||to_char(v_betaaldatum,'DD-MM-YYYY')||' (over '||v_termijn||' dagen).',
      'zzp_factuur', p_factuur_id::text
    from public.profiles pr where pr.medewerker_id = v_fac.medewerker_id;
  else
    insert into public.notifications (user_id, type, title, body, related_entity_type, related_entity_id)
    select pr.id, 'zzp_factuur', 'Factuur afgewezen',
      'Je factuur voor '||coalesce(v_fac.locatie,'?')||' ('||v_maand||') is afgewezen: '||p_reden
        ||'. Pas de factuur aan en dien hem opnieuw in.',
      'zzp_factuur', p_factuur_id::text
    from public.profiles pr where pr.medewerker_id = v_fac.medewerker_id;
  end if;

  return jsonb_build_object('ok', true, 'status', v_status,
    'betaaldatum', v_betaaldatum, 'betaaltermijn_dagen', v_termijn);
end $fn$;
