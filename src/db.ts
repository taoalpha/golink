import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const modulePath = new URL(import.meta.url).pathname;
const baseDir = modulePath.startsWith("/$bunfs/") ? process.cwd() : new URL("..", import.meta.url).pathname;
const dataDir = Bun.env.GOLINK_DATA_DIR ?? join(baseDir, "data");
const dbPath = join(dataDir, "golinks.sqlite");

await mkdir(dataDir, { recursive: true });

export const db = new Database(dbPath);

db.run(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL DEFAULT 'go',
    slug TEXT NOT NULL,
    url TEXT NOT NULL,
    default_url TEXT,
    is_template INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(domain, slug)
  );
`);

const linkColumns = db.query("PRAGMA table_info(links)").all() as Array<{ name: string }>;
const hasDomain = linkColumns.some((column) => column.name === "domain");
const hasDefaultUrl = linkColumns.some((column) => column.name === "default_url");
const linkIndexes = db.query("PRAGMA index_list(links)").all() as Array<{
  name: string;
  unique: number;
}>;
const hasSlugUnique = linkIndexes.some((index) => {
  if (index.unique !== 1) return false;
  const columns = db
    .query(`PRAGMA index_info(${JSON.stringify(index.name)})`)
    .all() as Array<{ name: string }>;
  return columns.length === 1 && columns[0]?.name === "slug";
});

const shouldRebuildLinks = !hasDomain || hasSlugUnique;
if (shouldRebuildLinks) {
  db.run(`
    CREATE TABLE IF NOT EXISTS links_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL DEFAULT 'go',
      slug TEXT NOT NULL,
      url TEXT NOT NULL,
      default_url TEXT,
      is_template INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(domain, slug)
    );
  `);
  if (hasDefaultUrl) {
    if (hasDomain) {
      db.run(`
        INSERT INTO links_new (domain, slug, url, default_url, is_template, created_at, updated_at)
        SELECT domain, slug, url, default_url, is_template, created_at, updated_at FROM links;
      `);
    } else {
      db.run(`
        INSERT INTO links_new (domain, slug, url, default_url, is_template, created_at, updated_at)
        SELECT 'go', slug, url, default_url, is_template, created_at, updated_at FROM links;
      `);
    }
  } else {
    if (hasDomain) {
      db.run(`
        INSERT INTO links_new (domain, slug, url, default_url, is_template, created_at, updated_at)
        SELECT domain, slug, url, NULL, is_template, created_at, updated_at FROM links;
      `);
    } else {
      db.run(`
        INSERT INTO links_new (domain, slug, url, default_url, is_template, created_at, updated_at)
        SELECT 'go', slug, url, NULL, is_template, created_at, updated_at FROM links;
      `);
    }
  }
  db.run("DROP TABLE links;");
  db.run("ALTER TABLE links_new RENAME TO links;");
} else if (!hasDefaultUrl) {
  db.run("ALTER TABLE links ADD COLUMN default_url TEXT;");
}

db.run(`
  CREATE UNIQUE INDEX IF NOT EXISTS links_domain_slug_idx ON links (domain, slug);
`);

db.run(`
  CREATE INDEX IF NOT EXISTS links_domain_idx ON links (domain);
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
  domain: string;
  slug: string;
  url: string;
  default_url: string | null;
  is_template: number;
};

export function getAllLinks(): LinkRow[] {
  return db
    .query("SELECT domain, slug, url, default_url, is_template FROM links ORDER BY domain ASC, slug ASC")
    .all() as LinkRow[];
}

db.run(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL DEFAULT 'go',
    slug TEXT NOT NULL,
    link_slug TEXT,
    visit_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.run(`CREATE INDEX IF NOT EXISTS visits_slug_idx ON visits (slug);`);
db.run(`CREATE INDEX IF NOT EXISTS visits_link_slug_idx ON visits (link_slug);`);
db.run(`CREATE INDEX IF NOT EXISTS visits_type_idx ON visits (visit_type);`);

const visitColumns = db.query("PRAGMA table_info(visits)").all() as Array<{ name: string }>;
const visitsHasDomain = visitColumns.some((column) => column.name === "domain");
if (!visitsHasDomain) {
  db.run("ALTER TABLE visits ADD COLUMN domain TEXT NOT NULL DEFAULT 'go';");
}

db.run(`CREATE INDEX IF NOT EXISTS visits_domain_idx ON visits (domain);`);

export type VisitType = "exact" | "template" | "default" | "miss";

export function recordVisit(
  domain: string,
  slug: string,
  linkSlug: string | null,
  visitType: VisitType
): void {
  db.query("INSERT INTO visits (domain, slug, link_slug, visit_type) VALUES (?, ?, ?, ?)").run(
    domain,
    slug,
    linkSlug,
    visitType
  );
}

export type LinkStats = {
  domain: string;
  slug: string;
  total: number;
  exact: number;
  template: number;
  default_hits: number;
};

export function getLinkStats(): LinkStats[] {
  return db.query(`
    SELECT 
      domain,
      link_slug as slug,
      COUNT(*) as total,
      SUM(CASE WHEN visit_type = 'exact' THEN 1 ELSE 0 END) as exact,
      SUM(CASE WHEN visit_type = 'template' THEN 1 ELSE 0 END) as template,
      SUM(CASE WHEN visit_type = 'default' THEN 1 ELSE 0 END) as default_hits
    FROM visits 
    WHERE link_slug IS NOT NULL
    GROUP BY domain, link_slug
  `).all() as LinkStats[];
}

export type MissStats = {
  domain: string;
  slug: string;
  count: number;
};

export function getMissStats(): MissStats[] {
  return db.query(`
    SELECT domain, slug, COUNT(*) as count
    FROM visits 
    WHERE visit_type = 'miss'
    GROUP BY domain, slug
    ORDER BY count DESC
  `).all() as MissStats[];
}

db.run(`
  CREATE TABLE IF NOT EXISTS link_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL DEFAULT 'go',
    slug TEXT NOT NULL,
    event_type TEXT NOT NULL,
    url TEXT,
    default_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const eventColumns = db.query("PRAGMA table_info(link_events)").all() as Array<{ name: string }>;
const eventsHasDomain = eventColumns.some((column) => column.name === "domain");
if (!eventsHasDomain) {
  db.run("ALTER TABLE link_events ADD COLUMN domain TEXT NOT NULL DEFAULT 'go';");
}

db.run(`CREATE INDEX IF NOT EXISTS link_events_slug_idx ON link_events (slug);`);
db.run(`CREATE INDEX IF NOT EXISTS link_events_type_idx ON link_events (event_type);`);
db.run(`CREATE INDEX IF NOT EXISTS link_events_domain_idx ON link_events (domain);`);

export type LinkEventType = "create" | "update" | "delete";

export function recordLinkEvent(
  domain: string,
  slug: string,
  eventType: LinkEventType,
  url: string | null,
  defaultUrl: string | null
): void {
  db.query(
    "INSERT INTO link_events (domain, slug, event_type, url, default_url) VALUES (?, ?, ?, ?, ?)"
  ).run(domain, slug, eventType, url, defaultUrl);
}

export type LinkEventRow = {
  domain: string;
  slug: string;
  event_type: LinkEventType;
  url: string | null;
  created_at: string;
};

export function getRecentLinkEvents(limit = 10): LinkEventRow[] {
  return db.query(
    "SELECT domain, slug, event_type, url, created_at FROM link_events ORDER BY id DESC LIMIT ?"
  ).all(limit) as LinkEventRow[];
}

db.run(`
  CREATE TABLE IF NOT EXISTS domains (
    name TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.query("INSERT OR IGNORE INTO domains (name) VALUES (?)").run("go");

export type DomainRow = {
  name: string;
  created_at: string;
  link_count: number;
};

export function getDomains(): DomainRow[] {
  return db.query(`
    SELECT d.name, d.created_at, COUNT(l.slug) as link_count
    FROM domains d
    LEFT JOIN links l ON l.domain = d.name
    GROUP BY d.name, d.created_at
    ORDER BY d.name ASC
  `).all() as DomainRow[];
}

export function addDomain(name: string): void {
  db.query("INSERT OR IGNORE INTO domains (name) VALUES (?)").run(name);
}
