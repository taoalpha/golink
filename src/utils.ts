export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderTemplate(template: string, data: Record<string, string>): string {
  let rendered = template;
  for (const [key, value] of Object.entries(data)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  return rendered;
}

export function normalizeSlug(input: string): string {
  let slug = input.trim();
  if (slug.startsWith("/")) {
    slug = slug.slice(1);
  }
  if (slug.endsWith("/")) {
    slug = slug.slice(0, -1);
  }
  return slug;
}

export function isTemplateSlug(slug: string): boolean {
  return /\{[^}]*\}/.test(slug);
}

export function templateToRegex(template: string): RegExp | null {
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

export function templateRoot(template: string): string | null {
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

export function applyTemplate(urlTemplate: string, values: Record<string, string>): string {
  return urlTemplate.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => {
    return values[key] ?? "";
  });
}

export function parseForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}
