import { MidiParser } from './parser.js';
export class MidiAnalyzer {
    static analyzeMidiFile(midiFile) {
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
    static analyzeTrack(midiFile, trackIndex) {
        if (trackIndex >= midiFile.tracks.length) {
            throw new Error(`Track index ${trackIndex} is out of range`);
        }
        const track = midiFile.tracks[trackIndex];
        const trackInfo = {
            index: trackIndex,
            eventCount: track.events.length,
            noteCount: 0,
            startTick: 0,
            endTick: 0
        };
        let currentTick = 0;
        let noteCount = 0;
        let channel;
        let program;
        let trackName;
        let instrumentName;
        for (const event of track.events) {
            currentTick += event.deltaTime;
            // Extract track metadata
            if (event.meta) {
                if (event.type === 'trackName' && event.text) {
                    trackName = event.text;
                }
                else if (event.type === 'instrumentName' && event.text) {
                    instrumentName = event.text;
                }
            }
            // Count notes and extract channel/program info
            if (event.type === 'noteOn' && event.velocity && event.velocity > 0) {
                noteCount++;
                if (channel === undefined && event.channel !== undefined) {
                    channel = event.channel;
                }
            }
            else if (event.type === 'programChange' && event.data) {
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
    static extractMidiEvents(midiFile, trackIndexes) {
        const events = [];
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
    static extractTempoInfo(midiFile) {
        const tempoInfo = [];
        midiFile.tracks.forEach(track => {
            let currentTick = 0;
            track.events.forEach(event => {
                currentTick += event.deltaTime;
                if (event.meta && event.type === 'setTempo' && event.microsecondsPerBeat) {
                    const microsecondsPerBeat = event.microsecondsPerBeat;
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
    static extractTimeSignature(midiFile) {
        const timeSignatures = [];
        midiFile.tracks.forEach(track => {
            let currentTick = 0;
            track.events.forEach(event => {
                currentTick += event.deltaTime;
                if (event.meta && event.type === 'timeSignature') {
                    const eventData = event;
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
    static extractKeySignature(midiFile) {
        const keySignatures = [];
        midiFile.tracks.forEach(track => {
            let currentTick = 0;
            track.events.forEach(event => {
                currentTick += event.deltaTime;
                if (event.meta && event.type === 'keySignature') {
                    const eventData = event;
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
    static calculateTotalTicks(midiFile) {
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
    static countTotalEvents(midiFile) {
        return midiFile.tracks.reduce((total, track) => total + track.events.length, 0);
    }
    static convertToEventDetails(event, tick, trackIndex) {
        const normalizedType = MidiParser.normalizeEventType(event.type);
        const eventDetails = {
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
        }
        else if (event.data) {
            eventDetails.value1 = event.data[0];
            if (event.data.length > 1)
                eventDetails.value2 = event.data[1];
            if (event.data.length > 2)
                eventDetails.value3 = event.data[2];
            if (normalizedType === 'noteOn' || normalizedType === 'noteOff') {
                eventDetails.note = event.data[0];
                eventDetails.velocity = event.data[1];
            }
        }
        if (event.meta) {
            eventDetails.metaType = normalizedType;
            // Check if this is a text-type meta event
            if (['text', 'copyright', 'trackName', 'instrumentName', 'lyrics', 'marker', 'cuePoint'].includes(normalizedType)) {
                eventDetails.text = event.text || '';
            }
            // Copy other meta event data
            if (normalizedType === 'setTempo') {
                eventDetails.data = [event.microsecondsPerBeat];
            }
            else if (normalizedType === 'timeSignature') {
                const eventData = event;
                eventDetails.data = [
                    eventData.numerator || 4,
                    eventData.denominator || 4,
                    eventData.metronome || 24,
                    eventData.thirtyseconds || 8
                ];
            }
            else if (normalizedType === 'keySignature') {
                const eventData = event;
                eventDetails.data = [
                    eventData.key || 0,
                    eventData.scale || 0
                ];
            }
            else if (event.text) {
                eventDetails.text = event.text;
            }
        }
        return eventDetails;
    }
    static bytesToString(bytes) {
        return String.fromCharCode(...bytes);
    }
}
