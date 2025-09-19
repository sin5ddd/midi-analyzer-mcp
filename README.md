# midi-analyzer-mcp

標準入力/標準出力でやり取りするシンプルな JSON-RPC 2.0 サーバとして、MIDI (SMF) ファイルの基本的な解析機能を提供します。エージェントや MCP 互換クライアントから「tools/list」「tools/call」を使って呼び出すことを想定しています。

- 言語: Rust (edition 2024)
- ライブラリ: [midly](https://crates.io/crates/midly), serde, anyhow, tokio など

## できること（機能概要）
- ファイルの読み込みと識別子 (file_id = sha256) の発行
- ファイル全体の概要取得（フォーマット/PPQ/曲尺/テンポ/拍子/キー/トラック統計）
- トラック一覧フィルタ（チャンネル/プログラム/インデックス）
- トラック詳細（ノートのヒストグラム、CC ヒストグラム要約）
- メタ/システムイベント抽出（テンポ/拍子/キー/マーカー/テキスト/SysEx）
- すべてのイベントの列挙（ノート、CC、PBEND、プログラムチェンジ、メタ、SysEx）。大量の場合はチャンク単位で取得

## ビルドと実行
Rust ツールチェーンが必要です（Rustup 推奨）。

- ビルド（デバッグ）
  - Windows: `cargo build`
  - 生成物: `target\debug\midi-analyzer-mcp.exe`
- ビルド（リリース）
  - Windows: `cargo build --release`
  - 生成物: `target\release\midi-analyzer-mcp.exe`

本プログラムは「1 行に 1 リクエスト JSON」を標準入力で受け取り、1 行の JSON レスポンスを標準出力に書き出します。

## プロトコル概要（JSON-RPC 2.0）
- リクエスト: `{ "jsonrpc": "2.0", "id": 任意, "method": "tools/list" | "tools/call", "params": {...} }`
- レスポンス: `{ "jsonrpc": "2.0", "id": リクエストの id, "result": ..., "error": ... }`
- 1 行に 1 JSON。複数回呼び出す場合は行ごとに送ります。

### サンプル（PowerShell）
- 利用可能ツール一覧
```
@'{
  "jsonrpc":"2.0",
  "id":1,
  "method":"tools/list"
}'@ | target\debug\midi-analyzer-mcp.exe
```

- ファイル概要を取得（パスから直接）
```
@'{
  "jsonrpc":"2.0",
  "id":2,
  "method":"tools/call",
  "params": {
    "name":"midi_file_info",
    "arguments": { "path": "C:/path/to/song.mid" }
  }
}'@ | target\debug\midi-analyzer-mcp.exe
```

- 先に読み込み（file_id を取得）してから別ツールで使う
```
@'{
  "jsonrpc":"2.0",
  "id":3,
  "method":"tools/call",
  "params": {
    "name":"midi_open_file",
    "arguments": { "path": "C:/path/to/song.mid", "alias": "main" }
  }
}'@ | target\debug\midi-analyzer-mcp.exe
```
レスポンスで返る `file_id` または `alias` は後続ツールの `file_id` として使えます（ただし一部ツールは現在、バイト列が必要なため `path` 指定が必須です。後述の注意をご参照ください）。

## 提供ツール一覧（tools/call）
各ツールは `params` の中で `name` にツール名、`arguments` に引数オブジェクトを与えます。

- name: midi_open_file
  - 説明: 指定パスの MIDI を読み込み、file_id を返す（後続ツールは file_id を使用可能）
  - 引数: path (必須), alias (任意), validate_extension=true, max_size_bytes=10MB
  - 戻り: { ok, file_id, path, size_bytes, alias }

- name: midi_file_info
  - 説明: ファイル全体概要（メタ/テンポ/拍子/キー/曲尺/トラック統計など）
  - 引数: file_id または path のどちらか。include_tempo_map=true, include_time_signatures=true, include_key_signatures=true
  - 戻り: { ok, file_id, format, ppq, duration_ticks, duration_sec, tempo_map, time_signatures, key_signatures, tracks }

- name: midi_track_list
  - 説明: トラック一覧（名前/チャンネル/プログラム/ノート統計）
  - 引数: file_id または path。track_indexes[], channel_filter[], program_filter[] など
  - 戻り: { ok, file_id, tracks[] }

- name: midi_track_detail
  - 説明: 特定トラック詳細（代表ピッチ/音域/イベント統計、必要に応じてノート/CC 要約）
  - 引数: file_id または path、track_index（必須）。include_histograms=true, include_cc_summary=false
  - 戻り: { ok, file_id, track, pitch_hist(128), cc_hist(128) }

- name: midi_system_events
  - 説明: メタ/システムイベントの抽出（テンポ/拍子/キー/マーカー/テキスト/SysEx など）
  - 引数: file_id または path、kinds[]（省略時: tempo, time_signature, key_signature, marker, text, track_name, sysex）、limit, offset
  - 戻り: { ok, file_id, events[], limit, offset, total }

- name: midi_all_event
  - 説明: 指定時間範囲のイベント一覧。大量の場合はチャンク分割。
  - 引数:
    - file_id または path
    - track_indexes[]（任意）
    - event_filters: include/exclude/channels/pitches/controllers/programs
    - time_slice: { start_tick, end_tick }（任意）
    - chunk_size=2000, chunk_index=0
    - return_format: "paired_notes" | "flat_events"（デフォルト: paired_notes）
  - 戻り: { ok, file_id, chunk: { index, total }, events[] }

## データ構造（主なフィールド）
- TrackStat
  - index, name, channels[], programs{ ch->program }, note_count, note_range(min,max), velocity_avg, has_drum
- Analyzed
  - file_id, format, ppq, duration_ticks, duration_sec, tempo_map[(tick,bpm)], time_sigs[(tick,num,den)], key_sigs[(tick,sf,minor)], tracks[]
- NoteSpan（paired_notes の要素）
  - track, chan, pitch, start_tick, end_tick, vel_on, vel_off
- FlatEvent（flat_events の要素）
  - track, tick, sec(現状 None), kind("note_on"/"note_off"/"cc"/"pbend"/"prog"/メタ種別/"sysex"), chan(メタは None), data(JSON)

## 注意・制限
- file_id のみでは「ファイルのバイト列」は保持していません。以下のツールは現状 `path` が必要です（将来のキャッシュ拡張予定）:
  - midi_system_events, midi_all_event（file_id だけだとエラーになります）
- 拍ごとの秒換算（sec）は tempo_map の状況次第で未設定になることがあります。
- サポート対象は標準的な SMF。特殊な SysEx 内容などの完全なデコードは行いません（長さのみ）。

## エラーハンドリング（例）
- `parse error`（JSON の構文誤り）
- `method not found`（`tools/list` か `tools/call` 以外）
- `unknown tool`（不明なツール名）
- `file not loaded; provide path ...`（キャッシュに解析結果が無く、かつ `path` 未指定）
- `unsupported extension` / `file too large` / `not a file` など

## 開発メモ
- 解析の中心は `src/analyze.rs`（midly を用いた基本統計作成）
- イベントフィルタは `src/filters.rs`
- モデル定義は `src/model.rs`
- JSON-RPC の I/O とツール実装は `src/main.rs`

## ライセンス
本プロジェクトは MIT ライセンスの下で提供されます。詳細は同梱の LICENSE ファイルをご覧ください。

依存クレート（midly, serde, anyhow, tokio, sha2, base16ct）は MIT または MIT/Apache-2.0 のデュアルライセンスで配布されており、MIT ライセンスとの両立性があります。