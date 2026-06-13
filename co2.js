// co2.js — Energi Data Service CO2Emis-klient. Public, ingen auth, CORS-åben.
// Datasættet giver gram CO₂ pr. kWh pr. prisområde i 5-minutters opløsning (Danmarks-tid).
// Vi aggregerer 5-min-records til et TIME-snit pr. lokal time → { dayKey: number[24] } (g/kWh).
// Bemærk: dayKey-format er `${y}-${m}-${d}` (IKKE nul-paddet) for at matche resten af appen (keyOf).
const BASE = 'https://api.energidataservice.dk/dataset/CO2Emis';

// Byg dataset-URL. start/end er DANSK lokal-tid (datasættet er i lokal tid), eksklusiv end.
export function co2Url(priceArea, fromISO, toISO){
  const filter = encodeURIComponent(JSON.stringify({ PriceArea: priceArea }));
  return `${BASE}?start=${fromISO}T00:00&end=${toISO}T00:00&filter=${filter}`;
}

// Aggregér rå CO2Emis-records → { dayKey: number[24] } (snit-g/kWh pr. lokal time).
// Hver record: { Minutes5DK: "YYYY-MM-DDTHH:MM:SS", CO2Emission: <g/kWh> }. Minutes5DK er
// allerede dansk lokal-tid, så vi splitter strengen direkte (ingen Date/tidszone-konvertering).
export function parseCO2(records){
  const sum = {};   // dayKey → number[24]
  const cnt = {};   // dayKey → number[24] (antal 5-min-værdier pr. time)
  for(const r of (records || [])){
    const ts = r && r.Minutes5DK;
    const val = r && r.CO2Emission;
    if(!ts || val == null) continue;
    const [date, time] = String(ts).split('T');
    if(!date || !time) continue;
    const [y, m, d] = date.split('-').map(Number);
    const hour = +time.slice(0, 2);
    if(!(hour >= 0 && hour < 24)) continue;
    const dayKey = `${y}-${m}-${d}`;
    if(!sum[dayKey]){ sum[dayKey] = Array(24).fill(0); cnt[dayKey] = Array(24).fill(0); }
    sum[dayKey][hour] += (+val || 0);
    cnt[dayKey][hour] += 1;
  }
  const out = {};
  for(const dk of Object.keys(sum)){
    out[dk] = sum[dk].map((s, h) => cnt[dk][h] ? s / cnt[dk][h] : 0);
  }
  return out;
}

// Hent CO2Emis for [fromISO, toISO) (eksklusiv toISO) for et prisområde, aggregeret til timer.
// Returnerer { dayKey: number[24] }. Kaster ved netværks-/HTTP-fejl (kalderen beholder cache).
export async function fetchCO2(priceArea, fromISO, toISO){
  const r = await fetch(co2Url(priceArea, fromISO, toISO));
  if(!r.ok) throw new Error('co2:' + r.status);
  const j = await r.json();
  return parseCO2((j && j.records) || []);
}
