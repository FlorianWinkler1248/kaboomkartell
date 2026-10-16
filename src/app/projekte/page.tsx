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
  bild?: { src: string; alt: string };
  link?: { href: string; label: string };
  akzent: Akzent;
}

const AKZENT_HEX: Record<Akzent, string> = {
  green: '#3FCF4A',
  red: '#E63B2E',
  yellow: '#F5D02E',
  purple: '#9F6BFF',
};

const EIGENE: Projekt[] = [
  {
    titel: 'KaboomKartell',
    zeitraum: 'seit 10/2024',
    rahmen: 'eigenes Produkt, live',
    text:
      'Eine digitale Hausparty: ein Radio, das rund um die Uhr läuft und bei dem die Community bestimmt, was als Nächstes spielt. Die Idee begleitet mich seit dem ersten Tag der Umschulung. Angefangen zu dritt, am Ende allein weitergetragen; nach eineinhalb Jahren Konzept online, seit Juli 2026 öffentlich. Mit Twitch-Anbindung und Boomy, einer KI, die durch die Plattform führt.',
    bild: { src: '/images/projekte/kbk.jpg', alt: 'Startseite von KaboomKartell' },
    link: { href: 'https://github.com/FlorianWinkler1248/kaboomkartell', label: 'Code ansehen' },
    akzent: 'green',
  },
  {
    titel: 'Ashcrown',
    zeitraum: 'seit 09/2026',
    rahmen: 'eigenes Spiel',
    text:
      'Ein Echtzeit-Strategiespiel mit acht Völkern. Das Ziel: dass es auf einer LAN-Party gespielt wird, die nicht ich organisiert habe. In fünf Wochen von der ersten Zeile zu einem spielbaren Spiel mit Kampagne und Computer-Gegnern.',
    bild: { src: '/images/projekte/ashcrown.jpg', alt: 'Burg der Menschen zu Beginn eines Gefechts in Ashcrown' },
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
      }}
    >
      {p.bild && (
        <div style={{ position: 'relative', aspectRatio: '16 / 10', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Image src={p.bild.src} alt={p.bild.alt} fill sizes="(max-width: 760px) 100vw, 520px" style={{ objectFit: 'cover', objectPosition: 'top' }} />
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
            margin: '12px 0 18px',
          }}
        >
          Ich baue KI-Software, die Teams im Alltag wirklich benutzen.
        </h1>
        <p style={{ ...textStil, fontSize: 17, maxWidth: 720 }}>
          Fachinformatiker für Anwendungsentwicklung (IHK). Ich komme vom Telefon: Jahre im Callcenter haben mir gezeigt,
          wo Menschen an Software verzweifeln. Seit 2024 baue ich Antworten darauf, im Beruf direkt mit der
          Geschäftsführung und daneben in eigenen Produkten, die öffentlich laufen.
        </p>
        <p style={{ ...metaStil, marginTop: 18 }}>
          Pirna bei Dresden &middot; verfügbar ab sofort &middot;{' '}
          <a href="mailto:4flow@kaboomkartell.com" style={{ color: '#3FCF4A', textDecoration: 'none' }}>
            4flow@kaboomkartell.com
          </a>{' '}
          &middot;{' '}
          <a href="https://github.com/FlorianWinkler1248" target="_blank" rel="noopener noreferrer" style={{ color: '#3FCF4A', textDecoration: 'none' }}>
            GitHub
          </a>
        </p>
      </header>

      <SectionTitle sub="01" label="EIGENE PRODUKTE" title="AUS EIGENEM ANTRIEB" accent="green" />
      <Raster projekte={EIGENE} />

      <p style={{ ...metaStil, textAlign: 'center', lineHeight: 1.8 }}>
        Weitere Projekte, auch aus dem Beruf, zeige ich gern im Gespräch.
      </p>
    </section>
  );
}
