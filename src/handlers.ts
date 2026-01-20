import {
  getAllLinks,
  type LinkRow,
  getLinkStats,
  getMissStats,
  getRecentLinkEvents,
  type DomainRow,
} from "./db";
import {
  escapeHtml,
  renderTemplate,
  isTemplateSlug,
  templateRoot,
} from "./utils";

const modulePath = new URL(import.meta.url).pathname;
const baseDir = modulePath.startsWith("/$bunfs/")
  ? process.cwd()
  : new URL("..", import.meta.url).pathname;

const DASHBOARD_HTML = await Bun.file(`${baseDir}/src/templates/dashboard.html`).text();
const EDIT_HTML = await Bun.file(`${baseDir}/src/templates/edit.html`).text();
const DOMAINS_HTML = await Bun.file(`${baseDir}/src/templates/domains.html`).text();

export function renderDashboard(domain: string, message: string): Response {
  const rows = getAllLinks();

  const stats = getLinkStats();
  const statsMap = new Map(stats.map((s) => [`${s.domain}:${s.slug}`, s]));
  const misses = getMissStats();
  const events = getRecentLinkEvents(10);

  const tableRows = rows
    .map((row: LinkRow) => {
      const slugText = escapeHtml(row.slug);
      const domainText = escapeHtml(row.domain);
      const urlText = escapeHtml(row.url);
      const defaultText = row.default_url ? escapeHtml(row.default_url) : "";
      const displaySlug = row.is_template === 1 ? (templateRoot(row.slug) ?? row.slug) : row.slug;
      const displaySlugText = escapeHtml(displaySlug);
      const fullKey = `${domainText}/${displaySlugText}`;
      const editHref = `/_/edit/${encodeURIComponent(row.slug)}?domain=${encodeURIComponent(row.domain)}`;
      const showsDefault = row.is_template === 1 && isTemplateSlug(row.slug);
      const targetHref = escapeHtml(
        showsDefault
          ? (row.default_url ?? editHref)
          : row.url
      );
      const dataLinkAttr = "";
      const destination = defaultText && showsDefault
        ? `${urlText}<div class="hint">Default: ${defaultText}</div>`
        : urlText;
      const badge = row.is_template === 1
        ? '<span class="badge-variable" title="Template link; uses variables">Variable</span>'
        : "";

      const linkStats = statsMap.get(`${row.domain}:${row.slug}`);
      const hitsHtml = linkStats
        ? formatStatsCell(linkStats.total, linkStats.exact, linkStats.template, linkStats.default_hits, row.is_template === 1)
        : '<span class="text-muted">0</span>';

      return `
<tr>
  <td><a href="${targetHref}"${dataLinkAttr}>${fullKey}</a>${badge}</td>
  <td>${destination}</td>
  <td>${hitsHtml}</td>
  <td>
    <div class="action-row">
      <a href="${editHref}">Edit</a>
      <form action="/_/delete" method="POST">
        <input type="hidden" name="slug" value="${slugText}">
        <input type="hidden" name="domain" value="${domainText}">
        <button type="submit" class="btn-link">Delete</button>
      </form>
    </div>
  </td>
</tr>
`;
    })
    .join("");

  const missRows = misses
    .filter((m) => m.slug !== "_/" && m.slug !== "_")
    .slice(0, 10)
    .map((m) => {
      const editHref = `/_/edit/${encodeURIComponent(m.slug)}?domain=${encodeURIComponent(m.domain)}`;
      const domainText = escapeHtml(m.domain);
      const slugText = escapeHtml(m.slug);
      return `
<tr>
  <td><a href="${editHref}"><code>${domainText}/${slugText}</code></a></td>
  <td>${m.count}</td>
  <td>
    <div class="action-row">
      <a href="${editHref}">Add</a>
      <form action="/_/ignore" method="POST">
        <input type="hidden" name="domain" value="${domainText}">
        <input type="hidden" name="slug" value="${slugText}">
        <button type="submit" class="btn-link">Ignore</button>
      </form>
    </div>
  </td>
</tr>
`;
    })
    .join("");

  const eventRows = events
    .map((event) => {
      const eventLabel = escapeHtml(event.event_type);
      const slugText = escapeHtml(event.slug);
      const domainText = escapeHtml(event.domain);
      const urlText = event.url ? escapeHtml(event.url) : "";
      const timeText = escapeHtml(event.created_at);
      const eventId = String(event.id);
      return `
<tr>
  <td><span class="event-pill event-${eventLabel}">${eventLabel}</span></td>
  <td><code>${domainText}/${slugText}</code></td>
  <td>${urlText}</td>
  <td>
    <div class="action-row">
      <span>${timeText}</span>
      <form action="/_/events/delete" method="POST">
        <input type="hidden" name="event_id" value="${eventId}">
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
    rows: tableRows || '<tr><td colspan="4" class="empty-state">No links yet.</td></tr>',
    missRows: missRows || '<tr><td colspan="3" class="empty-state">No misses yet.</td></tr>',
    eventRows: eventRows || '<tr><td colspan="4" class="empty-state">No changes yet.</td></tr>',
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function formatStatsCell(total: number, exact: number, template: number, defaultHits: number, isTemplate: boolean): string {
  if (!isTemplate) {
    return `<span class="stat-total">${total}</span>`;
  }
  const parts: string[] = [];
  if (template > 0) parts.push(`<span class="stat-template" title="Template hits">${template} var</span>`);
  if (defaultHits > 0) parts.push(`<span class="stat-default" title="Default hits">${defaultHits} def</span>`);
  if (parts.length === 0) return `<span class="stat-total">${total}</span>`;
  return `<span class="stat-total">${total}</span> <span class="stat-breakdown">(${parts.join(", ")})</span>`;
}

export function renderEditPage(
  domain: string,
  slug: string,
  url: string,
  defaultUrl: string,
  message: string,
  domains: DomainRow[]
): Response {
  const isTemplate = isTemplateSlug(slug);
  const optionsHtml = domains
    .map((item) => {
      const nameText = escapeHtml(item.name);
      const selected = item.name === domain ? " selected" : "";
      return `<option value="${nameText}"${selected}>${nameText}</option>`;
    })
    .join("");

  const html = renderTemplate(EDIT_HTML, {
    slug: escapeHtml(slug),
    url: escapeHtml(url),
    defaultUrl: escapeHtml(defaultUrl),
    defaultUrlDisabled: isTemplate ? "" : "disabled",
    defaultUrlHint: isTemplate
      ? "Used when visiting the base path without variables."
      : "Add {name} in the slug to enable defaults.",
    message: escapeHtml(message),
    domain: escapeHtml(domain),
    domainOptions: optionsHtml,
    manageDomainsUrl: "/_/domains",
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export function redirectToEdit(slug: string): Response {
  const encoded = encodeURIComponent(slug);
  return Response.redirect(`/_/edit/${encoded}`, 302);
}

export function renderDomainsPage(domain: string, domains: DomainRow[], message: string): Response {
  const rows = domains
    .map((item) => {
      const nameText = escapeHtml(item.name);
      return `<tr><td><code>${nameText}</code></td><td>${item.link_count}</td></tr>`;
    })
    .join("");

  const instructions = domains
    .map((item) => `sudo sh -c 'echo "127.0.0.1 ${item.name}" >> /etc/hosts'`)
    .join("\n");

  const html = renderTemplate(DOMAINS_HTML, {
    message: escapeHtml(message),
    domainRows: rows || '<tr><td colspan="2" class="empty-state">No domains yet.</td></tr>',
    hostsInstructions: escapeHtml(instructions),
    domain: escapeHtml(domain),
    backUrl: "/_/",
    domainValue: escapeHtml(domain),
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
