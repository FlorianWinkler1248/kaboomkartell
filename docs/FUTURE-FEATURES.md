# Feature-Stand & Roadmap — KaboomKartell

> Ehrlicher Stand: was steht, was als Nächstes kommt, wohin die Reise geht.
> Kein Wunschzettel als „fertig" getarnt.

---

## Geliefert & live

**Radio-Kern**
- [x] Server-gesteuertes Live-Radio — Wiedergabe ist server-autoritativ, nie pausierbar (nur mute)
- [x] Crowd Control — Community votet live über den übernächsten Track (N+2), UP-NEXT als Preload-Puffer
- [x] Wiedergabe-Sync per Phase-Locked-Loop — alle Hörer synchron
- [x] Gewichtet-probabilistische Track-Auswahl statt starrem Round-Robin
- [x] 24/7-Sendeplan (Pools pro Zeitfenster, wochentagsabhängige Rotation) + Event-`live`-Kanal
- [x] Kanäle Phonk & Hardtek; Genres Phonk / Hardtek / Raggatek / Brazilian Phonk

**Player**
- [x] Full-Screen- + Mini-Player (Audio persistiert beim Navigieren)
- [x] Equalizer (Web-Audio-FFT), MediaSession (OS-Controls), Keyboard-Shortcuts
- [x] MP3-Streaming mit HTTP-Range-Requests (Seeking); VBR-korrekte Dauer (Xing)

**Accounts & Sicherheit**
- [x] Auth (NextAuth v5, JWT, Rollen), Login-Lockout, Passwort-Policy
- [x] 2FA — TOTP **und** Email-OTP, Backup-Codes, verschlüsseltes Secret
- [x] Email-Verifizierung, Passwort-Reset, „überall abmelden", Audit-Log
- [x] OAuth-Linking (Discord, Twitch)

**Community & Content**
- [x] Pools / Sets / Playlists, Release-Kalender, Track-Featuring
- [x] Profile (`/profile/[username]`), Artists-Seite, Wolfpack-Badges
- [x] Twitch-Integration (Live-Status + Embed), Discord-Webhooks
- [x] Boomy — KI-Resident-DJ (auto-publish, Cover-Generierung, Wall-Posts)
- [x] Synth-Lab — interaktives Web-Audio-Tutorial (`/learn/synthesizer`)
- [x] Newsletter (Daily-Drop)
- [x] „Keine Fake-Zahlen"-Politik — Community-Zähler erst ab echtem Schwellenwert (`vanity.ts`)

**Plattform**
- [x] i18n in 4 Sprachen (EN/DE/FR/ES), Parität per Gate erzwungen
- [x] Admin-Dashboard (Tracks, Users, Pools, Radio, Timetable, Playlists, Release-Kalender, Prozess-Bibliothek)
- [x] Öffentlicher MCP-Server + Agent-Auth (Device-Flow → scoped PATs) — KI-Zugang zur Plattform
- [x] Multiversum-Kanon-Auslieferung über die API (`kbk/canon`)
- [x] SEO/Discovery (JSON-LD, `llms.txt`, `.well-known/mcp.json`, robots), PWA-Icons

---

## In Arbeit / nächste Schritte

- [ ] **Wolfpack-Progression** — Rang-System (Cub → Wolf → Alpha) aus Aktivität + Freischaltungen; braucht Produkt-Linie (Stufen, Schwellen)
- [ ] **Retention-Hebel** — Event-Countdown + „Notify me", stärkere Boomy-Bindung
- [ ] **Automatisches DB-Backup** (Litestream/PITR) statt manuellem Snapshot
- [ ] **Now-Playing-Caching** (kurze TTL + ETag) + Hintergrund-Tab-Pause in den Poll-Loops — der reale Viral-Lastpfad
- [ ] **a11y-Feinschliff** — Voting-Kandidaten als `<button>`, Seek-Bar-Tastatursteuerung

---

## Später / Vision

- [ ] Audio-Auslieferung über CDN statt App-Prozess
- [ ] `next/image` für Cover/Hero/Avatare
- [ ] E2E-Smoke-Tests (Playwright) über die Kernpfade
- [ ] Gott-Komponenten weiter zerlegen (Release-Kalender, Synth, MiniPlayer)
- [ ] PostgreSQL — **nur falls** Single-Server-Skalierung nicht mehr reicht (siehe Trade-offs)
- [ ] Monetarisierung (Beat-Verkauf, Merch, Support) — bewusst nachrangig hinter Community

---

Bewusste Trade-offs (SQLite, Single-Server, PlayerProvider) stehen in
[`ARCHITECTURE.md`](ARCHITECTURE.md) → „Bewusste Trade-offs".
