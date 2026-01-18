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
