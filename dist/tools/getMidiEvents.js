import { LoadMidiFileTool } from './loadMidiFile.js';
import { MidiAnalyzer } from '../midi/analyzer.js';
import { MidiFilter } from '../midi/filter.js';
export class GetMidiEventsTool {
    static definition = {
        name: 'get_midi_events',
        description: 'Get MIDI events from a file with comprehensive filtering options',
        inputSchema: {
            type: 'object',
            properties: {
                fileId: {
                    type: 'string',
                    description: 'ID of the loaded MIDI file'
                },
                filePath: {
                    type: 'string',
                    description: 'Path to the MIDI file (if not using fileId). Either fileId or filePath must be provided.'
                },
                timeRange: {
                    type: 'object',
                    properties: {
                        startTick: {
                            type: 'number',
                            description: 'Start tick for filtering events',
                            minimum: 0
                        },
                        endTick: {
                            type: 'number',
                            description: 'End tick for filtering events',
                            minimum: 0
                        }
                    },
                    required: ['startTick', 'endTick'],
                    description: 'Time range to filter events (in MIDI ticks)'
                },
                eventTypeFilter: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['noteOn', 'noteOff', 'noteAftertouch', 'controller', 'programChange', 'channelAftertouch', 'pitchBend', 'sysEx', 'meta']
                    },
                    description: 'Filter events by type'
                },
                trackFilter: {
                    type: 'array',
                    items: {
                        type: 'number',
                        minimum: 0
                    },
                    description: 'Filter events by track indexes'
                },
                valueFilter: {
                    type: 'object',
                    properties: {
                        value1: {
                            type: 'number',
                            description: 'Filter by first value (e.g., note number)',
                            minimum: 0,
                            maximum: 127
                        },
                        value2: {
                            type: 'number',
                            description: 'Filter by second value (e.g., velocity)',
                            minimum: 0,
                            maximum: 127
                        },
                        value3: {
                            type: 'number',
                            description: 'Filter by third value',
                            minimum: 0,
                            maximum: 127
                        }
                    },
                    description: 'Filter events by specific values'
                },
                metaTypeFilter: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: ['text', 'copyright', 'trackName', 'instrumentName', 'lyrics', 'marker', 'cuePoint', 'programName', 'deviceName', 'setTempo', 'timeSignature', 'keySignature']
                    },
                    description: 'Filter meta events by type (text, lyrics, marker, etc.)'
                }
            }
        }
    };
    static async execute(args) {
        try {
            let loadedFile;
            if (args.fileId) {
                loadedFile = LoadMidiFileTool.getLoadedFile(args.fileId);
                if (!loadedFile) {
                    throw new Error(`No loaded file found with ID: ${args.fileId}`);
                }
            }
            else if (args.filePath) {
                // Try to find already loaded file
                loadedFile = LoadMidiFileTool.getLoadedFileByPath(args.filePath);
                if (!loadedFile) {
                    // Load the file
                    const loadResult = await LoadMidiFileTool.execute({ filePath: args.filePath });
                    loadedFile = LoadMidiFileTool.getLoadedFile(loadResult.fileId);
                    if (!loadedFile) {
                        throw new Error('Failed to load MIDI file');
                    }
                }
            }
            else {
                throw new Error('Either fileId or filePath must be provided');
            }
            // Validate track filter
            if (args.trackFilter) {
                const maxTrackIndex = Math.max(...args.trackFilter);
                if (maxTrackIndex >= loadedFile.tracks.length) {
                    throw new Error(`Track index ${maxTrackIndex} is out of range. File has ${loadedFile.tracks.length} tracks.`);
                }
            }
            // Extract events
            let events = MidiAnalyzer.extractMidiEvents(loadedFile.midiFile, args.trackFilter);
            // Apply filters
            const filterOptions = {};
            if (args.timeRange) {
                filterOptions.timeRange = args.timeRange;
            }
            if (args.eventTypeFilter && args.eventTypeFilter.length > 0) {
                filterOptions.eventTypes = args.eventTypeFilter;
            }
            if (args.valueFilter) {
                filterOptions.valueFilter = args.valueFilter;
            }
            if (args.metaTypeFilter && args.metaTypeFilter.length > 0) {
                filterOptions.metaTypes = args.metaTypeFilter;
            }
            if (Object.keys(filterOptions).length > 0) {
                events = MidiFilter.applyEventFilters(events, filterOptions);
            }
            return { events };
        }
        catch (error) {
            throw new Error(`Failed to get MIDI events: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
