# alfanova-elpriser (i-stødet.dk)

11ty content-site for **i-stødet.dk** med besparelses-guides + en client-side PWA
(danske elpriser i dag/i morgen, totalpris pr. netselskab, anbefalede tidsvinduer,
pris-nedbrydning, animeret maskot, og via Eloverblik verificeret gamification).
PWA'en serveres uændret under `/app/`. Repoet er også en Capacitor-iOS-app.

## Arkitektur

11ty 3.x (CommonJS-config, da repoet er `type:module`) bygger marketing-siderne.
PWA'en er ren client-side, ingen build-step, og passthrough-kopieres uændret.

| Sti | Rolle |
|-----|-------|
| `eleventy.config.cjs` | 11ty-config: media-plugin, `assetUrl`/`assetVersion`-filtre, passthrough af `src/assets` + `src/app` |
| `src/index.njk`, `src/spar*.njk`, `src/om.njk`, `src/saadan-beregner-vi.njk` | Marketing-sider (alfanova-voice) |
| `src/_data/site.js` | Site-metadata + nav. `src/_data/apparater.js` | Besparelses-datamodel (kWh × pris-spænd), single source for guides + tabel |
| `src/_includes/layouts/{base,guide}.njk` | Layouts |
| `src/app/` | **PWA, uændret** (`index.html`, `pricing.js`, `gamify.js`, `eloverblik.js`, `forbrug-analyse.js`, `co2.js`, `sw.js`, manifest, ikoner). Serveres på `/app/`. ESM-moduler, relative stier → SW-scope `/app/` |
| `scripts/build-www.mjs` | Capacitor: kopierer `src/app/` (via `runtime-files.mjs`) → `www/` (iOS webDir) |
| `scripts/deploy-caddy.sh`, `deploy/caddy-i-stoedet.dk.caddy` | Caddy-blok-deploy til websites |
| `scripts/verify-live.mjs` | Post-deploy dev-browser-tjek |

`src/app/` er fælles kilde for BÅDE web (11ty-passthrough → `_site/app/`) OG iOS
(`npm run cap:assets` → `www/`). Designs + planer: `docs/superpowers/`.

## Test

```
npm test          # node --test 'test/**/*.test.mjs' 'scripts/**/*.test.mjs'
```

De rene moduler (`pricing/gamify/eloverblik/co2/forbrug-analyse`) testes fra `test/`
(imports `../src/app/X.js`). `apparater.js` testes også. Test-filer ligger i `test/`
(IKKE i `src/app/`) så de ikke passthrough-kopieres til web.

## Vigtige data-noter

- **Tariffer/afgifter i `pricing.js` er dateret (pr. jan 2026) og skal verificeres
  årligt** — netselskaber justerer typisk 1/1 og 1/4, Energinet/elafgift ved årsskifte.
- Elafgift 1,0 øre og Energinet 14,375 øre er inkl. moms, verificeret mod 2026-kilder.
- `eloverblik.js` `parseTimeSeries` har en tidszone-følsom dayKey-udledning markeret
  `// VERIFICÉR mod rigtigt kald` — bekræft mod et rigtigt Eloverblik-svar (sommer/vintertid).

## Deploy

Hostes på Hetzner **websites**-serveren (Caddy), proxied bag Cloudflare.
GreenGeeks er udfaset (se nedenfor). Deploy = npm-scripts (alfanova-style).

- **Server:** `websites` — Tailscale `100.64.0.4` (`ssh root@websites`), public
  `46.225.103.197`. SSH ALTID via Tailscale (Hetzner-firewall låser public-origin
  til Cloudflares IP'er — direkte curl til public-IP fra egen maskine fejler, det
  er meningen; verificér origin via `--resolve <domæne>:443:100.64.0.4 -k`).
- **Docroot:** `/var/www/xn--i-stdet-t1a.dk/current/` (punycode for i-stødet.dk).
- **TLS:** CF Origin-cert (Full Strict), 1Password "CF Origin Cert — i-stødet.dk"
  (udstillerguide-v3) → `/etc/caddy/certs/xn--i-stdet-t1a.dk/origin.{crt,key}`.
- **CF-zone:** `ea83cb8b7df67afc0e7e0edda4db904a` (alfanova-konto, IKKE UG-kontoen).
  Browser Cache TTL sat til "Respect Existing Headers" (0) så origin-headers gælder.

```
npm run deploy        # build → rsync _site/ → websites → purge CF → verify:live
npm run deploy:caddy  # lægger cert + Caddy-blok på websites + ugctl caddy reload
```

`npm run deploy` kæder `verify:live` (dev-browser) — derfor passerer deploy-verify-hooken
rsync'en til `/var/www/`. Caddy-blokken er versionsstyret i `deploy/caddy-i-stoedet.dk.caddy`.

### Cache (afløser den gamle GreenGeeks-.js-regel)

Caddy sætter cache-headers (sw.js/manifest `max-age=0`, app-moduler 3600, marketing-assets
86400, HTML 300). CF respekterer dem (Browser Cache TTL=0), og `npm run deploy` purger
CF-edge efter rsync. Appens egne modul-imports i `src/app/index.html` har stadig en
`?v=N`-query — bump N ved modul-ændringer som ekstra sikkerhed. Marketing-assets
cache-bustes automatisk via `?v={{ ... | assetVersion }}` (per-fil content-hash).

**HARD RULE — verificér live efter deploy** (jf. global CLAUDE.md): åbn
`https://i-stødet.dk` i en FRISK browser med cache-bust, bekræft at forsiden +
guides loader og at `/app/` ikke hænger i "Henter elpriser…", tjek console,
inspicér visuelt desktop + 390px. Tag screenshot OG læs det. (`npm run verify:live`
gør HTTP+app-boot-delen automatisk via dev-browser.)

### GreenGeeks (udfaset — ryd op når i-stødet.dk er stabil)

Gammel PWA lå på GreenGeeks (`alfanova@107.6.136.42:public_html/i-stoedet.alfanova.dk/`).
Skal slettes manuelt i cPanel: addon-domæne `xn--i-stdet-t1a.dk`, subdomæne
`i-stoedet.alfanova.dk`, og docroot/symlink `public_html/xn--i-stdet-t1a.dk`.

Credentials (Eloverblik-token m.m.) ligger IKKE her — de hører i
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
