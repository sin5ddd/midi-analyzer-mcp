use crate::model::{Analyzed, TrackStat};
use crate::utils::{sha256_hex, ticks_to_seconds};
use anyhow::{Result, anyhow};
use std::collections::{BTreeSet, HashMap};

pub fn analyze_basic(bytes: &[u8]) -> Result<Analyzed> {
    let smf = midly::Smf::parse(bytes).map_err(|e| anyhow!("midly parse error: {e}"))?;
    let (format, ppq) = match smf.header.timing {
        midly::Timing::Metrical(p) => (format!("{:?}", smf.header.format), p.as_int()),
        midly::Timing::Timecode(_, _) => (format!("{:?}", smf.header.format), 480),
    };

    use midly::{MetaMessage as MM, MidiMessage as Msg, TrackEventKind as TEK};
    let mut tempo_map: Vec<(u64, f64)> = Vec::new();
    let mut time_sigs: Vec<(u64, u8, u8)> = Vec::new();
    let mut key_sigs: Vec<(u64, i8, bool)> = Vec::new();
    let mut tracks_info: Vec<TrackStat> = Vec::new();

    for (ti, track) in smf.tracks.iter().enumerate() {
        let mut name: Option<String> = None;
        let mut channels = BTreeSet::new();
        let mut programs: HashMap<u8, u8> = HashMap::new();
        let mut note_count: usize = 0;
        let mut min_pitch: Option<u8> = None;
        let mut max_pitch: Option<u8> = None;
        let mut vel_sum: u64 = 0;
        let mut vel_n: u64 = 0;
        let mut has_drum = false;
        let mut tick_acc: u64 = 0;
        for ev in track {
            tick_acc += ev.delta.as_int() as u64;
            match &ev.kind {
                TEK::Meta(MM::Tempo(us)) => {
                    let bpm = 60_000_000.0 / (us.as_int() as f64);
                    tempo_map.push((tick_acc, bpm));
                }
                TEK::Meta(MM::TimeSignature(n, d, _, _)) => {
                    time_sigs.push((tick_acc, *n, 2u8.pow((*d).into())));
                }
                TEK::Meta(MM::KeySignature(sf, mi)) => {
                    key_sigs.push((tick_acc, *sf as i8, *mi));
                }
                TEK::Meta(MM::TrackName(name_bytes)) => {
                    name = Some(String::from_utf8_lossy(name_bytes).to_string());
                }
                TEK::Midi { channel, message } => {
                    let ch = channel.as_int();
                    channels.insert(ch);
                    if ch == 9 {
                        has_drum = true;
                    }
                    match message {
                        Msg::ProgramChange { program } => {
                            programs.insert(ch, program.as_int());
                        }
                        Msg::NoteOn { key, vel } => {
                            let p = key.as_int();
                            let v = vel.as_int();
                            if v > 0 {
                                note_count += 1;
                                vel_sum += v as u64;
                                vel_n += 1;
                                min_pitch = Some(min_pitch.map_or(p, |m| m.min(p)));
                                max_pitch = Some(max_pitch.map_or(p, |m| m.max(p)));
                            }
                        }
                        _ => {}
                    }
                }
                _ => {}
            }
        }
        let velocity_avg = if vel_n > 0 {
            Some(vel_sum as f32 / vel_n as f32)
        } else {
            None
        };
        let note_range = match (min_pitch, max_pitch) {
            (Some(a), Some(b)) => Some((a, b)),
            _ => None,
        };
        tracks_info.push(TrackStat {
            index: ti,
            name,
            channels: channels.into_iter().collect(),
            programs,
            note_count,
            note_range,
            velocity_avg,
            has_drum,
        });
    }

    let duration_ticks: u64 = smf
        .tracks
        .iter()
        .map(|t| t.iter().map(|e| e.delta.as_int() as u64).sum::<u64>())
        .max()
        .unwrap_or(0);
    let duration_sec = ticks_to_seconds(duration_ticks, ppq as u64, &tempo_map);
    let file_id = sha256_hex(bytes);

    Ok(Analyzed {
        file_id,
        format,
        ppq,
        duration_ticks,
        duration_sec,
        tempo_map,
        time_sigs,
        key_sigs,
        tracks: tracks_info,
    })
}
