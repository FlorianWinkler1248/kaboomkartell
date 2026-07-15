/**
 * Track Streaming API Route
 *
 * GET /api/tracks/[id]/stream - MP3-Datei streamen
 *
 * Unterstützt HTTP Range-Requests (RFC 7233) für:
 * - Seeking im Audio-Player (essentiell!)
 * - Progressive Loading
 * - Resume nach Unterbrechung
 *
 * Responses:
 * - 200 OK: Komplette Datei (kein Range-Header)
 * - 206 Partial Content: Teilbereich (mit Range-Header)
 * - 416 Range Not Satisfiable: Ungültiger Range
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import prisma from '@/lib/db';
import { getAbsolutePath, fileExists } from '@/lib/storage';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Track in der DB suchen
    const track = await prisma.track.findUnique({
      where: { id },
      select: {
        id: true,
        trackType: true,
        filePath: true,
        fileSize: true,
        fileName: true,
        status: true,
      },
    });

    if (!track) {
      return new NextResponse('Track not found.', { status: 404 });
    }

    // SoundCloud-Tracks haben keinen lokalen Stream
    if (track.trackType === 'SOUNDCLOUD' || !track.filePath) {
      return new NextResponse('SoundCloud tracks do not have a local stream.', { status: 400 });
    }

    // Nur publizierte Tracks (oder wenn kein Auth-Check nötig)
    // Admin-Zugriff wird hier bewusst nicht geprüft für Preview im Admin
    if (track.status === 'ARCHIVED') {
      return new NextResponse('Track not available.', { status: 404 });
    }

    // Datei prüfen
    if (!fileExists(track.filePath)) {
      console.error(`File not found: ${track.filePath}`);
      return new NextResponse('File not found.', { status: 404 });
    }

    const absolutePath = getAbsolutePath(track.filePath);
    const stat = fs.statSync(absolutePath);
    const fileSize = stat.size;

    // === Range-Request verarbeiten ===
    const rangeHeader = request.headers.get('range');

    if (rangeHeader) {
      // Range-Header parsen: "bytes=START-END"
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);

      if (!match) {
        // Ungültiger Range-Header
        return new NextResponse('Range Not Satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

      // Validierung
      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse('Range Not Satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;

      // ReadStream für den angefragten Bereich
      const stream = fs.createReadStream(absolutePath, { start, end });
      const readableStream = nodeStreamToWeb(stream);

      // 206 Partial Content Response
      return new NextResponse(readableStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400', // 1 Tag Cache
          'Content-Disposition': `inline; filename="${encodeURIComponent(track.fileName || 'track.mp3')}"`,
        },
      });
    }

    // === Kein Range-Header -> Komplette Datei ===

    const stream = fs.createReadStream(absolutePath);
    const readableStream = nodeStreamToWeb(stream);

    return new NextResponse(readableStream, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(fileSize),
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
        'Content-Disposition': `inline; filename="${encodeURIComponent(track.fileName || 'track.mp3')}"`,
      },
    });
  } catch (error) {
    console.error('Streaming error:', error);
    return new NextResponse('Internal streaming error.', { status: 500 });
  }
}

/**
 * Konvertiert einen Node.js ReadStream in einen Web ReadableStream.
 * Nötig weil Next.js Response Web Streams erwartet.
 */
function nodeStreamToWeb(nodeStream: fs.ReadStream): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: string | Buffer) => {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(buf));
      });

      nodeStream.on('end', () => {
        controller.close();
      });

      nodeStream.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}
