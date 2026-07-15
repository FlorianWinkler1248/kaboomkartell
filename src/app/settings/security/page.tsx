'use client';

/**
 * /settings/security — Account Security (v2.4)
 *
 * - 2FA-Setup (TOTP via Authenticator-App)
 * - Backup-Codes anzeigen (einmalig nach Setup)
 * - 2FA disable (mit Passwort-Confirm)
 * - Logout from all devices
 */

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/providers/ToastProvider';

type SetupData = {
  qrCodeDataUrl: string;
  secretBase32: string;
};

type Stage = 'idle' | 'totp-setup' | 'email-setup' | 'backup-shown';
type Method = 'totp' | 'email';

export default function SecuritySettingsPage() {
  const { status, update } = useSession();
  const router = useRouter();
  const t = useTranslations('security');
  const { toast } = useToast();

  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean>(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<Method | null>(null);
  const [trustTier, setTrustTier] = useState<string>('T1');
  const [stage, setStage] = useState<Stage>('idle');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Initial 2FA-Status laden
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/settings/security');
      return;
    }
    if (status === 'authenticated') {
      fetch('/api/account/me')
        .then((r) => r.json())
        .then((data) => {
          if (data?.user) {
            setTwoFactorEnabled(Boolean(data.user.twoFactorEnabled));
            setTwoFactorMethod(data.user.twoFactorMethod ?? null);
            setTrustTier(data.user.trustTier ?? 'T1');
          }
        })
        .catch(() => {});
    }
  }, [status, router]);

  // Generischer Netzwerk-/JSON-Fehler-Helper. Wenn fetch oder res.json() crashen
  // (Netzwerk weg, 5xx-HTML statt JSON, etc.), gibt der nackte try/finally-Pfad
  // sonst keinerlei Feedback — busy bleibt true, User sieht ewig "STARTING...".
  // Hier ein paar Zeilen Kontext im console.error für die Fehler-Diagnose, plus
  // eine konkrete Meldung im UI.
  const reportFetchError = (where: string, err: unknown) => {
    console.error(`[security] ${where} failed:`, err);
    setError(t('errors.network'));
  };

  // Setup abbrechen — sowohl beim Email-Setup-Stage als auch beim TOTP-Setup-Stage.
  // Raeumt DB-Reste auf (twoFactorSecret / twoFactorEmailCode), damit der nächste
  // Setup-Aufruf mit der anderen Methode sauber startet.
  const handleCancelSetup = async () => {
    setError('');
    setBusy(true);
    try {
      await fetch('/api/account/2fa/cancel-setup', { method: 'POST' });
    } catch (err) {
      // Cancel ist nur Cleanup — wenn das Netz crashed, gehen wir trotzdem
      // in den idle-Stage, weil der DB-Rest beim nächsten Setup eh überschrieben wird.
      console.warn('[security] cancel-setup network error (ignored):', err);
    } finally {
      setStage('idle');
      setVerifyCode('');
      setSetupData(null);
      setBusy(false);
    }
  };

  const handleStartTotp = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/account/2fa/setup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t('errors.setupFailed'));
        return;
      }
      setSetupData({ qrCodeDataUrl: data.qrCodeDataUrl, secretBase32: data.secretBase32 });
      setStage('totp-setup');
    } catch (err) {
      reportFetchError('start-totp', err);
    } finally {
      setBusy(false);
    }
  };

  const handleStartEmail = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/account/2fa/setup-email', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t('errors.setupFailed'));
        return;
      }
      setStage('email-setup');
    } catch (err) {
      reportFetchError('start-email', err);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setError('');
    if (!/^\d{6}$/.test(verifyCode)) {
      setError(t('errors.enter6Digit'));
      return;
    }
    setBusy(true);
    try {
      const endpoint = stage === 'totp-setup'
        ? '/api/account/2fa/verify'
        : '/api/account/2fa/verify-email-setup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t('errors.verificationFailed'));
        return;
      }
      setBackupCodes(data.backupCodes ?? []);
      setTwoFactorEnabled(true);
      setTwoFactorMethod(stage === 'totp-setup' ? 'totp' : 'email');
      setTrustTier(data.trustTier ?? 'T2');
      setStage('backup-shown');
      await update();
      router.refresh();
      toast({ type: 'success', message: t('toast2faEnabled', { tier: data.trustTier ?? 'T2' }) });
    } catch (err) {
      reportFetchError('verify', err);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setError('');
    if (!disablePassword) {
      setError(t('errors.passwordRequired'));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/account/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t('errors.disableFailed'));
        return;
      }
      setTwoFactorEnabled(false);
      setTwoFactorMethod(null);
      setTrustTier(data.trustTier ?? 'T1');
      setShowDisableForm(false);
      setDisablePassword('');
      await update();
    } catch (err) {
      reportFetchError('disable', err);
    } finally {
      setBusy(false);
    }
  };

  const handleLogoutAll = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout-all', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      reportFetchError('logout-all', err);
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') {
    return <div style={pageStyle}><p style={mutedStyle}>{t('loading')}</p></div>;
  }

  return (
    <section style={pageStyle}>
      <div style={{ maxWidth: 640, width: '100%' }}>
        <p style={kickerStyle}>{t('kicker')}</p>
        <h1 style={headingStyle}>
          {t('headingLead')} <span style={{ color: '#3FCF4A', textShadow: '0 0 24px #3FCF4A' }}>{t('headingAccent')}</span>
        </h1>
        <p style={leadStyle}>
          {t('trustTierLabel')} <span style={{ color: '#3FCF4A', fontWeight: 700 }}>{trustTier}</span>
          {trustTier === 'T2' && t('trustTierSuffix.t2')}
          {trustTier === 'T1' && t('trustTierSuffix.t1')}
          {trustTier === 'T0' && t('trustTierSuffix.t0')}
        </p>

        {error && <div style={errorStyle}>{error}</div>}

        {/* === 2FA Section === */}
        <div className="kbk-obsidian framed" style={cardStyle}>
          <h2 style={cardTitleStyle}>{t('twoFactor.title')}</h2>

          {!twoFactorEnabled && stage === 'idle' && (
            <>
              <p style={cardBodyStyle}>
                {t('twoFactor.chooseFactor')}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 4 }}>
                <button onClick={handleStartTotp} disabled={busy} style={methodButtonStyle('#3FCF4A')}>
                  <span style={{ fontSize: 22 }}>📱</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 900, letterSpacing: '0.15em' }}>
                    {busy ? t('twoFactor.starting') : t('twoFactor.authenticatorApp')}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.4 }}>
                    {t('twoFactor.authenticatorHint')}
                  </span>
                </button>
                <button onClick={handleStartEmail} disabled={busy} style={methodButtonStyle('#F5D02E')}>
                  <span style={{ fontSize: 22 }}>📧</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 900, letterSpacing: '0.15em' }}>
                    {busy ? t('twoFactor.starting') : t('twoFactor.emailCode')}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.4 }}>
                    {t('twoFactor.emailHint')}
                  </span>
                </button>
              </div>
            </>
          )}

          {stage === 'email-setup' && (
            <>
              <p style={cardBodyStyle}>
                {t('emailSetup.codeSent')}
              </p>
              <p style={{ ...cardBodyStyle, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                {t('emailSetup.codeExpiry')}
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                style={inputStyle}
                autoComplete="one-time-code"
              />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={handleVerify} disabled={busy} style={primaryButtonStyle}>
                  {busy ? t('verifying') : t('verifyAndEnable')}
                </button>
                <button
                  type="button"
                  onClick={handleCancelSetup}
                  disabled={busy}
                  style={secondaryButtonStyle}
                >
                  {t('useDifferentMethod')}
                </button>
              </div>
            </>
          )}

          {stage === 'totp-setup' && setupData && (
            <>
              <p style={cardBodyStyle}>{t('totpSetup.step1')}</p>
              <div style={{ background: '#fff', padding: 12, display: 'inline-block', marginTop: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setupData.qrCodeDataUrl} alt={t('totpSetup.qrAlt')} width={256} height={256} />
              </div>
              <p style={{ ...cardBodyStyle, marginTop: 18 }}>
                {t('totpSetup.orManual')}
              </p>
              <code style={codeStyle}>{setupData.secretBase32}</code>
              <p style={{ ...cardBodyStyle, marginTop: 18 }}>{t('totpSetup.step2')}</p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                style={inputStyle}
                autoComplete="one-time-code"
              />
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={handleVerify} disabled={busy} style={primaryButtonStyle}>
                  {busy ? t('verifying') : t('verifyAndEnable')}
                </button>
                <button
                  type="button"
                  onClick={handleCancelSetup}
                  disabled={busy}
                  style={secondaryButtonStyle}
                >
                  {t('useDifferentMethod')}
                </button>
              </div>
            </>
          )}

          {stage === 'backup-shown' && (
            <>
              <p style={{ ...cardBodyStyle, color: '#F5D02E' }}>
                {t('backupCodes.warning')}
              </p>
              <div style={backupGridStyle}>
                {backupCodes.map((c) => (
                  <code key={c} style={backupCodeStyle}>{c}</code>
                ))}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(backupCodes.join('\n'));
                }}
                style={secondaryButtonStyle}
              >
                {t('backupCodes.copyAll')}
              </button>
              <button
                onClick={() => {
                  setStage('idle');
                  setBackupCodes([]);
                  setVerifyCode('');
                  setSetupData(null);
                  router.push('/');
                }}
                style={{ ...primaryButtonStyle, marginLeft: 12 }}
              >
                {t('backupCodes.savedTakeMeHome')}
              </button>
            </>
          )}

          {twoFactorEnabled && stage === 'idle' && (
            <>
              <p style={cardBodyStyle}>
                <span style={{ color: '#3FCF4A' }}>✓</span> {t('active.label')}{' '}
                <span style={{ color: '#3FCF4A', fontWeight: 700 }}>
                  {twoFactorMethod === 'email' ? t('active.methodEmail') : t('active.methodTotp')}
                </span>
              </p>
              {!showDisableForm && (
                <button onClick={() => setShowDisableForm(true)} style={dangerButtonStyle}>
                  {t('active.disable')}
                </button>
              )}
              {showDisableForm && (
                <>
                  <p style={cardBodyStyle}>{t('active.enterPasswordToDisable')}</p>
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder={t('active.passwordPlaceholder')}
                    style={inputStyle}
                    autoComplete="current-password"
                  />
                  <button onClick={handleDisable} disabled={busy} style={dangerButtonStyle}>
                    {busy ? t('active.disabling') : t('active.confirmDisable')}
                  </button>
                  <button
                    onClick={() => { setShowDisableForm(false); setDisablePassword(''); }}
                    style={{ ...secondaryButtonStyle, marginLeft: 12 }}
                  >
                    {t('active.cancel')}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* === Sessions Section === */}
        <div style={{ ...cardStyle, marginTop: 18 }}>
          <h2 style={cardTitleStyle}>{t('sessions.title')}</h2>
          <p style={cardBodyStyle}>
            {t('sessions.body')}
          </p>
          <button onClick={handleLogoutAll} disabled={busy} style={dangerButtonStyle}>
            {busy ? t('sessions.signingOut') : t('sessions.signOutEverywhere')}
          </button>
        </div>
      </div>
    </section>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '70vh',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '40px 24px',
};

const kickerStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: '#3FCF4A',
  letterSpacing: '0.2em',
  margin: '0 0 10px',
};

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(28px, 4vw, 40px)',
  fontWeight: 900,
  color: '#fff',
  lineHeight: 0.95,
  margin: '0 0 8px',
  textTransform: 'uppercase',
};

const leadStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'rgba(255,255,255,0.6)',
  letterSpacing: '0.05em',
  margin: '0 0 24px',
};

const mutedStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'rgba(255,255,255,0.5)',
};

const errorStyle: React.CSSProperties = {
  background: 'rgba(230,59,46,0.12)',
  border: '1px solid rgba(230,59,46,0.4)',
  color: '#E63B2E',
  padding: '10px 12px',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  letterSpacing: '0.05em',
  marginBottom: 18,
};

const cardStyle: React.CSSProperties = { padding: 24 };

const cardTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 14,
  fontWeight: 900,
  color: '#3FCF4A',
  letterSpacing: '0.15em',
  margin: '0 0 12px',
};

const cardBodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  color: 'rgba(255,255,255,0.75)',
  letterSpacing: '0.02em',
  margin: '0 0 12px',
  lineHeight: 1.5,
};

const codeStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#3FCF4A',
  padding: '8px 12px',
  fontFamily: 'var(--font-mono)',
  fontSize: 14,
  letterSpacing: '0.1em',
  userSelect: 'all',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: 280,
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  padding: '12px 14px',
  minHeight: 44,
  fontFamily: 'var(--font-mono)',
  fontSize: 16,
  outline: 'none',
  margin: '8px 0 18px',
  letterSpacing: '0.1em',
};

const primaryButtonStyle: React.CSSProperties = {
  background: '#3FCF4A',
  color: '#0A0B0C',
  border: 'none',
  padding: '14px 22px',
  minHeight: 48,
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: 12,
  letterSpacing: '0.15em',
  cursor: 'pointer',
  clipPath: 'polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)',
};

const secondaryButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#3FCF4A',
  border: '1px solid #3FCF4A',
  padding: '12px 18px',
  minHeight: 44,
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: 11,
  letterSpacing: '0.15em',
  cursor: 'pointer',
};

const dangerButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#E63B2E',
  border: '1px solid #E63B2E',
  padding: '12px 18px',
  minHeight: 44,
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: 11,
  letterSpacing: '0.15em',
  cursor: 'pointer',
};

const backupGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 8,
  margin: '12px 0 18px',
};

const backupCodeStyle: React.CSSProperties = {
  background: 'rgba(63,207,74,0.08)',
  border: '1px solid rgba(63,207,74,0.3)',
  color: '#3FCF4A',
  padding: '10px 12px',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  letterSpacing: '0.1em',
  textAlign: 'center',
  userSelect: 'all',
};

const methodButtonStyle = (accent: string): React.CSSProperties => ({
  background: 'rgba(0,0,0,0.4)',
  border: `1px solid ${accent}`,
  color: '#fff',
  padding: '20px 16px',
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  textAlign: 'center',
  transition: 'all 0.15s',
});
