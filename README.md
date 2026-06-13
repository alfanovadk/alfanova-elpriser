# alfanova-elpriser

Lille progressiv web-app (PWA) der viser danske elpriser for i dag og i morgen.

- **Live:** https://elpriser.damsgaard-bruhn.dk
- **Datakilde:** [elprisenligenu.dk](https://www.elprisenligenu.dk) – offentligt API
  (`https://www.elprisenligenu.dk/api/v1/prices/{YYYY}/{MM}-{DD}_{region}.json`)

## Opbygning

Ren statisk side – ingen backend. Al kode ligger i `index.html` (markup, CSS og JS
samlet i én fil). Priser hentes live i browseren fra elprisenligenu.dk's API; intet
caches af prisdata.

| Fil | Rolle |
|-----|-------|
| `index.html` | App-skallen (UI, temaer, DOM-render, actions) |
| `pricing.js` | Ren pris-motor (afgifter, netselskab-tariffer, serier) – unit-testet, ingen DOM |
| `pricing.test.mjs` | Unit-tests for pris-motoren (`node --test`, ingen deps) |
| `sw.js` | Service worker – network-first cache af app-skallen, så den virker offline |
| `manifest.webmanifest` | PWA-manifest (navn, ikoner, theme) |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | App-ikoner |
| `robots.txt`, `favicon.ico` | Standard web-filer |

## Test

Pris-motoren (`pricing.js`) er dækket af unit-tests via Node's indbyggede test-runner
(ingen dependencies):

```
node --test
```

Tariffer/afgifter i `pricing.js` er dateret (pr. jan 2026) og bør verificeres årligt,
da netselskaber og Energinet justerer satser (typisk 1/1 og 1/4).

## Deploy

Statiske filer kopieres til `public_html/elpriser.damsgaard-bruhn.dk/` på serveren.
Husk at `pricing.js` skal med (den er en del af app-skallen og caches af `sw.js`).
