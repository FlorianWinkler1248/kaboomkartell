/**
 * Upload API Route
 *
 * POST /api/upload - Datei hochladen (nur Admin)
 *
 * Akzeptiert:
 * - MP3-Dateien (audio/mpeg) -> gespeichert in uploads/tracks/
 * - Bilder (image/jpeg, image/png, image/webp) -> gespeichert in uploads/covers/
 *
 * Returns: Datei-Informationen (fileName, filePath, fileSize)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { saveFile } from '@/lib/storage';
import { APP_CONFIG } from '@/lib/constants';
import { slugify } from '@/lib/utils';
import { applyRateLimit, uploadLimit } from '@/lib/rate-limit';
import { detectImageMime, looksLikeMp3 } from '@/lib/mime-detect';

export async function POST(request: NextRequest) {
  // Rate-Limit zuerst (Defense-in-Depth, vor dem teuren Multipart-Parsing).
  const limited = applyRateLimit(request, uploadLimit, 'upload', 30);
  if (limited) return limited;

  try {
    // Auth-Check
    const session = await auth();
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Not authorized.' },
        { status: 403 }
      );
    }

    // FormData parsen
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file found.' },
        { status: 400 }
      );
    }

    // Dateigröße prüfen
    if (file.size > APP_CONFIG.maxFileSize) {
      return NextResponse.json(
        { success: false, error: `File too large. Maximum: ${APP_CONFIG.maxFileSize / 1024 / 1024} MB.` },
        { status: 400 }
      );
    }

    // Dateityp bestimmen und Unterverzeichnis wählen
    const isAudio = (APP_CONFIG.allowedAudioTypes as readonly string[]).includes(file.type) ||
      file.name.toLowerCase().endsWith('.mp3');
    const isImage = (APP_CONFIG.allowedImageTypes as readonly string[]).includes(file.type);

    if (!isAudio && !isImage) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unsupported file type. Allowed: MP3, JPEG, PNG, WebP.',
        },
        { status: 400 }
      );
    }

    const subDir = isAudio ? 'tracks' : 'covers';

    // Eindeutigen Dateinamen generieren
    const ext = file.name.split('.').pop()?.toLowerCase() || (isAudio ? 'mp3' : 'jpg');
    const baseName = slugify(file.name.replace(/\.[^/.]+$/, ''));
    const uniqueFileName = `${baseName}-${Date.now().toString(36)}.${ext}`;

    // Datei in Buffer lesen
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Magic-Bytes-Gate (Defense-in-Depth): deklarierter MIME/Dateiname ist
    // client-kontrolliert — der Inhalt muss zum Ziel-Verzeichnis passen.
    const contentOk = isAudio ? looksLikeMp3(buffer) : detectImageMime(buffer) !== null;
    if (!contentOk) {
      return NextResponse.json(
        { success: false, error: 'File content does not match its declared type.' },
        { status: 400 }
      );
    }

    // Datei speichern
    const relativePath = await saveFile(buffer, subDir, uniqueFileName);

    return NextResponse.json({
      success: true,
      message: 'File uploaded.',
      data: {
        fileName: file.name,
        filePath: relativePath,
        fileSize: file.size,
        mimeType: file.type,
        subDir,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Error uploading file.' },
      { status: 500 }
    );
  }
}
