# Design-System -- KaboomKartell

> Visuelles Regelwerk für die KaboomKartell-Plattform. Dark Mode ist Standard.

---

## Farben

Abgeleitet vom 4Flow Wolf-Logo. Rasta-Farben als Akzente auf dunklem Hintergrund.

### Primär-Palette

| Name | Hex | CSS-Variable | Verwendung |
|------|-----|-------------|-----------|
| Rasta-Grün | `#2D8B46` | `--rasta-green` | Primär-Buttons, Aktive States, Play-Button |
| Rasta-Grün-Hell | `#3DA85A` | `--rasta-green-light` | Hover-States |
| Rasta-Gelb | `#F5C518` | `--rasta-yellow` | Repeat-Modus, Genre-Tags, Warnungen |
| Rasta-Rot | `#D4213D` | `--rasta-red` | Danger-States, Tertiär-Akzent |

### Hintergrund-Palette

| Name | Hex | CSS-Variable | Verwendung |
|------|-----|-------------|-----------|
| Schwarz | `#0A0A0A` | `--kbk-black` | Body-Hintergrund |
| Dark-900 | `#121212` | `--kbk-dark-900` | Standard-Hintergrund |
| Dark-800 | `#1A1A1A` | `--kbk-dark-800` | Cards, Sidebar, Surface |
| Dark-700 | `#242424` | `--kbk-dark-700` | Borders, Input-Hintergrund |
| Dark-600 | `#333333` | `--kbk-dark-600` | Hover-Borders, Divider |

### Text-Palette

| Name | Hex | CSS-Variable | Verwendung |
|------|-----|-------------|-----------|
| Foreground | `#F0F0F0` | `--foreground` | Primär-Text |
| Secondary | `#B0B0B0` | `--secondary` | Sekundär-Text |
| Muted | `#666666` | `--muted` | Gedämpfter Text, Platzhalter |

## Gradienten

```css
--gradient-rasta: linear-gradient(135deg, #2D8B46, #F5C518, #D4213D);
--gradient-progress: linear-gradient(90deg, #2D8B46, #F5C518, #D4213D);
--gradient-accent: linear-gradient(135deg, #2D8B46, #3DA85A);
```

- **Rasta-Gradient**: Hero-Hintergrund, Logo-Glow, CTA-Hintergrund
- **Progress-Gradient**: Player-Fortschrittsbalken, MiniPlayer
- **Accent-Gradient**: Subtile Akzente

### Gradient-Text

```html
<span class="text-rasta-gradient">KaboomKartell</span>
```

Erzeugt Text mit dem Rasta-Farbverlauf (via `background-clip: text`).

## Typografie

| Typ | Font | Gewicht | Verwendung |
|-----|------|---------|-----------|
| Headings | Montserrat | Bold (700) | Überschriften, Logo-Text |
| Body | Inter | Regular (400) | Fließtext, Labels, Buttons |

Beide Fonts werden via `next/font/google` geladen (optimiert, kein Layout-Shift).

CSS-Variablen: `--font-heading`, `--font-body`

## Komponenten-Bibliothek

### UI-Basis

| Komponente | Varianten | Beschreibung |
|-----------|-----------|-------------|
| `Button` | primary, secondary, outline, ghost, danger | Grün-primär, Hover-States |
| `Input` | standard, error | Dark-themed, Label + Fehlermeldung |
| `Card` | standard, mit Header | Surface-Container (bg-surface) |
| `Badge` | live, draft, archived, admin, kuenstler, helfer | Farbige Status-Pillen |
| `LoadingSpinner` | sm, md, lg | Rasta-grüner Border-Spinner |

### Player-Komponenten

| Komponente | Beschreibung |
|-----------|-------------|
| `MusicPlayer` | Orchestrator (verbindet Audio + Playlist) |
| `NowPlaying` | Track-Info + Equalizer-Animation bei Play |
| `ProgressBar` | Klickbar, Drag-to-Seek, Hover-Zeit-Tooltip |
| `PlayerControls` | Shuffle, Skip, Play/Pause, Repeat |
| `VolumeControl` | Custom-Styled Range + Mute + Prozent |
| `PlayerStats` | Gesamt / Gespielt / Dauer |
| `Playlist` | Track-Liste + Drag&Drop-Upload-Zone |
| `PlaylistItem` | Nummer, Titel, Dauer, Active/Played-State |
| `MiniPlayer` | Fixierte Bottom-Bar (alle Seiten) |

### Section-Komponenten

| Komponente | Beschreibung |
|-----------|-------------|
| `HeroSection` | Vollbild: Wolf-Logo, Gradient-Text, CTAs |
| `FeaturedTracks` | Neueste Tracks aus DB (Server-Component) |
| `AboutTeaser` | Feature-Highlights mit farbigen Icons |
| `CallToAction` | Registrierungs-Aufforderung |

## Keyboard-Shortcuts

| Taste | Aktion |
|-------|--------|
| Space | Play / Pause |
| Pfeil Links | 5 Sekunden zurück |
| Pfeil Rechts | 5 Sekunden vor |
| Pfeil Hoch | Lautstärke +5% |
| Pfeil Runter | Lautstärke -5% |
| N | Nächster Track |
| P | Vorheriger Track |
| S | Shuffle umschalten |
| R | Repeat-Modus durchschalten |
| M | Mute / Unmute |

Shortcuts sind inaktiv wenn ein Input/Textarea fokussiert ist.

## Spezielle CSS-Features

### Equalizer-Animation
```css
@keyframes equalizer {
  0%, 100% { height: 4px; }
  50% { height: 16px; }
}
```
3 Balken mit unterschiedlicher Delay = Equalizer-Effekt bei laufendem Track.

### Volume-Slider
Custom-styled Range-Input mit Rasta-Grün Thumb und Track-Styling
für WebKit und Firefox.

### Scrollbar
`.scrollbar-thin` für die Playlist: schmale, dunkle Scrollbar
die zum Dark-Theme passt.
