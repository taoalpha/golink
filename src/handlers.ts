import { db, type LinkRow, getLinkStats, getMissStats, getRecentLinkEvents } from "./db";
import {
  escapeHtml,
  renderTemplate,
  isTemplateSlug,
  templateRoot,
} from "./utils";

const DASHBOARD_HTML = await Bun.file(
  new URL("./templates/dashboard.html", import.meta.url).pathname
).text();

const EDIT_HTML = await Bun.file(
  new URL("./templates/edit.html", import.meta.url).pathname
).text();

export function renderDashboard(message: string): Response {
  const rows = db
    .query("SELECT slug, url, default_url, is_template FROM links ORDER BY slug ASC")
    .all() as LinkRow[];

  const stats = getLinkStats();
  const statsMap = new Map(stats.map((s) => [s.slug, s]));
  const misses = getMissStats();
  const events = getRecentLinkEvents(10);

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
      
      const linkStats = statsMap.get(row.slug);
      const hitsHtml = linkStats
        ? formatStatsCell(linkStats.total, linkStats.exact, linkStats.template, linkStats.default_hits, row.is_template === 1)
        : '<span class="text-muted">0</span>';

      return `
<tr>
  <td><a href="${targetHref}">${displaySlugText}</a>${badge}</td>
  <td>${destination}</td>
  <td>${hitsHtml}</td>
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

  const missRows = misses
    .slice(0, 10)
    .map((m) => `<tr><td><code>${escapeHtml(m.slug)}</code></td><td>${m.count}</td></tr>`)
    .join("");

  const eventRows = events
    .map((event) => {
      const eventLabel = escapeHtml(event.event_type);
      const slugText = escapeHtml(event.slug);
      const urlText = event.url ? escapeHtml(event.url) : "";
      const timeText = escapeHtml(event.created_at);
      return `<tr><td><span class="event-pill event-${eventLabel}">${eventLabel}</span></td><td><code>${slugText}</code></td><td>${urlText}</td><td>${timeText}</td></tr>`;
    })
    .join("");

  const html = renderTemplate(DASHBOARD_HTML, {
    message: escapeHtml(message),
    rows: tableRows || '<tr><td colspan="4" class="empty-state">No links yet.</td></tr>',
    missRows: missRows || '<tr><td colspan="2" class="empty-state">No misses yet.</td></tr>',
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

export function renderEditPage(slug: string, url: string, defaultUrl: string, message: string): Response {
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

export function redirectToEdit(slug: string): Response {
  const encoded = encodeURIComponent(slug);
  return Response.redirect(`/_/edit/${encoded}`, 302);
}
