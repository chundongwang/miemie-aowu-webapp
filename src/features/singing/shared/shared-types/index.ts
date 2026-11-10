export type Instrument = 'piano' | 'guitar' | 'bass';
export type PolicyId = 'rules' | 'jev' | 'mock';
export type Pattern = 'arpeggio' | 'sustain' | 'strum';

export interface MelodyNote { beat: number; duration: number; midi: number; lyric?: string }
export interface ChordEvent { beat: number; duration: number; symbol: string; midi: number[] }
export interface SongSection { name: string; startBeat: number; endBeat: number }
export interface SongPackage {
  id: string; title: string; artist: string; description: string; key: string;
  tempoBpm: number; timeSignature: [number, number]; totalBeats: number;
  instruments: Instrument[]; melody: MelodyNote[]; chords: ChordEvent[];
  sections: SongSection[]; phrases: { startBeat: number; endBeat: number; text: string }[];
  provenance: { source: string; license: string; confidence: number; manuallyCurated: boolean };
}
export interface VocalFeatures {
  timestampMs: number; pitchHz: number | null; pitchConfidence: number;
  rms: number; onset: boolean; processingMs: number;
}
export interface MusicState {
  timestampMs: number; songPositionBeats: number; alignmentConfidence: number;
  referenceTempoBpm: number; estimatedSingerTempoBpm: number; beatPhaseErrorMs: number;
  detectedPitchHz: number | null; pitchConfidence: number; pitchOffsetSemitones: number | null;
  vocalActivity: 'singing' | 'silence' | 'uncertain';
  phraseState: 'starting' | 'continuing' | 'sustaining' | 'ending' | 'unknown';
  currentChord: string; nextChord: string | null; currentSection: string; previousAction: string | null;
}
export interface BandDecision {
  tempoAction: 'follow' | 'hold' | 'recover'; harmonyAction: 'advance' | 'hold';
  grooveAction: 'normal' | 'simplify' | 'pause'; fillAction: 'none' | 'subtle' | 'transition';
  dynamicsTarget: number; effectiveBeat: number; validUntilBeat: number; confidence: number;
}
export interface DecisionResult { decision: BandDecision; policy: PolicyId; latencyMs: number; fallbackUsed: boolean; reason: string }
export interface DecisionPolicy { id: PolicyId; decide(state: MusicState, signal?: AbortSignal): BandDecision | Promise<BandDecision> }
export interface AudioNativePolicy { id: string; decideAudio(features: Float32Array, state: MusicState, signal?: AbortSignal): Promise<BandDecision> }
export interface TraceFrame { vocal_position_beats?: number; vocal_register_semitones?: number; transpose_semitones?: number; timestamp_ms: number; state: MusicState; features: VocalFeatures; policy: PolicyId; decision: BandDecision; decision_latency_ms: number; fallback_used: boolean; reason: string; scheduler_jitter_ms: number }
export interface NoteEvent { midi: number; velocity: number; startBeat: number; durationBeats: number; instrument: Instrument }
export interface MixerSettings { piano: number; guitar: number; bass: number; master: number; pattern: Pattern; transpose: number }
