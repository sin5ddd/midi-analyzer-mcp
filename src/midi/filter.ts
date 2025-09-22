import {
  MidiEventDetails,
  TrackInfo,
  TimeRange,
  ValueFilter
} from '../types/midi.js';

export class MidiFilter {
  static filterEventsByTimeRange(
    events: MidiEventDetails[],
    timeRange: TimeRange
  ): MidiEventDetails[] {
    return events.filter(event =>
      event.tick >= timeRange.startTick && event.tick <= timeRange.endTick
    );
  }

  static filterEventsByType(
    events: MidiEventDetails[],
    eventTypes: string[]
  ): MidiEventDetails[] {
    return events.filter(event => eventTypes.includes(event.type));
  }

  static filterEventsByChannel(
    events: MidiEventDetails[],
    channels: number[]
  ): MidiEventDetails[] {
    return events.filter(event =>
      event.channel !== undefined && channels.includes(event.channel)
    );
  }

  static filterEventsByValue(
    events: MidiEventDetails[],
    valueFilter: ValueFilter
  ): MidiEventDetails[] {
    return events.filter(event => {
      if (valueFilter.value1 !== undefined && event.value1 !== valueFilter.value1) {
        return false;
      }
      if (valueFilter.value2 !== undefined && event.value2 !== valueFilter.value2) {
        return false;
      }
      if (valueFilter.value3 !== undefined && event.value3 !== valueFilter.value3) {
        return false;
      }
      return true;
    });
  }

  static filterEventsByMetaType(
    events: MidiEventDetails[],
    metaTypes: string[]
  ): MidiEventDetails[] {
    return events.filter(event =>
      event.metaType && metaTypes.includes(event.metaType)
    );
  }

  static filterTracksByChannel(
    tracks: TrackInfo[],
    channel: number
  ): TrackInfo[] {
    return tracks.filter(track => track.channel === channel);
  }

  static filterTracksByProgram(
    tracks: TrackInfo[],
    program: number
  ): TrackInfo[] {
    return tracks.filter(track => track.program === program);
  }

  static applyEventFilters(
    events: MidiEventDetails[],
    filters: {
      timeRange?: TimeRange;
      eventTypes?: string[];
      channels?: number[];
      valueFilter?: ValueFilter;
      metaTypes?: string[];
    }
  ): MidiEventDetails[] {
    let filteredEvents = events;

    if (filters.timeRange) {
      filteredEvents = this.filterEventsByTimeRange(filteredEvents, filters.timeRange);
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      filteredEvents = this.filterEventsByType(filteredEvents, filters.eventTypes);
    }

    if (filters.channels && filters.channels.length > 0) {
      filteredEvents = this.filterEventsByChannel(filteredEvents, filters.channels);
    }

    if (filters.valueFilter) {
      filteredEvents = this.filterEventsByValue(filteredEvents, filters.valueFilter);
    }

    if (filters.metaTypes && filters.metaTypes.length > 0) {
      filteredEvents = this.filterEventsByMetaType(filteredEvents, filters.metaTypes);
    }

    return filteredEvents;
  }

  static applyTrackFilters(
    tracks: TrackInfo[],
    filters: {
      channel?: number;
      program?: number;
    }
  ): TrackInfo[] {
    let filteredTracks = tracks;

    if (filters.channel !== undefined) {
      filteredTracks = this.filterTracksByChannel(filteredTracks, filters.channel);
    }

    if (filters.program !== undefined) {
      filteredTracks = this.filterTracksByProgram(filteredTracks, filters.program);
    }

    return filteredTracks;
  }
}