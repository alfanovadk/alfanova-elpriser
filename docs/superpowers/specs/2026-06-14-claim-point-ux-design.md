# Claim & point UX — design

**Dato:** 2026-06-14
**Status:** Godkendt — klar til implementering
**Repo:** alfanova-elpriser (web/main — deployes til live + flyder med i iOS via www-bundle)

## Formål

Gøre «Tænd nu»/point-mekanikken forståelig og konsistent. Tre sammenhængende dele:
forklare point (B), fjerne et layout-hop (C), og rette claim-livscyklussen (D).

## D — Livscyklus (kerne)

I dag tjekker `isClaimedNow` kun `startHour === nuværende time`, så «Tændt» forsvinder
ved næste hele klokkeslæt — ikke efter apparatets faktiske varighed. Men `logClaim`
gemmer ALLEREDE en `varighed` (fra settings: bil/opvask/vask-timer), og `gamify.js` har
`windowHours(claim)` = `[startHour, startHour+varighed)`.

**Beslutning:** «Tændt» varer den konfigurerede varighed, slår selv fra (aldrig manuelt),
ingen timer-input pr. claim. Knappen viser slut-tid: **«Tændt · til 18»**.

**Implementering:**
- `gamify.js`: eksportér `claimActiveAt(claim, dayKey, hour)` (sandt hvis `dato===dayKey`
  og `startHour <= hour < startHour+varighed`) + `claimEndHour(claim)` = `startHour+varighed`.
  Unit-testes (vindue-grænser, dagsmatch, brøk-varighed).
- `index.html` `isClaimedNow` bruger `claimActiveAt`. `claimBtn` viser slut-tid via `claimEndHour`.

## C — Layout-hop

«Tænd nu» (7 tegn) → «Tændt · til 18» ændrer bredde → rækken reflower. **Fix:** fast
`min-width` + `justify-content:center` på claim-knappen (`claimBtn`, ét sted, alle temaer).

## B — Point-forklaring

**Teaser-linje** under apparat-overskriften (alle tre temaer: «Hvornår skal vi tænde
for…» / «Dagens opgaver»): diskret linje + «Sådan virker det»-link.

**Genbrugelig «Sådan virker point»-modal** — generalisér det eksisterende sheet-system
(`app.state.settingsOpen` → `app.state.sheet: 'settings' | 'pointInfo' | null`), så samme
`#sheet-root`-overlay viser enten settings eller point-info. Indhold (3 trin + ærlig PS):
1. Tryk **«Tænd nu»** når du starter et apparat i en billig time.
2. **«Tændt»** kører apparatets varighed (sæt i indstillinger) — slår selv fra.
3. Dit forbrug **tjekkes automatisk mod Eloverblik** (1-2 dage) → point + badges.
4. **PS:** «Vi ved godt, det ikke er præcist på øre og watt. Det er heller ikke meningen.
   Det handler om at få lidt sjov ud af at bruge strømmen, når den er billigst. ⚡»

Åbnes fra **både** teaser-linket OG en «Sådan virker det»-knap på Point-siden (`pointView`).

## Cache + test

- `.js`-ændring i `gamify.js` → bump `?v=6 → ?v=7` på alle fem imports i `index.html`.
- `claimActiveAt`/`claimEndHour` unit-testes (`node --test`). Teaser/modal/knap verificeres
  visuelt (lokal server + simulator, alle tre temaer).
