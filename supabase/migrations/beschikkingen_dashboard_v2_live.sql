-- ============================================================================
-- Beschikkingen-dashboard v2 — LIVE aggregatie (read-only).
-- Toegepast 2026-06-02.
--
-- Vervangt de oude BS2-momentopname-cijfers (bs2_dashboard_snapshot +
-- urendeclaraties-achterstand) door LIVE berekeningen op de eigen tabellen,
-- zodat het dashboard de werkelijkheid toont. GEEN data-mutatie (puur SELECT);
-- SECURITY INVOKER → RLS van de ingelogde gebruiker blijft gelden.
--
-- Bron-koppelingen (geverifieerd 2026-06-02):
--   facturen.id                = bs2_disposition_payments.id        (956/956)
--   bs2_disposition_payments.disposition_id = beschikkingen.id       (956/956)
--   beschikkingen.client_id    = clienten.data->>'bs2_id'            (134/151)
--   factuur-maand = maand uit START van periode "DD-MM-YYYY t/m ..."
--
-- Kleurmodel per maand:
--   GROEN  = betaald            (facturen.status = 'betaald')
--   ORANJE = gedeclareerd, nog niet betaald (facturen.status <> 'betaald')
--   ROOD   = nog te declareren  (lopende beschikking met factuurhistorie maar
--            GEEN factuur in die maand; bedrag geschat = gemiddeld maandbedrag
--            uit de eigen factuurhistorie van die beschikking)
--
-- Actieve beschikking = cliënt 'In zorg' (via bs2_id) EN niet verlopen
--                       (eind_iso >= vandaag) EN fase <> 'In aanvraag'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.beschikkingen_dashboard_v2(
  p_start date DEFAULT NULL,
  p_end   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
WITH fb AS (  -- één regel per factuur, met maand-key + beschikking
  SELECT p.disposition_id AS bid,
         (substr(f.periode,7,4) || '-' || substr(f.periode,4,2)) AS ym,
         f.status, f.bedrag
  FROM facturen f
  JOIN bs2_disposition_payments p ON p.id = f.id
  WHERE NOT f.gearchiveerd AND f.periode ~ '^\d{2}-\d{2}-\d{4}'
),
fmonth AS (  -- betaald (groen) + gedeclareerd-pending (oranje) per maand
  SELECT ym,
         COALESCE(SUM(bedrag) FILTER (WHERE status='betaald'),0)  AS paid,
         COALESCE(SUM(bedrag) FILTER (WHERE status<>'betaald'),0) AS pending
  FROM fb GROUP BY ym
),
bmnd AS ( SELECT bid, ym, SUM(bedrag) AS msom FROM fb GROUP BY bid, ym ),
bstat AS (  -- per beschikking: eerste factuurmaand + gemiddeld maandbedrag
  SELECT bid, MIN(ym) AS eerste_ym, ROUND(AVG(msom)::numeric,2) AS gem_maand
  FROM bmnd GROUP BY bid
),
win AS ( SELECT MIN(ym) AS min_ym, MAX(ym) AS max_ym FROM fb ),
months_all AS (
  SELECT to_char(gs,'YYYY-MM') AS ym
  FROM win
  CROSS JOIN LATERAL generate_series(
    to_date(win.min_ym,'YYYY-MM'), to_date(win.max_ym,'YYYY-MM'), interval '1 month') gs
),
billed AS ( SELECT DISTINCT bid, ym FROM fb ),
besch_act AS (  -- beschikkingen die meetellen voor 'te declareren' (met historie)
  SELECT b.id, b.start_iso, b.eind_iso, s.eerste_ym, s.gem_maand
  FROM beschikkingen b JOIN bstat s ON s.bid = b.id
  WHERE NOT b.gearchiveerd AND b.fase <> 'In aanvraag'
),
todecl AS (  -- ontbrekende-factuur-maanden (rood) per maand
  SELECT m.ym,
         COUNT(*) FILTER (WHERE bl.bid IS NULL) AS cnt,
         COALESCE(SUM(CASE WHEN bl.bid IS NULL THEN ba.gem_maand ELSE 0 END),0) AS amount
  FROM besch_act ba
  JOIN months_all m
    ON m.ym >= ba.eerste_ym
   AND m.ym >= to_char(ba.start_iso,'YYYY-MM')
   AND m.ym <= to_char(LEAST(COALESCE(ba.eind_iso, CURRENT_DATE), CURRENT_DATE),'YYYY-MM')
  LEFT JOIN billed bl ON bl.bid = ba.id AND bl.ym = m.ym
  GROUP BY m.ym
),
mtab AS (  -- gecombineerde maandtabel
  SELECT ma.ym,
         COALESCE(fm.paid,0)      AS paid,
         COALESCE(fm.pending,0)   AS pending,
         COALESCE(td.amount,0)    AS to_declare,
         COALESCE(td.cnt,0)       AS to_declare_cnt
  FROM months_all ma
  LEFT JOIN fmonth fm ON fm.ym = ma.ym
  LEFT JOIN todecl td ON td.ym = ma.ym
),
refp AS (
  SELECT COALESCE(to_char(p_start,'YYYY-MM'), (SELECT max_ym FROM win)) AS s_ym,
         COALESCE(to_char(p_end,'YYYY-MM'),   (SELECT max_ym FROM win)) AS e_ym
)
SELECT jsonb_build_object(
  'period', (SELECT jsonb_build_object('start', s_ym, 'end', e_ym) FROM refp),
  'window', (SELECT jsonb_build_object('min', min_ym, 'max', max_ym) FROM win),
  'selected', (
    SELECT jsonb_build_object(
      'paid',             ROUND(COALESCE(SUM(paid),0)::numeric,2),
      'declared_pending', ROUND(COALESCE(SUM(pending),0)::numeric,2),
      'to_declare',       ROUND(COALESCE(SUM(to_declare),0)::numeric,2),
      'to_declare_cnt',   COALESCE(SUM(to_declare_cnt),0),
      'paid_cnt',         (SELECT COUNT(*) FROM fb, refp r WHERE fb.status='betaald'  AND fb.ym>=r.s_ym AND fb.ym<=r.e_ym),
      'pending_cnt',      (SELECT COUNT(*) FROM fb, refp r WHERE fb.status<>'betaald' AND fb.ym>=r.s_ym AND fb.ym<=r.e_ym))
    FROM mtab, refp WHERE mtab.ym>=refp.s_ym AND mtab.ym<=refp.e_ym),
  'achterstand', (
    SELECT jsonb_build_object(
      'to_declare_total',        ROUND(COALESCE(SUM(to_declare),0)::numeric,2),
      'declared_pending_total',  ROUND(COALESCE(SUM(pending),0)::numeric,2),
      'to_declare_by_month', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('ym',ym,'amount',ROUND(to_declare::numeric,2),'count',to_declare_cnt) ORDER BY ym DESC)
        FROM mtab, refp r WHERE mtab.ym<r.s_ym AND to_declare>0),'[]'::jsonb),
      'declared_pending_by_month', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('ym',ym,'amount',ROUND(pending::numeric,2)) ORDER BY ym DESC)
        FROM mtab, refp r WHERE mtab.ym<r.s_ym AND pending>0),'[]'::jsonb))
    FROM mtab, refp WHERE mtab.ym<refp.s_ym),
  'months', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'ym',ym,'paid',ROUND(paid::numeric,2),'declared_pending',ROUND(pending::numeric,2),'to_declare',ROUND(to_declare::numeric,2)) ORDER BY ym),'[]'::jsonb) FROM mtab),
  'active_count', (
    SELECT COUNT(*) FROM beschikkingen b
    WHERE NOT b.gearchiveerd AND b.fase<>'In aanvraag'
      AND (b.eind_iso IS NULL OR b.eind_iso>=CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM clienten c WHERE c.data->>'bs2_id'=b.client_id AND lower(c.fase)='in zorg')),
  'active_list', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',b.id,'naam',b.naam,'zorgsoort',b.zorgsoort_key,'eind',b.eind_iso,
      'client',COALESCE((SELECT trim(c.voornaam||' '||c.achternaam) FROM clienten c WHERE c.data->>'bs2_id'=b.client_id LIMIT 1),
                        (SELECT d.client_name FROM bs2_dispositions d WHERE d.id=b.id),'—')) ORDER BY b.eind_iso NULLS LAST)
    FROM beschikkingen b
    WHERE NOT b.gearchiveerd AND b.fase<>'In aanvraag'
      AND (b.eind_iso IS NULL OR b.eind_iso>=CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM clienten c WHERE c.data->>'bs2_id'=b.client_id AND lower(c.fase)='in zorg')),'[]'::jsonb),
  'overdue_60d', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',b.id,'naam',b.naam,'zorgsoort',b.zorgsoort_key,'eind',b.eind_iso,
      'dagen',(b.eind_iso-CURRENT_DATE),
      'client',COALESCE((SELECT trim(c.voornaam||' '||c.achternaam) FROM clienten c WHERE c.data->>'bs2_id'=b.client_id LIMIT 1),
                        (SELECT d.client_name FROM bs2_dispositions d WHERE d.id=b.id),'—')) ORDER BY b.eind_iso)
    FROM beschikkingen b WHERE NOT b.gearchiveerd AND b.eind_iso>CURRENT_DATE AND b.eind_iso<=CURRENT_DATE+60),'[]'::jsonb),
  'pending_requests', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',b.id,'naam',b.naam,'zorgsoort',b.zorgsoort_key,'start',b.start_iso,
      'client',COALESCE((SELECT trim(c.voornaam||' '||c.achternaam) FROM clienten c WHERE c.data->>'bs2_id'=b.client_id LIMIT 1),
                        (SELECT d.client_name FROM bs2_dispositions d WHERE d.id=b.id),'—')) ORDER BY b.start_iso DESC NULLS LAST)
    FROM beschikkingen b WHERE NOT b.gearchiveerd AND b.fase='In aanvraag'),'[]'::jsonb),
  -- Onderste charts (zelfde 'actief'-definitie als active_count → consistent):
  'care_types', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', zs, 'count', n) ORDER BY n DESC)
    FROM (SELECT COALESCE(NULLIF(b.zorgsoort_key,''),'Onbekend') AS zs, COUNT(*) AS n
          FROM beschikkingen b
          WHERE NOT b.gearchiveerd AND b.fase<>'In aanvraag'
            AND (b.eind_iso IS NULL OR b.eind_iso>=CURRENT_DATE)
            AND EXISTS (SELECT 1 FROM clienten c WHERE c.data->>'bs2_id'=b.client_id AND lower(c.fase)='in zorg')
          GROUP BY 1) z),'[]'::jsonb),
  'locations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', loc, 'count', n) ORDER BY n DESC)
    FROM (SELECT COALESCE(NULLIF(NULLIF(b.locatie,''),'—'),'Onbekend') AS loc, COUNT(*) AS n
          FROM beschikkingen b
          WHERE NOT b.gearchiveerd AND b.betalings_status='outstanding'
          GROUP BY 1) z),'[]'::jsonb),
  'processing_time', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('time_range', tr, 'count', n) ORDER BY ord)
    FROM (SELECT tr, ord, COUNT(*) n FROM (
            SELECT CASE WHEN d<=10 THEN '0-10 dagen' WHEN d<=20 THEN '11-20 dagen' WHEN d<=30 THEN '21-30 dagen' ELSE '30+ dagen' END AS tr,
                   CASE WHEN d<=10 THEN 1 WHEN d<=20 THEN 2 WHEN d<=30 THEN 3 ELSE 4 END AS ord
            FROM (SELECT round(EXTRACT(EPOCH FROM (paid_at - bs2_created_at))/86400) AS d
                  FROM bs2_disposition_payments WHERE status='paid' AND paid_at IS NOT NULL AND bs2_created_at IS NOT NULL) q
            WHERE d IS NOT NULL) buckets
          GROUP BY tr, ord) z),'[]'::jsonb)
);
$fn$;

GRANT EXECUTE ON FUNCTION public.beschikkingen_dashboard_v2(date,date) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- Drill-down detail per maand (welke cliënten/beschikkingen).
--   p_kind = 'to_declare' → lopende beschikkingen zonder factuur in p_ym
--   p_kind = 'pending'    → gedeclareerde, nog niet betaalde facturen in p_ym
--   p_kind = 'paid'       → betaalde facturen in p_ym
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.beschikkingen_maand_detail(
  p_ym   text,
  p_kind text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
WITH fb AS (
  SELECT p.disposition_id AS bid,
         (substr(f.periode,7,4) || '-' || substr(f.periode,4,2)) AS ym,
         f.id, f.factuurnummer, f.status, f.bedrag, f.client_id
  FROM facturen f
  JOIN bs2_disposition_payments p ON p.id = f.id
  WHERE NOT f.gearchiveerd AND f.periode ~ '^\d{2}-\d{2}-\d{4}'
),
bmnd AS ( SELECT bid, ym, SUM(bedrag) AS msom FROM fb GROUP BY bid, ym ),
bstat AS ( SELECT bid, MIN(ym) AS eerste_ym, ROUND(AVG(msom)::numeric,2) AS gem_maand FROM bmnd GROUP BY bid ),
billed AS ( SELECT DISTINCT bid, ym FROM fb )
SELECT CASE
  WHEN p_kind = 'to_declare' THEN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', b.id, 'naam', b.naam, 'zorgsoort', b.zorgsoort_key,
      'bedrag', s.gem_maand,
      'client', COALESCE((SELECT trim(c.voornaam||' '||c.achternaam) FROM clienten c WHERE c.data->>'bs2_id'=b.client_id LIMIT 1),
                         (SELECT d.client_name FROM bs2_dispositions d WHERE d.id=b.id), '—'))
      ORDER BY s.gem_maand DESC)
    FROM beschikkingen b
    JOIN bstat s ON s.bid = b.id
    WHERE NOT b.gearchiveerd AND b.fase <> 'In aanvraag'
      AND p_ym >= s.eerste_ym
      AND p_ym >= to_char(b.start_iso,'YYYY-MM')
      AND p_ym <= to_char(LEAST(COALESCE(b.eind_iso,CURRENT_DATE),CURRENT_DATE),'YYYY-MM')
      AND NOT EXISTS (SELECT 1 FROM billed bl WHERE bl.bid=b.id AND bl.ym=p_ym)
  ), '[]'::jsonb)
  ELSE COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', fb.id, 'factuurnummer', fb.factuurnummer, 'bedrag', fb.bedrag, 'naam', b.naam,
      'client', COALESCE((SELECT trim(c.voornaam||' '||c.achternaam) FROM clienten c WHERE c.data->>'bs2_id'=b.client_id LIMIT 1),
                         (SELECT d.client_name FROM bs2_dispositions d WHERE d.id=b.id), '—'))
      ORDER BY fb.bedrag DESC)
    FROM fb JOIN beschikkingen b ON b.id = fb.bid
    WHERE fb.ym = p_ym
      AND ((p_kind='paid' AND fb.status='betaald') OR (p_kind='pending' AND fb.status<>'betaald'))
  ), '[]'::jsonb)
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.beschikkingen_maand_detail(text,text) TO anon, authenticated;
