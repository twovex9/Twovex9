# Module 34 — Instellingen / Notificaties — BEHAVIORS

## Notificatietypes tab

### Render
- `renderNt()` in instellingen.js
- `notificationTypesDB.getAllSync()` → toont alle types
- Filter op `state.ntSearch` + `state.ntShowArchived`
- Per row: Edit (link-button) + Archive (trash-icon)

### Edit-modal (`inst-nt-modal`)
- Klik Edit-button → `openNtModal(item)` → modal opent met data pre-populated
- Velden: id (hidden) / naam (text) / kanaal (select: email/in-app) / default_aan (checkbox)
- Submit → `notificationTypesDB.update(id, payload)`
- Close-ways (na Bug #68 fix): X / Escape / Overlay ✅

### Archive flow
- Klik trash → direct `notificationTypesDB.archive(id)` (geen slider-modal)

### Restore flow
- Klik Herstel op archived row → direct restore

### Purge flow
- Klik trash op archived row → `showSliderConfirmModal()` met preview naam
- Slider 0→100% → `notificationTypesDB.delete(id)`

## Mijn notificaties tab (BS1 extra)

### Render
- `renderMijnNotificaties()` toont per type een toggle
- Default-stand komt van type.default_aan
- Per-user override via `profile_notification_prefs` tabel

### Toggle
- Klik toggle → `profileNotificationPrefsDB.set(typeId, on)`
- Live re-render bij `ff:notification-prefs-updated` event

## Events
- `ff:notification-types-updated` → re-render beide tabs
- `ff:notification-prefs-updated` → re-render Mijn notificaties tab
- `ff:profile-updated` → re-render Mijn profiel form

## Modal close-ways (na Bug #68 fix)
- X-button: ✅
- Cancel-button: ✅
- **Escape**: globale handler (Bug #68 fix)
- **Overlay-click**: per-modal handler (Bug #68 fix)
- 3/3 close-ways werkend ✅
