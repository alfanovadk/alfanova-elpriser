# Design: Korrekthedsfixes i pris-motoren (#1–3)

**Dato:** 2026-06-13
**Repo:** alfanova-elpriser
**Omfang:** De tre korrekthedsfejl i pris-motoren fra app-analysen — vælgbart
netselskab (#1), afgifts-verifikation (#2) og sommertid/DST (#3).

## Baggrund

Appen er en single-file PWA (`index.html`, ~480 linjer) der henter spotpriser fra
elprisenligenu.dk og lægger danske afgifter + nettarif på for at vise en totalpris
i kr/kWh, plus anbefalede tidsvinduer for bil/opvask/vask.

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

## #1 — Vælgbart netselskab

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

## #2 — Afgifts-verifikation + dokumentation

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

## #3 — Sommertid (DST)

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

## Test

Pris-motorens rene funktioner (`nettarif`, `totalOf`, `tierOf`, `bestWindow`,
`season`, `parseDK`) bør dækkes af unit-tests (foreslået separat som forbedring #8).
For denne ændring som minimum:
- `nettarif` returnerer korrekte tal for hver DSO i begge sæsoner og alle tre
  tidsbånd.
- `season` grænser: marts=vinter, april=sommer, september=sommer, oktober=vinter.
- DST: en dag med 23 hhv. 25 records giver tilsvarende antal barer uden huller/tab.

Visuel verifikation (jf. global deploy-regel): efter implementering åbnes appen i
browser, hard-reload, og det verificeres på desktop + 390px at netselskab-vælgeren
virker, totalprisen ændrer sig ved DSO-skift, og grafen renderer korrekt i alle tre
temaer.

## Ikke i scope
Forbedring #4–10 fra analysen (manifest-farver, visibilitychange-debounce, a11y,
prefers-reduced-motion, tests, fonts, SEO/PWA). De behandles separat.
