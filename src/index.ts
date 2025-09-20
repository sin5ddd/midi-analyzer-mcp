#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { LoadMidiFileTool } from './tools/loadMidiFile.js';
import { GetMidiSummaryTool } from './tools/getMidiSummary.js';
import { GetTracksListTool } from './tools/getTracksList.js';
import { GetTrackDetailsTool } from './tools/getTrackDetails.js';
import { GetMidiEventsTool } from './tools/getMidiEvents.js';

class MidiAnalyzerServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'midi-analyzer-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          LoadMidiFileTool.definition,
          GetMidiSummaryTool.definition,
          GetTracksListTool.definition,
          GetTrackDetailsTool.definition,
          GetMidiEventsTool.definition,
        ],
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'load_midi_file':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await LoadMidiFileTool.execute(args as any), null, 2),
                },
              ],
            };

          case 'get_midi_summary':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await GetMidiSummaryTool.execute(args as any), null, 2),
                },
              ],
            };

          case 'get_tracks_list':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await GetTracksListTool.execute(args as any), null, 2),
                },
              ],
            };

          case 'get_track_details':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await GetTrackDetailsTool.execute(args as any), null, 2),
                },
              ],
            };

          case 'get_midi_events':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(await GetMidiEventsTool.execute(args as any), null, 2),
                },
              ],
            };

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing tool ${name}: ${errorMessage}`
        );
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MIDI Analyzer MCP server running on stdio');
  }
}

// Start the server
const server = new MidiAnalyzerServer();
server.run().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});