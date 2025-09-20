import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { GetTracksListArgs, GetTracksListResult } from '../types/tools.js';
import { LoadMidiFileTool } from './loadMidiFile.js';
import { MidiFilter } from '../midi/filter.js';

export class GetTracksListTool {
  static definition: Tool = {
    name: 'get_tracks_list',
    description: 'Get list of tracks in a MIDI file with optional filtering by channel or program',
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
        channelFilter: {
          type: 'number',
          description: 'Filter tracks by MIDI channel (0-15)',
          minimum: 0,
          maximum: 15
        },
        programFilter: {
          type: 'number',
          description: 'Filter tracks by program number (0-127)',
          minimum: 0,
          maximum: 127
        }
      }
    }
  };

  static async execute(args: GetTracksListArgs): Promise<GetTracksListResult> {
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

      let tracks = loadedFile.tracks;

      // Apply filters
      const filters: { channel?: number; program?: number } = {};
      if (args.channelFilter !== undefined) {
        filters.channel = args.channelFilter;
      }
      if (args.programFilter !== undefined) {
        filters.program = args.programFilter;
      }

      if (Object.keys(filters).length > 0) {
        tracks = MidiFilter.applyTrackFilters(tracks, filters);
      }

      return { tracks };

    } catch (error) {
      throw new Error(`Failed to get tracks list: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}