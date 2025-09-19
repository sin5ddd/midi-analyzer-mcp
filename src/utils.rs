use anyhow::{anyhow, Result};
use sha2::{Digest, Sha256};
use crate::model::AnalyzerCache;

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    let digest = h.finalize();
    format!("sha256:{}", base16ct::lower::encode_string(&digest))
}

pub fn guess_ext_is_midi(path: &str) -> bool {
    let p = path.to_ascii_lowercase();
    p.ends_with(".mid") || p.ends_with(".midi") || p.ends_with(".rmi")
}

pub fn ticks_to_seconds(ticks: u64, ppq: u64, tempo_map: &[(u64, f64)]) -> Option<f64> {
    if tempo_map.is_empty() { return None; }
    let mut last_tick = 0u64;
    let mut last_bpm = tempo_map[0].1;
    let mut acc = 0.0f64;
    for (tk, bpm) in tempo_map.iter().cloned().chain(std::iter::once((ticks, last_bpm))) {
        if tk < last_tick { continue; }
        let dt = (tk - last_tick) as f64;
        let sec_per_tick = (60.0 / last_bpm) / (ppq as f64);
        acc += dt * sec_per_tick;
        last_tick = tk; last_bpm = bpm;
    }
    Some(acc)
}

pub async fn resolve_bytes_and_id<'a>(args: &'a serde_json::Value, cache: &'a mut AnalyzerCache) -> Result<(Vec<u8>, String)> {
    if let Some(fid) = args.get("file_id").and_then(|v| v.as_str()) {
        if let Some(a) = cache.by_id.get(fid) {
            // We don't store bytes; caller must provide path if bytes are needed. Return empty bytes.
            return Ok((Vec::new(), a.file_id.clone()));
        } else if let Some(alias) = cache.by_alias.get(fid) {
            if let Some(a) = cache.by_id.get(alias) { return Ok((Vec::new(), a.file_id.clone())); }
        }
        return Err(anyhow!("file_id not found: {}", fid));
    }
    if let Some(path) = args.get("path").and_then(|v| v.as_str()) {
        let bytes = tokio::fs::read(path).await?;
        let fid = sha256_hex(&bytes);
        Ok((bytes, fid))
    } else {
        Err(anyhow!("either file_id or path is required"))
    }
}
