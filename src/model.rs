use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Default)]
pub struct AnalyzerCache {
    pub by_id: HashMap<String, Analyzed>,
    pub by_alias: HashMap<String, String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrackStat {
    pub index: usize,
    pub name: Option<String>,
    pub channels: Vec<u8>,
    pub programs: HashMap<u8, u8>,
    pub note_count: usize,
    pub note_range: Option<(u8,u8)>,
    pub velocity_avg: Option<f32>,
    pub has_drum: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Analyzed {
    pub file_id: String,
    pub format: String,
    pub ppq: u16,
    pub duration_ticks: u64,
    pub duration_sec: Option<f64>,
    pub tempo_map: Vec<(u64, f64)>, // (tick, bpm)
    pub time_sigs: Vec<(u64, u8, u8)>,
    pub key_sigs: Vec<(u64, i8, bool)>, // (tick, sf, minor?)
    pub tracks: Vec<TrackStat>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NoteSpan {
    pub track: usize,
    pub chan: u8,
    pub pitch: u8,
    pub start_tick: u64,
    pub end_tick: u64,
    pub vel_on: u8,
    pub vel_off: u8,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FlatEvent {
    pub track: usize,
    pub tick: u64,
    pub sec: Option<f64>,
    pub kind: String, // e.g., "note_on", "tempo"
    pub chan: Option<u8>,
    pub data: serde_json::Value,
}
