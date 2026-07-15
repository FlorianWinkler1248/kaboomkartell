'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { IcoUser, IcoLoading } from '@/components/kbk/icons';
import { PasswordField } from '@/components/kbk/PasswordField';
import { validatePasswordStrength } from '@/lib/password-policy';

/**
 * Registrierungs-Seite (Cockpit-Style, v2.6).
 * POST /api/users, dann redirect /login?registered=true.
 *
 * v2.6 Workflow:
 * - Public Name (war "Username/Artist Name")
 * - Email
 * - Real Name (Pflicht, nicht öffentlich)
 * - Password + Confirm-Password (mit Generator + Strength-Indicator)
 * - Role NICHT mehr wählbar — alle starten als MITGLIED
 */

export default function RegisterPage() {
  const t = useTranslations('auth.register');

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    realName: '',
    password: '',
    confirmPassword: '',
    newsletterOptIn: false,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [generalError, setGeneralError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // v2.7: Nach Success-Submit zeigen wir Email-Verify-Hinweis + 2FA-Setup-Banner
  // direkt in der Page, statt direkt zu /login zu redirecten.
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  function updateField<K extends keyof typeof formData>(field: K, value: typeof formData[K]) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: [] }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGeneralError('');

    // Client-Side Pre-Checks: Password-Confirm + Policy.
    if (formData.password !== formData.confirmPassword) {
      setErrors({ confirmPassword: [t('errPasswordMismatch')] });
      return;
    }
    const policyErrors = validatePasswordStrength(formData.password);
    if (policyErrors.length > 0) {
      setErrors({ password: policyErrors });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          realName: formData.realName,
          password: formData.password,
          newsletterOptIn: formData.newsletterOptIn,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          setErrors(data.details);
        } else {
          setGeneralError(data.error || t('errRegistrationFailed'));
        }
        return;
      }

      // v2.7: Statt direkt zu redirecten zeigen wir Email-Verify-Hinweis +
      // 2FA-Setup-Banner. User klickt manuell weiter.
      setSubmittedEmail(formData.email);
    } catch (err) {
      console.error('[register] submit failed:', err);
      setGeneralError(t('errServerUnreachable'));
    } finally {
      setIsLoading(false);
    }
  }

  function getFieldError(field: string): string | undefined {
    return errors[field]?.[0];
  }

  return (
    <section
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#E63B2E',
              letterSpacing: '0.2em',
              margin: '0 0 10px',
            }}
          >
            {t('kicker')}
          </p>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(32px, 5vw, 48px)',
              fontWeight: 900,
              color: '#fff',
              letterSpacing: '-0.01em',
              lineHeight: 0.95,
              margin: '0 0 8px',
              textTransform: 'uppercase',
            }}
          >
            {t('headingLead')}{' '}
            <span style={{ color: '#E63B2E', textShadow: '0 0 24px #E63B2E' }}>
              KARTELL
            </span>
          </h1>
        </div>

        <div className="kbk-obsidian framed kbk-frame-red" style={{ padding: 28 }}>
          {submittedEmail ? (
            <RegisterSuccess email={submittedEmail} />
          ) : (
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
          >
            {generalError && (
              <div
                style={{
                  background: 'rgba(230,59,46,0.12)',
                  border: '1px solid rgba(230,59,46,0.4)',
                  color: '#E63B2E',
                  padding: '10px 12px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  letterSpacing: '0.05em',
                }}
              >
                {generalError}
              </div>
            )}

            <FormField
              id="username"
              label={t('publicNameLabel')}
              type="text"
              value={formData.username}
              onChange={(e) => updateField('username', e.target.value)}
              placeholder={t('publicNamePlaceholder')}
              disabled={isLoading}
              error={getFieldError('username')}
              autoComplete="username"
              autoCapitalize="none"
              hint={t('publicNameHint')}
            />
            <FormField
              id="realName"
              label={t('realNameLabel')}
              type="text"
              value={formData.realName}
              onChange={(e) => updateField('realName', e.target.value)}
              placeholder={t('realNamePlaceholder')}
              disabled={isLoading}
              error={getFieldError('realName')}
              autoComplete="name"
              autoCapitalize="words"
              hint={t('realNameHint')}
            />
            <FormField
              id="email"
              label={t('emailLabel')}
              type="email"
              value={formData.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder={t('emailPlaceholder')}
              disabled={isLoading}
              error={getFieldError('email')}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
            />
            <PasswordField
              label={t('passwordLabel')}
              value={formData.password}
              onChange={(v) => updateField('password', v)}
              placeholder={t('passwordPlaceholder')}
              disabled={isLoading}
              error={getFieldError('password')}
              autoComplete="new-password"
              withGenerator
            />
            <PasswordField
              label={t('confirmPasswordLabel')}
              value={formData.confirmPassword}
              onChange={(v) => updateField('confirmPassword', v)}
              placeholder={t('confirmPasswordPlaceholder')}
              disabled={isLoading}
              error={getFieldError('confirmPassword')}
              autoComplete="new-password"
              withStrengthMeter={false}
            />

            <button
              type="submit"
              disabled={isLoading}
              style={{
                background: '#E63B2E',
                color: '#0A0B0C',
                border: 'none',
                padding: '14px 22px',
                minHeight: 48,
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: '0.1em',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow:
                  '0 0 20px rgba(230,59,46,0.5), inset 0 0 0 2px #0A0B0C',
                clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? <IcoLoading size={16} /> : <IcoUser size={16} />}
              {isLoading ? t('submitBusy') : t('submit')}
            </button>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'rgba(255,255,255,0.65)',
                letterSpacing: '0.02em',
                lineHeight: 1.5,
                marginTop: -4,
              }}
            >
              <input
                type="checkbox"
                checked={formData.newsletterOptIn}
                onChange={(e) => updateField('newsletterOptIn', e.target.checked)}
                disabled={isLoading}
                style={{
                  marginTop: 2,
                  accentColor: '#3FCF4A',
                  width: 16,
                  height: 16,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
              <span>{t('newsletterOptIn')}</span>
            </label>
          </form>
          )}

          {!submittedEmail && (
          <p
            style={{
              marginTop: 22,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.05em',
            }}
          >
            {t.rich('alreadyHaveAccount', {
              signin: (chunks) => (
                <Link
                  href="/login"
                  style={{
                    color: '#3FCF4A',
                    textDecoration: 'none',
                    fontWeight: 700,
                  }}
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
          )}
        </div>
      </div>
    </section>
  );
}

// === RegisterSuccess (v2.7) — Nach erfolgreichem Submit ===
// Zeigt: 1) Email-Verify-Hinweis, 2) 2FA-Setup-Banner (skippbar), 3) Sign-In-Link.
function RegisterSuccess({ email }: { email: string }) {
  const t = useTranslations('auth.register');
  const [twoFaDismissed, setTwoFaDismissed] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 1) Email-Verify-Hinweis */}
      <div
        style={{
          background: 'rgba(63,207,74,0.08)',
          border: '1px solid rgba(63,207,74,0.4)',
          padding: '14px 16px',
        }}
      >
        <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 13, color: '#3FCF4A', letterSpacing: '0.1em', fontWeight: 900 }}>
          {t('successTitle')}
        </p>
        <p style={{ margin: '8px 0 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
          {t.rich('successVerifyLinkSent', {
            email,
            mail: (chunks) => <span style={{ color: '#3FCF4A' }}>{chunks}</span>,
          })}
        </p>
        <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          {t('successT0Note')}
        </p>
      </div>

      {/* 2) 2FA-Setup-Banner (skippbar) */}
      {!twoFaDismissed && (
        <div
          style={{
            background: 'rgba(245,208,46,0.08)',
            border: '1px solid rgba(245,208,46,0.4)',
            padding: '14px 16px',
            position: 'relative',
          }}
        >
          <button
            type="button"
            onClick={() => setTwoFaDismissed(true)}
            aria-label={t('twoFaDismissAria')}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 18,
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
          <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 13, color: '#F5D02E', letterSpacing: '0.1em', fontWeight: 900, paddingRight: 24 }}>
            {t('twoFaTitle')}
          </p>
          <p style={{ margin: '8px 0 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
            {t('twoFaBody')}
          </p>
          <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
            {t('twoFaMethods')}
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <Link
              href="/settings/security"
              style={{
                background: '#F5D02E',
                color: '#0A0B0C',
                padding: '10px 16px',
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.15em',
                textDecoration: 'none',
                clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
              }}
            >
              {t('twoFaConfigure')}
            </Link>
            <button
              type="button"
              onClick={() => setTwoFaDismissed(true)}
              style={{
                background: 'transparent',
                color: 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(255,255,255,0.18)',
                padding: '10px 16px',
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.15em',
                cursor: 'pointer',
              }}
            >
              {t('twoFaLater')}
            </button>
          </div>
        </div>
      )}

      {/* 3) Sign-In Link */}
      <p style={{ margin: '8px 0 0', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
        {t.rich('successSignInPrompt', {
          signin: (chunks) => (
            <Link href="/login" style={{ color: '#3FCF4A', textDecoration: 'none', fontWeight: 700 }}>{chunks}</Link>
          ),
        })}
      </p>
    </div>
  );
}

// === Field-Pattern (lokal — kein Shared-Helper, weil Login eigene Variante hat) ===
interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'numeric' | 'tel' | 'search' | 'url' | 'none';
  autoCapitalize?: 'on' | 'off' | 'none' | 'sentences' | 'words' | 'characters';
  minLength?: number;
  hint?: string;
}

function FormField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  disabled,
  error,
  autoComplete,
  inputMode,
  autoCapitalize,
  minLength,
  hint,
}: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        htmlFor={id}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: error ? '#E63B2E' : '#3FCF4A',
          letterSpacing: '0.2em',
        }}
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        spellCheck={autoCapitalize === 'none' ? false : undefined}
        minLength={minLength}
        style={{
          background: 'rgba(0,0,0,0.4)',
          border: `1px solid ${error ? 'rgba(230,59,46,0.6)' : 'rgba(255,255,255,0.12)'}`,
          color: '#fff',
          padding: '12px 14px',
          minHeight: 44,
          fontFamily: 'var(--font-mono)',
          fontSize: 16,
          outline: 'none',
        }}
      />
      {hint && !error && (
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.02em',
          }}
        >
          {hint}
        </p>
      )}
      {error && (
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#E63B2E',
            letterSpacing: '0.05em',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
