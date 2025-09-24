import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { analyzeChords } from "../midi/chord-analyzer.js";
import { GetChordProgressionArgs, GetChordProgressionResult } from '../types/tools.js';
import { LoadMidiFileTool } from './loadMidiFile.js';
import { GetMidiEventsTool } from './getMidiEvents.js';
import { LoadedMidiFile } from '../types/midi.js';

export class GetChordProgressionTool {
  static definition: Tool = {
    name: "get_chord_progression",
    description: "MIDIファイルからコード進行を解析・抽出します。",
    inputSchema: {
        type: "object",
        properties: {
            fileId: {
                type: "string",
                description: "ロードされたMIDIファイルのID。filePathとどちらか一方が必須です。",
            },
            filePath: {
                type: "string",
                description: "MIDIファイルのパス。fileIdとどちらか一方が必須です。",
            },
            trackFilter: {
                type: "array",
                description: "解析対象のトラック番号の配列。指定しない場合は全トラックが対象です。",
                items: { type: "number" },
            },
            groupingThresholdMs: {
                type: "number",
                description: "ノートを同じコードとしてグループ化するための時間閾値（ミリ秒）。デフォルトは50msです。",
                default: 50,
            }
        },
    }
  };
  
  static async execute(args: GetChordProgressionArgs): Promise<GetChordProgressionResult> {
    const { fileId, filePath, trackFilter, groupingThresholdMs } = args;
    
    if (!fileId && !filePath) {
        throw new Error("fileIdまたはfilePathのどちらか一方は必須です。");
    }

    let loadedFile: LoadedMidiFile | undefined;
    if (fileId) {
        loadedFile = LoadMidiFileTool.getLoadedFile(fileId);
        if (!loadedFile) {
            throw new Error(`File with ID ${fileId} not loaded.`);
        }
    } else if (filePath) {
        // Attempt to find if the file is already loaded by path
        loadedFile = LoadMidiFileTool.getLoadedFileByPath(filePath);
        if (!loadedFile) {
            // If not, load it now
            const loadResult = await LoadMidiFileTool.execute({ filePath });
            loadedFile = LoadMidiFileTool.getLoadedFile(loadResult.fileId);
            if (!loadedFile) {
                throw new Error("Failed to load file for analysis.");
            }
        }
    }

    if (!loadedFile) {
        throw new Error("Could not obtain MIDI file to analyze.");
    }

    const eventsData = await GetMidiEventsTool.execute({ fileId: loadedFile.id, trackFilter });

    const chords = analyzeChords(eventsData.events, loadedFile.summary.ppq, groupingThresholdMs);

    return {
      chordCount: chords.length,
      chords: chords.map(c => ({
        name: c.chordName,
        startTick: c.startTime,
        endTick: c.endTime,
        durationTicks: c.endTime - c.startTime,
        notes: c.notes,
      }))
    };
  }
}