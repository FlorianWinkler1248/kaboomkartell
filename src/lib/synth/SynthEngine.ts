/**
 * SynthEngine — Web Audio API Wrapper für den KBK Synthesizer
 *
 * Verwaltet Oszillatoren, Filter, Gain-Nodes und Analyser
 * für Echtzeit-Audio und Waveform-Visualisierung.
 *
 * Signalkette: Oszillator(en) → Filter → Gain → Analyser → Destination
 */
export class SynthEngine {
  private ctx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isPlaying: boolean = false;

  /** Zweiter Oszillator für additive Synthese / Supersaw */
  private oscillator2: OscillatorNode | null = null;
  private gainNode2: GainNode | null = null;

  /** Aktuelle Parameter (für Neustart bei Waveform-Wechsel) */
  private currentType: OscillatorType = 'sawtooth';
  private currentFreq: number = 220;
  private currentType2: OscillatorType = 'sawtooth';
  private currentDetune: number = 0;

  /** Envelope-Timeout für Release-Phase */
  private envelopeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {}

  /**
   * AudioContext initialisieren (muss nach User-Interaktion aufgerufen werden,
   * da Browser einen "user gesture" für AudioContext verlangen).
   */
  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 2048;

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = 0.3;

    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 2000;
    this.filterNode.Q.value = 1;

    /* Signalkette: Filter → Gain → Analyser → Lautsprecher */
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);
  }

  /** Einzelnen Oszillator starten */
  play(type: OscillatorType = 'sawtooth', frequency: number = 220): void {
    if (!this.ctx) this.init();
    this.stop();

    this.currentType = type;
    this.currentFreq = frequency;

    this.oscillator = this.ctx!.createOscillator();
    this.oscillator.type = type;
    this.oscillator.frequency.value = frequency;
    this.oscillator.connect(this.filterNode!);
    this.oscillator.start();
    this.isPlaying = true;
  }

  /** Alle Oszillatoren stoppen */
  stop(): void {
    if (this.envelopeTimeout) {
      clearTimeout(this.envelopeTimeout);
      this.envelopeTimeout = null;
    }

    if (this.oscillator) {
      try { this.oscillator.stop(); } catch { /* Bereits gestoppt */ }
      this.oscillator.disconnect();
      this.oscillator = null;
    }
    if (this.oscillator2) {
      try { this.oscillator2.stop(); } catch { /* Bereits gestoppt */ }
      this.oscillator2.disconnect();
      this.oscillator2 = null;
    }
    if (this.gainNode2) {
      this.gainNode2.disconnect();
      this.gainNode2 = null;
    }

    /* Gain zurücksetzen damit nächster Ton sofort hörbar ist */
    if (this.gainNode) {
      this.gainNode.gain.cancelScheduledValues(this.ctx?.currentTime ?? 0);
      this.gainNode.gain.value = 0.3;
    }

    this.isPlaying = false;
  }

  /** Frequenz des ersten Oszillators ändern (live) */
  setFrequency(freq: number): void {
    this.currentFreq = freq;
    if (this.oscillator) {
      this.oscillator.frequency.value = freq;
    }
    if (this.oscillator2) {
      this.oscillator2.frequency.value = freq;
    }
  }

  /** Wellenform des ersten Oszillators ändern */
  setWaveform(type: OscillatorType): void {
    this.currentType = type;
    if (this.oscillator) {
      this.oscillator.type = type;
    }
  }

  /** Filter-Cutoff-Frequenz setzen */
  setFilterCutoff(freq: number): void {
    if (this.filterNode) {
      this.filterNode.frequency.value = freq;
    }
  }

  /** Filter-Resonanz (Q-Faktor) setzen */
  setFilterResonance(q: number): void {
    if (this.filterNode) {
      this.filterNode.Q.value = q;
    }
  }

  /** Filter-Typ wechseln (lowpass, highpass, bandpass, etc.) */
  setFilterType(type: BiquadFilterType): void {
    if (this.filterNode) {
      this.filterNode.type = type;
    }
  }

  /** Lautstärke setzen (0 bis 1) */
  setVolume(vol: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  /**
   * Zeitdomäne-Daten für Oszilloskop-Darstellung holen.
   * Gibt Uint8Array mit Werten 0-255 zurück (128 = Nulllinie).
   */
  getAnalyserData(): Uint8Array {
    if (!this.analyserNode) return new Uint8Array(0);
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteTimeDomainData(data);
    return data;
  }

  /**
   * Frequenzdomäne-Daten für Spektrum-Darstellung holen.
   * Gibt Uint8Array mit dB-Werten 0-255 zurück.
   */
  getFrequencyData(): Uint8Array {
    if (!this.analyserNode) return new Uint8Array(0);
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    return data;
  }

  /**
   * Zwei Oszillatoren gleichzeitig spielen (für Supersaw / Layer).
   * Der zweite Oszillator wird um `detune` Cents verstimmt.
   */
  playDual(
    type1: OscillatorType,
    type2: OscillatorType,
    freq: number,
    detune: number = 0
  ): void {
    if (!this.ctx) this.init();
    this.stop();

    this.currentType = type1;
    this.currentType2 = type2;
    this.currentFreq = freq;
    this.currentDetune = detune;

    /* Oszillator 1 — direkt in den Filter */
    this.oscillator = this.ctx!.createOscillator();
    this.oscillator.type = type1;
    this.oscillator.frequency.value = freq;
    this.oscillator.connect(this.filterNode!);
    this.oscillator.start();

    /* Oszillator 2 — eigener Gain → dann in den Filter */
    this.gainNode2 = this.ctx!.createGain();
    this.gainNode2.gain.value = 0.3;
    this.gainNode2.connect(this.filterNode!);

    this.oscillator2 = this.ctx!.createOscillator();
    this.oscillator2.type = type2;
    this.oscillator2.frequency.value = freq;
    this.oscillator2.detune.value = detune;
    this.oscillator2.connect(this.gainNode2);
    this.oscillator2.start();

    this.isPlaying = true;
  }

  /** Lautstärke des zweiten Oszillators ändern */
  setOsc2Gain(vol: number): void {
    if (this.gainNode2) {
      this.gainNode2.gain.value = Math.max(0, Math.min(1, vol));
    }
  }

  /** Detune des zweiten Oszillators ändern (in Cents) */
  setOsc2Detune(cents: number): void {
    this.currentDetune = cents;
    if (this.oscillator2) {
      this.oscillator2.detune.value = cents;
    }
  }

  /**
   * ADSR-Hüllkurve auslösen (vereinfacht).
   *
   * Attack  = Anstiegszeit zum Maximum (Sekunden)
   * Decay   = Abfallzeit zum Sustain-Level (Sekunden)
   * Sustain = Halte-Lautstärke (0-1)
   * Release = Ausklingzeit nach dem Loslassen (Sekunden)
   */
  triggerEnvelope(
    attack: number,
    decay: number,
    sustain: number,
    release: number
  ): void {
    if (!this.gainNode || !this.ctx) return;

    const now = this.ctx.currentTime;
    const gain = this.gainNode.gain;

    gain.cancelScheduledValues(now);

    /* Start bei 0 */
    gain.setValueAtTime(0, now);
    /* Attack: von 0 auf Maximum (0.8) */
    gain.linearRampToValueAtTime(0.8, now + attack);
    /* Decay: von Maximum auf Sustain-Level */
    gain.linearRampToValueAtTime(sustain * 0.8, now + attack + decay);

    /* Release: nach Attack+Decay+0.5s Haltezeit auf 0 */
    const releaseStart = now + attack + decay + 0.5;
    gain.setValueAtTime(sustain * 0.8, releaseStart);
    gain.linearRampToValueAtTime(0, releaseStart + release);

    /* Oszillator nach kompletter Hüllkurve stoppen */
    const totalTime = (attack + decay + 0.5 + release) * 1000 + 100;
    this.envelopeTimeout = setTimeout(() => {
      this.stop();
    }, totalTime);
  }

  /** Gibt zurück ob gerade Audio abgespielt wird */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /** Alles aufräumen und AudioContext schließen */
  destroy(): void {
    this.stop();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.analyserNode = null;
    this.gainNode = null;
    this.filterNode = null;
  }
}
