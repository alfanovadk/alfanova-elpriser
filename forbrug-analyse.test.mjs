import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateByDay, aggregateByMonth, dayProfile, weekdayProfile,
  periodTotals, pctChange, tierSplit, toCSV, weekdayOf, monthKeyOf,
  co2Footprint, avgIntensity,
} from './forbrug-analyse.js';

test('aggregateByDay: summerer time-arrays pr. dag', () => {
  const hourly = {
    '2026-6-1': [1,2,3,...Array(21).fill(0)],   // sum = 6
    '2026-6-2': Array(24).fill(0.5),             // sum = 12
  };
  const out = aggregateByDay(hourly);
  assert.ok(Math.abs(out['2026-6-1'] - 6) < 1e-9);
  assert.ok(Math.abs(out['2026-6-2'] - 12) < 1e-9);
});

test('aggregateByDay: håndterer tomt input', () => {
  assert.deepEqual(aggregateByDay({}), {});
  assert.deepEqual(aggregateByDay(null), {});
});

test('aggregateByMonth: summerer dags-totaler pr. måned', () => {
  const daily = {
    '2026-1-5': 10,
    '2026-1-20': 5,
    '2026-2-3': 7,
    '2025-12-31': 3,
  };
  const out = aggregateByMonth(daily);
  assert.equal(out['2026-1'], 15);
  assert.equal(out['2026-2'], 7);
  assert.equal(out['2025-12'], 3);
});

test('dayProfile: gennemsnit pr. time-på-døgnet over flere dage', () => {
  const days = [
    [2,4,...Array(22).fill(0)],
    [4,8,...Array(22).fill(0)],
  ];
  const prof = dayProfile(days);
  assert.equal(prof.length, 24);
  assert.equal(prof[0], 3);   // (2+4)/2
  assert.equal(prof[1], 6);   // (4+8)/2
  assert.equal(prof[2], 0);
});

test('dayProfile: tomt input → 24 nuller', () => {
  const prof = dayProfile([]);
  assert.equal(prof.length, 24);
  assert.ok(prof.every(x => x === 0));
});

test('weekdayOf: 2026-06-13 er lørdag (6)', () => {
  assert.equal(weekdayOf('2026-6-13'), 6);
  assert.equal(weekdayOf('2026-6-14'), 0); // søndag
});

test('weekdayProfile: gennemsnit pr. ugedag', () => {
  // to mandage (4 og 6 → snit 5), én onsdag (10)
  const dayMap = {
    '2026-6-8': 4,    // mandag
    '2026-6-15': 6,   // mandag
    '2026-6-10': 10,  // onsdag
  };
  const prof = weekdayProfile(dayMap);
  assert.equal(prof.length, 7);
  assert.equal(prof[1], 5);   // mandag-snit
  assert.equal(prof[3], 10);  // onsdag
  assert.equal(prof[0], 0);   // søndag, ingen data
});

test('periodTotals: total, snit pr. dag, max', () => {
  const t = periodTotals({ '2026-6-1': 10, '2026-6-2': 20, '2026-6-3': 0 });
  assert.equal(t.total, 30);
  assert.equal(t.days, 3);
  assert.equal(t.avgPerDay, 10);
  assert.equal(t.max, 20);
  assert.equal(t.maxKey, '2026-6-2');
});

test('periodTotals: tomt → nuller, ingen division-med-0', () => {
  const t = periodTotals({});
  assert.equal(t.total, 0);
  assert.equal(t.days, 0);
  assert.equal(t.avgPerDay, 0);
  assert.equal(t.max, 0);
  assert.equal(t.maxKey, null);
});

test('pctChange: normal ændring', () => {
  assert.equal(pctChange(120, 100), 20);
  assert.equal(pctChange(80, 100), -20);
});

test('pctChange: divide-by-zero guard → null', () => {
  assert.equal(pctChange(50, 0), null);
});

test('pctChange: begge nul → null', () => {
  assert.equal(pctChange(0, 0), null);
});

test('tierSplit: fordeler kWh på billig/middel/dyr', () => {
  // 24 timer, 1 kWh hver. Priser stiger lineært → 8 billig, 8 middel, 8 dyr (ca.)
  const hourly = Array(24).fill(1);
  const prices = Array.from({length:24},(_,i)=>i); // 0..23 lineært
  const s = tierSplit(hourly, prices);
  assert.ok(Math.abs(s.cheap + s.mid + s.expensive - 24) < 1e-9);
  assert.ok(s.cheap > 0 && s.mid > 0 && s.expensive > 0);
  // tierOf med f<.34 billig, f<.67 middel: lo=0,hi=23 → billig idx 0-7 (8), middel 8-15 (8), dyr 16-23 (8)
  assert.ok(Math.abs(s.cheap - 8) < 1e-9);
});

test('tierSplit: uden priser → alt i mid', () => {
  const s = tierSplit(Array(24).fill(1), null);
  assert.equal(s.cheap, 0);
  assert.equal(s.expensive, 0);
  assert.equal(s.mid, 24);
});

test('toCSV: dag-rækker', () => {
  const csv = toCSV([
    { dato: '2026-06-01', kwh: 5.5 },
    { dato: '2026-06-02', kwh: 6.25 },
  ]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'dato;kwh');
  assert.equal(lines[1], '2026-06-01;5,5');
  assert.equal(lines[2], '2026-06-02;6,25');
});

test('toCSV: time- og kr-kolonner medtages når til stede', () => {
  const csv = toCSV([
    { dato: '2026-06-01', time: 0, kwh: 0.5, kr: 1.23 },
    { dato: '2026-06-01', time: 1, kwh: 0.7, kr: 1.50 },
  ]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'dato;time;kwh;kr');
  assert.equal(lines[1], '2026-06-01;00;0,5;1,23');
});

test('toCSV: tomt → kun header med dato;kwh', () => {
  assert.equal(toCSV([]).trim(), 'dato;kwh');
});

test('monthKeyOf: udleder år-måned fra dayKey', () => {
  assert.equal(monthKeyOf('2026-6-13'), '2026-6');
  assert.equal(monthKeyOf('2025-12-1'), '2025-12');
});

test('co2Footprint: 1 kWh × 100 g alle 24 timer → 2.4 kg', () => {
  const kwh = Array(24).fill(1);
  const co2 = Array(24).fill(100);
  assert.ok(Math.abs(co2Footprint(kwh, co2) - 2.4) < 1e-9);
});

test('co2Footprint: manglende timer bidrager med 0', () => {
  const kwh = [2, undefined, 3];           // kun time 0 og 2 har forbrug
  const co2 = [100, 100, 100];             // time 1 mangler kWh → 0 bidrag
  // (2*100 + 0 + 3*100)/1000 = 0.5
  assert.ok(Math.abs(co2Footprint(kwh, co2) - 0.5) < 1e-9);
});

test('co2Footprint: manglende co2-værdier behandles som 0', () => {
  const kwh = Array(24).fill(1);
  const co2 = [50];                        // kun time 0 har intensitet
  assert.ok(Math.abs(co2Footprint(kwh, co2) - 0.05) < 1e-9);
});

test('co2Footprint: tomt/null input → 0', () => {
  assert.equal(co2Footprint(null, null), 0);
  assert.equal(co2Footprint([], []), 0);
});

test('avgIntensity: forbrugs-vægtet snit', () => {
  // 1 kWh @ 50g + 3 kWh @ 150g = (50+450)/4 = 125 g/kWh
  const kwh = [1, 3];
  const co2 = [50, 150];
  assert.ok(Math.abs(avgIntensity(kwh, co2) - 125) < 1e-9);
});

test('avgIntensity: nul forbrug → 0 (ingen division-med-0)', () => {
  assert.equal(avgIntensity([0, 0], [100, 200]), 0);
  assert.equal(avgIntensity(null, null), 0);
});
