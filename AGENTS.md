# PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-19 21:26:32 PST
**Commit:** 350c94e
**Branch:** master

## OVERVIEW
Minimal Bun + SQLite go-link service with a built-in admin UI.
Runs TypeScript directly on Bun and ships as a single-binary release.

## STRUCTURE
```
./
├── src/            # server, handlers, db, utils, templates
├── scripts/        # build binary script
├── data/           # sqlite database file
├── tls/            # self-signed certs
├── dist/           # build artifacts
├── .github/        # release workflow
└── install         # installer script
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| CLI + server boot | `src/index.ts` | subcommands: `serve`, `sync-sys` |
| Redirect resolution | `src/index.ts` | order-sensitive logic |
| Admin UI rendering | `src/handlers.ts` | HTML templates + tables |
| DB schema + queries | `src/db.ts` | implicit migrations at startup |
| Template helpers | `src/utils.ts` | slug + template helpers |
| Build binary | `scripts/build-bin.ts` | `bun build --compile` |
| Release pipeline | `.github/workflows/release.yml` | tag-based releases |
| Installer script | `install` | used by self-update |

## CODE MAP
| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `runServe` | function | `src/index.ts` | Bun server boot + routing |
| `handleAdmin` | function | `src/index.ts` | admin routes + form handlers |
| `handleRedirect` | function | `src/index.ts` | exact/template/default redirects |
| `runSyncSys` | function | `src/index.ts` | TLS + hosts sync |
| `checkForUpdates` | function | `src/index.ts` | self-update via GitHub tags |
| `getAllLinks` | function | `src/db.ts` | list links for dashboard |
| `recordVisit` | function | `src/db.ts` | visit tracking |
| `renderDashboard` | function | `src/handlers.ts` | dashboard HTML |
| `renderEditPage` | function | `src/handlers.ts` | edit form HTML |
| `renderDomainsPage` | function | `src/handlers.ts` | domain management HTML |
| `templateToRegex` | function | `src/utils.ts` | template slug matcher |
| `applyTemplate` | function | `src/utils.ts` | template URL expansion |

## CONVENTIONS
- Bun runs TypeScript directly; no dev build step.
- Strict TypeScript, but unused checks are disabled in `tsconfig.json`.
- No lint or test tooling configured.
- Double quotes, 2-space indentation, no trailing semicolons.

## ANTI-PATTERNS (THIS PROJECT)
- Do not reorder redirect resolution logic in `handleRedirect`.
- Never use `any`, `@ts-ignore`, or `@ts-expect-error`.
- Do not swallow errors with empty `catch` blocks.
- Avoid schema changes without guards in `src/db.ts`.
- Avoid refactors during bugfixes; keep changes minimal.

## UNIQUE STYLES
- HTML templates use `{{key}}` placeholders only.
- User-facing HTML must be escaped via `escapeHtml()`.
- Links are scoped by domain from the request Host header.
- Self-update + single-binary distribution is built-in.
- `sync-sys` writes `/etc/hosts` and manages TLS certs.

## COMMANDS
```bash
bun run src/index.ts serve --no-tls --port 8787
bun run src/index.ts serve --port 8443
bun --watch src/index.ts serve --port 8443
bun run build:bin
bunx tsc --noEmit
```

## NOTES
- SQLite lives at `data/golinks.sqlite`.
- TLS defaults to port 443 when enabled without `--port`.
- Templates are in `src/templates/` (dashboard, edit, domains).
