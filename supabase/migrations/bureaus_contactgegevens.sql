-- ============================================================================
-- Extra contact-/informatievelden voor detacheringsbureaus (HR > Bureau's).
-- Aanvulling op naam + standaard_uurtarief + fee_per_uur, zodat HR direct kan
-- zien wie te benaderen bij dit bureau.
-- Niet-destructief: alleen ADD COLUMN IF NOT EXISTS. Bestaande data blijft intact.
-- ============================================================================

alter table public.bureaus
  add column if not exists eigenaar text,
  add column if not exists contactpersoon_planning text,
  add column if not exists email text,
  add column if not exists telefoon text,
  add column if not exists adres text,
  add column if not exists kvk_nummer text,
  add column if not exists website text,
  add column if not exists notities text;

comment on column public.bureaus.eigenaar is 'Eigenaar/directie van het detacheringsbureau.';
comment on column public.bureaus.contactpersoon_planning is 'Contactpersoon voor de planning bij het bureau.';
comment on column public.bureaus.email is 'Algemeen e-mailadres van het bureau.';
comment on column public.bureaus.telefoon is 'Telefoonnummer van het bureau.';
comment on column public.bureaus.adres is 'Vestigingsadres van het bureau.';
comment on column public.bureaus.kvk_nummer is 'KvK-nummer van het bureau.';
comment on column public.bureaus.website is 'Website van het bureau.';
comment on column public.bureaus.notities is 'Vrije notities/opmerkingen over het bureau.';
