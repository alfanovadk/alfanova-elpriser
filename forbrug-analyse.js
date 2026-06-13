// forbrug-analyse.js — rene aggregerings-/nøgletals-funktioner til forbrugs-analysen.
// Ingen DOM, ingen netværk, ingen global state — fuldt unit-testbar.
// dayKey-format: `${y}-${m}-${d}` (m/d ikke nul-paddede) som resten af appen (keyOf).
import { tierOf, loHi } from './pricing.js';

// {dayKey: number[24]} → {dayKey: total} (sum pr. dag).
export function aggregateByDay(hourly){
  const out = {};
  if(!hourly) return out;
  for(const [k, arr] of Object.entries(hourly)){
    out[k] = (Array.isArray(arr) ? arr : []).reduce((a, b) => a + (+b || 0), 0);
  }
  return out;
}

// dayKey → `${y}-${m}` (måned-nøgle).
export function monthKeyOf(dayKey){
  const [y, m] = String(dayKey).split('-');
  return `${y}-${m}`;
}

// {dayKey: total} → {monthKey: total} (sum pr. måned).
export function aggregateByMonth(daily){
  const out = {};
  if(!daily) return out;
  for(const [k, v] of Object.entries(daily)){
    const mk = monthKeyOf(k);
    out[mk] = (out[mk] || 0) + (+v || 0);
  }
  return out;
}

// Gennemsnitligt kWh pr. time-på-døgnet (0-23) over en samling dag-arrays → number[24].
export function dayProfile(days){
  const sum = Array(24).fill(0);
  const list = (days || []).filter(Array.isArray);
  if(!list.length) return sum;
  for(const arr of list){
    for(let h = 0; h < 24; h++) sum[h] += (+arr[h] || 0);
  }
  return sum.map(x => x / list.length);
}

// Ugedag (0=søn..6=lør) for en dayKey. Lokal tid (Date(y,m-1,d)).
export function weekdayOf(dayKey){
  const [y, m, d] = String(dayKey).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

// {dayKey: total} → number[7] gennemsnitligt kWh pr. ugedag (0=søn..6=lør).
export function weekdayProfile(dayMap){
  const sum = Array(7).fill(0), cnt = Array(7).fill(0);
  for(const [k, v] of Object.entries(dayMap || {})){
    const wd = weekdayOf(k);
    sum[wd] += (+v || 0); cnt[wd] += 1;
  }
  return sum.map((s, i) => cnt[i] ? s / cnt[i] : 0);
}

// Nøgletal for en {key: total}-serie (dag eller måned).
export function periodTotals(values){
  const entries = Object.entries(values || {});
  if(!entries.length) return { total: 0, days: 0, avgPerDay: 0, max: 0, maxKey: null, min: 0, minKey: null };
  let total = 0, max = -Infinity, maxKey = null, min = Infinity, minKey = null;
  for(const [k, v] of entries){
    const n = +v || 0;
    total += n;
    if(n > max){ max = n; maxKey = k; }
    if(n < min){ min = n; minKey = k; }
  }
  const days = entries.length;
  return { total, days, avgPerDay: total / days, max, maxKey, min, minKey };
}

// %-ændring fra previous → current. Guard mod division-med-0 → null.
export function pctChange(current, previous){
  if(!previous) return null;   // 0, null, undefined, NaN
  return (current - previous) / previous * 100;
}

// Fordel kWh på pris-tier (billig/middel/dyr) for en time-serie + pris-serie.
// Genbruger tierOf/loHi fra pricing.js. Uden priser → alt i mid.
export function tierSplit(hourlyKwh, prices){
  const out = { cheap: 0, mid: 0, expensive: 0 };
  const kwh = hourlyKwh || [];
  if(!prices){
    out.mid = kwh.reduce((a, b) => a + (+b || 0), 0);
    return out;
  }
  const [lo, hi] = loHi(prices);
  for(let h = 0; h < kwh.length; h++){
    const k = +kwh[h] || 0;
    const tier = tierOf(prices[h], lo, hi);
    if(tier === 0) out.cheap += k;
    else if(tier === 2) out.expensive += k;
    else out.mid += k;
  }
  return out;
}

// CO₂-aftryk for ét døgn: Σ over timer (kWh[h] × g/kWh[h] / 1000) → kg CO₂.
// Manglende værdier (undefined/null) tæller som 0 — aldrig fabrikerede tal.
export function co2Footprint(hourlyKwh, hourlyCo2){
  const kwh = hourlyKwh || [], co2 = hourlyCo2 || [];
  let g = 0;
  for(let h = 0; h < 24; h++){
    g += (+kwh[h] || 0) * (+co2[h] || 0);
  }
  return g / 1000;   // gram → kg
}

// CO₂-aftryk på DAG-niveau for et fler-dages interval (approksimation):
// Σ over dage ( dailyKwh[day] × dailyAvgCo2[day] / 1000 ) → kg CO₂, samt vægtet snit-intensitet.
// Bruges for Måned/Kvartal/År hvor vi kun har dags-totaler (ikke time-opløsning).
// Tæller kun dage hvor BÅDE forbrug OG CO₂-snit findes (ingen fabrikerede tal). Returnerer
// { kg, gPerKwh, days } — days = antal dage der bidrog. Manglende dage springes helt over.
export function co2FootprintDaily(dailyKwhMap, dailyCo2Map, dayKeys){
  const kwhMap = dailyKwhMap || {}, co2Map = dailyCo2Map || {};
  const keys = dayKeys || Object.keys(kwhMap);
  let totKg = 0, totKwh = 0, days = 0;
  for(const dk of keys){
    const kwh = kwhMap[dk], g = co2Map[dk];
    if(kwh == null || g == null) continue;
    const k = +kwh || 0, intensity = +g || 0;
    totKg += k * intensity / 1000;
    totKwh += k;
    days += 1;
  }
  return { kg: totKg, gPerKwh: totKwh ? (totKg * 1000) / totKwh : 0, days };
}

// Forbrugs-vægtet gennemsnits-intensitet (g/kWh) for ét døgn. Uden forbrug → 0.
export function avgIntensity(hourlyKwh, hourlyCo2){
  const kwh = hourlyKwh || [], co2 = hourlyCo2 || [];
  let totKwh = 0, totG = 0;
  for(let h = 0; h < 24; h++){
    const k = +kwh[h] || 0;
    totKwh += k;
    totG += k * (+co2[h] || 0);
  }
  return totKwh ? totG / totKwh : 0;
}

function pad2(n){ return String(n).padStart(2, '0'); }
function num(x){ return String(x).replace('.', ','); }

// CSV-streng fra [{dato, time?, kwh, kr?}]-rækker. Semikolon-separeret (dansk Excel),
// komma som decimaltegn. Header afspejler hvilke kolonner der findes.
export function toCSV(rows){
  rows = rows || [];
  const hasTime = rows.some(r => r.time != null);
  const hasKr = rows.some(r => r.kr != null);
  const head = ['dato', ...(hasTime ? ['time'] : []), 'kwh', ...(hasKr ? ['kr'] : [])];
  const lines = [head.join(';')];
  for(const r of rows){
    const cells = [r.dato];
    if(hasTime) cells.push(r.time != null ? pad2(r.time) : '');
    cells.push(r.kwh != null ? num(r.kwh) : '');
    if(hasKr) cells.push(r.kr != null ? num(r.kr) : '');
    lines.push(cells.join(';'));
  }
  return lines.join('\n');
}
