# Deployment

> Hinweis: Dieses Repo ist source-available (siehe `LICENSE.md`) — die
> Deployment-Doku ist bewusst hoch-level gehalten. Sie beschreibt, WIE die
> Live-Instanz betrieben wird, nicht eine Anleitung zum Nachbauen.

## Produktions-Setup (seit Mai 2026)

Die Live-Instanz auf kaboomkartell.com läuft **ohne Container**:

- **Build:** `next build --webpack` (Turbopack wird bewusst nicht genutzt —
  es bricht an out-of-root-Symlinks für den Upload-Storage).
- **Runtime:** Node.js als **systemd-Service** (unprivilegierter
  Service-User), App-Port nur intern erreichbar.
- **Reverse-Proxy:** **Caddy** mit automatischem TLS (Let's Encrypt)
  terminiert HTTPS und proxied auf den App-Port. Caddy setzt
  `X-Forwarded-For` vertrauenswürdig (kein `trusted_proxies` →
  client-gesendete Header werden verworfen).
- **Datenbank:** SQLite (better-sqlite3) im **WAL-Modus** mit
  `busy_timeout`; DB- und Upload-Daten liegen außerhalb des Repos auf
  einem Daten-Verzeichnis, das per Symlink in `public/uploads` eingehängt
  wird.
- **Deploy-Ablauf:** `git pull` → Symlink sicherstellen → Clean-Build →
  Service-Restart → HTTP-Verify. Schema-Migrationen laufen bewusst
  **manuell** (Service-Stop → DB-Backup inkl. WAL-Files →
  `prisma migrate deploy` → Start), nie automatisch im Deploy.

## MCP-Server

Der öffentliche MCP-Server (`mcp.kaboomkartell.com`) ist ein **separater
Node-Service** hinter demselben Caddy (eigene Subdomain, eigener systemd-
Service). Er konsumiert ausschließlich die öffentlichen KBK-APIs —
read-only, ohne Auth, rate-limited.

## Architektur

KBK läuft als direkte systemd-Services hinter einem Caddy-Reverse-Proxy mit
automatischem TLS. Die begründenden Architektur-Entscheidungen sind in den
Projekt-Notizen dokumentiert.
