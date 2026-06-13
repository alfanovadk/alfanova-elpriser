# Spec: Forbrugs-analyse — dedikeret visning

**Dato:** 2026-06-13
**App:** elpriser.damsgaard-bruhn.dk (vanilla-JS PWA, ESM, ingen backend)
**Bruger-ønske:** En separat visning hvor man nemt kan se forbrug for en bestemt dato/interval,
sammenligne måned med samme måned sidste år, kvartal, m.m.

## Mål

En **dedikeret forbrugs-analyse-skærm** (egen visning, ikke bare en sektion på forsiden) der
giver et rigt overblik over brugerens eget elforbrug fra Eloverblik — med fleksibel
periodevælger, sammenligninger og nøgletal.

## Adgang / navigation

- Tilføj en indgang til analyse-visningen: en knap/ikon i headeren (📊) ELLER en
  "Se hele dit forbrug →"-knap i den eksisterende "Dit forbrug"-sektion.
- Analyse-visningen er en **fuld-skærms visning** (skjuler forsidens pris-indhold) med en
  tydelig "← Tilbage"-knap. Den må gerne genbruge bottom-sheet-mønstret ELLER være en
  egen `app.state.view==='forbrug'`-tilstand som `render()` forgrener på.
- Kun tilgængelig når Eloverblik er forbundet (`eloverblik.refreshToken && meteringPointId`).
  Ellers vis en kort "Forbind Eloverblik først"-besked med knap til wizarden.

## Datagrundlag (teknisk forudsætning)

Eloverblik `gettimeseries/{from}/{to}/{aggregation}` understøtter `aggregation` =
`Hour | Day | Month` (m.fl.). `eloverblik.js` `parseTimeSeries` håndterer i dag kun
time-opløsning (24-array pr. dag). **Den skal udvides** til også at returnere dag- og
måned-serier (generisk `{ buckets: [{start, qty}] }` eller separate parsere
`parseDaily`/`parseMonthly`). Vælg aggregering efter periodelængde:
- dag → Hour (24 punkter)
- uge / måned → Day
- kvartal / år / år-over-år → Month (eller Day hvis detaljer ønskes)

Eloverblik leverer typisk **op til 3 års** historik — nok til år-over-år.

**Pris/omkostning:** historiske spotpriser hentes fra elprisenligenu.dk (`fetchDay` virker
for fortidsdatoer). For store perioder er det mange kald — cache aggressivt i
`elpriser_dayprices`, og beregn omkostning på dag-niveau (dagens forbrug × dagens
gennemsnitspris er en rimelig approksimation når time-data ikke hentes for hele perioden).
For dag/uge: brug fuld time-præcision. Dokumentér approksimationen i UI ("estimeret").

**VIGTIGT — uverificeret:** `parseTimeSeries`' dato/tidszone-udledning er endnu ikke
bekræftet mod et rigtigt Eloverblik-svar (sommer/vintertid). Det SKAL verificeres mod et
ægte kald (kræver brugerens token) som del af denne opgave, og dag-grænserne for
Day/Month-aggregering skal bekræftes på samme måde.

## Funktioner (10)

### Kerne (V1)
1. **Periodevælger** — hurtigvalg: I dag · Uge · Måned · Kvartal · År. Plus et frit
   **interval (fra-dato → til-dato)** via to date-input-felter. Pile til at gå frem/tilbage
   i den valgte periodetype (forrige måned, næste måned, …).
2. **Forbrugsgraf tilpasset perioden** — søjlediagram med passende opløsning (time/dag/måned),
   farvet efter pris-tier når priser er tilgængelige (grøn/gul/rød), ellers temaets accent.
   Tooltip pr. søjle (dato/time + kWh + evt. kr).
3. **Nøgletal for perioden** — total kWh · gennemsnit pr. dag · højeste dag · højeste time ·
   antal dage med data.
4. **År-over-år sammenligning** — samme periode sidste år vist som overlay/skygge-søjler
   eller side-om-side, med samlet ændring i **% og kWh** ("-12 % vs sidste år").

### Sammenligning & profiler (V1/V2)
5. **Sammenlign to vilkårlige perioder** — vælg periode A og periode B (fx Q1 i år vs Q1
   sidste år); vis begge + difference. Generaliserer kvartal-ønsket.
6. **Døgnprofil** — gennemsnitligt forbrug pr. time (0-23) over hele perioden, som 24-timers
   kurve/søjler. Viser hvornår på døgnet brugeren typisk bruger strøm.
7. **Ugedagsprofil** — gennemsnitligt forbrug pr. ugedag (man-søn). Afslører hverdag vs weekend.

### Økonomi & klima (V2)
8. **Estimeret elregning** — periodens forbrug × fuld pris (spot + afgifter + tariffer via
   `componentsOf`-logikken) → estimeret kr. Plus **trend** vs forrige tilsvarende periode.
   Plus **billig/middel/dyr-fordeling** (andel af kWh i hver tier) og "du kunne have sparet
   ~X kr ved at flytte forbrug til de billige timer".
9. **Klimaaftryk / CO₂** — Eloverblik har en klimaaftryk-funktion (CO₂ pr. kWh varierer
   over døgnet). **Research datakilden** (Eloverblik CO₂-emissions-API eller Energi Data
   Service `CO2Emis`) og vis periodens samlede CO₂-aftryk + grøn andel. Hvis datakilden ikke
   kan bekræftes hurtigt, markér som senere-udvidelse frem for at fabrikere tal.

### Eksport (V2)
10. **Eksport til CSV** — download knap der genererer en CSV (dato/time, kWh, og pris/kr hvis
    tilgængelig) for den valgte periode, via en Blob + `<a download>`. Ingen backend.

## Arkitektur / filer

- **Ny `forbrug-analyse.js`** (ESM) — rene funktioner: aggreger serier (sum pr. dag/måned/
  ugedag/time-på-døgnet), beregn nøgletal, % -ændring, billig/middel/dyr-fordeling, CSV-
  serialisering. Unit-testet (`node --test`) — dette er hvor logikken kan testes uden netværk.
- **`eloverblik.js`** — udvid med Day/Month-aggregeret hentning + parsing.
- **`index.html`** — ny analyse-visning (render-forgrening på `app.state.view`), periodevælger-
  UI, grafer, navigation. Genbrug temaer (`th`), `kr`, `pad`, `tierOf`, `loHi`, `componentsOf`.
- **`sw.js`** — tilføj `forbrug-analyse.js` til SHELL, bump cache.

## Tilstand (localStorage / app.state)
- `app.state.view` ('forside' | 'forbrug') — ephemeral, default 'forside'.
- `app.state.analyse` — `{ periodeType, fromKey, toKey, sammenlign }` (ephemeral eller let
  persisteret, så valget huskes).
- Genbrug `elpriser_consumption` (udvid til at rumme dag/måned-buckets, fx under separate
  nøgler `elpriser_consumption_daily` / `_monthly`) og `elpriser_dayprices`.

## Test
- **Rene aggregerings-/nøgletals-funktioner** i `forbrug-analyse.js` dækkes af unit-tests
  (sum pr. periode, døgnprofil-gennemsnit, %-ændring inkl. division-med-0, CSV-format,
  billig/dyr-fordeling med syntetiske arrays).
- **Live-test mod ægte Eloverblik-data** (brugerens token): bekræft Day/Month-parsing +
  tidszone, og at år-over-år henter korrekt historik.
- **Visuel verifikation** (HARD RULE): alle tre temaer, desktop + 390px — periodevælger,
  grafer, sammenligning, navigation, tom-tilstand (ikke forbundet / ingen data), eksport.

## Ikke i scope / YAGNI
- Ingen backend, login eller server-side aggregering.
- Ingen prognoser/ML.
- CO₂ kun hvis datakilden kan bekræftes; ellers udskudt (ingen fabrikerede tal).
- Real-time data (Eloverblik er 1-2 dage forsinket — gælder også her).

## Åbne punkter til implementering
- Bekræft Eloverblik aggregation-værdier (`Day`/`Month`) + respons-form mod et rigtigt kald.
- Bekræft `parseTimeSeries` tidszone/dag-grænser mod ægte data.
- Vælg datakilde for CO₂ (Eloverblik vs Energi Data Service `CO2Emis`/`CO2EmisProg`).
- Beslut om analyse-valg (periode) skal persisteres mellem sessioner.
