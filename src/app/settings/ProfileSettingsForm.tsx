'use client';

/**
 * ProfileSettingsForm — Profil-Bearbeitungsformular (v2.7 Cockpit-Style)
 *
 * Felder: Display Name, Bio, SoundCloud, Instagram, Telegram, Website,
 *         Newsletter-Opt-In.
 * Speichert über PUT /api/profile.
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { IcoLoading } from '@/components/kbk/icons';
import { useToast } from '@/components/providers/ToastProvider';

interface ProfileData {
  username: string;
  displayName: string | null;
  bio: string | null;
  socialSoundcloud: string | null;
  socialInstagram: string | null;
  socialTelegram: string | null;
  socialWebsite: string | null;
  twitchChannel: string | null;
  newsletterOptIn?: boolean;
}

interface ProfileSettingsFormProps {
  initialData: ProfileData;
}

export default function ProfileSettingsForm({ initialData }: ProfileSettingsFormProps) {
  const { toast } = useToast();
  const t = useTranslations('settings');
  const [isSaving, setIsSaving] = useState(false);

  const [displayName, setDisplayName] = useState(initialData.displayName || '');
  const [bio, setBio] = useState(initialData.bio || '');
  const [socialSoundcloud, setSocialSoundcloud] = useState(initialData.socialSoundcloud || '');
  const [socialInstagram, setSocialInstagram] = useState(initialData.socialInstagram || '');
  const [socialTelegram, setSocialTelegram] = useState(initialData.socialTelegram || '');
  const [socialWebsite, setSocialWebsite] = useState(initialData.socialWebsite || '');
  const [twitchChannel, setTwitchChannel] = useState(initialData.twitchChannel || '');
  const [newsletterOptIn, setNewsletterOptIn] = useState(initialData.newsletterOptIn ?? false);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          bio,
          socialSoundcloud,
          socialInstagram,
          socialTelegram,
          socialWebsite,
          twitchChannel,
          newsletterOptIn,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast({ type: 'success', message: t('toastSaved') });
      } else {
        toast({ type: 'error', message: data.error || t('toastSaveFailed') });
      }
    } catch {
      toast({ type: 'error', message: t('toastError') });
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, displayName, bio, socialSoundcloud, socialInstagram, socialTelegram, socialWebsite, twitchChannel, newsletterOptIn, toast, t]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Basic Info */}
      <div className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={cardTitleStyle}>{t('basicInfo.title')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label={t('basicInfo.publicNameLabel')}>
            <div style={{ ...inputStyle, color: 'rgba(255,255,255,0.55)', cursor: 'not-allowed' }}>
              @{initialData.username}
            </div>
          </Field>

          <Field label={t('basicInfo.displayNameLabel')}>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('basicInfo.displayNamePlaceholder')}
              maxLength={50}
              style={inputStyle}
            />
          </Field>

          <Field label={t('basicInfo.bioLabel', { count: bio.length, max: 300 })}>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('basicInfo.bioPlaceholder')}
              maxLength={300}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
            />
          </Field>
        </div>
      </div>

      {/* Social Links */}
      <div className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={cardTitleStyle}>{t('socialLinks.title')}</h2>
        <p style={{ ...cardBodyStyle, marginBottom: 14 }}>
          {t('socialLinks.intro')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label={t('socialLinks.soundcloudLabel')}>
            <input
              type="url"
              value={socialSoundcloud}
              onChange={(e) => setSocialSoundcloud(e.target.value)}
              placeholder="https://soundcloud.com/yourname"
              maxLength={200}
              style={inputStyle}
            />
          </Field>

          <Field label={t('socialLinks.instagramLabel')}>
            <input
              type="url"
              value={socialInstagram}
              onChange={(e) => setSocialInstagram(e.target.value)}
              placeholder="https://instagram.com/yourname"
              maxLength={200}
              style={inputStyle}
            />
          </Field>

          <Field label={t('socialLinks.telegramLabel')}>
            <input
              type="text"
              value={socialTelegram}
              onChange={(e) => setSocialTelegram(e.target.value)}
              placeholder={t('socialLinks.telegramPlaceholder')}
              maxLength={200}
              style={inputStyle}
            />
          </Field>

          <Field label={t('socialLinks.websiteLabel')}>
            <input
              type="url"
              value={socialWebsite}
              onChange={(e) => setSocialWebsite(e.target.value)}
              placeholder="https://yourwebsite.com"
              maxLength={200}
              style={inputStyle}
            />
          </Field>

          <Field label={t('socialLinks.twitchLabel')}>
            <input
              type="text"
              value={twitchChannel}
              onChange={(e) => setTwitchChannel(e.target.value)}
              placeholder={t('socialLinks.twitchPlaceholder')}
              maxLength={25}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      {/* Newsletter */}
      <div className="kbk-obsidian framed" style={cardStyle}>
        <h2 style={cardTitleStyle}>{t('newsletter.title')}</h2>
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.5,
          }}
        >
          <input
            type="checkbox"
            checked={newsletterOptIn}
            onChange={(e) => setNewsletterOptIn(e.target.checked)}
            style={{
              marginTop: 3,
              accentColor: '#3FCF4A',
              width: 16,
              height: 16,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          />
          <span>
            {t('newsletter.optIn')}
          </span>
        </label>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <Link
          href={`/profile/${initialData.username}`}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: '#3FCF4A',
            textDecoration: 'none',
            letterSpacing: '0.05em',
          }}
        >
          {t('viewPublicProfile')}
        </Link>
        <button
          onClick={handleSave}
          disabled={isSaving}
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
            cursor: isSaving ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 0 20px rgba(63,207,74,0.5), inset 0 0 0 2px #0A0B0C',
            clipPath: 'polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)',
            opacity: isSaving ? 0.7 : 1,
          }}
        >
          {isSaving ? <IcoLoading size={16} /> : null}
          {isSaving ? t('saveBusy') : t('saveProfile')}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: '#3FCF4A',
          letterSpacing: '0.2em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = { padding: 24 };

const cardTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 14,
  fontWeight: 900,
  color: '#3FCF4A',
  letterSpacing: '0.15em',
  margin: '0 0 14px',
};

const cardBodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  color: 'rgba(255,255,255,0.7)',
  letterSpacing: '0.02em',
  margin: 0,
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  padding: '12px 14px',
  minHeight: 44,
  fontFamily: 'var(--font-mono)',
  fontSize: 16,
  outline: 'none',
  letterSpacing: '0.02em',
};
