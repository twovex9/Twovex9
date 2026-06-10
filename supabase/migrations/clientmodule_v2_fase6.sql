-- ============================================================
-- Cliëntmodule 2.0 — FASE 6: uitstroom + nazorg + audittrail
-- 1. clienten + uitstroom/nazorg-velden (in data.uitstroom + nazorg)
-- 2. RPC's: client_uitstroom_starten + client_nazorg_afsluiten
-- 3. client_audit_trail-RPC voor de Geschiedenis-tab (audit_log + tijdlijn)
-- ============================================================

-- Statussen 'uitstroom_gepland','uitgestroomd','nazorg','dossier_gesloten'
-- bestaan al in de reis_status-check-constraint (fase 1). Hier dus alleen
-- transitie-RPC's met allowlist-handhaving en tijdlijn-logging.

create or replace function public.client_uitstroom_starten(
  p_client_id text,
  p_reden text,
  p_vervolgplek text default null,
  p_uitstroom_datum date default null,
  p_eindrapportage_id uuid default null,
  p_nazorg_afspraken text default null
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v record; v_data jsonb;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om uitstroom te starten';
  end if;
  select * into v from public.clienten where id = p_client_id;
  if not found then raise exception 'Cliënt niet gevonden'; end if;
  if v.reis_status not in ('actief','tijdelijk_gepauzeerd','uitstroom_gepland') then
    raise exception 'Uitstroom kan alleen vanuit actief/gepauzeerd (status nu: %)', v.reis_status;
  end if;
  v_data := coalesce(v.data, '{}'::jsonb) || jsonb_build_object('uitstroom', jsonb_build_object(
    'reden', p_reden,
    'vervolgplek', p_vervolgplek,
    'datum', coalesce(p_uitstroom_datum, current_date),
    'eindrapportage_id', p_eindrapportage_id,
    'nazorg_afspraken', p_nazorg_afspraken,
    'door', auth.uid()::text,
    'op', now()::text
  ));
  v_data := v_data || jsonb_build_object('uitZorgDatum', to_char(coalesce(p_uitstroom_datum, current_date), 'YYYY-MM-DD'));
  update public.clienten set
    reis_status = 'uitgestroomd',
    data = v_data,
    laatst_gewijzigd = now()
  where id = p_client_id;
  perform public.client_tijdlijn_log(p_client_id, 'uitstroom',
    'Cliënt uitgestroomd',
    'Reden: ' || coalesce(p_reden,'(niet opgegeven)') ||
      case when p_vervolgplek is not null then ' — vervolgplek: ' || p_vervolgplek else '' end,
    'clienten', p_client_id);
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.client_uitstroom_starten(text,text,text,date,uuid,text) from public, anon;
grant execute on function public.client_uitstroom_starten(text,text,text,date,uuid,text) to authenticated;

create or replace function public.client_nazorg_starten(p_client_id text, p_afspraken text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v record; v_data jsonb;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om nazorg te starten';
  end if;
  select * into v from public.clienten where id = p_client_id;
  if not found then raise exception 'Cliënt niet gevonden'; end if;
  if v.reis_status not in ('uitgestroomd','nazorg') then
    raise exception 'Nazorg kan alleen na uitstroom (status nu: %)', v.reis_status;
  end if;
  v_data := coalesce(v.data, '{}'::jsonb) || jsonb_build_object('nazorg', jsonb_build_object(
    'afspraken', p_afspraken, 'gestart_op', now()::text, 'door', auth.uid()::text
  ));
  update public.clienten set reis_status='nazorg', data=v_data, laatst_gewijzigd=now() where id = p_client_id;
  perform public.client_tijdlijn_log(p_client_id, 'nazorg', 'Nazorgtraject gestart',
    coalesce(p_afspraken, null), 'clienten', p_client_id);
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.client_nazorg_starten(text,text) from public, anon;
grant execute on function public.client_nazorg_starten(text,text) to authenticated;

create or replace function public.client_dossier_sluiten(p_client_id text, p_reden text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare v record;
begin
  if not public.clientreis_kan_beoordelen() then
    raise exception 'Geen rechten om het dossier te sluiten';
  end if;
  select * into v from public.clienten where id = p_client_id;
  if not found then raise exception 'Cliënt niet gevonden'; end if;
  if v.reis_status not in ('uitgestroomd','nazorg') then
    raise exception 'Dossier sluiten kan alleen na uitstroom/nazorg (status nu: %)', v.reis_status;
  end if;
  update public.clienten set reis_status='dossier_gesloten', laatst_gewijzigd=now() where id = p_client_id;
  perform public.client_tijdlijn_log(p_client_id, 'dossier_gesloten', 'Dossier gesloten',
    coalesce(p_reden, null), 'clienten', p_client_id);
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.client_dossier_sluiten(text,text) from public, anon;
grant execute on function public.client_dossier_sluiten(text,text) to authenticated;

-- Audittrail-RPC: combineer audit_log + tijdlijn voor de Geschiedenis-tab
create or replace function public.client_audit_trail(p_client_id text, p_limit int default 200)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare v jsonb;
begin
  if not public.client_zorg_toegang(p_client_id) then
    return jsonb_build_object('ok', false, 'fout', 'geen_toegang');
  end if;
  select coalesce(jsonb_agg(row_to_json(t) order by ts desc), '[]'::jsonb) into v
   from (
    -- audit_log voor deze cliënt + alle entities die op deze cliënt slaan
    select 'audit' as bron, aanmaakdatum as ts, gebruiker_label, tabel, actie, oude_waarden, nieuwe_waarden
      from public.audit_log
     where (tabel = 'clienten' and record_id::text = p_client_id)
        or (tabel = 'beschikkingen' and record_id::text in (select id::text from public.beschikkingen where client_id = p_client_id or client_id = (select c.data->>'bs2_id' from public.clienten c where c.id = p_client_id)))
        or (tabel = 'client_rapportages' and record_id::text in (select id::text from public.client_rapportages where client_id = p_client_id))
        or (tabel = 'zorgplannen' and record_id::text in (select id::text from public.zorgplannen where client_id = p_client_id))
        or (tabel = 'signaleringsplannen' and record_id::text in (select id::text from public.signaleringsplannen where client_id = p_client_id))
     order by aanmaakdatum desc limit p_limit
   ) t;
  return jsonb_build_object('ok', true, 'audit', v,
    'tijdlijn', (select coalesce(jsonb_agg(row_to_json(x) order by created_at desc), '[]'::jsonb)
                   from public.client_tijdlijn x where client_id = p_client_id
                   order by created_at desc limit p_limit));
end; $$;
revoke all on function public.client_audit_trail(text,int) from public, anon;
grant execute on function public.client_audit_trail(text,int) to authenticated;
