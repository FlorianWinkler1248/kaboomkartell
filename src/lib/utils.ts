/**
 * Utility-Funktionen
 * Formatierung, Klassennamen, Slug-Generierung, etc.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Kombiniert Tailwind-Klassen ohne Konflikte.
 * Nutzt clsx für bedingte Klassen + tailwind-merge für Konfliktlösung.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatiert Sekunden als Zeit-String.
 * Direkt migriert von der bestehenden MP3Player.formatTime() Methode.
 *
 * @param seconds - Zeit in Sekunden
 * @returns Formatierter String (MM:SS oder HH:MM:SS)
 *
 * @example
 * formatTime(65)    // "1:05"
 * formatTime(3661)  // "1:01:01"
 * formatTime(NaN)   // "0:00"
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generiert einen URL-freundlichen Slug aus einem String.
 *
 * @example
 * slugify("Mein Cooler Track!")  // "mein-cooler-track"
 * slugify("4Flow - Arabtek")    // "4flow-arabtek"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/[ß]/g, 'ss')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

/**
 * Extrahiert den Track-Namen aus einem Dateinamen.
 * Entfernt die .mp3-Erweiterung und bereinigt den Namen.
 * Migriert von der bestehenden handleFiles() Logik.
 *
 * @example
 * trackNameFromFile("4Flow_-_Arabtek.mp3")  // "4Flow - Arabtek"
 */
export function trackNameFromFile(filename: string): string {
  return filename
    .replace(/\.mp3$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim();
}

/**
 * Formatiert eine Dateigröße in menschenlesbarer Form.
 *
 * @example
 * formatFileSize(1024)       // "1.0 KB"
 * formatFileSize(5242880)    // "5.0 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
