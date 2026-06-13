# Elpriser PWA — tre features: klik-på-time, Eloverblik-forbrug, verificeret gamification

**Dato:** 2026-06-13
**App:** `index.html` (vanilla JS, ingen build, ingen backend) på `elpriser.damsgaard-bruhn.dk`
**Brugere:** 2 (privat værktøj)

## Mål

Tilføj tre features til den eksisterende PWA:

1. **Klik på en time** i prisgrafen → se timens pris stort, med nedbrydning.
2. **Forbind til Eloverblik** via en god guidet hjælper → hent dit faktiske times-forbrug.
3. **Gamification**: selvrapportér pr. apparat at du kører noget nu → verificér mod faktisk
   Eloverblik-forbrug 1-2 dage senere → optjen rigtige point/badges.

## Arkitektur-beslutning: ren client-side, ingen backend

Hele løsningen lægges i `index.html`. **Ingen Go/PHP/proxy/ny host.**

Begrundelse (verificeret 2026-06-13, ikke antaget):
- Eloverblik-API'et sender CORS-headers der tillader browser-kald direkte:
  - `access-control-allow-origin: *`
  - `access-control-allow-headers: authorization`
  - `access-control-allow-methods: GET`
  - Preflight `OPTIONS …/customerapi/api/isalive` → `204` med ovenstående; `GET` → `200` + `access-control-allow-origin: *`.
- Derfor kan PWA'en kalde `https://api.eloverblik.dk/customerapi/...` direkte fra browseren.

**Fallback (ikke planen):** Hvis et specifikt endpoint (fx POST timeseries) mod forventning
blokerer CORS, ligger PHP 8.4 på GreenGeeks-serveren og udgående HTTPS til api.eloverblik.dk
er verificeret (HTTP 200). En ~30-linjers PHP-proxy i `cgi-bin`/subdomænet kan da indsættes
uden at ændre app-arkitekturen væsentligt. Dette dokumenteres som risiko, ikke som plan.

## Feature 1 — Klik på time → inline detalje

**I dag:** `chartHTML()` rendrer 24 søjler med en `title`-tooltip (`kl 14:00 · 2,34 kr`).
Det er kun hover → dødt på mobil. Ingen klik-interaktion.

**Nyt:**
- Hver søjle får en klik/tap-handler der sætter `app.state.selectedHour`.
- Den valgte søjle markeres visuelt (ring/outline, genbruger `th.ring`).
- Et **detalje-panel under grafen** folder ud (samme `pop`-animation som findes) og viser:
  - Timens samlede pris **stort** (fx `2,34 kr/kWh`) i temaets store font.
  - Tier-badge: Billig / Middel / Dyr (genbruger `tierOf` + `th.pal`).
  - Nedbrydning af de komponenter `totalOf()` allerede beregner:
    spotpris (inkl. moms) · elafgift · Energinet-tarif · nettarif (tid/sæson) · dit elhandler-tillæg.
  - Tidsinterval `kl 14:00–15:00`.
- Tap på "nu"-søjlen eller en luk-affordance nulstiller `selectedHour` (default = nuværende time).
- Virker i alle tre temaer (soft/bold/play) og på 390px.

**Refaktor:** `totalOf()` udvides (eller får en søster-funktion) så den kan returnere de
enkelte komponenter, ikke kun summen — så både grafen og detalje-panelet bruger samme kilde.

## Feature 2+3 — Eloverblik + verificeret gamification

### Eloverblik token-flow (CustomerApi)

- Bruger opretter en **refresh-token** på eloverblik.dk (langlivet, ~1 år).
- Klienten POST'er refresh-token som Bearer til `…/customerapi/api/token` → får en
  kortlivet (24t) **data-access-token**.
- Med 24t-token: hent målepunkter, derefter times-tidsserie for forbrug.
- **Eksakte paths/payloads verificeres mod live-API + swagger under implementering**
  (`https://api.eloverblik.dk/customerapi/index.html`). Bemærk allerede observeret:
  paths er uden version-segment (`…/api/token`, ikke `…/api/1/token`).

### Datagrundlag og forsinkelse (ærlighed)

Eloverblik-måledata er forsinket ~1-2 døgn (afregnes dagen efter). Gamification er derfor
**retrospektiv**, ikke realtid: en selvrapporteret handling verificeres når dagens data
er klar. Dette kommunikeres tydeligt i UI'et — det er ikke live-gamification.

### Setup-hjælper (guidet wizard i Indstillinger)

Multi-step sheet, ikke bare et tomt token-felt:

1. **Hvad & hvorfor** — kort: "Vi henter dit eget times-forbrug, så appen kan se hvornår
   du faktisk bruger strøm. Det bliver på din enhed."
2. **Få din nøgle** — nummererede trin + direkte knap til eloverblik.dk (log ind med MitID →
   Datadeling → opret token → kopiér). Præcis menu-ordlyd verificeres mod live-flowet.
3. **Indsæt & test** — paste-felt + "Test forbindelse": veksler token → henter målepunkt →
   viser ✓ med adresse, eller en klar fejl ("Nøglen virker ikke — tjek at du fik hele teksten").
4. **Vælg målepunkt** hvis flere. Færdig.

### Selvrapportering (pr. apparat)

- På de eksisterende apparat-kort (🚗 bil / 🍽️ opvask / 👕 vask) tilføjes en
  "Jeg kører den nu"-knap.
- Et tryk logger en **claim**: `{apparat, startHour=nu, varighed=fra settings, tierVedStart, dato}`.
- Claims gemmes i localStorage (`elpriser_claims`).

### Verificering (claim vs. faktisk forbrug)

Når Eloverblik-data for claim'ens dato er hentet:
- Kig på det faktiske times-forbrug i vinduet `[startHour, startHour+varighed]`.
- **Bekræftet-smart** hvis: forbruget i vinduet er forhøjet ift. dagens baseline
  (fx > dagens time-median) **og** timerne lå i billig/middel tier.
- **Ikke bekræftet** hvis: intet forhøjet forbrug (kørte ikke) eller forbrug lå i dyre timer.
- Resultatet gemmes på claim'en (`status: confirmed | unconfirmed | pending`).

### Point, streak og badges

- **Point** pr. bekræftet claim, vægtet efter kWh flyttet til billige timer.
- **Streak** = dage i træk med ≥1 bekræftet smart-handling.
- **Badges** bliver rigtige (gemt i localStorage), ikke kosmetiske:
  genbruger/erstatter de nuværende play-tema-badges. Mindst:
  - 🌙 Natteravn — bekræftet kørsel i nattetimer
  - 💰 Sparefugl — N bekræftede handlinger
  - ⭐ 30 dage — streak-milepæl
  - 🔮 Sandsiger — dine rapporter matcher virkeligheden N gange (nik til verificeringen)
- **Passiv daglig smart-score** (% af faktisk forbrug i billige timer) vises som ren info.
- Badges/score vises i **alle tre temaer**.

## Datamodel (localStorage)

| Nøgle | Indhold |
|-------|---------|
| `elpriser_state` | (eksisterende) theme, region, markup, bilH, opvaskH, vaskH |
| `elpriser_streak` | (eksisterende → erstattes/udvides af verificeret streak) |
| `elpriser_eloverblik` | `{ refreshToken, meteringPointId, accessToken, accessTokenExp }` |
| `elpriser_claims` | array af `{ id, apparat, dato, startHour, varighed, tierVedStart, status, point }` |
| `elpriser_gamify` | `{ totalPoint, streak, lastConfirmedDate, badges:{...} }` |
| `elpriser_consumption` | cache af hentet times-forbrug pr. dato |

## Fejlhåndtering

- Eloverblik utilgængelig / token udløbet → klar besked + "prøv igen", ingen silent failure.
- 24t-token udløbet → auto-genveksl fra refresh-token; fejler det → bed om ny nøgle.
- Manglende forbrugsdata for en dato (endnu ikke afregnet) → claim forbliver `pending`.
- Pris-grafen virker uændret uden Eloverblik (features er additive, ikke blokerende).

## Test

- Pris-nedbrydning: enhedstest af komponent-funktionen (sum af komponenter == `totalOf`).
- Verificerings-logik: test med syntetiske forbrugs-arrays (bekræftet/ikke-bekræftet/pending).
- **UI-verifikation (HARD RULE):** efter deploy åbnes siden i rigtig browser, hard-reload,
  inspicér visuelt på desktop + 390px: klik-på-time folder ud korrekt, wizard-trin renderer,
  badges vises i alle temaer. Screenshot tages OG læses tilbage før "verificeret" siges.

## Risici / åbne punkter

- Eksakt Eloverblik token-creation-UX (menu-ordlyd) — verificeres mod live eloverblik.dk.
- Eksakte timeseries-endpoint paths/payloads — verificeres mod swagger + et rigtigt kald.
- POST-endpoints' CORS — kun GET/OPTIONS er bekræftet; POST verificeres tidligt (fallback: PHP-proxy).
- "Forhøjet forbrug"-tærskel i verificeringen — startes simpelt (time-median), justeres efter rigtige data.

## Eksplicit ikke med (YAGNI)

- Ingen backend, database, login eller multi-device-synk.
- Ingen historik-grafer ud over det gamification kræver.
- Ingen notifikationer/push i denne omgang.
