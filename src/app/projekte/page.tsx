import type { Metadata } from 'next';
import Image from 'next/image';
import { SectionTitle } from '@/components/kbk/SectionTitle';

/**
 * Projekte-Seite: Werdegang von Florian Winkler (4Flow) als Projekt-Schau.
 *
 * Bewusste Ausnahme von der i18n-Regel: Die Seite ist der Link aus dem
 * Lebenslauf und richtet sich an deutschsprachige Arbeitgeber. Darum stehen
 * die Texte fest auf Deutsch hier und nicht in messages/*.json. Sie hängt
 * nicht in der Navigation, man erreicht sie nur über den Link.
 */

export const metadata: Metadata = {
  title: 'Projekte | Florian Winkler',
  description:
    'Florian Winkler, Fachinformatiker für Anwendungsentwicklung: KI-Software, die Teams im Alltag benutzen. Projekte von 2024 bis heute.',
};

type Akzent = 'green' | 'red' | 'yellow' | 'purple';

interface Projekt {
  titel: string;
  zeitraum: string;
  rahmen: string;
  text: string;
  bild?: { src: string; alt: string; breite: number; hoehe: number };
  breit?: boolean;
  link?: { href: string; label: string };
  akzent: Akzent;
}

const AKZENT_HEX: Record<Akzent, string> = {
  green: '#3FCF4A',
  red: '#E63B2E',
  yellow: '#F5D02E',
  purple: '#9F6BFF',
};

const BERUF: Projekt[] = [
  {
    titel: 'Marc und Info Center',
    zeitraum: '05/2026 bis 07/2026',
    rahmen: 'Coderitter GmbH, Praktikum, direkt mit dem Geschäftsführer',
    text:
      'Der Vertrieb pflegte Firmendaten im CRM von Hand. Marc durchsucht öffentliche Quellen, schlägt Ergänzungen vor und schreibt erst nach Freigabe durch einen Menschen ins CRM. Dazu das Info Center mit Anmeldung, Rollen und einer Suche in Alltagssprache. Allein gebaut, nach zwei Monaten im Einsatz bei Vertrieb und Geschäftsführung.',
    bild: {
      src: '/images/projekte/infocenter.jpg',
      alt: 'Startansicht des Info Centers mit den Stationen von Marc, unten die letzten Einträge ins CRM',
      breite: 1440,
      hoehe: 769,
    },
    breit: true,
    akzent: 'purple',
  },
];

const EIGENE: Projekt[] = [
  {
    titel: 'KaboomKartell',
    zeitraum: 'seit 10/2024',
    rahmen: 'eigenes Produkt, live',
    text:
      'Eine digitale Hausparty: ein Radio, das rund um die Uhr läuft und bei dem die Community bestimmt, was als Nächstes spielt. Die Idee begleitet mich seit dem ersten Tag der Umschulung. Angefangen zu dritt, am Ende allein weitergetragen; nach eineinhalb Jahren Konzept online, seit Juli 2026 öffentlich. Mit Twitch-Anbindung und Boomy, einer KI, die durch die Plattform führt.',
    bild: { src: '/images/projekte/kbk.jpg', alt: 'Startseite von KaboomKartell', breite: 800, hoehe: 503 },
    link: { href: 'https://github.com/FlorianWinkler1248/kaboomkartell', label: 'Code ansehen' },
    akzent: 'green',
  },
  {
    titel: 'GraficBend',
    zeitraum: 'seit 03/2026',
    rahmen: 'eigenes Produkt, bald Open Source',
    text:
      'Ein Grafik-Editor für Sticker, Pixel-Art und Spielgrafik, den Mensch und KI gemeinsam bedienen. Läuft als Mac-Programm und erscheint demnächst unter freier Lizenz.',
    bild: {
      src: '/images/projekte/graficbend.jpg',
      alt: 'Das Ashcrown-Logo im Editor von GraficBend, rechts die Ebenen',
      breite: 800,
      hoehe: 500,
    },
    akzent: 'red',
  },
  {
    titel: 'Ashcrown',
    zeitraum: 'seit 09/2026',
    rahmen: 'eigenes Spiel',
    text:
      'Ein Echtzeit-Strategiespiel mit acht Völkern. Das Ziel: dass es auf einer LAN-Party gespielt wird, die nicht ich organisiert habe. In fünf Wochen von der ersten Zeile zu einem spielbaren Spiel mit Kampagne und Computer-Gegnern.',
    bild: { src: '/images/projekte/ashcrown.jpg', alt: 'Burg der Menschen zu Beginn eines Gefechts in Ashcrown', breite: 800, hoehe: 500 },
    akzent: 'red',
  },
];

const textStil: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  lineHeight: 1.65,
  color: 'rgba(255,255,255,0.82)',
  margin: 0,
};

const metaStil: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.55)',
};

function ProjektKarte({ p }: { p: Projekt }) {
  const farbe = AKZENT_HEX[p.akzent];
  return (
    <article
      className="kbk-obsidian"
      style={{
        borderLeft: `3px solid ${farbe}`,
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gridColumn: p.breit ? '1 / -1' : undefined,
      }}
    >
      {p.bild && (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', lineHeight: 0 }}>
          <Image
            src={p.bild.src}
            alt={p.bild.alt}
            width={p.bild.breite}
            height={p.bild.hoehe}
            sizes={p.breit ? '(max-width: 1080px) 100vw, 1048px' : '(max-width: 760px) 100vw, 520px'}
            style={{ width: '100%', height: 'auto' }}
          />
        </div>
      )}
      <div style={{ padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: '#fff', margin: 0, letterSpacing: '0.04em' }}>
            {p.titel}
          </h3>
          <span style={{ ...metaStil, color: farbe }}>{p.zeitraum}</span>
        </div>
        <span style={metaStil}>{p.rahmen}</span>
        <p style={textStil}>{p.text}</p>
        {p.link && (
          <a
            href={p.link.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...metaStil, color: farbe, textDecoration: 'none', marginTop: 'auto', paddingTop: 6 }}
          >
            {p.link.label} &rarr;
          </a>
        )}
      </div>
    </article>
  );
}

function Raster({ projekte }: { projekte: Projekt[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))',
        gap: 18,
        alignItems: 'start',
        marginTop: 22,
        marginBottom: 56,
      }}
    >
      {projekte.map((p) => (
        <ProjektKarte key={p.titel} p={p} />
      ))}
    </div>
  );
}

export default function ProjektePage() {
  return (
    <section style={{ padding: '40px 16px 80px', maxWidth: 1080, marginLeft: 'auto', marginRight: 'auto' }}>
      <header style={{ marginBottom: 48 }}>
        <span style={{ ...metaStil, color: '#3FCF4A' }}>Florian Winkler, genannt Flow</span>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(28px, 5vw, 48px)',
            lineHeight: 1.1,
            color: '#fff',
            margin: '12px 0 0',
          }}
        >
          Projekte
        </h1>
      </header>

      <SectionTitle sub="01" label="BERUF" title="IM AUFTRAG" accent="yellow" />
      <Raster projekte={BERUF} />

      <SectionTitle sub="02" label="EIGENE PRODUKTE" title="AUS EIGENEM ANTRIEB" accent="green" />
      <Raster projekte={EIGENE} />

      <p style={{ ...metaStil, textAlign: 'center', lineHeight: 1.8 }}>
        Weitere Projekte zeige ich gern im Gespräch.
      </p>
    </section>
  );
}
