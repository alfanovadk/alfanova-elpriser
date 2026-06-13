# alfanova-elpriser

Lille statisk PWA der viser danske elpriser (i dag + i morgen) med totalpris pr.
netselskab, anbefalede tidsvinduer for apparater, klik-på-time pris-nedbrydning,
animeret Volt-maskot, og — via Eloverblik — verificeret gamification (point/badges
for at flytte forbrug til billige timer).

## Arkitektur

Ren client-side, ingen backend. ESM-moduler, ingen build-step.

| Fil | Rolle |
|-----|-------|
| `index.html` | App-skal: UI, temaer (soft/bold/play), DOM-render, actions, Volt-maskot, settings/wizard |
| `pricing.js` | Ren pris-motor: afgifter, netselskab-tariffer, serier, komponent-nedbrydning |
| `gamify.js` | Ren gamification-logik: verificér claims, point, smart-score, badges |
| `eloverblik.js` | Eloverblik CustomerApi-klient (CORS-verificeret, ingen proxy) + timeseries-parser |
| `sw.js` | Service worker (network-first app-skal-cache) |

Designs + planer: `docs/superpowers/`.

## Test

```
node --test
```

Rene moduler (`pricing.js`, `gamify.js`, `eloverblik.js`) er unit-testede med Node's
indbyggede runner (ingen deps).

## Vigtige data-noter

- **Tariffer/afgifter i `pricing.js` er dateret (pr. jan 2026) og skal verificeres
  årligt** — netselskaber justerer typisk 1/1 og 1/4, Energinet/elafgift ved årsskifte.
- Elafgift 1,0 øre og Energinet 14,375 øre er inkl. moms, verificeret mod 2026-kilder.
- `eloverblik.js` `parseTimeSeries` har en tidszone-følsom dayKey-udledning markeret
  `// VERIFICÉR mod rigtigt kald` — bekræft mod et rigtigt Eloverblik-svar (sommer/vintertid).

## Deploy

Statisk site på **GreenGeeks** (shared hosting). Deploy = rsync af statiske filer.

- **SSH:** bruger `alfanova`, origin-IP `107.6.136.42` (domænet er Cloudflare-proxied,
  så brug origin-IP til SSH/rsync — ikke DNS-opslaget).
- **Sti:** `public_html/elpriser.damsgaard-bruhn.dk/`
- **Filer der skal med:** `index.html`, `pricing.js`, `gamify.js`, `eloverblik.js`,
  `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png`, `favicon.ico`, `robots.txt` (IKKE `docs/`, `node_modules/`,
  `package.json`, `*.test.mjs`, `.git`).

```
rsync -avz --exclude='.git' --exclude='docs' --exclude='node_modules' \
  --exclude='*.test.mjs' --exclude='package.json' \
  index.html pricing.js gamify.js eloverblik.js sw.js manifest.webmanifest \
  *.png favicon.ico robots.txt \
  alfanova@107.6.136.42:public_html/elpriser.damsgaard-bruhn.dk/
```

### Cloudflare cacher .js i 1 år — HARD RULE ved JS-ændringer

Serveren sætter `cache-control: public, max-age=31536000` på `.js`, og Cloudflare
cacher dem (`cf-cache-status: HIT`). **`index.html` caches IKKE** (frisk ved hver load),
men en opdateret `.js` serveres STALE i op til et år. Symptom: frisk `index.html`
importerer en gammel cachet `.js` → `does not provide an export named …` → appen
hænger i "Henter elpriser…".

**Reglen:** Når du ændrer en `.js`-modulfil, SKAL du cache-buste importen.
Modul-importerne i `index.html` har en `?v=N`-query (pricing/eloverblik/gamify/
forbrug-analyse). **Bump N i ALLE fire imports ved enhver `.js`-ændring** før deploy —
da `index.html` er frisk, henter den nye `?v=N`-URL en frisk fil fra origin (CF-MISS).

Alternativ/supplement: purge Cloudflare-cachen (token i `~/.claude/CLAUDE.local.md`,
1Password "Cloudflare API Token - UG3" — bekræft at den dækker damsgaard-bruhn.dk-zonen
før du regner med den; ellers er `?v=N`-bump den pålidelige vej).

**HARD RULE — verificér live efter deploy** (jf. global CLAUDE.md): åbn
`https://elpriser.damsgaard-bruhn.dk` i en FRISK browser med cache-bust (`?cb=<ts>`),
bekræft at appen loader (ikke hænger i "Henter elpriser…"), tjek console for
import-fejl, inspicér visuelt desktop + 390px. Tag screenshot OG læs det.

Credentials (SSH-nøgle/password, Eloverblik-token) ligger IKKE her — de hører i
`~/.claude/CLAUDE.local.md` (gitignored) eller gives ad hoc.

## Sprog

Kommuniker på dansk. Kode-kommentarer og commits på engelsk.
