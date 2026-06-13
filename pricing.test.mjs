import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  season, nettarif, DSO_TARIFFS, parseDK,
  componentsOf, totalOf, ELAFGIFT, ENERGINET, MOMS,
  tierOf, loHi, bestWindow, seriesForDay, tierClass,
} from './pricing.js';

test('season: oktober-marts er vinter, april-september er sommer', () => {
  assert.equal(season(0), 'winter');
  assert.equal(season(2), 'winter');
  assert.equal(season(3), 'summer');
  assert.equal(season(8), 'summer');
  assert.equal(season(9), 'winter');
  assert.equal(season(11), 'winter');
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
  assert.equal(nettarif(3, 0, t), 11);
  assert.equal(nettarif(10, 0, t), 33);
  assert.equal(nettarif(18, 0, t), 99);
  assert.equal(nettarif(22, 0, t), 33);
});

test('nettarif: N1 sommer afviger fra vinter', () => {
  const t = DSO_TARIFFS.n1;
  assert.equal(nettarif(18, 5, t), 43);
  assert.equal(nettarif(3, 5, t), 11);
});

test('nettarif: spids-grænser er 17–20 inkl., 21 er høj', () => {
  const t = DSO_TARIFFS.cerius;
  assert.equal(nettarif(16, 0, t), 40);
  assert.equal(nettarif(17, 0, t), 120);
  assert.equal(nettarif(20, 0, t), 120);
  assert.equal(nettarif(21, 0, t), 40);
});

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

const REC = { DKK_per_kWh: 0.50, time_start: '2026-01-13T18:00:00+01:00' };
const CFG = { markup: 8, tariff: DSO_TARIFFS.n1 };

test('componentsOf: enkeltkomponenter er korrekte', () => {
  const c = componentsOf(REC, CFG);
  assert.equal(c.spot, 0.50 * 100 * MOMS);
  assert.equal(c.elafgift, ELAFGIFT);
  assert.equal(c.energinet, ENERGINET);
  assert.equal(c.nettarif, 99);
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
  assert.notEqual(n1, trefor);
  assert.equal(n1 - trefor, 99 - 73);
});

test('konstanter har de verificerede 2026-værdier', () => {
  assert.equal(ELAFGIFT, 1.0);
  assert.equal(ENERGINET, 14.375);
  assert.equal(MOMS, 1.25);
});

test('tierOf: null og flad serie giver tier 0', () => {
  assert.equal(tierOf(null, 0, 100), 0);
  assert.equal(tierOf(50, 10, 10.5), 0);
});

test('tierOf: tre niveauer ud fra position i lo–hi', () => {
  assert.equal(tierOf(10, 10, 110), 0);
  assert.equal(tierOf(60, 10, 110), 1);
  assert.equal(tierOf(110, 10, 110), 2);
});

test('tierClass: mapper pris-tier til Volt-tilstandsklasse', () => {
  assert.equal(tierClass(0), 'cheap');
  assert.equal(tierClass(1), 'mid');
  assert.equal(tierClass(2), 'expensive');
  assert.equal(tierClass(99), 'mid');
});

test('loHi: min og max af værdier', () => {
  assert.deepEqual(loHi([30, 10, 20]), [10, 30]);
});

test('loHi: filtrerer null/undefined fra', () => {
  assert.deepEqual(loHi([10, null, 20, undefined]), [10, 20]);
});

test('loHi: tom serie giver [0,1] (ingen Infinity)', () => {
  assert.deepEqual(loHi([]), [0, 1]);
});

test('bestWindow: finder billigste sammenhængende vindue', () => {
  const pool = [10,9,8,50,60].map((total,i)=>({ total, h:i }));
  const w = bestWindow(pool, 2);
  assert.equal(w.from.h, 1);
  assert.equal(w.to.h, 2);
  assert.equal(w.avg, 8.5);
});

test('bestWindow: tom pool giver null', () => {
  assert.equal(bestWindow([], 3), null);
});

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
  const hours = [0,1,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23];
  const raw = hours.map(h => mkRec(`2026-03-29T${String(h).padStart(2,'0')}:00:00+0${h<2?'1':'2'}:00`));
  const s = seriesForDay(raw, '2026-3-29', CFG6);
  assert.equal(s.length, 23);
  assert.ok(s.every(x => x.total != null), 'ingen null-huller');
});

test('seriesForDay: efterårs-DST (25 timer, kl 02 to gange)', () => {
  const recs = [];
  for (let h=0; h<2; h++) recs.push(mkRec(`2026-10-25T0${h}:00:00+02:00`));
  recs.push(mkRec('2026-10-25T02:00:00+02:00'));
  recs.push(mkRec('2026-10-25T02:00:00+01:00'));
  for (let h=3; h<24; h++) recs.push(mkRec(`2026-10-25T${String(h).padStart(2,'0')}:00:00+01:00`));
  const s = seriesForDay(recs, '2026-10-25', CFG6);
  assert.equal(s.length, 25);
  assert.equal(s.filter(x => x.h === 2).length, 2);
});

test('seriesForDay: filtrerer på dayKey', () => {
  const raw = [
    mkRec('2026-06-13T10:00:00+02:00'),
    mkRec('2026-06-14T10:00:00+02:00'),
  ];
  assert.equal(seriesForDay(raw, '2026-6-13', CFG6).length, 1);
});
