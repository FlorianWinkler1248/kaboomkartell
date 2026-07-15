'use client';

/**
 * <AgentAccessClient /> (P2.4 / ADR-035)
 *
 * Token erstellen (Name → Klartext-Token EINMAL in Copy-Box), Liste (Prefix, Name,
 * lastUsed, Scopes), Widerruf. Der Klartext wird nur clientseitig im State gehalten,
 * bis der User ihn wegklickt — er kommt danach nie wieder vom Server.
 *
 * UI-Sprache Englisch (KBK-Konvention). Feedback über useToast.
 */

import { useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';

const ACCENT = '#3FCF4A';

interface TokenView {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export default function AgentAccessClient({
  canCreate,
  initialTokens,
}: {
  canCreate: boolean;
  initialTokens: TokenView[];
}) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<TokenView[]>(initialTokens);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/settings/agent-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, scopes: ['vote'] }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFreshToken(data.token as string);
        setTokens((prev) => [{ ...data.apiToken, lastUsedAt: null, revokedAt: null } as TokenView, ...prev]);
        setName('');
        toast({ type: 'success', message: 'token created — copy it now, it will not be shown again' });
      } else {
        toast({ type: 'error', message: data.error ?? 'could not create token' });
      }
    } catch {
      toast({ type: 'error', message: 'could not create token' });
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      const res = await fetch(`/api/settings/agent-tokens/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, revokedAt: new Date().toISOString() } : t)));
        toast({ type: 'info', message: 'token revoked' });
      } else {
        toast({ type: 'error', message: data.error ?? 'could not revoke token' });
      }
    } catch {
      toast({ type: 'error', message: 'could not revoke token' });
    }
  };

  const copyFresh = async () => {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken);
      toast({ type: 'success', message: 'copied to clipboard' });
    } catch {
      toast({ type: 'info', message: 'select and copy the token manually' });
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', color: '#fff' }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '0.02em', margin: '0 0 8px' }}>Agent Access</h1>
      <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
        Create a personal access token so your AI agent can vote on KaboomKartell for you. Tokens are
        stored only as a hash — the plain token is shown once. Logging out everywhere revokes all tokens.
      </p>

      {/* Fresh-Token-Copy-Box — genau einmal sichtbar */}
      {freshToken && (
        <div style={{ border: `1px solid ${ACCENT}`, background: `${ACCENT}14`, borderRadius: 10, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: ACCENT, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            your new token — copy it now
          </div>
          <code style={{ display: 'block', wordBreak: 'break-all', fontFamily: 'var(--font-mono, monospace)', fontSize: 13, color: '#fff', marginBottom: 12 }}>
            {freshToken}
          </code>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyFresh} style={btnPrimary}>COPY</button>
            <button onClick={() => setFreshToken(null)} style={btnGhost}>done</button>
          </div>
        </div>
      )}

      {/* Erstellen */}
      {canCreate ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="token name (e.g. my claude agent)"
            maxLength={60}
            disabled={creating}
            style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 14, outline: 'none' }}
          />
          <button onClick={create} disabled={creating || !name.trim()} style={{ ...btnPrimary, opacity: creating || !name.trim() ? 0.5 : 1 }}>
            {creating ? '…' : 'CREATE'}
          </button>
        </div>
      ) : (
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 28 }}>
          verify your email (Trust Tier 1) to create agent tokens.
        </p>
      )}

      {/* Liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tokens.length === 0 && (
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>no tokens yet.</p>
        )}
        {tokens.map((t) => {
          const revoked = !!t.revokedAt;
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', opacity: revoked ? 0.5 : 1 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  {t.tokenPrefix} · {t.scopes}
                  {t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : ' · never used'}
                </div>
              </div>
              {revoked ? (
                <span style={{ fontSize: 11, color: '#E63B2E', letterSpacing: '0.06em' }}>REVOKED</span>
              ) : (
                <button onClick={() => revoke(t.id)} style={btnGhost}>revoke</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: ACCENT,
  color: '#0A0B0C',
  border: 'none',
  padding: '10px 16px',
  borderRadius: 8,
  fontWeight: 900,
  fontSize: 13,
  letterSpacing: '0.08em',
  cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.85)',
  border: '1px solid rgba(255,255,255,0.15)',
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
};
