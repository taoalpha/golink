# SRC AGENT NOTES

## OVERVIEW
Server entry point, handlers, DB access, and template helpers.

## STRUCTURE
```
src/
├── index.ts        # CLI + server + routing
├── handlers.ts     # HTML renderers + redirects
├── db.ts           # schema setup + queries
├── utils.ts        # slug + template helpers
└── templates/      # dashboard/edit/domains HTML
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| HTTP routing | `src/index.ts` | `handleAdmin`, `handleRedirect` |
| Admin pages | `src/handlers.ts` | renders HTML templates |
| DB schema/migrations | `src/db.ts` | startup guards + ALTERs |
| Slug/template logic | `src/utils.ts` | regex + substitution |
| HTML templates | `src/templates/*.html` | `{{key}}` placeholders |

## CONVENTIONS
- Always return `Response` objects from handlers.
- Validate URLs with `new URL()` and allow only `http:`/`https:`.
- Keep SQL in prepared queries; avoid inline string concatenation.
- Escape user content via `escapeHtml()` in templates.

## ANTI-PATTERNS
- Do not bypass `escapeHtml()` for user content in templates.
- Do not reorder redirect resolution in `handleRedirect`.
- Do not add DB columns without guard checks in `src/db.ts`.
- Do not introduce new dependencies without an explicit request.
