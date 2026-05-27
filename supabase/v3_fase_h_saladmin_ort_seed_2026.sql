-- ============================================================================
-- v3 Fase H — saladmin_ort: seed 2026 met BS1-defaults + BS2-priorities
-- ============================================================================
-- Probleem: `public.saladmin_ort` is leeg. Bij elke fresh-browser val terugen
-- we op JS-code-defaults in salarisadministratie-exporter.js. Gebruikers-edits
-- staan in localStorage, niet site-wide gedeeld.
--
-- Oplossing: seed de tabel met de huidige defaults voor jaar 2026 zodat:
--   1. De DB de bron van waarheid wordt voor ORT-regels.
--   2. Wijzigingen via de UI (pushOrt) zijn instant zichtbaar voor alle
--      ingelogde gebruikers.
--   3. BS2's `priority`-veld is bewaard zodat een toekomstige PR overlap-
--      resolutie 1-op-1 BS2 kan maken (hoogste priority wint).
--
-- Bron: 7 VVT + 10 Jeugdzorg defaults uit salarisadministratie-exporter.js
-- (ortDefaultVvtRules / ortDefaultJeugdzorgRules). Priorities uit
-- `bs2-hr-planning-v2.json` (BS2 sandbox 2026-05-27 recorder-dump).
--
-- Niet-destructief: INSERT WHERE NOT EXISTS — overschrijft niet als jaar 2026
-- al een rij heeft. Bij her-apply = no-op. Bestaande DB-rijen voor andere
-- jaren blijven ongewijzigd.
-- ============================================================================

insert into public.saladmin_ort (jaar, data)
select 2026, jsonb_build_object(
  '_vvtPresetVersion', 3,
  '_jeugdzorgPresetVersion', 3,
  'vvt', jsonb_build_array(
    jsonb_build_object('id','ort_vvt_feestdag',   'dag','Feestdag',           'start','00:00','end','23:59','percentage',200,'priority',10),
    jsonb_build_object('id','ort_vvt_zat_avond',  'dag','Zaterdag',           'start','18:00','end','23:59','percentage',140,'priority',3),
    jsonb_build_object('id','ort_vvt_zat_dag',    'dag','Zaterdag',           'start','06:00','end','18:00','percentage',120,'priority',2),
    jsonb_build_object('id','ort_vvt_zat_nacht',  'dag','Zaterdag',           'start','00:00','end','06:00','percentage',140,'priority',1),
    jsonb_build_object('id','ort_vvt_zon',        'dag','Zondag',             'start','00:00','end','23:59','percentage',160,'priority',1),
    jsonb_build_object('id','ort_vvt_mdv_nacht',  'dag','Maandag - Vrijdag',  'start','22:00','end','06:00','percentage',140,'priority',2),
    jsonb_build_object('id','ort_vvt_mdv_avond',  'dag','Maandag - Vrijdag',  'start','20:00','end','22:00','percentage',122,'priority',1)
  ),
  'jeugdzorg', jsonb_build_array(
    jsonb_build_object('id','ort_jz_zat_nacht',   'dag','Zaterdag',                  'start','22:00','end','06:00','percentage',145,'priority',0),
    jsonb_build_object('id','ort_jz_mdv_nacht',   'dag','Maandag ' || chr(8211) || ' Vrijdag', 'start','22:00','end','06:00','percentage',145,'priority',0),
    jsonb_build_object('id','ort_jz_zon_nacht',   'dag','Zondag',                    'start','22:00','end','06:00','percentage',145,'priority',0),
    jsonb_build_object('id','ort_jz_zat_lang',    'dag','Zaterdag',                  'start','20:00','end','06:00','percentage',145,'priority',0),
    jsonb_build_object('id','ort_jz_feestdag',    'dag','Feestdag',                  'start','00:00','end','23:59','percentage',145,'priority',10),
    jsonb_build_object('id','ort_jz_zat_dag',     'dag','Zaterdag',                  'start','06:00','end','22:00','percentage',130,'priority',1),
    jsonb_build_object('id','ort_jz_zon_vol',     'dag','Zondag',                    'start','00:00','end','23:59','percentage',145,'priority',1),
    jsonb_build_object('id','ort_jz_mdv_vroeg',   'dag','Maandag ' || chr(8211) || ' Vrijdag', 'start','06:00','end','07:00','percentage',125,'priority',3),
    jsonb_build_object('id','ort_jz_mdv_dag',     'dag','Maandag ' || chr(8211) || ' Vrijdag', 'start','07:00','end','19:00','percentage',100,'priority',0),
    jsonb_build_object('id','ort_jz_mdv_avond',   'dag','Maandag ' || chr(8211) || ' Vrijdag', 'start','19:00','end','22:00','percentage',125,'priority',0)
  )
)
where not exists (select 1 from public.saladmin_ort where jaar = 2026);
