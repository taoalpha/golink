# Agent Instructions

This repository is a minimal Bun + SQLite go-link service.
Use this file to keep agentic changes safe, consistent, and low-risk.

## Quick Context

| Aspect         | Value                                    |
|----------------|------------------------------------------|
| Runtime        | Bun (ESM, runs TS directly)              |
| Database       | SQLite at `data/golinks.sqlite`          |
| Entry point    | `src/index.ts`                           |
| Handlers       | `src/handlers.ts`                        |
| Utilities      | `src/utils.ts`                           |
| DB schema      | `src/db.ts`                              |
| Templates      | `src/templates/*.html`                   |
| Tests          | None                                     |
| Lint           | None configured                          |

## Build / Run / Test Commands

### Build
- Run from source: Bun runs TypeScript directly.
- Single binary: `bun run build:bin` outputs `dist/golink`.

### Run (HTTP)
```bash
bun run src/index.ts
```
Default port: 8787. Override with `PORT=<n>`.

### Run (HTTPS, self-signed)
```bash
PORT=8443 TLS=1 bun run src/index.ts
```

### Hot reload (development)
```bash
PORT=8443 TLS=1 bun --watch src/index.ts
```

### Type check
```bash
bunx tsc --noEmit
```
Uses strict mode per `tsconfig.json`.

### Lint / Tests
No lint configuration or tests present.

## Architecture

### Routing Order (CRITICAL)
The redirect resolution in `handleRedirect()` is order-sensitive:
1. **Exact match** — non-template slug matches exactly
2. **Template match** — slug matches a `{param}` pattern
3. **Template default** — visiting root of template uses `default_url`
4. **Fallback** — redirect to edit page for unknown slugs

**Do not reorder these checks without explicit request.**

### Database Schema (in `src/db.ts`)

```sql
-- Main links table
links (
  id INTEGER PRIMARY KEY,
  domain TEXT NOT NULL DEFAULT 'go',
  slug TEXT NOT NULL,
  url TEXT NOT NULL,
  default_url TEXT,           -- only used for template slugs
  is_template INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE(domain, slug)
)

-- Visit tracking
visits (domain, slug, link_slug, visit_type, created_at)
-- visit_type: "exact" | "template" | "default" | "miss"

-- Audit log
link_events (domain, slug, event_type, url, default_url, created_at)
-- event_type: "create" | "update" | "delete"
```

### Multi-Domain Support
- Domains are derived from the request Host header (e.g., `go`, `xx`).
- All link data is scoped by `domain` in the database.
- Default domain for existing data is `go`.
- Expect separate link namespaces per domain.

### Route Map

| Method | Path            | Handler                     |
|--------|-----------------|------------------------------|
| GET    | `/`             | Redirect to `/_/`            |
| GET    | `/_/`           | Dashboard                    |
| GET    | `/_/edit/:slug` | Edit page                    |
| GET    | `/_/domains`    | Domain manager               |
| POST   | `/_/domains`    | Add domain                   |
| POST   | `/_/save`       | Create/update link           |
| POST   | `/_/delete`     | Delete link                  |
| GET    | `/:slug`        | Redirect (or fallback edit)  |

### Multi-Domain Support
- Domains are derived from the request Host header (e.g., `go`, `xx`).
- All link data is scoped by `domain` in the database.
- Default domain for existing data is `go`.
- A domains admin page at `/_/domains` lets you add new domains.
- After adding a domain, update `/etc/hosts` to map it to `127.0.0.1`.
- Expect separate link namespaces per domain.

## Code Style Guidelines

### General
- Keep changes minimal and scoped to the request.
- Avoid refactors during bugfixes.
- Preserve existing behavior; do not change routing semantics.

### Imports
- Use explicit relative imports (`./db`, `./utils`).
- Group imports: Bun/Node builtins first, then local modules.
- Use `type` imports where applicable (`import type { X }`).

### Formatting
- 2-space indentation.
- Double quotes for strings.
- No trailing semicolons (match existing style).
- Keep line length under 100 characters where reasonable.

### Naming
| Kind        | Convention                                 |
|-------------|--------------------------------------------|
| Functions   | camelCase, verb-first (e.g., `renderDashboard`) |
| Types       | PascalCase (e.g., `LinkRow`, `VisitType`)  |
| Constants   | UPPER_SNAKE for true constants only        |
| Files       | lowercase `.ts` or `.html`                 |

### Types
- Strict TypeScript (`strict: true` in tsconfig).
- **Never use** `any`, `@ts-ignore`, `@ts-expect-error`.
- Prefer explicit types at module boundaries (exports).
- Use union types for constrained values (e.g., `VisitType`).
- Cast DB results with type assertions (e.g., `as LinkRow[]`).

### Error Handling
- Do not swallow errors silently (`catch {}` is forbidden).
- Return explicit error messages for user-facing validation.
- Always return `Response` objects from handlers.
- Validate URLs with `new URL()` and check protocol.

### Database
- Use prepared queries: `db.query(...).run(...)` / `.get(...)` / `.all()`.
- Keep schema changes minimal and backward compatible.
- Do not introduce migrations unless explicitly requested.
- Use `ON CONFLICT ... DO UPDATE` for upserts.

### Templates
- HTML templates live in `src/templates/`.
- Use `{{key}}` placeholders only; no other templating syntax.
- Escape user content via `escapeHtml()` from `utils.ts`.
- Keep CSS inline in `<style>` blocks within HTML files.

### HTML Templates: Existing Placeholders

**dashboard.html**: `{{message}}`, `{{rows}}`, `{{missRows}}`, `{{eventRows}}`
**edit.html**: `{{message}}`, `{{slug}}`, `{{url}}`, `{{defaultUrl}}`, `{{defaultUrlDisabled}}`, `{{defaultUrlHint}}`

## Utility Functions (src/utils.ts)

| Function           | Purpose                                      |
|--------------------|----------------------------------------------|
| `escapeHtml`       | Escape HTML special characters               |
| `renderTemplate`   | Replace `{{key}}` placeholders               |
| `normalizeSlug`    | Strip leading/trailing slashes               |
| `isTemplateSlug`   | Check if slug contains `{param}`             |
| `templateToRegex`  | Convert template slug to RegExp with groups  |
| `templateRoot`     | Extract base path before first `{`           |
| `applyTemplate`    | Substitute matched groups into URL template  |
| `parseForm`        | Parse URL-encoded form body                  |

## Verification Checklist

After non-trivial changes, verify locally:

- [ ] Server starts without errors
- [ ] `/_/` dashboard loads and displays links
- [ ] Create new link via `/_/edit/` works
- [ ] Edit existing link works
- [ ] Delete link works
- [ ] Exact slug redirect works (e.g., `go/jira`)
- [ ] Template redirect works (e.g., `go/pr/123`)
- [ ] Template default works (e.g., `go/pr` with no param)
- [ ] Unknown slug redirects to edit page
- [ ] `bunx tsc --noEmit` passes

## Safe Change Patterns

- **New route**: Add to `handleAdmin()` with explicit method + path check.
- **New helper**: Add to `src/utils.ts`, export explicitly.
- **New UI text**: Update relevant `.html` template, keep placeholders minimal.
- **New table/column**: Add migration check pattern (see `hasDefaultUrl` in db.ts).

## Risky Changes (Avoid Unless Requested)

- Changing DB schema without migration guards.
- Rewriting template substitution logic.
- Reordering redirect resolution rules.
- Adding external dependencies.
- Changing TLS/port configuration defaults.

## Repository Rules

### Cursor / Copilot Rules
No Cursor or Copilot instruction files found.

### Environment Variables

| Variable       | Default                        | Description                |
|----------------|--------------------------------|----------------------------|
| `PORT`         | `8787`                         | Server port                |
| `TLS`          | unset                          | Set to `1` for HTTPS       |
| `TLS_CERT_PATH`| `./tls/cert.pem`               | TLS certificate path       |
| `TLS_KEY_PATH` | `./tls/key.pem`                | TLS private key path       |
| `HTTP_PORT`    | `80`                           | HTTP redirect port (TLS)   |

## Quick Reference: Type Definitions

```typescript
// From src/db.ts
type LinkRow = {
  domain: string;
  slug: string;
  url: string;
  default_url: string | null;
  is_template: number;  // 0 or 1
};

type VisitType = "exact" | "template" | "default" | "miss";
type LinkEventType = "create" | "update" | "delete";
```
