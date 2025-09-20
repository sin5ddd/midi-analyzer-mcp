import { LoadMidiFileTool } from './loadMidiFile.js';
import { MidiAnalyzer } from '../midi/analyzer.js';
import { MidiFilter } from '../midi/filter.js';
export class GetTrackDetailsTool {
    static definition = {
        name: 'get_track_details',
        description: 'Get detailed information about a specific track including events',
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
                trackIndex: {
                    type: 'number',
                    description: 'Index of the track to get details for',
                    minimum: 0
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
                }
            },
            required: ['trackIndex']
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
            // Validate track index
            if (args.trackIndex >= loadedFile.tracks.length) {
                throw new Error(`Track index ${args.trackIndex} is out of range. File has ${loadedFile.tracks.length} tracks.`);
            }
            const track = loadedFile.tracks[args.trackIndex];
            // Extract events for this specific track
            const trackEvents = MidiAnalyzer.extractMidiEvents(loadedFile.midiFile, [args.trackIndex]);
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
            let filteredEvents = trackEvents;
            if (Object.keys(filterOptions).length > 0) {
                filteredEvents = MidiFilter.applyEventFilters(trackEvents, filterOptions);
            }
            return {
                track,
                events: filteredEvents
            };
        }
        catch (error) {
            throw new Error(`Failed to get track details: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
