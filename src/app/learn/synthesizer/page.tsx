'use client';

/**
 * Synthesizer Learn Page — Interaktives Tutorial
 *
 * Führt den User Schritt für Schritt durch die Grundlagen
 * der Klangsynthese: Wellenformen, Filter, Oszillatoren und ADSR.
 * Fokus liegt auf Bass-Sound-Design mit Sägezahn-Wellen.
 *
 * Jeder Schritt enthält Erklärungstext + interaktive Controls
 * mit Echtzeit-Audio (Web Audio API) und visueller Darstellung (Canvas).
 */

import DanceSprite from '@/components/kbk/DanceSprite';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { SynthEngine } from '@/lib/synth/SynthEngine';
import SynthLayout from '@/components/synth/SynthLayout';
import WaveformDisplay from '@/components/synth/WaveformDisplay';
import SynthKnob from '@/components/synth/SynthKnob';
import WaveformSelector from '@/components/synth/WaveformSelector';
import TutorialStep from '@/components/synth/TutorialStep';
import { obsidianFrameVars } from '@/lib/obsidian-frame';

/** Gesamtanzahl der Tutorial-Schritte */
const TOTAL_STEPS = 6;

/**
 * ADSR-Hüllkurve als SVG zeichnen (für visuelles Feedback in Schritt 6).
 * Zeigt Attack, Decay, Sustain und Release als Linien-Diagramm.
 */
function ADSRDisplay({
  attack,
  decay,
  sustain,
  release,
}: {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}) {
  const width = 280;
  const height = 80;
  const padding = 8;
  const drawW = width - padding * 2;
  const drawH = height - padding * 2;

  /* Zeitabschnitte normalisieren (jeder bekommt anteilig Platz) */
  const totalTime = attack + decay + 0.3 + release;
  const aW = (attack / totalTime) * drawW;
  const dW = (decay / totalTime) * drawW;
  const sW = (0.3 / totalTime) * drawW;
  const rW = (release / totalTime) * drawW;

  /* Koordinaten der ADSR-Punkte */
  const points = [
    { x: padding, y: padding + drawH },                              // Start (0)
    { x: padding + aW, y: padding },                                  // Attack-Peak
    { x: padding + aW + dW, y: padding + drawH * (1 - sustain) },    // Decay → Sustain
    { x: padding + aW + dW + sW, y: padding + drawH * (1 - sustain) }, // Sustain-Ende
    { x: padding + aW + dW + sW + rW, y: padding + drawH },          // Release → 0
  ];

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  /* Gefüllte Fläche unter der Kurve */
  const fillD = pathD + ` L ${points[4].x} ${padding + drawH} L ${padding} ${padding + drawH} Z`;

  return (
    <div className="kbk-obsidian" style={{ padding: 8, borderRadius: 10 }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Gefüllte Fläche */}
        <path d={fillD} fill="rgba(63,207,74,0.12)" />
        {/* Hüllkurven-Linie */}
        <path
          d={pathD}
          fill="none"
          stroke="#3FCF4A"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 4px rgba(63,207,74,0.5))' }}
        />
        {/* Punkte an den Übergängen */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#3FCF4A" />
        ))}
        {/* Beschriftungen */}
        <text x={padding + aW / 2} y={height - 1} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={8}>A</text>
        <text x={padding + aW + dW / 2} y={height - 1} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={8}>D</text>
        <text x={padding + aW + dW + sW / 2} y={height - 1} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={8}>S</text>
        <text x={padding + aW + dW + sW + rW / 2} y={height - 1} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize={8}>R</text>
      </svg>
    </div>
  );
}

/**
 * Filter-Typ-Auswahl (Lowpass, Highpass, Bandpass)
 */
function FilterTypeSelector({
  value,
  onChange,
}: {
  value: BiquadFilterType;
  onChange: (type: BiquadFilterType) => void;
}) {
  const t = useTranslations('synth');
  const types: { type: BiquadFilterType; label: string }[] = [
    { type: 'lowpass', label: t('filterTypes.lowpass') },
    { type: 'highpass', label: t('filterTypes.highpass') },
    { type: 'bandpass', label: t('filterTypes.bandpass') },
  ];

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {types.map(({ type, label }) => {
        const isActive = value === type;
        return (
          <button
            key={type}
            onClick={() => onChange(type)}
            className="kbk-obsidian polished"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'color 0.15s, box-shadow 0.15s',
              color: isActive ? '#3FCF4A' : 'rgba(255,255,255,0.55)',
              boxShadow: isActive
                ? 'inset 0 0 0 1px rgba(63,207,74,0.55), 0 0 12px rgba(63,207,74,0.18)'
                : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Play/Stop-Button im Synth-Stil
 */
function PlayButton({
  isPlaying,
  onClick,
  label,
}: {
  isPlaying: boolean;
  onClick: () => void;
  label?: string;
}) {
  const t = useTranslations('synth');
  const accentColor = isPlaying ? '#E63B2E' : '#3FCF4A';
  return (
    <button
      onClick={onClick}
      className={`kbk-obsidian framed${isPlaying ? ' kbk-frame-red' : ''}`}
      style={{
        ...obsidianFrameVars(accentColor),
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 22px',
        borderRadius: 10,
        fontFamily: 'var(--font-display)',
        fontSize: 13,
        fontWeight: 900,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: accentColor,
        cursor: 'pointer',
        animationDuration: isPlaying ? '1.0s' : '2.6s',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
        {isPlaying ? (
          <rect x="2" y="2" width="10" height="10" rx="1" />
        ) : (
          <path d="M3 1.5 L12 7 L3 12.5 Z" />
        )}
      </svg>
      {isPlaying ? t('common.stop') : (label ?? t('common.play'))}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   Hauptkomponente: Synthesizer Tutorial Page
   ═══════════════════════════════════════════════════════ */

export default function SynthesizerPage() {
  const t = useTranslations('synth');

  /** Synth-Engine Referenz (persistiert über Re-Renders) */
  const engineRef = useRef<SynthEngine | null>(null);

  /* ─── Schritt 1: Wellenformen ─── */
  const [waveform1, setWaveform1] = useState<OscillatorType>('sine');
  const [playing1, setPlaying1] = useState(false);

  /* ─── Schritt 2: Frequenz ─── */
  const [freq2, setFreq2] = useState(0.2); // Normalisiert (0-1), gemappt auf 20-2000Hz
  const [playing2, setPlaying2] = useState(false);

  /* ─── Schritt 3: Bass mit Sägezahn ─── */
  const [freq3, setFreq3] = useState(0.3);
  const [cutoff3, setCutoff3] = useState(0.5);
  const [reso3, setReso3] = useState(0.1);
  const [playing3, setPlaying3] = useState(false);

  /* ─── Schritt 4: Filtertypen ─── */
  const [filterType4, setFilterType4] = useState<BiquadFilterType>('lowpass');
  const [cutoff4, setCutoff4] = useState(0.5);
  const [reso4, setReso4] = useState(0.15);
  const [playing4, setPlaying4] = useState(false);

  /* ─── Schritt 5: Zwei Oszillatoren ─── */
  const [wave5a, setWave5a] = useState<OscillatorType>('sawtooth');
  const [wave5b, setWave5b] = useState<OscillatorType>('sawtooth');
  const [vol5b, setVol5b] = useState(0.5);
  const [detune5, setDetune5] = useState(0.15);
  const [playing5, setPlaying5] = useState(false);

  /* ─── Schritt 6: ADSR ─── */
  const [adsrA, setAdsrA] = useState(0.1);
  const [adsrD, setAdsrD] = useState(0.3);
  const [adsrS, setAdsrS] = useState(0.6);
  const [adsrR, setAdsrR] = useState(0.4);
  const [playing6, setPlaying6] = useState(false);

  /** Welcher Schritt gerade Audio abspielt (nur einer gleichzeitig) */
  const [activeStep, setActiveStep] = useState<number | null>(null);

  /**
   * Interaktions-Einladung: pulsierender „hör mal rein"-Glow auf dem ersten
   * Play-Button, bis der User zum ersten Mal Klang auslöst. Danach dauerhaft aus.
   */
  const [showHint, setShowHint] = useState(true);

  /**
   * Engine initialisieren (lazy, erst bei erster Interaktion).
   * Browser verlangen User-Gesture für AudioContext.
   */
  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new SynthEngine();
    }
    engineRef.current.init();
    /* Erste Klang-Interaktion → Einladungs-Glow verschwindet. */
    setShowHint(false);
    return engineRef.current;
  }, []);

  /**
   * Alle anderen Schritte stoppen bevor ein neuer startet.
   * Verhindert überlappende Audio-Ausgabe.
   */
  const stopAll = useCallback(() => {
    const engine = engineRef.current;
    if (engine) engine.stop();

    setPlaying1(false);
    setPlaying2(false);
    setPlaying3(false);
    setPlaying4(false);
    setPlaying5(false);
    setPlaying6(false);
    setActiveStep(null);
  }, []);

  /** Cleanup beim Unmount */
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  /**
   * Stabile Referenzen für Analyser-Daten-Funktionen.
   * Werden nur einmal erstellt und ändern sich nie — verhindert Re-Render-Loops.
   */
  const [analyserFn] = useState(() => () => {
    return engineRef.current ? engineRef.current.getAnalyserData() : new Uint8Array(0);
  });

  const [frequencyFn] = useState(() => () => {
    return engineRef.current ? engineRef.current.getFrequencyData() : new Uint8Array(0);
  });

  /* ═══════════════════════════════════════════════════════
     Frequenz-Mapping Hilfsfunktionen
     ═══════════════════════════════════════════════════════ */

  /** Normalisiert (0-1) → Frequenz in Hz (logarithmische Skalierung) */
  const mapFreq = (norm: number, min: number, max: number): number => {
    return Math.round(min * Math.pow(max / min, norm));
  };

  /** Normalisiert (0-1) → Filter-Cutoff (20-20000 Hz, logarithmisch) */
  const mapCutoff = (norm: number): number => {
    return Math.round(20 * Math.pow(1000, norm));
  };

  /** Normalisiert (0-1) → Resonanz (0.1-25) */
  const mapResonance = (norm: number): number => {
    return 0.1 + norm * 24.9;
  };

  /** Normalisiert (0-1) → Detune in Cents (0-50) */
  const mapDetune = (norm: number): number => {
    return Math.round(norm * 50);
  };

  /* ═══════════════════════════════════════════════════════
     Schritt-Handler
     ═══════════════════════════════════════════════════════ */

  /** Schritt 1: Wellenformen ausprobieren */
  const handlePlay1 = () => {
    if (playing1) {
      stopAll();
      return;
    }
    stopAll();
    const engine = getEngine();
    engine.setFilterCutoff(5000);
    engine.setFilterResonance(1);
    engine.setFilterType('lowpass');
    engine.play(waveform1, 220);
    setPlaying1(true);
    setActiveStep(1);
  };

  /** Wellenform in Schritt 1 wechseln (auch live) */
  const handleWaveform1Change = (type: OscillatorType) => {
    setWaveform1(type);
    if (playing1 && engineRef.current) {
      engineRef.current.setWaveform(type);
    }
  };

  /** Schritt 2: Frequenz ändern */
  const handlePlay2 = () => {
    if (playing2) {
      stopAll();
      return;
    }
    stopAll();
    const engine = getEngine();
    engine.setFilterCutoff(5000);
    engine.setFilterResonance(1);
    engine.setFilterType('lowpass');
    engine.play('sawtooth', mapFreq(freq2, 20, 2000));
    setPlaying2(true);
    setActiveStep(2);
  };

  const handleFreq2Change = (val: number) => {
    setFreq2(val);
    if (playing2 && engineRef.current) {
      engineRef.current.setFrequency(mapFreq(val, 20, 2000));
    }
  };

  /** Schritt 3: Bass mit Sägezahn + Filter */
  const handlePlay3 = () => {
    if (playing3) {
      stopAll();
      return;
    }
    stopAll();
    const engine = getEngine();
    engine.setFilterType('lowpass');
    engine.setFilterCutoff(mapCutoff(cutoff3));
    engine.setFilterResonance(mapResonance(reso3));
    engine.play('sawtooth', mapFreq(freq3, 30, 120));
    setPlaying3(true);
    setActiveStep(3);
  };

  const handleFreq3Change = (val: number) => {
    setFreq3(val);
    if (playing3 && engineRef.current) {
      engineRef.current.setFrequency(mapFreq(val, 30, 120));
    }
  };

  const handleCutoff3Change = (val: number) => {
    setCutoff3(val);
    if (playing3 && engineRef.current) {
      engineRef.current.setFilterCutoff(mapCutoff(val));
    }
  };

  const handleReso3Change = (val: number) => {
    setReso3(val);
    if (playing3 && engineRef.current) {
      engineRef.current.setFilterResonance(mapResonance(val));
    }
  };

  /** Schritt 4: Filter-Typen */
  const handlePlay4 = () => {
    if (playing4) {
      stopAll();
      return;
    }
    stopAll();
    const engine = getEngine();
    engine.setFilterType(filterType4);
    engine.setFilterCutoff(mapCutoff(cutoff4));
    engine.setFilterResonance(mapResonance(reso4));
    engine.play('sawtooth', 110);
    setPlaying4(true);
    setActiveStep(4);
  };

  const handleFilterType4Change = (type: BiquadFilterType) => {
    setFilterType4(type);
    if (playing4 && engineRef.current) {
      engineRef.current.setFilterType(type);
    }
  };

  const handleCutoff4Change = (val: number) => {
    setCutoff4(val);
    if (playing4 && engineRef.current) {
      engineRef.current.setFilterCutoff(mapCutoff(val));
    }
  };

  const handleReso4Change = (val: number) => {
    setReso4(val);
    if (playing4 && engineRef.current) {
      engineRef.current.setFilterResonance(mapResonance(val));
    }
  };

  /** Schritt 5: Zwei Oszillatoren */
  const handlePlay5 = () => {
    if (playing5) {
      stopAll();
      return;
    }
    stopAll();
    const engine = getEngine();
    engine.setFilterCutoff(5000);
    engine.setFilterResonance(1);
    engine.setFilterType('lowpass');
    engine.playDual(wave5a, wave5b, 110, mapDetune(detune5));
    engine.setOsc2Gain(vol5b);
    setPlaying5(true);
    setActiveStep(5);
  };

  const handleWave5aChange = (type: OscillatorType) => {
    setWave5a(type);
    if (playing5 && engineRef.current) {
      /* Oszillatoren müssen bei Waveform-Wechsel neu gestartet werden */
      engineRef.current.playDual(type, wave5b, 110, mapDetune(detune5));
      engineRef.current.setOsc2Gain(vol5b);
    }
  };

  const handleWave5bChange = (type: OscillatorType) => {
    setWave5b(type);
    if (playing5 && engineRef.current) {
      engineRef.current.playDual(wave5a, type, 110, mapDetune(detune5));
      engineRef.current.setOsc2Gain(vol5b);
    }
  };

  const handleVol5bChange = (val: number) => {
    setVol5b(val);
    if (playing5 && engineRef.current) {
      engineRef.current.setOsc2Gain(val);
    }
  };

  const handleDetune5Change = (val: number) => {
    setDetune5(val);
    if (playing5 && engineRef.current) {
      engineRef.current.setOsc2Detune(mapDetune(val));
    }
  };

  /** Schritt 6: ADSR Envelope */
  const handlePlay6 = () => {
    if (playing6) {
      stopAll();
      return;
    }
    stopAll();
    const engine = getEngine();
    engine.setFilterCutoff(3000);
    engine.setFilterResonance(1);
    engine.setFilterType('lowpass');
    engine.play('sawtooth', 110);

    /* ADSR normalisiert → Sekunden (0-2s Range) */
    const a = adsrA * 2;
    const d = adsrD * 2;
    const s = adsrS;
    const r = adsrR * 2;

    engine.triggerEnvelope(a, d, s, r);
    setPlaying6(true);
    setActiveStep(6);

    /* Automatisch stoppen nach der Hüllkurve */
    const totalMs = (a + d + 0.5 + r) * 1000 + 200;
    setTimeout(() => {
      setPlaying6(false);
      setActiveStep(null);
    }, totalMs);
  };

  /* ═══════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════ */

  return (
    <SynthLayout>
      {/* SHROOM + SLIME sitzen als Streber in der ersten Reihe des
          Synth-Kurses — neutral, ohne Rahmen (Design-Regel 12.07.). */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, margin: '0 0 10px' }}>
        <DanceSprite name="shroom" size={44} bobDelayMs={-400} />
        <DanceSprite name="slime" size={48} bobDelayMs={-1000} />
      </div>
      {/* ─── Schritt 1: Wellenformen kennenlernen ─── */}
      <TutorialStep
        title={t('waveforms.title')}
        description={t('waveforms.description')}
        stepNumber={1}
        totalSteps={TOTAL_STEPS}
      >
        <WaveformSelector
          value={waveform1}
          onChange={handleWaveform1Change}
          label={t('common.labelOscillator')}
        />

        <WaveformDisplay
          getDataFn={activeStep === 1 ? analyserFn : undefined}
          staticWaveform={waveform1}
          mode="waveform"
          height={180}
        />

        {/* „Greif mich an" — der erste Play-Button pulsiert dezent, bis der
            User zum ersten Mal Klang auslöst (showHint → false). Der Puls sitzt
            auf einem nicht-framed Wrapper, damit der kbk-aura-glow greift. */}
        <div
          className={showHint ? 'kbk-aura-glow' : undefined}
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 12,
            transition: 'box-shadow 0.3s ease',
          }}
        >
          <PlayButton
            isPlaying={playing1}
            onClick={handlePlay1}
            label={t('waveforms.listen')}
          />
        </div>
      </TutorialStep>

      {/* ─── Schritt 2: Frequenz / Tonhöhe ─── */}
      <TutorialStep
        title={t('frequency.title')}
        description={t('frequency.description')}
        stepNumber={2}
        totalSteps={TOTAL_STEPS}
      >
        <WaveformDisplay
          getDataFn={activeStep === 2 ? analyserFn : undefined}
          staticWaveform="sawtooth"
          mode="waveform"
          height={160}
        />

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
          <SynthKnob
            value={freq2}
            onChange={handleFreq2Change}
            label={t('common.labelFrequency')}
            min={20}
            max={2000}
            unit="Hz"
            size="lg"
          />

          {/* Referenz-Tonhoehen — Mono-Stil mit farbigen Markern */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              paddingBottom: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.6)',
              letterSpacing: '0.04em',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#3FCF4A',
                  boxShadow: '0 0 6px rgba(63,207,74,0.5)',
                }}
              />
              {t('frequency.refBass')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#F5D02E',
                  boxShadow: '0 0 6px rgba(245,208,46,0.5)',
                }}
              />
              {t('frequency.refTenor')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#E63B2E',
                  boxShadow: '0 0 6px rgba(230,59,46,0.5)',
                }}
              />
              {t('frequency.refConcert')}
            </div>
          </div>

          <PlayButton
            isPlaying={playing2}
            onClick={handlePlay2}
          />
        </div>
      </TutorialStep>

      {/* ─── Schritt 3: Bass aus Sägezahn bauen ─── */}
      <TutorialStep
        title={t('sawtooth.title')}
        description={t('sawtooth.description')}
        stepNumber={3}
        totalSteps={TOTAL_STEPS}
      >
        <WaveformDisplay
          getDataFn={activeStep === 3 ? analyserFn : undefined}
          staticWaveform="sawtooth"
          mode="waveform"
          height={180}
          color="#2D8B46"
        />

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <SynthKnob
            value={freq3}
            onChange={handleFreq3Change}
            label={t('common.labelFrequency')}
            min={30}
            max={120}
            unit="Hz"
            size="md"
          />

          <SynthKnob
            value={cutoff3}
            onChange={handleCutoff3Change}
            label={t('sawtooth.knobFilterCutoff')}
            min={20}
            max={20000}
            unit="Hz"
            size="lg"
            color="#3DA85A"
          />

          <SynthKnob
            value={reso3}
            onChange={handleReso3Change}
            label={t('common.labelResonance')}
            min={0}
            max={25}
            size="md"
            color="#F5C518"
          />

          <PlayButton
            isPlaying={playing3}
            onClick={handlePlay3}
            label={t('sawtooth.dropTheBass')}
          />
        </div>

        {/* Tipp-Box — Vulkanglas mit gelbem Frame */}
        <div
          className="kbk-obsidian framed kbk-frame-yellow"
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            fontSize: 12,
            color: 'rgba(245,208,46,0.90)',
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: '#F5D02E', letterSpacing: '0.08em' }}>{t('sawtooth.proTipLabel')}</strong> {t('sawtooth.proTip')}
        </div>
      </TutorialStep>

      {/* ─── Schritt 4: Filter-Typen ─── */}
      <TutorialStep
        title={t('filters.title')}
        description={t('filters.description')}
        stepNumber={4}
        totalSteps={TOTAL_STEPS}
      >
        <FilterTypeSelector
          value={filterType4}
          onChange={handleFilterType4Change}
        />

        {/* Zwei Displays: Waveform + Spektrum nebeneinander (auto-stack auf Mobile) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <span
              style={{
                display: 'block',
                color: 'rgba(255,255,255,0.45)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {t('displays.waveform')}
            </span>
            <WaveformDisplay
              getDataFn={activeStep === 4 ? analyserFn : undefined}
              staticWaveform="sawtooth"
              mode="waveform"
              height={140}
            />
          </div>
          <div>
            <span
              style={{
                display: 'block',
                color: 'rgba(255,255,255,0.45)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {t('displays.spectrum')}
            </span>
            <WaveformDisplay
              getDataFn={activeStep === 4 ? frequencyFn : undefined}
              staticWaveform="sawtooth"
              mode="spectrum"
              height={140}
              color="#4A9EDE"
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <SynthKnob
            value={cutoff4}
            onChange={handleCutoff4Change}
            label={t('filters.knobCutoff')}
            min={20}
            max={20000}
            unit="Hz"
            size="lg"
            color="#3DA85A"
          />

          <SynthKnob
            value={reso4}
            onChange={handleReso4Change}
            label={t('common.labelResonance')}
            min={0}
            max={25}
            size="md"
            color="#F5C518"
          />

          <PlayButton
            isPlaying={playing4}
            onClick={handlePlay4}
          />
        </div>
      </TutorialStep>

      {/* ─── Schritt 5: Zwei Oszillatoren mischen ─── */}
      <TutorialStep
        title={t('mix.title')}
        description={t('mix.description')}
        stepNumber={5}
        totalSteps={TOTAL_STEPS}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          <WaveformSelector
            value={wave5a}
            onChange={handleWave5aChange}
            label={t('mix.oscillator1')}
          />
          <WaveformSelector
            value={wave5b}
            onChange={handleWave5bChange}
            label={t('mix.oscillator2')}
          />
        </div>

        <WaveformDisplay
          getDataFn={activeStep === 5 ? analyserFn : undefined}
          staticWaveform="sawtooth"
          mode="waveform"
          height={160}
        />

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <SynthKnob
            value={vol5b}
            onChange={handleVol5bChange}
            label={t('mix.knobOsc2Vol')}
            min={0}
            max={100}
            unit="%"
            size="md"
          />

          <SynthKnob
            value={detune5}
            onChange={handleDetune5Change}
            label={t('mix.knobDetune')}
            min={0}
            max={50}
            unit="Ct"
            size="md"
            color="#F5C518"
          />

          <PlayButton
            isPlaying={playing5}
            onClick={handlePlay5}
            label={t('mix.playDual')}
          />
        </div>

        <div
          className="kbk-obsidian framed"
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            fontSize: 12,
            color: 'rgba(63,207,74,0.92)',
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: '#3FCF4A', letterSpacing: '0.08em' }}>{t('mix.tryThisLabel')}</strong> {t('mix.tryThis')}
        </div>
      </TutorialStep>

      {/* ─── Schritt 6: ADSR Hüllkurve ─── */}
      <TutorialStep
        title={t('adsr.title')}
        description={t('adsr.description')}
        stepNumber={6}
        totalSteps={TOTAL_STEPS}
      >
        {/* ADSR + Waveform nebeneinander (auf Mobile gestapelt) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {/* ADSR-Visualisierung */}
          <ADSRDisplay
            attack={adsrA * 2}
            decay={adsrD * 2}
            sustain={adsrS}
            release={adsrR * 2}
          />

          <div style={{ flex: 1, minWidth: 220 }}>
            <WaveformDisplay
              getDataFn={activeStep === 6 ? analyserFn : undefined}
              staticWaveform="sawtooth"
              mode="waveform"
              height={100}
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <SynthKnob
            value={adsrA}
            onChange={setAdsrA}
            label={t('adsr.knobAttack')}
            min={0}
            max={2000}
            unit="ms"
            size="md"
            color="#2D8B46"
          />

          <SynthKnob
            value={adsrD}
            onChange={setAdsrD}
            label={t('adsr.knobDecay')}
            min={0}
            max={2000}
            unit="ms"
            size="md"
            color="#3DA85A"
          />

          <SynthKnob
            value={adsrS}
            onChange={setAdsrS}
            label={t('adsr.knobSustain')}
            min={0}
            max={100}
            unit="%"
            size="md"
            color="#F5C518"
          />

          <SynthKnob
            value={adsrR}
            onChange={setAdsrR}
            label={t('adsr.knobRelease')}
            min={0}
            max={2000}
            unit="ms"
            size="md"
            color="#D4213D"
          />

          <PlayButton
            isPlaying={playing6}
            onClick={handlePlay6}
            label={t('adsr.trigger')}
          />
        </div>
      </TutorialStep>
    </SynthLayout>
  );
}
