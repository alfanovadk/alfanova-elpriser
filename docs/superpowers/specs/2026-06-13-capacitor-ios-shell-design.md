# Capacitor iOS-shell — design (Sub-projekt 1)

**Dato:** 2026-06-13
**Status:** Godkendt design — klar til implementeringsplan
**Repo:** alfanova-elpriser
**Del af:** App Store-roadmap (iOS, Apple-først). Dette er fundamentet; senere
sub-projekter (notifikationer → widget → Game Center → CloudKit) plugger ind i shellen.

## Formål

Pakke den eksisterende «I stødet»-PWA ind som en ægte native iOS-app via Capacitor,
uden at rive web-arkitekturen op. Resultatet kører i iOS-simulator + på enhed og giver
fundamentet for de native features der følger. Én kodebase tjener fortsat både web (PWA
på `i-stoedet.alfanova.dk`) og native.

Dette sub-projekt rydder også Apples Guideline 4.2 («Minimum Functionality») ved at være
en rigtig offline-app med bundlede assets — ikke en indpakket remote-URL. (De native
features der gør den «ægte» — notifikationer, widget, social — kommer i efterfølgende
sub-projekter.)

## Strategi (besluttet)

**Approach A — bundlede assets + native HTTP.** De 13 runtime-filer pakkes lokalt i
app-bundlen (offline-shell, øjeblikkelig load). Alle netværkskald routes gennem Capacitors
native HTTP (`CapacitorHttp`) → CORS er ikke et problem (native networking har ingen CORS).
Service worker'en springes over i native-kontekst (assets er allerede lokale); web/PWA
beholder SW uændret.

Fravalgt: Approach B (load remote URL) — høj 4.2-afvisningsrisiko, ingen offline, kræver
net for at starte.

## Arkitektur

- **Platform:** iOS-only (Android udskudt — hele roadmap'et er Apple-først).
- **Wrapper:** Capacitor. Web-kernen kører i WKWebView fra lokale bundlede assets.
- **Repo:** samme repo som web-kernen (én kilde til sandhed).
- **Enrollment-kontekst:** Apple Developer = Individual / Sole Proprietor (Alfanova er
  enkeltmandsvirksomhed). Seller-navn = Johannes Damsgaard-Bruhn. App-navn = «I stødet».
  Ikke en blocker for shellen (simulator kræver ikke betalt medlemskab).

## Repo-struktur (nye filer/mapper)

```
capacitor.config.json      # ny — appId, appName, webDir=www, CapacitorHttp-config
package.json               # + @capacitor-deps + cap-scripts
www/                       # genereret, GITIGNORED — kopi af de 13 runtime-filer
ios/                       # Capacitor Xcode-projekt — COMMITTED
scripts/build-www.mjs      # kopierer de 13 runtime-filer → www/
resources/                 # Elly 1024×1024-ikon-kilde + splash-kilde (til @capacitor/assets)
```

Den eksisterende web-kerne (`index.html`, `pricing.js`, `gamify.js`, `eloverblik.js`,
`forbrug-analyse.js`, `co2.js`, `sw.js`, `manifest.webmanifest`, ikoner, `favicon.ico`,
`robots.txt`) rør IKKE struktur — den ligger fortsat i repo-roden og serveres til web
derfra. Web-deploy (rsync fra repo-root) er **uændret**.

## Komponenter

### 1. Asset-pipeline (`scripts/build-www.mjs`)
Kopierer den kanoniske liste af 13 runtime-filer til `www/`. Listen er **samme** som
web-deploy-listen i CLAUDE.md — defineres ét sted og genbruges, så «hvad shipper» ikke
divergerer mellem web og native.

De 13 filer: `index.html`, `pricing.js`, `gamify.js`, `eloverblik.js`,
`forbrug-analyse.js`, `co2.js`, `sw.js`, `manifest.webmanifest`, `icon-192.png`,
`icon-512.png`, `apple-touch-icon.png`, `favicon.ico`, `robots.txt`.

npm-scripts:
- `cap:assets` → kør `build-www.mjs`
- `cap:sync` → `cap:assets` + `npx cap sync ios`
- `cap:open` → `npx cap open ios`

`www/` er gitignored (genereret artefakt). `ios/` committes.

### 2. Capacitor-konfiguration (`capacitor.config.json`)
- `appId: "dk.alfanova.istoedet"`
- `appName: "I stødet"`
- `webDir: "www"`
- `plugins.CapacitorHttp.enabled: true`
- Splash/StatusBar-konfiguration efter behov.

### 3. Netværkslag (CapacitorHttp)
Med `CapacitorHttp.enabled: true` patches `window.fetch` til at gå gennem native
networking. Dette fjerner CORS som problem for både pris-kald og Eloverblik.

**Kritisk verifikationssteg (gøres tidligt i implementeringen):** bekræft at følgende
parser identisk gennem native HTTP som i browseren:
- Pris-fetch: `elprisenligenu.dk` + `energidataservice.dk` (response-shape, JSON-parsing)
- Eloverblik CustomerApi: **Bearer-token i Authorization-header skal virke uændret** —
  dette er den primære integrationsrisiko. Verificér get-token + get-meteringpoints +
  get-timeseries gennem CapacitorHttp.

Hvis CapacitorHttp ændrer response-håndtering uacceptabelt for et specifikt kald, er
fallback at lave netop det kald via det eksplicitte `CapacitorHttp.request()`-API i stedet
for patchet `fetch` — men mål er at patchet `fetch` dækker alt uden web-kode-ændringer.

### 4. Native-detektion (minimal web-ændring)
Den eneste ændring i web-koden: registrér kun service worker'en på web, ikke i native.

```js
if (!window.Capacitor?.isNativePlatform()) {
  navigator.serviceWorker?.register('sw.js');
}
```

(Hvis der findes PWA-specifikke «føj til hjemmeskærm»-hints i UI'et, skjules de tilsvarende
i native — verificeres under implementering; pt. ingen kendte.)

Ingen anden web-kode røres.

### 5. App-identitet, ikon & splash
- Display-navn: **I stødet**
- Bundle ID: `dk.alfanova.istoedet`
- Ikon: **Elly** (lynet-med-øjne, appens maskot). Render en 1024×1024 kilde i `resources/`,
  generér det fulde iOS-ikon-sæt via `@capacitor/assets`.
- Splash: Elly centreret på brand-baggrund (mørk `#0b1620` / brand-grøn — match
  `theme_color`/`background_color` fra manifest).

### 6. Status bar & safe areas
- Plugins: `@capacitor/status-bar` + `@capacitor/splash-screen`.
- App'en bruger allerede `viewport-fit=cover` + `100dvh`. Verificér safe-area-insets
  (notch + home-indicator) i native — især **bund-nav'en** (Nu/Forbrug/Point/Mere) må ikke
  ligge under home-indicator. Tilføj `env(safe-area-inset-*)`-padding hvor nødvendigt.

## Plugins (kun shell)
`@capacitor/core`, `@capacitor/ios`, `@capacitor/cli`, `@capacitor/splash-screen`,
`@capacitor/status-bar`, `@capacitor/app`, `@capacitor/assets` (dev-dependency).
`CapacitorHttp` er en del af core. (Notifikations-plugin kommer i sub-projekt 2.)

## Data-flow
1. App launcher → WKWebView loader `index.html` fra lokale bundlede assets (instant, offline).
2. Web-koden kører som på web; `fetch` går gennem CapacitorHttp → native networking.
3. Live-priser + CO₂ hentes ved load; Eloverblik-flow ved brugerhandling — alt via native HTTP.
4. Tilstand persisteres i `localStorage` som på web (per-app, on-device).
5. Service worker registreres IKKE i native.

## Fejlhåndtering
- Netværksfejl (offline / API nede): web-kernens eksisterende håndtering gælder — shellen
  selv loader uanset (lokale assets), kun live-data fejler graciøst som på web.
- CapacitorHttp-parsefejl på et kald: håndteres via verifikationssteget; fallback til
  eksplicit `CapacitorHttp.request()` for det specifikke kald.

## Acceptance-kriterier
Kører i iOS-simulator (og verificeres visuelt via screenshots der **tages OG læses**):
- [ ] App'en launcher og «I stødet» loader — hænger IKKE i «Henter elpriser…».
- [ ] Live spotpriser hentes og vises (pris-fetch virker gennem native HTTP).
- [ ] Eloverblik-flow virker gennem native HTTP (token-header bevaret).
- [ ] Tema-skift (soft/bold/play) virker.
- [ ] Safe-areas korrekte: intet indhold under notch/home-indicator; bund-nav fri.
- [ ] Elly-app-ikon + splash vises korrekt.
- [ ] Ingen console-fejl i WKWebView.
- [ ] Ingen regression på web/PWA: SW stadig aktiv på web, web-deploy uændret, 76/76 tests grønne.

## Eksplicit IKKE i scope (afgrænsning)
- Lokale pris-notifikationer (sub-projekt 2).
- WidgetKit-widget (sub-projekt 3).
- Game Center (sub-projekt 4).
- CloudKit husstand-deling (sub-projekt 5).
- Android / Google Play Games.
- App Store / TestFlight-publicering (kræver Apple Developer-enrollment — shellen kører i
  simulator uden betalt medlemskab; publicering tages når enrollment er på plads).

## Åbne action items (uden for selve byggeriet)
- Apple Developer Program-enrollment som Individual / Sole Proprietor (gater device-test +
  senere features + publicering).
