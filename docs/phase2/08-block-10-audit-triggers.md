# Phase 2 — Block 10: Audit auto-population

**Datum**: 2026-05-12
**Commit**: `1b3b7ed`
**Status**: ✅ Triggers actief + end-to-end geverifieerd

## Doel
Van een passieve audit-viewer (Block 6) naar een **actieve audit-trail** die automatisch elke CRUD-actie op de 5 nieuwe Phase-2 tabellen logt.

## Schema — `public.audit_log` (generic)

```sql
CREATE TABLE public.audit_log (
  id uuid PK DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  resource_id text NOT NULL,
  actie text CHECK (actie IN ('aanmaken','bewerken','verwijderen','archiveren','herstellen','status_wijziging')),
  gebruiker_id uuid,  -- references auth.users via session
  gebruiker_label text,  -- denormalized "Voornaam Achternaam" of "Systeem"
  details text,
  status text DEFAULT 'succes',
  ip text, user_agent text,
  aanmaakdatum timestamptz DEFAULT now()
);

-- Indexes: (resource, resource_id), (aanmaakdatum DESC), (gebruiker_id, aanmaakdatum DESC)
-- RLS: SELECT + INSERT to authenticated. Geen UPDATE/DELETE — append-only.
```

## Helper functie

```sql
CREATE FUNCTION public.log_audit_event(p_resource, p_resource_id, p_actie, p_details DEFAULT '')
RETURNS void AS $$
DECLARE v_user_id uuid; v_label text;
BEGIN
  v_user_id := auth.uid();  -- werkt alleen in user-context, null voor service-rol
  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(voornaam||' '||achternaam), ''), email, 'Onbekend')
      INTO v_label FROM public.profiles WHERE id = v_user_id;
  END IF;
  v_label := COALESCE(v_label, 'Systeem');
  INSERT INTO public.audit_log (...) VALUES (...);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'log_audit_event failed: %', sqlerrm;  -- faal nooit parent
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Belangrijke design-keuzes**:
- `SECURITY DEFINER`: trigger schrijft regardless of RLS-context van de aanroepende user
- `EXCEPTION WHEN OTHERS`: audit-failure rolt nooit de parent-transactie terug (DML faalt niet als audit faalt)
- Denormalized `gebruiker_label` snapshot: blijft leesbaar als profiles later wordt aangepast/verwijderd

## 5 Trigger-functies (één per tabel)

Voor elk: `AFTER INSERT OR UPDATE OR DELETE` trigger die naar `log_audit_event()` doorlinkt.

Slimme detecties in elke trigger:
- `INSERT` → actie `aanmaken`
- `OLD.archived=false → NEW.archived=true` → actie `archiveren`
- `OLD.archived=true → NEW.archived=false` → actie `herstellen`
- `OLD.status ≠ NEW.status` → actie `status_wijziging` (voor Taken + Verlofaanvragen)
- Andere `UPDATE` → actie `bewerken`
- `DELETE` → actie `verwijderen`

Gedekt:
- `public.taken` (incl status_wijziging)
- `public.beleidsdocumenten`
- `public.verlof_aanvragen` (incl status_wijziging met opmerking in details)
- `public.teams`
- `public.notification_types`

Niet (yet) gedekt: bestaande tabellen (medewerkers, clienten, beschikkingen, facturen, etc.) — toevoegen kan, vereist alleen een trigger per tabel.

## audit-data.js v2

Vóór: alleen `beschikking_audit_log` als bron.
Nu: **parallel fetch** uit beide bronnen via `Promise.all`, normaliseren naar gemeenschappelijke shape, merge + sort by `tijdstip DESC`. Cache key bumped naar `audit_log_v2` om oude cache te invalideren.

```js
async function fetchAll() {
  var [besch, generic] = await Promise.all([fetchBesch(), fetchGeneric()]);
  return mergeSorted(besch.concat(generic));
}
```

## audit.html + audit.js v2

- Resource-filter dropdown nu met **6 opties**: Beschikking, Taak, Beleidsdocument, Verlofaanvraag, Team, NotificatieType
- Actie-filter dropdown nu met **7 opties**: aanmaken, bekijken, bewerken, verwijderen, archiveren, herstellen, status_wijziging
- Per actie een eigen kleur-code (groen voor aanmaken/herstellen, rood voor verwijderen, geel voor bewerken/archiveren, blauw voor bekijken/status_wijziging)

## End-to-end verificatie

Test: `UPDATE public.beleidsdocumenten SET laatst_gewijzigd = now() WHERE id = 'bd_09'` via Supabase MCP.

Direct daarna SELECT op audit_log → 1 nieuwe rij:
```
Beleidsdocument | bd_09 | bewerken | Systeem | "09. Uitgifte en Gebruik Bankpas"
```

(Gebruiker = "Systeem" omdat MCP geen `auth.uid()` heeft; via de UI met ingelogde user wordt het correct "Voornaam Achternaam" of email.)

Live op `besa-suite.vercel.app/audit.html`: beide entries zichtbaar gemerged, gesorteerd op tijdstip DESC.

## Volgende mogelijke uitbreidingen (niet binnen scope van deze block)

1. **Triggers op bestaande tabellen** (medewerkers, clienten, beschikkingen, facturen, etc.) zodat hun CRUD-acties ook gelogd worden
2. **JS-side audit-write**: voeg log_audit_event aanroepen toe in data-lagen voor acties die niet via SQL gaan (bv. "bekijken" — alleen een SELECT triggert geen INSERT/UPDATE trigger)
3. **Audit-detail modal** in audit.html — klik op een rij om volledige `payload`-jsonb-diff te zien (vereist `payload` kolom in audit_log)
4. **Cleanup-policy**: oude audit-entries (>1 jaar?) archiveren naar cold storage of een aparte tabel
