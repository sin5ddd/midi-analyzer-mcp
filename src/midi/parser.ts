import * as midiFile from 'midi-file';
import * as fs from 'fs';
import { MidiFile, MidiEvent, MidiTrack } from '../types/midi.js';

export class MidiParser {
  static parseMidiFile(filePath: string): MidiFile {
    try {
      const buffer = fs.readFileSync(filePath);
      const parsed = midiFile.parseMidi(buffer);

      return {
        formatType: (parsed.header as any).formatType || 1,
        ticksPerBeat: (parsed.header as any).ticksPerBeat || 480,
        tracks: parsed.tracks.map(track => this.parseTrack(track))
      };
    } catch (error) {
      throw new Error(`Failed to parse MIDI file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static parseTrack(track: any): MidiTrack {
    return {
      events: track.map((event: any) => this.parseEvent(event))
    };
  }

  private static parseEvent(event: any): MidiEvent {
    const midiEvent: MidiEvent = {
      deltaTime: event.deltaTime,
      type: event.type
    };

    if (event.channel !== undefined) {
      midiEvent.channel = event.channel;
    }

    if (event.noteNumber !== undefined) {
      midiEvent.data = [event.noteNumber, event.velocity || 0];
    } else if (event.data) {
      midiEvent.data = event.data;
    }

    if (event.meta) {
      midiEvent.meta = {
        type: event.metaType,
        data: event.data || []
      };
    }

    if (event.running) {
      midiEvent.running = event.running;
    }

    return midiEvent;
  }

  static getEventTypeName(type: number): string {
    const eventTypes: { [key: number]: string } = {
      0x80: 'noteOff',
      0x90: 'noteOn',
      0xA0: 'noteAftertouch',
      0xB0: 'controller',
      0xC0: 'programChange',
      0xD0: 'channelAftertouch',
      0xE0: 'pitchBend',
      0xF0: 'sysEx',
      0xFF: 'meta'
    };

    return eventTypes[type & 0xF0] || 'unknown';
  }

  static getMetaTypeName(metaType: number): string {
    const metaTypes: { [key: number]: string } = {
      0x00: 'sequenceNumber',
      0x01: 'text',
      0x02: 'copyrightNotice',
      0x03: 'trackName',
      0x04: 'instrumentName',
      0x05: 'lyrics',
      0x06: 'marker',
      0x07: 'cuePoint',
      0x20: 'channelPrefix',
      0x2F: 'endOfTrack',
      0x51: 'setTempo',
      0x54: 'smpteOffset',
      0x58: 'timeSignature',
      0x59: 'keySignature',
      0x7F: 'sequencerSpecific'
    };

    return metaTypes[metaType] || 'unknown';
  }
}