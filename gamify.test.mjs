import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyClaim, pointsFor, smartScore, badgeUpdates } from './gamify.js';

const flat = v => Array(24).fill(v);

test('verifyClaim: bekræftet når forbrug forhøjet i vinduet og i billig tier', () => {
  const kwh = flat(0.1); kwh[2]=2.0; kwh[3]=2.0;
  const prices = flat(200); prices[2]=50; prices[3]=50;
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
  const kwh = flat(0.1); kwh[18]=2.0; kwh[19]=2.0;
  const prices = flat(50); prices[18]=300; prices[19]=300;
  const claim = { apparat:'bil', startHour:18, varighed:2, dato:'2026-6-13', tierVedStart:2 };
  assert.equal(verifyClaim(claim, kwh, prices), 'unconfirmed');
});

test('verifyClaim: tomt vindue (varighed 0) → unconfirmed', () => {
  assert.equal(verifyClaim({startHour:2,varighed:0,dato:'x'}, flat(1), flat(1)), 'unconfirmed');
});

test('pointsFor: positive point når kørt i billige timer, 0 i dyre', () => {
  const prices = flat(200); prices[2]=50;
  const cheap = pointsFor({startHour:2,varighed:1}, prices);
  assert.ok(cheap > 0);
  const expPrices = flat(100); expPrices[18]=400;
  const expensive = pointsFor({startHour:18,varighed:1}, expPrices);
  assert.equal(expensive, 0); // dyrere end snit → ingen point (Math.max(0,...))
});

test('smartScore: højere når forbrug i billige timer', () => {
  const prices = flat(300); prices[2]=20; prices[3]=20; prices[18]=300;
  const allCheap = flat(0); allCheap[2]=1; allCheap[3]=1;
  const allExpensive = flat(0); allExpensive[18]=1;
  const sc = smartScore(allCheap, prices);
  assert.ok(sc > smartScore(allExpensive, prices));
  assert.ok(sc >= 0 && sc <= 100);
});

test('smartScore: intet forbrug → 0', () => {
  assert.equal(smartScore(flat(0), flat(100)), 0);
});

test('badgeUpdates: afledte badges fra bekræftede claims + streak', () => {
  const claims = [
    {status:'confirmed', startHour:3},  // nat
    {status:'confirmed', startHour:14},
    {status:'unconfirmed', startHour:2},
  ];
  const b = badgeUpdates({streak:30}, claims);
  assert.equal(b.natteravn, true);   // en bekræftet kl<6
  assert.equal(b.sparefugl, false);  // <5 bekræftede
  assert.equal(b.dage30, true);      // streak>=30
  assert.equal(b.sandsiger, false);  // <10 bekræftede
});

test('badgeUpdates: sparefugl ved 5, sandsiger ved 10 bekræftede', () => {
  const mk = n => Array.from({length:n},()=>({status:'confirmed',startHour:12}));
  assert.equal(badgeUpdates({streak:0}, mk(5)).sparefugl, true);
  assert.equal(badgeUpdates({streak:0}, mk(10)).sandsiger, true);
  assert.equal(badgeUpdates({streak:0}, mk(4)).sparefugl, false);
});
