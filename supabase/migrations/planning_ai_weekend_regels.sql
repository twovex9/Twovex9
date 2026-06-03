-- AI-planregels voor de planning-generator (weekend + rust + overlap).
-- Singleton planning_settings krijgt 4 instelbare kolommen; defaults zetten de
-- regels meteen AAN zodat de generator er automatisch naar kijkt.
alter table public.planning_settings
  add column if not exists ai_weekend_consistentie boolean not null default true,
  add column if not exists ai_geen_avond_naar_dag boolean not null default true,
  add column if not exists ai_avond_grens_uur integer not null default 15,
  add column if not exists ai_overlap_waarschuwing boolean not null default true;

comment on column public.planning_settings.ai_weekend_consistentie is
  'AI-planning: loondienst in het weekend (za+zo) zelfde dagdeel — of twee dagdiensten of twee avonddiensten.';
comment on column public.planning_settings.ai_geen_avond_naar_dag is
  'AI-planning: loondienst niet een avonddienst gevolgd door een dagdienst de volgende dag (te weinig rust).';
comment on column public.planning_settings.ai_avond_grens_uur is
  'AI-planning: diensten die op of na dit lokale uur starten gelden als avonddienst (default 15:00).';
comment on column public.planning_settings.ai_overlap_waarschuwing is
  'AI-planning: waarschuw bij dubbel ingeroosterde medewerkers (overlappende tijd).';
