import { TimeRange, ValueFilter, MidiSummary, TrackInfo, MidiEventDetails } from './midi.js';

export interface LoadMidiFileArgs {
  filePath: string;
}

export interface LoadMidiFileResult {
  fileId: string;
  filePath: string;
  format: number;
  trackCount: number;
  ppq: number;
  totalEvents: number;
}

export interface GetMidiSummaryArgs {
  fileId?: string;
  filePath?: string;
}

export interface GetMidiSummaryResult extends MidiSummary {}

export interface GetTracksListArgs {
  fileId?: string;
  filePath?: string;
  channelFilter?: number;
  programFilter?: number;
}

export interface GetTracksListResult {
  tracks: TrackInfo[];
}

export interface GetTrackDetailsArgs {
  fileId?: string;
  filePath?: string;
  trackIndex: number;
  timeRange?: TimeRange;
  eventTypeFilter?: string[];
  valueFilter?: ValueFilter;
}

export interface GetTrackDetailsResult {
  track: TrackInfo;
  events: MidiEventDetails[];
}

export interface GetMidiEventsArgs {
  fileId?: string;
  filePath?: string;
  timeRange?: TimeRange;
  eventTypeFilter?: string[];
  trackFilter?: number[];
  valueFilter?: ValueFilter;
}

export interface GetMidiEventsResult {
  events: MidiEventDetails[];
}