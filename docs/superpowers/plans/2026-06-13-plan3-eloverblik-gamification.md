# Plan 3 — Eloverblik-forbrug + verificeret gamification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Forbind appen til den enkeltes faktiske times-forbrug via Eloverblik, lad brugeren selvrapportere "jeg kører den nu" pr. apparat, verificér rapporterne mod det faktiske forbrug 1-2 døgn senere, og optjen rigtige point/streak/badges.

**Architecture:** Ren client-side i `index.html` + et nyt `eloverblik.js`-modul. **Ingen backend/proxy** — CORS verificeret 2026-06-13: `GET /api/token`, `GET /api/meteringpoints/meteringpoints` og `POST /api/meterdata/gettimeseries/...` returnerer alle `access-control-allow-origin: *` (preflight 204). Verificerings-logikken er rene funktioner i `gamify.js` (unit-testet). Al data ligger i localStorage på enheden.

**Tech Stack:** Vanilla JS (ESM), Eloverblik CustomerApi, `node --test`. Ingen build.

Spec: `docs/superpowers/specs/2026-06-13-elpriser-samlet-design.md` (Del B2 + B3).

**Afhænger af Plan 1+2** (samme branch): `pricing.js`, `cfg()`, data-drevet graf, klik-panel, Volt (inkl. `cheer`-state der aktiveres her ved badge-unlock).

---

## Verificeret Eloverblik CustomerApi-kontrakt (2026-06-13)

- **Liveness:** `GET /customerapi/api/isalive` → 200 `true`.
- **Token:** `GET /customerapi/api/token` med header `Authorization: Bearer <refresh_token>` → JSON `{ result: <data_access_token> }`. Data-access-token er gyldig ~24t; refresh-token ~1 år (oprettes af brugeren på eloverblik.dk via MitID → Datadeling → Opret token).
- **Målepunkter:** `GET /customerapi/api/meteringpoints/meteringpoints` med `Authorization: Bearer <data_access_token>` → `{ result: [ { meteringPointId, ... typeOfMP, streetName, ... } ] }`.
- **Tidsserie:** `POST /customerapi/api/meterdata/gettimeseries/{dateFrom}/{dateTo}/{aggregation}` (aggregation=`Hour`, datoer `YYYY-MM-DD`) med `Authorization: Bearer <data_access_token>`, `Content-Type: application/json`, body `{ "meteringPoints": { "meteringPoint": ["<id>"] } }` → CIM-agtig JSON med `result[].MyEnergyData_MarketDocument.TimeSeries[].Period[].Point[]` hvor hvert point har `position` (1..24) og `out_Quantity.quantity` (kWh).
- **CORS:** preflight 204 med `access-control-allow-origin: *` for alle tre (token GET, meteringpoints GET, timeseries POST). Direkte browser-kald virker.
- **Bemærk:** Eksakte felt-navne i timeseries-responsen verificeres mod et RIGTIGT kald under implementering (kræver brugerens token). Parsing isoleres i én funktion (`parseTimeSeries`) så formatet kan justeres ét sted.

**Datagrundlag/forsinkelse (ærlighed i UI):** måledata er typisk 1-2 døgn forsinket. Gamification er retrospektiv — en rapport verificeres når dagens data er klar. Dette kommunikeres i UI'et.

---

## File Structure

- **Create `eloverblik.js`** — Eloverblik API-klient: `getAccessToken(refreshToken)`, `getMeteringPoints(accessToken)`, `getTimeSeries(accessToken, mpId, fromISO, toISO)`, `parseTimeSeries(json)` → `{ [dayKey]: number[24] }`. Netværks-kald isoleret her.
- **Create `gamify.js`** — rene funktioner: `verifyClaim(claim, hourlyKwh, prices)` → `'confirmed'|'unconfirmed'`, `pointsFor(claim, prices)`, `badgeUpdates(state, claims)`, `smartScore(hourlyKwh, prices)`. Unit-testet.
- **Create `gamify.test.mjs`**, **Create `eloverblik.test.mjs`** (sidstnævnte tester kun `parseTimeSeries` mod et fixture, ikke live-kald).
- **Modify `index.html`** — Eloverblik setup-wizard i settings, "Jeg kører den nu"-knap på apparat-kort, claims-rendering, ægte badges/score i play-tema, Volt `cheer` ved badge-unlock, ny state + persistence.
- **Modify `sw.js`** — tilføj `eloverblik.js`, `gamify.js` til SHELL; bump cache til `elpriser-v4`.

**Interfaces (fastlagt):**
```js
// eloverblik.js
getAccessToken(refreshToken) -> Promise<string>            // throws Error('token') på 401/fejl
getMeteringPoints(accessToken) -> Promise<Array<{id, label}>>
getTimeSeries(accessToken, mpId, fromISO, toISO) -> Promise<object>  // rå JSON
parseTimeSeries(json) -> { [dayKey:string]: number[] }     // dayKey '${y}-${m}-${d}', kWh pr. time (index=hour)

// gamify.js
verifyClaim(claim, hourlyKwh, prices) -> 'confirmed'|'unconfirmed'
  // claim: {apparat, startHour, varighed, dato, tierVedStart}
  // hourlyKwh: number[24] for claim.dato (fra Eloverblik); prices: number[24] totalpris for claim.dato
pointsFor(claim, prices) -> number       // vægtet efter kWh flyttet til billige timer
smartScore(hourlyKwh, prices) -> number  // 0-100, % af forbrug i billige timer
badgeUpdates(gamify, claims) -> { natteravn, sparefugl, dage30, sandsiger }  // booleans
```

localStorage-nøgler: `elpriser_eloverblik` `{refreshToken, meteringPointId, accessToken, accessTokenExp}`, `elpriser_claims` (array), `elpriser_gamify` `{totalPoint, streak, lastConfirmedDate, badges}`, `elpriser_consumption` (cache `{[dayKey]:number[24]}`).

---

## Task 1: `gamify.js` ren verificerings- + point-logik (TDD)

**Files:** Create `gamify.js`, `gamify.test.mjs`.

- [ ] **Step 1: Failing tests** (`gamify.test.mjs`):
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyClaim, pointsFor, smartScore } from './gamify.js';

// 24h arrays helper
const flat = v => Array(24).fill(v);

test('verifyClaim: bekræftet når forbrug forhøjet i vinduet og i billig tier', () => {
  const kwh = flat(0.1); kwh[2]=2.0; kwh[3]=2.0;           // højt forbrug kl 2-3
  const prices = flat(200); prices[2]=50; prices[3]=50;     // billige timer kl 2-3
  const claim = { apparat:'bil', startHour:2, varighed:2, dato:'2026-6-13', tierVedStart:0 };
  assert.equal(verifyClaim(claim, kwh, prices), 'confirmed');
});

test('verifyClaim: ikke bekræftet uden forhøjet forbrug', () => {
  const kwh = flat(0.1);
  const prices = flat(100);
  const claim = { apparat:'bil', startHour:2, varighed:2, dato:'2026-6-13', tierVedStart:0 };
  assert.equal(verifyClaim(claim, kwh, prices), 'unconfirmed');
});

test('verifyClaim: ikke bekræftet hvis forbrug lå i dyre timer', () => {
  const kwh = flat(0.1); kwh[18]=2.0; kwh[19]=2.0;         // højt forbrug i dyre timer
  const prices = flat(50); prices[18]=300; prices[19]=300;
  const claim = { apparat:'bil', startHour:18, varighed:2, dato:'2026-6-13', tierVedStart:2 };
  assert.equal(verifyClaim(claim, kwh, prices), 'unconfirmed');
});

test('pointsFor: flere point når mere kWh flyttet til billigere end dagsgennemsnit', () => {
  const prices = flat(200); prices[2]=50;
  const cheap = pointsFor({startHour:2,varighed:1}, prices);
  const expensive = pointsFor({startHour:18,varighed:1}, (()=>{const p=flat(200);p[18]=400;return p;})());
  assert.ok(cheap > 0);
  assert.ok(cheap >= expensive);
});

test('smartScore: 100 når alt forbrug i billige timer, lav når i dyre', () => {
  const prices = flat(300); prices[2]=20; prices[3]=20;
  const allCheap = flat(0); allCheap[2]=1; allCheap[3]=1;
  const allExpensive = flat(0); allExpensive[18]=1;
  prices[18]=300;
  assert.ok(smartScore(allCheap, prices) > smartScore(allExpensive, prices));
  assert.ok(smartScore(allCheap, prices) <= 100 && smartScore(allCheap, prices) >= 0);
});
```

- [ ] **Step 2: Run → FAIL** (`node --test`).
- [ ] **Step 3: Implement `gamify.js`:**
```js
// gamify.js — ren verificerings- og point-logik. Ingen DOM, ingen netværk.
import { loHi, tierOf } from './pricing.js';

// Bekræftet hvis: forbruget i [startHour, startHour+varighed) er forhøjet ift.
// dagens median OG de timer overvejende lå i billig/middel tier.
export function verifyClaim(claim, hourlyKwh, prices){
  const win = [];
  for(let h=claim.startHour; h<claim.startHour+claim.varighed && h<24; h++) win.push(h);
  if(!win.length) return 'unconfirmed';
  const median = [...hourlyKwh].sort((a,b)=>a-b)[Math.floor(hourlyKwh.length/2)];
  const winAvg = win.reduce((s,h)=>s+hourlyKwh[h],0)/win.length;
  const elevated = winAvg > Math.max(median*1.5, median+0.2);
  const [lo,hi] = loHi(prices);
  const cheapish = win.every(h => tierOf(prices[h],lo,hi) <= 1);
  return (elevated && cheapish) ? 'confirmed' : 'unconfirmed';
}

// Point = kWh-vægtet besparelse ift. dagsgennemsnit, kun positive.
export function pointsFor(claim, prices){
  const avg = prices.reduce((a,b)=>a+b,0)/prices.length;
  let pts = 0;
  for(let h=claim.startHour; h<claim.startHour+claim.varighed && h<24; h++){
    pts += Math.max(0, (avg - prices[h]) / 10); // 10 øre besparelse ≈ 1 point
  }
  return Math.round(pts);
}

// % af forbrug der lå i billige timer (tier 0).
export function smartScore(hourlyKwh, prices){
  const total = hourlyKwh.reduce((a,b)=>a+b,0);
  if(total<=0) return 0;
  const [lo,hi] = loHi(prices);
  let cheap = 0;
  for(let h=0;h<24;h++){ if(tierOf(prices[h],lo,hi)===0) cheap += hourlyKwh[h]; }
  return Math.round(Math.min(100, Math.max(0, cheap/total*100)));
}
```
- [ ] **Step 4: Run → PASS.** Commit: `feat: gamify verification/points/score pure logic with tests`

---

## Task 2: `eloverblik.js` API-klient + `parseTimeSeries` (TDD for parsing)

**Files:** Create `eloverblik.js`, `eloverblik.test.mjs`.

- [ ] **Step 1: Failing parse test** (`eloverblik.test.mjs`) — fixture mirrors the CIM shape:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeSeries } from './eloverblik.js';

const FIXTURE = { result: [ { MyEnergyData_MarketDocument: { TimeSeries: [ { Period: [ {
  timeInterval: { start: '2026-06-12T22:00:00Z', end: '2026-06-13T22:00:00Z' },
  Point: Array.from({length:24},(_,i)=>({ position:String(i+1), 'out_Quantity.quantity':String((i*0.1).toFixed(3)) }))
} ] } ] } } ] };

test('parseTimeSeries: mapper til {dayKey: number[24]}', () => {
  const out = parseTimeSeries(FIXTURE);
  const keys = Object.keys(out);
  assert.equal(keys.length, 1);
  const arr = out[keys[0]];
  assert.equal(arr.length, 24);
  assert.equal(arr[0], 0);
  assert.ok(Math.abs(arr[10]-1.0) < 1e-9);
});

test('parseTimeSeries: tomt/uventet input → {}', () => {
  assert.deepEqual(parseTimeSeries({}), {});
  assert.deepEqual(parseTimeSeries(null), {});
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `eloverblik.js`:**
```js
// eloverblik.js — Eloverblik CustomerApi-klient. CORS-verificeret (origin *).
const BASE = 'https://api.eloverblik.dk/customerapi/api';

async function call(url, opts){
  const r = await fetch(url, opts);
  if(!r.ok) throw new Error('eloverblik:'+r.status);
  return r.json();
}

export async function getAccessToken(refreshToken){
  const j = await call(`${BASE}/token`, { headers:{ Authorization:`Bearer ${refreshToken}` } });
  if(!j || !j.result) throw new Error('eloverblik:token');
  return j.result;
}

export async function getMeteringPoints(accessToken){
  const j = await call(`${BASE}/meteringpoints/meteringpoints`, { headers:{ Authorization:`Bearer ${accessToken}` } });
  const list = (j && j.result) || [];
  return list.map(m => ({
    id: m.meteringPointId,
    label: [m.streetName, m.buildingNumber, m.cityName].filter(Boolean).join(' ') || m.meteringPointId
  }));
}

export async function getTimeSeries(accessToken, mpId, fromISO, toISO){
  return call(`${BASE}/meterdata/gettimeseries/${fromISO}/${toISO}/Hour`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ meteringPoints:{ meteringPoint:[mpId] } })
  });
}

// Map CIM-document → { dayKey: number[24] } (kWh pr. time, index = position-1).
export function parseTimeSeries(json){
  const out = {};
  try {
    const docs = json.result || [];
    for(const d of docs){
      const series = d.MyEnergyData_MarketDocument.TimeSeries || [];
      for(const ts of series){
        for(const per of (ts.Period||[])){
          const start = new Date(per.timeInterval.start); // UTC start of the day-window
          // Eloverblik day-window starts 22:00Z/23:00Z previous day = local midnight.
          const local = new Date(start.getTime());
          const y=local.getFullYear(), m=local.getMonth()+1, day=local.getDate()+1; // +1: window starts prev evening
          const dayKey = `${y}-${m}-${day}`;
          const arr = out[dayKey] || Array(24).fill(0);
          for(const p of (per.Point||[])){
            const idx = (+p.position) - 1;
            if(idx>=0 && idx<24) arr[idx] = +p['out_Quantity.quantity'] || 0;
          }
          out[dayKey] = arr;
        }
      }
    }
  } catch(e){ return out; }
  return out;
}
```
- [ ] **Step 4: Run → PASS.** Note: the dayKey derivation from `timeInterval.start` MUST be verified against a real response in Task 6 (the +1/timezone handling is the fragile part). Add a `// VERIFICÉR mod rigtigt kald` comment.
- [ ] **Step 5: Commit:** `feat: eloverblik API client + timeseries parser with tests`

---

## Task 3: Eloverblik setup-wizard i settings

**Files:** Modify `index.html`.

- [ ] **Step 1: State + import.** Add to `app.state`: `eloverblik:{refreshToken:'',meteringPointId:'',accessToken:'',accessTokenExp:0}`, `wizardStep:0` (ephemeral, reset in loadState), `meteringPoints:[]` (ephemeral). Persist only the `eloverblik` object in saveState. Import `getAccessToken, getMeteringPoints` from `./eloverblik.js`.
- [ ] **Step 2: Wizard UI.** In `sheetHTML`, add a section "FORBRUGSDATA (ELOVERBLIK)" after APPARATER. If not connected (`!app.state.eloverblik.refreshToken`), show a "Forbind til Eloverblik"-button → `startWizard()`. If connected, show the metering-point address + "Afbryd". The wizard renders as steps (use `app.state.wizardStep`):
  - Step 0: Hvad & hvorfor (kort tekst) + "Næste".
  - Step 1: "Få din nøgle" — nummererede trin + knap der åbner `https://eloverblik.dk` i ny fane (log ind med MitID → Datadeling → Opret token → kopiér). + "Næste".
  - Step 2: paste-felt (textarea) + "Test forbindelse" → `testEloverblik()` (veksler token via getAccessToken, henter målepunkter; viser ✓ + adresse eller en klar fejl).
  - Step 3: vælg målepunkt (hvis flere) → "Færdig".
  Keep wizard markup isolated in a `wizardHTML(th)` helper.
- [ ] **Step 3: Actions** `startWizard()`, `wizardNext()`, `testEloverblik()` (async; on success store accessToken+exp+meteringPoints, advance), `pickMeteringPoint(id)`, `disconnectEloverblik()`. All `window.`-exported. Errors surfaced via a message in the wizard (NO silent failure).
- [ ] **Step 4: Headless** `node --test` (still passes; index.html change only), syntax-check. Commit: `feat: Eloverblik setup wizard (B2)`. **Visual + live test by controller** (needs user's refresh-token).

---

## Task 4: Selvrapportering ("Jeg kører den nu") + claims

**Files:** Modify `index.html`.

- [ ] **Step 1: State.** `app.state` gets nothing new (claims live in their own localStorage key `elpriser_claims`). Add load/save helpers `loadClaims()`/`saveClaims(arr)`.
- [ ] **Step 2: Button on appliance cards.** In all three views' appliance rows, add a small "Jeg kører den nu"-button → `logClaim('bil'|'opvask'|'vask')`. (Apparat-nøgle already known per row.)
- [ ] **Step 3: Action `logClaim(apparat)`** — builds `{ id:<dato+apparat+startHour>, apparat, dato:keyOf(now), startHour:now.getHours(), varighed:<fra settings>, tierVedStart:<nuværende tier for apparat-vinduet>, status:'pending', point:0 }`, pushes to claims, saves, toast/visual feedback, render. `window`-export.
- [ ] **Step 4:** Show today's pending claims somewhere visible (e.g. under appliances): "Du har markeret: 🚗 kl 14 (afventer data)". Commit: `feat: per-appliance self-reported claims (B3)`. Controller visual check.

---

## Task 5: Verificering + point/streak/badges (ægte gamification)

**Files:** Modify `index.html`; import from `gamify.js` + `eloverblik.js`.

- [ ] **Step 1: Import** `verifyClaim, pointsFor, smartScore` from `./gamify.js`; `getTimeSeries, parseTimeSeries, getAccessToken` from `./eloverblik.js`.
- [ ] **Step 2: Consumption fetch + cache.** Add `async function refreshConsumption()` — for any claim with `status:'pending'` whose `dato` is ≥1 day old, ensure a valid accessToken (re-mint from refreshToken if `accessTokenExp` passed), fetch timeseries for the needed date range, `parseTimeSeries`, cache to `elpriser_consumption`. Guard: only if connected. Errors → leave pending, surface a non-blocking message.
- [ ] **Step 3: Verify pending claims.** For each pending claim with consumption available for its `dato`: compute `prices = seriesForDay(...).map(total)` for that day (need totalpris array; reuse pricing), call `verifyClaim(claim, hourlyKwh, prices)`; set status; if confirmed, `claim.point = pointsFor(claim, prices)`. Update `elpriser_gamify` (totalPoint += , streak via lastConfirmedDate consecutive days, badges via `badgeUpdates`). Save.
- [ ] **Step 4: `badgeUpdates`** in gamify.js (add + test): natteravn (confirmed claim with startHour<6), sparefugl (≥N confirmed total), dage30 (streak>=30), sandsiger (≥N confirmed = reports matched reality). Add unit tests mirroring Task 1's style.
- [ ] **Step 5: Wire into play-theme badges + score.** Replace the cosmetic play-theme badges with real ones from `elpriser_gamify.badges`; show `totalPoint` and real `streak`; show passive `smartScore` (today, if consumption available) as info. When a NEW badge unlocks during verify, trigger Volt `cheer` briefly (set a transient flag the next render reads).
- [ ] **Step 6:** Call `refreshConsumption().then(verifyPending).then(render)` after `load()` and on visibilitychange (debounced). Commit: `feat: claim verification + real points/streak/badges (B3)`.
- [ ] **Step 7:** `node --test` green (gamify badge tests added). Controller does live+visual verification.

---

## Task 6: Live integration test + slutverifikation

**Files:** Modify `sw.js` (SHELL + cache bump); possibly fix `parseTimeSeries` per real data.

- [ ] **Step 1:** `sw.js` → `CACHE='elpriser-v4'`, add `eloverblik.js` + `gamify.js` to SHELL.
- [ ] **Step 2: LIVE test (needs user's refresh-token).** With a real refresh-token: run the wizard, confirm token exchange, metering-point list, and a real timeseries fetch. Inspect the actual response shape and FIX `parseTimeSeries`' dayKey/timezone derivation if it differs from the fixture. Add/adjust a fixture test to match reality.
- [ ] **Step 3: Visual regression (controller, HARD RULE)** in all three themes, desktop+390px: wizard steps render; connect works; claim button logs; pending claim shows; after consumption available a claim flips to confirmed with points; play-theme shows real badges/score; Volt `cheer` fires on unlock; reduced-motion respected. Screenshot + Read each.
- [ ] **Step 4:** `node --test` all green. Final spec + code-quality review. Commit any fixes.

---

## Self-Review (ved plan-skrivning)
- **Spec coverage:** B2 (wizard, token-flow) → Tasks 2-3; B3 (claims, verify, points/streak/badges) → Tasks 1,4,5; Volt `cheer` on unlock → Task 5. Datamodel keys all created. CORS/no-backend confirmed in Architecture.
- **Placeholders:** Network response shapes for token/meteringpoints are verified; timeseries parse is fixture-tested with an explicit "verify against real call" gate in Task 6 (honest unknown, not a hidden placeholder).
- **Type consistency:** `parseTimeSeries → {dayKey:number[24]}` consumed by verify/score which take `hourlyKwh:number[24]` + `prices:number[24]`; `claim` shape identical across logClaim/verifyClaim/pointsFor.

## Risici
- `parseTimeSeries` dayKey/timezone derivation — explicit verify gate (Task 6).
- Live token test requires user MitID-created refresh-token — flagged to user.
- Verification thresholds (median×1.5) — start simple, tune after real data.
