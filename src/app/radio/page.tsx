import { permanentRedirect } from 'next/navigation';

/**
 * /radio — Legacy-Route, redirected auf /schedule
 *
 * Die alte Full-Screen-Player-Page hatten wir am 25.04.2026 entfernt:
 *  - Mini-Player läuft jetzt persistent in jedem Layout (Mute überall, kein Pause)
 *  - "Radio" als Begriff war verwirrend (was unterscheidet HOME von RADIO?)
 *  - Der Inhalt der alten Seite (Timetable + WeekGrid) lebt jetzt unter /schedule
 *
 * 308 Permanent Redirect signalisiert Suchmaschinen, dass die URL umgezogen ist.
 */
export default function RadioRedirect() {
  permanentRedirect('/schedule');
}
