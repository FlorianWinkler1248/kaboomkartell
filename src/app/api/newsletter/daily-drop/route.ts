/**
 * Daily-Drop-Broadcast (P1.2 / ADR-035) — EINE Digest-Mail + Discord-Post über die
 * neuen Tracks seit dem letzten Lauf. Macht den toten `newsletterOptIn` scharf und
 * erreicht Menschen OHNE proaktiven Agenten (Treiber 3).
 *
 * POST /api/newsletter/daily-drop   Header: Authorization: <Boomy-Secret>
 *   Body: { "dryRun": false }  → echter Versand (siehe Gates unten). Default = DRY-RUN.
 *
 * Zwei Gates fürs echte Senden (G2-Disziplin):
 *   1. Body `dryRun: false`  UND
 *   2. Env `NEWSLETTER_BROADCAST_ENABLED === 'true'` (Kill-Switch, Default aus).
 * Fehlt eins → DRY-RUN: es wird nur gezählt/geloggt, KEINE Mail raus, das
 * "letzter Lauf"-Fenster wird NICHT fortgeschrieben (dry-runs sind wiederholbar).
 *
 * Nie leere „Aktivitäts-Simulation": 0 neue Tracks → kein Versand (Kein-Blenden-Regel).
 * State „letzter Lauf" als JSON unter dem persistenten uploads-Storage (kein Schema-Change).
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import prisma from '@/lib/db';
import { validateBoomySecret, BOOMY_PURPLE } from '@/lib/constants';
import { applyRateLimit, boomyLimit } from '@/lib/rate-limit';
import { sendMail, buildDailyDropEmail } from '@/lib/mailer';
import { unsubscribeUrl } from '@/lib/newsletter';
import { postToDiscord, hexToDiscordColor } from '@/lib/discord-webhook';

const STATE_FILE = path.join(process.cwd(), 'uploads', '_metrics', 'daily-drop-state.json');

function readLastRun(): Date | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const t = raw?.lastRunAt ? new Date(raw.lastRunAt) : null;
    return t && !Number.isNaN(t.getTime()) ? t : null;
  } catch {
    return null;
  }
}

function writeLastRun(now: Date): void {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ lastRunAt: now.toISOString() }, null, 2));
  } catch (err) {
    console.error('[daily-drop] state write failed:', err);
  }
}

function siteBase(): string {
  return (process.env.NEXTAUTH_URL ?? 'https://kaboomkartell.com').replace(/\/$/, '');
}

export async function POST(request: NextRequest) {
  if (!validateBoomySecret(request.headers.get('Authorization'))) {
    return NextResponse.json({ success: false, error: 'Not authorized.' }, { status: 403 });
  }
  const limited = applyRateLimit(request, boomyLimit, 'daily-drop', 10);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
  // Default DRY-RUN: echt gesendet wird NUR bei explizit dryRun:false.
  const dryRun = body?.dryRun !== false;
  const now = new Date();
  const lastRun = readLastRun();

  // Neue Tracks seit dem letzten Lauf (bzw. seit jeher beim ersten Lauf).
  const newTracks = await prisma.track.findMany({
    where: {
      isPublic: true,
      publishedAt: lastRun ? { gt: lastRun } : { not: null },
    },
    orderBy: { publishedAt: 'asc' },
    select: {
      title: true,
      slug: true,
      artist: { select: { username: true, displayName: true } },
      featuringArtist: { select: { username: true, displayName: true } },
    },
  });

  if (newTracks.length === 0) {
    // Nie leere „Aktivitäts-Simulation" (Kein-Blenden-Regel).
    return NextResponse.json({ success: true, sent: false, reason: 'no new drops', newTrackCount: 0 });
  }

  const tracks = newTracks.map((t) => {
    const main = t.artist?.displayName || t.artist?.username || 'KBK';
    const feat = t.featuringArtist?.displayName || t.featuringArtist?.username;
    return { title: t.title, slug: t.slug, artist: feat ? `${main} feat. ${feat}` : main };
  });

  // Empfänger: opt-in UND verifizierte Adresse (keine Mails an unbestätigte Adressen).
  const recipients = await prisma.user.findMany({
    where: { newsletterOptIn: true, emailVerified: { not: null } },
    select: { id: true, email: true },
  });

  const base = siteBase();
  const broadcastEnabled = process.env.NEWSLETTER_BROADCAST_ENABLED === 'true';
  const willReallySend = !dryRun && broadcastEnabled;

  const discordEmbed = {
    title: tracks.length === 1 ? `New drop: ${tracks[0].title}` : `${tracks.length} fresh drops`,
    description: tracks.map((t) => `• **${t.title}** — ${t.artist}`).join('\n'),
    url: `${base}/?ref=drop`,
    color: hexToDiscordColor(BOOMY_PURPLE),
    timestamp: now.toISOString(),
  };

  let mailsSent = 0;
  let mailsFailed = 0;
  let discordOk = false;

  if (willReallySend) {
    for (const r of recipients) {
      try {
        const email = buildDailyDropEmail(tracks, unsubscribeUrl(base, r.id), base);
        await sendMail({ to: r.email, subject: email.subject, text: email.text, html: email.html });
        mailsSent++;
      } catch (err) {
        mailsFailed++;
        console.error('[daily-drop] mail failed for', r.id, err);
      }
    }
    discordOk = await postToDiscord({ embeds: [discordEmbed] });
    writeLastRun(now); // Fenster nur bei echtem Versand fortschreiben.
  } else {
    // DRY-RUN: NICHTS raus — weder Mail noch Discord (postToDiscord würde bei
    // konfiguriertem Webhook real posten). Nur loggen, Fenster bleibt offen.
    void discordEmbed;
    console.info(
      `[daily-drop] DRY-RUN — ${tracks.length} neue Tracks, ${recipients.length} Empfänger, kein Versand.` +
        (!broadcastEnabled ? ' (NEWSLETTER_BROADCAST_ENABLED != true)' : ''),
    );
  }

  return NextResponse.json({
    success: true,
    sent: willReallySend,
    dryRun: !willReallySend,
    broadcastEnabled,
    newTrackCount: tracks.length,
    recipientCount: recipients.length,
    mailsSent,
    mailsFailed,
    discordOk,
    tracks: tracks.map((t) => t.title),
  });
}
