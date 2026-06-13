// eloverblik.js — Eloverblik CustomerApi-klient. CORS-verificeret (origin *), ingen proxy.
// DataHub (Eloverbliks backend) er ofte transient nede ("DataHub unavailable") og svarer
// langsomt. Klienten er derfor tålmodig (lange timeouts) og skelner DataHub-fejl fra auth-fejl,
// så kalderne kan beholde cache + retry sjældent i stedet for at fejle hårdt.
const BASE = 'https://api.eloverblik.dk/customerapi/api';
const DEFAULT_TIMEOUT = 60000;   // DataHub kan være langsom — vent længe før vi giver op
const RETRY_DELAY = 4000;        // afstand mellem interne retries (spam ikke DataHub)
const MAX_RETRIES = 2;           // antal ekstra forsøg ud over det første

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Skelner transiente DataHub/timeout-fejl (behold cache, prøv igen senere) fra auth-fejl.
function isTransient(err){
  const m = err && err.message;
  return m === 'eloverblik:datahub' || m === 'eloverblik:timeout';
}

async function call(url, opts, timeoutMs = DEFAULT_TIMEOUT){
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let r;
  try {
    r = await fetch(url, { ...opts, signal: ac.signal });
  } catch(e){
    if(e && e.name === 'AbortError') throw new Error('eloverblik:timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if(!r.ok){
    // DataHub-nedbrud kommer typisk som 5xx med "DataHub" i body — behandl som transient.
    let body = '';
    try { body = await r.text(); } catch(e){}
    if(/DataHub/i.test(body)) throw new Error('eloverblik:datahub');
    throw new Error('eloverblik:'+r.status);
  }
  return r.json();
}

// Kør fn med let intern retry KUN på transiente fejl (datahub/timeout) — aldrig på auth/401.
async function withRetry(fn){
  let lastErr;
  for(let attempt = 0; attempt <= MAX_RETRIES; attempt++){
    try {
      return await fn();
    } catch(e){
      lastErr = e;
      if(!isTransient(e) || attempt === MAX_RETRIES) throw e;
      await sleep(RETRY_DELAY);
    }
  }
  throw lastErr;
}

// Veksl langlivet refresh-token til 24t data-access-token.
export async function getAccessToken(refreshToken){
  const j = await call(`${BASE}/token`, { headers:{ Authorization:`Bearer ${refreshToken}` } });
  if(!j || !j.result) throw new Error('eloverblik:token');
  return j.result;
}

export async function getMeteringPoints(accessToken){
  const j = await withRetry(() => call(`${BASE}/meteringpoints/meteringpoints`, { headers:{ Authorization:`Bearer ${accessToken}` } }));
  const list = (j && j.result) || [];
  return list.map(m => ({
    id: m.meteringPointId,
    label: [m.streetName, m.buildingNumber, m.cityName].filter(Boolean).join(' ') || m.meteringPointId
  }));
}

// aggregation: 'Hour' | 'Day' | 'Month' (Eloverblik gettimeseries-segment).
export async function getTimeSeries(accessToken, mpId, fromISO, toISO, aggregation='Hour'){
  return withRetry(() => call(`${BASE}/meterdata/gettimeseries/${fromISO}/${toISO}/${aggregation}`, {
    method:'POST',
    headers:{ Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ meteringPoints:{ meteringPoint:[mpId] } })
  }));
}

// Map CIM-dokument → { dayKey: number[24] } (kWh pr. time, index = position-1).
export function parseTimeSeries(json){
  const out = {};
  try {
    const docs = (json && json.result) || [];
    for(const d of docs){
      const series = (d.MyEnergyData_MarketDocument && d.MyEnergyData_MarketDocument.TimeSeries) || [];
      for(const ts of series){
        for(const per of (ts.Period || [])){
          const start = new Date(per.timeInterval.start);
          // Day-window starts previous evening = local midnight: 22:00Z (sommertid) / 23:00Z (vintertid).
          // Verificeret mod ægte Eloverblik-svar 2026-06-13: +2h nudge lander på korrekt lokal dag
          // i begge årstider (22:00Z+2h=00:00Z, 23:00Z+2h=01:00Z — begge samme UTC-dato som lokal).
          // Felt: out_Quantity.quantity; position 1 = første lokale time.
          const local = new Date(start.getTime() + 2*3600*1000); // nudge into local day
          const y=local.getUTCFullYear(), m=local.getUTCMonth()+1, day=local.getUTCDate();
          const dayKey = `${y}-${m}-${day}`;
          const arr = out[dayKey] || Array(24).fill(0);
          for(const p of (per.Point || [])){
            const idx = (+p.position) - 1;
            if(idx>=0 && idx<24) arr[idx] = +p['out_Quantity.quantity'] || 0;
          }
          out[dayKey] = arr;
        }
      }
    }
  } catch(e){ return out; }
  return out;
}

// Map CIM-dokument med Day/Month-opløsning → { bucketKey: total }.
// Day → dayKey `${y}-${m}-${d}`, Month → monthKey `${y}-${m}`.
// Hvert Point er ét bucket (én dag hhv. én måned); position er offset fra periodestart.
export function parseBuckets(json, aggregation){
  const out = {};
  try {
    const docs = (json && json.result) || [];
    for(const d of docs){
      const series = (d.MyEnergyData_MarketDocument && d.MyEnergyData_MarketDocument.TimeSeries) || [];
      for(const ts of series){
        for(const per of (ts.Period || [])){
          const start = new Date(per.timeInterval.start);
          for(const p of (per.Point || [])){
            const off = (+p.position) - 1;
            // VERIFICÉR mod rigtigt kald: tidszone + dag/måned-grænse for Day/Month-aggregering.
            // Day-vinduet starter aftenen før (22:00Z/23:00Z) = lokal midnat; nudge 2t ind i lokal dag.
            const base = new Date(start.getTime() + 2*3600*1000);
            let key;
            if(aggregation === 'Month'){
              const dt = new Date(base.getUTCFullYear(), base.getUTCMonth() + off, 1);
              key = `${dt.getFullYear()}-${dt.getMonth()+1}`;
            } else {
              const dt = new Date(base.getTime() + off*24*3600*1000);
              key = `${dt.getUTCFullYear()}-${dt.getUTCMonth()+1}-${dt.getUTCDate()}`;
            }
            out[key] = (out[key] || 0) + (+p['out_Quantity.quantity'] || 0);
          }
        }
      }
    }
  } catch(e){ return out; }
  return out;
}
