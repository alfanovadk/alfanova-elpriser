# Elpriser PWA — samlet design: korrekthedsfixes + tre features

**Dato:** 2026-06-13
**App:** `index.html` (vanilla JS, ingen build, ingen backend) på `elpriser.damsgaard-bruhn.dk`
**Brugere:** 2 (privat værktøj)

Dette dokument samler to designspor for samme app:

- **Del A — Korrekthedsfixes** i pris-motoren (analyse-punkt #1–3): vælgbart
  netselskab, afgifts-verifikation, sommertid (DST).
- **Del B — Tre features:** klik-på-time, Eloverblik-forbrug, verificeret
  gamification.

De to spor deler kode (`totalOf`, `chartHTML`, settings-sheet). De delte refaktorer
og implementeringsrækkefølgen står eksplicit i afsnittene **Delte refaktorer** og
**Implementeringsrækkefølge** — læs dem før kodning, så A og B ikke bygger to
parallelle løsninger på samme funktion.

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

---

# Del A — Korrekthedsfixes i pris-motoren

Pris-motoren (`index.html:50–209`) er ren og testbar, men har tre korrekthedsfejl.
To antagelser fra den oprindelige analyse blev afkræftet under research og er
korrigeret nedenfor:

- **`ELAFGIFT=1.0` er korrekt** — elafgiften er midlertidigt nedsat til 0,8 øre/kWh
  ekskl. moms i 2026–2027 (kilde: skat.dk, BDO). 0,8 × 1,25 = 1,0 øre inkl. moms.
  (2025 var 72 øre/kWh.)
- **Ingen moms-inkonsistens** — spotprisen ganges med moms (rå spot er ekskl. moms),
  og alle faste tariffer er inkl. moms. N1's `11/33/99` (`index.html:52`) matcher
  præcist elforbrug.nu's *inkl.-moms* vintertal. Motoren regner konsistent i
  øre/kWh inkl. moms; den mangler kun dokumentation af enheder.

## A1 — Vælgbart netselskab

### Problem
`nettarif` (`index.html:52–54`) bruger udelukkende N1's tariffer. Totalprisen er
derfor kun korrekt i N1's område og synligt forkert for kunder hos Radius, Cerius,
Trefor, Konstant, Dinel m.fl. Tallet *ser* præcist ud men er det ikke — appens
største troværdighedsrisiko.

### Løsning
Tidsstrukturen i Tarifmodel 3.0 (lav 00–06, høj 06–17 + 21–24, spids 17–21; sæson
vinter okt–mar / sommer apr–sep) er **fælles** for alle DSO'er og matcher allerede
`nettarif` + `season` (`index.html:53–54`). Kun *tallene* er DSO-specifikke.

1. Erstat `const N1 = {...}` med en tabel `DSO_TARIFFS`:

   ```js
   // Nettariffer, øre/kWh inkl. moms. Tarifmodel 3.0.
   // Satser pr. jan 2026 — verificér årligt (justeres typisk 1/1 og 1/4).
   // Kilder: elforbrug.nu (vinter), eloversigt.dk (sommer).
   const DSO_TARIFFS = {
     n1:       { navn:'N1',            winter:{lav:11,hoej:33,spids:99},  summer:{lav:11,hoej:17,spids:43} },
     radius:   { navn:'Radius',        winter:{lav:12,hoej:37,spids:110}, summer:{lav:13,hoej:20,spids:52} },
     cerius:   { navn:'Cerius',        winter:{lav:13,hoej:40,spids:120}, summer:{lav:14,hoej:22,spids:56} },
     trefor:   { navn:'TREFOR El-net', winter:{lav:8, hoej:24,spids:73},  summer:{lav:5, hoej:8, spids:21} },
     konstant: { navn:'Konstant',      winter:{lav:6, hoej:18,spids:54},  summer:{lav:8, hoej:11,spids:30} },
     dinel:    { navn:'Dinel',         winter:{lav:10,hoej:30,spids:91},  summer:{lav:8, hoej:12,spids:30} },
   };
   ```

2. `nettarif(h, m)` slår op i valgt DSO:
   ```js
   function nettarif(h, m){
     const dso = app.state.dso==='custom' ? app.state.customTariff : DSO_TARIFFS[app.state.dso];
     const s = dso[season(m)];
     if(h<6) return s.lav;
     if(h>=17 && h<21) return s.spids;
     return s.hoej;
   }
   ```

3. State: tilføj `dso:'n1'` og `customTariff` (default = N1's tal) til `app.state`
   (`index.html:91`) og til `saveState`/`loadState` whitelist
   (`index.html:99–100`).

4. Settings-sheet (`sheetHTML`): ny sektion **NETSELSKAB** efter PRISOMRÅDE
   (`index.html:423–424`), med samme pille-stil som region-vælgeren — én knap pr.
   DSO + "Andet". Skift af DSO kalder `setDso(key)` → `saveState()` + `render()`
   (data er allerede hentet; ingen re-fetch nødvendig).

### "Andet" — manuel indtastning (fuldt sæt)
Når `dso==='custom'` vises 6 step-felter (lav/høj/spids × vinter/sommer), samme
`step()`-mønster som de eksisterende apparat-rækker (`index.html:407–410`). Værdier
gemmes i `app.state.customTariff = { winter:{...}, summer:{...} }` og persisteres.
Default-værdier = N1's tal, så feltet er meningsfuldt fra start.

## A2 — Afgifts-verifikation + dokumentation

1. Tilføj enheds-/kilde-kommentarer øverst i pris-motoren:
   ```js
   // Alle beløb i øre/kWh inkl. moms, medmindre andet er nævnt.
   const ELAFGIFT = 1.0;     // 0,8 øre ekskl. moms × 1,25 (Skat, midlertidig nedsættelse 2026–2027)
   const ENERGINET = 14.375; // system- + transmissionstarif (Energinet) — VERIFICÉR 2026
   const MOMS = 1.25;
   ```
2. **Verificér `ENERGINET=14.375`** mod energinet.dk's tarifblad for 2026 under
   implementeringen. Hvis tallet afviger, ret det og opdatér kommentaren med præcis
   kilde. Hvis det ikke kan bekræftes, lad tallet stå men notér usikkerheden i
   kommentaren (ingen tavse antagelser).

## A3 — Sommertid (DST)

### Problem
`seriesFor` (`index.html:128–132`) bygger en fast `Array(24)` indekseret på lokal
time (`parseDK` læser cifrene på position 11–13, `index.html:56`). API'et leverer
fuldt timestamp med offset (`"2026-06-13T02:00:00+02:00"`). På de to årlige
DST-dage:
- **Forår (marts):** kl. 02 springes over → `arr[2]` forbliver `null` (hul i graf).
- **Efterår (oktober):** kl. 02 forekommer to gange (offset +02 → +01) med samme
  lokale ciffer "02" → den ene overskriver den anden (tabt time).

### Løsning
Gør serie- og graf-logikken **data-drevet** frem for at antage 24 faste indeks:

- `seriesFor(dayKey)` returnerer en liste af `{h, total}` for de records der faktisk
  hører til dagen, sorteret på `time_start` — i stedet for et fast 24-array.
- `chartHTML` itererer over denne liste og renderer ét bar pr. faktisk time
  (typisk 24, men 23/25 på DST-dage). Akse-labels (00/06/12/18/24) beholdes som
  faste referencepunkter.
- "NU"-markøren matches på faktisk time frem for array-indeks.
- `computeView`'s afledte beregninger (`loHi`, `tierOf`, peak, cheap-window) opererer
  på listens `total`-værdier — uændret logik, blot uden 24-antagelsen.

Bemærk: `ringHTML` (play-temaet, `index.html:231–248`) deler døgnet i 24 × 15°
segmenter. På DST-dage accepteres en kosmetisk unøjagtighed i ringens segmentering
(2 dage/år) frem for en fuld geometri-omskrivning — YAGNI. Bar-graf og alle
pris-beregninger er korrekte.

---

# Del B — Tre features

## B1 — Klik på time → inline detalje

**I dag:** `chartHTML()` rendrer søjler med en `title`-tooltip (`kl 14:00 · 2,34 kr`).
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

Pris-nedbrydningen bruger den delte komponent-funktion fra **Delte refaktorer →
`totalOf` → komponenter**. Nettarif-komponenten afspejler det DSO der er valgt i A1.

## B2 + B3 — Eloverblik + verificeret gamification

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

---

# Del C — Volt-maskot (animeret tilstandsmaskine)

**Kilde:** `docs/superpowers/specs/assets/volt-animationer.html` (kopieret ind i
repoet fra `~/Desktop/volt-animationer.html`) — en færdig samling SVG + CSS-animationer
for maskotten "Volt". Denne fil er den autoritative kilde til markup og keyframes;
SVG'en og CSS'en kopieres (inlines) ind i `index.html` jf. single-file-arkitekturen.

### Problem
Den nuværende `volt(size, stroke, withFace)` (`index.html:78–87`) tegner en statisk
figur med kun én animation (`voltbob`, `index.html:26`). Den afspejler ikke
pris-tilstanden og reagerer ikke på app-events.

### Løsning
Erstat `volt()` med den rigere SVG fra kildefilen (én `voltSVG(stateClass, size,
stroke)`-funktion) der bærer en `class` som vælger tilstand. Tilstandene fra
kildefilen mappes til app-state:

| Volt-tilstand | CSS-klasse | Udløses af |
|---|---|---|
| Billig (glad hop + ✨ + grønt glow) | `cheap` | `V.nowTier === 0` |
| Middel (rolig svæv + blink) | `mid` | `V.nowTier === 1` |
| Dyr (arrig, ryster, gnister) | `expensive` | `V.nowTier === 2` |
| Charge (loading) | `charge` | `app.loading === true` |
| Cheer (spin) | `cheer` | Badge låst op (B3) |
| Wink (legende) | `wink` | Play-temaets hero (valgfri accent) |
| Idle / blink | `idle` | Fallback når tier ukendt |

### Integration
- **Alle tre temaer:** `viewSoft`/`viewBold`/`viewPlay` (`index.html:280–393`) kalder
  i dag `volt(...)`. De skiftes til `voltSVG(tierClass, ...)` hvor `tierClass`
  udledes af `V.nowTier`. Bold-temaet bruger lys stroke (`#0C1117` på neon) — `stroke`
  bevares som parameter; bolt-farven overstyres i `cheap`/`expensive` via CSS som i
  kildefilen.
- **Loading:** render-grenen `if(app.loading)` (`index.html:444`) viser `charge`-Volt
  i stedet for ren tekst-skeleton.
- **Badge-unlock (B3):** når en ny badge optjenes, vis `cheer`-Volt kortvarigt.
- **Farve-tokens:** kildefilens hardcodede farver (`#34B27B` grøn, `#E5604D`/`#FF2F52`
  rød, `#FFD23F` gul) holdes som maskottens egne signatur-farver på tværs af temaer —
  de er bevidst tema-uafhængige, så Volt ser konsistent ud. (Verificeres visuelt mod
  hvert temas baggrund.)

### prefers-reduced-motion (sammenhæng med analyse #7)
Disse animationer er mere intense end den nuværende bob. Hele Volt-animationssættet
(og de øvrige `@keyframes`) wrappes i
`@media (prefers-reduced-motion: no-preference){ … }`, så brugere med reduceret
bevægelse får en **statisk** Volt i korrekt tilstands-farve/-ansigt (glad/neutral/
arrig) uden bevægelse. Tilstanden (farve, ansigtsudtryk, gnister) er informativ og
beholdes; kun bevægelsen fjernes.

### Test / visuel verifikation
Efter integration: åbn appen i browser, hard-reload, og verificér visuelt på desktop
+ 390px at Volt skifter korrekt mellem glad/neutral/arrig efter prisniveau i **alle
tre temaer**, at `charge` vises under load, og at `cheer` fyrer ved badge-unlock.
Test også med OS-indstillingen "reducér bevægelse" slået til (statisk men korrekt
tilstand). Screenshot tages OG læses tilbage før "verificeret" siges.

---

# Delte refaktorer (krydsafhængigheder mellem A og B)

Disse tre stykker kode røres af både A og B. De skal laves **én gang** og genbruges.

### 1. `totalOf` → komponent-nedbrydning  *(A2 dokumenterer · A1 ændrer nettarif · B1 viser)*
Udvid `totalOf()` (eller tilføj søster-funktion `componentsOf(rec)`) så den returnerer
de enkelte komponenter, ikke kun summen:
`{ spot, elafgift, energinet, nettarif, markup, total }` (alle øre/kWh inkl. moms).
- A2's enheds-kommentarer hænger på samme konstanter.
- A1's DSO-valg afgør `nettarif`-komponenten.
- B1's detalje-panel rendrer komponenterne direkte.
Invariant (test): `sum(komponenter) === total`.

### 2. `chartHTML` data-drevet + klik-handlers  *(A3 + B1)*
Grafen omskrives én gang til at iterere over `seriesFor`'s liste (A3) **og** bære
klik/tap-handlers pr. søjle (B1). Lav ikke to omgange på samme funktion: lav den
data-drevne struktur først (A3), tilføj derefter klik-laget (B1) ovenpå samme loop.

### 3. Settings-sheet sektioner  *(A1 + B2)*
`sheetHTML` får både **NETSELSKAB**-sektionen (A1, statisk) og **Eloverblik**-wizard
(B2, multi-step). Wizard'en er flertrins og kræver egen sub-state
(`app.state.wizardStep`); hold den isoleret fra de statiske sektioner, så A1 ikke
afhænger af wizard-logik.

---

# Datamodel (localStorage)

| Nøgle | Indhold |
|-------|---------|
| `elpriser_state` | theme, region, markup, bilH, opvaskH, vaskH **+ `dso`, `customTariff` (A1)** |
| `elpriser_streak` | (eksisterende → erstattes/udvides af verificeret streak, B3) |
| `elpriser_eloverblik` | `{ refreshToken, meteringPointId, accessToken, accessTokenExp }` |
| `elpriser_claims` | array af `{ id, apparat, dato, startHour, varighed, tierVedStart, status, point }` |
| `elpriser_gamify` | `{ totalPoint, streak, lastConfirmedDate, badges:{...} }` |
| `elpriser_consumption` | cache af hentet times-forbrug pr. dato |

# Fejlhåndtering

- Eloverblik utilgængelig / token udløbet → klar besked + "prøv igen", ingen silent failure.
- 24t-token udløbet → auto-genveksl fra refresh-token; fejler det → bed om ny nøgle.
- Manglende forbrugsdata for en dato (endnu ikke afregnet) → claim forbliver `pending`.
- Pris-grafen virker uændret uden Eloverblik (B-features er additive, ikke blokerende).
- Ukendt/ugyldigt `dso` i state → fald tilbage til `n1` (A1).

# Test

- **Pris-motor (A):** enhedstest af `nettarif` for hver DSO i begge sæsoner og alle
  tre tidsbånd; `season`-grænser (mar=vinter, apr=sommer, sep=sommer, okt=vinter);
  DST — en dag med 23 hhv. 25 records giver tilsvarende antal barer uden huller/tab.
- **Komponent-nedbrydning (delt):** `sum(komponenter) === totalOf`.
- **Verificerings-logik (B3):** test med syntetiske forbrugs-arrays
  (bekræftet/ikke-bekræftet/pending).
- **UI-verifikation (HARD RULE):** efter deploy åbnes siden i rigtig browser,
  hard-reload, inspicér visuelt på desktop + 390px: netselskab-vælger ændrer
  totalpris, klik-på-time folder ud, wizard-trin renderer, badges vises i alle tre
  temaer. Screenshot tages OG læses tilbage før "verificeret" siges.

# Implementeringsrækkefølge

Afhængighederne giver én naturlig rækkefølge (korrekthed + delte refaktorer først,
features ovenpå):

1. **A2** — komponent-refaktor af `totalOf` + afgifts-kommentarer (fundament for A1 og B1).
2. **A1** — netselskab-tabel, `nettarif`-lookup, state, settings-sektion.
3. **A3** — data-drevet `seriesFor`/`chartHTML`.
4. **C** — Volt animeret tilstandsmaskine (erstat `volt()`, map til tier/loading) +
   `prefers-reduced-motion`. Uafhængig af A/B-logik; kan laves når som helst efter A1
   (bruger `nowTier`).
5. **B1** — klik-på-time + detalje-panel (bygger på A2-komponenter + A3-graf).
6. **B2** — Eloverblik token-flow + setup-wizard.
7. **B3** — selvrapportering, verificering, point/streak/badges (bygger på B2);
   badge-unlock udløser Volt `cheer` (C).

A1–A3 + C + B1 er rent client-side og kan leveres uafhængigt af Eloverblik. B2–B3
afhænger af verifikation mod live Eloverblik-API.

# Risici / åbne punkter

- `ENERGINET`-tallet — verificeres mod energinet.dk (A2).
- DSO-tariffer justeres løbende — tabellen er dateret og skal verificeres årligt (A1).
- Eksakt Eloverblik token-creation-UX (menu-ordlyd) — verificeres mod live eloverblik.dk.
- Eksakte timeseries-endpoint paths/payloads — verificeres mod swagger + et rigtigt kald.
- POST-endpoints' CORS — kun GET/OPTIONS er bekræftet; POST verificeres tidligt (fallback: PHP-proxy).
- "Forhøjet forbrug"-tærskel i verificeringen — startes simpelt (time-median), justeres efter rigtige data.

# Eksplicit ikke med (YAGNI)

- Ingen backend, database, login eller multi-device-synk.
- Ingen historik-grafer ud over det gamification kræver.
- Ingen notifikationer/push i denne omgang.
- Ingen DST-korrekt ring-geometri i play-temaet (kosmetisk, 2 dage/år).
- Forbedring #4–#10 fra app-analysen (manifest-farver, debounce, a11y, fonts,
  SEO/PWA) behandles separat. (`prefers-reduced-motion` indgår dog i Del C, da
  Volt-animationerne gør det relevant nu.)
