'use client';

/**
 * Admin Settings
 *
 * Editierbare Site-Settings: Name, Tagline, Hero-Texte, Social-Links, Twitch.
 *
 * Social-Links werden als strukturierte Einzel-Felder gepflegt (kein Roh-JSON
 * im UI — „technische Details verstecken") und beim Speichern wieder in den
 * bisherigen JSON-String serialisiert. Unbekannte Keys aus Bestandsdaten
 * werden beim Laden mitgeführt und beim Save unverändert mitgeschrieben.
 */

import { useState, useEffect, useCallback } from 'react';
import { Save, Loader2, CheckCircle } from 'lucide-react';
import {
  AdminPageHeader,
  AdminCard,
  AdminButton,
  adminInputClass,
} from '@/components/admin/ui';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

interface SettingsData {
  siteName: string;
  siteTagline: string;
  heroTitle: string;
  heroSubtitle: string;
  aboutText: string;
  socialLinks: string | null;
  // v2.30: KBK-eigener Twitch-Channel-Login (z.B. "kbk4flow"), leer = aus
  twitchChannel: string | null;
}

// Bekannte Social-Keys — je ein eigenes Eingabefeld statt JSON-Textarea.
// Die API (Zod) erlaubt einen freien JSON-String, daher ist die Liste hier
// bewusst kuratiert; alles außerhalb läuft als „extra" verlustfrei mit.
const SOCIAL_FIELDS = [
  { key: 'soundcloud', label: 'SoundCloud', placeholder: 'https://soundcloud.com/4-flow' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@...' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@...' },
  { key: 'discord', label: 'Discord', placeholder: 'https://discord.gg/...' },
] as const;

interface ParsedSocial {
  fields: Record<string, string>;
  extras: Record<string, unknown>;
  invalid: boolean;
}

/** JSON-String aus der DB in bekannte Felder + Extra-Keys zerlegen. */
function parseSocialLinks(raw: string | null): ParsedSocial {
  if (!raw || !raw.trim()) return { fields: {}, extras: {}, invalid: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { fields: {}, extras: {}, invalid: true };
    }
    const known = new Set<string>(SOCIAL_FIELDS.map((f) => f.key));
    const fields: Record<string, string> = {};
    const extras: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (known.has(key) && typeof value === 'string') {
        fields[key] = value;
      } else {
        // Unbekannte/zusätzliche Keys nicht wegwerfen — beim Save mitschreiben
        extras[key] = value;
      }
    }
    return { fields, extras, invalid: false };
  } catch {
    // Bestandsdaten sind kein valides JSON → Raw-Fallback im UI
    return { fields: {}, extras: {}, invalid: true };
  }
}

/** Felder + Extras zurück in den bisherigen JSON-String serialisieren. */
function serializeSocialLinks(
  fields: Record<string, string>,
  extras: Record<string, unknown>
): string {
  const out: Record<string, unknown> = {};
  for (const { key } of SOCIAL_FIELDS) {
    const value = (fields[key] || '').trim();
    if (value) out[key] = value;
  }
  for (const [key, value] of Object.entries(extras)) {
    // Bekannte Keys nie aus Extras überschreiben — sonst gewinnt ein
    // Nicht-String-Altwert (z. B. Zahl aus Handdaten) über die User-Eingabe
    if (!(key in out)) out[key] = value;
  }
  // Leeres Objekt → leerer String (Zod erlaubt kein null für socialLinks)
  return Object.keys(out).length > 0 ? JSON.stringify(out) : '';
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({
    siteName: 'KaboomKartell',
    siteTagline: 'Underground broadcast by 4Flow',
    heroTitle: 'Make Noise Together',
    heroSubtitle: 'Phonk · Hardtek · Raggatek',
    aboutText: '',
    socialLinks: null,
    twitchChannel: null,
  });
  const [social, setSocial] = useState<Record<string, string>>({});
  const [socialExtras, setSocialExtras] = useState<Record<string, unknown>>({});
  const [socialInvalid, setSocialInvalid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  // Settings laden
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        if (json.success && json.data) {
          setSettings(json.data);
          const parsed = parseSocialLinks(json.data.socialLinks);
          setSocial(parsed.fields);
          setSocialExtras(parsed.extras);
          setSocialInvalid(parsed.invalid);
        } else {
          toast({ type: 'error', message: json.error || 'Failed to load settings.' });
        }
      } catch (err) {
        console.error('Settings load error:', err);
        toast({ type: 'error', message: 'Failed to load settings.' });
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settings speichern
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);

    // Im Raw-Fallback (invalides Bestands-JSON) den Text unverändert senden,
    // sonst die strukturierten Felder + Extras serialisieren.
    const socialLinksValue = socialInvalid
      ? (settings.socialLinks ?? '')
      : serializeSocialLinks(social, socialExtras);

    // Zod erlaubt kein null bei den String-Feldern → leere Strings senden
    const payload = {
      siteName: settings.siteName,
      siteTagline: settings.siteTagline ?? '',
      heroTitle: settings.heroTitle ?? '',
      heroSubtitle: settings.heroSubtitle ?? '',
      aboutText: settings.aboutText ?? '',
      socialLinks: socialLinksValue,
      twitchChannel: settings.twitchChannel ?? '',
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        toast({ type: 'success', message: 'Settings saved.' });
        // State mit dem gespeicherten Wert synchronisieren; wenn der
        // Raw-Fallback jetzt valides JSON enthält, zurück in den Feld-Modus.
        setSettings((prev) => ({ ...prev, socialLinks: socialLinksValue || null }));
        const reparsed = parseSocialLinks(socialLinksValue || null);
        if (!reparsed.invalid) {
          setSocial(reparsed.fields);
          setSocialExtras(reparsed.extras);
          setSocialInvalid(false);
        }
      } else {
        toast({ type: 'error', message: json.error || 'Something went wrong.' });
      }
    } catch (err) {
      console.error('Settings save error:', err);
      toast({ type: 'error', message: 'Something went wrong.' });
    } finally {
      setSaving(false);
    }
  }, [settings, social, socialExtras, socialInvalid, toast]);

  const updateField = (field: keyof SettingsData, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-rasta-green" size={24} />
      </div>
    );
  }

  const extraSocialKeys = Object.keys(socialExtras);

  return (
    <div>
      <AdminPageHeader
        kickerTag="/S/"
        kicker="SITE CONFIG"
        title="SETTINGS"
        actions={
          <AdminButton onClick={handleSave} isLoading={saving}>
            {!saving && (saved ? <CheckCircle size={16} /> : <Save size={16} />)}
            {saved ? 'Saved!' : 'Save'}
          </AdminButton>
        }
      />

      <div className="space-y-6">
        {/* Allgemein */}
        <AdminCard>
          <h2 className="font-semibold text-foreground mb-4">General</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-muted mb-1">Site Name</label>
              <input
                value={settings.siteName}
                onChange={(e) => updateField('siteName', e.target.value)}
                className={cn(adminInputClass, 'w-full')}
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Tagline</label>
              <input
                value={settings.siteTagline}
                onChange={(e) => updateField('siteTagline', e.target.value)}
                className={cn(adminInputClass, 'w-full')}
              />
            </div>
          </div>
        </AdminCard>

        {/* Hero-Bereich */}
        <AdminCard>
          <h2 className="font-semibold text-foreground mb-4">Hero Section</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1">Hero Title</label>
              <input
                value={settings.heroTitle}
                onChange={(e) => updateField('heroTitle', e.target.value)}
                className={cn(adminInputClass, 'w-full')}
              />
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Hero Subtitle</label>
              <input
                value={settings.heroSubtitle}
                onChange={(e) => updateField('heroSubtitle', e.target.value)}
                className={cn(adminInputClass, 'w-full')}
              />
            </div>
          </div>
        </AdminCard>

        {/* Über Uns */}
        <AdminCard>
          <h2 className="font-semibold text-foreground mb-4">About Us Text</h2>
          <textarea
            value={settings.aboutText || ''}
            onChange={(e) => updateField('aboutText', e.target.value)}
            rows={6}
            className={cn(adminInputClass, 'w-full resize-y')}
            placeholder="Describe KaboomKartell..."
          />
        </AdminCard>

        {/* Social Links — strukturierte Felder statt Roh-JSON */}
        <AdminCard framed={socialInvalid} frame="yellow">
          <h2 className="font-semibold text-foreground mb-4">Social Links</h2>
          {socialInvalid ? (
            <div>
              <p className="text-sm text-rasta-yellow mb-3">
                The stored value could not be read as structured data. Fix the raw
                value below and save — the structured fields will take over after
                that.
              </p>
              <textarea
                value={settings.socialLinks || ''}
                onChange={(e) => updateField('socialLinks', e.target.value)}
                rows={3}
                className={cn(adminInputClass, 'w-full font-mono resize-y')}
              />
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm text-muted mb-1">{label}</label>
                    <input
                      value={social[key] || ''}
                      onChange={(e) =>
                        setSocial((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={placeholder}
                      className={cn(adminInputClass, 'w-full')}
                      autoCapitalize="none"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                ))}
              </div>
              {extraSocialKeys.length > 0 && (
                <p className="text-xs text-muted mt-3">
                  Additional entries are kept as-is:{' '}
                  <span className="font-mono">{extraSocialKeys.join(', ')}</span>
                </p>
              )}
            </div>
          )}
        </AdminCard>

        {/* Twitch (v2.30) */}
        <AdminCard>
          <h2 className="font-semibold text-foreground mb-4">Twitch</h2>
          <p className="text-sm text-muted mb-3">
            KBK channel login (e.g. <code className="font-mono">kbk4flow</code>). When
            the channel goes live, the Twitch player takes over on{' '}
            <code className="font-mono">/artists</code> and overrides the audio player.
            Leave empty to disable.
          </p>
          <input
            value={settings.twitchChannel || ''}
            onChange={(e) => updateField('twitchChannel', e.target.value)}
            placeholder="kbk4flow"
            className={cn(adminInputClass, 'w-full font-mono')}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
          />
        </AdminCard>
      </div>
    </div>
  );
}
