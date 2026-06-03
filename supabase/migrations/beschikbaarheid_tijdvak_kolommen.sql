-- AI-planning: ZZP-beschikbaarheid mag optioneel een begin/eind-tijd per dag krijgen.
-- Additief + nullable; bestaande dag-status ('beschikbaar'/'niet_beschikbaar') blijft werken.
alter table public.medewerker_beschikbaarheid
  add column if not exists begin_tijd time without time zone,
  add column if not exists eind_tijd time without time zone;

comment on column public.medewerker_beschikbaarheid.begin_tijd is 'Optioneel: vanaf welke tijd beschikbaar die dag. NULL = hele dag (bij status beschikbaar).';
comment on column public.medewerker_beschikbaarheid.eind_tijd is 'Optioneel: tot welke tijd beschikbaar die dag. NULL = hele dag (bij status beschikbaar).';
