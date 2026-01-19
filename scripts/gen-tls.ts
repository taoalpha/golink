import { Database } from "bun:sqlite"

const DB_PATH = new URL("../data/golinks.sqlite", import.meta.url).pathname
const TLS_DIR = new URL("../tls", import.meta.url).pathname
const CERT_PATH = new URL("../tls/cert.pem", import.meta.url).pathname
const KEY_PATH = new URL("../tls/key.pem", import.meta.url).pathname

const db = new Database(DB_PATH)

const rows = db.query("SELECT name FROM domains ORDER BY name ASC").all() as Array<{ name: string }>
const domains = rows.map((row) => row.name).filter(Boolean)

if (domains.length === 0) {
  console.error("No domains found. Add domains via /_/domains first.")
  process.exit(1)
}

const subjectAltName = domains.map((domain) => `DNS:${domain}`).join(",")
const primary = domains.includes("go") ? "go" : domains[0]


const args = [
  "req",
  "-x509",
  "-newkey",
  "rsa:2048",
  "-sha256",
  "-nodes",
  "-days",
  "3650",
  "-keyout",
  KEY_PATH,
  "-out",
  CERT_PATH,
  "-subj",
  `/CN=${primary}`,
  "-addext",
  `subjectAltName=${subjectAltName}`,
]

const proc = Bun.spawn(["openssl", ...args], { stdout: "inherit", stderr: "inherit" })
const exitCode = await proc.exited
if (exitCode !== 0) {
  process.exit(exitCode)
}

if (process.platform === "darwin") {
  const home = Bun.env.HOME ?? ""
  const keychainPath = home
    ? `${home}/Library/Keychains/login.keychain-db`
    : "~/Library/Keychains/login.keychain-db"
  const trust = Bun.spawn(
    ["security", "add-trusted-cert", "-k", keychainPath, CERT_PATH],
    { stdout: "inherit", stderr: "inherit" }
  )
  const trustExit = await trust.exited
  if (trustExit !== 0) {
    console.error("Failed to trust certificate. You can run it manually:")
    console.error(
      "security add-trusted-cert -k ~/Library/Keychains/login.keychain-db ./tls/cert.pem"
    )
  }
}

console.log(`Generated TLS cert for: ${domains.join(", ")}`)
