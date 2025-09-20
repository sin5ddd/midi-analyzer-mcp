import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GetMidiSummaryArgs, GetMidiSummaryResult } from '../types/tools.js';
import { LoadMidiFileTool } from './loadMidiFile.js';
import { MidiParser } from '../midi/parser.js';
import { MidiAnalyzer } from '../midi/analyzer.js';

export class GetMidiSummaryTool {
  static definition: Tool = {
    name: 'get_midi_summary',
    description: 'Get comprehensive summary information about a MIDI file',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'ID of the loaded MIDI file'
        },
        filePath: {
          type: 'string',
          description: 'Path to the MIDI file (if not using fileId)'
        }
      },
      oneOf: [
        { required: ['fileId'] },
        { required: ['filePath'] }
      ]
    }
  };

  static async execute(args: GetMidiSummaryArgs): Promise<GetMidiSummaryResult> {
    try {
      let loadedFile;

      if (args.fileId) {
        loadedFile = LoadMidiFileTool.getLoadedFile(args.fileId);
        if (!loadedFile) {
          throw new Error(`No loaded file found with ID: ${args.fileId}`);
        }
      } else if (args.filePath) {
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
      } else {
        throw new Error('Either fileId or filePath must be provided');
      }

      return loadedFile.summary;

    } catch (error) {
      throw new Error(`Failed to get MIDI summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}