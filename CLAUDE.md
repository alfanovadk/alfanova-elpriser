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
- **Sti:** `public_html/i-stoedet.alfanova.dk/` (subdomæne på samme GreenGeeks-konto;
  apex `alfanova.dk` bor IKKE her — det er på ug-sites/Caddy. Gammelt domæne
  `elpriser.damsgaard-bruhn.dk/` er udfaset.)
- **Filer der skal med:** `index.html`, `pricing.js`, `gamify.js`, `eloverblik.js`,
  `forbrug-analyse.js`, `co2.js`, `sw.js`, `manifest.webmanifest`, `icon-192.png`,
  `icon-512.png`, `apple-touch-icon.png`, `favicon.ico`, `robots.txt`
  (IKKE `docs/`, `node_modules/`, `package.json`, `*.test.mjs`, `.git`).
  **NB:** `forbrug-analyse.js` + `co2.js` er importerede moduler — glemmer du dem,
  hænger appen i "Henter elpriser…".

```
rsync -avz \
  index.html pricing.js gamify.js eloverblik.js forbrug-analyse.js co2.js sw.js \
  manifest.webmanifest icon-192.png icon-512.png apple-touch-icon.png favicon.ico robots.txt \
  alfanova@107.6.136.42:public_html/i-stoedet.alfanova.dk/
```

### Cloudflare cacher .js i 1 år — HARD RULE ved JS-ændringer

Serveren sætter `cache-control: public, max-age=31536000` på `.js`, og Cloudflare
cacher dem (`cf-cache-status: HIT`). **`index.html` caches IKKE** (frisk ved hver load),
men en opdateret `.js` serveres STALE i op til et år. Symptom: frisk `index.html`
importerer en gammel cachet `.js` → `does not provide an export named …` → appen
hænger i "Henter elpriser…".

**Reglen:** Når du ændrer en `.js`-modulfil, SKAL du cache-buste importen.
Modul-importerne i `index.html` har en `?v=N`-query (pricing/eloverblik/gamify/
forbrug-analyse/co2). **Bump N i ALLE fem imports ved enhver `.js`-ændring** før deploy —
da `index.html` er frisk, henter den nye `?v=N`-URL en frisk fil fra origin (CF-MISS).

Alternativ/supplement: purge Cloudflare-cachen. Token: 1Password "Cloudflare API Token
- UG3" i vault **udstillerguide-v3** (verificeret dækker `alfanova.dk`-zonen,
zone-id `c3b2ce74fdc6b37a121e98267bf4fba9`). Write-ops udløser CF-godkendelses-hook.

**HARD RULE — verificér live efter deploy** (jf. global CLAUDE.md): åbn
`https://i-stoedet.alfanova.dk` i en FRISK browser med cache-bust (`?cb=<ts>`),
bekræft at appen loader (ikke hænger i "Henter elpriser…"), tjek console for
import-fejl, inspicér visuelt desktop + 390px. Tag screenshot OG læs det.

Credentials (SSH-nøgle/password, Eloverblik-token) ligger IKKE her — de hører i
`~/.claude/CLAUDE.local.md` (gitignored) eller gives ad hoc.

## Sprog

Kommuniker på dansk. Kode-kommentarer og commits på engelsk.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:6cd5cc61 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
