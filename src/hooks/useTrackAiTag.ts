/**
 * useTrackAiTag — Liest AI-Klassifikation des aktuellen Tracks.
 *
 * Mapping (Subagent A 02.05.2026 hat KEIN neues Schema-Feld erstellt, sondern
 * existierende Felder aiDisclosure + featuringArtistId genutzt):
 *   - aiDisclosure='ai_generated' → 'ai_only' (Boomy-only)
 *   - aiDisclosure='ai_assisted'  → 'ai_feature' (Flow x Boomy)
 *   - sonst                       → null (human-only oder kein Tag)
 *
 * Liest defensiv aus `track.aiDisclosure`. Fallback auf direktes `aiTag`-Field
 * falls in Zukunft ein dediziertes Enum nachgereicht wird.
 *
 * Voraussetzung: `aiDisclosure` muss in PlayerTrack-Mapping enthalten sein
 * (`useRadioSync.toPlayerTrack()` + `loadServerTracks()`). Falls nicht: Pill
 * rendert null. Der Hook bleibt unschaedlich.
 */

import { useMemo } from 'react';
import { usePlayer } from '@/components/providers/PlayerProvider';

export type AiTag = 'ai_only' | 'ai_feature';
type AiDisclosureRaw = 'human' | 'ai_assisted' | 'ai_generated' | string;

export interface UseTrackAiTagReturn {
  aiTag: AiTag | null;
  /** Anzeige-Label für das Pill (englisch, UI-Sprache KBK). */
  label: string | null;
}

export function useTrackAiTag(): UseTrackAiTagReturn {
  const { audio } = usePlayer();
  const track = audio.currentTrack;

  return useMemo(() => {
    const probe = track as
      | { aiTag?: AiTag; aiDisclosure?: AiDisclosureRaw }
      | null;

    let aiTag: AiTag | null = probe?.aiTag ?? null;
    if (!aiTag && probe?.aiDisclosure) {
      if (probe.aiDisclosure === 'ai_generated') aiTag = 'ai_only';
      else if (probe.aiDisclosure === 'ai_assisted') aiTag = 'ai_feature';
    }

    // v2.16: kurzes Label "AI" statt "AI ONLY" / "AI x HUMAN" — Flow-Wunsch,
    // weniger Platzbedarf in der Pill. Differenzierung bleibt im aria-label
    // erhalten (siehe MiniPlayer-Pill, dort wird aiTag auch für Tooltip genutzt).
    if (!aiTag) return { aiTag: null, label: null };
    return { aiTag, label: 'AI' };
  }, [track]);
}
