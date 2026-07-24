/**
 * Tests: Aura+-als-Like-Ökosystem (ADR-041, Welle 2)
 *
 * - Session-Likes: Toggle-/Cap-/Bump-Logik (pure, lib/session-likes.ts)
 * - Import-Partition: LOCAL-60s-Regel, SC-Ausnahme, Dedupe (lib/my-playlist.ts)
 * - Vote-Schemas: SC-Ausnahme lockert nur die Hörzeit, nichts sonst
 */

import { describe, it, expect } from 'vitest';
import {
  toggleInList,
  capList,
  bumpListenedInList,
  SESSION_LIKES_CAP,
  type SessionLike,
} from '@/lib/session-likes';
import { partitionImportLikes } from '@/lib/my-playlist';
import { createVoteSchema, createScVoteSchema, importLikesSchema } from '@/lib/validations';

function makeLike(trackId: string, overrides: Partial<SessionLike> = {}): SessionLike {
  return {
    trackId,
    likedAt: '2026-07-24T12:00:00.000Z',
    listenedSeconds: 0,
    title: `Track ${trackId}`,
    slug: `track-${trackId}`,
    trackType: 'LOCAL',
    duration: 180,
    coverUrl: null,
    genre: 'Phonk',
    artistLabel: 'Test Artist',
    soundcloudUrl: null,
    soundcloudEmbedUrl: null,
    ...overrides,
  };
}

describe('Session-Likes (pure Logik)', () => {
  it('toggleInList fügt neuen Like vorne an', () => {
    const result = toggleInList([makeLike('a')], makeLike('b'));
    expect(result.liked).toBe(true);
    expect(result.likes.map((l) => l.trackId)).toEqual(['b', 'a']);
  });

  it('toggleInList entfernt vorhandenen Like', () => {
    const result = toggleInList([makeLike('a'), makeLike('b')], makeLike('a'));
    expect(result.liked).toBe(false);
    expect(result.likes.map((l) => l.trackId)).toEqual(['b']);
  });

  it('capList wirft die ältesten (hinteren) Einträge raus', () => {
    const many = Array.from({ length: SESSION_LIKES_CAP + 5 }, (_, i) => makeLike(`t${i}`));
    const capped = capList(many);
    expect(capped).toHaveLength(SESSION_LIKES_CAP);
    expect(capped[0].trackId).toBe('t0');
    expect(capped.at(-1)?.trackId).toBe(`t${SESSION_LIKES_CAP - 1}`);
  });

  it('bumpListenedInList erhöht nur nach oben', () => {
    const likes = [makeLike('a', { listenedSeconds: 70 })];
    expect(bumpListenedInList(likes, 'a', 90)[0].listenedSeconds).toBe(90);
    expect(bumpListenedInList(likes, 'a', 30)[0].listenedSeconds).toBe(70);
    // unbekannte trackId: unverändert
    expect(bumpListenedInList(likes, 'x', 90)).toEqual(likes);
  });
});

describe('Import-Partition (Kein-Blenden-Regel)', () => {
  const tracks = [
    { id: 'local-ok', trackType: 'LOCAL', isPublic: true },
    { id: 'local-short', trackType: 'LOCAL', isPublic: true },
    { id: 'sc', trackType: 'SOUNDCLOUD', isPublic: true },
    { id: 'hidden', trackType: 'LOCAL', isPublic: false },
  ];

  it('LOCAL braucht >= 60s, SOUNDCLOUD nicht', () => {
    const { importable, skipped } = partitionImportLikes(tracks, [
      { trackId: 'local-ok', listenedSeconds: 75 },
      { trackId: 'local-short', listenedSeconds: 30 },
      { trackId: 'sc', listenedSeconds: 0 },
    ]);
    expect(importable.map((l) => l.trackId)).toEqual(['local-ok', 'sc']);
    expect(skipped).toBe(1);
  });

  it('unbekannte + nicht-öffentliche Tracks werden übersprungen', () => {
    const { importable, skipped } = partitionImportLikes(tracks, [
      { trackId: 'ghost', listenedSeconds: 120 },
      { trackId: 'hidden', listenedSeconds: 120 },
    ]);
    expect(importable).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it('Duplikate: erster Eintrag gewinnt', () => {
    const { importable, skipped } = partitionImportLikes(tracks, [
      { trackId: 'sc', listenedSeconds: 0 },
      { trackId: 'sc', listenedSeconds: 0 },
    ]);
    expect(importable).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});

describe('Vote-Schemas (SC-Ausnahme)', () => {
  it('createVoteSchema lehnt < 60s ab (LOCAL-Regel unverändert)', () => {
    expect(
      createVoteSchema.safeParse({ aura: true, sus: false, listenedSeconds: 30 }).success
    ).toBe(false);
    expect(
      createVoteSchema.safeParse({ aura: true, sus: false, listenedSeconds: 60 }).success
    ).toBe(true);
  });

  it('createScVoteSchema erlaubt 0s, aber keine negativen Werte', () => {
    expect(
      createScVoteSchema.safeParse({ aura: true, sus: false, listenedSeconds: 0 }).success
    ).toBe(true);
    expect(
      createScVoteSchema.safeParse({ aura: true, sus: false, listenedSeconds: -1 }).success
    ).toBe(false);
  });

  it('importLikesSchema begrenzt auf 1..100 Einträge', () => {
    expect(importLikesSchema.safeParse({ likes: [] }).success).toBe(false);
    const tooMany = Array.from({ length: 101 }, (_, i) => ({
      trackId: `cktrack${i}0000000000`,
      listenedSeconds: 0,
    }));
    expect(importLikesSchema.safeParse({ likes: tooMany }).success).toBe(false);
    expect(
      importLikesSchema.safeParse({
        likes: [{ trackId: 'cktrack00000000000', listenedSeconds: 61 }],
      }).success
    ).toBe(true);
  });
});
