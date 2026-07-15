'use client';

/**
 * /verify-email/[token] — Email-Verification (Block O, v2.7)
 *
 * Auto-triggered fetch beim Page-Mount. Zeigt Status:
 * - Loading (Token wird verifiziert)
 * - Success (mit Login-Link)
 * - Already Verified (idempotent)
 * - Expired (mit Resend-Form)
 * - Invalid (mit Hint zur Email)
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

type Status = 'loading' | 'success' | 'already' | 'expired' | 'invalid';

export default function VerifyEmailPage() {
  const t = useTranslations('auth.verify');
  const params = useParams();
  const token = decodeURIComponent(String(params.token ?? ''));

  const [status, setStatus] = useState<Status>('loading');
  const [resendEmail, setResendEmail] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('invalid');
      return;
    }
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (ok && data.alreadyVerified) setStatus('already');
        else if (ok) setStatus('success');
        else if (data.expired) setStatus('expired');
        else setStatus('invalid');
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    setResendBusy(true);
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail }),
      });
      setResendDone(true);
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <section style={pageStyle}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={kickerStyle}>{t('kicker')}</p>
          <h1 style={headingStyle}>
            {t('headingLead')} <span style={{ color: '#3FCF4A', textShadow: '0 0 24px #3FCF4A' }}>{t('headingAccent')}</span>
          </h1>
        </div>

        <div className="kbk-obsidian framed" style={cardStyle}>
          {status === 'loading' && (
            <p style={bodyStyle}>{t('loading')}</p>
          )}

          {status === 'success' && (
            <>
              <p style={{ ...bodyStyle, color: '#3FCF4A' }}>
                {t('successBody')}
              </p>
              <p style={{ ...bodyStyle, marginTop: 12 }}>
                {t('successTwoFaHint')}
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
                <Link href="/settings/security" style={primaryButtonStyle}>{t('setUp2fa')}</Link>
                <Link href="/login" style={secondaryButtonStyle}>{t('signIn')}</Link>
              </div>
            </>
          )}

          {status === 'already' && (
            <>
              <p style={bodyStyle}>{t('alreadyBody')}</p>
              <Link href="/login" style={{ ...primaryButtonStyle, marginTop: 18 }}>{t('signIn')}</Link>
            </>
          )}

          {status === 'expired' && !resendDone && (
            <>
              <p style={{ ...bodyStyle, color: '#F5D02E' }}>
                {t('expiredBody')}
              </p>
              <p style={{ ...bodyStyle, marginTop: 12 }}>{t('expiredPrompt')}</p>
              <form onSubmit={handleResend} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  required
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  style={inputStyle}
                />
                <button type="submit" disabled={resendBusy} style={primaryButtonStyle}>
                  {resendBusy ? t('resendBusy') : t('resend')}
                </button>
              </form>
            </>
          )}

          {status === 'expired' && resendDone && (
            <p style={{ ...bodyStyle, color: '#3FCF4A' }}>
              {t('resendDone')}
            </p>
          )}

          {status === 'invalid' && (
            <>
              <p style={{ ...bodyStyle, color: '#E63B2E' }}>
                {t('invalidBody')}
              </p>
              <p style={{ ...bodyStyle, marginTop: 12 }}>
                {t('invalidHint')}
              </p>
              {!resendDone && (
                <form onSubmit={handleResend} style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    required
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    style={inputStyle}
                  />
                  <button type="submit" disabled={resendBusy} style={primaryButtonStyle}>
                    {resendBusy ? t('resendBusy') : t('resend')}
                  </button>
                </form>
              )}
              {resendDone && (
                <p style={{ ...bodyStyle, color: '#3FCF4A', marginTop: 12 }}>
                  {t('resendDoneShort')}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px',
};
const kickerStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3FCF4A', letterSpacing: '0.2em', margin: '0 0 10px',
};
const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 900,
  color: '#fff', lineHeight: 0.95, margin: '0 0 8px', textTransform: 'uppercase',
};
const cardStyle: React.CSSProperties = { padding: 28 };
const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.8)',
  letterSpacing: '0.02em', lineHeight: 1.5, margin: 0,
};
const inputStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff', padding: '12px 14px', minHeight: 44,
  fontFamily: 'var(--font-mono)', fontSize: 16, outline: 'none',
};
const primaryButtonStyle: React.CSSProperties = {
  background: '#3FCF4A', color: '#0A0B0C', border: 'none',
  padding: '14px 22px', minHeight: 48,
  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 13,
  letterSpacing: '0.1em', cursor: 'pointer', textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 0 20px rgba(63,207,74,0.5), inset 0 0 0 2px #0A0B0C',
  clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
};
const secondaryButtonStyle: React.CSSProperties = {
  background: 'transparent', color: '#3FCF4A', border: '1px solid #3FCF4A',
  padding: '12px 18px', minHeight: 44,
  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 11,
  letterSpacing: '0.15em', cursor: 'pointer', textDecoration: 'none',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};
