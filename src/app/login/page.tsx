'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { IcoLogin, IcoLoading } from '@/components/kbk/icons';

/**
 * Login-Seite (Cockpit-Style).
 * NextAuth Credentials-Provider, mit Cockpit-Card + Bungee-Buttons.
 */

/**
 * Open-Redirect-Schutz: callbackUrl darf NUR ein relativer Pfad innerhalb
 * derselben Origin sein. Sonst kann jemand `?callbackUrl=https://evil.tld`
 * setzen → Phishing-Vector nach erfolgreichem Login.
 */
function safeCallbackUrl(raw: string | null): string {
  if (!raw) return '/';
  // muss mit / beginnen, darf nicht "//" sein (= protocol-relative URL)
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));

  // v2.6: loginIdentifier kann Email ODER Public Name sein.
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // 2-Step-Login: 'credentials' = Email/Username+Password, 'totp' = 2FA-Code
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials');
  // v2.7: 2FA-Method bestimmt den Step-2-UI-Text + Resend-Button-Sichtbarkeit
  const [twoFactorMethod, setTwoFactorMethod] = useState<'totp' | 'email' | null>(null);

  async function performSignIn(twoFactorCode?: string) {
    const result = await signIn('credentials', {
      // NextAuth-Field heißt weiter "email", semantisch ist's der Identifier.
      email: loginIdentifier,
      password,
      totpCode: twoFactorCode ?? '',
      redirect: false,
    });
    if (result?.error) {
      setError(twoFactorCode
        ? t('errorInvalid2fa')
        : t('errorBadCredentials'));
      return false;
    }
    router.push(callbackUrl);
    router.refresh();
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Step 1: Credentials prüfen + 2FA-Status erfragen
      const checkRes = await fetch('/api/auth/check-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginIdentifier, password }),
      });
      const check = await checkRes.json();
      if (!checkRes.ok) {
        setError(check.error ?? t('errorSignInFailed'));
        return;
      }

      if (check.needs2FA) {
        // v2.7: bei method='email' senden wir den OTP via /send-email-otp.
        // method='totp': User holt Code aus Authenticator-App.
        setTwoFactorMethod(check.twoFactorMethod ?? 'totp');
        if (check.twoFactorMethod === 'email') {
          await fetch('/api/auth/send-email-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loginIdentifier }),
          });
        }
        setStep('totp');
        return;
      }

      // Kein 2FA: direkt signIn (= Session erzeugen)
      await performSignIn();
    } catch (err) {
      console.error('[login] submit failed:', err);
      setError(t('errorNetwork'));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!totpCode.trim()) {
      setError(t('errorEnterCode'));
      return;
    }
    setIsLoading(true);
    try {
      await performSignIn(totpCode.trim());
    } catch (err) {
      console.error('[login] 2fa submit failed:', err);
      setError(t('errorNetwork'));
    } finally {
      setIsLoading(false);
    }
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
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: '#3FCF4A',
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
            <span style={{ color: '#3FCF4A', textShadow: '0 0 24px #3FCF4A' }}>
              {t('headingAccent')}
            </span>
          </h1>
        </div>

        <div className="kbk-obsidian framed" style={{ padding: 28 }}>
          <form
            onSubmit={step === 'credentials' ? handleSubmit : handleTotpSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
          >
            {error && (
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
                {error}
              </div>
            )}

            {step === 'credentials' ? (
              <>
                <FormField
                  id="loginIdentifier"
                  label={t('identifierLabel')}
                  type="text"
                  value={loginIdentifier}
                  onChange={(v) => setLoginIdentifier(v)}
                  placeholder={t('identifierPlaceholder')}
                  disabled={isLoading}
                  autoComplete="username"
                  autoCapitalize="none"
                />
                <FormField
                  id="password"
                  label={t('passwordLabel')}
                  type="password"
                  value={password}
                  onChange={(v) => setPassword(v)}
                  placeholder={t('passwordPlaceholder')}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
              </>
            ) : (
              <>
                <p style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.7)',
                  letterSpacing: '0.05em',
                  margin: 0,
                  lineHeight: 1.5,
                }}>
                  <span style={{ color: '#3FCF4A' }}>✓</span> {t('credentialsVerified')}
                  <br />
                  {twoFactorMethod === 'email'
                    ? t('twoFactorHintEmail')
                    : t('twoFactorHintTotp')}
                </p>
                {twoFactorMethod === 'email' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch('/api/auth/send-email-otp', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ loginIdentifier }),
                      });
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(63,207,74,0.3)',
                      color: '#3FCF4A',
                      padding: '6px 12px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      letterSpacing: '0.15em',
                      cursor: 'pointer',
                      alignSelf: 'flex-start',
                    }}
                  >
                    {t('resendCode')}
                  </button>
                )}
                <FormField
                  id="totp"
                  label={t('twoFactorLabel')}
                  type="text"
                  value={totpCode}
                  onChange={(v) => setTotpCode(v)}
                  placeholder="000000"
                  disabled={isLoading}
                  autoComplete="one-time-code"
                  inputMode="text"
                  autoCapitalize="none"
                />
              </>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                background: '#3FCF4A',
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
                  '0 0 20px rgba(63,207,74,0.5), inset 0 0 0 2px #0A0B0C',
                clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
                opacity: isLoading ? 0.7 : 1,
              }}
            >
              {isLoading ? <IcoLoading size={16} /> : <IcoLogin size={16} />}
              {isLoading
                ? (step === 'totp' ? t('verifying') : t('signingIn'))
                : (step === 'totp' ? t('verify2fa') : t('signIn'))}
            </button>

            {step === 'credentials' && (
              <p style={{
                marginTop: 4,
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'rgba(255,255,255,0.5)',
                letterSpacing: '0.05em',
              }}>
                <Link href="/forgot-password" style={{ color: '#3FCF4A', textDecoration: 'none' }}>
                  {t('forgotPassword')}
                </Link>
              </p>
            )}

            {step === 'totp' && (
              <button
                type="button"
                onClick={() => { setStep('credentials'); setTotpCode(''); setError(''); }}
                style={{
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.5)',
                  border: 'none',
                  padding: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                {t('backToEmail')}
              </button>
            )}
          </form>

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
            {t('noAccount')}{' '}
            <Link
              href="/register"
              style={{
                color: '#3FCF4A',
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              {t('register')}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

// === Wiederverwendetes Field-Pattern ===
interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'numeric' | 'tel' | 'search' | 'url' | 'none';
  autoCapitalize?: 'on' | 'off' | 'none' | 'sentences' | 'words' | 'characters';
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
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        autoCapitalize={autoCapitalize}
        spellCheck={autoCapitalize === 'none' ? false : undefined}
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
