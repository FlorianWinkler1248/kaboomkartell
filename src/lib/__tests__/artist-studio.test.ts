/**
 * Tests: Artist-Studio-Kernlogik (ADR-041, Welle 3)
 *
 * - Claim: Token-Erzeugung/Hash + pure Zustands-Checks
 * - Submission: Übergangs-Matrix + Artist-Editierbarkeit
 * - accentForTrack: die 4 Cover-Akzent-Fälle (durch Refactor erstmals testbar)
 * - Studio-Schemas: Review-Bypass unmöglich (kein isPublic), ISRC-Format,
 *   filePath-Whitelist
 */

import { describe, it, expect } from 'vitest';
import { generateClaimToken, hashClaimToken, checkClaimState } from '@/lib/artist-claim';
import {
  reviewTransition,
  isEditableByArtist,
  SUBMISSION_STATUS,
} from '@/lib/submission';
import { accentForTrack } from '@/lib/cover-generator';
import { BOOMY_PURPLE, GENRE_ACCENT } from '@/lib/constants';
import { createStudioTrackSchema, updateStudioTrackSchema } from '@/lib/validations';

describe('Artist-Claim (pure Logik)', () => {
  it('generateClaimToken liefert Prefix + konsistenten SHA-256-Hash', () => {
    const { token, tokenHash } = generateClaimToken();
    expect(token.startsWith('kbk_claim_')).toBe(true);
    expect(tokenHash).toBe(hashClaimToken(token));
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
    // Jeder Token ist einzigartig
    expect(generateClaimToken().token).not.toBe(token);
  });

  it('checkClaimState: ok / expired / already_claimed', () => {
    const now = new Date('2026-07-24T12:00:00Z');
    const future = new Date('2026-08-01T00:00:00Z');
    const past = new Date('2026-07-01T00:00:00Z');
    expect(checkClaimState({ userId: null, claimTokenExpiry: future }, now)).toBe('ok');
    expect(checkClaimState({ userId: null, claimTokenExpiry: null }, now)).toBe('ok');
    expect(checkClaimState({ userId: null, claimTokenExpiry: past }, now)).toBe('expired');
    expect(checkClaimState({ userId: 'u1', claimTokenExpiry: future }, now)).toBe(
      'already_claimed'
    );
    // already_claimed schlägt expired (Profil ist vergeben, egal was der Token sagt)
    expect(checkClaimState({ userId: 'u1', claimTokenExpiry: past }, now)).toBe(
      'already_claimed'
    );
  });
});

describe('Submission-Lifecycle (Übergangs-Matrix)', () => {
  it('PENDING erlaubt alle drei Review-Aktionen', () => {
    expect(reviewTransition('PENDING', 'APPROVE')).toBe('APPROVED');
    expect(reviewTransition('PENDING', 'REJECT')).toBe('REJECTED');
    expect(reviewTransition('PENDING', 'REQUEST_CHANGES')).toBe('CHANGES_REQUESTED');
  });

  it('CHANGES_REQUESTED erlaubt APPROVE/REJECT, aber kein erneutes REQUEST_CHANGES', () => {
    expect(reviewTransition('CHANGES_REQUESTED', 'APPROVE')).toBe('APPROVED');
    expect(reviewTransition('CHANGES_REQUESTED', 'REJECT')).toBe('REJECTED');
    expect(reviewTransition('CHANGES_REQUESTED', 'REQUEST_CHANGES')).toBeNull();
  });

  it('APPROVED/REJECTED sind terminal', () => {
    for (const status of ['APPROVED', 'REJECTED'] as const) {
      expect(reviewTransition(status, 'APPROVE')).toBeNull();
      expect(reviewTransition(status, 'REJECT')).toBeNull();
      expect(reviewTransition(status, 'REQUEST_CHANGES')).toBeNull();
    }
  });

  it('unbekannter Status ist nie überführbar', () => {
    expect(reviewTransition('GARBAGE', 'APPROVE')).toBeNull();
  });

  it('isEditableByArtist nur bei PENDING/CHANGES_REQUESTED', () => {
    expect(isEditableByArtist(SUBMISSION_STATUS.PENDING)).toBe(true);
    expect(isEditableByArtist(SUBMISSION_STATUS.CHANGES_REQUESTED)).toBe(true);
    expect(isEditableByArtist(SUBMISSION_STATUS.APPROVED)).toBe(false);
    expect(isEditableByArtist(SUBMISSION_STATUS.REJECTED)).toBe(false);
  });
});

describe('accentForTrack (Cover-Akzente)', () => {
  it('ai_generated → reines Boomy-Lila', () => {
    expect(accentForTrack({ genre: 'Phonk', aiDisclosure: 'ai_generated' })).toEqual({
      accent: BOOMY_PURPLE,
    });
  });

  it('ai_assisted → Genre + Lila (Dual-Accent)', () => {
    expect(accentForTrack({ genre: 'Phonk', aiDisclosure: 'ai_assisted' })).toEqual({
      accent: GENRE_ACCENT.Phonk,
      accent2: BOOMY_PURPLE,
    });
  });

  it('ai_assisted + Brazilian Phonk → Tri-Accent (Grün + Rot + Lila)', () => {
    expect(
      accentForTrack({ genre: 'Brazilian Phonk', aiDisclosure: 'ai_assisted' })
    ).toEqual({
      accent: GENRE_ACCENT['Brazilian Phonk'],
      accent2: GENRE_ACCENT.Phonk,
      accent3: BOOMY_PURPLE,
    });
  });

  it('human → nur Genre-Farbe; unbekanntes Genre → Grün-Fallback', () => {
    expect(accentForTrack({ genre: 'Hardtek', aiDisclosure: 'human' })).toEqual({
      accent: GENRE_ACCENT.Hardtek,
    });
    expect(accentForTrack({ genre: 'Dubstep', aiDisclosure: null })).toEqual({
      accent: '#3FCF4A',
    });
  });
});

describe('Studio-Schemas (Review-Bypass unmöglich)', () => {
  const validTrack = {
    title: 'Test Track',
    genre: 'Phonk',
    aiDisclosure: 'human' as const,
    fileName: 'test.mp3',
    filePath: 'tracks/test-abc.mp3',
    fileSize: 1024,
  };

  it('createStudioTrackSchema akzeptiert einen validen Track', () => {
    expect(createStudioTrackSchema.safeParse(validTrack).success).toBe(true);
  });

  it('isPublic/status im Payload werden ignoriert (nicht im Schema)', () => {
    const parsed = createStudioTrackSchema.safeParse({
      ...validTrack,
      isPublic: true,
      status: 'PUBLISHED',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('isPublic' in parsed.data).toBe(false);
      expect('status' in parsed.data).toBe(false);
    }
    const upd = updateStudioTrackSchema.safeParse({ isPublic: true });
    expect(upd.success).toBe(true);
    if (upd.success) expect('isPublic' in upd.data).toBe(false);
  });

  it('filePath-Whitelist: nur tracks/-Pfade aus dem Upload-System', () => {
    expect(
      createStudioTrackSchema.safeParse({ ...validTrack, filePath: '../../etc/passwd' })
        .success
    ).toBe(false);
    expect(
      createStudioTrackSchema.safeParse({ ...validTrack, filePath: 'covers/x.png' }).success
    ).toBe(false);
    expect(
      createStudioTrackSchema.safeParse({ ...validTrack, filePath: 'tracks/ok-1a2b.mp3' })
        .success
    ).toBe(true);
  });

  it('ISRC: valides Format oder leer', () => {
    expect(
      createStudioTrackSchema.safeParse({ ...validTrack, isrc: 'DEABC2612345' }).success
    ).toBe(true);
    expect(createStudioTrackSchema.safeParse({ ...validTrack, isrc: '' }).success).toBe(true);
    expect(
      createStudioTrackSchema.safeParse({ ...validTrack, isrc: 'not-an-isrc' }).success
    ).toBe(false);
  });

  it('aiDisclosure ist Pflicht', () => {
    const { aiDisclosure: _omit, ...withoutAi } = validTrack;
    expect(createStudioTrackSchema.safeParse(withoutAi).success).toBe(false);
  });
});
