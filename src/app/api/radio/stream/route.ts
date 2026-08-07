/**
 * Dauerstream-Endpunkt — GET /api/radio/stream?channel=phonk
 *
 * Liefert eine ENDLOSE `audio/mpeg`-Antwort: der Sender
 * (`@/lib/radio-broadcaster`) schiebt die Titel des Channels nacheinander
 * hinein. Der Browser hängt sie nicht selbst aneinander und sieht deshalb nie
 * ein Track-Ende — genau das macht die Wiedergabe auf einem gesperrten Handy
 * überhaupt erst durchgehend möglich.
 *
 * Bewusst ohne Range-Unterstützung: Ein Live-Radio hat keine Position, zu der
 * man springen könnte. Wer einsteigt, hört, was gerade läuft.
 */

import { NextRequest } from 'next/server'
import { getBroadcaster, type BroadcastListener } from '@/lib/radio-broadcaster'
import { RADIO_CHANNELS, type RadioChannel } from '@/lib/radio'

// Node-Runtime (Dateisystem + Prisma) und niemals statisch vorgerendert.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseChannel(raw: string | null): RadioChannel | null {
  if (!raw) return null
  const lower = raw.toLowerCase() as RadioChannel
  return (RADIO_CHANNELS as readonly string[]).includes(lower) ? lower : null
}

export async function GET(request: NextRequest) {
  const channel = parseChannel(request.nextUrl.searchParams.get('channel'))
  if (!channel) {
    return new Response('Unknown channel.', { status: 400 })
  }

  const broadcaster = getBroadcaster(channel)
  let listener: BroadcastListener | null = null
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      listener = {
        push: (chunk) => {
          // Nach dem Schließen darf nichts mehr eingereiht werden — sonst wirft
          // der Controller, und der Sender würde den Hörer für tot erklären,
          // obwohl nur diese eine Nachricht zu spät kam.
          if (closed) return
          controller.enqueue(chunk)
        },
      }
      broadcaster.add(listener)
    },
    cancel() {
      closed = true
      if (listener) broadcaster.remove(listener)
    },
  })

  // Bricht der Hörer ab (Tab zu, Netz weg), meldet das der Abort-Signal-Pfad —
  // `cancel` allein greift nicht in jeder Laufzeit zuverlässig.
  request.signal.addEventListener('abort', () => {
    closed = true
    if (listener) broadcaster.remove(listener)
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'audio/mpeg',
      // Kein Caching, keine Transformation: Zwischenspeicher würden einen
      // endlosen Strom entweder puffern (Verzögerung) oder abschneiden.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      // Nginx-Konvention gegen Antwort-Pufferung; für Caddy unschädlich.
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive',
    },
  })
}
