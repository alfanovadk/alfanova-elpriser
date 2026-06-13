// gamify.js — ren verificerings-, point- og badge-logik. Ingen DOM, ingen netværk.
import { loHi, tierOf } from './pricing.js';

// Vinduets timer [startHour, startHour+varighed) inden for døgnet.
function windowHours(claim){
  const h = [];
  for(let i=claim.startHour; i<claim.startHour+claim.varighed && i<24; i++) h.push(i);
  return h;
}

// Er et claim stadig «tændt» på (dayKey, hour)? Aktivt mens timen ligger i
// [startHour, startHour+varighed) samme dag — så «Tændt» slår selv fra efter varigheden.
export function claimActiveAt(claim, dayKey, hour){
  return claim.dato === dayKey && hour >= claim.startHour && hour < claim.startHour + claim.varighed;
}

// Slut-tidspunkt (klokketime, kan være halv) for et claim — til «Tændt · til X».
export function claimEndHour(claim){
  return Math.min(24, claim.startHour + claim.varighed);
}

// Bekræftet hvis forbruget i vinduet er forhøjet ift. dagens median OG timerne
// overvejende lå i billig/middel tier.
export function verifyClaim(claim, hourlyKwh, prices){
  const win = windowHours(claim);
  if(!win.length) return 'unconfirmed';
  const sorted = [...hourlyKwh].sort((a,b)=>a-b);
  const median = sorted[Math.floor(sorted.length/2)];
  const winAvg = win.reduce((s,h)=>s+hourlyKwh[h],0)/win.length;
  const elevated = winAvg > Math.max(median*1.5, median+0.2);
  const [lo,hi] = loHi(prices);
  const cheapish = win.every(h => tierOf(prices[h],lo,hi) <= 1);
  return (elevated && cheapish) ? 'confirmed' : 'unconfirmed';
}

// Point = kWh-uvægtet besparelse pr. time ift. dagsgennemsnit, kun positive.
// 10 øre under snit ≈ 1 point pr. time i vinduet.
export function pointsFor(claim, prices){
  const avg = prices.reduce((a,b)=>a+b,0)/prices.length;
  let pts = 0;
  for(const h of windowHours(claim)) pts += Math.max(0, (avg - prices[h]) / 10);
  return Math.round(pts);
}

// % af dagens forbrug der lå i billige timer (tier 0).
export function smartScore(hourlyKwh, prices){
  const total = hourlyKwh.reduce((a,b)=>a+b,0);
  if(total <= 0) return 0;
  const [lo,hi] = loHi(prices);
  let cheap = 0;
  for(let h=0; h<24; h++){ if(tierOf(prices[h],lo,hi)===0) cheap += hourlyKwh[h]; }
  return Math.round(Math.min(100, Math.max(0, cheap/total*100)));
}

// Afledte badge-tilstande fra bekræftede claims + streak.
export function badgeUpdates(gamify, claims){
  const confirmed = claims.filter(c => c.status === 'confirmed');
  return {
    natteravn: confirmed.some(c => c.startHour < 6),
    sparefugl: confirmed.length >= 5,
    dage30: (gamify.streak || 0) >= 30,
    sandsiger: confirmed.length >= 10,
  };
}
