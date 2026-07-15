/**
 * useChannelAccent — Akzent-Farbe + Anzeige-Label für den aktuell laufenden
 * Sender. Berücksichtigt Subgenre-Override (z.B. Hardtek-Slot, der ein
 * Raggatek-Set spielt, soll als RAGGATEK SET gelabelt + eingefaerbt sein).
 *
 * Special-Event-Theme-System (v2.26, 07.05.2026):
 *   - "raggatek": Hardtek-Channel läuft als Raggatek-Set → Tab grün, EQ gelb
 *   - "brazilian-phonk": Phonk-Channel läuft als Brazilian-Phonk-Set → Tab
 *     grün, EQ rot (Kontrast zum grünen Akzent, fängt die Phonk-Energie)
 *   - kein Subgenre-Override → reguläre Channel-Akzentfarbe + grüner EQ
 *
 * Datenquelle: `radioSlot.subgenre` (befüllt vom Backend aus
 * TimetableSlot.subgenre / TimetableEvent.subgenre). Heuristik-Fallback via
 * Label-Match (`raggatek`, `brazilian phonk`) bleibt für abwaertskompatible
 * Slots ohne explizites Schema-Feld.
 */

import { useMemo } from 'react';
import { usePlayer } from '@/components/providers/PlayerProvider';

export const CHANNEL_COLORS = {
  phonk: '#E63B2E', // Blood-Red
  hardtek: '#F5D02E', // Piss-Yellow
  raggatek: '#3FCF4A', // Venom-Green (Flow-Final-Call 02.05.2026)
  live: '#9146FF', // Twitch-Magenta (Live-Event-Channel, ADR-028)
} as const;

export const CHANNEL_LABELS = {
  phonk: 'PHONK',
  hardtek: 'HARDTEK',
  raggatek: 'RAGGATEK',
  live: 'LIVE',
} as const;

export type ChannelKind = keyof typeof CHANNEL_COLORS;

/** Bekannte Subgenre-Werte. Schema-Feld ist String, hier zentralisiert. */
export type SubgenreKind = 'raggatek' | 'brazilian-phonk';

export interface ChannelAccent {
  /** Logischer Channel (was der User in den Tabs gewählt hat). */
  channel: ChannelKind;
  /** Effektives Subgenre — kann vom Channel abweichen (Hardtek-Slot mit Raggatek-Set). */
  effectiveKind: ChannelKind;
  /** Label, das im Player gross angezeigt wird (z.B. "RAGGATEK SET"). */
  label: string;
  /** CSS-Hex der Akzentfarbe für Tab + Label (effektive Channel-Farbe). */
  color: string;
  /** Bar-Farbe für den Equalizer.
   *  Default = Venom-Green. Bei Raggatek-Override = Yellow, bei
   *  Brazilian-Phonk-Override = Blood-Red (Kontrast zum grünen Akzent). */
  equalizerColor: string;
  /** Wahr, wenn ein Subgenre-Override aktiv ist (UI kann das nutzen, z.B. für Pulse). */
  isSubgenreOverride: boolean;
  /** Konkretes Subgenre, falls Override aktiv — für Audit / Animations-Hooks. */
  subgenre: SubgenreKind | null;
}

const EQ_DEFAULT_GREEN = '#3FCF4A';
const EQ_RAGGATEK_YELLOW = '#F5D02E';
const EQ_BRAZILIAN_PHONK_RED = '#E63B2E';

/** Heuristik: Erkennt Raggatek-Sets im Hardtek-Channel via Slot-Label (Fallback). */
function detectRaggatekFromLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return /raggatek/i.test(label);
}

/** Heuristik: Erkennt Brazilian-Phonk-Sets im Phonk-Channel via Slot-Label (Fallback). */
function detectBrazilianPhonkFromLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return /brazilian[\s-]?phonk/i.test(label);
}

export function useChannelAccent(): ChannelAccent {
  const { selectedChannel, radioSlot } = usePlayer();

  return useMemo(() => {
    const channel = (selectedChannel as ChannelKind) || 'phonk';
    const baseColor = CHANNEL_COLORS[channel] ?? CHANNEL_COLORS.phonk;
    const baseLabel = CHANNEL_LABELS[channel] ?? 'PHONK';

    // LIVE-Channel (ADR-028): Twitch/YouTube-Stream — eigenes Magenta-Theme,
    // kein Subgenre, Equalizer in Channel-Farbe.
    if (channel === 'live') {
      return {
        channel,
        effectiveKind: 'live',
        label: 'LIVE',
        color: CHANNEL_COLORS.live,
        equalizerColor: CHANNEL_COLORS.live,
        isSubgenreOverride: false,
        subgenre: null,
      };
    }

    // Subgenre aus Schema-Feld (now-playing-Route serialisiert es).
    const slotWithSubgenre = radioSlot as
      | (typeof radioSlot & { subgenre?: string | null })
      | null;
    const subgenreFromSchema = slotWithSubgenre?.subgenre ?? null;

    // Hardtek + Raggatek → Channel grün, EQ gelb
    if (channel === 'hardtek') {
      const isRaggatek =
        subgenreFromSchema === 'raggatek' ||
        detectRaggatekFromLabel(radioSlot?.label);
      if (isRaggatek) {
        return {
          channel,
          effectiveKind: 'raggatek',
          label: 'RAGGATEK SET',
          color: CHANNEL_COLORS.raggatek,
          equalizerColor: EQ_RAGGATEK_YELLOW,
          isSubgenreOverride: true,
          subgenre: 'raggatek',
        };
      }
    }

    // Phonk + Brazilian-Phonk → Channel grün, EQ rot
    if (channel === 'phonk') {
      const isBrazilianPhonk =
        subgenreFromSchema === 'brazilian-phonk' ||
        detectBrazilianPhonkFromLabel(radioSlot?.label);
      if (isBrazilianPhonk) {
        return {
          channel,
          effectiveKind: 'raggatek', // grüne Akzentfarbe wie Raggatek
          label: 'BRAZILIAN PHONK SET',
          color: CHANNEL_COLORS.raggatek,
          equalizerColor: EQ_BRAZILIAN_PHONK_RED,
          isSubgenreOverride: true,
          subgenre: 'brazilian-phonk',
        };
      }
    }

    return {
      channel,
      effectiveKind: channel,
      label: baseLabel,
      color: baseColor,
      equalizerColor: EQ_DEFAULT_GREEN,
      isSubgenreOverride: false,
      subgenre: null,
    };
  }, [selectedChannel, radioSlot]);
}
