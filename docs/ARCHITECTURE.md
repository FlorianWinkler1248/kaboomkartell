# Architektur — KaboomKartell

> Community-Radio-Plattform für elektronische Musik von **4Flow** —
> Next.js, TypeScript und ein Radio, das nie stillsteht.

---

## System-Übersicht

KaboomKartell ist eine Full-Stack-Next.js-Anwendung. Kern ist **kein**
klassischer On-Demand-Player, sondern ein **server-gesteuertes Live-Radio**:
der Server bestimmt, was gerade läuft, alle Hörer sind synchron, und die
Community stimmt live über den nächsten Track ab. Dazu kommen Auth-Stack
(inkl. 2FA), Admin-Bereich, Mehrsprachigkeit und eine öffentliche API, über
die KI-Agenten die Plattform per MCP erreichen.

```
Browser / KI-Agent
  |
  v
Next.js App (App Router — Server Components + Client)
  |
  +--> API Routes (/api/*)
  |       |
  |       +--> Radio-Engine (radio-state / radio-probability / radio-sync-control)
  |       +--> Auth (NextAuth v5 + 2FA + Agent-Token-Flow)
  |       +--> Prisma 7 --> SQLite (better-sqlite3, WAL)
  |
  +--> PlayerProvider (globaler Client-State, Wiedergabe + Sync)
  |       |
  |       v
  |    /api/tracks/[id]/stream  (HTTP Range-Requests, 206 Partial Content)
  |
  +--> Öffentliche kbk/*-API  <-- externer MCP-Server (mcp.kaboomkartell.com)
```

## Tech-Stack

| Layer | Technologie | Begründung |
|-------|-------------|------------|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript 5 | Server Components, API-Routes als Backend, SSR für SEO |
| Styling | Tailwind CSS 4 (`@theme inline`) | Dark-first Theme, Responsive Utilities, kein Runtime-CSS-in-JS |
| Datenbank | SQLite via better-sqlite3 (WAL) | Bewusst gewählt: ein Prozess, kein externer DB-Dienst, atomare Backups. Für die Single-Server-Realität angemessen (siehe „Bewusste Trade-offs") |
| ORM | Prisma 7 (better-sqlite3-Adapter) | Type-safe Queries, deklaratives Schema, Migrationen |
| Auth | NextAuth v5 (Auth.js) + TOTP/Email-2FA (`otpauth`) + `bcrypt` | JWT-Sessions, Credentials-Provider, Discord-/Twitch-OAuth-Linking |
| i18n | next-intl 4 | 4 Sprachen (EN/DE/FR/ES), Katalog-Parität per Gate erzwungen |
| Mail | nodemailer | Verifizierung, Passwort-Reset, Newsletter |
| Validation | zod 4 | Request-Schemas an jeder API-Grenze |
| Icons | lucide-react + eigene Pixel-Icon-Sammlung | Tree-shakable Vektor-Icons plus PNG-Pixel-Set fürs Retro-Motiv |
| Tests | vitest | Unit-Tests für Radio-Logik, Auth, Permissions, i18n |
| Deployment | systemd-Service hinter Caddy (kein Container) | Details in [`DEPLOYMENT.md`](DEPLOYMENT.md) |

## Projektstruktur

```
kaboomkartell/
├── prisma/
│   ├── schema.prisma          # 20 Models (User, Track, Radio*, Playlist, Pool, ...)
│   ├── migrations/            # DB-Migrationen
│   └── seed.ts                # Grund-Daten
├── messages/                  # i18n-Kataloge (en/de/fr/es.json)
├── public/
│   ├── images/                # Logo, Boomy-Sprites
│   ├── icons/                 # PWA-/App-Icons + Pixel-Icon-Set
│   ├── llms.txt               # Maschinen-lesbare Plattform-Beschreibung
│   └── .well-known/mcp.json   # MCP-Discovery
├── src/
│   ├── app/                   # Routen (App Router)
│   │   ├── layout.tsx         # Root-Layout (PlayerProvider, Ticker, MiniPlayer, i18n)
│   │   ├── page.tsx           # Homepage (Hero, Radio, Drops, Mission)
│   │   ├── radio/ library/ schedule/ playlists/ artists/ pack/
│   │   ├── learn/synthesizer/ # Interaktives Synth-Tutorial
│   │   ├── mcp/               # MCP-Discovery-Seite
│   │   ├── profile/[username]/ tracks/[slug]/
│   │   ├── login/ register/ forgot-password/ reset-password/ verify-email/
│   │   ├── settings/          # Profil, Sicherheit (2FA), Connections, Agent-Access
│   │   ├── admin/             # Dashboard: Tracks, Users, Pools, Radio, Timetable, ...
│   │   └── api/               # 80 API-Routes (siehe API.md)
│   ├── components/
│   │   ├── kbk/               # KBK-spezifische Sektionen (Radio-Cockpit, Ticker, ...)
│   │   ├── player/            # Wiedergabe-UI (FullScreenPlayer, MiniPlayer, Controls)
│   │   ├── synth/             # Synth-Lab (Web-Audio-Tutorial)
│   │   ├── admin/ artists/ profile/ tracks/ twitch/ layout/ providers/ ui/
│   │   └── sections/          # Homepage-Sektionen (RadioHero, ...)
│   ├── hooks/                 # useAudioPlayer, useRadioSync, useAudioAnalyser, ...
│   ├── lib/                   # Domänen-Logik (siehe unten)
│   ├── generated/prisma/      # Generierter Prisma-Client
│   └── middleware.ts          # Route-Protection (Admin + geschützte Bereiche)
└── docs/
```

Die **Domänen-Logik** liegt bewusst in `src/lib/` statt in den API-Routes —
so ist sie ohne HTTP-Layer testbar:

- **Radio:** `radio-state.ts` (Server-State-Maschine), `radio-probability.ts`
  (gewichtete Auswahl), `radio-sync-control.ts` (Wiedergabe-Synchronisation),
  `radio.ts`, `radio-types.ts`, `timetable-rotation.ts`
- **Auth/Security:** `auth.ts` / `auth.config.ts`, `auth-security.ts`
  (Lockout), `password-policy.ts`, `permissions.ts`, `agent-auth.ts` +
  `device-code.ts` (Agent-OAuth), `security-log.ts`, `rate-limit.ts`
- **Domäne:** `boomy.ts`, `badges.ts`, `newsletter.ts`, `vanity.ts`
  (hide-until-threshold), `mp3-duration.ts` (VBR-Xing), `storage.ts`,
  `mcp-info.ts`, `twitch.ts`, `soundcloud.ts`, `discord-webhook.ts`

## Radio-Engine (das Herzstück)

Anders als ein Streaming-Dienst ist die Wiedergabe **server-autoritativ**:

- **Sendeplan** (`TimetableSlot` / `timetable-rotation.ts`): pro Kanal und
  Zeitfenster ist ein Pool aktiv; die Rotation wechselt wochentagsabhängig.
- **Track-Auswahl** (`radio-probability.ts`): innerhalb des aktiven Pools wird
  der nächste Track gewichtet-probabilistisch gezogen — kein starres Round-Robin.
- **Crowd Control** (`radio-state.ts`): die Community stimmt live über den
  **übernächsten** Track ab (N+2), während der nächste bereits feststeht
  („UP NEXT") und als Preload-Puffer dient. State wird per Compare-and-Swap
  fortgeschrieben, damit parallele Requests sich nicht überschreiben.
- **Wiedergabe-Sync** (`radio-sync-control.ts`): Clients holen die Server-Zeit
  und die Position im aktuellen Track und richten sich per Phase-Locked-Loop
  (leichte Tempo-Korrektur) aus — alle Hörer sind im selben Moment am selben Punkt.

Kanäle: `phonk` und `hardtek` laufen 24/7; ein `live`-Kanal ist nur während
Events aktiv. Genres: Phonk, Hardtek, Raggatek, Brazilian Phonk.

## Audio-Player-Architektur

Der Client-Player ist als Hook-Komposition unter einem globalen Provider
gebaut (`PlayerProvider` im Root-Layout — bewährt, wird nur erweitert, nie
umgebaut):

```
useAudioPlayer     HTMLAudioElement + Play/Pause/Seek/Volume/Events
usePlaylist        Track-Liste, Shuffle, Repeat, Stats
useRadioSync       Abgleich mit dem Server-Radio-State (Position/Track/Vote)
useAudioAnalyser   Web-Audio-FFT für den Equalizer
useServerTime      Uhr-Drift-Korrektur gegen die Serverzeit
useMediaSession    OS-Media-Controls (Lockscreen/Tastatur)
useKeyboardShortcuts / useChannelAccent / useTrackAiTag
```

Die Wiedergabe ist **nie pausierbar, nur stummschaltbar** — Hausparty, nicht
Spotify. Das steckt in der Provider-Logik, nicht in einzelnen Buttons.

### Streaming

Der Endpoint `/api/tracks/[id]/stream` implementiert HTTP-Range-Requests
(RFC 7233): ohne `Range`-Header 200 + ganze Datei, mit `Range` 206 Partial
Content + `Content-Range`. Ein Node-`ReadStream` wird in einen Web-
`ReadableStream` konvertiert — Seeking ohne Vollständig-Download. Track-Dauern
werden über den Xing-Frame-Count bestimmt (Suno-Tracks sind VBR; CBR-Annahme
lieferte falsche Dauern → siehe `mp3-duration.ts`).

## Auth-Architektur

NextAuth v5 mit JWT-Sessions, aufgeteilt für Edge-Kompatibilität:

- **`auth.config.ts`** — Edge-kompatibel (kein DB-Import), genutzt in
  `middleware.ts`; entscheidet Zugang aus der Rolle im JWT.
- **`auth.ts`** — volle Config (Node Runtime): Credentials-Provider mit
  Prisma + `bcrypt`, injiziert Rolle/UserId/Username in JWT + Session.

Darüber hinaus:

- **2FA** (`account/2fa/*`): TOTP (`otpauth` + QR) **oder** Email-OTP,
  Backup-Codes (`crypto.randomInt`), AES-verschlüsseltes TOTP-Secret.
- **Account-Sicherheit:** Login-Lockout (`auth-security.ts`), Passwort-Policy,
  Audit-Log (`SecurityEvent`), „überall abmelden", Email-Verifizierung,
  Passwort-Reset — alle mit Rate-Limiting (`rate-limit.ts`).
- **OAuth-Linking:** Discord + Twitch (`LinkedAccount`).
- **Agent-Auth** (`agent/*`, `agent-auth.ts`, `device-code.ts`): OAuth-artiger
  Device-Code-Flow, über den KI-Agenten scoped Personal Access Tokens
  (`ApiToken`) erhalten — die Brücke zwischen Mensch-Login und MCP-Zugriff.

### Rollen & Trust-Tiers

| Rolle | Kern-Berechtigungen |
|-------|---------------------|
| `MITGLIED` | Hören, Voten, Profil, Community |
| `KUENSTLER` | + eigene Tracks / Featuring |
| `HELFER` | + Moderation |
| `ADMIN` | Voller Zugriff (Tracks, Users, Pools, Radio, Settings) |

Rechte werden zentral in `permissions.ts` aufgelöst; Vote-/Schreibrechte
hängen zusätzlich am 2FA-Trust-Tier.

## Datenbank-Schema (20 Models)

Gruppiert nach Domäne:

- **Identität & Sicherheit:** `User`, `Badge`, `LinkedAccount`,
  `SecurityEvent`, `ApiToken`
- **Musik:** `Track`, `Pool`, `PoolTrack`, `Playlist`, `PlaylistTrack`,
  `ReleaseSlot`
- **Radio-Laufzeit:** `RadioPlay`, `RadioHead`, `RadioVote`, `TimetableSlot`,
  `TimetableEvent`
- **Community:** `Vote`, `WallPost`
- **Plattform:** `SiteSettings` (Singleton)

Enums sind bewusst deutsch (`MITGLIED`/`KUENSTLER`/`HELFER`/`ADMIN`,
`DRAFT`/`PUBLISHED`/`ARCHIVED`) — wie die Code-Kommentare; die **UI ist
Englisch**.

## Öffentliche API & MCP

Die `kbk/*`-Routen (`canon`, `next-drop`, `stats`) plus die Radio-/Track-
Leseendpunkte bilden eine **read-only Public-API**. Ein separater
MCP-Server (eigenes Repo, `mcp.kaboomkartell.com`) legt darüber Tools, mit
denen jede KI die Plattform erreicht — inkl. der Multiversum-Kanon-Auslieferung
(`kbk/canon`). Discovery läuft über `public/.well-known/mcp.json`, `llms.txt`
und Link-Header (SoT: `lib/mcp-info.ts`).

## Internationalisierung

next-intl mit vier Katalogen (`messages/{en,de,fr,es}.json`). Ein Gate
(`scripts/validate-i18n.mjs`, in `prebuild` + CI) erzwingt Schlüssel-Parität
über alle Sprachen. Admin-Bereich + MCP-/Boomy-Texte bleiben bewusst EN(+DE).

## Bewusste Trade-offs

Souverän vertretene Solo-Projekt-Entscheidungen, keine Versehen:

- **SQLite statt PostgreSQL** — ein Server, kein DB-Cluster; mit Backup
  legitim. Ein Wechsel wäre ein ORM-Adapter-Tausch.
- **Single-Server-Deploy ohne Staging** — atomarer Release + einfacher Rollback.
- **In-Memory-Rate-Limiting** — passend zur Single-Instance.
- **PlayerProvider „nur erweitern"** — die testbare Auslagerung der Sync-Logik
  nach `lib/` hält den bewährten Kern stabil.

Deploy-Details (systemd, Caddy, Backups): [`DEPLOYMENT.md`](DEPLOYMENT.md).
API-Referenz: [`API.md`](API.md). Design-Sprache: [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md).
