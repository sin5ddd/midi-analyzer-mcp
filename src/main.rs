mod analyze;
mod filters;
mod model;
mod utils;

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::io::{self, BufRead};
use tokio::io::AsyncWriteExt;

use crate::analyze::analyze_basic;
use crate::filters::EventFilters;
use crate::model::{Analyzed, AnalyzerCache, FlatEvent, NoteSpan};
use crate::utils::{
	guess_ext_is_midi, resolve_bytes_and_id, sha256_hex,
};

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcReq {
    jsonrpc: String,
    id: Option<serde_json::Value>,
    method: String,
    #[serde(default)]
    params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcResp<T> {
    jsonrpc: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<serde_json::Value>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let stdin = io::stdin();
    let mut stdout = tokio::io::stdout();

    let mut cache: AnalyzerCache = AnalyzerCache::default();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let req: JsonRpcReq = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                let err =
                    serde_json::json!({"code": -32700, "message": format!("parse error: {e}")});
                let resp = JsonRpcResp::<serde_json::Value> {
                    jsonrpc: "2.0",
                    id: None,
                    result: None,
                    error: Some(err),
                };
                stdout
                    .write_all(serde_json::to_string(&resp)?.as_bytes())
                    .await?;
                stdout.write_all(b"\n").await?;
                continue;
            }
        };

        let response = handle_request(req, &mut cache).await;
        stdout
            .write_all(serde_json::to_string(&response)?.as_bytes())
            .await?;
        stdout.write_all(b"\n").await?;
    }
    Ok(())
}

async fn handle_request(
    req: JsonRpcReq,
    cache: &mut AnalyzerCache,
) -> JsonRpcResp<serde_json::Value> {
    match req.method.as_str() {
        "tools/list" => JsonRpcResp {
            jsonrpc: "2.0",
            id: req.id,
            result: Some(list_tools()),
            error: None,
        },
        "tools/call" => {
            let name = req
                .params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let args = req.params.get("arguments").cloned().unwrap_or_default();
            let result = match name {
                "midi_open_file" => midi_open_file_handler(args, cache).await,
                "midi_file_info" => midi_file_info_handler(args, cache).await,
                "midi_track_list" => midi_track_list_handler(args, cache).await,
                "midi_track_detail" => midi_track_detail_handler(args, cache).await,
                "midi_system_events" => midi_system_events_handler(args, cache).await,
                "midi_all_event" => midi_all_event_handler(args, cache).await,
                _ => Err(anyhow!("unknown tool: {name}")),
            };
            match result {
                Ok(v) => JsonRpcResp {
                    jsonrpc: "2.0",
                    id: req.id,
                    result: Some(v),
                    error: None,
                },
                Err(e) => JsonRpcResp {
                    jsonrpc: "2.0",
                    id: req.id,
                    result: None,
                    error: Some(serde_json::json!({"code": -32000, "message": e.to_string()})),
                },
            }
        }
        _ => JsonRpcResp {
            jsonrpc: "2.0",
            id: req.id,
            result: None,
            error: Some(serde_json::json!({"code": -32601, "message": "method not found"})),
        },
    }
}

fn list_tools() -> serde_json::Value {
    serde_json::json!({
        "tools": [
            {"name":"midi_open_file","description":"指定パスのMIDIを読み込み、file_idを返す（後続ツールはfile_idを使用可能）","input_schema":{
                "type":"object","properties":{
                    "path":{"type":"string"},
                    "alias":{"type":"string"},
                    "validate_extension":{"type":"boolean","default":true},
                    "max_size_bytes":{"type":"integer","default":10485760}
                },
                "required":["path"]
            }},
            {"name":"midi_file_info","description":"ファイル全体概要（メタ/テンポ/拍子/キー/曲尺/トラック統計など）","input_schema":{
                "type":"object","properties":{
                    "file_id":{"type":"string"},
                    "path":{"type":"string"},
                    "include_tempo_map":{"type":"boolean","default":true},
                    "include_time_signatures":{"type":"boolean","default":true},
                    "include_key_signatures":{"type":"boolean","default":true},
                    "include_markers":{"type":"boolean","default":false},
                    "time_slice":{"type":"object","properties":{
                        "start_tick":{"type":"integer"},
                        "end_tick":{"type":"integer"},
                        "start_sec":{"type":"number"},
                        "end_sec":{"type":"number"}
                    }}
                },
                "required":["path"],
                "anyOf":[{"required":["file_id"]},{"required":["path"]}]
            }},
            {"name":"midi_track_list","description":"トラック一覧（名前/チャンネル/プログラム/ノート統計）","input_schema":{
                "type":"object","properties":{
                    "file_id":{"type":"string"},
                    "path":{"type":"string"},
                    "track_indexes":{"type":"array","items":{"type":"integer"}},
                    "channel_filter":{"type":"array","items":{"type":"integer","minimum":0,"maximum":15}},
                    "program_filter":{"type":"array","items":{"type":"integer","minimum":0,"maximum":127}},
                    "time_slice":{"type":"object","properties":{
                        "start_tick":{"type":"integer"},
                        "end_tick":{"type":"integer"}
                    }}
                },
                "anyOf":[{"required":["file_id"]},{"required":["path"]}]
            }},
            {"name":"midi_track_detail","description":"特定トラック詳細（代表ピッチ/音域/イベント統計、必要に応じてノート/CC要約）","input_schema":{
                "type":"object","properties":{
                    "file_id":{"type":"string"},
                    "path":{"type":"string"},
                    "track_index":{"type":"integer"},
                    "include_histograms":{"type":"boolean","default":true},
                    "include_program_changes":{"type":"boolean","default":true},
                    "include_cc_summary":{"type":"boolean","default":false},
                    "event_filters":{"type":"object","properties":{
                        "include":{"type":"array","items":{"type":"string"}},
                        "exclude":{"type":"array","items":{"type":"string"}},
                        "channels":{"type":"array","items":{"type":"integer","minimum":0,"maximum":15}},
                        "pitches":{"type":"array","items":{"type":"integer","minimum":0,"maximum":127}},
                        "controllers":{"type":"array","items":{"type":"integer","minimum":0,"maximum":127}}
                    }},
                    "time_slice":{"type":"object","properties":{
                        "start_tick":{"type":"integer"},
                        "end_tick":{"type":"integer"}
                    }}
                },
                "required":["track_index"],
                "anyOf":[{"required":["file_id"]},{"required":["path"]}]
            }},
            {"name":"midi_system_events","description":"メタ/システムイベントの抽出（テンポ/拍子/キー/マーカー/テキスト/SysEx など）","input_schema":{
                "type":"object","properties":{
                    "file_id":{"type":"string"},
                    "path":{"type":"string"},
                    "kinds":{"type":"array","items":{"type":"string"},"default":["tempo","time_signature","key_signature","marker","text","track_name","sysex"]},
                    "time_slice":{"type":"object","properties":{
                        "start_tick":{"type":"integer"},
                        "end_tick":{"type":"integer"}
                    }},
                    "limit":{"type":"integer","minimum":1,"maximum":10000,"default":1000},
                    "offset":{"type":"integer","minimum":0,"default":0}
                },
                "anyOf":[{"required":["file_id"]},{"required":["path"]}]
            }},
            {"name":"midi_all_event","description":"指定時間範囲のイベント一覧。大量の場合はチャンク分割。","input_schema":{
                "type":"object","properties":{
                    "file_id":{"type":"string"},
                    "path":{"type":"string"},
                    "track_indexes":{"type":"array","items":{"type":"integer"}},
                    "event_filters":{"type":"object","properties":{
                        "include":{"type":"array","items":{"type":"string"},"default":["note","cc","pbend","prog","aftertouch","meta","sysex"]},
                        "exclude":{"type":"array","items":{"type":"string"}},
                        "channels":{"type":"array","items":{"type":"integer","minimum":0,"maximum":15}},
                        "pitches":{"type":"array","items":{"type":"integer","minimum":0,"maximum":127}},
                        "controllers":{"type":"array","items":{"type":"integer","minimum":0,"maximum":127}},
                        "programs":{"type":"array","items":{"type":"integer","minimum":0,"maximum":127}}
                    }},
                    "time_slice":{"type":"object","properties":{
                        "start_tick":{"type":"integer"},
                        "end_tick":{"type":"integer"}
                    }},
                    "chunk_size":{"type":"integer","minimum":100,"maximum":20000,"default":2000},
                    "chunk_index":{"type":"integer","minimum":0,"default":0},
                    "normalize_note_pairs":{"type":"boolean","default":true},
                    "return_format":{"type":"string","enum":["flat_events","paired_notes"],"default":"paired_notes"}
                },
                "anyOf":[{"required":["file_id"]},{"required":["path"]}]
            }}
        ]
    })
}

async fn midi_open_file_handler(
    args: serde_json::Value,
    cache: &mut AnalyzerCache,
) -> Result<serde_json::Value> {
    let path = args
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("missing path"))?;
    let alias = args.get("alias").and_then(|v| v.as_str());
    let validate_ext = args
        .get("validate_extension")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let max_size = args
        .get("max_size_bytes")
        .and_then(|v| v.as_u64())
        .unwrap_or(10 * 1024 * 1024);

    if validate_ext && !guess_ext_is_midi(path) {
        return Err(anyhow!("unsupported extension (expected .mid/.midi)"));
    }
    let meta = tokio::fs::metadata(path)
        .await
        .with_context(|| format!("stat failed: {}", path))?;
    if !meta.is_file() {
        return Err(anyhow!("not a file"));
    }
    if meta.len() as u64 > max_size {
        return Err(anyhow!("file too large: {} bytes", meta.len()));
    }

    let bytes = tokio::fs::read(path)
        .await
        .with_context(|| format!("read failed: {}", path))?;
    let file_id = sha256_hex(&bytes);

    if !cache.by_id.contains_key(&file_id) {
        let smf = midly::Smf::parse(&bytes).map_err(|e| anyhow!("midly parse error: {e}"))?;
        let (format, ppq) = match smf.header.timing {
            midly::Timing::Metrical(p) => (format!("{:?}", smf.header.format), p.as_int()),
            midly::Timing::Timecode(_, _) => (format!("{:?}", smf.header.format), 480),
        };
        let duration_ticks: u64 = smf
            .tracks
            .iter()
            .map(|t| t.iter().map(|e| e.delta.as_int() as u64).sum::<u64>())
            .max()
            .unwrap_or(0);
        let analyzed = Analyzed {
            file_id: file_id.clone(),
            format,
            ppq,
            duration_ticks,
            duration_sec: None,
            tempo_map: Vec::new(),
            time_sigs: Vec::new(),
            key_sigs: Vec::new(),
            tracks: Vec::new(),
        };
        cache.by_id.insert(file_id.clone(), analyzed);
    }
    if let Some(a) = alias {
        cache.by_alias.insert(a.to_string(), file_id.clone());
    }

    Ok(serde_json::json!({
        "ok": true,
        "file_id": file_id,
        "path": path,
        "size_bytes": bytes.len(),
        "alias": alias
    }))
}

async fn midi_file_info_handler(
    args: serde_json::Value,
    cache: &mut AnalyzerCache,
) -> Result<serde_json::Value> {
    let (bytes, fid) = resolve_bytes_and_id(&args, cache).await?;
    let analyzed = if let Some(a) = cache.by_id.get(&fid) {
        a.clone()
    } else {
        if bytes.is_empty() {
            return Err(anyhow!(
                "file not loaded; provide path or call midi_open_file first"
            ));
        }
        let a = analyze_basic(&bytes)?;
        cache.by_id.insert(a.file_id.clone(), a.clone());
        a
    };

    // time_slice handling (optional, currently used only for future sec conversion)
    let include_tempo_map = args
        .get("include_tempo_map")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let include_time_sigs = args
        .get("include_time_signatures")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let include_key_sigs = args
        .get("include_key_signatures")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    Ok(serde_json::json!({
        "ok": true,
        "file_id": analyzed.file_id,
        "format": analyzed.format,
        "ppq": analyzed.ppq,
        "duration_ticks": analyzed.duration_ticks,
        "duration_sec": analyzed.duration_sec,
        "tempo_map": if include_tempo_map { analyzed.tempo_map } else { Vec::<(u64,f64)>::new() },
        "time_signatures": if include_time_sigs { analyzed.time_sigs } else { Vec::<(u64,u8,u8)>::new() },
        "key_signatures": if include_key_sigs { analyzed.key_sigs } else { Vec::<(u64,i8,bool)>::new() },
        "tracks": analyzed.tracks
    }))
}

async fn midi_track_list_handler(
    args: serde_json::Value,
    cache: &mut AnalyzerCache,
) -> Result<serde_json::Value> {
    let (bytes, fid) = resolve_bytes_and_id(&args, cache).await?;
    let analyzed = if let Some(a) = cache.by_id.get(&fid) {
        a.clone()
    } else {
        if bytes.is_empty() {
            return Err(anyhow!(
                "file not loaded; provide path or midi_open_file first"
            ));
        }
        let a = analyze_basic(&bytes)?;
        cache.by_id.insert(a.file_id.clone(), a.clone());
        a
    };

    let track_indexes: Option<Vec<usize>> = args
        .get("track_indexes")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_u64().map(|u| u as usize))
                .collect()
        });
    let channel_filter: Option<Vec<u8>> = args
        .get("channel_filter")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_u64().map(|u| u as u8))
                .collect()
        });
    let program_filter: Option<Vec<u8>> = args
        .get("program_filter")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_u64().map(|u| u as u8))
                .collect()
        });

    let mut tracks = analyzed.tracks;
    if let Some(idxs) = track_indexes {
        tracks.retain(|t| idxs.contains(&t.index));
    }
    if let Some(chs) = channel_filter {
        tracks.retain(|t| t.channels.iter().any(|c| chs.contains(c)));
    }
    if let Some(ps) = program_filter {
        tracks.retain(|t| t.programs.values().any(|p| ps.contains(p)));
    }

    Ok(serde_json::json!({"ok": true, "file_id": analyzed.file_id, "tracks": tracks}))
}

async fn midi_track_detail_handler(
    args: serde_json::Value,
    cache: &mut AnalyzerCache,
) -> Result<serde_json::Value> {
    let (bytes, fid) = resolve_bytes_and_id(&args, cache).await?;
    let analyzed = if let Some(a) = cache.by_id.get(&fid) {
        a.clone()
    } else {
        if bytes.is_empty() {
            return Err(anyhow!("file not loaded; provide path"));
        }
        let a = analyze_basic(&bytes)?;
        cache.by_id.insert(a.file_id.clone(), a.clone());
        a
    };

    let track_index = args
        .get("track_index")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| anyhow!("missing track_index"))? as usize;
    let t = analyzed
        .tracks
        .iter()
        .find(|tr| tr.index == track_index)
        .ok_or_else(|| anyhow!("track_index out of range"))?
        .clone();

    // Basic histograms (notes only) by scanning the track
    let include_histograms = args
        .get("include_histograms")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let include_cc_summary = args
        .get("include_cc_summary")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut pitch_hist = vec![0u32; 128];
    let mut cc_hist = vec![0u32; 128];
    if include_histograms || include_cc_summary {
        // Need bytes
        let (bytes2, _) = if bytes.is_empty() {
            resolve_bytes_and_id(&serde_json::json!({"path":""}), cache)
                .await
                .unwrap_or((Vec::new(), String::new()))
        } else {
            (bytes, fid.clone())
        };
        if !bytes2.is_empty() {
            let smf = midly::Smf::parse(&bytes2).map_err(|e| anyhow!("midly parse error: {e}"))?;
            use midly::{MidiMessage as Msg, TrackEventKind as TEK};
            if let Some(track) = smf.tracks.get(track_index) {
                let mut _tick = 0u64;
                for ev in track {
                    _tick += ev.delta.as_int() as u64;
                    match &ev.kind {
                        TEK::Midi {
                            channel: _,
                            message,
                        } => match message {
                            Msg::NoteOn { key, vel } => {
                                if vel.as_int() > 0 {
                                    let p = key.as_int() as usize;
                                    if p < 128 {
                                        pitch_hist[p] += 1;
                                    }
                                }
                            }
                            Msg::Controller { controller, .. } => {
                                let cc = controller.as_int() as usize;
                                if cc < 128 {
                                    cc_hist[cc] += 1;
                                }
                            }
                            _ => {}
                        },
                        _ => {}
                    }
                }
            }
        }
    }

    Ok(serde_json::json!({
        "ok": true,
        "file_id": analyzed.file_id,
        "track": t,
        "pitch_hist": if include_histograms { Some(pitch_hist) } else { None::<Vec<u32>> },
        "cc_hist": if include_cc_summary { Some(cc_hist) } else { None::<Vec<u32>> }
    }))
}

async fn midi_system_events_handler(
    args: serde_json::Value,
    cache: &mut AnalyzerCache,
) -> Result<serde_json::Value> {
    let (bytes, fid) = resolve_bytes_and_id(&args, cache).await?;
    let bytes = if bytes.is_empty() {
	    return if let Some(_a) = cache.by_id.get(&fid) {
		    Err(anyhow!("file bytes not available; pass path for now"))
	    } else {
		    Err(anyhow!("file not available"))
	    }
    } else {
        bytes
    };
    let smf = midly::Smf::parse(&bytes).map_err(|e| anyhow!("midly parse error: {e}"))?;

    let kinds: Vec<String> = args
        .get("kinds")
        .and_then(|a| a.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(|t| t.to_string()))
                .collect()
        })
        .unwrap_or_else(|| {
            vec![
                "tempo".into(),
                "time_signature".into(),
                "key_signature".into(),
                "marker".into(),
                "text".into(),
                "track_name".into(),
                "sysex".into(),
            ]
        });
    let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(1000) as usize;
    let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

    let mut events: Vec<serde_json::Value> = Vec::new();
    use midly::{MetaMessage as MM, TrackEventKind as TEK};
    for (ti, track) in smf.tracks.iter().enumerate() {
        let mut tick = 0u64;
        for ev in track {
            tick += ev.delta.as_int() as u64;
            match &ev.kind {
                TEK::Meta(mm) => {
                    match mm {
                        MM::Tempo(us) if kinds.contains(&"tempo".to_string()) => events.push(serde_json::json!({"track":ti, "tick":tick, "type":"tempo", "data": {"bpm": 60_000_000.0 / (us.as_int() as f64)}})),
                        MM::TimeSignature(n,d,_,_) if kinds.contains(&"time_signature".to_string()) => events.push(serde_json::json!({"track":ti, "tick":tick, "type":"time_signature", "data": {"num": n, "den": 1u32 << (*d as u32)}})),
                        MM::KeySignature(sf,mi) if kinds.contains(&"key_signature".to_string()) => events.push(serde_json::json!({"track":ti, "tick":tick, "type":"key_signature", "data": {"sf": *sf as i8, "minor": *mi}})),
                        MM::Marker(txt) if kinds.contains(&"marker".to_string()) => events.push(serde_json::json!({"track":ti, "tick":tick, "type":"marker", "data": {"text": String::from_utf8_lossy(txt)}})),
                        MM::Text(txt) if kinds.contains(&"text".to_string()) => events.push(serde_json::json!({"track":ti, "tick":tick, "type":"text", "data": {"text": String::from_utf8_lossy(txt)}})),
                        MM::TrackName(txt) if kinds.contains(&"track_name".to_string()) => events.push(serde_json::json!({"track":ti, "tick":tick, "type":"track_name", "data": {"text": String::from_utf8_lossy(txt)}})),
                        _ => {}
                    }
                }
                TEK::SysEx(data) if kinds.contains(&"sysex".to_string()) => events.push(serde_json::json!({"track":ti, "tick":tick, "type":"sysex", "data": {"len": data.len()}})),
                _ => {}
            }
        }
    }
    let total = events.len();
    let slice = if offset >= total {
        &[]
    } else {
        &events[offset..total.min(offset + limit)]
    };

    Ok(
        serde_json::json!({"ok": true, "file_id": fid, "events": slice, "limit": limit, "offset": offset, "total": total}),
    )
}

async fn midi_all_event_handler(
    args: serde_json::Value,
    cache: &mut AnalyzerCache,
) -> Result<serde_json::Value> {
    let (bytes, fid) = resolve_bytes_and_id(&args, cache).await?;
    let bytes = if bytes.is_empty() {
        return Err(anyhow!("file bytes not available; pass path for now"));
    } else {
        bytes
    };
    let smf = midly::Smf::parse(&bytes).map_err(|e| anyhow!("midly parse error: {e}"))?;

    let track_indexes: Option<Vec<usize>> = args
        .get("track_indexes")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_u64().map(|u| u as usize))
                .collect()
        });
    let filters =
        EventFilters::from_json(args.get("event_filters").unwrap_or(&serde_json::json!({})));
    let start_tick = args
        .get("time_slice")
        .and_then(|ts| ts.get("start_tick"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let end_tick = args
        .get("time_slice")
        .and_then(|ts| ts.get("end_tick"))
        .and_then(|v| v.as_u64());
    let chunk_size = args
        .get("chunk_size")
        .and_then(|v| v.as_u64())
        .unwrap_or(2000);
    let chunk_index = args
        .get("chunk_index")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let return_format = args
        .get("return_format")
        .and_then(|v| v.as_str())
        .unwrap_or("paired_notes");

    use midly::{MidiMessage as Msg, TrackEventKind as TEK};
    use std::collections::HashMap as HM;
    let mut on_map: HM<(usize, u8, u8), (u64, u8)> = HM::new();

    let mut flat: Vec<FlatEvent> = Vec::new();
    let mut paired: Vec<NoteSpan> = Vec::new();
    let mut _total_pass = 0usize;

    for (ti, track) in smf.tracks.iter().enumerate() {
        if let Some(idxs) = &track_indexes {
            if !idxs.contains(&ti) {
                continue;
            }
        }
        let mut tick = 0u64;
        for ev in track {
            tick += ev.delta.as_int() as u64;
            if tick < start_tick {
                continue;
            }
            if let Some(et) = end_tick {
                if tick > et {
                    break;
                }
            }
            match &ev.kind {
                TEK::Midi { channel, message } => {
                    let ch = channel.as_int();
                    if let Some(chs) = &filters.channels {
                        if !chs.contains(&ch) {
                            continue;
                        }
                    }
                    match message {
                        Msg::NoteOn { key, vel } => {
                            let p = key.as_int();
                            let v = vel.as_int();
                            if let Some(ps) = &filters.pitches {
                                if !ps.contains(&p) {
                                    continue;
                                }
                            }
                            if v == 0 {
                                if let Some((st, von)) = on_map.remove(&(ti, ch, p)) {
                                    if return_format == "paired_notes" && filters.includes("note") {
                                        paired.push(NoteSpan {
                                            track: ti,
                                            chan: ch,
                                            pitch: p,
                                            start_tick: st,
                                            end_tick: tick,
                                            vel_on: von,
                                            vel_off: 64,
                                        });
                                    }
                                }
                            } else {
                                if filters.includes("note") {
                                    on_map.insert((ti, ch, p), (tick, v));
                                }
                                if return_format == "flat_events" && filters.includes("note") {
                                    _total_pass += 1;
                                    flat.push(FlatEvent {
                                        track: ti,
                                        tick,
                                        sec: None,
                                        kind: "note_on".into(),
                                        chan: Some(ch),
                                        data: serde_json::json!({"pitch":p,"vel":v}),
                                    });
                                }
                            }
                        }
                        Msg::NoteOff { key, vel } => {
                            let p = key.as_int();
                            let vo = vel.as_int();
                            if let Some(ps) = &filters.pitches {
                                if !ps.contains(&p) {
                                    continue;
                                }
                            }
                            if let Some((st, von)) = on_map.remove(&(ti, ch, p)) {
                                if return_format == "paired_notes" && filters.includes("note") {
                                    paired.push(NoteSpan {
                                        track: ti,
                                        chan: ch,
                                        pitch: p,
                                        start_tick: st,
                                        end_tick: tick,
                                        vel_on: von,
                                        vel_off: vo,
                                    });
                                }
                            }
                            if return_format == "flat_events" && filters.includes("note") {
                                _total_pass += 1;
                                flat.push(FlatEvent {
                                    track: ti,
                                    tick,
                                    sec: None,
                                    kind: "note_off".into(),
                                    chan: Some(ch),
                                    data: serde_json::json!({"pitch":p,"vel":vo}),
                                });
                            }
                        }
                        Msg::Controller { controller, value } => {
                            let cc = controller.as_int();
                            if let Some(cs) = &filters.controllers {
                                if !cs.contains(&cc) {
                                    continue;
                                }
                            }
                            if !filters.includes("cc") {
                                continue;
                            }
                            _total_pass += 1;
                            flat.push(FlatEvent {
                                track: ti,
                                tick,
                                sec: None,
                                kind: "cc".into(),
                                chan: Some(ch),
                                data: serde_json::json!({"cc":cc,"value":value.as_int()}),
                            });
                        }
                        Msg::PitchBend { bend } => {
                            if !filters.includes("pbend") {
                                continue;
                            }
                            let val = bend.as_f64();
                            _total_pass += 1;
                            flat.push(FlatEvent {
                                track: ti,
                                tick,
                                sec: None,
                                kind: "pbend".into(),
                                chan: Some(ch),
                                data: serde_json::json!({"value":val}),
                            });
                        }
                        Msg::ProgramChange { program } => {
                            if let Some(ps) = &filters.programs {
                                if !ps.contains(&program.as_int()) {
                                    continue;
                                }
                            }
                            if !filters.includes("prog") {
                                continue;
                            }
                            _total_pass += 1;
                            flat.push(FlatEvent {
                                track: ti,
                                tick,
                                sec: None,
                                kind: "prog".into(),
                                chan: Some(ch),
                                data: serde_json::json!({"program":program.as_int()}),
                            });
                        }
                        _ => {}
                    }
                }
                TEK::Meta(mm) => {
                    if !filters.includes("meta") {
                        continue;
                    }
                    use midly::MetaMessage as MM;
                    let (sub, data) = match mm {
                        MM::Tempo(us) => (
                            "tempo",
                            serde_json::json!({"bpm": 60_000_000.0 / (us.as_int() as f64)}),
                        ),
                        MM::TimeSignature(n, d, _, _) => (
                            "time_signature",
                            serde_json::json!({"num":n,"den": 1u32<<(*d as u32)}),
                        ),
                        MM::KeySignature(sf, mi) => (
                            "key_signature",
                            serde_json::json!({"sf":*sf as i8, "minor": *mi}),
                        ),
                        MM::TrackName(n) => (
                            "track_name",
                            serde_json::json!({"text": String::from_utf8_lossy(n)}),
                        ),
                        MM::Text(t) => (
                            "text",
                            serde_json::json!({"text": String::from_utf8_lossy(t)}),
                        ),
                        _ => ("meta_other", serde_json::json!({})),
                    };
                    _total_pass += 1;
                    flat.push(FlatEvent {
                        track: ti,
                        tick,
                        sec: None,
                        kind: sub.into(),
                        chan: None,
                        data,
                    });
                }
                TEK::SysEx(s) => {
                    if !filters.includes("sysex") {
                        continue;
                    }
                    _total_pass += 1;
                    flat.push(FlatEvent {
                        track: ti,
                        tick,
                        sec: None,
                        kind: "sysex".into(),
                        chan: None,
                        data: serde_json::json!({"len": s.len()}),
                    });
                }
                _ => {}
            }
        }
    }

    let (events_json, total) = if return_format == "paired_notes" {
        let total = paired.len() as u64;
        (serde_json::to_value(paired)?, total)
    } else {
        let total = flat.len() as u64;
        (serde_json::to_value(flat)?, total)
    };

    let start = (chunk_index * chunk_size) as usize;
    let end = ((chunk_index + 1) * chunk_size).min(total) as usize;
    let sliced = if start < end {
        match events_json {
            serde_json::Value::Array(arr) => serde_json::Value::Array(arr[start..end].to_vec()),
            _ => serde_json::Value::Array(vec![]),
        }
    } else {
        serde_json::Value::Array(vec![])
    };
    let total_chunks = if chunk_size == 0 {
        0
    } else {
        (total + chunk_size - 1) / chunk_size
    };

    Ok(serde_json::json!({
        "ok": true,
        "file_id": fid,
        "chunk": {"index": chunk_index, "total": total_chunks},
        "events": sliced
    }))
}
