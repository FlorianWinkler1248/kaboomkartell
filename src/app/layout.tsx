import type { Metadata } from 'next';
import { Space_Grotesk, Bungee, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import TopNavBar from '@/components/kbk/TopNavBar';
import SessionProvider from '@/components/providers/SessionProvider';
import PlayerProvider from '@/components/providers/PlayerProvider';
import ToastProvider from '@/components/providers/ToastProvider';
import IntroGate from '@/components/kbk/IntroGate';
import MiniPlayer from '@/components/kbk/MiniPlayer';
import SiteFooter from '@/components/kbk/SiteFooter';
import RefBeacon from '@/components/kbk/RefBeacon';
import { TwitchLiveBanner } from '@/components/twitch/TwitchLiveBanner';
import { MCP_SERVER_URL } from '@/lib/mcp-info';
import './globals.css';

/**
 * Root-Layout — Cockpit-Edition (1:1 Artifact-Design)
 *
 * Lädt Fonts, setzt Dark-Mode, wickelt alle Seiten in TopNavBar + SiteFooter.
 * Globale FX: Scanlines-Overlay + Film-Grain + Radial-Backdrop-Glow.
 * Intro-Sequenz einmalig pro Browser-Session.
 * PlayerProvider stellt globalen Audio-State bereit.
 */

// Body-Font laut Vorlage: Space Grotesk. Inter + Montserrat sind raus,
// damit der ganze Body durchgaengig im KBK-Cockpit-Look bleibt.
const spaceGrotesk = Space_Grotesk({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

const bungee = Bungee({
  variable: '--font-display',
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  themeColor: '#0A0B0C',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://kaboomkartell.com'),
  title: {
    default: 'KABOOMKARTELL // 4FLOW — Make Noise Together',
    template: '%s | KABOOMKARTELL',
  },
  description: 'Underground broadcast from the 4FLOW wolfpack. Phonk, hardtek & raggatek, uncut, no ads, no algorithm.',
  keywords: ['KaboomKartell', 'KBK', '4Flow', 'Raggatek', 'Hardtek', 'Phonk', 'Wolfpack'],
  applicationName: 'KaboomKartell',
  appleWebApp: {
    capable: true,
    title: 'KBK',
    statusBarStyle: 'black-translucent',
    startupImage: [
      { url: '/icons/apple-splash-1290-2796.png', media: '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/icons/apple-splash-1179-2556.png', media: '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/icons/apple-splash-1170-2532.png', media: '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/icons/apple-splash-828-1792.png',  media: '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)' },
      { url: '/icons/apple-splash-1125-2436.png', media: '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)' },
      { url: '/icons/apple-splash-750-1334.png',  media: '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)' },
      { url: '/icons/apple-splash-2048-2732.png', media: '(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)' },
      { url: '/icons/apple-splash-1668-2388.png', media: '(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)' },
    ],
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: ['/icons/icon-192.png'],
  },
  manifest: '/manifest.webmanifest',
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: 'website',
    siteName: 'KABOOMKARTELL',
    title: 'KABOOMKARTELL // 4FLOW — Make Noise Together',
    description: 'Underground broadcast. Phonk, hardtek, raggatek. Uncut, no ads, no algorithm.',
    images: [{ url: '/images/logo-4flow.png', width: 512, height: 512, alt: 'KaboomKartell Logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'KABOOMKARTELL // 4FLOW',
    description: 'Underground broadcast. Phonk, hardtek, raggatek.',
    images: ['/images/logo-4flow.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'MusicGroup',
  name: 'KaboomKartell',
  alternateName: 'KBK',
  url: 'https://kaboomkartell.com',
  logo: 'https://kaboomkartell.com/images/logo-4flow.png',
  description: 'Independent music community and hub for artists, founded by 4Flow. Raggatek, Hardtek, Phonk. Make noise together.',
  genre: ['Raggatek', 'Hardtek', 'Phonk'],
  founder: {
    '@type': 'Person',
    name: '4Flow',
    url: 'https://soundcloud.com/4-flow',
  },
  sameAs: ['https://soundcloud.com/4-flow'],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // i18n (ADR-031): Locale aus dem kbk-locale-Cookie, Default Englisch.
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations('commonUi');
  return (
    <html lang={locale} className="dark">
      <head>
        {/* MCP-Discovery: KI-Agenten finden den öffentlichen KBK-MCP-Server
            (Workflow kbk-mcp-discovery; SoT der URL: src/lib/mcp-info.ts). */}
        <link rel="mcp-server" href={MCP_SERVER_URL} />
        <meta name="mcp:server" content={MCP_SERVER_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${bungee.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
        style={{ position: 'relative' }}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
        <SessionProvider>
          <PlayerProvider>
            <ToastProvider>
              {/* Intro-Sequence (einmalig pro Browser, respektiert reduced-motion) */}
              <IntroGate />

              {/* Global FX: Scanlines */}
              <div
                aria-hidden="true"
                style={{
                  position: 'fixed',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 1,
                  background:
                    'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
                }}
              />

              {/* Global FX: Film-Grain */}
              <div
                aria-hidden="true"
                style={{
                  position: 'fixed',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 2,
                  opacity: 0.08,
                  mixBlendMode: 'overlay',
                  backgroundImage:
                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
                }}
              />

              {/* Global FX: Radial-Backdrop-Glow */}
              <div
                aria-hidden="true"
                style={{
                  position: 'fixed',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 0,
                  background:
                    'radial-gradient(600px circle at 20% 20%, rgba(63,207,74,0.1), transparent 60%), radial-gradient(500px circle at 80% 70%, rgba(230,59,46,0.08), transparent 60%)',
                }}
              />

              <div style={{ position: 'relative', zIndex: 3, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                <a href="#main-content" className="kbk-skip-link">{t('skipToContent')}</a>
                {/* v2.30: TWITCH-Live-Banner — schwebt über dem Header sobald KBK live geht. */}
                <TwitchLiveBanner />
                <header>
                  <TopNavBar />
                </header>
                <main id="main-content" className="flex-1">
                  {children}
                </main>
                {/* Globaler Footer: Impressum/Datenschutz/Hilfe + Links, außer /admin. */}
                <SiteFooter />
                {/* Mini-Player: persistente Steuerung auf allen Pages außer /admin. */}
                <MiniPlayer />
                {/* P0.8: PII-freier Ref-Beacon (zählt ?ref=-Deep-Link-Landungen). */}
                <RefBeacon />
              </div>
            </ToastProvider>
          </PlayerProvider>
        </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
