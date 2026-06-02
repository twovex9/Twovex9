-- ============================================================================
-- Facturen → ZZP-maandoverzicht (read-only). Toegepast 2026-06-02.
--
-- Doel: op de pagina "Facturen te beoordelen" per WERK-MAAND tonen:
--   - Verwacht o.b.v. planning  = wat we aan ZZP'ers moeten betalen
--   - Te beoordelen / Goedgekeurd / Binnengekomen (ingediende facturen)
--   - Nog te verwachten         = verwacht - binnengekomen
-- Zo zie je per maand: "voor mei moeten we ~2 ton betalen, daarvan is X
-- binnengekomen, Y goedgekeurd, Z moet nog komen."
--
-- GEEN data-mutatie (puur SELECT). SECURITY INVOKER -> RLS van de ingelogde
-- gebruiker blijft gelden. Read-only, additief.
--
-- Koppelingen (geverifieerd 2026-06-02):
--   planning.teamlid  = medewerkers.voornaam||' '||achternaam  (63/64 match)
--   ZZP'er            = medewerkers.data->>'bs2_employment_type'='hiring'
--                       (of dienstverband ~ inhuur/zzp)        (73 ZZP'ers)
--   ZZP-uurtarief     = medewerkers.data->>'uurAlgemeen' (per persoon; 100/102),
--                       fallback 45 als leeg
--   netto-uren        = (einde_iso - start_iso)/3600 - pauze_uren
--   werk-maand plan   = maand uit planning.start_iso
--   werk-maand factuur= invoices.jaar + invoices.maand (= periode-maand, NIET
--                       de indiendatum)
--   factuur->ZZP'er   = invoices.employee->>'id' = medewerkers.data->>'bs2_id'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.facturen_zzp_dashboard(
  p_start date DEFAULT NULL,
  p_end   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
WITH plan_zzp AS (  -- ZZP-diensten uit de planning, met netto-uren + persoonlijk tarief
  SELECT to_char(p.start_iso,'YYYY-MM') AS ym,
         GREATEST(0, EXTRACT(EPOCH FROM (p.einde_iso - p.start_iso))/3600.0 - COALESCE(p.pauze_uren,0)) AS net_uren,
         COALESCE(NULLIF(m.data->>'uurAlgemeen','')::numeric, 45) AS tarief,
         btrim(p.teamlid) AS teamlid
  FROM planning p
  JOIN medewerkers m
    ON lower(btrim(m.voornaam||' '||m.achternaam)) = lower(btrim(p.teamlid))
   AND (lower(COALESCE(m.data->>'bs2_employment_type','')) = 'hiring'
        OR lower(COALESCE(m.data->>'dienstverband','')) LIKE '%inhuur%'
        OR lower(COALESCE(m.data->>'dienstverband','')) LIKE '%zzp%')
  WHERE p.start_iso IS NOT NULL AND p.einde_iso IS NOT NULL AND COALESCE(p.archived,false)=false
),
pmonth AS (
  SELECT ym, SUM(net_uren*tarief) AS verwacht, SUM(net_uren) AS uren, COUNT(*) AS diensten
  FROM plan_zzp GROUP BY ym
),
finv AS (  -- ingediende facturen per werk-maand
  SELECT (jaar||'-'||lpad(maand::text,2,'0')) AS ym, status, total
  FROM invoices
  WHERE COALESCE(gearchiveerd,false)=false AND jaar IS NOT NULL AND maand IS NOT NULL
),
fmonth AS (
  SELECT ym,
         COALESCE(SUM(total) FILTER (WHERE status='submitted'),0) AS te_beoordelen,
         COUNT(*) FILTER (WHERE status='submitted') AS te_beoordelen_cnt,
         COALESCE(SUM(total) FILTER (WHERE status='approved'),0) AS goedgekeurd,
         COUNT(*) FILTER (WHERE status='approved') AS goedgekeurd_cnt,
         COALESCE(SUM(total) FILTER (WHERE status IN ('submitted','approved','under_review')),0) AS binnengekomen,
         COUNT(*) FILTER (WHERE status IN ('submitted','approved','under_review')) AS binnengekomen_cnt,
         COALESCE(SUM(total) FILTER (WHERE status='rejected'),0) AS afgewezen,
         COUNT(*) FILTER (WHERE status='rejected') AS afgewezen_cnt
  FROM finv GROUP BY ym
),
mtab AS (  -- gecombineerde maandtabel (planning + facturen)
  SELECT COALESCE(p.ym,f.ym) AS ym,
         COALESCE(p.verwacht,0) AS verwacht, COALESCE(p.uren,0) AS uren, COALESCE(p.diensten,0) AS diensten,
         COALESCE(f.te_beoordelen,0) AS te_beoordelen, COALESCE(f.te_beoordelen_cnt,0) AS te_beoordelen_cnt,
         COALESCE(f.goedgekeurd,0) AS goedgekeurd, COALESCE(f.goedgekeurd_cnt,0) AS goedgekeurd_cnt,
         COALESCE(f.binnengekomen,0) AS binnengekomen, COALESCE(f.binnengekomen_cnt,0) AS binnengekomen_cnt,
         COALESCE(f.afgewezen,0) AS afgewezen, COALESCE(f.afgewezen_cnt,0) AS afgewezen_cnt
  FROM pmonth p FULL OUTER JOIN fmonth f ON f.ym = p.ym
),
win AS ( SELECT MIN(ym) AS min_ym, MAX(ym) AS max_ym FROM mtab ),
maxf AS ( SELECT MAX(ym) AS max_f FROM fmonth ),   -- default-selectie = laatste factuurmaand
refp AS (
  SELECT COALESCE(to_char(p_start,'YYYY-MM'), (SELECT COALESCE(max_f,(SELECT max_ym FROM win)) FROM maxf)) AS s_ym,
         COALESCE(to_char(p_end,'YYYY-MM'),   (SELECT COALESCE(max_f,(SELECT max_ym FROM win)) FROM maxf)) AS e_ym
)
SELECT jsonb_build_object(
  'period', (SELECT jsonb_build_object('start', s_ym, 'end', e_ym) FROM refp),
  'window', (SELECT jsonb_build_object('min', min_ym, 'max', max_ym) FROM win),
  'selected', (
    SELECT jsonb_build_object(
      'planning_verwacht', ROUND(COALESCE(SUM(verwacht),0)::numeric,2),
      'planning_uren',     ROUND(COALESCE(SUM(uren),0)::numeric,1),
      'planning_diensten', COALESCE(SUM(diensten),0),
      'te_beoordelen',     ROUND(COALESCE(SUM(te_beoordelen),0)::numeric,2),
      'te_beoordelen_cnt', COALESCE(SUM(te_beoordelen_cnt),0),
      'goedgekeurd',       ROUND(COALESCE(SUM(goedgekeurd),0)::numeric,2),
      'goedgekeurd_cnt',   COALESCE(SUM(goedgekeurd_cnt),0),
      'binnengekomen',     ROUND(COALESCE(SUM(binnengekomen),0)::numeric,2),
      'binnengekomen_cnt', COALESCE(SUM(binnengekomen_cnt),0),
      'afgewezen',         ROUND(COALESCE(SUM(afgewezen),0)::numeric,2),
      'afgewezen_cnt',     COALESCE(SUM(afgewezen_cnt),0),
      'nog_te_verwachten', ROUND(GREATEST(0, COALESCE(SUM(verwacht),0) - COALESCE(SUM(binnengekomen),0))::numeric,2),
      'zzpers_gepland',    (SELECT COUNT(DISTINCT teamlid) FROM plan_zzp, refp r WHERE plan_zzp.ym>=r.s_ym AND plan_zzp.ym<=r.e_ym))
    FROM mtab, refp WHERE mtab.ym>=refp.s_ym AND mtab.ym<=refp.e_ym),
  'months', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'ym', ym,
      'planning_verwacht', ROUND(verwacht::numeric,2),
      'binnengekomen', ROUND(binnengekomen::numeric,2),
      'goedgekeurd', ROUND(goedgekeurd::numeric,2),
      'te_beoordelen', ROUND(te_beoordelen::numeric,2)
    ) ORDER BY ym),'[]'::jsonb) FROM mtab)
);
$fn$;

GRANT EXECUTE ON FUNCTION public.facturen_zzp_dashboard(date,date) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- Drill-down: per ZZP'er in maand p_ym -> verwacht (planning) vs gefactureerd.
-- Toont wie nog niet (volledig) gefactureerd heeft.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.facturen_zzp_maand_detail(p_ym text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
WITH plan_zzp AS (
  SELECT btrim(p.teamlid) AS teamlid, m.data->>'bs2_id' AS bs2_id,
         GREATEST(0, EXTRACT(EPOCH FROM (p.einde_iso - p.start_iso))/3600.0 - COALESCE(p.pauze_uren,0)) AS net_uren,
         COALESCE(NULLIF(m.data->>'uurAlgemeen','')::numeric, 45) AS tarief
  FROM planning p
  JOIN medewerkers m
    ON lower(btrim(m.voornaam||' '||m.achternaam)) = lower(btrim(p.teamlid))
   AND (lower(COALESCE(m.data->>'bs2_employment_type','')) = 'hiring'
        OR lower(COALESCE(m.data->>'dienstverband','')) LIKE '%inhuur%'
        OR lower(COALESCE(m.data->>'dienstverband','')) LIKE '%zzp%')
  WHERE to_char(p.start_iso,'YYYY-MM') = p_ym
    AND p.start_iso IS NOT NULL AND p.einde_iso IS NOT NULL AND COALESCE(p.archived,false)=false
),
per_zzp AS (
  SELECT teamlid, bs2_id, ROUND(SUM(net_uren)::numeric,1) AS uren, ROUND(SUM(net_uren*tarief)::numeric,2) AS verwacht
  FROM plan_zzp GROUP BY teamlid, bs2_id
),
fac AS (
  SELECT (employee->>'id') AS emp_id, SUM(total) AS gefactureerd, string_agg(DISTINCT status, ',') AS statussen
  FROM invoices
  WHERE (jaar||'-'||lpad(maand::text,2,'0'))=p_ym AND COALESCE(gearchiveerd,false)=false
  GROUP BY 1
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'naam', z.teamlid, 'uren', z.uren, 'verwacht', z.verwacht,
  'gefactureerd', ROUND(COALESCE(f.gefactureerd,0)::numeric,2),
  'status', COALESCE(f.statussen,'')
) ORDER BY z.verwacht DESC), '[]'::jsonb)
FROM per_zzp z LEFT JOIN fac f ON f.emp_id = z.bs2_id;
$fn$;

GRANT EXECUTE ON FUNCTION public.facturen_zzp_maand_detail(text) TO anon, authenticated;
