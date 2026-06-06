-- ============================================================
-- Beveilig SECURITY DEFINER / open RPC's met server-side rolcheck + REVOKE anon.
-- ADDITIEF: geen data gewijzigd, alleen WIE de functie mag aanroepen.
-- DSR-RPC's lieten elke ingelogde user (zelfs anon) PII wissen/exfiltreren -> nu admin-tier.
-- bulk_archive_* -> alleen kantoor. search_path gepind (advisor function_search_path_mutable).
-- Legitiem pad blijft werken: dsr-flow.js gate't al op isAdminTier(); bulk-actions.js op kantoor-overzichten.
-- Toegepast op productie via Supabase MCP apply_migration (2026-06-06). Dit bestand = mirror voor version control.
-- ============================================================

-- 1) anonymize_client: alleen admin-tier (GDPR Art.17 anonimisatie)
create or replace function public.anonymize_client(p_client_id text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare
  anon_token text;
  client_naam text;
  actor uuid;
begin
  actor := auth.uid();
  if not public.is_admin_tier() then
    raise exception 'Geen rechten: anonimiseren van cliëntgegevens vereist beheerdersrechten'
      using errcode = '42501';
  end if;
  select trim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,''))
    into client_naam from public.clienten where id = p_client_id;
  if client_naam is null then
    raise exception 'Cliënt niet gevonden: %', p_client_id;
  end if;
  anon_token := 'ANON_' || replace(gen_random_uuid()::text, '-', '');
  update public.clienten
  set voornaam = anon_token, achternaam = '',
      data = coalesce(data,'{}'::jsonb) || jsonb_build_object(
        'anonymized_at', now()::text, 'anonymized_by', actor::text,
        'anon_token', anon_token, 'gdpr_art_17', true,
        'bsn', null, 'geboortedatum', null, 'email', null, 'telefoon', null,
        'adres', null, 'postcode', null, 'plaats', null,
        'orig_voornaam_redacted', true, 'orig_achternaam_redacted', true)
  where id = p_client_id;
  insert into public.audit_log (resource, resource_id, actie, gebruiker_id, gebruiker_label, details, status, aanmaakdatum)
  values ('Cliënt', p_client_id, 'verwijderen', actor, 'DSR-anonymize',
          'GDPR Art. 17 anonimisatie van "' || client_naam || '" -> ' || anon_token, 'succes', now());
  return jsonb_build_object('success', true, 'client_id', p_client_id, 'anon_token', anon_token, 'anonymized_at', now());
end;
$function$;

-- 2) export_client_data: alleen admin-tier (GDPR Art.20 dossier-export)
create or replace function public.export_client_data(p_client_id text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $function$
declare
  result jsonb;
  actor uuid;
begin
  actor := auth.uid();
  if not public.is_admin_tier() then
    raise exception 'Geen rechten: cliënt-dossier exporteren vereist beheerdersrechten'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.clienten where id = p_client_id) then
    raise exception 'Cliënt niet gevonden: %', p_client_id;
  end if;
  select jsonb_build_object(
    'export_metadata', jsonb_build_object('exported_at', now(), 'exported_by', actor,
      'gdpr_article','Art. 20 — Recht op gegevensoverdraagbaarheid','machine_readable', true),
    'client', (select to_jsonb(c) from public.clienten c where c.id = p_client_id),
    'beschikkingen', (select coalesce(jsonb_agg(to_jsonb(b)),'[]'::jsonb) from public.beschikkingen b where b.client_id = p_client_id),
    'incidenten', (select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from public.incidenten i where i.client_id = p_client_id),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('id',cd.id,'naam',cd.naam,'file_name',cd.file_name,'storage_path',cd.storage_path)),'[]'::jsonb) from public.client_documents cd where cd.client_id = p_client_id),
    'facturen', (select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) from public.facturen f where f.client_id = p_client_id),
    'audit_log', (select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from public.audit_log a where a.resource='Cliënt' and a.resource_id = p_client_id)
  ) into result;
  insert into public.audit_log (resource, resource_id, actie, gebruiker_id, gebruiker_label, details, status, aanmaakdatum)
  values ('Cliënt', p_client_id, 'bekijken', actor, 'DSR-export', 'GDPR Art. 20 data-export (admin)', 'succes', now());
  return result;
end;
$function$;

-- 3) bulk_archive_clienten: alleen kantoor
create or replace function public.bulk_archive_clienten(p_ids text[], p_archived boolean default true)
returns jsonb language plpgsql
set search_path = pg_catalog, public
as $function$
declare affected_count integer; actor uuid; action_label text;
begin
  actor := auth.uid();
  if not public.is_office_staff() then
    raise exception 'Geen rechten: bulk archiveren vereist kantoor-rechten' using errcode = '42501';
  end if;
  action_label := case when p_archived then 'archiveren' else 'herstellen' end;
  update public.clienten set archived = p_archived, laatst_gewijzigd = now() where id = any(p_ids);
  get diagnostics affected_count = row_count;
  insert into public.audit_log (resource, resource_id, actie, gebruiker_id, gebruiker_label, details, status, aanmaakdatum)
  values ('Cliënt', 'BULK:' || array_length(p_ids,1)::text,
          case when p_archived then 'archiveren' else 'herstellen' end, actor, 'bulk-actie',
          'Bulk ' || action_label || ' van ' || affected_count || ' cliënten', 'succes', now());
  return jsonb_build_object('success', true, 'affected', affected_count, 'action', action_label);
end;
$function$;

-- 4) bulk_archive_medewerkers: alleen kantoor
create or replace function public.bulk_archive_medewerkers(p_ids uuid[], p_archived boolean default true)
returns jsonb language plpgsql
set search_path = pg_catalog, public
as $function$
declare affected_count integer; actor uuid; action_label text;
begin
  actor := auth.uid();
  if not public.is_office_staff() then
    raise exception 'Geen rechten: bulk archiveren vereist kantoor-rechten' using errcode = '42501';
  end if;
  action_label := case when p_archived then 'archiveren' else 'herstellen' end;
  update public.medewerkers set archived = p_archived, laatst_gewijzigd = now() where id = any(p_ids);
  get diagnostics affected_count = row_count;
  insert into public.audit_log (resource, resource_id, actie, gebruiker_id, gebruiker_label, details, status, aanmaakdatum)
  values ('Medewerker', 'BULK:' || array_length(p_ids,1)::text,
          case when p_archived then 'archiveren' else 'herstellen' end, actor, 'bulk-actie',
          'Bulk ' || action_label || ' van ' || affected_count || ' medewerkers', 'succes', now());
  return jsonb_build_object('success', true, 'affected', affected_count, 'action', action_label);
end;
$function$;

-- 5) REVOKE anon (niet-ingelogd mag deze nooit)
revoke execute on function public.anonymize_client(text) from anon;
revoke execute on function public.export_client_data(text) from anon;
revoke execute on function public.bulk_archive_clienten(text[], boolean) from anon;
revoke execute on function public.bulk_archive_medewerkers(uuid[], boolean) from anon;
