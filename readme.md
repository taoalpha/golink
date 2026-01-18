# Personal Go Link

A minimal Bun + SQLite go link system with variable patterns, defaults, and a built-in admin UI. Works locally without browser extensions by mapping `go` to localhost.

## Features
- Fast redirects for exact slugs (e.g. `go/jira`)
- Template slugs with variables (e.g. `go/pr/{prNumber}`)
- Template defaults when missing variables (e.g. visit `go/pr` to use a default)
- Admin UI at `/_/` with variable badge and default URL support
- Self-signed TLS support (optional)

## Requirements
- Bun (runtime)
- macOS/Linux host file access

## Quick Start (HTTP)
1) Map `go` to localhost:
```bash
sudo sh -c 'echo "127.0.0.1 go" >> /etc/hosts'
```

2) Start the server (HTTP):
```bash
bun run index.ts
```

3) Open the dashboard:
```
http://go:8787/_/
```

Set `PORT=80` for `http://go/` (requires sudo):
```bash
sudo PORT=80 bun run index.ts
```

## Quick Start (HTTPS, self-signed)
1) Generate a self-signed cert (already scripted here): files land in `./tls/cert.pem` and `./tls/key.pem`. If you need to regenerate:
```bash
mkdir -p tls
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
  -keyout ./tls/key.pem -out ./tls/cert.pem \
  -subj "/CN=go" -addext "subjectAltName=DNS:go"
```

2) Run HTTPS (non-privileged port):
```bash
PORT=8443 TLS=1 bun run index.ts
```
Then visit `https://go:8443/_/` (browser will warn because it’s self-signed).

3) Optional: trust the cert to remove warnings (macOS, user keychain):
```bash
security add-trusted-cert -k ~/Library/Keychains/login.keychain-db ./tls/cert.pem
```
(System-wide trust requires sudo.)

## Using `https://go/` without a port
You need either port 443 or a port forward:
- **Bind 443 directly (requires sudo, frees the port first):**
  ```bash
  sudo PORT=443 TLS=1 bun run index.ts
  ```
- **Port-forward 443 -> 8443 using PF (macOS):**
  1. Create anchor `/etc/pf.anchors/golink`:
     ```bash
     sudo sh -c 'cat > /etc/pf.anchors/golink <<"EOF"\
rdr pass on lo0 inet proto tcp from any to 127.0.0.1 port 443 -> 127.0.0.1 port 8443
EOF'
     ```
  2. Add to `/etc/pf.conf`:
     ```
     anchor "golink"
     load anchor "golink" from "/etc/pf.anchors/golink"
     ```
  3. Reload PF:
     ```bash
     sudo pfctl -f /etc/pf.conf
     sudo pfctl -e
     ```
  Disable later with `sudo pfctl -d`.

## Slugs, Templates, and Defaults
- Exact slugs win over templates.
- Template slugs use `{name}` placeholders. Example: `pr/{prNumber}` with URL `https://github.com/org/repo/pull/{prNumber}`.
- Default URL (for template slugs only): when you visit `go/pr` (no param), it redirects to the default URL if set.
- The default URL field is disabled unless the slug contains `{}`.

## Admin UI
- Dashboard: `/_/` — lists links, badges template links, and shows defaults only when the slug is a template.
- Edit page: `/_/edit/<slug>` — supports slug, destination URL, and default URL (for templates).

## Hot Reload
Use Bun watch mode during development:
```bash
PORT=8443 TLS=1 bun --watch index.ts
```

## Logs
- `golink.log` is ignored by git; generated when running with nohup.

## Notes
- If port 443 is taken (e.g., Tailscale serve), free it or use port-forwarding/another port.
- Self-signed certs always warn until trusted; for a smoother experience, consider mkcert or Caddy (not included here).
