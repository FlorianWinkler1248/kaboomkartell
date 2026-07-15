'use client';

/**
 * PasswordField — Reusable Component für Register, Reset-Password,
 * Settings/Change-Password (v2.5).
 *
 * Features:
 * - Live-Strength-Indicator (Pure-JS Score, kein Server-Roundtrip)
 * - "Generate Password"-Button (fetch /api/auth/suggest-password)
 * - Show/Hide Toggle
 * - Policy-Hint-Liste (was fehlt noch)
 * - Vergibt minLength=12 + autoComplete passend zum Use-Case
 */

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  passwordStrengthScore,
  validatePasswordStrength,
  STRENGTH_LABELS,
  STRENGTH_COLORS,
} from '@/lib/password-policy';

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  /** "new-password" für Register/Reset, "current-password" für Login. */
  autoComplete: 'new-password' | 'current-password';
  /** "Generate"-Button anzeigen? Nur für Register/Reset sinnvoll. */
  withGenerator?: boolean;
  /** Strength-Meter + Hint-Liste anzeigen? Default: true bei withGenerator. */
  withStrengthMeter?: boolean;
}

export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  error,
  autoComplete,
  withGenerator,
  withStrengthMeter,
}: PasswordFieldProps) {
  const t = useTranslations('passwordField');
  const id = useId();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const showMeter = withStrengthMeter ?? withGenerator;
  const score = showMeter ? passwordStrengthScore(value) : 0;
  const remaining = showMeter && value ? validatePasswordStrength(value) : [];

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/auth/suggest-password');
      const data = await res.json();
      if (data.ok && data.password) {
        onChange(data.password);
        setShow(true); // automatisch sichtbar machen damit User sich's merken kann
      }
    } catch {
      /* silent — User kann manuell tippen */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label htmlFor={id} style={labelStyle(error)}>{label}</label>
        {withGenerator && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={disabled || busy}
            style={generatorButtonStyle}
          >
            {busy ? '...' : t('generate')}
          </button>
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <input
          id={id}
          name={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required
          disabled={disabled}
          autoComplete={autoComplete}
          minLength={autoComplete === 'new-password' ? 12 : undefined}
          style={inputStyle(error)}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          aria-label={show ? t('hidePassword') : t('showPassword')}
          style={toggleButtonStyle}
        >
          {show ? t('hide') : t('show')}
        </button>
      </div>

      {showMeter && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
          {/* Strength-Bar */}
          <div style={meterTrackStyle}>
            <div
              style={{
                width: `${(score / 4) * 100}%`,
                height: '100%',
                background: STRENGTH_COLORS[score],
                transition: 'width 0.15s ease',
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={meterLabelStyle(score)}>{value ? STRENGTH_LABELS[score] : ''}</span>
            {remaining.length > 0 && (
              <span style={meterHintStyle}>{remaining[0]}</span>
            )}
          </div>
        </div>
      )}

      {error && <p style={errorTextStyle}>{error}</p>}
    </div>
  );
}

const labelStyle = (error?: string): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: error ? '#E63B2E' : '#3FCF4A',
  letterSpacing: '0.2em',
});

const inputStyle = (error?: string): React.CSSProperties => ({
  width: '100%',
  background: 'rgba(0,0,0,0.4)',
  border: `1px solid ${error ? 'rgba(230,59,46,0.6)' : 'rgba(255,255,255,0.12)'}`,
  color: '#fff',
  padding: '12px 70px 12px 14px',
  minHeight: 44,
  fontFamily: 'var(--font-mono)',
  fontSize: 16,
  outline: 'none',
  letterSpacing: '0.05em',
});

const toggleButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  right: 8,
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.5)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: '0.15em',
  cursor: 'pointer',
  padding: '4px 6px',
};

const generatorButtonStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#3FCF4A',
  border: '1px solid #3FCF4A',
  padding: '2px 8px',
  fontFamily: 'var(--font-mono)',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.2em',
  cursor: 'pointer',
};

const meterTrackStyle: React.CSSProperties = {
  height: 3,
  width: '100%',
  background: 'rgba(255,255,255,0.08)',
  overflow: 'hidden',
};

const meterLabelStyle = (score: number): React.CSSProperties => ({
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: STRENGTH_COLORS[score] ?? 'rgba(255,255,255,0.5)',
  letterSpacing: '0.05em',
});

const meterHintStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'rgba(255,255,255,0.5)',
  letterSpacing: '0.02em',
};

const errorTextStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  color: '#E63B2E',
  letterSpacing: '0.05em',
};
