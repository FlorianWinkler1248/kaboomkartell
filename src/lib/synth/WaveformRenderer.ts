/**
 * WaveformRenderer — Canvas-basierte Waveform-Visualisierung
 *
 * Zeichnet Echtzeit-Oszilloskop und Spektrum-Darstellungen
 * inspiriert von Serum 2's visuellem Stil mit Glow-Effekten.
 */

/** Standard-Farben im KBK Rasta-Design */
const DEFAULT_WAVEFORM_COLOR = '#2D8B46';
const GRID_COLOR = '#1a1a2e';
const BG_COLOR = '#0a0a0f';

export class WaveformRenderer {
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private animFrameId: number = 0;
  private isAnimating: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D Kontext nicht verfügbar');
    this.ctx2d = ctx;
  }

  /**
   * Hintergrund und Raster zeichnen.
   * Vertikale + horizontale Rasterlinien für Oszilloskop-Look.
   */
  private drawBackground(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx2d;

    /* Dunkler Hintergrund */
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    /* Vertikale Rasterlinien (8 Abschnitte) */
    const vDivisions = 8;
    for (let i = 1; i < vDivisions; i++) {
      const x = (width / vDivisions) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    /* Horizontale Rasterlinien (4 Abschnitte) */
    const hDivisions = 4;
    for (let i = 1; i < hDivisions; i++) {
      const y = (height / hDivisions) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    /* Mittellinie etwas heller hervorheben */
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  /**
   * Echtzeit-Oszilloskop zeichnen (Zeitdomäne).
   * Die dataArray-Werte liegen zwischen 0-255, wobei 128 die Nulllinie ist.
   */
  drawWaveform(dataArray: Uint8Array, color: string = DEFAULT_WAVEFORM_COLOR): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx2d;

    this.drawBackground();

    if (dataArray.length === 0) return;

    /* Glow-Effekt (Serum-inspiriert) */
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();

    const sliceWidth = width / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      /* Wert von 0-255 auf Canvas-Höhe normalisieren */
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();

    /* Zweite, dünnere Linie für noch stärkeren Glow */
    ctx.shadowBlur = 25;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 6;
    ctx.stroke();

    /* Zurücksetzen */
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  /**
   * Spektrum-Darstellung zeichnen (Frequenzdomäne).
   * Zeigt Frequenz-Balken von links (tiefe Freq.) nach rechts (hohe Freq.).
   */
  drawSpectrum(dataArray: Uint8Array, color: string = DEFAULT_WAVEFORM_COLOR): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx2d;

    this.drawBackground();

    if (dataArray.length === 0) return;

    /* Nur die ersten 256 Bins anzeigen (relevant für hörbare Frequenzen) */
    const binCount = Math.min(dataArray.length, 256);
    const barWidth = width / binCount;

    ctx.shadowColor = color;
    ctx.shadowBlur = 6;

    for (let i = 0; i < binCount; i++) {
      /* Höhe proportional zum dB-Wert */
      const barHeight = (dataArray[i] / 255) * height * 0.9;
      const x = i * barWidth;
      const y = height - barHeight;

      /* Farbverlauf von dunkel (unten) nach hell (oben) */
      const gradient = ctx.createLinearGradient(x, height, x, y);
      gradient.addColorStop(0, color + '40');
      gradient.addColorStop(1, color);

      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, Math.max(barWidth - 1, 1), barHeight);
    }

    ctx.shadowBlur = 0;
  }

  /**
   * Statische Waveform zeichnen (für Vorschau ohne laufendes Audio).
   * Generiert mathematisch die jeweilige Wellenform.
   */
  drawStaticWaveform(type: OscillatorType, color: string = DEFAULT_WAVEFORM_COLOR): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx2d;

    this.drawBackground();

    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.beginPath();

    /* 3 komplette Perioden zeichnen */
    const periods = 3;
    const centerY = height / 2;
    const amplitude = height * 0.35;

    for (let i = 0; i <= width; i++) {
      /* Phase: 0 bis (2*PI * Anzahl Perioden) */
      const phase = (i / width) * Math.PI * 2 * periods;
      let y: number;

      switch (type) {
        case 'sine':
          y = centerY - Math.sin(phase) * amplitude;
          break;

        case 'square':
          y = centerY - (Math.sin(phase) >= 0 ? 1 : -1) * amplitude;
          break;

        case 'sawtooth':
          /* Sägezahn: linear ansteigend, dann Sprung */
          const sawPhase = ((phase / (Math.PI * 2)) % 1);
          y = centerY - (sawPhase * 2 - 1) * amplitude;
          break;

        case 'triangle':
          /* Dreieck: aus Sägezahn per Absolutwert */
          const triPhase = ((phase / (Math.PI * 2)) % 1);
          y = centerY - (Math.abs(triPhase * 4 - 2) - 1) * amplitude;
          break;

        default:
          y = centerY;
      }

      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }

    ctx.stroke();

    /* Glow-Overlay */
    ctx.shadowBlur = 25;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  /**
   * Fortlaufende Animation starten.
   * Ruft die getData-Funktion in jedem Frame auf und zeichnet das Ergebnis.
   */
  startAnimation(
    getDataFn: () => Uint8Array,
    mode: 'waveform' | 'spectrum' = 'waveform',
    color: string = DEFAULT_WAVEFORM_COLOR
  ): void {
    /* Vorherige Animation sauber stoppen (verhindert doppelte Loops) */
    this.stopAnimation();
    this.isAnimating = true;

    const animate = () => {
      if (!this.isAnimating) return;

      const data = getDataFn();

      if (mode === 'waveform') {
        this.drawWaveform(data, color);
      } else {
        this.drawSpectrum(data, color);
      }

      this.animFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  /** Animation stoppen */
  stopAnimation(): void {
    this.isAnimating = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  /** Canvas-Dimensionen merken (wird vom WaveformDisplay aufgerufen) */
  resize(_width: number, _height: number): void {
    /* Canvas-Größe wird vom WaveformDisplay gesetzt, nicht hier.
       Diese Methode existiert nur als Callback-Hook. */
  }

  /** Aufräumen und Animation stoppen */
  destroy(): void {
    this.stopAnimation();
  }
}
