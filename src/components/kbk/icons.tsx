'use client';

/**
 * KBK Icon-Set — PixelFlow-basiert.
 *
 * Standard-Icons (play, chat, mic, eye, volume, etc.) liegen direkt unter
 * /public/icons/pixel/*.png (110 Stück aus PixelFlow Mini Round 1).
 *
 * KBK-Custom-Icons (15 Stück, lightning/flame/sparkle/auraPulse/camera/
 * musicNote/vinyl/waveform/broadcastTower/calendar/headphones/discordLogo/
 * tiktokLogo/instagramLogo/eyeGlitch) liegen size-bucketed unter
 * /public/icons/pixel/<size>/<name>.png mit Sizes 16/24/32/64.
 *
 * pickSize() rundet die Display-Size auf die nächstgrößere Render-Size
 * — so wird immer pixel-perfect heruntergerechnet (kein Sub-Pixel-Aliasing).
 */

import type { CSSProperties } from 'react';

type IconProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
};

// KBK-Custom-Icons mit Multi-Size-Render (16/24/32/64). Alle anderen Icons
// liegen weiterhin direkt unter /icons/pixel/<name>.png.
const KBK_ICONS = new Set([
  'lightning', 'flame', 'sparkle', 'auraPulse', 'camera', 'musicNote',
  'vinyl', 'waveform', 'broadcastTower', 'calendar', 'headphones',
  'discordLogo', 'tiktokLogo', 'instagramLogo', 'eyeGlitch',
]);

function pickSize(target: number): 16 | 24 | 32 | 64 {
  if (target <= 16) return 16;
  if (target <= 24) return 24;
  if (target <= 32) return 32;
  return 64;
}

/**
 * PixelIcon — generischer Wrapper um ein PixelFlow-PNG.
 * `name` = Datei-Basisname ohne .png.
 *
 * Bei KBK-Icons wird die nächstgrößere Render-Size geladen (16/24/32/64).
 * Andere Icons laden aus dem Wurzel-Ordner.
 */
function PixelIcon({
  name,
  size = 24,
  className = '',
  style = {},
  alt = '',
}: IconProps & { name: string; alt?: string }) {
  const isKbk = KBK_ICONS.has(name);
  const src = isKbk
    ? `/icons/pixel/${pickSize(size)}/${name}.png`
    : `/icons/pixel/${name}.png`;
  return (
    // Pixel-Art-Icon (dynamische src + imageRendering:pixelated) — Next <Image> wäre
    // hier kontraproduktiv; bewusstes <img>.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt={alt}
      className={className}
      style={{
        imageRendering: 'pixelated',
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style,
      }}
      draggable={false}
    />
  );
}

// === Direct-Match PixelFlow-Icons ===
export const IcoHome = (p: IconProps) => <PixelIcon name="home" alt="home" {...p} />;
export const IcoPlay = (p: IconProps) => <PixelIcon name="play" alt="play" {...p} />;
export const IcoPause = (p: IconProps) => <PixelIcon name="pause" alt="pause" {...p} />;
export const IcoSkip = (p: IconProps) => <PixelIcon name="skipNext" alt="next" {...p} />;
export const IcoPrev = (p: IconProps) => <PixelIcon name="skipPrev" alt="prev" {...p} />;
export const IcoVolume = (p: IconProps) => <PixelIcon name="volume" alt="volume" {...p} />;
export const IcoMute = (p: IconProps) => <PixelIcon name="mute" alt="mute" {...p} />;
export const IcoChat = (p: IconProps) => <PixelIcon name="chat" alt="chat" {...p} />;
export const IcoUsers = (p: IconProps) => <PixelIcon name="userGroup" alt="users" {...p} />;
export const IcoUser = (p: IconProps) => <PixelIcon name="user" alt="user" {...p} />;
export const IcoSend = (p: IconProps) => <PixelIcon name="send" alt="send" {...p} />;
export const IcoSettings = (p: IconProps) => <PixelIcon name="settings" alt="settings" {...p} />;
export const IcoSearch = (p: IconProps) => <PixelIcon name="search" alt="search" {...p} />;
export const IcoX = (p: IconProps) => <PixelIcon name="x" alt="close" {...p} />;
export const IcoClose = (p: IconProps) => <PixelIcon name="close" alt="close" {...p} />;
export const IcoMenu = (p: IconProps) => <PixelIcon name="menu" alt="menu" {...p} />;
export const IcoPlus = (p: IconProps) => <PixelIcon name="plus" alt="add" {...p} />;
export const IcoMinus = (p: IconProps) => <PixelIcon name="minus" alt="remove" {...p} />;
export const IcoCheck = (p: IconProps) => <PixelIcon name="check" alt="check" {...p} />;
export const IcoRefresh = (p: IconProps) => <PixelIcon name="refresh" alt="refresh" {...p} />;
export const IcoHeart = (p: IconProps) => <PixelIcon name="heart" alt="heart" {...p} />;
export const IcoStar = (p: IconProps) => <PixelIcon name="starFilled" alt="star" {...p} />;
export const IcoBell = (p: IconProps) => <PixelIcon name="bell" alt="bell" {...p} />;
export const IcoKey = (p: IconProps) => <PixelIcon name="key" alt="key" {...p} />;
export const IcoShield = (p: IconProps) => <PixelIcon name="shield" alt="shield" {...p} />;
export const IcoMail = (p: IconProps) => <PixelIcon name="mail" alt="mail" {...p} />;
export const IcoFolder = (p: IconProps) => <PixelIcon name="folder" alt="folder" {...p} />;
export const IcoUpload = (p: IconProps) => <PixelIcon name="upload" alt="upload" {...p} />;
export const IcoDownload = (p: IconProps) => <PixelIcon name="download" alt="download" {...p} />;
export const IcoSave = (p: IconProps) => <PixelIcon name="save" alt="save" {...p} />;
export const IcoTrash = (p: IconProps) => <PixelIcon name="trash" alt="delete" {...p} />;
export const IcoClipboard = (p: IconProps) => <PixelIcon name="clipboard" alt="clipboard" {...p} />;
export const IcoBookmark = (p: IconProps) => <PixelIcon name="bookmark" alt="bookmark" {...p} />;
export const IcoFlag = (p: IconProps) => <PixelIcon name="flag" alt="flag" {...p} />;
export const IcoMic = (p: IconProps) => <PixelIcon name="mic" alt="mic" {...p} />;
export const IcoMap = (p: IconProps) => <PixelIcon name="map" alt="map" {...p} />;
export const IcoChart = (p: IconProps) => <PixelIcon name="chart" alt="chart" {...p} />;
export const IcoDatabase = (p: IconProps) => <PixelIcon name="database" alt="database" {...p} />;
export const IcoError = (p: IconProps) => <PixelIcon name="error" alt="error" {...p} />;
export const IcoSuccess = (p: IconProps) => <PixelIcon name="success" alt="success" {...p} />;
export const IcoWarning = (p: IconProps) => <PixelIcon name="warning" alt="warning" {...p} />;
export const IcoInfo = (p: IconProps) => <PixelIcon name="info" alt="info" {...p} />;
export const IcoLoading = (p: IconProps) => <PixelIcon name="loading" alt="loading" {...p} />;
export const IcoLogin = (p: IconProps) => <PixelIcon name="login" alt="login" {...p} />;
export const IcoLogout = (p: IconProps) => <PixelIcon name="logout" alt="logout" {...p} />;
export const IcoFox = (p: IconProps) => <PixelIcon name="fox" alt="fox" {...p} />;
export const IcoBot = (p: IconProps) => <PixelIcon name="bot" alt="bot" {...p} />;

// === Mapping für KBK-Kontext — wo kein direktes PixelFlow-Icon existiert,
// wird ein sinnverwandtes Icon gewählt. ===

// === KBK-Custom-Icons (pixel-art, 25.04.) ===
// Eigene Pixel-Art pro Konzept, nicht mehr starFilled/eye/mic/volume-Doppelmappings.

// "Aura+" (Community-Upvote) — concentric pulses + radiating spikes
export const IcoAura = (p: IconProps) => <PixelIcon name="auraPulse" alt="aura+" {...p} />;
// "Sus" (Anti-AI-Flag) — Eye mit Glitch-Cross
export const IcoSus = (p: IconProps) => <PixelIcon name="eyeGlitch" alt="sus" {...p} />;
// "Radio" — Mic bleibt (Broadcasting-Konzept) — kein Konflikt mehr mit IcoNote
export const IcoRadio = (p: IconProps) => <PixelIcon name="mic" alt="radio" {...p} />;
// "Track/Vinyl" — Vinyl-Record mit Center-Hole + Grooves
export const IcoTrack = (p: IconProps) => <PixelIcon name="vinyl" alt="track" {...p} />;
// "Zap" (Blitz, Bass-Drop) — jagged neon Lightning-Bolt
export const IcoZap = (p: IconProps) => <PixelIcon name="lightning" alt="zap" {...p} />;
// "Fire" (Hot/Trending) — Multi-Layer Flame
export const IcoFire = (p: IconProps) => <PixelIcon name="flame" alt="hot" {...p} />;
// "Wave" (SoundCloud) — oscillating Waveform-Bars
export const IcoWave = (p: IconProps) => <PixelIcon name="waveform" alt="wave" {...p} />;
// "Cam" (Instagram) — Camera mit Lens
export const IcoCam = (p: IconProps) => <PixelIcon name="camera" alt="insta" {...p} />;
// "Note" (TikTok) — Music-Note (eighth note silhouette)
export const IcoNote = (p: IconProps) => <PixelIcon name="musicNote" alt="tiktok" {...p} />;
// "YT" (YouTube) — Play-Icon
export const IcoYT = (p: IconProps) => <PixelIcon name="play" alt="youtube" {...p} />;
// "Live" (Stream) — Broadcast-Tower mit Antenna + Signal-Lines
export const IcoLive = (p: IconProps) => <PixelIcon name="broadcastTower" alt="live" {...p} />;
// "Discord" — Chat-Icon
export const IcoDiscord = (p: IconProps) => <PixelIcon name="chat" alt="discord" {...p} />;
// "Calendar" — eigenes Calendar mit Grid + highlighted Date
export const IcoCalendar = (p: IconProps) => <PixelIcon name="calendar" alt="calendar" {...p} />;
// "Cans" (Headphones) — Headphones mit Band + Cans
export const IcoCans = (p: IconProps) => <PixelIcon name="headphones" alt="headphones" {...p} />;
// "Spark" — 4-pointed Sparkle + Dots
export const IcoSpark = (p: IconProps) => <PixelIcon name="sparkle" alt="spark" {...p} />;

// === Brand-Logos (Round 3, official-style Pixel-Tributes) ===
// Nur für SocialsSection o.ae., wo Brand-Recognition wichtig ist.
// Generic IcoDiscord/IcoNote/IcoCam (Chat/Note/Camera) bleiben für andere
// Use-Cases verfügbar (Photo-Upload, Generic-Music, Generic-Chat).

// Discord-Clyde-Wumpus: Body in Discord-Lila, weisse Augen mit Lila-Pupillen
export const IcoDiscordLogo = (p: IconProps) => <PixelIcon name="discordLogo" alt="discord" {...p} />;
// TikTok-Glitch-Note: Cyan/Magenta-Offset + Weiss zentriert
export const IcoTikTokLogo = (p: IconProps) => <PixelIcon name="tiktokLogo" alt="tiktok" {...p} />;
// Instagram-Camera-Square: Pink/Orange-Outline + Lens + Sucher
export const IcoInstagramLogo = (p: IconProps) => <PixelIcon name="instagramLogo" alt="instagram" {...p} />;

// Default-Export für generische Nutzung
export { PixelIcon };
export default PixelIcon;
