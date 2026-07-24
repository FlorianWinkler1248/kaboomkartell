'use client';

/**
 * AuraLikeButton — die eine Like-Geste außerhalb des MiniPlayers (ADR-041).
 *
 * Aura+ ist gleichzeitig öffentliches Lob UND persönlicher Save: der Button
 * togglet den Like über den LikesProvider (anon → Session-Like + Nudge,
 * eingeloggt → Vote-Route). Optimistic-UI übernimmt der Provider.
 *
 * Einsatzorte: Playlist-Detail-Zeilen, Showcase-Karten, Track-Detail,
 * My-Playlist-Zeilen (dort als Unlike).
 */

import { useTranslations } from 'next-intl';
import { useMyPlaylist, type LikeInput } from '@/components/providers/LikesProvider';
import { IcoAura } from '@/components/kbk/icons';

interface AuraLikeButtonProps {
  track: LikeInput;
  /** sm = kompakte Zeile (32px Optik, 44px Touch), md = Karten/Detail. */
  size?: 'sm' | 'md';
}

export default function AuraLikeButton({ track, size = 'sm' }: AuraLikeButtonProps) {
  const t = useTranslations('player');
  const likes = useMyPlaylist();
  const liked = likes.likedIds.has(track.id);
  const box = size === 'md' ? 44 : 36;

  return (
    <button
      type="button"
      onClick={(e) => {
        // Like-Klick darf umliegende Row-/Card-Handler nicht auslösen.
        e.preventDefault();
        e.stopPropagation();
        likes.toggleLike(track);
      }}
      aria-pressed={liked}
      aria-label={t('vote.markAura')}
      title={
        likes.isAnon
          ? t('vote.auraAnonTitle')
          : liked
            ? t('vote.auraTitle')
            : t('vote.auraTitle')
      }
      style={{
        flexShrink: 0,
        width: box,
        height: box,
        minWidth: 36,
        minHeight: 36,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: liked ? '#3FCF4A' : 'rgba(10,11,12,0.6)',
        border: `1px solid ${liked ? '#3FCF4A' : 'rgba(63,207,74,0.45)'}`,
        color: liked ? '#0A0B0C' : '#3FCF4A',
        cursor: 'pointer',
        transition: 'all 0.15s',
        padding: 0,
      }}
    >
      <IcoAura size={size === 'md' ? 18 : 15} />
    </button>
  );
}
