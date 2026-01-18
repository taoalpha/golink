# Agent Instructions

This repository is a minimal Bun + SQLite go-link service.
Use this file to keep agentic changes safe, consistent, and low-risk.

## Quick Context
- Runtime: Bun (ESM)
- Data: SQLite at `data/golinks.sqlite`
- Entry point: `src/index.ts`
- Templates: `src/templates/*.html`
- No existing tests or lint config found.

## Build / Run / Test Commands

### Run (HTTP)
```bash
bun run src/index.ts
```

### Run (HTTPS, self-signed)
```bash
PORT=8443 TLS=1 bun run src/index.ts
```

### Hot reload
```bash
PORT=8443 TLS=1 bun --watch src/index.ts
```

### Build
- No build step defined (Bun runs TS directly).

### Lint
- No lint configuration present.

### Tests
- No test runner or tests detected.
- There is no single-test command.

### Type check (optional)
- `tsconfig.json` is present but no script is defined.
- If needed and TypeScript is installed globally:
```bash
tsc --noEmit
```

## Code Style Guidelines

### General
- Keep changes minimal and scoped to the request.
- Avoid refactors during bugfixes.
- Preserve behavior; do not change routing semantics or redirects.

### Imports
- Prefer explicit relative imports.
- Group imports by module kind:
  1) Bun / node built-ins
  2) local modules
- Use `type` imports for types where possible.

### Formatting
- 2-space indentation.
- Use double quotes for strings.
- Keep line length reasonable; avoid overly long template literals.

### Naming
- Functions: camelCase, verbs first (e.g., `renderDashboard`).
- Constants: UPPER_SNAKE_CASE only for true constants; otherwise camelCase.
- Files: lowercase with `.ts` or `.html`.

### Types
- Keep `strict` TypeScript semantics.
- Avoid `any`, `@ts-ignore`, `@ts-expect-error`.
- Prefer explicit types at module boundaries (exports).

### Error Handling
- Do not swallow errors silently.
- Use explicit error messages for user-facing validation.
- Return `Response` objects consistently in handlers.

### Database
- Use prepared queries via `db.query(...).run(...)` / `.get(...)`.
- Keep schema changes minimal and backward compatible.
- Do not introduce migrations unless requested.

### Templates
- HTML templates are plain files in `src/templates/`.
- Only use `{{key}}` placeholders; do not introduce new templating syntax.
- Escape user-provided content via `escapeHtml`.

### Routing
- All routes are handled in `src/index.ts`.
- Admin routes live under `/_/`.
- Redirect logic should remain order-sensitive:
  1) exact slugs
  2) templates
  3) template defaults
  4) fallback to edit page

## Repository Rules

### Cursor / Copilot Rules
- No Cursor or Copilot instruction files found.

## Verification Checklist
- Run the server locally (HTTP or HTTPS) after non-trivial changes.
- Manually verify:
  - `/_/` dashboard loads
  - edit page saves
  - a basic redirect works
  - template redirect works

## Safe Change Patterns
- New routes: add to `handleAdmin` or `handleRedirect` with clear branching.
- New helpers: place in `src/utils.ts` and export explicitly.
- New UI text: update `src/templates/*.html` and keep placeholders minimal.

## Risky Changes (Avoid Unless Requested)
- Changing DB schema.
- Rewriting template substitution logic.
- Reordering redirect resolution rules.
- Adding dependencies.
