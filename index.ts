import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";

const DATA_DIR = new URL("./data/", import.meta.url).pathname;
const DB_PATH = new URL("./data/golinks.sqlite", import.meta.url).pathname;

await mkdir(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);

db.run(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    default_url TEXT,
    is_template INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const columns = db.query("PRAGMA table_info(links)").all() as Array<{ name: string }>;
const hasDefaultUrl = columns.some((column) => column.name === "default_url");
if (!hasDefaultUrl) {
  db.run("ALTER TABLE links ADD COLUMN default_url TEXT;");
}

db.run(`
  CREATE INDEX IF NOT EXISTS links_slug_idx ON links (slug);
`);

db.run(`
  CREATE TRIGGER IF NOT EXISTS links_updated_at
  AFTER UPDATE ON links
  FOR EACH ROW
  BEGIN
    UPDATE links SET updated_at = datetime('now') WHERE id = OLD.id;
  END;
`);

type LinkRow = {
  slug: string;
  url: string;
  default_url: string | null;
  is_template: number;
};

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GoLinks</title>
    <style>
        :root {
            --bg-paper: #f7f4ef;
            --surface: #ffffff;
            --text-ink: #1f2a37;
            --text-muted: #6b7280;
            --accent-ember: #c26a4a;
            --accent-ember-dark: #a95539;
            --border-light: #ebe7e2;
            --focus-ring: 0 0 0 3px rgba(194, 106, 74, 0.2);
            --font-display: "Palatino Linotype", Palatino, "Book Antiqua", serif;
            --font-ui: "Trebuchet MS", "Gill Sans", "Gill Sans MT", sans-serif;
            --shadow-card: 0 18px 40px rgba(31, 42, 55, 0.08);
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            padding: 0;
            background-color: var(--bg-paper);
            color: var(--text-ink);
            font-family: var(--font-ui);
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
            background-image:
                radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
                radial-gradient(rgba(0,0,0,0.02) 1px, transparent 1px);
            background-size: 22px 22px, 12px 12px;
            background-position: 0 0, 6px 8px;
        }

        .layout {
            max-width: 900px;
            margin: 0 auto;
            padding: 3.5rem 1.5rem 4.5rem;
        }

        .header {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: baseline;
            gap: 1rem;
            margin-bottom: 2.5rem;
        }

        .brand {
            font-family: var(--font-display);
            font-size: 2.6rem;
            font-weight: 700;
            margin: 0;
            letter-spacing: -0.02em;
        }

        .subtitle {
            color: var(--text-muted);
            font-size: 0.95rem;
            margin-top: 0.4rem;
        }

        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0.65rem 1.3rem;
            border-radius: 999px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            letter-spacing: 0.02em;
            border: 0;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.2s ease, background 0.2s ease;
        }

        .btn-primary {
            background-color: var(--accent-ember);
            color: #fff;
            box-shadow: 0 12px 24px rgba(194, 106, 74, 0.28);
        }

        .btn-primary:hover {
            background-color: var(--accent-ember-dark);
            transform: translateY(-1px);
        }

        .btn:focus {
            outline: none;
            box-shadow: var(--focus-ring);
        }

        .card {
            background: var(--surface);
            border-radius: 18px;
            box-shadow: var(--shadow-card);
            overflow: hidden;
            border: 1px solid rgba(0,0,0,0.03);
        }

        .message-box {
            background: #fff8f3;
            border-left: 4px solid var(--accent-ember);
            color: var(--accent-ember-dark);
            padding: 0.9rem 1.2rem;
            border-radius: 10px;
            margin-bottom: 1.5rem;
            font-size: 0.95rem;
            display: none;
        }
        .message-box:not(:empty) { display: block; }

        .table-wrapper {
            width: 100%;
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        th {
            font-family: var(--font-display);
            font-weight: 700;
            color: var(--text-muted);
            font-size: 0.85rem;
            padding: 1.2rem 1.6rem 1rem;
            border-bottom: 1px solid var(--border-light);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        td {
            padding: 1.2rem 1.6rem;
            border-bottom: 1px solid var(--border-light);
            font-size: 0.98rem;
        }

        tr:last-child td { border-bottom: none; }
        tr:hover td { background-color: #fcfbf9; }

        a {
            color: var(--accent-ember);
            text-decoration: none;
            transition: color 0.2s ease;
        }

        a:hover {
            color: var(--accent-ember-dark);
            text-decoration: underline;
        }

        td:first-child {
            font-family: "Courier New", Courier, monospace;
            font-weight: 700;
        }

        .hint {
            color: var(--text-muted);
            font-size: 0.85rem;
            margin-top: 0.35rem;
        }

        form {
            margin: 0;
        }

        .action-row {
            display: inline-flex;
            align-items: center;
            gap: 0.8rem;
        }

        .btn-link {
            background: transparent;
            color: var(--text-muted);
            border: none;
            padding: 0;
            font-size: 0.9rem;
            cursor: pointer;
        }

        .btn-link:hover {
            color: var(--accent-ember-dark);
            text-decoration: underline;
        }

        .badge-variable {
            display: inline-flex;
            align-items: center;
            vertical-align: middle;
            font-size: 0.65em;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            line-height: 1;
            padding: 4px 8px;
            margin-left: 10px;
            border-radius: 999px;
            color: var(--accent-ember);
            border: 1px solid var(--accent-ember);
            background-color: transparent;
            opacity: 0.9;
            cursor: help;
            transition: all 0.2s ease;
        }

        .badge-variable:hover {
            background-color: var(--accent-ember);
            color: white;
            opacity: 1;
        }

        .empty-state {
            text-align: center;
            color: var(--text-muted);
            padding: 2.5rem 1rem;
        }

        @media (max-width: 700px) {
            .layout { padding: 2.5rem 1.2rem; }
            .brand { font-size: 2.1rem; }
            th, td { padding: 1rem; }
            td:nth-child(2) { min-width: 220px; }
        }
    </style>
</head>
<body>
    <div class="layout">
        <header class="header">
            <div>
                <h1 class="brand">GoLinks</h1>
                <div class="subtitle">Fast redirects for your personal shortcuts.</div>
            </div>
            <a href="/_/edit/" class="btn btn-primary">Create New</a>
        </header>

        <div class="message-box">{{message}}</div>

        <main class="card">
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>Key</th>
                            <th>Destination</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {{rows}}
                    </tbody>
                </table>
            </div>
        </main>
    </div>
</body>
</html>
`;

const EDIT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Manage Link</title>
    <style>
        :root {
            --bg-paper: #f7f4ef;
            --surface: #ffffff;
            --text-ink: #1f2a37;
            --text-muted: #6b7280;
            --accent-ember: #c26a4a;
            --accent-ember-dark: #a95539;
            --border-light: #ebe7e2;
            --focus-ring: 0 0 0 3px rgba(194, 106, 74, 0.2);
            --font-display: "Palatino Linotype", Palatino, "Book Antiqua", serif;
            --font-ui: "Trebuchet MS", "Gill Sans", "Gill Sans MT", sans-serif;
            --shadow-card: 0 18px 40px rgba(31, 42, 55, 0.08);
        }

        * { box-sizing: border-box; }

        body {
            margin: 0;
            padding: 0;
            background-color: var(--bg-paper);
            color: var(--text-ink);
            font-family: var(--font-ui);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background-image:
                radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
                radial-gradient(rgba(0,0,0,0.02) 1px, transparent 1px);
            background-size: 22px 22px, 12px 12px;
            background-position: 0 0, 6px 8px;
        }

        .container {
            width: 100%;
            max-width: 560px;
            padding: 2rem 1.5rem;
        }

        .card {
            background: var(--surface);
            padding: 2.5rem;
            border-radius: 20px;
            box-shadow: var(--shadow-card);
            border: 1px solid rgba(0,0,0,0.03);
        }

        .nav-link {
            display: inline-block;
            margin-bottom: 1.5rem;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.9rem;
            font-weight: 600;
        }

        .nav-link:hover {
            color: var(--accent-ember);
            text-decoration: underline;
        }

        h1 {
            font-family: var(--font-display);
            font-size: 2rem;
            margin: 0 0 0.5rem 0;
            color: var(--text-ink);
        }

        .subtitle {
            color: var(--text-muted);
            margin: 0 0 2rem 0;
            font-size: 0.95rem;
        }

        .message-box {
            background: #fff4ec;
            border-left: 4px solid var(--accent-ember);
            color: var(--accent-ember-dark);
            padding: 0.9rem 1.2rem;
            border-radius: 10px;
            margin-bottom: 1.8rem;
            font-size: 0.95rem;
            display: none;
        }
        .message-box:not(:empty) { display: block; }

        .form-group {
            margin-bottom: 1.5rem;
        }

        label {
            display: block;
            font-size: 0.8rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: var(--text-muted);
            margin-bottom: 0.6rem;
        }

        .input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }

        .prefix {
            position: absolute;
            left: 1rem;
            color: var(--text-muted);
            font-family: "Courier New", Courier, monospace;
            font-size: 1rem;
            pointer-events: none;
            user-select: none;
        }

        input[type="text"],
        input[type="url"] {
            width: 100%;
            padding: 0.85rem 1rem;
            font-size: 1rem;
            border: 2px solid var(--border-light);
            border-radius: 12px;
            background: #ffffff;
            transition: all 0.2s ease;
            font-family: "Courier New", Courier, monospace;
            color: var(--text-ink);
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
        }

        #slug { padding-left: 3.2rem; }

        input:focus {
            outline: none;
            border-color: var(--accent-ember);
            background: #fff;
            box-shadow: var(--focus-ring);
        }

        input:disabled {
            background-color: #f0ede8;
            color: #a0a0a0;
            border-color: #e0ddd8;
            cursor: not-allowed;
            opacity: 0.7;
            box-shadow: none;
            filter: grayscale(1);
        }

        .hint {
            margin-top: 0.6rem;
            color: var(--text-muted);
            font-size: 0.85rem;
        }

        .btn-group {
            display: flex;
            gap: 1rem;
            margin-top: 2rem;
        }

        .btn-save {
            flex: 1;
            padding: 0.85rem 1.5rem;
            border-radius: 999px;
            font-size: 1rem;
            font-weight: 600;
            border: none;
            background-color: var(--accent-ember);
            color: #fff;
            cursor: pointer;
            transition: transform 0.15s ease, box-shadow 0.2s ease, background 0.2s ease;
            box-shadow: 0 14px 28px rgba(194, 106, 74, 0.25);
        }

        .btn-save:hover {
            background-color: var(--accent-ember-dark);
            transform: translateY(-1px);
        }

        .btn-save:focus {
            outline: none;
            box-shadow: var(--focus-ring);
        }

        @media (max-width: 600px) {
            .card { padding: 2rem; }
            h1 { font-size: 1.7rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <main class="card">
            <a href="/_/" class="nav-link">Back to Dashboard</a>

            <h1>Configure Link</h1>
            <p class="subtitle">Set where this shortlink should take you.</p>

            <div class="message-box">{{message}}</div>

            <form action="/_/save" method="POST">
                <div class="form-group">
                    <label for="slug">Short Key</label>
                    <div class="input-wrapper">
                        <span class="prefix">go/</span>
                        <input type="text" id="slug" name="slug" value="{{slug}}" required autofocus placeholder="meet" autocomplete="off">
                    </div>
                    <div class="hint">Use {name} placeholders for variable links.</div>
                </div>

                <div class="form-group">
                    <label for="url">Destination URL</label>
                    <input type="url" id="url" name="url" value="{{url}}" required placeholder="https://...">
                </div>

                <div class="form-group">
                    <label for="default_url">Default URL</label>
                    <input type="url" id="default_url" name="default_url" value="{{defaultUrl}}" placeholder="https://..." {{defaultUrlDisabled}}>
                    <div class="hint">{{defaultUrlHint}}</div>
                </div>

                <div class="btn-group">
                    <button type="submit" class="btn-save">Save Link</button>
                </div>
            </form>
        </main>
    </div>
</body>
</html>
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTemplate(template: string, data: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(data)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}

function normalizeSlug(input: string): string {
  let slug = input.trim();
  if (slug.startsWith("/")) {
    slug = slug.slice(1);
  }
  if (slug.endsWith("/")) {
    slug = slug.slice(0, -1);
  }
  return slug;
}

function isTemplateSlug(slug: string): boolean {
  return /\{[A-Za-z0-9_]+\}/.test(slug);
}

function templateToRegex(template: string): RegExp | null {
  const parts = template.split(/\{[A-Za-z0-9_]+\}/g);
  const keys = Array.from(template.matchAll(/\{([A-Za-z0-9_]+)\}/g)).map(
    (match) => match[1]
  );
  if (keys.length === 0) {
    return null;
  }
  const escapedParts = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  let pattern = "";
  for (let i = 0; i < escapedParts.length; i += 1) {
    pattern += escapedParts[i];
    if (i < keys.length) {
      pattern += `(?<${keys[i]}>[^/]+)`;
    }
  }
  return new RegExp(`^${pattern}$`);
}

function templateRoot(template: string): string | null {
  const index = template.indexOf("{");
  if (index <= 0) {
    return null;
  }
  let root = template.slice(0, index);
  if (root.endsWith("/")) {
    root = root.slice(0, -1);
  }
  return root || null;
}

function applyTemplate(urlTemplate: string, values: Record<string, string>): string {
  return urlTemplate.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => {
    return values[key] ?? "";
  });
}

function parseForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

function renderDashboard(message: string): Response {
  const rows = db
    .query("SELECT slug, url, default_url, is_template FROM links ORDER BY slug ASC")
    .all() as LinkRow[];

  const tableRows = rows
    .map((row) => {
      const slugText = escapeHtml(row.slug);
      const urlText = escapeHtml(row.url);
      const defaultText = row.default_url ? escapeHtml(row.default_url) : "";
      const displaySlug = row.is_template === 1 ? (templateRoot(row.slug) ?? row.slug) : row.slug;
      const displaySlugText = escapeHtml(displaySlug);
      const targetHref = encodeURI(`/${displaySlug}`);
      const editHref = `/_/edit/${encodeURIComponent(row.slug)}`;
      const showsDefault = row.is_template === 1 && isTemplateSlug(row.slug);
      const destination = defaultText && showsDefault
        ? `${urlText}<div class="hint">Default: ${defaultText}</div>`
        : urlText;
      const badge = row.is_template === 1
        ? '<span class="badge-variable" title="Accepts parameters">Variable</span>'
        : "";
      return `
<tr>
  <td><a href="${targetHref}">${displaySlugText}</a>${badge}</td>
  <td>${destination}</td>
  <td>
    <div class="action-row">
      <a href="${editHref}">Edit</a>
      <form action="/_/delete" method="POST">
        <input type="hidden" name="slug" value="${slugText}">
        <button type="submit" class="btn-link">Delete</button>
      </form>
    </div>
  </td>
</tr>
`;
    })
    .join("");

  const html = renderTemplate(DASHBOARD_HTML, {
    message: escapeHtml(message),
    rows: tableRows || "<tr><td colspan=\"3\" class=\"empty-state\">No links yet.</td></tr>",
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function renderEditPage(slug: string, url: string, defaultUrl: string, message: string): Response {
  const isTemplate = isTemplateSlug(slug);
  const html = renderTemplate(EDIT_HTML, {
    slug: escapeHtml(slug),
    url: escapeHtml(url),
    defaultUrl: escapeHtml(defaultUrl),
    defaultUrlDisabled: isTemplate ? "" : "disabled",
    defaultUrlHint: isTemplate
      ? "Used when visiting the base path without variables."
      : "Add {name} in the slug to enable defaults.",
    message: escapeHtml(message),
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function redirectToEdit(slug: string): Response {
  const encoded = encodeURIComponent(slug);
  return Response.redirect(`/_/edit/${encoded}`, 302);
}

const port = Number(Bun.env.PORT ?? "8787");
const TLS_CERT_PATH = Bun.env.TLS_CERT_PATH ?? new URL("./tls/cert.pem", import.meta.url).pathname;
const TLS_KEY_PATH = Bun.env.TLS_KEY_PATH ?? new URL("./tls/key.pem", import.meta.url).pathname;

const shouldUseTls = Bun.env.TLS === "1";

Bun.serve({
  port,
  tls: shouldUseTls
    ? {
        cert: Bun.file(TLS_CERT_PATH),
        key: Bun.file(TLS_KEY_PATH),
      }
    : undefined,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === "/" || pathname === "") {
      return Response.redirect("/_/", 302);
    }

    if (pathname.startsWith("/_/")) {
      if (request.method === "GET" && pathname === "/_/" ) {
        return renderDashboard("");
      }

      if (request.method === "GET" && pathname.startsWith("/_/edit")) {
        const prefix = "/_/edit/";
        let slug = "";
        if (pathname.startsWith(prefix)) {
          slug = decodeURIComponent(pathname.slice(prefix.length));
        }
        slug = normalizeSlug(slug);

        let urlValue = "";
        let defaultUrlValue = "";
        if (slug) {
          const row = db
            .query("SELECT url, default_url FROM links WHERE slug = ?")
            .get(slug) as { url: string; default_url: string | null } | undefined;
          urlValue = row?.url ?? "";
          defaultUrlValue = row?.default_url ?? "";
        }
        return renderEditPage(slug, urlValue, defaultUrlValue, "");
      }

      if (request.method === "POST" && pathname === "/_/save") {
        const body = await request.text();
        const data = parseForm(body);
        const rawSlug = normalizeSlug(data.slug ?? "");
        const rawUrl = (data.url ?? "").trim();

        const rawDefaultUrl = (data.default_url ?? "").trim();

        if (!rawSlug) {
          return renderEditPage(rawSlug, rawUrl, rawDefaultUrl, "Slug is required.");
        }

        if (/\s/.test(rawSlug)) {
          return renderEditPage(rawSlug, rawUrl, rawDefaultUrl, "Slug cannot contain spaces.");
        }

        let parsedUrl: URL | null = null;
        try {
          parsedUrl = new URL(rawUrl);
        } catch {
          parsedUrl = null;
        }

        if (!parsedUrl || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
          return renderEditPage(rawSlug, rawUrl, rawDefaultUrl, "URL must be http or https.");
        }

        let parsedDefaultUrl: URL | null = null;
        if (rawDefaultUrl) {
          try {
            parsedDefaultUrl = new URL(rawDefaultUrl);
          } catch {
            parsedDefaultUrl = null;
          }
        }

        if (rawDefaultUrl && (!parsedDefaultUrl || (parsedDefaultUrl.protocol !== "http:" && parsedDefaultUrl.protocol !== "https:"))) {
          return renderEditPage(rawSlug, rawUrl, rawDefaultUrl, "Default URL must be http or https.");
        }

        const templateFlag = isTemplateSlug(rawSlug) ? 1 : 0;
        db.query(
          "INSERT INTO links (slug, url, default_url, is_template) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET url = excluded.url, default_url = excluded.default_url, is_template = excluded.is_template"
        ).run(rawSlug, rawUrl, rawDefaultUrl || null, templateFlag);

        return Response.redirect("/_/", 302);
      }

      if (request.method === "POST" && pathname === "/_/delete") {
        const body = await request.text();
        const data = parseForm(body);
        const slug = normalizeSlug(data.slug ?? "");
        if (slug) {
          db.query("DELETE FROM links WHERE slug = ?").run(slug);
        }
        return Response.redirect("/_/", 302);
      }

      return new Response("Not found", { status: 404 });
    }

    const slug = normalizeSlug(decodeURIComponent(pathname.slice(1)));
    if (!slug) {
      return Response.redirect("/_/", 302);
    }

    const exact = db
      .query("SELECT url FROM links WHERE slug = ? AND is_template = 0")
      .get(slug) as { url: string } | undefined;

    if (exact?.url) {
      return Response.redirect(exact.url, 302);
    }

    const templates = db
      .query("SELECT slug, url, default_url FROM links WHERE is_template = 1 ORDER BY slug ASC")
      .all() as Array<{ slug: string; url: string; default_url: string | null }>;

    for (const template of templates) {
      const regex = templateToRegex(template.slug);
      if (!regex) {
        continue;
      }
      const match = regex.exec(slug);
      if (match && match.groups) {
        const destination = applyTemplate(template.url, match.groups);
        if (destination) {
          return Response.redirect(destination, 302);
        }
      }
    }

    for (const template of templates) {
      const root = templateRoot(template.slug);
      if (!root) {
        continue;
      }
      if (slug === root && template.default_url) {
        return Response.redirect(template.default_url, 302);
      }
    }

    return redirectToEdit(slug);
  },
});

console.log(`GoLinks running on http://localhost:${port}`);
