'use client';

/**
 * /forgot-password — Email-Eingabe für Reset-Link (Block D, v2.4)
 *
 * Generischer Erfolgsmeldung — egal ob Account existiert oder nicht
 * (kein User-Enumeration-Leak).
 */

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { IcoLoading } from '@/components/kbk/icons';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgot');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t('errorRequestFailed'));
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setIsLoading(false);
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
          {submitted ? (
            <>
              <p style={{ ...bodyStyle, color: '#3FCF4A' }}>
                ✓ {t('successSent')}
              </p>
              <p style={{ ...bodyStyle, marginTop: 16 }}>
                {t('linkExpiry')}
              </p>
              <p style={{ marginTop: 22, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                <Link href="/login" style={{ color: '#3FCF4A', textDecoration: 'none' }}>{t('backToSignIn')}</Link>
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {error && <div style={errorStyle}>{error}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="email" style={labelStyle}>{t('emailLabel')}</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  style={inputStyle}
                />
              </div>
              <button type="submit" disabled={isLoading} style={primaryButtonStyle}>
                {isLoading && <IcoLoading size={16} />}
                {isLoading ? t('sending') : t('sendResetLink')}
              </button>
              <p style={{ marginTop: 4, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                <Link href="/login" style={{ color: '#3FCF4A', textDecoration: 'none' }}>{t('backToSignIn')}</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '70vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 24px',
};
const kickerStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3FCF4A',
  letterSpacing: '0.2em', margin: '0 0 10px',
};
const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 40px)',
  fontWeight: 900, color: '#fff', lineHeight: 0.95, margin: '0 0 8px',
  textTransform: 'uppercase',
};
const cardStyle: React.CSSProperties = { padding: 28 };
const bodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.75)',
  letterSpacing: '0.02em', lineHeight: 1.5, margin: 0,
};
const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3FCF4A', letterSpacing: '0.2em',
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
  letterSpacing: '0.1em', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  boxShadow: '0 0 20px rgba(63,207,74,0.5), inset 0 0 0 2px #0A0B0C',
  clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
};
const errorStyle: React.CSSProperties = {
  background: 'rgba(230,59,46,0.12)', border: '1px solid rgba(230,59,46,0.4)',
  color: '#E63B2E', padding: '10px 12px',
  fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.05em',
};
