import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeSeries, parseBuckets } from './eloverblik.js';

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
  assert.deepEqual(parseTimeSeries({result:[]}), {});
});

test('parseTimeSeries: manglende Point-array håndteres', () => {
  const f = { result:[{ MyEnergyData_MarketDocument:{ TimeSeries:[{ Period:[{ timeInterval:{start:'2026-06-12T22:00:00Z'} }] }] } }] };
  const out = parseTimeSeries(f);
  // a day with all-zero array or empty — must not throw
  assert.equal(typeof out, 'object');
});

// Day-aggregering: hvert Point i perioden er en hel dag (position = dag-offset).
const DAY_FIXTURE = { result: [ { MyEnergyData_MarketDocument: { TimeSeries: [ { Period: [ {
  resolution: 'P1D',
  timeInterval: { start: '2026-05-31T22:00:00Z', end: '2026-06-03T22:00:00Z' },
  Point: [
    { position: '1', 'out_Quantity.quantity': '12.5' },
    { position: '2', 'out_Quantity.quantity': '8.0' },
    { position: '3', 'out_Quantity.quantity': '10.25' },
  ]
} ] } ] } } ] };

test('parseBuckets: Day → {dayKey: total} med ét bucket pr. dag', () => {
  const out = parseBuckets(DAY_FIXTURE, 'Day');
  const keys = Object.keys(out).sort();
  assert.equal(keys.length, 3);
  // første dag = startdato (lokalt) + dag-offset. Sum bevares.
  const total = Object.values(out).reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(total - 30.75) < 1e-9);
  assert.ok(Object.values(out).includes(12.5));
});

// Ægte Day-aggregering fra DataHub: ÉN Period pr. dag, hver med ét Point på position 1.
// (verificeret mod rigtigt svar 2026-06-13). parseBuckets SKAL iterere ALLE Periods og
// nøgle hver efter sin egen Period.timeInterval.start — ikke kun Period[0].
const DAY_MULTI_PERIOD_FIXTURE = { result: [ { MyEnergyData_MarketDocument: { TimeSeries: [ { Period: [
  { resolution: 'P1D', timeInterval: { start: '2026-05-31T22:00:00Z', end: '2026-06-01T22:00:00Z' },
    Point: [ { position: '1', 'out_Quantity.quantity': '12.5' } ] },
  { resolution: 'P1D', timeInterval: { start: '2026-06-01T22:00:00Z', end: '2026-06-02T22:00:00Z' },
    Point: [ { position: '1', 'out_Quantity.quantity': '8.0' } ] },
  { resolution: 'P1D', timeInterval: { start: '2026-06-02T22:00:00Z', end: '2026-06-03T22:00:00Z' },
    Point: [ { position: '1', 'out_Quantity.quantity': '10.25' } ] },
] } ] } } ] };

test('parseBuckets: Day med MANGE Periods (én pr. dag) → ét bucket pr. dag, korrekt nøglet', () => {
  const out = parseBuckets(DAY_MULTI_PERIOD_FIXTURE, 'Day');
  const keys = Object.keys(out).sort();
  assert.equal(keys.length, 3);
  // hver Period nøgles efter sin EGEN start (+2h nudge → lokal dag)
  assert.equal(out['2026-6-1'], 12.5);
  assert.equal(out['2026-6-2'], 8.0);
  assert.equal(out['2026-6-3'], 10.25);
  const total = Object.values(out).reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(total - 30.75) < 1e-9);
});

const MONTH_FIXTURE = { result: [ { MyEnergyData_MarketDocument: { TimeSeries: [ { Period: [ {
  resolution: 'P1M',
  timeInterval: { start: '2025-12-31T23:00:00Z', end: '2026-03-31T22:00:00Z' },
  Point: [
    { position: '1', 'out_Quantity.quantity': '300' },
    { position: '2', 'out_Quantity.quantity': '280' },
    { position: '3', 'out_Quantity.quantity': '310' },
  ]
} ] } ] } } ] };

test('parseBuckets: Month → {monthKey: total} med ét bucket pr. måned', () => {
  const out = parseBuckets(MONTH_FIXTURE, 'Month');
  const keys = Object.keys(out);
  assert.equal(keys.length, 3);
  const total = Object.values(out).reduce((a,b)=>a+b,0);
  assert.equal(total, 890);
});

test('parseBuckets: tomt/uventet input → {}', () => {
  assert.deepEqual(parseBuckets({}, 'Day'), {});
  assert.deepEqual(parseBuckets(null, 'Month'), {});
});
