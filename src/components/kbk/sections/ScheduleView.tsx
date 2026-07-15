'use client';

/**
 * ScheduleView — interaktive Sendeplan-Ansicht mit drei Zeit-Scopes.
 *
 * Ablösung der flachen 24h-Timeline (früher `DailyRotationTimeline`). Flows
 * Wunsch: minimalistischer erster Eindruck, verschiedene Zeit-Scopes, Hover-
 * UND Ausklapp-Infos (Touch-tauglich), mehr Informationsgehalt.
 *
 * Drei Scopes über ein Segmented Control:
 *   - JETZT   (Default): pro Sender eine fokussierte Karte — was läuft gerade
 *             (Genre-Block + echter Track via now-playing), Live-Countdown bis
 *             zum Wechsel, was als Nächstes kommt. Das ist der minimalistische
 *             erste Eindruck: nur das Wesentliche.
 *   - HEUTE:  die 24h-Timeline mit zwei Sender-Lanes; Blöcke sind klick-/tap-bar
 *             und klappen ein Detail-Panel auf (statt nativem title-Tooltip, der
 *             auf Touch nicht funktioniert). NOW-Linie live.
 *   - WOCHE:  Event-Fokus — die Tages-Rotation ist an allen 7 Tagen gleich, nur
 *             die Events wechseln. Sieben-Tage-Liste mit heute-Markierung.
 *
 * Reine Präsentations-Insel: Server (`schedule/page.tsx`) berechnet die Segmente
 * + Events und übergibt sie serialisierbar. Der laufende Track wird client-seitig
 * über /api/radio/now-playing nachgeladen (Bonus, mit sauberem Fallback).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { obsidianFrameVars } from '@/lib/obsidian-frame';

const PURPLE = '#9146FF';

export interface Seg {
  startMin: number;
  endMin: number;
  color: string;
  genre: string;
}
export interface ChannelData {
  key: 'phonk' | 'hardtek';
  label: string;
  accent: string;
  segments: Seg[];
}
export interface EventData {
  id: string;
  label: string;
  color: string;
  isStream: boolean;
  recurringDow: number | null;
  startMin: number;
  endMin: number;
  whenLabel: string;
}
export interface ScheduleViewProps {
  serverTimeMs: number;
  sameEveryDay: boolean;
  channels: ChannelData[];
  events: EventData[];
  /** Wochentags-Kürzel Mo..So (index 0 = Montag), lokalisiert vom Server. */
  weekdayLabels: string[];
  /** Heutiger Wochentag als Montag-basierter Index (0 = Montag). */
  todayIdx: number;
}

type Scope = 'now' | 'today' | 'week';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function hhmm(min: number): string {
  if (min >= 1440) return '24:00';
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}
/** Countdown-Sekunden → "1h 04m" (>1h) bzw. "04:37" (<1h). */
function fmtCountdown(totalSec: number): string {
  if (totalSec < 0) totalSec = 0;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${pad(m)}:${pad(s)}`;
}

interface NowTrack {
  title: string;
  artist: string | null;
}

export default function ScheduleView({
  serverTimeMs,
  sameEveryDay,
  channels,
  events,
  weekdayLabels,
  todayIdx,
}: ScheduleViewProps) {
  const t = useTranslations('schedule');
  const [scope, setScope] = useState<Scope>('now');

  // Live-Uhr: Server-Zeitbasis + verstrichene Client-Zeit → sekundengenauer NOW.
  const mountRef = useRef<number>(Date.now());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  // tick fließt in effectiveNow ein (bewusst gelesen, kein Dead-State)
  void tick;

  const effectiveNowMs = serverTimeMs + (Date.now() - mountRef.current);
  const nowDate = new Date(effectiveNowMs);
  const nowSecOfDay =
    nowDate.getUTCHours() * 3600 + nowDate.getUTCMinutes() * 60 + nowDate.getUTCSeconds();
  const nowMin = nowSecOfDay / 60;

  // Laufende Tracks je Channel (Bonus über now-playing; Fallback = Genre-Block).
  const [nowTracks, setNowTracks] = useState<Record<string, NowTrack | null>>({});
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result: Record<string, NowTrack | null> = {};
      await Promise.all(
        channels.map(async (ch) => {
          try {
            const res = await fetch(`/api/radio/now-playing?channel=${ch.key}`);
            const json = await res.json();
            const tr = json?.data?.track;
            if (tr && tr.title) {
              const artist =
                typeof tr.artist === 'string'
                  ? tr.artist
                  : tr.artist?.displayName || tr.artist?.username || null;
              result[ch.key] = { title: tr.title, artist };
            } else {
              result[ch.key] = null;
            }
          } catch {
            result[ch.key] = null;
          }
        })
      );
      if (!cancelled) setNowTracks(result);
    }
    load();
    // Alle 20s auffrischen — nah am Radio-Poll, ohne Last zu erzeugen.
    const id = window.setInterval(load, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [channels]);

  const scopes: { key: Scope; label: string }[] = [
    { key: 'now', label: t('scopeNow') },
    { key: 'today', label: t('scopeToday') },
    { key: 'week', label: t('scopeWeek') },
  ];

  return (
    <div>
      <style>{scheduleCss}</style>

      {/* Segmented Control — der einzige Steuer-Reflex, bewusst schlicht */}
      <div className="kbk-sched-tabs" role="tablist" aria-label={t('weekLabel')}>
        {scopes.map((s) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={scope === s.key}
            className={`kbk-sched-tab${scope === s.key ? ' is-active' : ''}`}
            onClick={() => setScope(s.key)}
          >
            {s.label}
          </button>
        ))}
        <span className="kbk-sched-utc">{t('legendAllTimesUtc')} · {hhmm(Math.floor(nowMin))}</span>
      </div>

      {scope === 'now' && (
        <NowScope
          channels={channels}
          nowMin={nowMin}
          nowSecOfDay={nowSecOfDay}
          nowTracks={nowTracks}
          t={t}
        />
      )}
      {scope === 'today' && <TodayScope channels={channels} nowMin={nowMin} t={t} />}
      {scope === 'week' && (
        <WeekScope
          events={events}
          weekdayLabels={weekdayLabels}
          todayIdx={todayIdx}
          sameEveryDay={sameEveryDay}
          t={t}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- NOW ---- */

function findCurrentSeg(segs: Seg[], nowMin: number): Seg | null {
  return segs.find((s) => nowMin >= s.startMin && nowMin < s.endMin) ?? null;
}
function findNextSeg(segs: Seg[], nowMin: number): Seg | null {
  const upcoming = segs
    .filter((s) => s.startMin > nowMin)
    .sort((a, b) => a.startMin - b.startMin);
  // Wrap: nach Mitternacht der erste Block des Tages
  if (upcoming.length) return upcoming[0];
  return segs.slice().sort((a, b) => a.startMin - b.startMin)[0] ?? null;
}

function NowScope({
  channels,
  nowMin,
  nowSecOfDay,
  nowTracks,
  t,
}: {
  channels: ChannelData[];
  nowMin: number;
  nowSecOfDay: number;
  nowTracks: Record<string, NowTrack | null>;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="kbk-sched-now">
      {channels.map((ch) => {
        const cur = findCurrentSeg(ch.segments, nowMin);
        const next = findNextSeg(ch.segments, nowMin);
        const track = nowTracks[ch.key];

        if (!cur) {
          // Sender pausiert (z.B. Hardtek 2h an / 2h aus)
          const backAtMin = next ? next.startMin : null;
          const secToBack =
            backAtMin != null ? Math.round((backAtMin * 60 - nowSecOfDay + 86400) % 86400) : 0;
          return (
            <div
              key={ch.key}
              className="kbk-obsidian kbk-sched-now-card is-off"
              style={obsidianFrameVars('#33363A')}
            >
              <div className="kbk-sched-now-head">
                <span className="kbk-sched-ch" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {ch.label}
                </span>
                <span className="kbk-sched-off-dot" />
              </div>
              <div className="kbk-sched-now-genre" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {t('channelOffAir')}
              </div>
              {backAtMin != null && (
                <div className="kbk-sched-now-meta">
                  {t('backAt', { time: `${hhmm(backAtMin)} UTC` })} ·{' '}
                  <span className="kbk-sched-count">{fmtCountdown(secToBack)}</span>
                </div>
              )}
            </div>
          );
        }

        const secLeft = Math.round(cur.endMin * 60 - nowSecOfDay);
        return (
          <div
            key={ch.key}
            className="kbk-obsidian framed kbk-sched-now-card"
            style={obsidianFrameVars(cur.color)}
          >
            <div className="kbk-sched-now-head">
              <span className="kbk-sched-ch" style={{ color: ch.accent }}>
                {ch.label}
              </span>
              <span className="kbk-sched-live">
                <span className="kbk-sched-live-dot" />
                {t('onAir')}
              </span>
            </div>

            <div className="kbk-sched-now-genre" style={{ color: cur.color, textShadow: `0 0 16px ${cur.color}66` }}>
              {cur.genre}
            </div>

            {track && (
              <div className="kbk-sched-now-track">
                <span className="kbk-sched-now-track-label">{t('nowPlaying')}</span>
                <span className="kbk-sched-now-track-title">
                  {track.title}
                  {track.artist ? <span className="kbk-sched-now-track-artist"> · {track.artist}</span> : null}
                </span>
              </div>
            )}

            <div className="kbk-sched-now-meta">
              {hhmm(cur.startMin)}–{hhmm(cur.endMin)} UTC ·{' '}
              <span className="kbk-sched-count" style={{ color: cur.color }}>
                {t('timeLeft', { time: fmtCountdown(secLeft) })}
              </span>
            </div>

            {/* Fortschritt im aktuellen Block */}
            <div className="kbk-sched-prog">
              <div
                className="kbk-sched-prog-fill"
                style={{
                  width: `${Math.min(100, Math.max(0, ((nowMin - cur.startMin) / (cur.endMin - cur.startMin)) * 100))}%`,
                  background: cur.color,
                }}
              />
            </div>

            {next && (
              <div className="kbk-sched-next">
                <span className="kbk-sched-next-label">{t('upNext')}</span>
                <span className="kbk-sched-next-dot" style={{ background: next.color }} />
                <span className="kbk-sched-next-genre">{next.genre}</span>
                <span className="kbk-sched-next-time">{hhmm(next.startMin)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- TODAY ---- */

function TodayScope({
  channels,
  nowMin,
  t,
}: {
  channels: ChannelData[];
  nowMin: number;
  t: ReturnType<typeof useTranslations>;
}) {
  // Ausgewählter Block (Ausklapp-Detail) — key "chIdx-segIdx"
  const [selected, setSelected] = useState<string | null>(null);
  const nowPct = (nowMin / 1440) * 100;
  const ticks = [0, 4, 8, 12, 16, 20, 24];

  const sel = useMemo(() => {
    if (!selected) return null;
    const [ci, si] = selected.split('-').map(Number);
    const ch = channels[ci];
    const seg = ch?.segments[si];
    if (!ch || !seg) return null;
    const live = nowMin >= seg.startMin && nowMin < seg.endMin;
    return { ch, seg, live };
  }, [selected, channels, nowMin]);

  return (
    <div
      className="kbk-obsidian framed kbk-sched-today"
      style={obsidianFrameVars('#3FCF4A')}
    >
      <div className="kbk-sched-today-hint">{t('tapHint')}</div>

      <div className="kbk-sched-grid">
        {/* Achse */}
        <div />
        <div className="kbk-sched-axis">
          {ticks.map((h, i) => (
            <span
              key={h}
              className={`kbk-sched-tick${i % 2 === 1 ? ' odd' : ''}`}
              style={{
                left: `${(h / 24) * 100}%`,
                transform: h === 24 ? 'translateX(-100%)' : h === 0 ? 'none' : 'translateX(-50%)',
              }}
            >
              {pad(h)}:00
            </span>
          ))}
        </div>

        {channels.map((ch, ci) => (
          <TodayLane
            key={ch.key}
            ch={ch}
            ci={ci}
            nowMin={nowMin}
            nowPct={nowPct}
            selected={selected}
            onSelect={setSelected}
            onAirLabel={t('onAir')}
          />
        ))}
      </div>

      {/* Ausklapp-Detail (Touch + Desktop) */}
      {sel && (
        <div className="kbk-sched-detail" style={{ borderColor: `${sel.seg.color}66` }}>
          <button
            className="kbk-sched-detail-close"
            aria-label="close"
            onClick={() => setSelected(null)}
          >
            ×
          </button>
          <div className="kbk-sched-detail-genre" style={{ color: sel.seg.color }}>
            {sel.seg.genre}
            {sel.live && (
              <span className="kbk-sched-live" style={{ marginLeft: 10 }}>
                <span className="kbk-sched-live-dot" />
                {t('onAir')}
              </span>
            )}
          </div>
          <div className="kbk-sched-detail-grid">
            <Detail label={t('detailChannel')} value={sel.ch.label} color={sel.ch.accent} />
            <Detail label={t('detailWindow')} value={`${hhmm(sel.seg.startMin)}–${hhmm(sel.seg.endMin)} UTC`} />
            <Detail
              label={t('detailLength')}
              value={`${Math.round((sel.seg.endMin - sel.seg.startMin) / 60 * 10) / 10}h`}
            />
          </div>
        </div>
      )}

      {/* Legende */}
      <div className="kbk-sched-legend">
        <span className="kbk-sched-legend-now">
          <span className="kbk-sched-legend-nowbar" />
          {t('now')} · {hhmm(Math.floor(nowMin))} UTC
        </span>
        <LegendItem color="#E63B2E" label="Phonk" />
        <LegendItem color="#3FCF4A" label="Brazilian Phonk" />
        <LegendItem color="#F5D02E" label="Hardtek" />
      </div>
    </div>
  );
}

function TodayLane({
  ch,
  ci,
  nowMin,
  nowPct,
  selected,
  onSelect,
  onAirLabel,
}: {
  ch: ChannelData;
  ci: number;
  nowMin: number;
  nowPct: number;
  selected: string | null;
  onSelect: (k: string | null) => void;
  onAirLabel: string;
}) {
  return (
    <>
      <div className="kbk-sched-lane-label" style={{ color: ch.accent, textShadow: `0 0 10px ${ch.accent}66` }}>
        {ch.label}
      </div>
      <div className="kbk-sched-lane">
        {ch.segments.map((s, si) => {
          const live = nowMin >= s.startMin && nowMin < s.endMin;
          const key = `${ci}-${si}`;
          const isSel = selected === key;
          const leftPct = (s.startMin / 1440) * 100;
          const widthPct = ((s.endMin - s.startMin) / 1440) * 100;
          return (
            <button
              key={key}
              className={`kbk-sched-seg${isSel ? ' is-sel' : ''}`}
              onClick={() => onSelect(isSel ? null : key)}
              style={{
                left: `${leftPct}%`,
                width: `calc(${widthPct}% - 2px)`,
                background: live ? `${s.color}55` : `${s.color}22`,
                borderLeft: `2px solid ${s.color}`,
                boxShadow: isSel
                  ? `inset 0 0 0 1px ${s.color}, 0 0 14px ${s.color}66`
                  : live
                    ? `inset 0 0 12px ${s.color}55`
                    : 'none',
              }}
              title={`${hhmm(s.startMin)}–${hhmm(s.endMin)} · ${s.genre}`}
            >
              {live && <span className="kbk-sched-onair">{onAirLabel}</span>}
            </button>
          );
        })}
        <div
          aria-hidden="true"
          className="kbk-sched-nowline"
          style={{ left: `${nowPct}%` }}
        />
      </div>
    </>
  );
}

function Detail({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="kbk-sched-detail-cell">
      <div className="kbk-sched-detail-label">{label}</div>
      <div className="kbk-sched-detail-value" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="kbk-sched-legend-item">
      <span className="kbk-sched-legend-sq" style={{ background: color }} />
      {label}
    </span>
  );
}

/* --------------------------------------------------------------- WEEK ---- */

function WeekScope({
  events,
  weekdayLabels,
  todayIdx,
  sameEveryDay,
  t,
}: {
  events: EventData[];
  weekdayLabels: string[];
  todayIdx: number;
  sameEveryDay: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  // Wiederkehrende Events nach Montag-basiertem Wochentag gruppieren.
  const byDay = useMemo(() => {
    const map = new Map<number, EventData[]>();
    for (const e of events) {
      if (e.recurringDow == null) continue;
      // recurringDow: 0=So..6=Sa → Montag-basiert: (dow+6)%7
      const idx = (e.recurringDow + 6) % 7;
      const arr = map.get(idx) ?? [];
      arr.push(e);
      map.set(idx, arr);
    }
    return map;
  }, [events]);

  // Einmalige Events (kein Wochentags-Muster) gehören nicht in die 7-Tage-
  // Rotation, würden sonst aber komplett verschwinden — sie kommen als
  // datierte „Besondere Events"-Liste unter das Grid (whenLabel = Datum+Zeit).
  const oneTime = useMemo(() => events.filter((e) => e.recurringDow == null), [events]);

  return (
    <div className="kbk-sched-week-wrap">
      {/* Kontext für die Wochen-Ansicht: erklärt, dass die Sender 24/7 laufen
          und die Events das Unterscheidungsmerkmal sind. Zwei Formulierungen,
          je nachdem ob die Rotation täglich identisch ist oder pro Wochentag
          leicht variiert (Wochentags-Rotation, ADR-034). */}
      <div
        className="kbk-obsidian kbk-sched-week-note"
        style={obsidianFrameVars('#3FCF4A')}
      >
        {sameEveryDay ? t('weekRotationNote') : t('weekRotationVaries')}
      </div>
      <div className="kbk-sched-week">
        {weekdayLabels.map((label, idx) => {
          const dayEvents = byDay.get(idx) ?? [];
          const isToday = idx === todayIdx;
          return (
            <div
              key={idx}
              className={`kbk-obsidian kbk-sched-week-day${isToday ? ' is-today' : ''}${dayEvents.length ? ' has-event' : ''}`}
              style={obsidianFrameVars(dayEvents.some((e) => e.isStream) ? PURPLE : '#242628')}
            >
              <div className="kbk-sched-week-dow">
                {label}
                {isToday && <span className="kbk-sched-week-today">{t('today')}</span>}
              </div>
              {dayEvents.length === 0 ? (
                <div className="kbk-sched-week-rot">{t('rotationOnly')}</div>
              ) : (
                dayEvents.map((e) => (
                  <div key={e.id} className="kbk-sched-week-event">
                    {e.isStream && <span className="kbk-sched-week-ev-dot" />}
                    <span className="kbk-sched-week-ev-time" style={{ color: e.color }}>
                      {hhmm(e.startMin)}–{hhmm(e.endMin)}
                    </span>
                    <span className="kbk-sched-week-ev-name">{e.label}</span>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>

      {oneTime.length > 0 && (
        <div className="kbk-sched-special">
          <div className="kbk-sched-special-label">{t('specialEvents')}</div>
          <div className="kbk-sched-special-list">
            {oneTime.map((e) => (
              <div
                key={e.id}
                className="kbk-obsidian framed kbk-sched-special-chip"
                style={obsidianFrameVars(e.color)}
              >
                {e.isStream && <span className="kbk-sched-week-ev-dot" />}
                <span className="kbk-sched-special-when" style={{ color: e.color }}>
                  {e.whenLabel}
                </span>
                <span className="kbk-sched-special-name">{e.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- CSS ---- */

const scheduleCss = `
.kbk-sched-tabs {
  display: flex; align-items: center; gap: 6px; margin: 20px 0 22px;
  flex-wrap: wrap;
}
.kbk-sched-tab {
  font-family: var(--font-display); font-size: 13px; letter-spacing: 0.08em;
  color: rgba(255,255,255,0.55); background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 10px;
  padding: 9px 18px; cursor: pointer; transition: all 0.18s ease;
}
.kbk-sched-tab:hover { color: #fff; border-color: rgba(63,207,74,0.4); }
.kbk-sched-tab.is-active {
  color: #0A0B0C; background: var(--rasta-green); border-color: var(--rasta-green);
  box-shadow: 0 0 18px rgba(63,207,74,0.4);
}
.kbk-sched-utc {
  margin-left: auto; font-family: var(--font-mono); font-size: 10px;
  letter-spacing: 0.14em; color: rgba(255,255,255,0.4);
}

/* NOW */
.kbk-sched-now { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.kbk-sched-now-card { border-radius: 14px; padding: 22px 24px; min-height: 160px; }
.kbk-sched-now-card.is-off { opacity: 0.72; }
.kbk-sched-now-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.kbk-sched-ch { font-family: var(--font-display); font-size: 15px; font-weight: 900; letter-spacing: 0.14em; }
.kbk-sched-live { display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: #fff; }
.kbk-sched-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #FF3B6B; box-shadow: 0 0 8px #FF3B6B; animation: kk-pulse 1s infinite; }
.kbk-sched-off-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.25); }
.kbk-sched-now-genre { font-family: var(--font-display); font-size: 30px; line-height: 1.05; letter-spacing: 0.01em; margin-bottom: 12px; }
.kbk-sched-now-track { display: flex; flex-direction: column; gap: 2px; margin-bottom: 12px; }
.kbk-sched-now-track-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.16em; color: rgba(255,255,255,0.4); text-transform: uppercase; }
.kbk-sched-now-track-title { font-family: var(--font-body); font-size: 14px; font-weight: 600; color: #fff; }
.kbk-sched-now-track-artist { color: rgba(255,255,255,0.55); font-weight: 400; }
.kbk-sched-now-meta { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em; color: rgba(255,255,255,0.55); margin-bottom: 12px; }
.kbk-sched-count { font-weight: 700; }
.kbk-sched-prog { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; margin-bottom: 14px; }
.kbk-sched-prog-fill { height: 100%; border-radius: 2px; transition: width 0.9s linear; }
.kbk-sched-next { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.08); }
.kbk-sched-next-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.16em; color: rgba(255,255,255,0.4); text-transform: uppercase; }
.kbk-sched-next-dot { width: 8px; height: 8px; border-radius: 2px; }
.kbk-sched-next-genre { font-family: var(--font-body); font-size: 13px; font-weight: 600; color: #fff; }
.kbk-sched-next-time { margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: rgba(255,255,255,0.5); }

/* TODAY */
.kbk-sched-today { border-radius: 14px; padding: 22px; }
.kbk-sched-today-hint { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; color: rgba(255,255,255,0.4); text-align: right; margin-bottom: 14px; text-transform: uppercase; }
.kbk-sched-grid { display: grid; grid-template-columns: 96px 1fr; gap: 10px; align-items: center; }
.kbk-sched-axis { position: relative; height: 14px; }
.kbk-sched-tick { position: absolute; font-family: var(--font-mono); font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 0.05em; white-space: nowrap; }
.kbk-sched-lane-label { font-family: var(--font-display); font-size: 12px; font-weight: 900; letter-spacing: 0.12em; }
.kbk-sched-lane { position: relative; height: 42px; background: rgba(255,255,255,0.03); border-radius: 4px; }
.kbk-sched-seg { position: absolute; top: 0; bottom: 0; padding: 0; border: none; border-radius: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; overflow: hidden; transition: box-shadow 0.15s ease, transform 0.15s ease; }
.kbk-sched-seg:hover { transform: translateY(-1px); z-index: 3; }
.kbk-sched-seg.is-sel { z-index: 4; }
.kbk-sched-onair { font-family: var(--font-mono); font-size: 8px; font-weight: 900; letter-spacing: 0.12em; color: #0A0B0C; background: #fff; padding: 1px 4px; animation: kk-pulse 1s infinite; white-space: nowrap; }
.kbk-sched-nowline { position: absolute; top: -4px; bottom: -4px; width: 2px; background: #fff; box-shadow: 0 0 8px rgba(255,255,255,0.8); z-index: 2; pointer-events: none; }
.kbk-sched-detail { position: relative; margin-top: 16px; padding: 16px 18px; border: 1px solid; border-radius: 10px; background: rgba(0,0,0,0.25); animation: kk-fadein 0.25s ease; }
.kbk-sched-detail-close { position: absolute; top: 10px; right: 12px; background: none; border: none; color: rgba(255,255,255,0.5); font-size: 20px; line-height: 1; cursor: pointer; }
.kbk-sched-detail-close:hover { color: #fff; }
.kbk-sched-detail-genre { font-family: var(--font-display); font-size: 20px; letter-spacing: 0.02em; margin-bottom: 12px; display: flex; align-items: center; }
.kbk-sched-detail-grid { display: flex; flex-wrap: wrap; gap: 22px; }
.kbk-sched-detail-cell { display: flex; flex-direction: column; gap: 3px; }
.kbk-sched-detail-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.16em; color: rgba(255,255,255,0.4); text-transform: uppercase; }
.kbk-sched-detail-value { font-family: var(--font-body); font-size: 14px; font-weight: 600; color: #fff; }
.kbk-sched-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08); font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; color: rgba(255,255,255,0.55); }
.kbk-sched-legend-now { color: #fff; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
.kbk-sched-legend-nowbar { width: 8px; height: 8px; background: #fff; }
.kbk-sched-legend-item { display: inline-flex; align-items: center; gap: 6px; }
.kbk-sched-legend-sq { width: 9px; height: 9px; border-radius: 2px; }

/* WEEK */
.kbk-sched-week-wrap { display: flex; flex-direction: column; gap: 14px; }
.kbk-sched-week-note { border-radius: 12px; padding: 14px 18px; font-family: var(--font-body); font-size: 13px; color: rgba(255,255,255,0.75); border-left: 3px solid var(--rasta-green); }
.kbk-sched-week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; }
.kbk-sched-week-day { border-radius: 10px; padding: 14px 12px; min-height: 96px; display: flex; flex-direction: column; gap: 8px; }
.kbk-sched-week-day.is-today { box-shadow: inset 0 0 0 1px rgba(63,207,74,0.5); }
.kbk-sched-week-dow { font-family: var(--font-display); font-size: 13px; font-weight: 900; letter-spacing: 0.1em; color: #fff; display: flex; flex-direction: column; gap: 4px; }
.kbk-sched-week-today { font-family: var(--font-mono); font-size: 8px; letter-spacing: 0.12em; color: var(--rasta-green); }
.kbk-sched-week-rot { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; color: rgba(255,255,255,0.3); margin-top: auto; }
.kbk-sched-week-event { display: flex; flex-direction: column; gap: 2px; }
.kbk-sched-week-ev-dot { width: 7px; height: 7px; border-radius: 50%; background: #FF3B6B; box-shadow: 0 0 6px #FF3B6B; animation: kk-pulse 1.2s infinite; }
.kbk-sched-week-ev-time { font-family: var(--font-mono); font-size: 10px; font-weight: 700; }
.kbk-sched-week-ev-name { font-family: var(--font-body); font-size: 11px; font-weight: 600; color: #fff; line-height: 1.2; }
.kbk-sched-special { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
.kbk-sched-special-label { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.16em; color: rgba(255,255,255,0.45); text-transform: uppercase; }
.kbk-sched-special-list { display: flex; flex-wrap: wrap; gap: 10px; }
.kbk-sched-special-chip { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; }
.kbk-sched-special-when { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; }
.kbk-sched-special-name { font-family: var(--font-display); font-size: 12px; font-weight: 900; letter-spacing: 0.04em; color: #fff; text-transform: uppercase; }

/* Tablet */
@media (max-width: 1023px) {
  .kbk-sched-now-genre { font-size: 26px; }
  .kbk-sched-week { grid-template-columns: repeat(7, 1fr); gap: 6px; }
  .kbk-sched-week-day { padding: 10px 8px; min-height: 88px; }
  .kbk-sched-week-dow { font-size: 11px; }
}

/* Mobile */
@media (max-width: 767px) {
  .kbk-sched-now { grid-template-columns: 1fr; }
  .kbk-sched-now-genre { font-size: 28px; }
  .kbk-sched-utc { width: 100%; margin-left: 0; order: 3; }
  .kbk-sched-grid { grid-template-columns: 46px 1fr; gap: 7px; }
  .kbk-sched-lane { height: 34px; }
  .kbk-sched-lane-label { font-size: 10px; }
  .kbk-sched-tick.odd { display: none; }
  .kbk-sched-week { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .kbk-sched-week-day { min-height: auto; }
}
`;
