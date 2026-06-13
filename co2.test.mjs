import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCO2, co2Url } from './co2.js';

test('co2Url: bygger dataset-URL med filter + lokal-tid-grænser', () => {
  const u = co2Url('DK1', '2026-06-13', '2026-06-14');
  assert.ok(u.startsWith('https://api.energidataservice.dk/dataset/CO2Emis?'));
  assert.ok(u.includes('start=2026-06-13T00:00'));
  assert.ok(u.includes('end=2026-06-14T00:00'));
  assert.ok(u.includes(encodeURIComponent(JSON.stringify({ PriceArea: 'DK1' }))));
});

test('parseCO2: snitter 5-min-værdier til time + ikke-paddet dayKey', () => {
  const recs = [
    { Minutes5DK: '2026-06-13T19:35:00', CO2Emission: 60 },
    { Minutes5DK: '2026-06-13T19:40:00', CO2Emission: 64 },   // time 19: snit = 62
    { Minutes5DK: '2026-06-13T20:00:00', CO2Emission: 100 },  // time 20: snit = 100
  ];
  const out = parseCO2(recs);
  const dk = '2026-6-13';   // ikke nul-paddet, matcher keyOf
  assert.ok(out[dk]);
  assert.equal(out[dk].length, 24);
  assert.ok(Math.abs(out[dk][19] - 62) < 1e-9);
  assert.ok(Math.abs(out[dk][20] - 100) < 1e-9);
  assert.equal(out[dk][0], 0);   // ingen data → 0
});

test('parseCO2: bucketter på tværs af dage', () => {
  const out = parseCO2([
    { Minutes5DK: '2026-06-13T23:55:00', CO2Emission: 50 },
    { Minutes5DK: '2026-06-14T00:00:00', CO2Emission: 80 },
  ]);
  assert.ok(Math.abs(out['2026-6-13'][23] - 50) < 1e-9);
  assert.ok(Math.abs(out['2026-6-14'][0] - 80) < 1e-9);
});

test('parseCO2: ignorerer ufuldstændige records', () => {
  const out = parseCO2([
    { Minutes5DK: null, CO2Emission: 60 },
    { Minutes5DK: '2026-06-13T10:00:00', CO2Emission: null },
    { Minutes5DK: '2026-06-13T10:05:00', CO2Emission: 70 },
  ]);
  assert.ok(Math.abs(out['2026-6-13'][10] - 70) < 1e-9);
});

test('parseCO2: tomt/null input → tomt objekt', () => {
  assert.deepEqual(parseCO2([]), {});
  assert.deepEqual(parseCO2(null), {});
});
