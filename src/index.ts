import { db, recordLinkEvent, recordVisit, getDomains, addDomain } from "./db";
import { renderDashboard, renderEditPage, redirectToEdit, renderDomainsPage } from "./handlers";
import {
  normalizeSlug,
  parseForm,
  isTemplateSlug,
  templateToRegex,
  templateRoot,
  applyTemplate,
} from "./utils";

const port = Number(Bun.env.PORT ?? "8787");
const TLS_CERT_PATH = Bun.env.TLS_CERT_PATH ?? new URL("../tls/cert.pem", import.meta.url).pathname;
const TLS_KEY_PATH = Bun.env.TLS_KEY_PATH ?? new URL("../tls/key.pem", import.meta.url).pathname;
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
    const domain = url.hostname || "go";

    if (pathname === "/" || pathname === "") {
      return Response.redirect("/_/", 302);
    }

    if (pathname.startsWith("/_/")) {
      return handleAdmin(request, pathname, domain);
    }

    return handleRedirect(pathname, domain);
  },
});

async function handleAdmin(request: Request, pathname: string, domain: string): Promise<Response> {
    if (request.method === "GET" && pathname === "/_/") {
      return renderDashboard(domain, "");
    }

    if (request.method === "GET" && pathname === "/_/domains") {
      const domains = getDomains();
      return renderDomainsPage(domain, domains, "");
    }

    if (request.method === "POST" && pathname === "/_/domains") {
      const body = await request.text();
      const data = parseForm(body);
      const input = (data.domain ?? "").trim().toLowerCase();
      if (!input) {
        const domains = getDomains();
        return renderDomainsPage(domain, domains, "Domain is required.");
      }
      if (!/^[a-z0-9-]+$/.test(input)) {
        const domains = getDomains();
        return renderDomainsPage(domain, domains, "Domain may include letters, numbers, and hyphens.");
      }
      addDomain(input);
      const domains = getDomains();
      return renderDomainsPage(input, domains, "Domain added.");
    }

    if (request.method === "GET" && pathname.startsWith("/_/edit")) {
      const url = new URL(request.url);
      const prefix = "/_/edit/";
      let slug = "";
      if (pathname.startsWith(prefix)) {
        slug = decodeURIComponent(pathname.slice(prefix.length));
      }
      slug = normalizeSlug(slug);

      const editDomain = (url.searchParams.get("domain") ?? domain).toLowerCase();

      let urlValue = "";
      let defaultUrlValue = "";
      if (slug) {
        const row = db
          .query("SELECT url, default_url FROM links WHERE domain = ? AND slug = ?")
          .get(editDomain, slug) as { url: string; default_url: string | null } | undefined;
        urlValue = row?.url ?? "";
        defaultUrlValue = row?.default_url ?? "";
      }
      const domains = getDomains();
      return renderEditPage(editDomain, slug, urlValue, defaultUrlValue, "", domains);
    }

    if (request.method === "POST" && pathname === "/_/save") {
      return handleSave(request, domain);
    }

    if (request.method === "POST" && pathname === "/_/delete") {
      return handleDelete(request, domain);
    }


  return new Response("Not found", { status: 404 });
}

async function handleSave(request: Request, domain: string): Promise<Response> {
  const body = await request.text();
  const data = parseForm(body);
  const rawSlug = normalizeSlug(data.slug ?? "");
  const rawUrl = (data.url ?? "").trim();
  const rawDefaultUrl = (data.default_url ?? "").trim();
  const formDomain = (data.domain ?? "").trim().toLowerCase() || domain;

  if (!rawSlug) {
    const domains = getDomains();
    return renderEditPage(formDomain, rawSlug, rawUrl, rawDefaultUrl, "Slug is required.", domains);
  }

  if (/\s/.test(rawSlug)) {
    const domains = getDomains();
    return renderEditPage(formDomain, rawSlug, rawUrl, rawDefaultUrl, "Slug cannot contain spaces.", domains);
  }

  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    parsedUrl = null;
  }

  if (!parsedUrl || (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:")) {
    const domains = getDomains();
    return renderEditPage(formDomain, rawSlug, rawUrl, rawDefaultUrl, "URL must be http or https.", domains);
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
    const domains = getDomains();
    return renderEditPage(formDomain, rawSlug, rawUrl, rawDefaultUrl, "Default URL must be http or https.", domains);
  }

  const templateFlag = isTemplateSlug(rawSlug) ? 1 : 0;
  const existing = db
    .query("SELECT url, default_url FROM links WHERE domain = ? AND slug = ?")
    .get(formDomain, rawSlug) as { url: string; default_url: string | null } | undefined;

  db.query(
    "INSERT INTO links (domain, slug, url, default_url, is_template) VALUES (?, ?, ?, ?, ?) ON CONFLICT(domain, slug) DO UPDATE SET url = excluded.url, default_url = excluded.default_url, is_template = excluded.is_template"
  ).run(formDomain, rawSlug, rawUrl, rawDefaultUrl || null, templateFlag);

  recordLinkEvent(
    formDomain,
    rawSlug,
    existing ? "update" : "create",
    rawUrl,
    rawDefaultUrl || null
  );

  return Response.redirect("/_/", 302);
}

async function handleDelete(request: Request, domain: string): Promise<Response> {
  const body = await request.text();
  const data = parseForm(body);
  const slug = normalizeSlug(data.slug ?? "");
  const formDomain = (data.domain ?? "").trim().toLowerCase() || domain;
  if (slug) {
    const existing = db
      .query("SELECT url, default_url FROM links WHERE domain = ? AND slug = ?")
      .get(formDomain, slug) as { url: string; default_url: string | null } | undefined;

    db.query("DELETE FROM links WHERE domain = ? AND slug = ?").run(formDomain, slug);

    if (existing) {
      recordLinkEvent(formDomain, slug, "delete", existing.url, existing.default_url);
    }
  }
  return Response.redirect("/_/", 302);
}

function handleRedirect(pathname: string, domain: string): Response {
  const slug = normalizeSlug(decodeURIComponent(pathname.slice(1)));
  if (!slug) {
    return Response.redirect("/_/", 302);
  }

  const exact = db
    .query("SELECT slug, url FROM links WHERE domain = ? AND slug = ? AND is_template = 0")
    .get(domain, slug) as { slug: string; url: string } | undefined;

  if (exact?.url) {
    recordVisit(domain, slug, exact.slug, "exact");
    return Response.redirect(exact.url, 302);
  }

  const templates = db
    .query("SELECT slug, url, default_url FROM links WHERE domain = ? AND is_template = 1 ORDER BY slug ASC")
    .all(domain) as Array<{ slug: string; url: string; default_url: string | null }>;

  for (const template of templates) {
    const regex = templateToRegex(template.slug);
    if (!regex) {
      continue;
    }
    const match = regex.exec(slug);
    if (match && match.groups) {
      const destination = applyTemplate(template.url, match.groups);
      if (destination) {
        recordVisit(domain, slug, template.slug, "template");
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
      recordVisit(domain, slug, template.slug, "default");
      return Response.redirect(template.default_url, 302);
    }
  }

  recordVisit(domain, slug, null, "miss");
  return redirectToEdit(slug);
}

if (shouldUseTls) {
  const httpPort = Number(Bun.env.HTTP_PORT ?? "80");
  Bun.serve({
    port: httpPort,
    fetch(request) {
      const url = new URL(request.url);
      const httpsUrl = `https://${url.host}${url.pathname}${url.search}`;
      return Response.redirect(httpsUrl, 301);
    },
  });
  console.log(`GoLinks running on https://localhost:${port} (HTTP redirect on port ${httpPort})`);
} else {
  console.log(`GoLinks running on http://localhost:${port}`);
}
