'use client';

/**
 * <ConnectionsClient /> (ADR-005 Sektion F)
 *
 * UI für das Account-Linking. KBK bleibt Identity-Master (Email/Password) —
 * Twitch und Discord sind nur verifizierte Verbindungen, keine Login-Methode.
 *
 * Pro Provider eine <ProviderCard>. Erfolg + Fehler kommen als
 * ?<provider>=<code> aus dem OAuth-Callback-Redirect und werden als Toast
 * angezeigt — kein eigenes Banner-API, weil Server-Redirects keinen
 * Client-State pflegen.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/providers/ToastProvider';

interface LinkedAccount {
  providerName: string;
  linkedAt: string;
}

type ProviderKey = 'twitch' | 'discord';

interface ProviderMeta {
  key: ProviderKey;
  label: string; // Versalien — Überschrift + Button (Markenname, nicht übersetzt)
  name: string; // Titelschreibweise — Toast-Texte (Markenname, nicht übersetzt)
  brand: string; // Brand-Farbe
  formatHandle: (name: string) => string;
}

const PROVIDERS: Record<ProviderKey, ProviderMeta> = {
  twitch: {
    key: 'twitch',
    label: 'TWITCH',
    name: 'Twitch',
    brand: '#9146FF',
    formatHandle: (n) => `twitch.tv/${n}`,
  },
  discord: {
    key: 'discord',
    label: 'DISCORD',
    name: 'Discord',
    brand: '#5865F2',
    formatHandle: (n) => n,
  },
};

// Sub-Status-Codes aus dem Callback-Redirect (?<provider>=<code>). Provider-neutral —
// gilt für Twitch wie Discord. Codes bleiben als Translation-Key-Suffix erhalten.
const STATUS_TYPES: Record<string, 'success' | 'error' | 'info'> = {
  ok: 'success',
  cancelled: 'info',
  'already-linked-elsewhere': 'error',
  'not-configured': 'error',
  'not-authenticated': 'error',
  'state-mismatch': 'error',
  'missing-params': 'error',
  'token-exchange-failed': 'error',
  'token-network-error': 'error',
  'users-fetch-failed': 'error',
  'users-network-error': 'error',
  'users-empty': 'error',
};

// Status-Code → Translation-Key unter connections.status.* (camelCase, weil
// JSON-Keys mit Bindestrich umständlich sind).
const STATUS_KEY: Record<string, string> = {
  ok: 'ok',
  cancelled: 'cancelled',
  'already-linked-elsewhere': 'alreadyLinkedElsewhere',
  'not-configured': 'notConfigured',
  'not-authenticated': 'notAuthenticated',
  'state-mismatch': 'stateMismatch',
  'missing-params': 'missingParams',
  'token-exchange-failed': 'tokenExchangeFailed',
  'token-network-error': 'tokenNetworkError',
  'users-fetch-failed': 'usersFetchFailed',
  'users-network-error': 'usersNetworkError',
  'users-empty': 'usersEmpty',
};

interface ConnectionsClientProps {
  twitch: LinkedAccount | null;
  twitchConfigured: boolean;
  discord: LinkedAccount | null;
  discordConfigured: boolean;
}

export default function ConnectionsClient({
  twitch,
  twitchConfigured,
  discord,
  discordConfigured,
}: ConnectionsClientProps) {
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations('connections');
  const searchParams = useSearchParams();

  // Status-Param aus dem Callback-Redirect anzeigen + sauber aus der URL
  // pflegen. Beide Provider nutzen denselben Mechanismus (?twitch= / ?discord=).
  useEffect(() => {
    for (const key of ['twitch', 'discord'] as ProviderKey[]) {
      const status = searchParams.get(key);
      if (!status) continue;
      const type = STATUS_TYPES[status] ?? ('error' as const);
      const messageKey = STATUS_KEY[status] ?? 'generic';
      toast({ type, message: t(`status.${messageKey}`) });
      // URL entrümpeln, damit ein Refresh nicht nochmal toastet
      const url = new URL(window.location.href);
      url.searchParams.delete(key);
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [searchParams, router, toast, t]);

  return (
    <section
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 640 }}>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#9146FF',
            letterSpacing: '0.2em',
            margin: '0 0 10px',
          }}
        >
          {t('kicker')}
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 900,
            color: '#fff',
            lineHeight: 0.95,
            margin: '0 0 8px',
            textTransform: 'uppercase',
          }}
        >
          {t('headingLead')} <span style={{ color: '#9146FF', textShadow: '0 0 24px #9146FF' }}>{t('headingAccent')}</span>
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.6)',
            letterSpacing: '0.05em',
            margin: '0 0 24px',
          }}
        >
          {t('lead')}
        </p>

        <ProviderCard meta={PROVIDERS.twitch} link={twitch} configured={twitchConfigured} />
        <ProviderCard meta={PROVIDERS.discord} link={discord} configured={discordConfigured} />
      </div>
    </section>
  );
}

/**
 * Eine Provider-Zeile (Twitch oder Discord). Drei Zustände:
 *  - verbunden     → Handle + Verlinkungsdatum + DISCONNECT
 *  - konfiguriert  → Blurb + CONNECT
 *  - nicht konfig. → Hinweis + deaktivierter "COMING SOON"-Button
 */
function ProviderCard({
  meta,
  link,
  configured,
}: {
  meta: ProviderMeta;
  link: LinkedAccount | null;
  configured: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const t = useTranslations('connections');
  const tp = useTranslations('pagesUi');
  const [busy, setBusy] = useState(false);

  const handleConnect = () => {
    window.location.href = `/api/auth/${meta.key}/start`;
  };

  const handleDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${meta.key}/disconnect`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast({ type: 'error', message: data.error || t('toastDisconnectFailed') });
        return;
      }
      toast({ type: 'success', message: t('toastDisconnected', { provider: meta.name }) });
      router.refresh();
    } catch (err) {
      console.error(`[connections] ${meta.key} disconnect failed:`, err);
      toast({ type: 'error', message: t('toastNetworkError') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kbk-obsidian framed" style={{ padding: 22, marginBottom: 18 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14,
              color: meta.brand,
              letterSpacing: '0.15em',
              margin: '0 0 6px',
              fontWeight: 900,
            }}
          >
            {meta.label}
          </h2>
          {link ? (
            <>
              <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: '#fff' }}>
                {t('connectedAs')}{' '}
                <span style={{ color: meta.brand }}>{meta.formatHandle(link.providerName)}</span>
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.5)',
                }}
              >
                {t('linkedOn', { date: new Date(link.linkedAt).toLocaleDateString() })}
              </p>
            </>
          ) : configured ? (
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              {t(`blurb.${meta.key}`)}
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'rgba(255,255,255,0.55)',
              }}
            >
              {t('notLiveYet')}
            </p>
          )}
        </div>
        {link ? (
          <button
            onClick={handleDisconnect}
            disabled={busy}
            style={{
              background: 'transparent',
              color: '#E63B2E',
              border: '1px solid #E63B2E',
              padding: '10px 16px',
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: '0.15em',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? t('disconnecting') : t('disconnect')}
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={!configured}
            style={{
              background: configured ? meta.brand : 'rgba(255,255,255,0.12)',
              color: '#fff',
              border: 'none',
              padding: '12px 18px',
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: '0.15em',
              cursor: configured ? 'pointer' : 'not-allowed',
              clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
            }}
          >
            {configured ? t('connect', { provider: meta.label }) : tp('comingSoon')}
          </button>
        )}
      </div>
    </div>
  );
}
