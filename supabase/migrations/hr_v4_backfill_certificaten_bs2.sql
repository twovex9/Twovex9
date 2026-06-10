-- ============================================================================
-- HR Module v4 — Backfill medewerker_opleidingen uit bs2_certifications
-- ============================================================================
-- Vult de opleidingen-koppeltabel met de ECHTE certificaat-data die de BS2-import
-- al meebracht (data->'bs2_certifications': name / is_skj / date_of_issue / id).
-- Maakt de Opleidingen-tab + recertificering-sectie gevuld met echte diploma's.
-- SKJ-PUNTEN zitten NIET in BS2 (alleen een ja/nee-vlag) → skj_punten blijft null;
-- die + vervaldatums vult HR later handmatig in.
--
-- Idempotent: elke rij krijgt data.bron='bs2_certifications' + data.bs2_cert_id;
-- her-draaien voegt niets dubbel toe (NOT EXISTS-guard). Puur additief, geen delete.
-- ============================================================================

insert into public.medewerker_opleidingen
  (medewerker_id, opleiding_naam, categorie, status, behaaldatum, skj_punten, data, archived)
select
  m.id,
  nullif(trim(c->>'name'), ''),
  case when (c->>'is_skj')::boolean then 'SKJ-registratie' else 'Diploma/certificaat' end,
  'Behaald',
  case when c->>'date_of_issue' ~ '^\d{4}-\d{2}-\d{2}$' then (c->>'date_of_issue')::date else null end,
  null,
  jsonb_build_object('bron', 'bs2_certifications', 'bs2_cert_id', c->>'id', 'is_skj', coalesce((c->>'is_skj')::boolean, false)),
  false
from public.medewerkers m
cross join lateral jsonb_array_elements(m.data->'bs2_certifications') as c
where coalesce(m.archived, false) = false
  and jsonb_typeof(m.data->'bs2_certifications') = 'array'
  and nullif(trim(c->>'name'), '') is not null
  and not exists (
    select 1 from public.medewerker_opleidingen mo
    where mo.medewerker_id = m.id
      and mo.data->>'bs2_cert_id' = c->>'id'
  );

select
  count(*) as totaal_opleidingen,
  count(*) filter (where categorie = 'SKJ-registratie') as skj_registraties,
  count(distinct medewerker_id) as medewerkers_met_opleiding
from public.medewerker_opleidingen
where data->>'bron' = 'bs2_certifications';
