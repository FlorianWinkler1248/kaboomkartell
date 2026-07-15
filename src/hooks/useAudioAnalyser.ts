/**
 * useAudioAnalyser — Web Audio API Frequenzanalyse für den Radio-Equalizer
 *
 * Verbindet sich mit dem bestehenden HTMLAudioElement über:
 * AudioContext → MediaElementSourceNode → AnalyserNode → Destination
 *
 * Liefert Echtzeit-Frequenzdaten (64 Bins, 0-255 pro Bin) für den Canvas-Visualizer.
 * Alles in Refs gespeichert — kein Re-Render im Animation-Loop.
 *
 * WICHTIG: createMediaElementSource() darf nur EINMAL pro Audio-Element aufgerufen werden.
 * WICHTIG: AudioContext muss nach User-Geste erstellt werden (Browser-Policy).
 */

import { useRef, useState, useCallback } from 'react'

export interface UseAudioAnalyserReturn {
  /** AudioContext + AnalyserNode initialisieren. Muss bei User-Geste aufgerufen werden. */
  initAnalyser: (audioElement: HTMLAudioElement) => void
  /** Aktuelle Frequenzdaten als Uint8Array (64 Bins, 0-255). Voralloziierter Buffer. */
  getFrequencyData: () => Uint8Array
  /** Ob der Analyser verbunden und bereit ist */
  isReady: boolean
}

// FFT-Konfiguration
const FFT_SIZE = 128 // Ergibt 64 Frequenz-Bins (FFT_SIZE / 2)
const SMOOTHING = 0.82 // Glättungsfaktor für den AnalyserNode (0-1, höher = glatter)

export function useAudioAnalyser(): UseAudioAnalyserReturn {
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const [isReady, setIsReady] = useState(false)

  const initAnalyser = useCallback((audioElement: HTMLAudioElement) => {
    // Guard: Bereits initialisiert → nur AudioContext resumieren
    if (sourceRef.current) {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume()
      }
      return
    }

    try {
      // AudioContext erstellen (muss bei User-Geste passieren)
      const ctx = new AudioContext()
      audioContextRef.current = ctx

      // MediaElementSourceNode — verbindet den bestehenden <audio> mit dem AudioContext
      // EINMALIGER Aufruf pro Audio-Element!
      const source = ctx.createMediaElementSource(audioElement)
      sourceRef.current = source

      // AnalyserNode — liefert Frequenzdaten
      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = SMOOTHING
      analyserRef.current = analyser

      // Voralloziierter Buffer für Frequenzdaten (vermeidet GC im Animation-Loop)
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount) // = FFT_SIZE / 2 = 64

      // Chain verbinden: Source → Analyser → Lautsprecher
      source.connect(analyser)
      analyser.connect(ctx.destination)

      setIsReady(true)
    } catch (error) {
      console.error('AudioAnalyser Initialisierung fehlgeschlagen:', error)
    }
  }, [])

  const getFrequencyData = useCallback((): Uint8Array => {
    const analyser = analyserRef.current
    const dataArray = dataArrayRef.current
    if (!analyser || !dataArray) {
      return new Uint8Array(FFT_SIZE / 2) // Leerer Buffer als Fallback
    }
    analyser.getByteFrequencyData(dataArray as unknown as Uint8Array<ArrayBuffer>)
    return dataArray as unknown as Uint8Array
  }, [])

  return { initAnalyser, getFrequencyData, isReady }
}
