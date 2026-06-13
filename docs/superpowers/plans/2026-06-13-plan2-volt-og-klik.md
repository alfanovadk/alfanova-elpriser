# Plan 2 — Volt animeret maskot + klik-på-time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Erstat den statiske Volt-maskot med en animeret tilstandsmaskine der afspejler prisniveauet (glad/neutral/arrig) + loading, respektér `prefers-reduced-motion`, og gør prisgrafen interaktiv: klik på en time → detalje-panel med fuld pris-komponent-nedbrydning.

**Architecture:** Ren client-side i `index.html`. Volt's SVG + CSS kopieres fra den autoritative kilde `docs/superpowers/specs/assets/volt-animationer.html` (allerede i repoet) og inlines. Prisnedbrydningen genbruger `componentsOf` fra `pricing.js` (re-importeres). Grafen (data-drevet efter Plan 1) får klik-handlers pr. søjle.

**Tech Stack:** Vanilla JS (ESM), inline SVG/CSS, `node --test` for ren logik. Ingen build-step.

Spec: `docs/superpowers/specs/2026-06-13-elpriser-samlet-design.md` (Del C + Feature B1).

**Afhænger af Plan 1** (allerede merged ind på denne branch): `pricing.js` med `componentsOf`, data-drevet `chartHTML(list,…)`, `cfg()`-helper.

---

## File Structure

- **Modify `index.html`** — (1) tilføj Volt-keyframes/state-CSS til `<style>`; (2) erstat `volt()` med `voltSVG(stateClass,size,stroke)` + `voltState(tier)` helper; (3) brug Volt-state i de tre views + loading; (4) re-importér `componentsOf`; (5) `selectedHour` state + klik-handlers i `chartHTML`; (6) detalje-panel.
- **Modify `pricing.js`** — tilføj en triviel ren helper `tierClass(tier)` (mapping 0/1/2 → 'cheap'/'mid'/'expensive') så den kan unit-testes.
- **Modify `pricing.test.mjs`** — test `tierClass`.

**Volt-tilstande (fra kildefilen) brugt i denne plan:** `cheap` (tier 0), `mid` (tier 1), `expensive` (tier 2), `charge` (loading). `cheer`/`wink` hører til gamification (Plan 3) og er IKKE med her.

---

## Task 1: `tierClass` ren helper (TDD)

**Files:**
- Modify: `pricing.js`
- Modify: `pricing.test.mjs`

- [ ] **Step 1: Tilføj fejlende test** til `pricing.test.mjs`:

```js
import { tierClass } from './pricing.js';

test('tierClass: mapper pris-tier til Volt-tilstandsklasse', () => {
  assert.equal(tierClass(0), 'cheap');
  assert.equal(tierClass(1), 'mid');
  assert.equal(tierClass(2), 'expensive');
  assert.equal(tierClass(99), 'mid'); // ukendt → neutral fallback
});
```

- [ ] **Step 2: Kør og verificér fejl.** Run: `node --test` → FAIL (`tierClass is not a function`).

- [ ] **Step 3: Implementér** i `pricing.js`:

```js
// Pris-tier (0=billig,1=middel,2=dyr) → Volt-maskottens tilstandsklasse.
export function tierClass(tier){
  return tier === 0 ? 'cheap' : (tier === 2 ? 'expensive' : 'mid');
}
```

- [ ] **Step 4: Kør og verificér pass.** Run: `node --test` → 24 pass.

- [ ] **Step 5: Commit.**
```bash
git add pricing.js pricing.test.mjs
git commit -m "feat: tierClass helper mapping price tier to Volt state"
```
End commit messages in this plan with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Task 2: Volt CSS + `voltSVG` funktion

**Files:**
- Modify: `index.html` (`<style>` block + the `volt()` function)

**Source of truth:** READ `docs/superpowers/specs/assets/volt-animationer.html`. It contains:
- A `<style>` block with `@keyframes` (blink, pupilHide, float, hop, glowGreen, sparklePop, cheapDance, buzz, zapRed, glowRed, crackle, charge, glowY) and state classes (`.blink`, `.idle`, `.mid`, `.cheap`, `.expensive`, `.charge`, plus base `.char`/`.bolt`/`.eye`/`.pupil`/`.brow`/`.mouth-mad`/`.spark`/`.sparkle`).
- A `voltSVG(stateClass)` JS function returning the rich SVG (bolt + eyes + pupils + mad mouth + brows + happy mouth + spark/sparkle paths).

- [ ] **Step 1: Copy the Volt CSS into index.html's `<style>`**, but split motion from state so reduced-motion users get a static-but-correct mascot.

  Add the **static** rules (always applied) directly:
  - `.char{transform-box:fill-box;transform-origin:center}` `.bolt{...}` `.eye,.pupil{transform-box:fill-box;transform-origin:center}` `.brow,.mouth-mad,.spark,.sparkle{opacity:0}`
  - State color/face rules that are NOT animations: `.cheap .bolt{fill:#34B27B}`, `.expensive .eye{transform:scaleY(.5)}`, `.expensive .mouth-happy{opacity:0}`, `.expensive .mouth-mad{opacity:1}`, `.expensive .brow{opacity:1}`.

  Wrap ALL `@keyframes` definitions AND every rule that sets an `animation:` property inside:
  ```css
  @media (prefers-reduced-motion: no-preference){
    /* @keyframes blink {…} … all keyframes … */
    /* .blink .eye{animation:…}  .idle .char{animation:…}  .cheap .char{animation:cheapDance…}  .cheap{animation:glowGreen…}  .cheap .sparkle{animation:sparklePop…}  .expensive{animation:glowRed…}  .expensive .char{animation:buzz…}  .expensive .bolt{animation:zapRed…}  .charge{animation:charge…}  .charge .char{animation:charge…} etc. */
  }
  ```
  Keep the existing `voltbob`/`spin`/`pop`/`fadein`/`slideup` keyframes; the app still uses `pop`/`spin`/`slideup`. You may keep `voltbob` or remove it once nothing references it (see Task 3 — old `volt()` used it). Verify with grep before removing.

  IMPORTANT: the `.cheap .bolt{fill}` and `.expensive` face rules must stay OUTSIDE the media query so the tier is visually distinguishable even with reduced motion. Only the movement (transforms/glows over time) goes inside.

- [ ] **Step 2: Replace the `volt(size,stroke,withFace)` function with `voltSVG(stateClass,size,stroke)`.** Base the SVG markup on the kildefil's `voltSVG`, but: (a) accept `size` (width/height) and `stroke` (outline color, default `'#11352b'`) as params and inject them (replace the file's hardcoded `#11352b` strokes with `${stroke}`); (b) put `class="${stateClass}"` on the root `<svg>`; (c) include `width`/`height="${size}"` and `style="display:block;overflow:visible;flex-shrink:0;"`.

  Signature: `function voltSVG(stateClass, size, stroke){ stroke = stroke || '#11352b'; return \`<svg viewBox="0 0 120 120" class="${stateClass}" width="${size}" height="${size}" style="display:block;overflow:visible;flex-shrink:0;"> … </svg>\`; }`

  Add the small helper right after:
  ```js
  function voltState(V){ return app.loading ? 'charge' : tierClass(V.nowTier); }
  ```
  (`tierClass` is imported from pricing.js — see Task 4 for the import line update; for this task add `tierClass` to the import now.)

- [ ] **Step 3: Update the import line** in index.html to add `tierClass`:
  `import { DSO_TARIFFS, parseDK, totalOf, tierOf, loHi, bestWindow, seriesForDay, tierClass } from './pricing.js';`

- [ ] **Step 4: Headless check.** Run `node --test` (24 pass). Extract the index.html script and `node --check` for syntax. Do NOT claim visual verification.

- [ ] **Step 5: Commit.**
```bash
git add index.html
git commit -m "feat: animated Volt state machine + reduced-motion support (Del C)"
```

---

## Task 3: Wire Volt-state into the three views + loading

**Files:**
- Modify: `index.html` (`viewSoft`, `viewBold`, `viewPlay`, and the loading branch in `render`)

- [ ] **Step 1: Replace `volt(...)` calls with `voltSVG(...)`.** Find every `volt(` call in the three view functions and convert:
  - `viewSoft` hero: `volt(78,'#11352b')` → `voltSVG(voltState(V),78,'#11352b')`
  - `viewBold` brand: `volt(26,'#0C1117',false)` → `voltSVG(voltState(V),26,'#0C1117')` (the rich SVG always has a face; the old `withFace=false` brand-mark just won't be face-less — acceptable, it's tiny; if it looks wrong the controller will flag it)
  - `viewBold` hero: `volt(46,'#0C1117')` → `voltSVG(voltState(V),46,'#0C1117')`
  - `viewPlay`: it currently inlines a hand-written SVG inside the ring (not a `volt()` call). Replace that inline `<svg …>…</svg>` with `voltSVG(voltState(V),58,'#2a2140')`, keeping its absolute-position wrapper styles. The existing guard `V.chartList.length?…:''` stays.
  Grep for `volt(` afterwards — zero remaining calls to the old function (only `voltSVG`/`voltState` remain).

- [ ] **Step 2: Charge-Volt during loading.** In `render()`'s `if(app.loading)` branch, replace the plain skeleton text with a charge-state Volt over the loading text, e.g.:
  ```js
  root.innerHTML=`<div class="skel">${voltSVG('charge',72,th.text)}<div style="margin-top:14px;">Henter elpriser…</div></div>`;
  ```
  (Note: `voltState` needs a `V`; in the loading branch there is no `V`, so pass the literal `'charge'` here.)

- [ ] **Step 3: Visual verification is done by the controller.** Headless: `node --test` (24 pass), `node --check` on the extracted script. Report DONE; do not claim visual verification.

- [ ] **Step 4: Commit.**
```bash
git add index.html
git commit -m "feat: Volt reflects price tier across all themes + charge on load"
```

---

## Task 4: B1 — klik-på-time detalje-panel

**Files:**
- Modify: `index.html` (import line, `chartHTML`, state, a new `detailHTML`, the three views, actions)

- [ ] **Step 1: Re-import `componentsOf`.** Update the import line to add `componentsOf`:
  `import { DSO_TARIFFS, parseDK, totalOf, componentsOf, tierOf, loHi, bestWindow, seriesForDay, tierClass } from './pricing.js';`

- [ ] **Step 2: Add `selectedHour` to state (NOT persisted).** In `app.state` add `selectedHour:null`. Do NOT add it to `saveState` (it's ephemeral, like `settingsOpen`). In `loadState`, after merging, reset `app.state.selectedHour=null` (mirror how `settingsOpen` is reset).

- [ ] **Step 3: Make chart bars clickable.** In `chartHTML(list,th,nowH,opts)`, add to each bar's markup an `onclick="selectHour(${hr})"` and `style="cursor:pointer;…"`. Also visually mark the selected bar: if `hr===app.state.selectedHour`, add an outline using `th.ring` (reuse the same box-shadow style as the NU marker but a thinner/different ring is fine — keep it simple: `outline:2px solid ${th.ring};outline-offset:1px;`). Keep the existing NU marker behavior.

- [ ] **Step 4: Add `detailHTML(V,th)` helper** that renders the breakdown for the selected hour. It looks up the selected record from the chart list and uses `componentsOf` via the raw record. Since `chartHTML` only has `{h,total}`, fetch the raw record for the breakdown from `app.raw` by matching day+hour. Implement a small lookup:

```js
function selectedRecord(V){
  if(app.state.selectedHour==null) return null;
  const dayKey = V.chartList===V.tmrList
    ? keyOf((()=>{const d=new Date();d.setDate(d.getDate()+1);return d;})())
    : keyOf(new Date());
  return app.raw.find(r=>{const t=parseDK(r.time_start); return t.dayKey===dayKey && t.h===app.state.selectedHour;}) || null;
}
function detailHTML(V,th){
  const rec=selectedRecord(V);
  if(!rec) return '';
  const c=componentsOf(rec,cfg());
  const h=app.state.selectedHour;
  const tier=tierOf(c.total, ...loHi(V.chartList.map(x=>x.total)));
  const tierTxt=['Billig','Middel','Dyr'][tier];
  const row=(label,val)=>`<div style="display:flex;justify-content:space-between;font-size:12.5px;color:${th.muted};padding:3px 0;"><span>${label}</span><span style="color:${th.text};font-weight:600;">${kr(val)} kr</span></div>`;
  return `<div class="pane" style="margin-top:14px;background:${th.surface};border:1px solid ${th.border};border-radius:18px;padding:16px;">
    <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;">
      <div><span style="font-weight:800;font-size:15px;color:${th.text};">kl ${pad(h)}:00–${pad((h+1)%24)}:00</span>
        <span style="margin-left:8px;font-size:11px;font-weight:800;color:${th.pal[tier]};">${tierTxt}</span></div>
      <button onclick="selectHour(null)" style="border:none;background:transparent;color:${th.muted};font-size:16px;cursor:pointer;">✕</button>
    </div>
    <div style="font-family:'Fredoka',sans-serif;font-weight:700;font-size:30px;color:${th.text};margin-bottom:10px;">${kr(c.total)} <span style="font-size:13px;font-weight:700;color:${th.muted};">kr/kWh</span></div>
    ${row('Spotpris (inkl. moms)',c.spot)}
    ${row('Elafgift',c.elafgift)}
    ${row('Energinet-tarif',c.energinet)}
    ${row('Nettarif',c.nettarif)}
    ${row('Elhandler-tillæg',c.markup)}
  </div>`;
}
```

- [ ] **Step 5: Render the panel under the chart in all three views.** In `viewSoft` and `viewBold`, immediately AFTER the `chartHTML(...)` call (inside the chart card / section), append `${detailHTML(V,th)}`. In `viewPlay` (ring), append `${detailHTML(V,th)}` after the ring block. Keep it inside the same container so it visually belongs to the chart.

- [ ] **Step 6: Add the `selectHour` action + window-export.**
```js
function selectHour(h){ app.state.selectedHour = (h===null||h===app.state.selectedHour) ? null : h; render(); }
window.selectHour=selectHour;
```
(Toggling the same hour, or passing null, closes the panel.)

- [ ] **Step 7: Reset selection when switching chart tab.** In `setChartTab`, set `app.state.selectedHour=null` before render (the hour index means different things on today vs tomorrow).

- [ ] **Step 8: Headless check.** `node --test` (24 pass), `node --check` on extracted script. Confirm `componentsOf` imported, `selectHour` defined + window-exported, `detailHTML`/`selectedRecord` defined.

- [ ] **Step 9: Commit.**
```bash
git add index.html
git commit -m "feat: click-on-hour detail panel with price breakdown (B1)"
```

---

## Task 5: Slutverifikation + spec/quality review

**Files:** none (verification only) — controller drives this.

- [ ] **Step 1:** `node --test` → 24 pass.
- [ ] **Step 2: Visual regression (controller, HARD RULE).** Local server; for EACH theme (soft/bold/play) on desktop + 390px:
  - Volt shows the correct state for the current tier (green hop / neutral / red buzz). Force tiers if needed by checking at a known hour, or trust the live tier.
  - Loading state briefly shows charge-Volt (or simulate by throttling).
  - Click a cheap hour and an expensive hour → detail panel folds out with correct breakdown (sum of components ≈ total) and tier label; ✕ closes it; clicking the same bar toggles it off.
  - Switching I dag/I morgen clears the selection.
  - Test with OS "reduce motion" on: Volt is static but still the correct color/face.
  - Screenshot each and `Read` it; comment concretely before declaring verified.
- [ ] **Step 3:** Spec-compliance review + code-quality review (subagents), fix any issues, then final review.

---

## Self-Review (udført ved plan-skrivning)
- **Spec coverage:** Del C (Volt cheap/mid/expensive + charge + reduced-motion) → Tasks 1-3; B1 (click-on-hour breakdown) → Task 4. `cheer`/`wink` deferred to Plan 3 (gamification) — explicitly out of scope.
- **Placeholder scan:** `detailHTML`/`selectedRecord` shown in full. The `...loHi(...)` spread in detailHTML's tier calc is real JS (spreads [lo,hi] into tierOf(total,lo,hi)) — verify the engine call reads `tierOf(c.total, lo, hi)`.
- **Type consistency:** `voltSVG(stateClass,size,stroke)` and `voltState(V)` used consistently; `tierClass` imported in Task 2 and used by `voltState`; `componentsOf(rec,cfg())` matches Plan 1's cfg shape; `selectedHour` is a number|null.

## Ikke i denne plan
- Eloverblik + gamification + cheer/wink Volt-states (Plan 3).
- Forbedring #4–#10 fra app-analysen (manifest-farver, debounce, fonts, SEO) — separat.
