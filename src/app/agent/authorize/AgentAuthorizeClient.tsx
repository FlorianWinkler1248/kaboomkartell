'use client';

/**
 * <AgentAuthorizeClient /> (P2.5 / ADR-035)
 *
 * Code eingeben → Scopes ansehen → bestätigen. Boomy begrüßt den Agenten seines Gastes.
 * UI-Sprache Englisch (KBK-Konvention). Der PAT wird hier NICHT angezeigt — er geht an
 * den pollenden Agenten.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/providers/ToastProvider';

const ACCENT = '#3FCF4A';

const SCOPE_LABEL: Record<string, string> = {
  vote: 'vote on tracks and the next drop for you',
};

export default function AgentAuthorizeClient() {
  const { toast } = useToast();
  const params = useSearchParams();
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [info, setInfo] = useState<{ scopes: string[]; tokenName: string } | null>(null);
  const [approving, setApproving] = useState(false);
  const [done, setDone] = useState(false);

  const check = useCallback(
    async (c: string) => {
      const t = c.trim();
      if (!t) return;
      setChecking(true);
      setInfo(null);
      try {
        const res = await fetch(`/api/agent/authorize?code=${encodeURIComponent(t)}`);
        const data = await res.json();
        if (data.success && data.found) {
          setInfo({ scopes: data.scopes, tokenName: data.tokenName });
        } else {
          toast({ type: 'error', message: 'that code is invalid or expired' });
        }
      } catch {
        toast({ type: 'error', message: 'could not check the code' });
      } finally {
        setChecking(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    const c = params.get('code');
    if (c) {
      setCode(c);
      check(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approve = async () => {
    if (approving) return;
    setApproving(true);
    try {
      const res = await fetch('/api/agent/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCode: code.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDone(true);
        toast({ type: 'success', message: 'agent authorized — head back to your agent' });
      } else {
        toast({ type: 'error', message: data.error ?? 'could not authorize' });
      }
    } catch {
      toast({ type: 'error', message: 'could not authorize' });
    } finally {
      setApproving(false);
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '48px 20px', color: '#fff' }}>
      <div style={{ fontSize: 12, color: ACCENT, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 10 }}>
        Boomy · Agent Access
      </div>

      {done ? (
        <div style={{ border: `1px solid ${ACCENT}`, background: `${ACCENT}14`, borderRadius: 12, padding: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 8px' }}>you&apos;re linked 🐺</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            boomy says: nice — your agent can vote for you now. head back to it, it&apos;s got the keys.
            you can revoke access anytime under settings → agent access.
          </p>
        </div>
      ) : (
        <>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 8px' }}>authorize your agent</h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
            boomy says: your agent gave you a code — drop it in and i&apos;ll hand it a key to vote on
            your behalf. nothing else, and you can pull the key anytime.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && check(code)}
              placeholder="XXXX-XXXX"
              maxLength={12}
              style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '12px 14px', borderRadius: 8, fontSize: 18, letterSpacing: '0.14em', fontFamily: 'var(--font-mono, monospace)', textAlign: 'center', outline: 'none' }}
            />
            <button onClick={() => check(code)} disabled={checking || !code.trim()} style={{ ...btnGhost, opacity: checking || !code.trim() ? 0.5 : 1 }}>
              {checking ? '…' : 'check'}
            </button>
          </div>

          {info && (
            <div style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 18, marginBottom: 18 }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>
                <strong style={{ color: '#fff' }}>{info.tokenName}</strong> wants to:
              </div>
              <ul style={{ margin: '0 0 16px', paddingLeft: 18, color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 1.7 }}>
                {info.scopes.map((s) => (
                  <li key={s}>{SCOPE_LABEL[s] ?? s}</li>
                ))}
              </ul>
              <button onClick={approve} disabled={approving} style={{ ...btnPrimary, width: '100%', opacity: approving ? 0.6 : 1 }}>
                {approving ? '…' : 'AUTHORIZE'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  background: ACCENT,
  color: '#0A0B0C',
  border: 'none',
  padding: '12px 18px',
  borderRadius: 8,
  fontWeight: 900,
  fontSize: 14,
  letterSpacing: '0.08em',
  cursor: 'pointer',
};

const btnGhost: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  color: 'rgba(255,255,255,0.85)',
  border: '1px solid rgba(255,255,255,0.15)',
  padding: '12px 16px',
  borderRadius: 8,
  fontSize: 14,
  cursor: 'pointer',
};
