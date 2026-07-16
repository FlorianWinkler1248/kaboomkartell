import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import prisma from '@/lib/db';
import { auth } from '@/lib/auth';
import { renderMarkdown } from '@/lib/process-markdown';
import { obsidianFrameVars } from '@/lib/obsidian-frame';
import { isSafeExternalUrl, resolveMissionText } from '@/lib/mission-config';
import MissionAcceptButton, {
  type MissionAcceptanceStatus,
} from '@/components/kbk/MissionAcceptButton';

/**
 * Mission-Detail (/mission/[slug]) — Markdown-Briefing + Accept-Insel (ADR-039).
 *
 * Server Component. Der Markdown-Body läuft AUSSCHLIESSLICH durch den geteilten
 * escapeHtml-Renderer `renderMarkdown` (Muster HelpCenterView) — nie ein zweiter
 * Renderer, nie rohes dangerouslySetInnerHTML ohne Escaping. renderMarkdown ist
 * reine String-Verarbeitung und server-safe; das client-only im Modul-Header
 * betrifft nur `ensureMermaid` (window/CDN), das hier bewusst NICHT gerufen wird
 * — Mermaid-Blöcke erscheinen als Code-Block-Fallback.
 *
 * 404-Disziplin: ARCHIVED antwortet IDENTISCH zu unbekanntem Slug (kein
 * Existenz-Orakel, Muster kbk-help-center).
 *
 * Accept-Status: kein GET auf der Accept-Route — der eigene Annahme-Status
 * ('ACCEPTED' | 'COMPLETED' | null; WITHDRAWN → null) wird hier server-seitig
 * via auth() + prisma geholt und als Prop in die Client-Insel gereicht
 * (einfachster Weg, spart einen Client-Roundtrip).
 */

// DB + Session pro Request — kein Build-Zeit-Prerender.
export const dynamic = 'force-dynamic';

const GREEN = '#3FCF4A';
const RED = '#E63B2E';
const YELLOW = '#F5D02E';
const PURPLE = '#9F6BFF';

const TYPE_COLOR: Record<string, string> = {
  DONATION: YELLOW,
  RECRUITING: GREEN,
  PARTNERSHIP: RED,
  GOAL: PURPLE,
};

const TYPE_KEY: Record<string, 'donation' | 'recruiting' | 'partnership' | 'goal'> = {
  DONATION: 'donation',
  RECRUITING: 'recruiting',
  PARTNERSHIP: 'partnership',
  GOAL: 'goal',
};

const fmt = (n: number) => n.toLocaleString('en-US');

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tMeta = await getTranslations('meta.mission');

  let mission: {
    title: string;
    summary: string;
    status: string;
    actionLabel: string | null;
    translations: string | null;
  } | null = null;
  try {
    mission = await prisma.mission.findUnique({
      where: { slug },
      select: { title: true, summary: true, status: true, actionLabel: true, translations: true },
    });
  } catch {
    mission = null;
  }

  // ARCHIVED = identisch zu unbekannt (kein Existenz-Orakel).
  if (!mission || mission.status === 'ARCHIVED') {
    return { title: tMeta('notFound') };
  }
  // Metadaten im aktiven Locale — gleicher Resolver wie die Seite selbst
  // (body wird fuer Metadaten nicht gebraucht → neutraler Platzhalter).
  const locale = await getLocale();
  const text = resolveMissionText({ ...mission, body: '' }, locale);
  return {
    title: `${text.title} — KaboomKartell`,
    description: text.summary,
  };
}

export default async function MissionDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const t = await getTranslations('mission');
  // Aktives Locale aus dem kbk-locale-Cookie (ADR-031) — Missions-Inhalte
  // loest resolveMissionText feld-weise auf (Fallback EN-Basisfelder).
  const locale = await getLocale();

  // DB-Fehler → 404 statt Error-Boundary: die Detail-Seite eines temporär
  // nicht erreichbaren Systems soll sich wie ein unbekannter Slug verhalten
  // (Muster WolfpackSection: degradieren statt crashen).
  let mission = null;
  try {
    mission = await prisma.mission.findUnique({ where: { slug } });
  } catch (err) {
    console.error('MissionDetail mission-query failed:', err);
  }

  // ARCHIVED und unbekannter Slug antworten IDENTISCH (404-Disziplin).
  if (!mission || mission.status === 'ARCHIVED') {
    notFound();
  }

  // Eigener Annahme-Status server-seitig (auth() + prisma) → Prop in die
  // Insel. WITHDRAWN wird auf null gemappt (wie „nie angenommen").
  let acceptanceStatus: MissionAcceptanceStatus = null;
  const session = await auth();
  if (session?.user?.id) {
    try {
      const acceptance = await prisma.missionAcceptance.findUnique({
        where: {
          missionId_userId: { missionId: mission.id, userId: session.user.id },
        },
        select: { status: true },
      });
      if (acceptance?.status === 'ACCEPTED' || acceptance?.status === 'COMPLETED') {
        acceptanceStatus = acceptance.status;
      }
    } catch (err) {
      console.error('MissionDetail acceptance-lookup failed:', err);
    }
  }

  // Anzeige-Texte im aktiven Locale (Teil-Uebersetzung mischt mit EN).
  const text = resolveMissionText(mission, locale);

  const color = TYPE_COLOR[mission.type] ?? GREEN;
  const hasProgress = mission.progressTarget != null && mission.progressTarget > 0;
  // Fortschritt ohne Ziel (Target null/0, aber Current > 0): absoluter Zähler
  // statt gar nichts — der BALKEN bleibt Target-pflichtig (kein Prozent ohne Ziel).
  const hasAbsoluteProgress = !hasProgress && (mission.progressCurrent ?? 0) > 0;
  const pct = hasProgress
    ? Math.min(
        100,
        Math.max(0, Math.round(((mission.progressCurrent ?? 0) / (mission.progressTarget as number)) * 100)),
      )
    : null;

  // Markdown → HTML über den geteilten escapeHtml-Renderer (XSS-Anker der
  // Spec) — auch der uebersetzte Body laeuft IMMER durch renderMarkdown.
  const mermaidBlocks: string[] = [];
  const bodyHtml = renderMarkdown(text.body, mermaidBlocks);

  return (
    <section
      style={{
        padding: '40px 24px',
        maxWidth: 860,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <Link
        href="/mission"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.55)',
          letterSpacing: '0.15em',
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: 18,
        }}
      >
        {t('detail.back')}
      </Link>

      {/* Badge-Zeile */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color,
            border: `1px solid ${color}80`,
            padding: '3px 10px',
            letterSpacing: '0.15em',
          }}
        >
          {t(`type.${TYPE_KEY[mission.type] ?? 'goal'}`)}
        </span>
        {mission.status === 'PAUSED' && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: YELLOW,
              border: `1px solid ${YELLOW}60`,
              padding: '3px 10px',
              letterSpacing: '0.15em',
            }}
          >
            {t('statusPaused')}
          </span>
        )}
        {mission.status === 'COMPLETED' && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: GREEN,
              border: `1px solid ${GREEN}60`,
              padding: '3px 10px',
              letterSpacing: '0.15em',
            }}
          >
            {t('statusCompleted')}
          </span>
        )}
        {mission.createdBy === 'boomy' && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: PURPLE,
              letterSpacing: '0.1em',
            }}
          >
            {t('calledByBoomy')}
          </span>
        )}
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          fontWeight: 900,
          color: '#fff',
          letterSpacing: '-0.01em',
          textTransform: 'uppercase',
          margin: '0 0 14px',
        }}
      >
        {text.title}
      </h1>

      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          fontStyle: 'italic',
          color: 'rgba(255,255,255,0.65)',
          lineHeight: 1.7,
          borderLeft: `2px solid ${color}66`,
          paddingLeft: 12,
          margin: '0 0 22px',
        }}
      >
        {text.summary}
      </p>

      {/* Fortschritt — manuell gepflegt; Balken capped, Zahlen echt. */}
      {hasProgress && (
        <div
          className="kbk-obsidian framed"
          style={{ ...obsidianFrameVars(color), padding: 18, marginBottom: 18 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.6)',
              marginBottom: 8,
            }}
          >
            <span>{t('progressLabel')}</span>
            <span style={{ color: '#fff', fontWeight: 700 }}>
              {fmt(mission.progressCurrent ?? 0)} / {fmt(mission.progressTarget as number)}
              {mission.progressUnit ? ` ${mission.progressUnit}` : ''}
            </span>
          </div>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: color,
                boxShadow: `0 0 10px ${color}80`,
              }}
            />
          </div>
        </div>
      )}

      {/* Absoluter Fortschritt ohne Ziel — Zahl zeigen, Balken weglassen. */}
      {hasAbsoluteProgress && (
        <div
          className="kbk-obsidian framed"
          style={{ ...obsidianFrameVars(color), padding: 18, marginBottom: 18 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            <span>{t('progressLabel')}</span>
            <span style={{ color: '#fff', fontWeight: 700 }}>
              {t('progressAbsolute', {
                value: `${fmt(mission.progressCurrent as number)}${mission.progressUnit ? ` ${mission.progressUnit}` : ''}`,
              })}
            </span>
          </div>
        </div>
      )}

      {/* Action-CTA — fuer ALLE Besucher klickbar; Donation ohne Link zeigt
          den definierten Platzhalter-Zustand statt eines toten Buttons.
          Render-Guard isSafeExternalUrl: zod sichert nur den Write-Pfad —
          Seed-Skripte/Bestandsdaten umgehen ihn (kein javascript:-href). */}
      {isSafeExternalUrl(mission.actionUrl) ? (
        <a
          href={mission.actionUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: '0.12em',
            color: '#0A0B0C',
            background: color,
            padding: '12px 24px',
            minHeight: 44,
            textDecoration: 'none',
            clipPath: 'polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)',
            boxShadow: `0 0 16px ${color}66`,
            marginBottom: 22,
          }}
        >
          {text.actionLabel || t('actionDefault')}
        </a>
      ) : (
        mission.type === 'DONATION' && (
          <div
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.45)',
              border: '1px dashed rgba(255,255,255,0.25)',
              padding: '8px 14px',
              letterSpacing: '0.1em',
              marginBottom: 22,
            }}
          >
            {t('linkComingSoon')}
          </div>
        )
      )}

      {/* Missions-Briefing — Markdown, escaped gerendert (geteilter Renderer) */}
      <div className="kbk-obsidian framed" style={{ padding: 24, marginBottom: 22 }}>
        <h2
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color,
            letterSpacing: '0.2em',
            margin: '0 0 14px',
          }}
        >
          {t('detail.briefing')}
        </h2>
        <article
          className="prose prose-invert max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </div>

      {/* Accept/Withdraw — Client-Insel, nur bei annehmbaren Missionen.
          acceptable und type sind orthogonal (Spec): der Accept-Bereich hängt
          allein an acceptable, der Spenden-Button allein an actionUrl. */}
      {mission.acceptable && (
        <MissionAcceptButton
          slug={mission.slug}
          missionStatus={mission.status}
          acceptanceStatus={acceptanceStatus}
        />
      )}
    </section>
  );
}
