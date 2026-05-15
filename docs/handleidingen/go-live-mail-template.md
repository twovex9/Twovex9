# Go-live mass-mail template — BESA Suite ETF

**Doel**: tekst die jij (eigenaar/admin) kopieert in jouw eigen mail-client (Outlook/Gmail/etc) en verstuurt naar alle medewerkers wanneer BS1 live gaat.

**Belangrijk**:
- BS1 verstuurt zelf NOOIT e-mails (user-keuze #18, #25, #32 + infra-regel).
- Verstuur deze mail vanuit jouw eigen mail-client.
- Vervang `[CUT-OVER-DATUM]` door de echte datum vóór versturen.
- Vervang `[JOUW-NAAM]` door je eigen naam.

---

## Onderwerp

```
Belangrijk: nieuwe BESA Suite gaat live op [CUT-OVER-DATUM]
```

---

## Body (kopieer onder de streep)

---

Beste collega,

Op **[CUT-OVER-DATUM]** zetten we de overstap naar onze nieuwe BESA Suite. Dit is een groot moment voor ETF — onze eigen, veilige, GDPR-conforme omgeving die volledig draait op moderne infrastructuur (Supabase Pro EU-region + Vercel).

## Wat moet je doen?

### 1. Log voor het eerst in

- **URL**: https://besa-suite.vercel.app
- **Email**: jouw zakelijke e-mailadres (zelfde als in de oude omgeving)
- **Tijdelijk wachtwoord**: `Welkom123`

### 2. Stel een eigen wachtwoord in

Bij je eerste login krijg je automatisch een schermpje "Welkom! Kies een nieuw wachtwoord". Vereisten:
- Minimaal 8 tekens
- Minstens 1 hoofdletter
- Minstens 1 cijfer

### 3. Stel 2-factor-authenticatie (2FA) in

Direct daarna verschijnt: "Beveilig je account met 2FA".

- Installeer **Google Authenticator**, **Microsoft Authenticator** of **Authy** op je telefoon
- Scan de QR-code in het scherm
- Voer de 6-cijferige code uit je app in
- Klaar — voortaan vraagt BS1 deze code bij elke login

## Belangrijk om te weten

- **Wachtwoord vergeten?** Op de login-pagina staat een "Wachtwoord vergeten?"-link. Klik daarop voor uitleg. Je moet contact opnemen met een **eigenaar**, **admin** of **directeur** (zie hieronder) — zij kunnen je wachtwoord resetten.
- **Telefoon kwijt / 2FA niet meer werkend?** Zelfde route: bel of mail één van de onderstaande personen.
- **Vraag of probleem?** Klik op het ?-icoon rechtsboven in BS1 voor de helpdesk-contactgegevens.

## Contact

Voor hulp bij login, password reset of 2FA-reset:

| Naam | Rol | E-mail | Telefoon |
|---|---|---|---|
| [JOUW-NAAM] | Eigenaar / Admin | [JOUW-EMAIL] | [JOUW-TELEFOON] |
| [COLLEGA-1] | Admin / Directeur | [...] | [...] |
| [COLLEGA-2] | Admin / Directeur | [...] | [...] |

## Wat is er anders?

- Alle data uit de oude omgeving is overgezet (medewerkers, cliënten, planning, facturen, etc.).
- Hetzelfde uitziende design, je vindt alles op dezelfde plek.
- Nieuw: in-app notificatie-bell rechtsboven (geen mail-spam meer).
- Nieuw: verplichte 2FA per medewerker — veiliger.
- Nieuw: helpdesk-knop ?-icoon rechtsboven.

## Vragen?

Bel of mail een van de admins hierboven. We helpen je graag.

Met vriendelijke groet,

[JOUW-NAAM]
Eigenaar — Embrace The Future

---

## Optioneel — herinneringsmail 1 dag van tevoren

```
Onderwerp: Reminder: nieuwe BESA Suite live morgen — heb je 2FA-app al?

Beste collega,

Even een snelle reminder: morgen, [CUT-OVER-DATUM], gaat onze nieuwe BESA Suite live op https://besa-suite.vercel.app

Twee dingen om alvast te regelen vandaag:

1. Installeer **Google Authenticator** (of Microsoft Authenticator / Authy) op je telefoon. Je hebt dit nodig voor 2FA bij eerste login.

2. Houd je tijdelijke wachtwoord bij de hand: **Welkom123**. Dit is voor iedereen hetzelfde bij eerste login en je wijzigt het direct.

Tot morgen!

[JOUW-NAAM]
```
