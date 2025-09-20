import { MidiParser } from '../midi/parser.js';
import { MidiAnalyzer } from '../midi/analyzer.js';
import * as crypto from 'crypto';
import * as fs from 'fs';
export class LoadMidiFileTool {
    static loadedFiles = new Map();
    static definition = {
        name: 'load_midi_file',
        description: 'Load and parse a MIDI SMF file from the specified path',
        inputSchema: {
            type: 'object',
            properties: {
                filePath: {
                    type: 'string',
                    description: 'Path to the MIDI file to load'
                }
            },
            required: ['filePath']
        }
    };
    static async execute(args) {
        try {
            // Check if file exists
            if (!fs.existsSync(args.filePath)) {
                throw new Error(`File not found: ${args.filePath}`);
            }
            // Generate unique file ID
            const fileId = crypto.createHash('md5').update(args.filePath + Date.now()).digest('hex');
            // Parse MIDI file
            const midiFile = MidiParser.parseMidiFile(args.filePath);
            // Analyze MIDI file
            const summary = MidiAnalyzer.analyzeMidiFile(midiFile);
            const tracks = midiFile.tracks.map((_, index) => MidiAnalyzer.analyzeTrack(midiFile, index));
            // Store loaded file
            const loadedFile = {
                id: fileId,
                filePath: args.filePath,
                midiFile,
                summary,
                tracks,
                loadedAt: new Date()
            };
            this.loadedFiles.set(fileId, loadedFile);
            return {
                fileId,
                filePath: args.filePath,
                format: summary.format,
                trackCount: summary.trackCount,
                ppq: summary.ppq,
                totalEvents: summary.totalEvents
            };
        }
        catch (error) {
            throw new Error(`Failed to load MIDI file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    static getLoadedFile(fileId) {
        return this.loadedFiles.get(fileId);
    }
    static getLoadedFileByPath(filePath) {
        for (const [_, loadedFile] of this.loadedFiles) {
            if (loadedFile.filePath === filePath) {
                return loadedFile;
            }
        }
        return undefined;
    }
    static getAllLoadedFiles() {
        return Array.from(this.loadedFiles.values());
    }
    static removeLoadedFile(fileId) {
        return this.loadedFiles.delete(fileId);
    }
}
