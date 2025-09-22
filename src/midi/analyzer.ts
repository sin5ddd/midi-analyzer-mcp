import {
  MidiFile,
  MidiSummary,
  TrackInfo,
  TempoInfo,
  TimeSignature,
  KeySignature,
  MidiEventDetails,
  MidiEvent
} from '../types/midi.js';
import { MidiParser } from './parser.js';

export class MidiAnalyzer {
  static analyzeMidiFile(midiFile: MidiFile): MidiSummary {
    const tempoInfo = this.extractTempoInfo(midiFile);
    const timeSignature = this.extractTimeSignature(midiFile);
    const keySignature = this.extractKeySignature(midiFile);
    const totalTicks = this.calculateTotalTicks(midiFile);
    const totalEvents = this.countTotalEvents(midiFile);

    return {
      format: midiFile.formatType,
      ppq: midiFile.ticksPerBeat,
      totalTicks,
      trackCount: midiFile.tracks.length,
      totalEvents,
      tempoInfo,
      timeSignature,
      keySignature
    };
  }

  static analyzeTrack(midiFile: MidiFile, trackIndex: number): TrackInfo {
    if (trackIndex >= midiFile.tracks.length) {
      throw new Error(`Track index ${trackIndex} is out of range`);
    }

    const track = midiFile.tracks[trackIndex];
    const trackInfo: TrackInfo = {
      index: trackIndex,
      eventCount: track.events.length,
      noteCount: 0,
      startTick: 0,
      endTick: 0
    };

    let currentTick = 0;
    let noteCount = 0;
    let channel: number | undefined;
    let program: number | undefined;
    let trackName: string | undefined;
    let instrumentName: string | undefined;

    for (const event of track.events) {
      currentTick += event.deltaTime;

      // Extract track metadata
      if (event.meta) {
        if (event.type === 'trackName' && (event as any).text) {
          trackName = (event as any).text;
        } else if (event.type === 'instrumentName' && (event as any).text) {
          instrumentName = (event as any).text;
        }
      }

      // Count notes and extract channel/program info
      if (event.type === 'noteOn' && event.velocity && event.velocity > 0) {
        noteCount++;
        if (channel === undefined && event.channel !== undefined) {
          channel = event.channel;
        }
      } else if (event.type === 'programChange' && event.data) {
        program = event.data[0];
      }

      if (trackInfo.endTick < currentTick) {
        trackInfo.endTick = currentTick;
      }
    }

    trackInfo.noteCount = noteCount;
    trackInfo.channel = channel;
    trackInfo.program = program;
    trackInfo.name = trackName;
    trackInfo.instrument = instrumentName;

    return trackInfo;
  }

  static extractMidiEvents(
    midiFile: MidiFile,
    trackIndexes?: number[]
  ): MidiEventDetails[] {
    const events: MidiEventDetails[] = [];

    midiFile.tracks.forEach((track, trackIndex) => {
      if (trackIndexes && !trackIndexes.includes(trackIndex)) {
        return;
      }

      let currentTick = 0;
      track.events.forEach(event => {
        currentTick += event.deltaTime;
        const eventDetails = this.convertToEventDetails(event, currentTick, trackIndex);
        if (eventDetails) {
          events.push(eventDetails);
        }
      });
    });

    return events.sort((a, b) => a.tick - b.tick);
  }

  private static extractTempoInfo(midiFile: MidiFile): TempoInfo[] {
    const tempoInfo: TempoInfo[] = [];

    midiFile.tracks.forEach(track => {
      let currentTick = 0;
      track.events.forEach(event => {
        currentTick += event.deltaTime;
        if (event.meta && event.type === 'setTempo' && (event as any).microsecondsPerBeat) {
          const microsecondsPerBeat = (event as any).microsecondsPerBeat;
          const bpm = 60000000 / microsecondsPerBeat;
          tempoInfo.push({
            tick: currentTick,
            bpm: Math.round(bpm * 100) / 100,
            microsecondsPerBeat
          });
        }
      });
    });

    return tempoInfo;
  }

  private static extractTimeSignature(midiFile: MidiFile): TimeSignature[] {
    const timeSignatures: TimeSignature[] = [];

    midiFile.tracks.forEach(track => {
      let currentTick = 0;
      track.events.forEach(event => {
        currentTick += event.deltaTime;
        if (event.meta && event.type === 'timeSignature') {
          const eventData = event as any;
          timeSignatures.push({
            tick: currentTick,
            numerator: eventData.numerator || 4,
            denominator: eventData.denominator || 4,
            clocksPerClick: eventData.metronome || 24,
            notesPerQuarter: eventData.thirtyseconds || 8
          });
        }
      });
    });

    return timeSignatures;
  }

  private static extractKeySignature(midiFile: MidiFile): KeySignature[] {
    const keySignatures: KeySignature[] = [];

    midiFile.tracks.forEach(track => {
      let currentTick = 0;
      track.events.forEach(event => {
        currentTick += event.deltaTime;
        if (event.meta && event.type === 'keySignature') {
          const eventData = event as any;
          keySignatures.push({
            tick: currentTick,
            sharpsFlats: eventData.key || 0,
            major: (eventData.scale === undefined) ? true : (eventData.scale === 0)
          });
        }
      });
    });

    return keySignatures;
  }

  private static calculateTotalTicks(midiFile: MidiFile): number {
    let maxTicks = 0;

    midiFile.tracks.forEach(track => {
      let currentTick = 0;
      track.events.forEach(event => {
        currentTick += event.deltaTime;
        if (currentTick > maxTicks) {
          maxTicks = currentTick;
        }
      });
    });

    return maxTicks;
  }

  private static countTotalEvents(midiFile: MidiFile): number {
    return midiFile.tracks.reduce((total, track) => total + track.events.length, 0);
  }

  private static convertToEventDetails(
    event: MidiEvent,
    tick: number,
    trackIndex: number
  ): MidiEventDetails | null {
    const normalizedType = MidiParser.normalizeEventType(event.type);

    const eventDetails: MidiEventDetails = {
      tick,
      type: normalizedType,
      channel: event.channel
    };

    // Handle note events with noteNumber and velocity
    if (event.noteNumber !== undefined) {
      eventDetails.note = event.noteNumber;
      eventDetails.velocity = event.velocity || 0;
      eventDetails.value1 = event.noteNumber;
      eventDetails.value2 = event.velocity || 0;
    } else if (event.data) {
      eventDetails.value1 = event.data[0];
      if (event.data.length > 1) eventDetails.value2 = event.data[1];
      if (event.data.length > 2) eventDetails.value3 = event.data[2];

      if (normalizedType === 'noteOn' || normalizedType === 'noteOff') {
        eventDetails.note = event.data[0];
        eventDetails.velocity = event.data[1];
      }
    }

    if (event.meta) {
      eventDetails.metaType = normalizedType;

      // Check if this is a text-type meta event
      if (['text', 'copyright', 'trackName', 'instrumentName', 'lyrics', 'marker', 'cuePoint'].includes(normalizedType)) {
        eventDetails.text = (event as any).text || '';
      }

      // Copy other meta event data
      if (normalizedType === 'setTempo') {
        eventDetails.data = [(event as any).microsecondsPerBeat];
      } else if (normalizedType === 'timeSignature') {
        const eventData = event as any;
        eventDetails.data = [
          eventData.numerator || 4,
          eventData.denominator || 4,
          eventData.metronome || 24,
          eventData.thirtyseconds || 8
        ];
      } else if (normalizedType === 'keySignature') {
        const eventData = event as any;
        eventDetails.data = [
          eventData.key || 0,
          eventData.scale || 0
        ];
      } else if ((event as any).text) {
        eventDetails.text = (event as any).text;
      }
    }

    return eventDetails;
  }

  private static bytesToString(bytes: number[]): string {
    return String.fromCharCode(...bytes);
  }
}