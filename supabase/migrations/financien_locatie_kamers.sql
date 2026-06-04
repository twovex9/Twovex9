-- Financiën › Locaties — kamers/capaciteit + jongere↔locatie-koppeling.
-- Toegepast via Supabase MCP (apply_migration: financien_locatie_kamers_bezetting).
--
-- DIEHARD-veilig: additieve kolom (geen data-verlies); alle mutaties lopen via
-- SECURITY DEFINER RPC's met can_view_financien()-gate (strikt Eigenaar/Directeur/
-- Finance), gericht per id/naam, geauditeerd door bestaande triggers
-- (trg_audit_clienten_log, trg_locaties_set_modified / trg_clienten_set_modified).
--
-- Bezetting hergebruikt de bestaande, canonieke clienten.locatie-kolom — GEEN
-- parallel koppel-systeem. "Vrij" = aantal_kamers − aantal in-zorg cliënten.

-- 1. Capaciteit per locatie (aantal kamers/plekken). Nullable = nog niet ingevuld.
alter table public.locaties add column if not exists aantal_kamers integer;

comment on column public.locaties.aantal_kamers is
  'Capaciteit: aantal kamers/woonplekken op deze locatie. NULL = onbekend. Bezetting = in-zorg cliënten met clienten.locatie = naam.';

-- 2. Kamers/capaciteit instellen (strikt Eigenaar/Directeur/Finance).
create or replace function public.financien_zet_locatie_kamers(p_locatie text, p_kamers integer)
returns jsonb
language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_n integer;
begin
  if not public.can_view_financien() then
    return jsonb_build_object('unauthorized', true);
  end if;
  if p_locatie is null or btrim(p_locatie) = '' then
    return jsonb_build_object('ok', false, 'error', 'Geen locatie opgegeven.');
  end if;
  if p_kamers is not null and p_kamers < 0 then
    return jsonb_build_object('ok', false, 'error', 'Aantal kamers mag niet negatief zijn.');
  end if;
  -- Gerichte update op alle (niet-gearchiveerde) master-rijen met deze naam.
  update public.locaties set aantal_kamers = p_kamers
   where naam = p_locatie and not archived;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'locatie', p_locatie, 'aantal_kamers', p_kamers, 'rijen', v_n);
end;
$$;

-- 3. Een (in-zorg) cliënt aan een locatie koppelen / verplaatsen / ontkoppelen.
--    Gericht per cliënt-id; p_locatie leeg = ontkoppelen (locatie → NULL).
--    Wijzigt de bestaande clienten.locatie-kolom (één code-pad) — geauditeerd.
create or replace function public.financien_koppel_client_locatie(p_client_id text, p_locatie text)
returns jsonb
language plpgsql volatile security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v_loc text := nullif(btrim(coalesce(p_locatie,'')), '');
  v_n integer;
begin
  if not public.can_view_financien() then
    return jsonb_build_object('unauthorized', true);
  end if;
  if p_client_id is null or btrim(p_client_id) = '' then
    return jsonb_build_object('ok', false, 'error', 'Geen cliënt opgegeven.');
  end if;
  -- Bij koppelen/verplaatsen moet de doel-locatie een bestaande master-locatie zijn
  -- (typefouten voorkomen). Leeg = ontkoppelen is toegestaan.
  if v_loc is not null and not exists (
    select 1 from public.locaties l where l.naam = v_loc and not l.archived
  ) then
    return jsonb_build_object('ok', false, 'error', 'Onbekende locatie: ' || v_loc);
  end if;
  update public.clienten set locatie = v_loc where id = p_client_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0, 'client_id', p_client_id, 'locatie', v_loc);
end;
$$;

-- 4. Koppelbare cliënten: alle in-zorg, niet-gearchiveerde cliënten met hun
--    huidige locatie (voor de keuzelijst in de koppel-modal).
create or replace function public.financien_koppelbare_clienten()
returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public'
as $$
declare
  v jsonb;
begin
  if not public.can_view_financien() then
    return jsonb_build_object('unauthorized', true);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'naam', trim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')),
           'clientnummer', clientnummer,
           'locatie', nullif(btrim(coalesce(locatie,'')), '')
         ) order by lower(trim(coalesce(voornaam,'') || ' ' || coalesce(achternaam,'')))), '[]'::jsonb)
    into v
  from public.clienten
  where not archived and lower(btrim(coalesce(fase,''))) = 'in zorg';
  return jsonb_build_object('clienten', v);
end;
$$;

grant execute on function public.financien_zet_locatie_kamers(text,integer) to authenticated;
grant execute on function public.financien_koppel_client_locatie(text,text) to authenticated;
grant execute on function public.financien_koppelbare_clienten() to authenticated;
