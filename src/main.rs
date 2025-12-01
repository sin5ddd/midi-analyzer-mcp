mod analyze;
mod filters;
mod model;
mod utils;

use anyhow::Result;
use rmcp::{
    handler::server::ServerHandler,
    model::{
        CallToolRequestParam, CallToolResult, ListToolsResult, PaginatedRequestParam,
        Tool, InitializeRequestParam, InitializeResult, Content,
        CompleteRequestParam, CompleteResult, SetLevelRequestParam, GetPromptRequestParam,
        GetPromptResult, ListPromptsResult, ListResourcesResult, ListResourceTemplatesResult,
        ReadResourceRequestParam, ReadResourceResult, SubscribeRequestParam, UnsubscribeRequestParam,
        CancelledNotificationParam, ProgressNotificationParam, ServerCapabilities, Implementation,
        ProtocolVersion, ErrorData as McpError, CompletionInfo,
    },
    service::{RoleServer, ServiceExt, RequestContext, NotificationContext},
};
use serde_json::Value;
use std::sync::Arc;

use crate::analyze::analyze_basic;
use crate::model::{Analyzed, AnalyzerCache};
use crate::utils::{
    guess_ext_is_midi, resolve_bytes_and_id, sha256_hex,
};

struct MidiAnalyzerService {
    cache: Arc<tokio::sync::Mutex<AnalyzerCache>>,
}

impl Default for MidiAnalyzerService {
    fn default() -> Self {
        Self {
            cache: Arc::new(tokio::sync::Mutex::new(AnalyzerCache::default())),
        }
    }
}

impl Clone for MidiAnalyzerService {
    fn clone(&self) -> Self {
        Self {
            cache: Arc::clone(&self.cache),
        }
    }
}

impl MidiAnalyzerService {
    async fn midi_open_file_handler(&self, args: &Value) -> Result<Value, McpError> {
        let path = args
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| McpError::invalid_request("missing path", None))?;
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
            return Err(McpError::invalid_request("unsupported extension (expected .mid/.midi)", None));
        }

        let meta = tokio::fs::metadata(path)
            .await
            .map_err(|e| McpError::invalid_request(format!("stat failed: {}: {}", path, e), None))?;

        if !meta.is_file() {
            return Err(McpError::invalid_request("not a file", None));
        }

        if meta.len() as u64 > max_size {
            return Err(McpError::invalid_request(format!("file too large: {} bytes", meta.len()), None));
        }

        let bytes = tokio::fs::read(path)
            .await
            .map_err(|e| McpError::invalid_request(format!("read failed: {}: {}", path, e), None))?;

        let file_id = sha256_hex(&bytes);

        let mut cache = self.cache.lock().await;

        if !cache.by_id.contains_key(&file_id) {
            let smf = midly::Smf::parse(&bytes)
                .map_err(|e| McpError::invalid_request(format!("midly parse error: {}", e), None))?;

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
            cache.by_alias.insert(a.into(), file_id.clone());
        }

        Ok(serde_json::json!({
            "ok": true,
            "file_id": file_id,
            "path": path,
            "size_bytes": bytes.len(),
            "alias": alias
        }))
    }

    async fn midi_file_info_handler(&self, args: &Value) -> Result<Value, McpError> {
        let mut cache = self.cache.lock().await;
        let (bytes, fid) = resolve_bytes_and_id(args, &mut *cache)
            .await
            .map_err(|e| McpError::invalid_request(e.to_string(), None))?;
        drop(cache);

        let mut cache = self.cache.lock().await;
        let analyzed = if let Some(a) = cache.by_id.get(&fid) {
            a.clone()
        } else {
            if bytes.is_empty() {
                return Err(McpError::invalid_request(
                    "file not loaded; provide path or call midi_open_file first", None
                ));
            }
            let a = analyze_basic(&bytes)
                .map_err(|e| McpError::invalid_request(e.to_string(), None))?;
            cache.by_id.insert(a.file_id.clone(), a.clone());
            a
        };

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

    async fn midi_track_list_handler(&self, args: &Value) -> Result<Value, McpError> {
        let mut cache = self.cache.lock().await;
        let (bytes, fid) = resolve_bytes_and_id(args, &mut *cache)
            .await
            .map_err(|e| McpError::invalid_request(e.to_string(), None))?;
        drop(cache);

        let mut cache = self.cache.lock().await;
        let analyzed = if let Some(a) = cache.by_id.get(&fid) {
            a.clone()
        } else {
            if bytes.is_empty() {
                return Err(McpError::invalid_request(
                    "file not loaded; provide path or midi_open_file first", None
                ));
            }
            let a = analyze_basic(&bytes)
                .map_err(|e| McpError::invalid_request(e.to_string(), None))?;
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
}

#[derive(Clone)]
struct MidiService {
    inner: Arc<MidiAnalyzerService>,
}

impl MidiService {
    fn new() -> Self {
        Self {
            inner: Arc::new(MidiAnalyzerService::default()),
        }
    }
}

impl ServerHandler for MidiService {
    fn ping(
        &self,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<(), McpError>> + Send + '_ {
        async { Ok(()) }
    }

    fn initialize(
        &self,
        _request: InitializeRequestParam,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<InitializeResult, McpError>> + Send + '_ {
        async {
            Ok(InitializeResult {
                protocol_version: ProtocolVersion::V_2024_11_05,
                server_info: Implementation {
                    name: "midi-analyzer-mcp".into(),
                    version: env!("CARGO_PKG_VERSION").into(),
                },
                capabilities: ServerCapabilities {
                    tools: Some(Default::default()),
                    ..Default::default()
                },
                instructions: None,
            })
        }
    }

    fn complete(
        &self,
        _request: CompleteRequestParam,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<CompleteResult, McpError>> + Send + '_ {
        async { Ok(CompleteResult { completion: CompletionInfo { values: vec![], has_more: Some(false), total: Some(0) } }) }
    }

    fn set_level(
        &self,
        _request: SetLevelRequestParam,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<(), McpError>> + Send + '_ {
        async { Ok(()) }
    }

    fn get_prompt(
        &self,
        _request: GetPromptRequestParam,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<GetPromptResult, McpError>> + Send + '_ {
        async { Err(McpError::invalid_request("get_prompt not supported", None)) }
    }

    fn list_prompts(
        &self,
        _request: Option<PaginatedRequestParam>,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListPromptsResult, McpError>> + Send + '_ {
        async { Ok(ListPromptsResult { prompts: vec![], next_cursor: None }) }
    }

    fn list_resources(
        &self,
        _request: Option<PaginatedRequestParam>,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListResourcesResult, McpError>> + Send + '_ {
        async { Ok(ListResourcesResult { resources: vec![], next_cursor: None }) }
    }

    fn list_resource_templates(
        &self,
        _request: Option<PaginatedRequestParam>,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListResourceTemplatesResult, McpError>> + Send + '_ {
        async { Ok(ListResourceTemplatesResult { resource_templates: vec![], next_cursor: None }) }
    }

    fn read_resource(
        &self,
        _request: ReadResourceRequestParam,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ReadResourceResult, McpError>> + Send + '_ {
        async { Err(McpError::invalid_request("read_resource not supported", None)) }
    }

    fn subscribe(
        &self,
        _request: SubscribeRequestParam,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<(), McpError>> + Send + '_ {
        async { Ok(()) }
    }

    fn unsubscribe(
        &self,
        _request: UnsubscribeRequestParam,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<(), McpError>> + Send + '_ {
        async { Ok(()) }
    }

    fn call_tool(
        &self,
        request: CallToolRequestParam,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<CallToolResult, McpError>> + Send + '_ {
        let inner = Arc::clone(&self.inner);
        async move {
            let args = request.arguments.as_ref()
                .map(|v| serde_json::to_value(v).unwrap_or(Value::Null))
                .unwrap_or(Value::Null);

            let result = match request.name.as_ref() {
                "midi_open_file" => inner.midi_open_file_handler(&args).await,
                "midi_file_info" => inner.midi_file_info_handler(&args).await,
                "midi_track_list" => inner.midi_track_list_handler(&args).await,
                _ => Err(McpError::invalid_request(format!("unknown tool: {}", request.name), None)),
            };

            match result {
                Ok(val) => Ok(CallToolResult {
                    content: Some(vec![Content::text(serde_json::to_string_pretty(&val).unwrap_or_default())]),
                    structured_content: None,
                    is_error: Some(false),
                }),
                Err(e) => Ok(CallToolResult {
                    content: Some(vec![Content::text(format!("Error: {:?}", e))]),
                    structured_content: None,
                    is_error: Some(true),
                }),
            }
        }
    }

    fn list_tools(
        &self,
        _request: Option<PaginatedRequestParam>,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListToolsResult, McpError>> + Send + '_ {
        async {
        Ok(ListToolsResult {
            tools: vec![
                Tool {
                    name: "midi_open_file".into(),
                    description: Some("指定パスのMIDIを読み込み、file_idを返す（後続ツールはfile_idを使用可能）".into()),
                    input_schema: std::sync::Arc::new(serde_json::from_value::<serde_json::Map<String, Value>>(
                        serde_json::json!({
                            "type": "object",
                            "properties": {
                                "path": {"type": "string"},
                                "alias": {"type": "string"},
                                "validate_extension": {"type": "boolean", "default": true},
                                "max_size_bytes": {"type": "integer", "default": 10485760}
                            },
                            "required": ["path"]
                        })).unwrap()),
                    annotations: None,
                    output_schema: None,
                },
                Tool {
                    name: "midi_file_info".into(),
                    description: Some("ファイル全体概要（メタ/テンポ/拍子/キー/曲尺/トラック統計など）".into()),
                    input_schema: std::sync::Arc::new(serde_json::from_value::<serde_json::Map<String, Value>>(
                        serde_json::json!({
                            "type": "object",
                            "properties": {
                                "file_id": {"type": "string"},
                                "path": {"type": "string"},
                                "include_tempo_map": {"type": "boolean", "default": true},
                                "include_time_signatures": {"type": "boolean", "default": true},
                                "include_key_signatures": {"type": "boolean", "default": true}
                            },
                            "anyOf": [{"required": ["file_id"]}, {"required": ["path"]}]
                        })).unwrap()),
                    annotations: None,
                    output_schema: None,
                },
                Tool {
                    name: "midi_track_list".into(),
                    description: Some("トラック一覧（名前/チャンネル/プログラム/ノート統計）".into()),
                    input_schema: std::sync::Arc::new(serde_json::from_value::<serde_json::Map<String, Value>>(
                        serde_json::json!({
                            "type": "object",
                            "properties": {
                                "file_id": {"type": "string"},
                                "path": {"type": "string"},
                                "track_indexes": {"type": "array", "items": {"type": "integer"}},
                                "channel_filter": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 15}},
                                "program_filter": {"type": "array", "items": {"type": "integer", "minimum": 0, "maximum": 127}}
                            },
                            "anyOf": [{"required": ["file_id"]}, {"required": ["path"]}]
                        })).unwrap()),
                    annotations: None,
                    output_schema: None,
                },
            ],
            next_cursor: None,
        })
        }
    }

    fn on_cancelled(
        &self,
        _notification: CancelledNotificationParam,
        _context: NotificationContext<RoleServer>,
    ) -> impl std::future::Future<Output = ()> + Send + '_ {
        async {}
    }

    fn on_progress(
        &self,
        _notification: ProgressNotificationParam,
        _context: NotificationContext<RoleServer>,
    ) -> impl std::future::Future<Output = ()> + Send + '_ {
        async {}
    }

    fn on_initialized(
        &self,
        _context: NotificationContext<RoleServer>,
    ) -> impl std::future::Future<Output = ()> + Send + '_ {
        async {}
    }

    fn on_roots_list_changed(
        &self,
        _context: NotificationContext<RoleServer>,
    ) -> impl std::future::Future<Output = ()> + Send + '_ {
        async {}
    }

    fn get_info(&self) -> rmcp::model::ServerInfo {
        rmcp::model::ServerInfo {
            protocol_version: ProtocolVersion::V_2024_11_05,
            server_info: Implementation {
                name: "midi-analyzer-mcp".into(),
                version: env!("CARGO_PKG_VERSION").into(),
            },
            capabilities: ServerCapabilities {
                tools: Some(Default::default()),
                ..Default::default()
            },
            instructions: None,
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let service = MidiService::new();


    // Serve using stdio transport
    let server = service.serve((tokio::io::stdin(), tokio::io::stdout())).await
        .map_err(|e| anyhow::anyhow!("Failed to start server: {:?}", e))?;

    // Wait for the server to complete
    server.waiting().await
        .map_err(|e| anyhow::anyhow!("Server error: {:?}", e))?;

    Ok(())
}