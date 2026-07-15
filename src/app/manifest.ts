import type { MetadataRoute } from 'next';

/**
 * PWA-Manifest für KaboomKartell.
 *
 * Wird von Next.js 16 unter /manifest.webmanifest ausgeliefert.
 * Verlinkt automatisch im <head> via App-Router-Convention — KEIN manueller
 * <link rel="manifest"> nötig (Next macht das über metadata).
 *
 * Theme-Color = kbk-black (#0A0B0C): Cockpit-Design ist durchgaengig dunkel,
 * Status-Bar soll nahtlos in den Hintergrund verschmelzen. Rasta-Green ist
 * für Aktion/Live reserviert, nicht für ruhende UI-Chrome-Flächen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KaboomKartell',
    short_name: 'KBK',
    description:
      'Underground broadcast — Phonk · Hardtek · Raggatek. Make Noise Together.',

    id: '/',
    start_url: '/',
    scope: '/',

    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],

    background_color: '#0A0B0C',
    theme_color: '#0A0B0C',
    orientation: 'portrait-primary',

    lang: 'en',
    dir: 'ltr',

    prefer_related_applications: false,

    categories: ['music', 'entertainment', 'social'],

    icons: [
      { src: '/icons/icon-48.png',  sizes: '48x48',   type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-72.png',  sizes: '72x72',   type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-96.png',  sizes: '96x96',   type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },

      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],

    shortcuts: [
      {
        name: 'Schedule',
        short_name: 'Schedule',
        description: 'Upcoming releases & broadcast schedule',
        url: '/schedule',
        icons: [{ src: '/icons/shortcut-schedule.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Library',
        short_name: 'Library',
        description: 'Browse the KBK track library',
        url: '/library',
        icons: [{ src: '/icons/shortcut-library.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Artists',
        short_name: 'Artists',
        description: 'Meet the wolfpack',
        url: '/artists',
        icons: [{ src: '/icons/shortcut-artists.png', sizes: '96x96', type: 'image/png' }],
      },
    ],

    // screenshots-Block bewusst weggelassen (R12 aus Audit) — Files
    // existieren noch nicht. Manifest bleibt valid auch ohne (Lighthouse-
    // Warning, kein Error).
    //
    // PWA-Install-UI auf Android/iOS bekommt mit Screenshots ein hochwertiges
    // Vorschau-Carousel statt nur App-Icon → bessere Install-Conversion.
    //
    // Erzeugung (Flow-manuell, weil DevTools-Mobile-Emulation nötig):
    //   1. Chrome DevTools → Toggle Device → "iPhone 14 Pro" (390x844 → 720x1280)
    //   2. Navigation auf "/" + Screenshot (Cmd+Shift+P → "Capture full size")
    //   3. Wiederholen mit Desktop-Viewport (1920x1080) auf "/"
    //   4. Beide Files unter public/images/screenshots/ ablegen
    //   5. Auskommentierten Block unten reaktivieren + Pfade prüfen
    //
    // Vorbereiteter Block (auskommentiert — Pfade greifen erst nach Flow-Step):
    //
    // screenshots: [
    //   {
    //     src: '/images/screenshots/mobile.png',
    //     sizes: '720x1280',
    //     type: 'image/png',
    //     form_factor: 'narrow',
    //     label: 'Mobile broadcast view',
    //   },
    //   {
    //     src: '/images/screenshots/desktop.png',
    //     sizes: '1920x1080',
    //     type: 'image/png',
    //     form_factor: 'wide',
    //     label: 'Desktop broadcast view',
    //   },
    // ],
  };
}
