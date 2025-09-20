export interface MidiEvent {
  deltaTime: number;
  type: number | string; // midi-file library returns string types
  channel?: number;
  data?: number[];
  meta?: {
    type: number | string;
    data: number[];
  };
  running?: boolean;
}

export interface MidiTrack {
  events: MidiEvent[];
}

export interface MidiFile {
  formatType: number;
  tracks: MidiTrack[];
  ticksPerBeat: number;
}

export interface MidiSummary {
  format: number;
  ppq: number;
  totalTicks: number;
  trackCount: number;
  totalEvents: number;
  tempoInfo: TempoInfo[];
  timeSignature: TimeSignature[];
  keySignature: KeySignature[];
}

export interface TempoInfo {
  tick: number;
  bpm: number;
  microsecondsPerBeat: number;
}

export interface TimeSignature {
  tick: number;
  numerator: number;
  denominator: number;
  clocksPerClick: number;
  notesPerQuarter: number;
}

export interface KeySignature {
  tick: number;
  sharpsFlats: number;
  major: boolean;
}

export interface TrackInfo {
  index: number;
  name?: string;
  instrument?: string;
  channel?: number;
  program?: number;
  eventCount: number;
  noteCount: number;
  startTick: number;
  endTick: number;
}

export interface MidiEventDetails {
  tick: number;
  type: string;
  trackIndex: number;
  channel?: number;
  note?: number;
  velocity?: number;
  value1?: number;
  value2?: number;
  value3?: number;
  data?: number[];
  metaType?: string;
  text?: string;
}

export interface TimeRange {
  startTick: number;
  endTick: number;
}

export interface ValueFilter {
  value1?: number;
  value2?: number;
  value3?: number;
}

export interface LoadedMidiFile {
  id: string;
  filePath: string;
  midiFile: MidiFile;
  summary: MidiSummary;
  tracks: TrackInfo[];
  loadedAt: Date;
}