import { db, type LinkRow } from "./db";
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
    rows: tableRows || '<tr><td colspan="3" class="empty-state">No links yet.</td></tr>',
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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
