import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";

const DATA_DIR = new URL("../data/", import.meta.url).pathname;
const DB_PATH = new URL("../data/golinks.sqlite", import.meta.url).pathname;

await mkdir(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);

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

export type LinkRow = {
  slug: string;
  url: string;
  default_url: string | null;
  is_template: number;
};

db.run(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    link_slug TEXT,
    visit_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.run(`CREATE INDEX IF NOT EXISTS visits_slug_idx ON visits (slug);`);
db.run(`CREATE INDEX IF NOT EXISTS visits_link_slug_idx ON visits (link_slug);`);
db.run(`CREATE INDEX IF NOT EXISTS visits_type_idx ON visits (visit_type);`);

export type VisitType = "exact" | "template" | "default" | "miss";

export function recordVisit(slug: string, linkSlug: string | null, visitType: VisitType): void {
  db.query("INSERT INTO visits (slug, link_slug, visit_type) VALUES (?, ?, ?)").run(
    slug,
    linkSlug,
    visitType
  );
}

export type LinkStats = {
  slug: string;
  total: number;
  exact: number;
  template: number;
  default_hits: number;
};

export function getLinkStats(): LinkStats[] {
  return db.query(`
    SELECT 
      link_slug as slug,
      COUNT(*) as total,
      SUM(CASE WHEN visit_type = 'exact' THEN 1 ELSE 0 END) as exact,
      SUM(CASE WHEN visit_type = 'template' THEN 1 ELSE 0 END) as template,
      SUM(CASE WHEN visit_type = 'default' THEN 1 ELSE 0 END) as default_hits
    FROM visits 
    WHERE link_slug IS NOT NULL
    GROUP BY link_slug
  `).all() as LinkStats[];
}

export type MissStats = {
  slug: string;
  count: number;
};

export function getMissStats(): MissStats[] {
  return db.query(`
    SELECT slug, COUNT(*) as count
    FROM visits 
    WHERE visit_type = 'miss'
    GROUP BY slug
    ORDER BY count DESC
  `).all() as MissStats[];
}

db.run(`
  CREATE TABLE IF NOT EXISTS link_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL,
    event_type TEXT NOT NULL,
    url TEXT,
    default_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.run(`CREATE INDEX IF NOT EXISTS link_events_slug_idx ON link_events (slug);`);

db.run(`CREATE INDEX IF NOT EXISTS link_events_type_idx ON link_events (event_type);`);

export type LinkEventType = "create" | "update" | "delete";

export function recordLinkEvent(
  slug: string,
  eventType: LinkEventType,
  url: string | null,
  defaultUrl: string | null
): void {
  db.query(
    "INSERT INTO link_events (slug, event_type, url, default_url) VALUES (?, ?, ?, ?)"
  ).run(slug, eventType, url, defaultUrl);
}

export type LinkEventRow = {
  slug: string;
  event_type: LinkEventType;
  url: string | null;
  created_at: string;
};

export function getRecentLinkEvents(limit = 10): LinkEventRow[] {
  return db.query(
    "SELECT slug, event_type, url, created_at FROM link_events ORDER BY id DESC LIMIT ?"
  ).all(limit) as LinkEventRow[];
}
