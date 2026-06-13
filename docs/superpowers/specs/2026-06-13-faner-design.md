# Spec: Fane-baseret layout (0-scroll)

**Dato:** 2026-06-13
**Bruger-ønske:** Forsiden er for lang. Del op i faner så alt kan ses uden scroll.

## Beslutninger (bekræftet med bruger)
- **Bund-fanelinje** med 4 faner: **⚡ Nu · 📊 Forbrug · 🏆 Point · ⋯ Mere**.
- **Hård regel: 0 scroll pr. fane** på 390×844 (mobil), i alle tre temaer (soft/bold/play).
  Opnås via kompakt design, mindre grafer, og fold-ud-sektioner hvor nødvendigt.
- Indstillinger forbliver tandhjul-sheet (ikke en fane).

## Fane-indhold (omfordeling af eksisterende sektioner)

- **⚡ Nu** — pris lige nu (badge + stor pris + Volt + nowCopy) · "Hvornår skal vi tænde for"
  (apparat-anbefalinger, kompakte) · pris-graf (i dag/i morgen) med klik-på-time som fold-ud
  detalje (ikke altid synligt, så grafen kan være kompakt).
- **📊 Forbrug** — den nye forbrugs-analyse (periodevælger + graf + nøgletal + år-over-år +
  døgn/ugedagsprofil). Profiler og sammenligning kan ligge bag fold-ud/under-valg, så
  hovedskærmen er periodevælger + hovedgraf + nøgletal uden scroll. (Erstatter den separate
  `view==='forbrug'`-fuldskærm fra forrige task — den bliver denne fane.)
- **🏆 Point** — score/point · streak · badges · "Dine markeringer i dag" (claims) ·
  "Kør nu"-knapper kan ligge her ELLER blive ved apparaterne på Nu (vælg det der giver
  mindst scroll; hvis Kør nu bliver på Nu, vis claim-status på Point).
- **⋯ Mere** — ugeprognose-link (elforbrug.nu) · datakilde/opdateret-info (nuværende footer) ·
  kort om-app · plads til fremtidige punkter. Genvej til Indstillinger må gerne ligge her også.

## Teknik
- `app.state.tab` ∈ {'nu','forbrug','point','mere'}, default 'nu', **ephemeral** (reset i loadState).
- `render()` forgrener på `app.state.tab` og kalder en fane-render pr. tema. Genbrug temaernes
  `th` (accent/pal/surface/border/text/muted) så alle faner virker i soft/bold/play.
- **Layout-skal:** `#app` → flex column, `min-height:100dvh` (brug `dvh` for korrekt mobil-højde),
  et scroll-frit indholds-område (flex:1) + en **fast bund-fanelinje** (position:sticky/fixed
  bund, over `env(safe-area-inset-bottom)`). Fanelinjen: 4 knapper, ikon + label, aktiv fane
  fremhævet med temaets accent. `setTab(t)` + window-export.
- Header (brand/region/gear/refresh) bevares øverst, kompakt — eller flyt refresh/region til
  hvor det giver mindst plads-pres.
- Klik-på-time-panel og analyse-profiler bør være fold-ud (toggle) for at holde 0-scroll.
- Bottom-bar må ikke dække indhold: indholds-området får `padding-bottom` = fanelinje-højde +
  safe-area.

## Verifikation (HARD RULE — controller måler)
For HVER fane × HVERT tema på 390×844: mål `document.body.scrollHeight` vs `window.innerHeight`
og bekræft **ingen scroll** (scrollHeight ≤ innerHeight + lille tolerance). Tag screenshot og
inspicér visuelt at intet er klippet/overlappet og at fanelinjen sidder fast nederst. Iterér
på de faner der overskrider, indtil 0 scroll — uden at gøre indhold ulæseligt (hvis en fane
ikke kan rummes læseligt, foldes mindre vigtige dele ind bag toggle).

## YAGNI
- Ingen swipe-gestures mellem faner i V1 (kun tap). Kan tilføjes senere.
- Ingen ny funktionalitet — kun omstrukturering af eksisterende til faner + kompakt layout.
