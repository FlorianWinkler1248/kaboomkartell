'use client';

/**
 * /reset-password/[token] — Neues Password setzen (Block D, v2.4)
 *
 * Token kommt aus der URL. UI validiert Format clientseitig (>=8 chars + 1 Zahl),
 * Server validiert nochmal + checkt Token + Expiry.
 */

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { IcoLoading } from '@/components/kbk/icons';
import { PasswordField } from '@/components/kbk/PasswordField';
import { PASSWORD_POLICY } from '@/lib/password-policy';

export default function ResetPasswordPage() {
  const t = useTranslations('auth.reset');
  const params = useParams();
  const router = useRouter();
  const token = decodeURIComponent(String(params.token ?? ''));

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Lokalisierte Policy-Validierung — spiegelt validatePasswordStrength()
  // aus lib/password-policy.ts (shared, liefert nur EN-Strings).
  function firstPolicyError(password: string): string | null {
    if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
      return t('policyMinLength', { count: PASSWORD_POLICY.MIN_LENGTH });
    }
    if (PASSWORD_POLICY.REQUIRE_LOWERCASE && !/[a-z]/.test(password)) {
      return t('policyLowercase');
    }
    if (PASSWORD_POLICY.REQUIRE_UPPERCASE && !/[A-Z]/.test(password)) {
      return t('policyUppercase');
    }
    if (PASSWORD_POLICY.REQUIRE_DIGIT && !/\d/.test(password)) {
      return t('policyDigit');
    }
    if (PASSWORD_POLICY.REQUIRE_SPECIAL && !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?/~`"'\\]/.test(password)) {
      return t('policySpecial');
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const policyError = firstPolicyError(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('errorMismatch'));
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t('errorResetFailed'));
        return;
      }
      setSubmitted(true);
      setTimeout(() => router.push('/login'), 2500);
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
                ✓ {t('successUpdated')}
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {error && <div style={errorStyle}>{error}</div>}
              <PasswordField
                label={t('newPasswordLabel')}
                value={newPassword}
                onChange={setNewPassword}
                placeholder={t('newPasswordPlaceholder')}
                disabled={isLoading}
                autoComplete="new-password"
                withGenerator
              />
              <PasswordField
                label={t('confirmPasswordLabel')}
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder={t('confirmPasswordPlaceholder')}
                disabled={isLoading}
                autoComplete="new-password"
                withStrengthMeter={false}
              />
              <button type="submit" disabled={isLoading} style={primaryButtonStyle}>
                {isLoading && <IcoLoading size={16} />}
                {isLoading ? t('updating') : t('updatePassword')}
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
  fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.75)',
  letterSpacing: '0.02em', lineHeight: 1.5, margin: 0,
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
