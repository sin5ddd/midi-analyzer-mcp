import * as midiFile from 'midi-file';
import * as fs from 'fs';
export class MidiParser {
    static parseMidiFile(filePath) {
        try {
            const buffer = fs.readFileSync(filePath);
            const parsed = midiFile.parseMidi(buffer);
            return {
                formatType: parsed.header.formatType || 1,
                ticksPerBeat: parsed.header.ticksPerBeat || 480,
                tracks: parsed.tracks.map(track => this.parseTrack(track))
            };
        }
        catch (error) {
            throw new Error(`Failed to parse MIDI file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    static parseTrack(track) {
        return {
            events: track.map((event) => this.parseEvent(event))
        };
    }
    static parseEvent(event) {
        const midiEvent = {
            deltaTime: event.deltaTime,
            type: event.type
        };
        if (event.channel !== undefined) {
            midiEvent.channel = event.channel;
        }
        if (event.noteNumber !== undefined) {
            midiEvent.noteNumber = event.noteNumber;
            midiEvent.velocity = event.velocity || 0;
            midiEvent.data = [event.noteNumber, event.velocity || 0];
        }
        else if (event.data) {
            midiEvent.data = event.data;
        }
        if (event.meta === true) {
            midiEvent.meta = true;
            // Copy all meta-specific properties
            Object.keys(event).forEach(key => {
                if (key !== 'deltaTime' && key !== 'type' && key !== 'meta') {
                    midiEvent[key] = event[key];
                }
            });
        }
        if (event.running) {
            midiEvent.running = event.running;
        }
        return midiEvent;
    }
    static normalizeEventType(type) {
        // midi-file library already provides string event types
        // Just normalize some common variations
        const typeMap = {
            'noteOn': 'noteOn',
            'noteOff': 'noteOff',
            'noteAftertouch': 'noteAftertouch',
            'controller': 'controller',
            'programChange': 'programChange',
            'channelAftertouch': 'channelAftertouch',
            'pitchBend': 'pitchBend',
            'sysEx': 'sysEx',
            'endOfTrack': 'endOfTrack',
            'setTempo': 'setTempo',
            'timeSignature': 'timeSignature',
            'keySignature': 'keySignature',
            'text': 'text',
            'copyrightNotice': 'copyright',
            'trackName': 'trackName',
            'instrumentName': 'instrumentName',
            'lyrics': 'lyrics',
            'marker': 'marker',
            'cuePoint': 'cuePoint'
        };
        return typeMap[type] || type;
    }
}
