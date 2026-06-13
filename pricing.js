// pricing.js — ren pris-motor for Elpriser-PWA. Ingen DOM, ingen global state.
// Alle beløb i øre/kWh inkl. moms, medmindre andet er nævnt.

export const ELAFGIFT = 1.0;     // 0,8 øre ekskl. moms × 1,25 (Skat, midlertidig nedsættelse 2026–2027)
export const ENERGINET = 14.375; // 11,5 øre ekskl. moms × 1,25 — system- + transmissionstarif (Energinet 2026)
export const MOMS = 1.25;

// Nettariffer, øre/kWh inkl. moms. Tarifmodel 3.0.
// Satser pr. jan 2026 — verificér årligt (justeres typisk 1/1 og 1/4).
// Kilder: elforbrug.nu (vinter), eloversigt.dk (sommer).
export const DSO_TARIFFS = {
  n1:       { navn:'N1',            winter:{lav:11,hoej:33,spids:99},  summer:{lav:11,hoej:17,spids:43} },
  radius:   { navn:'Radius',        winter:{lav:12,hoej:37,spids:110}, summer:{lav:13,hoej:20,spids:52} },
  cerius:   { navn:'Cerius',        winter:{lav:13,hoej:40,spids:120}, summer:{lav:14,hoej:22,spids:56} },
  trefor:   { navn:'TREFOR El-net', winter:{lav:8, hoej:24,spids:73},  summer:{lav:5, hoej:8, spids:21} },
  konstant: { navn:'Konstant',      winter:{lav:6, hoej:18,spids:54},  summer:{lav:8, hoej:11,spids:30} },
  dinel:    { navn:'Dinel',         winter:{lav:10,hoej:30,spids:91},  summer:{lav:8, hoej:12,spids:30} },
};

// monthIdx er 0-baseret (0=januar). Vinter okt–mar, sommer apr–sep.
export const season = monthIdx => (monthIdx >= 3 && monthIdx <= 8) ? 'summer' : 'winter';

export function nettarif(h, monthIdx, tariff){
  const s = tariff[season(monthIdx)];
  if (h < 6) return s.lav;
  if (h >= 17 && h < 21) return s.spids;
  return s.hoej;
}

export function parseDK(s){
  const y=+s.slice(0,4), m=+s.slice(5,7), d=+s.slice(8,10), h=+s.slice(11,13);
  return { y, m, d, h, monthIdx:m-1, dayKey:`${y}-${m}-${d}`, dow:new Date(y,m-1,d).getDay() };
}

export function componentsOf(rec, cfg){
  const spot = rec.DKK_per_kWh * 100 * MOMS;
  const t = parseDK(rec.time_start);
  const net = nettarif(t.h, t.monthIdx, cfg.tariff);
  const total = spot + ELAFGIFT + ENERGINET + net + cfg.markup;
  return { spot, elafgift:ELAFGIFT, energinet:ENERGINET, nettarif:net, markup:cfg.markup, total };
}

export function totalOf(rec, cfg){
  return componentsOf(rec, cfg).total;
}

export function tierOf(p, lo, hi){
  if (p == null) return 0;
  if (hi - lo < 1) return 0;
  const f = (p - lo) / (hi - lo);
  return f < .34 ? 0 : (f < .67 ? 1 : 2);
}

export function loHi(values){
  return [Math.min(...values), Math.max(...values)];
}

export function bestWindow(pool, len){
  if (!pool.length) return null;
  if (pool.length < len) len = pool.length;
  let best = null;
  for (let i = 0; i + len <= pool.length; i++){
    let s = 0;
    for (let j = 0; j < len; j++) s += pool[i+j].total;
    const avg = s / len;
    if (!best || avg < best.avg) best = { avg, from:pool[i], to:pool[i+len-1], len };
  }
  return best;
}

// Returnerer kun de timer der faktisk findes for dagen — typisk 24, men
// 23/25 på DST-skiftedage. Bevarer API'ets kronologiske rækkefølge.
export function seriesForDay(raw, dayKey, cfg){
  const out = [];
  for (const r of raw){
    const t = parseDK(r.time_start);
    if (t.dayKey === dayKey) out.push({ h: t.h, total: totalOf(r, cfg) });
  }
  return out;
}
