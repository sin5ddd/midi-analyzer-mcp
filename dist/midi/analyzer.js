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
                const metaTypeName = MidiParser.getMetaTypeName(event.meta.type);
                if (metaTypeName === 'trackName' && event.meta.data) {
                    trackName = this.bytesToString(event.meta.data);
                }
                else if (metaTypeName === 'instrumentName' && event.meta.data) {
                    instrumentName = this.bytesToString(event.meta.data);
                }
            }
            // Count notes and extract channel/program info
            const eventTypeName = MidiParser.getEventTypeName(event.type);
            if (eventTypeName === 'noteOn' && event.data && event.data[1] > 0) {
                noteCount++;
                if (channel === undefined && event.channel !== undefined) {
                    channel = event.channel;
                }
            }
            else if (eventTypeName === 'programChange' && event.data) {
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
                if (event.meta && MidiParser.getMetaTypeName(event.meta.type) === 'setTempo' && event.meta.data) {
                    const microsecondsPerBeat = (event.meta.data[0] << 16) | (event.meta.data[1] << 8) | event.meta.data[2];
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
                if (event.meta && MidiParser.getMetaTypeName(event.meta.type) === 'timeSignature' && event.meta.data) {
                    const data = event.meta.data;
                    timeSignatures.push({
                        tick: currentTick,
                        numerator: data[0],
                        denominator: Math.pow(2, data[1]),
                        clocksPerClick: data[2],
                        notesPerQuarter: data[3]
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
                if (event.meta && MidiParser.getMetaTypeName(event.meta.type) === 'keySignature' && event.meta.data) {
                    const data = event.meta.data;
                    keySignatures.push({
                        tick: currentTick,
                        sharpsFlats: data[0] > 127 ? data[0] - 256 : data[0],
                        major: data[1] === 0
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
        const eventTypeName = MidiParser.getEventTypeName(event.type);
        const eventDetails = {
            tick,
            type: eventTypeName,
            channel: event.channel
        };
        if (event.data) {
            eventDetails.value1 = event.data[0];
            if (event.data.length > 1)
                eventDetails.value2 = event.data[1];
            if (event.data.length > 2)
                eventDetails.value3 = event.data[2];
            if (eventTypeName === 'noteOn' || eventTypeName === 'noteOff') {
                eventDetails.note = event.data[0];
                eventDetails.velocity = event.data[1];
            }
        }
        if (event.meta) {
            eventDetails.metaType = MidiParser.getMetaTypeName(event.meta.type);
            eventDetails.data = event.meta.data;
            if (event.meta.data && ['text', 'trackName', 'instrumentName', 'lyrics', 'marker', 'cuePoint'].includes(eventDetails.metaType)) {
                eventDetails.text = this.bytesToString(event.meta.data);
            }
        }
        return eventDetails;
    }
    static bytesToString(bytes) {
        return String.fromCharCode(...bytes);
    }
}
