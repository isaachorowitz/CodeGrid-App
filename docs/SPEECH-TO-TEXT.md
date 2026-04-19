# Speech-to-Text for CodeGrid

## Recommended: Whisper.cpp via `whisper-rs`

### Why Whisper.cpp
- **Fully local and private** — critical for a terminal app where users type sensitive commands
- **Proven in production Tauri 2.0 + Rust apps** (MumbleFlow, Whispr)
- **High quality** with `large-v3-turbo` model (~400ms latency on Apple Silicon)
- **Free, MIT licensed, cross-platform**
- Natural fit since backend is already Rust

### Implementation Plan

#### Rust Crates Needed
- `whisper-rs` — FFI bindings to whisper.cpp
- `cpal` — cross-platform audio capture
- `hound` — WAV encoding (for resampling to 16kHz mono)

#### Architecture
1. **Mic button** on each terminal pane header
2. **Press and hold** (or toggle) to record
3. **Audio capture** via `cpal` in Rust, buffered to memory
4. **On release**: resample to 16kHz mono, run whisper inference
5. **Inject text** into the terminal's PTY stdin

#### Tauri Commands
```rust
#[tauri::command]
async fn start_recording(session_id: String) -> Result<(), String>

#[tauri::command]
async fn stop_recording_and_transcribe(session_id: String) -> Result<String, String>
```

#### Model Management
- Models are downloaded on first use (not bundled with the app)
- Stored in `~/.config/codegrid/models/`
- Sizes:
  - `tiny` — 75 MB (fastest, lower quality)
  - `base` — 142 MB (good balance)
  - `small` — 466 MB (better quality)
  - `medium` — 1.5 GB (high quality)
  - `large-v3-turbo` — 3.1 GB (best quality, still fast on Apple Silicon)

#### Model Download Strategy
- Default: `base` model (142 MB) — downloaded on first mic button press
- Show download progress bar
- Settings option to choose model size
- Models are **NOT bundled** with the app — zero impact on initial download size

### Performance on Apple Silicon
| Model | Size | Inference (10s audio) |
|-------|------|----------------------|
| tiny | 75 MB | ~100ms |
| base | 142 MB | ~200ms |
| small | 466 MB | ~400ms |
| large-v3-turbo | 3.1 GB | ~400ms (Metal) |

### Alternative Options Evaluated

| Option | Verdict |
|--------|---------|
| **Wispr Flow API** | Gated/enterprise-only, not publicly available |
| **tauri-plugin-stt (Vosk)** | Lower quality but simplest integration — good MVP fallback |
| **Web Speech API** | Broken on Linux (WebKitGTK), inconsistent cross-platform |
| **macOS SFSpeechRecognizer** | macOS-only, 1-min session limit |
| **Deepgram (cloud)** | Best real-time quality, but cloud-dependent, ~$0.004/min |

### UX Flow
1. User clicks mic icon on terminal title bar
2. Icon turns red, pulsing — recording in progress
3. User speaks their command/prompt
4. User clicks mic icon again (or releases if hold-to-talk)
5. Brief "Transcribing..." indicator
6. Text appears in terminal as if typed
7. User can edit before pressing Enter, or it auto-submits (configurable)

### Privacy Considerations
- All processing happens locally — no audio leaves the machine
- No API keys needed
- Audio buffer is discarded after transcription
- Model files are standard open-source Whisper models
