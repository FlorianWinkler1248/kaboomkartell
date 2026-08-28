/**
 * Tests für DELETE /api/admin/tracks/[id] — Hard-Delete eines Tracks.
 *
 * Prisma, der Admin-Gate und die Storage-Schicht werden per vi.mock ersetzt
 * (keine DB, kein Dateisystem). Geprüft wird, was an dieser Route eigen ist:
 * der ARCHIVED-Guard, das vollständige Abräumen der abhängigen Zeilen und
 * der ehrliche Umgang mit einer Datei, die nicht gelöscht werden konnte.
 *
 * Lauf: `pnpm test`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { DELETE } from '../route';

vi.mock('@/lib/db', () => ({
  default: {
    track: { findUnique: vi.fn(), delete: vi.fn(), count: vi.fn() },
    vote: { deleteMany: vi.fn() },
    playlistTrack: { deleteMany: vi.fn() },
    poolTrack: { deleteMany: vi.fn() },
    releaseSlot: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/admin-api', () => ({
  requireAdmin: vi.fn(),
  adminErrorResponse: vi.fn(() =>
    NextResponse.json({ success: false, error: 'Internal error.' }, { status: 500 })
  ),
}));

vi.mock('@/lib/storage', () => ({ deleteFile: vi.fn() }));

const ARCHIVED_TRACK = {
  id: 't1',
  title: 'Beat The Bell',
  status: 'ARCHIVED',
  filePath: 'tracks/beat-the-bell-123.mp3',
  coverUrl: '/api/uploads/covers/beat-the-bell.png',
};

function makeCall(id = 't1') {
  return DELETE({} as never, { params: Promise.resolve({ id }) });
}

/** Admin-Gate offen, Transaktion und Datei-Löschung gelingen. */
async function happyPath(track: Record<string, unknown> = ARCHIVED_TRACK) {
  const prisma = (await import('@/lib/db')).default;
  const { requireAdmin } = await import('@/lib/admin-api');
  vi.mocked(requireAdmin).mockResolvedValue({
    session: {} as never,
    error: null,
  });
  vi.mocked(prisma.track.findUnique).mockResolvedValue(track as never);
  vi.mocked(prisma.track.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
  return prisma;
}

describe('DELETE /api/admin/tracks/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gibt den 403 des Admin-Gates unverändert zurück', async () => {
    const { requireAdmin } = await import('@/lib/admin-api');
    const prisma = (await import('@/lib/db')).default;
    vi.mocked(requireAdmin).mockResolvedValue({
      session: null,
      error: NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 403 }),
    });

    const res = await makeCall();

    expect(res.status).toBe(403);
    // Kein Blick in die DB, bevor die Rolle geklärt ist.
    expect(prisma.track.findUnique).not.toHaveBeenCalled();
  });

  it('antwortet 404, wenn der Track nicht existiert', async () => {
    const prisma = await happyPath();
    vi.mocked(prisma.track.findUnique).mockResolvedValue(null as never);

    const res = await makeCall();

    expect(res.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('verweigert das Löschen eines nicht archivierten Tracks mit 409', async () => {
    const prisma = await happyPath({ ...ARCHIVED_TRACK, status: 'DRAFT' });
    const { deleteFile } = await import('@/lib/storage');

    const res = await makeCall();
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/archive it first/i);
    // Weder DB noch Platte werden angefasst.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('Golden Path: räumt abhängige Zeilen ab, löscht Track, MP3 und Cover', async () => {
    const prisma = await happyPath();
    const { deleteFile } = await import('@/lib/storage');

    const res = await makeCall();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.fileWarning).toBeUndefined();

    // Alle Restrict-Relationen müssen vor dem Track weg sein, sonst kippt
    // die Transaktion an einem Fremdschlüssel.
    expect(prisma.vote.deleteMany).toHaveBeenCalledWith({ where: { trackId: 't1' } });
    expect(prisma.playlistTrack.deleteMany).toHaveBeenCalledWith({ where: { trackId: 't1' } });
    expect(prisma.poolTrack.deleteMany).toHaveBeenCalledWith({ where: { trackId: 't1' } });
    expect(prisma.track.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    // Der Release-Slot wird wieder frei, statt auf eine Leerstelle zu zeigen.
    expect(prisma.releaseSlot.updateMany).toHaveBeenCalledWith({
      where: { trackId: 't1' },
      data: { trackId: null, status: 'OPEN' },
    });
    // Alles in EINER Transaktion.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(deleteFile).toHaveBeenCalledWith('tracks/beat-the-bell-123.mp3');
    expect(deleteFile).toHaveBeenCalledWith('covers/beat-the-bell.png');
    expect(body.filesDeleted).toEqual([
      'tracks/beat-the-bell-123.mp3',
      'covers/beat-the-bell.png',
    ]);
  });

  it('löscht die DB-Zeile erst, dann die Datei', async () => {
    const prisma = await happyPath();
    const { deleteFile } = await import('@/lib/storage');
    const order: string[] = [];
    vi.mocked(prisma.$transaction).mockImplementation((async () => {
      order.push('db');
      return [];
    }) as never);
    vi.mocked(deleteFile).mockImplementation((async () => {
      order.push('disk');
    }) as never);

    await makeCall();

    // Andersherum bliebe bei einem DB-Fehler ein Datensatz ohne Datei zurück.
    expect(order[0]).toBe('db');
    expect(order).toContain('disk');
  });

  it('behält ein fremdes Cover und ein Cover, das ein anderer Track nutzt', async () => {
    const prisma = await happyPath({
      ...ARCHIVED_TRACK,
      coverUrl: '/api/uploads/covers/geteilt.png',
    });
    const { deleteFile } = await import('@/lib/storage');
    vi.mocked(prisma.track.count).mockResolvedValue(1 as never);

    const res = await makeCall();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(deleteFile).not.toHaveBeenCalledWith('covers/geteilt.png');
    expect(body.filesDeleted).toEqual(['tracks/beat-the-bell-123.mp3']);
  });

  it('fasst eine externe Cover-URL nicht an', async () => {
    await happyPath({
      ...ARCHIVED_TRACK,
      coverUrl: 'https://i1.sndcdn.com/artwork.jpg',
    });
    const { deleteFile } = await import('@/lib/storage');

    await makeCall();

    expect(deleteFile).toHaveBeenCalledTimes(1);
    expect(deleteFile).toHaveBeenCalledWith('tracks/beat-the-bell-123.mp3');
  });

  it('kommt mit einem SoundCloud-Track ohne Datei klar', async () => {
    await happyPath({ ...ARCHIVED_TRACK, filePath: null, coverUrl: null });
    const { deleteFile } = await import('@/lib/storage');

    const res = await makeCall();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(deleteFile).not.toHaveBeenCalled();
    expect(body.filesDeleted).toEqual([]);
  });

  it('meldet eine liegengebliebene Datei als Warnung statt sie zu verschlucken', async () => {
    await happyPath({ ...ARCHIVED_TRACK, coverUrl: null });
    const { deleteFile } = await import('@/lib/storage');
    vi.mocked(deleteFile).mockRejectedValue(new Error('EACCES'));

    const res = await makeCall();
    const body = await res.json();

    // Der Datensatz IST weg — die Antwort darf trotzdem nicht "alles sauber" sagen.
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.filesDeleted).toEqual([]);
    expect(body.fileWarning).toEqual(['tracks/beat-the-bell-123.mp3']);
  });
});
