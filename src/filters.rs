#[derive(Default, Clone)]
pub struct EventFilters {
    pub include: Option<Vec<String>>,
    pub exclude: Option<Vec<String>>,
    pub channels: Option<Vec<u8>>,
    pub pitches: Option<Vec<u8>>,
    pub controllers: Option<Vec<u8>>,
    pub programs: Option<Vec<u8>>,
}

impl EventFilters {
    pub fn from_json(v: &serde_json::Value) -> Self {
        let include = v.get("include").and_then(|a| a.as_array()).map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(|t| t.to_string()))
                .collect()
        });
        let exclude = v.get("exclude").and_then(|a| a.as_array()).map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(|t| t.to_string()))
                .collect()
        });
        let channels = v.get("channels").and_then(|a| a.as_array()).map(|a| {
            a.iter()
                .filter_map(|x| x.as_u64().map(|u| u as u8))
                .collect()
        });
        let pitches = v.get("pitches").and_then(|a| a.as_array()).map(|a| {
            a.iter()
                .filter_map(|x| x.as_u64().map(|u| u as u8))
                .collect()
        });
        let controllers = v.get("controllers").and_then(|a| a.as_array()).map(|a| {
            a.iter()
                .filter_map(|x| x.as_u64().map(|u| u as u8))
                .collect()
        });
        let programs = v.get("programs").and_then(|a| a.as_array()).map(|a| {
            a.iter()
                .filter_map(|x| x.as_u64().map(|u| u as u8))
                .collect()
        });
        EventFilters {
            include,
            exclude,
            channels,
            pitches,
            controllers,
            programs,
        }
    }
    pub fn includes(&self, kind: &str) -> bool {
        if let Some(ex) = &self.exclude {
            if ex.iter().any(|k| k == kind) {
                return false;
            }
        }
        if let Some(inc) = &self.include {
            return inc.iter().any(|k| k == kind);
        }
        // default allow common kinds
        matches!(
            kind,
            "note" | "cc" | "pbend" | "prog" | "aftertouch" | "meta" | "sysex"
        )
    }
}
