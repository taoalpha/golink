import { db, recordLinkEvent, recordVisit, getDomains, addDomain } from "./db";
import { renderDashboard, renderEditPage, redirectToEdit, renderDomainsPage } from "./handlers";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, copyFileSync } from "node:fs";
import { chmodSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json";
import {
  normalizeSlug,
  parseForm,
  isTemplateSlug,
  templateToRegex,
  templateRoot,
  applyTemplate,
} from "./utils";

const args = process.argv.slice(2);
const subcommand = args[0];

if (subcommand === "sync-sys") {
  runSyncSys();
} else if (subcommand === "serve") {
  runServe(args.slice(1));
} else if (subcommand === "--help" || subcommand === "-h") {
  printHelp();
} else {
  printHelp();
}

function runServe(argv: string[]): void {
  const cli = parseArgs(argv);
  const shouldUseTls = !cli.noTls && (Bun.env.TLS ?? "1") !== "0";
  const port = Number(cli.port ?? Bun.env.PORT ?? (shouldUseTls ? "443" : "8787"));
  const modulePath = new URL(import.meta.url).pathname;
  const baseDir = modulePath.startsWith("/$bunfs/") ? process.cwd() : new URL("..", import.meta.url).pathname;
  const tlsDir = Bun.env.GOLINK_TLS_DIR ?? `${baseDir}/tls`;
  const TLS_CERT_PATH = cli.tlsCertPath
    ?? Bun.env.TLS_CERT_PATH
    ?? `${tlsDir}/cert.pem`;
  const TLS_KEY_PATH = cli.tlsKeyPath
    ?? Bun.env.TLS_KEY_PATH
    ?? `${tlsDir}/key.pem`;
  const httpPort = Number(cli.httpPort ?? Bun.env.HTTP_PORT ?? "80");

  const execPath = process.argv[1] ?? process.argv[0] ?? "golink";
  checkForUpdates({
    currentVersion: pkg.version,
    repo: "taoalpha/golink",
    assetPrefix: "golink",
    execPath,
  });

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

  if (shouldUseTls) {
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
}

function printHelp(): void {
  console.log(`Usage:
  golink serve [options]
  golink sync-sys

Options (serve):
  --port <n>       Port to listen on (default: 443 or 8787 with --no-tls)
  --no-tls         Disable TLS
  --tls-cert <p>   TLS cert path (default: ./tls/cert.pem)
  --tls-key <p>    TLS key path (default: ./tls/key.pem)
  --http-port <n>  HTTP redirect port when TLS is enabled (default: 80)
`);
}

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

  if (rawSlug.startsWith("_/") || rawSlug === "_") {
    const domains = getDomains();
    return renderEditPage(formDomain, rawSlug, rawUrl, rawDefaultUrl, "Slug cannot start with _/.", domains);
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

function parseArgs(args: string[]): {
  port?: string;
  noTls?: boolean;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  httpPort?: string;
} {
  const out: {
    port?: string;
    noTls?: boolean;
    tlsCertPath?: string;
    tlsKeyPath?: string;
    httpPort?: string;
  } = {}

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) {
      continue;
    }
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, inlineValue] = arg.split("=");
    const value = inlineValue ?? args[i + 1];
    if (!inlineValue && value) {
      i += 1;
    }

    switch (key) {
      case "--port":
        out.port = value;
        break;
      case "--no-tls":
        out.noTls = true;
        break;
      case "--tls-cert":
        out.tlsCertPath = value;
        break;
      case "--tls-key":
        out.tlsKeyPath = value;
        break;
      case "--http-port":
        out.httpPort = value;
        break;
      default:
        break;
    }
  }

  return out;
}

function checkForUpdates(options: {
  currentVersion: string;
  repo: string;
  assetPrefix: string;
  execPath: string;
}): void {
  const apiUrl = `https://api.github.com/repos/${options.repo}/tags`;
  const result = spawnSync("curl", ["-fsSL", apiUrl], { encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) {
    return;
  }

  let tags: Array<{ name: string }>
  try {
    tags = JSON.parse(result.stdout) as Array<{ name: string }>;
  } catch {
    return;
  }

  const latest = tags
    .map((tag) => tag.name)
    .filter((name) => name.startsWith("v"))
    .sort(compareVersions)
    .at(-1);

  if (!latest) {
    return;
  }

  const latestVersion = latest.replace(/^v/, "");
  if (!isNewerVersion(options.currentVersion, latestVersion)) {
    return;
  }

  console.log(`New version ${latest} available. Updating...`);
  const updated = updateBinary(options.repo, options.assetPrefix, latest, options.execPath);
  if (updated) {
    console.log("Update complete. Restarting...");
    const execPath = process.argv[1] ?? process.argv[0] ?? "golink";
    spawnSync(execPath, ["serve", ...process.argv.slice(3)], { stdio: "inherit" });
    process.exit(0);
  }
}

function compareVersions(a: string, b: string): number {
  const cleanA = a.replace(/^v/, "");
  const cleanB = b.replace(/^v/, "");
  const partsA = cleanA.split(".").map((part) => Number(part));
  const partsB = cleanB.split(".").map((part) => Number(part));

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i += 1) {
    const left = partsA[i] ?? 0;
    const right = partsB[i] ?? 0;
    if (left === right) {
      continue;
    }
    return left - right;
  }

  return 0;
}

function isNewerVersion(current: string, latest: string): boolean {
  return compareVersions(current, latest) < 0;
}

function updateBinary(repo: string, assetPrefix: string, tag: string, execPath: string): boolean {
  const { os, arch, ok } = getPlatformInfo();
  if (!ok) {
    console.warn("Unsupported platform for auto-update.");
    return false;
  }

  const filename = `${assetPrefix}-${os}-${arch}.zip`;
  const url = `https://github.com/${repo}/releases/download/${tag}/${filename}`;
  const tmpDir = join(tmpdir(), `golink-update-${Date.now()}`);
  const zipPath = join(tmpDir, filename);

  mkdirSync(tmpDir, { recursive: true });

  const curlResult = spawnSync("curl", ["-fsSL", url, "-o", zipPath], { stdio: "inherit" });
  if (curlResult.status !== 0) {
    return false;
  }

  const unzipResult = spawnSync("unzip", ["-q", zipPath, "-d", tmpDir], { stdio: "inherit" });
  if (unzipResult.status !== 0) {
    return false;
  }

  const binaryName = os === "windows" ? `${assetPrefix}-windows-x64.exe` : `${assetPrefix}-${os}-${arch}`;
  const src = join(tmpDir, binaryName);
  const dest = execPath;

  if (!existsSync(src)) {
    return false;
  }

  const tempDest = `${dest}.new`;
  copyFileSync(src, tempDest);
  chmodSync(tempDest, 0o755);
  renameSync(tempDest, dest);
  return true;
}

function getPlatformInfo(): { os: string; arch: string; ok: boolean } {
  const rawOs = process.platform;
  const os = rawOs === "win32" ? "windows" : rawOs;

  let arch = process.arch;
  if (arch === "x64") arch = "x64";
  if (arch === "arm64") arch = "arm64";

  const combo = `${os}-${arch}`;
  const ok = ["linux-x64", "linux-arm64", "darwin-arm64", "windows-x64"].includes(combo);

  return { os, arch, ok };
}

function runSyncSys(): void {
  console.log("Syncing system settings for go links...");

  console.log("Ensuring database is initialized...");
  const domains = getDomains().map((row) => row.name);
  if (domains.length === 0) {
    console.error("No domains found in database. Add domains via /_/domains first.");
    return;
  }

  const isSudo = typeof process.getuid === "function" && process.getuid() === 0;

  const modulePath = new URL(import.meta.url).pathname;
  const baseDir = modulePath.startsWith("/$bunfs/") ? process.cwd() : new URL("..", import.meta.url).pathname;
  const tlsDir = Bun.env.GOLINK_TLS_DIR ?? `${baseDir}/tls`;
  const certPath = Bun.env.TLS_CERT_PATH ?? `${tlsDir}/cert.pem`;
  const keyPath = Bun.env.TLS_KEY_PATH ?? `${tlsDir}/key.pem`;

  console.log(`Domains: ${domains.join(", ")}`);
  console.log("Generating TLS certificate...");
  generateTls(domains, tlsDir, certPath, keyPath);

  if (process.platform === "darwin") {
    console.log("Trusting TLS certificate in login keychain...");
    trustTls(certPath);
  } else {
    console.log("Skipping trust step (macOS only).");
  }

  const missingHosts = findMissingHosts(domains);
  if (missingHosts.length === 0) {
    console.log("/etc/hosts already contains all domains.");
    return;
  }

  if (isSudo) {
    console.log("Updating /etc/hosts...");
    updateHosts(missingHosts);
  } else {
    console.warn("/etc/hosts update requires sudo. Please rerun with sudo:");
    console.warn("sudo ./golink sync-sys");
  }
}

function generateTls(domains: string[], tlsDir: string, certPath: string, keyPath: string): void {
  mkdirSync(tlsDir, { recursive: true });

  const primary = domains.includes("go") ? "go" : domains[0];
  const subjectAltName = domains.map((domain) => `DNS:${domain}`).join(",");

  const result = spawnSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-nodes",
      "-days",
      "3650",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-subj",
      `/CN=${primary}`,
      "-addext",
      `subjectAltName=${subjectAltName}`,
    ],
    { stdio: "inherit" }
  );

  if (result.status !== 0) {
    throw new Error("openssl failed to generate TLS certificate");
  }
}

function trustTls(certPath: string): void {
  const home = Bun.env.HOME ?? "";
  const keychainPath = home
    ? `${home}/Library/Keychains/login.keychain-db`
    : "~/Library/Keychains/login.keychain-db";

  const result = spawnSync(
    "security",
    ["add-trusted-cert", "-k", keychainPath, certPath],
    { stdio: "inherit" }
  );

  if (result.status !== 0) {
    console.warn("Failed to trust certificate. You can run it manually:");
    console.warn(
      "security add-trusted-cert -k ~/Library/Keychains/login.keychain-db ./tls/cert.pem"
    );
  }
}

function findMissingHosts(domains: string[]): string[] {
  const hostsPath = "/etc/hosts";
  if (!existsSync(hostsPath)) {
    throw new Error("/etc/hosts not found");
  }

  const content = readFileSync(hostsPath, "utf8");
  const lower = content.toLowerCase();
  return domains.filter((domain) => !lower.includes(`127.0.0.1 ${domain.toLowerCase()}`));
}

function updateHosts(domains: string[]): void {
  const hostsPath = "/etc/hosts";
  if (!existsSync(hostsPath)) {
    throw new Error("/etc/hosts not found");
  }

  const content = readFileSync(hostsPath, "utf8");
  const lower = content.toLowerCase();
  const missing = domains.filter(
    (domain) => !lower.includes(`127.0.0.1 ${domain.toLowerCase()}`)
  );

  if (missing.length === 0) {
    console.log("/etc/hosts already contains all domains.");
    return;
  }

  const lines = missing.map((domain) => `127.0.0.1 ${domain}`).join("\n") + "\n";
  appendFileSync(hostsPath, lines);
  console.log(`Added ${missing.length} host entries to ${hostsPath}`);
}
