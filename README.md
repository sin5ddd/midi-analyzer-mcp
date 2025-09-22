# MIDI Analyzer MCP Server

A Model Context Protocol (MCP) server for analyzing MIDI SMF (Standard MIDI File) files. This server provides comprehensive tools for loading, parsing, and analyzing MIDI files.

## Features

- **MIDI File Loading**: Load and parse MIDI SMF files
- **File Summary**: Get comprehensive information about MIDI files (format, PPQ, tempo, time signature, key signature, etc.)
- **Track Analysis**: List and analyze individual tracks with filtering capabilities
- **Event Extraction**: Extract and filter MIDI events with advanced filtering options
- **Memory Management**: Keep loaded files in memory for efficient repeated access

## Available Tools

### 1. load_midi_file
Load and parse a MIDI SMF file from a specified path.

**Parameters:**
- `filePath` (string): Path to the MIDI file

**Returns:**
- `fileId`: Unique identifier for the loaded file
- `filePath`: Path to the loaded file
- `format`: MIDI format type (0, 1, or 2)
- `trackCount`: Number of tracks
- `ppq`: Pulses per quarter note
- `totalEvents`: Total number of events

### 2. get_midi_summary
Get comprehensive summary information about a MIDI file.

**Parameters:**
- `fileId` (string, optional): ID of loaded file
- `filePath` (string, optional): Path to MIDI file

**Returns:**
- Complete summary including format, PPQ, total ticks, track count, tempo info, time signatures, key signatures

### 3. get_tracks_list
Get list of tracks with optional filtering.

**Parameters:**
- `fileId` or `filePath`: File identifier
- `channelFilter` (number, optional): Filter by MIDI channel (0-15)
- `programFilter` (number, optional): Filter by program number (0-127)

**Returns:**
- Array of track information including names, channels, programs, event counts

### 4. get_track_details
Get detailed information about a specific track.

**Parameters:**
- `fileId` or `filePath`: File identifier
- `trackIndex` (number): Track index to analyze
- `timeRange` (object, optional): Filter events by time range
- `eventTypeFilter` (array, optional): Filter by event types
- `valueFilter` (object, optional): Filter by specific values

**Returns:**
- Track metadata and filtered events

### 5. get_midi_events
Extract MIDI events with comprehensive filtering.

**Parameters:**
- `fileId` or `filePath`: File identifier
- `timeRange` (object, optional): Time range filter
- `eventTypeFilter` (array, optional): Event type filter
- `trackFilter` (array, optional): Track filter
- `valueFilter` (object, optional): Value filter
- `metaTypeFilter` (array, optional): Meta event type filter

**Returns:**
- Filtered array of MIDI events

## Installation

### Prerequisites
- Node.js (version 18 or higher)
- npm (comes with Node.js)

## Adding to Claude Code

### Method 1: Using npx (Recommended - No Local Installation Required)

Add the following configuration to your Claude Code settings file:

```json
{
  "mcpServers": {
    "midi-analyzer": {
      "command": "npx",
      "args": ["sin5ddd/midi-analyzer-mcp"]
    }
  }
}
```

This method automatically downloads and runs the latest version from GitHub without requiring local installation.

### Method 2: Local Installation (For Development or Offline Use)

1. Clone the repository:
   ```bash
   git clone https://github.com/sin5ddd/midi-analyzer-mcp.git
   cd midi-analyzer-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Configure Claude Code:

#### For Windows:
```json
{
  "mcpServers": {
    "midi-analyzer": {
      "command": "node",
      "args": ["C:\\path\\to\\midi-analyzer-mcp\\dist\\index.js"],
      "cwd": "C:\\path\\to\\midi-analyzer-mcp"
    }
  }
}
```

#### For Unix/Linux/macOS:
```json
{
  "mcpServers": {
    "midi-analyzer": {
      "command": "node",
      "args": ["/path/to/midi-analyzer-mcp/dist/index.js"],
      "cwd": "/path/to/midi-analyzer-mcp"
    }
  }
}
```

### Configuration File Locations

Claude Code configuration files are located at:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Quick Setup with npx (Recommended)

1. **Add to Claude Code configuration:**
   ```json
   {
     "mcpServers": {
       "midi-analyzer": {
         "command": "npx",
         "args": ["sin5ddd/midi-analyzer-mcp"]
       }
     }
   }
   ```

2. **Restart Claude Code** to load the new MCP server.

3. **Test the installation** by asking Claude Code:
   ```
   "Load the MIDI file at [path] and analyze its contents"
   ```

### Local Development Setup

1. **Clone and setup the repository:**
   ```bash
   git clone https://github.com/sin5ddd/midi-analyzer-mcp.git
   cd midi-analyzer-mcp
   npm install
   npm run build
   ```

2. **Add to Claude Code configuration:**
   ```json
   {
     "mcpServers": {
       "midi-analyzer": {
         "command": "node",
         "args": ["/path/to/midi-analyzer-mcp/dist/index.js"],
         "cwd": "/path/to/midi-analyzer-mcp"
       }
     }
   }
   ```

## Development

### Local Development
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Run in Production
```bash
npm start
```

## Troubleshooting

1. **Installation Issues:**
   - Ensure Node.js version 18+ is installed: `node --version`
   - Check npm version: `npm --version`
   - Try clearing npm cache: `npm cache clean --force`

2. **Claude Code Integration:**
   - Verify the path to `dist/index.js` is correct and absolute
   - Ensure the project has been built with `npm run build`
   - Check Claude Code logs for MCP server startup errors
   - Make sure Node.js is accessible from the command line

3. **Runtime Issues:**
   - Verify MIDI file paths are correct and accessible
   - Check file permissions for MIDI files
   - Ensure MIDI files are valid SMF format

4. **Updates:**

   **For npx method:** Updates are automatic - npx always downloads the latest version.

   **For local installation:**
   ```bash
   cd /path/to/midi-analyzer-mcp
   git pull origin main
   npm install
   npm run build
   ```
   Then restart Claude Code.

## Event Types

The server recognizes the following MIDI event types:
- `noteOn`: Note on events
- `noteOff`: Note off events
- `noteAftertouch`: Note aftertouch
- `controller`: Control change
- `programChange`: Program change
- `channelAftertouch`: Channel aftertouch
- `pitchBend`: Pitch bend
- `sysEx`: System exclusive
- `meta`: Meta events (tempo, time signature, etc.)

## Filtering Options

### Time Range
Filter events by MIDI tick range:
```json
{
  "timeRange": {
    "startTick": 0,
    "endTick": 1920
  }
}
```

### Value Filter
Filter events by specific values:
```json
{
  "valueFilter": {
    "value1": 60,  // e.g., note number
    "value2": 100, // e.g., velocity
    "value3": 0    // e.g., third value if present
  }
}
```

### Meta Type Filter
Filter meta events by type (for text, lyrics, markers, etc.):
```json
{
  "metaTypeFilter": ["lyrics", "marker", "text"]
}
```

**Supported Meta Event Types:**
- `text` - Generic text events
- `lyrics` - Lyric events
- `marker` - Marker events (section names, rehearsal marks)
- `trackName` - Track name
- `instrumentName` - Instrument name
- `copyright` - Copyright notice
- `cuePoint` - Cue point events
- `programName` - Program name
- `deviceName` - Device name
- `setTempo` - Tempo change events
- `timeSignature` - Time signature events
- `keySignature` - Key signature events

## Error Handling

The server provides detailed error messages for:
- File not found
- Invalid MIDI files
- Out of range track indexes
- Invalid parameters

## License

MIT