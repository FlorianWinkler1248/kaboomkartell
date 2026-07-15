# API-Referenz

Basis-URL: `https://kaboomkartell.com/api`

Die API umfasst rund 80 Routen (App-Router `route.ts`-Handler). Diese Referenz
ordnet sie nach Bereich statt jede einzeln aufzuzählen — die Datei-Struktur
unter `src/app/api/` ist die maßgebliche Quelle.

## Konventionen

- **Format:** JSON. Fehler kommen mit passendem Status (400 Validierung,
  401 nicht angemeldet, 403 keine Rolle, 404 nicht gefunden, 409 Konflikt,
  429 Rate-Limit).
- **Validierung:** Request-Bodies werden an der Grenze mit `zod` geprüft.
- **Auth (zwei Wege):**
  - **Session** — NextAuth-Cookie (Browser).
  - **Bearer-Token** — scoped Personal Access Token (`Authorization: Bearer …`)
    für KI-Agenten, ausgestellt über den Agent-Device-Flow.
- **Rate-Limiting:** schreibende und sicherheitsrelevante Routen sind gedrosselt.
- **Rollen:** `admin/*` erfordert Rolle `ADMIN`; einzelne Aktionen zusätzlich
  ein 2FA-Trust-Tier.

## Öffentlich (read-only, kein Login)

Die Fläche, die auch der MCP-Server bedient:

| Route | Zweck |
|-------|-------|
| `GET /api/radio/now-playing` | Was läuft gerade (pro Kanal) |
| `GET /api/radio/crowd-control` | Aktuelle Abstimmungs-Kandidaten + Live-Tally |
| `GET /api/radio/timetable` | Sendeplan |
| `GET /api/kbk/next-drop` | Nächster geplanter Drop |
| `GET /api/kbk/stats` | Öffentliche Plattform-Kennzahlen |
| `GET /api/kbk/canon` | Multiversum-Kanon-Slice (fürs MCP) |
| `GET /api/tracks` | Publizierte Tracks (paginiert) |
| `GET /api/tracks/[id]` | Track-Detail (+ PlayCount) |
| `GET /api/tracks/[id]/stream` | MP3-Streaming mit Range-Requests |
| `GET /api/playlists`, `GET /api/playlists/[id]` | Kuratierte Playlists |
| `GET /api/time` | Serverzeit (für Wiedergabe-Sync) |

### Streaming (Range-Requests)

```bash
# Volle Datei
curl https://kaboomkartell.com/api/tracks/TRACK_ID/stream

# Range-Request (Seeking) → 206 Partial Content
curl -H "Range: bytes=1000000-2000000" \
  https://kaboomkartell.com/api/tracks/TRACK_ID/stream
```

Antwort-Header bei `206`: `Content-Range: bytes START-END/TOTAL`,
`Accept-Ranges: bytes`, `Content-Type: audio/mpeg`.

## Mitglieder (Session erforderlich)

- `POST /api/users` — Registrierung (öffentlich), danach Email-Verifizierung
- `GET/PATCH /api/profile`, `GET /api/account/me`
- `POST /api/tracks/[id]/vote`, `POST /api/radio/vote` — Crowd-Control-Voting
- `GET/PUT /api/settings` — eigene Einstellungen

## Auth & Account-Sicherheit

- `…/api/auth/[...nextauth]` — Login/Logout/Session
- `auth/forgot-password`, `auth/reset-password`, `auth/verify-email`,
  `auth/resend-verification`, `auth/send-email-otp`, `auth/logout-all`
- `auth/check-credentials`, `auth/suggest-password`
- **2FA:** `account/2fa/setup`, `…/verify`, `…/setup-email`,
  `…/verify-email-setup`, `…/disable`, `…/cancel-setup`
- **OAuth-Linking:** `auth/discord/{start,callback,disconnect}`,
  `auth/twitch/{start,callback,disconnect}`

## Agent-Zugang (MCP / KI)

OAuth-artiger Device-Code-Flow, über den ein KI-Agent an ein scoped Token kommt:

| Route | Zweck |
|-------|-------|
| `POST /api/agent/device-code` | Device-Code anfordern |
| `GET /api/agent/authorize` | Nutzer bestätigt im Browser |
| `POST /api/agent/token` | Token abholen (nach Bestätigung) |
| `GET/DELETE /api/settings/agent-tokens[/id]` | Eigene Tokens verwalten |

## Admin (Rolle `ADMIN`)

`admin/stats`, `admin/tracks`, `admin/users/[id]/badges`, `admin/pools[/…]`,
`admin/pool-assign`, `admin/timetable[/…]` (+ `events`, `gaps`),
`admin/processes[/id]` (In-App-Prozess-Bibliothek), `admin/boomy-stats`,
`admin/cover-regenerate`.

## Boomy (KI-Resident-DJ, intern/geschützt)

`boomy/ai-tracks`, `boomy/auto-publish`, `boomy/peek-release`,
`boomy/rotate-playlists`, `boomy/wall-post`, `boomy/upload-cover`,
`boomy/track/[trackId]/cover`.

## Weitere

- `release-slots[/…]`, `release-slots/publish` — Release-Kalender
- `newsletter/daily-drop`, `newsletter/unsubscribe`
- `twitch/live-status`
- `metrics/ref` — Referrer-Tracking (KI-Traffic-Messung)
- `upload`, `uploads/[...path]` — Datei-Upload/-Auslieferung (geschützt)
