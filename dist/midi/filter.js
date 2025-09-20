export class MidiFilter {
    static filterEventsByTimeRange(events, timeRange) {
        return events.filter(event => event.tick >= timeRange.startTick && event.tick <= timeRange.endTick);
    }
    static filterEventsByType(events, eventTypes) {
        return events.filter(event => eventTypes.includes(event.type));
    }
    static filterEventsByChannel(events, channels) {
        return events.filter(event => event.channel !== undefined && channels.includes(event.channel));
    }
    static filterEventsByValue(events, valueFilter) {
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
    static filterTracksByChannel(tracks, channel) {
        return tracks.filter(track => track.channel === channel);
    }
    static filterTracksByProgram(tracks, program) {
        return tracks.filter(track => track.program === program);
    }
    static applyEventFilters(events, filters) {
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
        return filteredEvents;
    }
    static applyTrackFilters(tracks, filters) {
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
