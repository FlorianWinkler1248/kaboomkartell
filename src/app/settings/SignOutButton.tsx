'use client';

/**
 * SignOutButton — Inline-Component für /settings (v2.9).
 *
 * Notfall-Logout falls der User in einer Sackgasse landet (z.B. eigenes
 * Profil 404 weil User-Record gelöscht wurde, JWT-Cookie aber noch valid).
 */

import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function SignOutButton() {
  const router = useRouter();
  const t = useTranslations('settings');
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut({ redirect: false });
      router.push('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handleSignOut}
      disabled={busy}
      style={{
        background: 'transparent',
        color: '#E63B2E',
        border: '1px solid #E63B2E',
        padding: '8px 14px',
        fontFamily: 'var(--font-display)',
        fontWeight: 900,
        fontSize: 11,
        letterSpacing: '0.15em',
        cursor: busy ? 'not-allowed' : 'pointer',
        textDecoration: 'none',
      }}
    >
      {busy ? t('signOutBusy') : t('signOut')}
    </button>
  );
}
