# Plan 1 — Pris-motor korrekthed + test-fundament Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gør totalprisen korrekt for alle danske netselskaber (ikke kun N1), dokumentér de verificerede afgiftssatser, og fix sommertid (DST) — alt understøttet af et nyt unit-test-fundament for pris-motoren.

**Architecture:** Træk de rene, deterministiske pris-funktioner ud af `index.html` i et nyt ESM-modul `pricing.js`, så de kan unit-testes med Node's indbyggede test-runner (`node --test`, ingen npm-deps). `index.html`'s script konverteres til `type="module"` og importerer fra `pricing.js` (én sandhedskilde, DRY). DOM-/tids-afhængig kode (`computeView`, `render`, actions) bliver i `index.html` men kalder de rene funktioner. Graf og serier gøres data-drevne (liste af faktiske timer) frem for et fast `Array(24)`, hvilket løser DST.

**Tech Stack:** Vanilla JS (ESM-moduler), Node v26 indbygget `node:test` + `node:assert`, ingen build-step.

Spec: `docs/superpowers/specs/2026-06-13-elpriser-samlet-design.md` (Del A + Delte refaktorer #1–2).

---

## File Structure

- **Create `pricing.js`** — rene pris-funktioner (ESM): konstanter, `DSO_TARIFFS`, `season`, `parseDK`, `nettarif`, `componentsOf`, `totalOf`, `tierOf`, `loHi`, `bestWindow`, `seriesForDay`. Ingen DOM, ingen global `app.state` — alt parametriseres.
- **Create `pricing.test.mjs`** — `node --test`-suite for `pricing.js`.
- **Modify `index.html`** — importér fra `pricing.js`; tilføj `dso`/`customTariff` til state; NETSELSKAB-sektion i settings-sheet; data-drevet `computeView`/`chartHTML`; afgifts-kommentarer fjernes herfra (flyttet til modul).
- **Modify `sw.js`** — tilføj `pricing.js` til `SHELL` + bump `CACHE`-version.

**Interfaces (fastlagt — senere tasks skal matche disse præcist):**

```js
// cfg-objekt brugt af componentsOf/totalOf/seriesForDay:
//   { markup: number /* øre/kWh inkl. moms */, tariff: TariffObj }
// TariffObj: { winter:{lav,hoej,spids}, summer:{lav,hoej,spids} }  (navn-felt ignoreres af motoren)

componentsOf(rec, cfg) -> { spot, elafgift, energinet, nettarif, markup, total }  // alle øre/kWh inkl. moms
totalOf(rec, cfg) -> number
nettarif(h, monthIdx, tariff) -> number
season(monthIdx) -> 'summer' | 'winter'
seriesForDay(raw, dayKey, cfg) -> Array<{ h:number, total:number }>   // kronologisk, kan have 23/25 elementer på DST-dage
tierOf(p, lo, hi) -> 0|1|2
loHi(values:number[]) -> [lo, hi]
bestWindow(pool, len) -> { avg, from, to, len } | null
```

---

## Task 1: Projekt-scaffold til Node-tests

**Files:**
- Create: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Opret `package.json`**

```json
{
  "name": "alfanova-elpriser",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Sikr at node_modules er ignoreret**

Læs `.gitignore`. Hvis `node_modules` ikke allerede står der, tilføj linjen:

```
node_modules
```

- [ ] **Step 3: Verificér at test-runneren kan startes (tom kørsel)**

Run: `node --test`
Expected: Exit 0 med besked om "tests 0" (ingen testfiler endnu) — bekræfter at Node v26-runneren virker.

- [ ] **Step 4: Commit**

```bash
git add package.json .gitignore
git commit -m "chore: add node test scaffold (node --test, no deps)"
```

---

## Task 2: `nettarif` + `DSO_TARIFFS` + `season` (TDD)

**Files:**
- Create: `pricing.js`
- Create: `pricing.test.mjs`

- [ ] **Step 1: Skriv de fejlende tests**

Opret `pricing.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { season, nettarif, DSO_TARIFFS } from './pricing.js';

test('season: oktober-marts er vinter, april-september er sommer', () => {
  assert.equal(season(0), 'winter');   // januar
  assert.equal(season(2), 'winter');   // marts
  assert.equal(season(3), 'summer');   // april
  assert.equal(season(8), 'summer');   // september
  assert.equal(season(9), 'winter');   // oktober
  assert.equal(season(11), 'winter');  // december
});

test('DSO_TARIFFS indeholder de seks netselskaber med begge sæsoner', () => {
  for (const key of ['n1','radius','cerius','trefor','konstant','dinel']) {
    const d = DSO_TARIFFS[key];
    assert.ok(d, `mangler ${key}`);
    for (const s of ['winter','summer']) {
      for (const band of ['lav','hoej','spids']) {
        assert.equal(typeof d[s][band], 'number', `${key}.${s}.${band}`);
      }
    }
  }
});

test('nettarif: rigtige tidsbånd for N1 vinter', () => {
  const t = DSO_TARIFFS.n1;
  assert.equal(nettarif(3, 0, t), 11);   // 03:00 januar = lav
  assert.equal(nettarif(10, 0, t), 33);  // 10:00 januar = høj
  assert.equal(nettarif(18, 0, t), 99);  // 18:00 januar = spids
  assert.equal(nettarif(22, 0, t), 33);  // 22:00 = høj (efter spids)
});

test('nettarif: N1 sommer afviger fra vinter', () => {
  const t = DSO_TARIFFS.n1;
  assert.equal(nettarif(18, 5, t), 43);  // 18:00 juni = sommer-spids
  assert.equal(nettarif(3, 5, t), 11);   // 03:00 juni = sommer-lav
});

test('nettarif: spids-grænser er 17–20 inkl., 21 er høj', () => {
  const t = DSO_TARIFFS.cerius;
  assert.equal(nettarif(16, 0, t), 40);   // høj
  assert.equal(nettarif(17, 0, t), 120);  // spids start
  assert.equal(nettarif(20, 0, t), 120);  // spids slut (inkl.)
  assert.equal(nettarif(21, 0, t), 40);   // tilbage til høj
});
```

- [ ] **Step 2: Kør testene og verificér at de fejler**

Run: `node --test`
Expected: FAIL — `Cannot find module './pricing.js'`.

- [ ] **Step 3: Opret `pricing.js` med minimal implementering**

```js
// pricing.js — ren pris-motor for Elpriser-PWA. Ingen DOM, ingen global state.
// Alle beløb i øre/kWh inkl. moms, medmindre andet er nævnt.

// Nettariffer, øre/kWh inkl. moms. Tarifmodel 3.0.
// Satser pr. jan 2026 — verificér årligt (justeres typisk 1/1 og 1/4).
// Kilder: elforbrug.nu (vinter), eloversigt.dk (sommer).
export const DSO_TARIFFS = {
  n1:       { navn:'N1',            winter:{lav:11,hoej:33,spids:99},  summer:{lav:11,hoej:17,spids:43} },
  radius:   { navn:'Radius',        winter:{lav:12,hoej:37,spids:110}, summer:{lav:13,hoej:20,spids:52} },
  cerius:   { navn:'Cerius',        winter:{lav:13,hoej:40,spids:120}, summer:{lav:14,hoej:22,spids:56} },
  trefor:   { navn:'TREFOR El-net', winter:{lav:8, hoej:24,spids:73},  summer:{lav:5, hoej:8, spids:21} },
  konstant: { navn:'Konstant',      winter:{lav:6, hoej:18,spids:54},  summer:{lav:8, hoej:11,spids:30} },
  dinel:    { navn:'Dinel',         winter:{lav:10,hoej:30,spids:91},  summer:{lav:8, hoej:12,spids:30} },
};

// monthIdx er 0-baseret (0=januar). Vinter okt–mar, sommer apr–sep.
export const season = monthIdx => (monthIdx >= 3 && monthIdx <= 8) ? 'summer' : 'winter';

export function nettarif(h, monthIdx, tariff){
  const s = tariff[season(monthIdx)];
  if (h < 6) return s.lav;
  if (h >= 17 && h < 21) return s.spids;
  return s.hoej;
}
```

- [ ] **Step 4: Kør testene og verificér at de passer**

Run: `node --test`
Expected: PASS — alle 5 tests grønne.

- [ ] **Step 5: Commit**

```bash
git add pricing.js pricing.test.mjs
git commit -m "feat: DSO tariff table + nettarif lookup with tests"
```

---

## Task 3: `parseDK` (TDD)

**Files:**
- Modify: `pricing.js`
- Modify: `pricing.test.mjs`

- [ ] **Step 1: Tilføj fejlende tests**

Tilføj til `pricing.test.mjs` (ny import-linje + tests):

```js
import { parseDK } from './pricing.js';

test('parseDK: udtrækker felter fra ISO-streng med offset', () => {
  const r = parseDK('2026-06-13T14:00:00+02:00');
  assert.equal(r.y, 2026);
  assert.equal(r.m, 6);
  assert.equal(r.d, 13);
  assert.equal(r.h, 14);
  assert.equal(r.monthIdx, 5);
  assert.equal(r.dayKey, '2026-6-13');
});

test('parseDK: dayKey bruger ikke nul-padding', () => {
  const r = parseDK('2026-01-05T03:00:00+01:00');
  assert.equal(r.dayKey, '2026-1-5');
  assert.equal(r.h, 3);
});
```

- [ ] **Step 2: Kør og verificér fejl**

Run: `node --test`
Expected: FAIL — `parseDK is not a function` / import-fejl.

- [ ] **Step 3: Tilføj `parseDK` til `pricing.js`** (flyttet uændret fra `index.html:56-57`)

```js
export function parseDK(s){
  const y=+s.slice(0,4), m=+s.slice(5,7), d=+s.slice(8,10), h=+s.slice(11,13);
  return { y, m, d, h, monthIdx:m-1, dayKey:`${y}-${m}-${d}`, dow:new Date(y,m-1,d).getDay() };
}
```

- [ ] **Step 4: Kør og verificér pass**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pricing.js pricing.test.mjs
git commit -m "feat: parseDK in pricing module with tests"
```

---

## Task 4: `componentsOf` / `totalOf` med komponent-nedbrydning (TDD)

Dette er spec A2 + Delte refaktorer #1 (komponent-nedbrydning bruges senere af B1).

**Files:**
- Modify: `pricing.js`
- Modify: `pricing.test.mjs`

- [ ] **Step 1: Tilføj fejlende tests**

Tilføj til `pricing.test.mjs`:

```js
import { componentsOf, totalOf, ELAFGIFT, ENERGINET, MOMS } from './pricing.js';

const REC = { DKK_per_kWh: 0.50, time_start: '2026-01-13T18:00:00+01:00' }; // vinter, spids
const CFG = { markup: 8, tariff: DSO_TARIFFS.n1 };

test('componentsOf: enkeltkomponenter er korrekte', () => {
  const c = componentsOf(REC, CFG);
  assert.equal(c.spot, 0.50 * 100 * MOMS);   // spot inkl. moms = 62,5
  assert.equal(c.elafgift, ELAFGIFT);         // 1,0
  assert.equal(c.energinet, ENERGINET);       // 14,375
  assert.equal(c.nettarif, 99);               // N1 vinter spids
  assert.equal(c.markup, 8);
});

test('componentsOf: sum af komponenter == total (invariant)', () => {
  const c = componentsOf(REC, CFG);
  const sum = c.spot + c.elafgift + c.energinet + c.nettarif + c.markup;
  assert.ok(Math.abs(sum - c.total) < 1e-9, `sum ${sum} != total ${c.total}`);
});

test('totalOf == componentsOf(...).total', () => {
  assert.equal(totalOf(REC, CFG), componentsOf(REC, CFG).total);
});

test('totalOf reagerer på valgt DSO', () => {
  const n1 = totalOf(REC, { markup:8, tariff:DSO_TARIFFS.n1 });
  const trefor = totalOf(REC, { markup:8, tariff:DSO_TARIFFS.trefor });
  assert.notEqual(n1, trefor); // TREFOR vinter spids 73 != N1 99
  assert.equal(n1 - trefor, 99 - 73);
});

test('konstanter har de verificerede 2026-værdier', () => {
  assert.equal(ELAFGIFT, 1.0);     // 0,8 øre ekskl. × 1,25 (Skat 2026–2027)
  assert.equal(ENERGINET, 14.375); // 11,5 øre ekskl. × 1,25 (Energinet 2026)
  assert.equal(MOMS, 1.25);
});
```

- [ ] **Step 2: Kør og verificér fejl**

Run: `node --test`
Expected: FAIL — `componentsOf is not a function`.

- [ ] **Step 3: Tilføj konstanter + funktioner til `pricing.js`**

Indsæt konstanterne øverst i `pricing.js` (under header-kommentaren, før `DSO_TARIFFS`):

```js
export const ELAFGIFT = 1.0;     // 0,8 øre ekskl. moms × 1,25 (Skat, midlertidig nedsættelse 2026–2027)
export const ENERGINET = 14.375; // 11,5 øre ekskl. moms × 1,25 — system- + transmissionstarif (Energinet 2026)
export const MOMS = 1.25;
```

Tilføj funktionerne (efter `nettarif`):

```js
export function componentsOf(rec, cfg){
  const spot = rec.DKK_per_kWh * 100 * MOMS;
  const t = parseDK(rec.time_start);
  const net = nettarif(t.h, t.monthIdx, cfg.tariff);
  const total = spot + ELAFGIFT + ENERGINET + net + cfg.markup;
  return { spot, elafgift:ELAFGIFT, energinet:ENERGINET, nettarif:net, markup:cfg.markup, total };
}

export function totalOf(rec, cfg){
  return componentsOf(rec, cfg).total;
}
```

- [ ] **Step 4: Kør og verificér pass**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pricing.js pricing.test.mjs
git commit -m "feat: componentsOf price breakdown + verified 2026 levies"
```

---

## Task 5: `tierOf`, `loHi`, `bestWindow` (TDD)

**Files:**
- Modify: `pricing.js`
- Modify: `pricing.test.mjs`

- [ ] **Step 1: Tilføj fejlende tests**

Tilføj til `pricing.test.mjs`:

```js
import { tierOf, loHi, bestWindow } from './pricing.js';

test('tierOf: null og flad serie giver tier 0', () => {
  assert.equal(tierOf(null, 0, 100), 0);
  assert.equal(tierOf(50, 10, 10.5), 0); // hi-lo < 1
});

test('tierOf: tre niveauer ud fra position i lo–hi', () => {
  assert.equal(tierOf(10, 10, 110), 0);  // f=0 → billig
  assert.equal(tierOf(60, 10, 110), 1);  // f=0.5 → middel
  assert.equal(tierOf(110, 10, 110), 2); // f=1 → dyr
});

test('loHi: min og max af værdier', () => {
  assert.deepEqual(loHi([30, 10, 20]), [10, 30]);
});

test('bestWindow: finder billigste sammenhængende vindue', () => {
  const pool = [10,9,8,50,60].map((total,i)=>({ total, h:i }));
  const w = bestWindow(pool, 2);
  assert.equal(w.from.h, 1); // 9+8 er billigst
  assert.equal(w.to.h, 2);
  assert.equal(w.avg, 8.5);
});

test('bestWindow: tom pool giver null', () => {
  assert.equal(bestWindow([], 3), null);
});
```

- [ ] **Step 2: Kør og verificér fejl**

Run: `node --test`
Expected: FAIL — `tierOf is not a function`.

- [ ] **Step 3: Tilføj funktionerne til `pricing.js`** (flyttet fra `index.html:135-149`, med tom-pool-guard)

```js
export function tierOf(p, lo, hi){
  if (p == null) return 0;
  if (hi - lo < 1) return 0;
  const f = (p - lo) / (hi - lo);
  return f < .34 ? 0 : (f < .67 ? 1 : 2);
}

export function loHi(values){
  return [Math.min(...values), Math.max(...values)];
}

export function bestWindow(pool, len){
  if (!pool.length) return null;
  if (pool.length < len) len = pool.length;
  let best = null;
  for (let i = 0; i + len <= pool.length; i++){
    let s = 0;
    for (let j = 0; j < len; j++) s += pool[i+j].total;
    const avg = s / len;
    if (!best || avg < best.avg) best = { avg, from:pool[i], to:pool[i+len-1], len };
  }
  return best;
}
```

- [ ] **Step 4: Kør og verificér pass**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pricing.js pricing.test.mjs
git commit -m "feat: tierOf/loHi/bestWindow in pricing module with tests"
```

---

## Task 6: `seriesForDay` — data-drevet serie der overlever DST (TDD)

Dette er spec A3's kerne. Den rene funktion testes med syntetiske 23/25-timers døgn.

**Files:**
- Modify: `pricing.js`
- Modify: `pricing.test.mjs`

- [ ] **Step 1: Tilføj fejlende tests**

Tilføj til `pricing.test.mjs`:

```js
import { seriesForDay } from './pricing.js';

const CFG6 = { markup: 0, tariff: DSO_TARIFFS.n1 };
const mkRec = (iso) => ({ DKK_per_kWh: 0.10, time_start: iso });

test('seriesForDay: normalt døgn giver 24 timer i rækkefølge', () => {
  const raw = Array.from({length:24}, (_,h)=>mkRec(`2026-06-13T${String(h).padStart(2,'0')}:00:00+02:00`));
  const s = seriesForDay(raw, '2026-6-13', CFG6);
  assert.equal(s.length, 24);
  assert.equal(s[0].h, 0);
  assert.equal(s[23].h, 23);
  assert.ok(s.every(x => typeof x.total === 'number'));
});

test('seriesForDay: forårs-DST (23 timer, kl 02 mangler) uden huller', () => {
  // 29. marts 2026: kl 02 springes over, offset skifter +01 -> +02
  const hours = [0,1,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
  const raw = hours.map(h => mkRec(`2026-03-29T${String(h).padStart(2,'0')}:00:00+0${h<2?'1':'2'}:00`));
  const s = seriesForDay(raw, '2026-3-29', CFG6);
  assert.equal(s.length, 23);
  assert.ok(s.every(x => x.total != null), 'ingen null-huller');
});

test('seriesForDay: efterårs-DST (25 timer, kl 02 to gange)', () => {
  // 25. oktober 2026: kl 02 forekommer to gange (offset +02 så +01)
  const recs = [];
  for (let h=0; h<2; h++) recs.push(mkRec(`2026-10-25T0${h}:00:00+02:00`));
  recs.push(mkRec('2026-10-25T02:00:00+02:00'));
  recs.push(mkRec('2026-10-25T02:00:00+01:00'));
  for (let h=3; h<24; h++) recs.push(mkRec(`2026-10-25T${String(h).padStart(2,'0')}:00:00+01:00`));
  const s = seriesForDay(recs, '2026-10-25', CFG6);
  assert.equal(s.length, 25);
  assert.equal(s.filter(x => x.h === 2).length, 2); // begge kl-02-timer bevaret
});

test('seriesForDay: filtrerer på dayKey', () => {
  const raw = [
    mkRec('2026-06-13T10:00:00+02:00'),
    mkRec('2026-06-14T10:00:00+02:00'),
  ];
  assert.equal(seriesForDay(raw, '2026-6-13', CFG6).length, 1);
});
```

- [ ] **Step 2: Kør og verificér fejl**

Run: `node --test`
Expected: FAIL — `seriesForDay is not a function`.

- [ ] **Step 3: Tilføj `seriesForDay` til `pricing.js`**

API'et leverer records i kronologisk rækkefølge; vi bevarer den (ingen re-sort, så DST-dubletter ikke kolliderer på `h`).

```js
// Returnerer kun de timer der faktisk findes for dagen — typisk 24, men
// 23/25 på DST-skiftedage. Bevarer API'ets kronologiske rækkefølge.
export function seriesForDay(raw, dayKey, cfg){
  const out = [];
  for (const r of raw){
    const t = parseDK(r.time_start);
    if (t.dayKey === dayKey) out.push({ h: t.h, total: totalOf(r, cfg) });
  }
  return out;
}
```

- [ ] **Step 4: Kør og verificér pass**

Run: `node --test`
Expected: PASS — alle tests inkl. de tre DST-scenarier.

- [ ] **Step 5: Commit**

```bash
git add pricing.js pricing.test.mjs
git commit -m "feat: data-driven seriesForDay surviving DST transitions"
```

---

## Task 7: Wire `pricing.js` ind i `index.html` (module-import, fjern duplikering)

Ren refaktor — ingen funktionel ændring endnu. UI ser stadig N1, fast 24-graf.

**Files:**
- Modify: `index.html` (script-blok `47-479`)
- Modify: `sw.js`

- [ ] **Step 1: Gør scriptet til et modul og importér**

I `index.html`, ændr åbnings-tagget på linje 47 fra `<script>` til:

```html
<script type="module">
"use strict";
import {
  ELAFGIFT, ENERGINET, MOMS, DSO_TARIFFS, season, parseDK,
  nettarif, componentsOf, totalOf, tierOf, loHi, bestWindow, seriesForDay
} from './pricing.js';
```

- [ ] **Step 2: Fjern de nu-flyttede definitioner fra `index.html`**

Slet følgende, som nu kommer fra modulet:
- Linje 51 (`const ELAFGIFT=…` rækken med `ELAFGIFT, ENERGINET, MOMS`).
- Linje 52 (`const N1={…}`) — erstattes helt af importeret `DSO_TARIFFS`.
- Linje 53 (`const season=…`).
- Linje 54 (`function nettarif…`).
- Linje 56-57 (`function parseDK…`).
- Linje 135 (`function tierOf…`).
- Linje 136 (`function loHi…`).
- Linje 143-149 (`function bestWindow…`).
- Linje 104-108 (`function totalOf…`) — erstattes (se Step 3).

Behold `pad`, `kr`, `THEMES`, `volt`, `app`, `loadState`, `saveState`, `dayURL`, `fetchDay`, `load`, `keyOf`, `futurePool`, `sameDay`, `isTomorrow`, `winStr`, `whenText`, `KWH`, `bumpStreak`, `computeView` og alt DOM-relateret.

- [ ] **Step 3: Tilføj cfg-hjælpere og opdatér kald**

Tilføj efter `app`-objektet (omkring tidligere linje 93):

```js
function currentTariff(){
  return app.state.dso === 'custom'
    ? app.state.customTariff
    : (DSO_TARIFFS[app.state.dso] || DSO_TARIFFS.n1);
}
function cfg(){ return { markup: app.state.markup, tariff: currentTariff() }; }
```

`futurePool` (tidl. linje 137-142) kalder `totalOf(r)` → ret til `totalOf(r, cfg())`.

- [ ] **Step 4: Tilføj `dso` + `customTariff` til state**

Ret `app.state`-initialiseringen (tidl. linje 91) så den inkluderer:

```js
dso:'n1',
customTariff:{ winter:{lav:11,hoej:33,spids:99}, summer:{lav:11,hoej:17,spids:43} },
```

Ret `saveState` (tidl. linje 99-100) til at persistere dem:

```js
function saveState(){
  const {theme,region,markup,bilH,opvaskH,vaskH,dso,customTariff}=app.state;
  localStorage.setItem('elpriser_state',JSON.stringify({theme,region,markup,bilH,opvaskH,vaskH,dso,customTariff}));
}
```

- [ ] **Step 5: Sikr at inline-handlers stadig virker (module-scope)**

Module-scope eksponerer ikke funktioner globalt. `index.html:469-471` sætter allerede `window.X=X` for de inline `onclick`-handlers. Bekræft at disse window-assignments stadig står efter refaktoren (de skal blive). Ingen ændring her — kun verifikation.

- [ ] **Step 6: Tilføj `pricing.js` til service worker-cachen**

I `sw.js`: bump cache-navnet (linje 2) til `'elpriser-v3'` og tilføj `'pricing.js'` til `SHELL` (linje 3-9):

```js
const CACHE = 'elpriser-v3';
const SHELL = [
  'index.html',
  'pricing.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];
```

- [ ] **Step 7: Verificér i browser (HARD RULE — visuel)**

Start en lokal server: `python3 -m http.server 8000` i repo-roden. Åbn `http://localhost:8000` i dev-browser, hard-reload (cmd+shift+R).
Verificér visuelt på desktop + 390px:
- Appen loader priser og rendrer som før (soft-tema, graf, apparat-kort).
- Ingen console-fejl (særligt ingen module/import-fejl).
- Indstillinger åbner; knapper (tema, refresh) virker (bekræfter window-handlers).
Tag screenshot OG `Read` PNG'en. Kommentér konkret hvad du ser før "verificeret".

- [ ] **Step 8: Kør unit-tests (skal stadig være grønne)**

Run: `node --test`
Expected: PASS (modulet er uændret; kun index.html importerer det nu).

- [ ] **Step 9: Commit**

```bash
git add index.html sw.js
git commit -m "refactor: import pricing.js into index.html, add dso state (no behaviour change)"
```

---

## Task 8: A1 — NETSELSKAB-vælger i settings-sheet

**Files:**
- Modify: `index.html` (`sheetHTML` + actions)

- [ ] **Step 1: Tilføj NETSELSKAB-sektion i `sheetHTML`**

I `sheetHTML` (tidl. linje 397-436), efter PRISOMRÅDE-blokken (tidl. linje 423-424) og før ELHANDLER-TILLÆG, indsæt:

```js
${lbl('NETSELSKAB')}
<div style="display:flex;flex-wrap:wrap;gap:9px;margin-bottom:${app.state.dso==='custom'?'14px':'24px'};">
  ${Object.entries(DSO_TARIFFS).map(([key,d])=>{
    const a=app.state.dso===key;
    return `<button onclick="setDso('${key}')" style="flex:1 1 30%;padding:11px 0;border-radius:14px;border:2px solid ${a?th.accent:th.border};background:${a?th.accentSoft:th.surface};color:${th.text};font:inherit;font-weight:700;font-size:13px;cursor:pointer;">${d.navn}</button>`;
  }).join('')}
  ${(()=>{const a=app.state.dso==='custom';
    return `<button onclick="setDso('custom')" style="flex:1 1 30%;padding:11px 0;border-radius:14px;border:2px solid ${a?th.accent:th.border};background:${a?th.accentSoft:th.surface};color:${th.text};font:inherit;font-weight:700;font-size:13px;cursor:pointer;">Andet</button>`;})()}
</div>
${app.state.dso==='custom' ? customTariffHTML(th) : ''}
```

- [ ] **Step 2: Tilføj `customTariffHTML`-hjælper**

Tilføj nær `sheetHTML` (genbruger den eksisterende `step()`-stil). De seks felter dækker lav/høj/spids × vinter/sommer:

```js
function customTariffHTML(th){
  const ct=app.state.customTariff;
  const cell=(seasonKey,band)=>`<div style="display:flex;align-items:center;gap:6px;">
    <button onclick="adjCustom('${seasonKey}','${band}',-1)" style="width:30px;height:30px;border-radius:9px;border:1px solid ${th.border};background:${th.surface};color:${th.text};font:inherit;font-size:17px;font-weight:700;cursor:pointer;">−</button>
    <span style="min-width:34px;text-align:center;font-weight:800;font-size:14px;">${ct[seasonKey][band]}</span>
    <button onclick="adjCustom('${seasonKey}','${band}',1)" style="width:30px;height:30px;border-radius:9px;border:1px solid ${th.border};background:${th.surface};color:${th.text};font:inherit;font-size:17px;font-weight:700;cursor:pointer;">+</button>
  </div>`;
  const col=(seasonKey,title)=>`<div style="flex:1;">
    <div style="font-size:11px;font-weight:800;color:${th.muted};margin-bottom:8px;">${title} (øre/kWh)</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:${th.muted};">Lav</span>${cell(seasonKey,'lav')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:${th.muted};">Høj</span>${cell(seasonKey,'hoej')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;color:${th.muted};">Spids</span>${cell(seasonKey,'spids')}</div>
    </div></div>`;
  return `<div style="display:flex;gap:16px;background:${th.surface};border:1px solid ${th.border};border-radius:16px;padding:14px;margin-bottom:24px;">
    ${col('winter','Vinter')}${col('summer','Sommer')}</div>`;
}
```

- [ ] **Step 3: Tilføj `setDso` og `adjCustom` actions + window-eksport**

Nær de øvrige actions (tidl. linje 459-471):

```js
function setDso(key){ app.state.dso=key; saveState(); render(); }
function adjCustom(seasonKey,band,d){
  const v=app.state.customTariff[seasonKey][band];
  app.state.customTariff[seasonKey][band]=Math.max(0,Math.min(400,v+d));
  saveState(); render();
}
window.setDso=setDso; window.adjCustom=adjCustom;
```

- [ ] **Step 4: Verificér i browser (HARD RULE — visuel)**

Lokal server kører. Hard-reload. Åbn Indstillinger.
Verificér på desktop + 390px:
- NETSELSKAB-sektion viser 6 selskaber + "Andet"; valgt selskab er fremhævet.
- Tryk fx Cerius → luk sheet → **NU-prisen ændrer sig** (Cerius har højere tarif end N1). Genåbn → Cerius stadig valgt (persisteret).
- Tryk "Andet" → 6 step-felter (vinter+sommer) vises; +/− ændrer tal og prisen reagerer.
- Test i alle tre temaer (soft/bold/play).
Screenshot + `Read` for hver kontrol. Kommentér konkret.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: net company selector with custom tariff entry (A1)"
```

---

## Task 9: A3 — data-drevet `computeView` + `chartHTML`

Skift fra fast `Array(24)` til `seriesForDay`-lister. Kun graf-bygning og afledte
opslag ændres; tema-layouts kalder uændret `chartHTML(V.chartArr, …)`.

**Files:**
- Modify: `index.html` (`computeView` + `chartHTML` + `ringHTML`)

- [ ] **Step 1: Erstat `seriesFor` med liste-baseret data i `computeView`**

Slet den gamle `seriesFor` (tidl. linje 127-132). I `computeView` (tidl. linje 170-209) bygges nu lister og afledte værdier af lister. Erstat toppen af `computeView` til og med `peak`-beregningen med:

```js
function computeView(){
  const now=new Date(), nowH=now.getHours();
  const todayList=seriesForDay(app.raw, keyOf(now), cfg());
  const tmr=new Date(); tmr.setDate(tmr.getDate()+1);
  const tmrList=seriesForDay(app.raw, keyOf(tmr), cfg());
  const hasToday=todayList.length>0, hasTmr=tmrList.length>0;
  const todayVals=todayList.map(x=>x.total);
  const [loT,hiT]=hasToday?loHi(todayVals):[0,1];

  const nowEntry=todayList.find(x=>x.h===nowH);
  const nowTotal=nowEntry?nowEntry.total:(todayVals[0]??0);
  const nowTier=tierOf(nowTotal,loT,hiT);
  const peak=hasToday?Math.max(...todayVals):0;

  // billig-vindue ud fra faktiske timer ≥ nowH
  const byHour=h=>todayList.find(x=>x.h===h);
  let ce=nowH; while(ce<24 && byHour(ce) && tierOf(byHour(ce).total,loT,hiT)===0) ce++;
  const cheapEnd=pad(Math.min(ce,24))+':00';
  let nc=-1; for(let h=nowH;h<24;h++){const e=byHour(h); if(e && tierOf(e.total,loT,hiT)===0){nc=h;break;}}
  const nextCheap=nc>=0?pad(nc)+':00':'i morgen';
  const cheapUntil = nowTier===0?cheapEnd:nextCheap;
```

- [ ] **Step 2: Opdatér resten af `computeView` til lister**

Erstat de resterende referencer til `todayArr`/`tmrArr` i `computeView` (tidl. linje 188-208):

```js
  const pool=futurePool();
  const dayAvg=todayVals.length?todayVals.reduce((a,b)=>a+b,0)/todayVals.length:0;
  const mkAp=(emoji,name,verb,len,kwh)=>{const w=bestWindow(pool,len);
    const saveKr=Math.max(0,(dayAvg-(w?w.avg:dayAvg))/100*kwh);
    return {emoji,name,sub:len+' timers '+verb,win:winStr(w),when:whenText(w),price:kr(w?w.avg:0),save:saveKr.toFixed(0)};};
  const appliances=[
    mkAp('🚗','Elbilen','ladning',app.state.bilH,KWH.bil),
    mkAp('🍽️','Opvask','program',app.state.opvaskH,KWH.opvask),
    mkAp('👕','Vasketøj','program',app.state.vaskH,KWH.vask)
  ];
  const savedToday=Math.round(appliances.reduce((a,b)=>a+(+b.save),0));
  const score=hasToday?Math.round(Math.max(0,Math.min(100,(peak-nowTotal)/Math.max(1,peak-loT)*100))):0;

  const showToday=app.state.chartTab==='today';
  return {now,nowH,nowTotal,nowTier,peak,cheapUntil,cheapEnd,nextCheap,
    appliances,savedToday,score,streak:STREAK,
    todayList,tmrList,hasToday,hasTmr,
    chartList:showToday?todayList:tmrList,chartNowH:showToday?nowH:-1,
    regionLabel:app.state.region==='DK1'?'DK1 · VEST':'DK2 · ØST',regionShort:app.state.region,
    nowKr:kr(nowTotal),peakKr:kr(peak)};
}
```

Note: `chartArr`→`chartList` og `todayArr/tmrArr`→`todayList/tmrList` i retur-objektet.

- [ ] **Step 3: Gør `chartHTML` data-drevet**

Erstat `chartHTML` (tidl. linje 212-230). Tager nu en liste af `{h,total}`:

```js
function chartHTML(list,th,nowH,opts){
  opts=opts||{};
  if(!list.length) return `<div style="padding:28px 6px;text-align:center;color:${th.muted};font-size:13px;line-height:1.6;">Morgendagens priser kommer typisk efter kl. 13.<br>Kig forbi igen senere 🙂</div>`;
  const vals=list.map(x=>x.total);
  const [lo,hi]=[Math.min(...vals),Math.max(...vals)];
  const max=hi, H=opts.h||128, gap=opts.gap||2.5;
  const bars=list.map(({h:hr,total:p})=>{
    const h=Math.max(7,Math.round(p/max*100));
    const col=th.pal[tierOf(p,lo,hi)];
    const isNow=hr===nowH;
    return `<div class="bar" title="kl ${pad(hr)}:00 · ${kr(p)} kr" style="flex:1 1 0;min-width:0;height:${h}%;background:${col};border-radius:5px 5px 2px 2px;position:relative;${isNow?'box-shadow:0 0 0 2.5px '+th.ring+';':''}">${isNow?`<span style="position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-size:9px;font-weight:800;letter-spacing:.04em;color:${th.ring}">NU</span>`:''}</div>`;
  }).join('');
  return `<div><div style="display:flex;align-items:flex-end;gap:${gap}px;height:${H}px;padding-top:14px;">${bars}</div>
    <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:10px;font-weight:600;color:${th.axis};">
    <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div>`;
}
```

- [ ] **Step 4: Opdatér `ringHTML` og kald-steder til liste-form**

`ringHTML` (tidl. linje 231-248) bruger 24-array. Konvertér internt til opslag via liste. Erstat funktionens top:

```js
function ringHTML(list,th,nowH){
  if(!list.length) return `<div style="padding:40px 6px;text-align:center;color:${th.muted};font-size:13px;">Morgendagens priser kommer efter kl. 13 🙂</div>`;
  const byH=h=>list.find(x=>x.h===h);
  const vals=list.map(x=>x.total);
  const [lo,hi]=[Math.min(...vals),Math.max(...vals)];
  const pal=['#2BC48A','#FFB020','#FF5470'];
  const segs=[];
  for(let i=0;i<24;i++){const e=byH(i);const p=e?e.total:lo;segs.push(pal[tierOf(p,lo,hi)]+' '+(i*15)+'deg '+((i+1)*15)+'deg');}
  let dot='';
  if(nowH>=0){const a=(nowH*15+7.5)*Math.PI/180,r=92,c=115;const x=c+r*Math.sin(a),y=c-r*Math.cos(a);
    dot=`<div style="position:absolute;left:${x-9}px;top:${y-9}px;width:18px;height:18px;border-radius:50%;background:#2a2140;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);"></div>`;}
  const centerEntry=byH(nowH>=0?nowH:list[0].h)||list[0];
  const centerVal=centerEntry.total;
  return `<div style="position:relative;width:230px;height:230px;margin:0 auto;">
    <div style="position:absolute;inset:0;border-radius:50%;background:conic-gradient(${segs.join(',')});-webkit-mask:radial-gradient(circle,transparent 56%,#000 57%);mask:radial-gradient(circle,transparent 56%,#000 57%);"></div>
    ${dot}
    <div style="position:absolute;inset:24%;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:20px;box-shadow:0 10px 30px rgba(108,75,216,.18);">
      <div style="font-family:'Baloo 2',sans-serif;font-weight:800;font-size:30px;color:#2a2140;line-height:1;">${kr(centerVal)}</div>
      <div style="font-size:11px;font-weight:700;color:#948aa8;">kr/kWh</div></div></div>`;
}
```

Opdatér kald i tema-layouts: `chartHTML(V.chartArr,…)` → `chartHTML(V.chartList,…)` og `ringHTML(V.chartArr,…)` → `ringHTML(V.chartList,…)`. Søg efter `V.chartArr` i `viewSoft`/`viewBold`/`viewPlay` (tidl. linje 305, 342, 380) og i play-temaets `V.chartArr.some(...)` (tidl. linje 381) → `V.chartList.some(...)`.

- [ ] **Step 5: Verificér i browser (HARD RULE — visuel)**

Lokal server, hard-reload. Verificér desktop + 390px, alle tre temaer:
- Bar-grafen rendrer normalt (24 søjler i dag), NU-markør på rette søjle.
- "I morgen"-fanen virker (tom-besked før kl. 13 / søjler efter).
- Play-temaets ring rendrer med farver og center-pris.
- Apparat-anbefalinger og spar-tal vises.
Screenshot + `Read`. Kommentér konkret (fx "24 søjler, NU på kl. X, ingen huller").

- [ ] **Step 6: Kør unit-tests**

Run: `node --test`
Expected: PASS (modul uændret).

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: data-driven chart/series, DST-safe rendering (A3)"
```

---

## Task 10: Slutverifikation + opdatér README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Opdatér README's opbygnings-tabel**

Tilføj rækker for de nye filer i tabellen (tidl. linje 15-21):

```markdown
| `pricing.js` | Ren pris-motor (afgifter, tariffer, serier) — unit-testet |
| `pricing.test.mjs` | Unit-tests for pris-motoren (`npm test` / `node --test`) |
```

Tilføj et "Test"-afsnit efter Opbygning:

```markdown
## Test

Pris-motoren er dækket af unit-tests (Node v18+ indbygget runner, ingen deps):

    node --test
```

- [ ] **Step 2: Fuld unit-test-kørsel**

Run: `node --test`
Expected: PASS — alle tests grønne.

- [ ] **Step 3: Endelig visuel regression (HARD RULE)**

Lokal server, hard-reload. Gå hele appen igennem på desktop + 390px:
- Skift netselskab N1 → Radius → Cerius → Andet; bekræft prisen ændrer sig hver gang.
- Skift region DK1/DK2 (genindlæser data).
- Skift alle tre temaer; graf + ring + apparat-kort korrekte.
- Ingen console-fejl.
Tag screenshots af hvert tema + custom-input og `Read` dem. Skriv en kort konkret konklusion pr. screenshot før du kalder det verificeret.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document pricing module and tests"
```

---

## Self-Review (udført ved plan-skrivning)

- **Spec-dækning:** A1 (Task 8 + DSO_TARIFFS i Task 2 + state i Task 7), A2 (Task 4 — begge afgiftstal verificeret korrekte: elafgift 1,0 / Energinet 14,375, dokumenteret i kode), A3 (Task 6 ren funktion + Task 9 UI), Delte refaktorer #1 komponent-nedbrydning (Task 4). Delte refaktorer #2 (chartHTML klik) og #3 (Eloverblik-wizard) hører til Plan 2/3 og er bevidst ude.
- **Placeholder-scan:** Ingen TBD/TODO; al kode er konkret.
- **Type-konsistens:** `cfg = {markup, tariff}`, `componentsOf`-retur, og `seriesForDay → [{h,total}]` bruges konsistent på tværs af Task 4/6/7/9. Retur-feltet hedder `chartList` overalt efter Task 9 (gammelt `chartArr` fjernet i samme task).

## Ikke i denne plan
- Volt-animationer (Del C) → Plan 2.
- Klik-på-time + detalje-panel (B1) → Plan 2 (bruger `componentsOf` fra denne plan).
- Eloverblik + gamification (B2/B3) → Plan 3.
