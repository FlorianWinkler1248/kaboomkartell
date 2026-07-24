'use client';

/**
 * Claim-Actions (ADR-041) — Client-Child der Claim-Landing.
 *
 * Eingeloggt: Claim-Button → POST /api/studio/claim {token} → Toast +
 * Redirect /studio. Fehler-Antworten (400 invalid/expired, 403 Email nicht
 * verifiziert, 409 schon geclaimt) werden als Fehlertext angezeigt.
 * Nicht eingeloggt: Login/Register-CTAs mit callbackUrl zurück hierher.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/providers/ToastProvider';

const GREEN = '#3FCF4A';

const ctaStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '10px 22px',
  fontFamily: 'var(--font-display)',
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  cursor: 'pointer',
};

export default function ClaimActions({
  token,
  isLoggedIn,
}: {
  token: string;
  isLoggedIn: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClaim = async () => {
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => null);
      if (json?.success) {
        toast({ message: 'Profile claimed — welcome to the studio!', type: 'success' });
        // refresh() zieht die Server-Session nach, bevor das Studio-Gate greift
        router.refresh();
        router.push('/studio');
      } else {
        // 400 invalid/expired · 403 'Verify your email first' · 409 already claimed
        setError(json?.error || 'Could not claim this profile.');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const callbackUrl = encodeURIComponent(`/claim/${token}`);

  if (!isLoggedIn) {
    return (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link
          href={`/login?callbackUrl=${callbackUrl}`}
          className="kbk-obsidian polished framed"
          style={{ ...ctaStyle, color: '#fff' }}
        >
          Log in to claim
        </Link>
        <Link
          href={`/register?callbackUrl=${callbackUrl}`}
          className="kbk-obsidian polished"
          style={{ ...ctaStyle, color: GREEN }}
        >
          Create account
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button"
        onClick={handleClaim}
        disabled={claiming}
        className="kbk-obsidian polished framed"
        style={{
          ...ctaStyle,
          color: '#fff',
          border: 'none',
          opacity: claiming ? 0.6 : 1,
        }}
      >
        {claiming && <Loader2 size={16} className="animate-spin" />}
        {claiming ? 'Claiming...' : 'Claim this artist spot'}
      </button>
      {error && (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: '#E63B2E',
            margin: 0,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
