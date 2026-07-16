import Hero from '@/components/kbk/Hero';
import Marquee from '@/components/kbk/Marquee';
import WolfpackSection from '@/components/kbk/sections/WolfpackSection';
import HumanArtistsSection from '@/components/kbk/sections/HumanArtistsSection';
import DropsSection from '@/components/kbk/sections/DropsSection';
import RecentReleasesSection from '@/components/kbk/sections/RecentReleasesSection';
import SocialsSection from '@/components/kbk/sections/SocialsSection';
import BoomySection from '@/components/kbk/sections/BoomySection';
import CrowdControlSection from '@/components/kbk/sections/CrowdControlSection';
import DanceCrowd from '@/components/kbk/DanceCrowd';

/**
 * Homepage — KABOOMKARTELL.
 *
 * Aufbau:
 *  - Hero
 *  - Marquee
 *  - Wolfpack
 *  - Drops (upcoming) + Recent Releases (last released) — gemeinsam in einer
 *    Reihe „was kommt / was war zuletzt".
 *  - Socials
 *
 * Player läuft global im MiniPlayer am unteren Bildschirmrand.
 */

// Homepage ist dynamisch (wegen Sections die DB-Daten ziehen + Timetable-Time).
export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <>
      <Hero />

      <Marquee />

      {/* Crowd Control: voting-gesteuertes Radio (ADR-026). Blendet sich selbst aus,
          wenn der Channel off-air ist oder der Kill-Switch aus ist. */}
      <CrowdControlSection />

      <BoomySection />

      {/* Boomys Publikum — die EINZIGE Crowd der Seite, direkt unter seinem
          Bereich (Flow: "richtig nice, so lassen"). Reihen hintereinander,
          hinten klein+dunkel, Front-Row = die vier Originale, keine Figur
          doppelt. Design-Regel 12.07.: Sprites nur als neutrale Gruppen in
          echten Leerstellen — keine Rahmen/Linien, kein Sitzen/Klettern/
          Laufen auf UI-Elementen. Flanken leben IN der CrowdControlSection
          (Workflow kbk-dance-sprites). */}
      <div style={{ maxWidth: 760, margin: '18px auto 6px', padding: '0 16px' }}>
        <DanceCrowd
          rows={[
            ['wisp', 'monk', 'shard', 'spider', 'yeti', 'octo'],
            ['tvhead', 'boombox', 'crab', 'jelly', 'slime'],
            ['shroom', 'imp', 'robo-bass', 'antling', 'cat'],
            ['robo-chrome', 'ai-girl-nova', 'robo-servo', 'ai-girl-pixel'],
          ]}
          frontSize={72}
        />
      </div>

      <WolfpackSection />

      {/* HUMAN ARTISTS WANTED (ADR-039): Artist-Funnel-Ausschreibung zwischen
          Wolfpack und Recent Releases — KBK ist kein AI-Showcase. */}
      <HumanArtistsSection />

      <RecentReleasesSection />
      <DropsSection />
      <SocialsSection />
    </>
  );
}
