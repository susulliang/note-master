use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone)]
struct AudioDevice {
    name: String,
    is_input: bool,
    is_output: bool,
    is_default_input: bool,
    is_default_output: bool,
}

/// Shared state of one active device-capture session. The cpal Stream itself
/// is !Send on macOS, so it is owned by a dedicated thread (see
/// start_audio_capture); the app state only holds these Send+Sync Arcs.
struct CaptureSession {
    buffer: Arc<Mutex<Vec<f32>>>,
    active: Arc<AtomicBool>,
    sample_rate: u32,
    channels: u16,
}

#[derive(Default)]
struct AppState {
    /// Customer-audio device session (named device or ScreenCaptureKit)
    session: Mutex<Option<CaptureSession>>,
    /// Agent-mic session (default input device, captured via cpal — the
    /// webview's getUserMedia is unreliable in WKWebView)
    mic_session: Mutex<Option<CaptureSession>>,
}

/// Enumerate all audio devices visible to the system. Returns both input
/// (microphone / virtual loopback) and output (speakers / virtual cable)
/// devices so the frontend can let the agent pick which device carries the
/// customer's voice.
#[tauri::command]
fn list_audio_devices() -> Vec<AudioDevice> {
    let host = cpal::default_host();
    let default_in = host.default_input_device();
    let default_out = host.default_output_device();

    let default_in_name = default_in.as_ref().and_then(|d| d.name().ok());
    let default_out_name = default_out.as_ref().and_then(|d| d.name().ok());

    let mut devices = Vec::new();
    if let Ok(devs) = host.input_devices() {
        for d in devs {
            if let Ok(name) = d.name() {
                let is_default = default_in_name.as_deref() == Some(&name);
                devices.push(AudioDevice {
                    name,
                    is_input: true,
                    is_output: false,
                    is_default_input: is_default,
                    is_default_output: false,
                });
            }
        }
    }
    if let Ok(devs) = host.output_devices() {
        for d in devs {
            if let Ok(name) = d.name() {
                // Avoid duplicating devices that appear in both lists
                if devices.iter().any(|existing| existing.name == name) {
                    if let Some(existing) = devices.iter_mut().find(|e| e.name == name) {
                        existing.is_output = true;
                        if default_out_name.as_deref() == Some(&name) {
                            existing.is_default_output = true;
                        }
                    }
                    continue;
                }
                let is_default = default_out_name.as_deref() == Some(&name);
                devices.push(AudioDevice {
                    name,
                    is_input: false,
                    is_output: true,
                    is_default_input: false,
                    is_default_output: is_default,
                });
            }
        }
    }
    devices
}

/// Spawn the cpal capture thread shared by the customer-device and agent-mic
/// commands. `device_name` = Some(name) records that specific input device;
/// None records the DEFAULT input device (agent mic). The cpal Stream is
/// !Send on macOS, so the ENTIRE device lifecycle (open → record → close)
/// happens on the dedicated thread; errors are reported back through a
/// channel before the recording loop begins. While active, the thread emits
/// `level_event` ~4x per second with a 0..1 input level for the UI meter.
fn spawn_cpal_capture(
    app: AppHandle,
    buffer: Arc<Mutex<Vec<f32>>>,
    energy: Arc<Mutex<(f64, u64)>>,
    active: Arc<AtomicBool>,
    device_name: Option<String>,
    level_event: &'static str,
) -> Result<(u32, u16), String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<(u32, u16), String>>();
    let buf_tx = buffer.clone();
    let en_tx = energy.clone();
    let active_tx = active.clone();
    let app_thread = app.clone();
    std::thread::spawn(move || {
        let opened = (|| -> Result<(cpal::Stream, u32, u16), String> {
            let host = cpal::default_host();
            let device = match &device_name {
                Some(name) => host
                    .input_devices()
                    .map_err(|e| format!("cannot enumerate input devices: {e}"))?
                    .find(|d| d.name().map(|n| n == name.as_str()).unwrap_or(false))
                    .ok_or_else(|| format!("audio device not found: {name}"))?,
                None => host
                    .default_input_device()
                    .ok_or("no microphone found on this system")?,
            };
            let label = device_name.clone().unwrap_or_else(|| "microphone".into());

            let config = device
                .default_input_config()
                .map_err(|e| format!("cannot open {label}: {e}"))?;
            let sample_rate = config.sample_rate().0;
            let channels = config.channels();
            let fmt = config.sample_format();

            // Per-format closures: convert every incoming frame to f32.
            let stream_config = config.config();
            let stream = {
                let buf = buf_tx.clone();
                let en = en_tx.clone();
                match fmt {
                    cpal::SampleFormat::F32 => device.build_input_stream(
                        &stream_config,
                        move |data: &[f32], _| {
                            let mut b = buf.lock().unwrap();
                            b.extend_from_slice(data);
                            drop(b);
                            let mut e = en.lock().unwrap();
                            for s in data {
                                e.0 += (*s as f64) * (*s as f64);
                            }
                            e.1 += data.len() as u64;
                        },
                        |err| log::warn!("audio stream error: {err}"),
                        None,
                    ),
                    cpal::SampleFormat::I16 => device.build_input_stream(
                        &stream_config,
                        move |data: &[i16], _| {
                            let mut b = buf.lock().unwrap();
                            b.extend(data.iter().map(|s| *s as f32 / 32768.0));
                            drop(b);
                            let mut e = en.lock().unwrap();
                            for s in data {
                                let v = *s as f32 / 32768.0;
                                e.0 += (v as f64) * (v as f64);
                            }
                            e.1 += data.len() as u64;
                        },
                        |err| log::warn!("audio stream error: {err}"),
                        None,
                    ),
                    cpal::SampleFormat::U16 => device.build_input_stream(
                        &stream_config,
                        move |data: &[u16], _| {
                            let mut b = buf.lock().unwrap();
                            b.extend(data.iter().map(|s| (*s as f32 - 32768.0) / 32768.0));
                            drop(b);
                            let mut e = en.lock().unwrap();
                            for s in data {
                                let v = (*s as f32 - 32768.0) / 32768.0;
                                e.0 += (v as f64) * (v as f64);
                            }
                            e.1 += data.len() as u64;
                        },
                        |err| log::warn!("audio stream error: {err}"),
                        None,
                    ),
                    other => return Err(format!("unsupported sample format: {other:?}")),
                }
            }
            .map_err(|e| format!("cannot open {label}: {e}"))?;

            stream
                .play()
                .map_err(|e| format!("cannot start {label}: {e}"))?;
            Ok((stream, sample_rate, channels))
        })();

        match opened {
            Ok((stream, sample_rate, channels)) => {
                let _ = tx.send(Ok((sample_rate, channels)));
                // Keep the stream alive on THIS thread and emit the input
                // level 4x/second until the session is stopped.
                while active_tx.load(Ordering::SeqCst) {
                    std::thread::sleep(Duration::from_millis(250));
                    let (sum_sq, n) = {
                        let mut e = en_tx.lock().unwrap();
                        std::mem::take(&mut *e)
                    };
                    let level = if n > 0 {
                        ((sum_sq / n as f64).sqrt() * 4.0).min(1.0)
                    } else {
                        0.0
                    };
                    let _ = app_thread.emit(level_event, level as f64);
                }
                // Dropped on the same thread that created it — what
                // CoreAudio wants.
                drop(stream);
            }
            Err(e) => {
                let _ = tx.send(Err(e));
            }
        }
    });

    rx.recv()
        .map_err(|_| "capture thread died".to_string())?
        .map_err(|e| e)
}

/// Start capturing `device_name` (an INPUT device — e.g. BlackHole). Replaces
/// any session that is somehow still running.
#[tauri::command]
async fn start_audio_capture(
    app: AppHandle,
    state: State<'_, AppState>,
    device_name: String,
) -> Result<(), String> {
    // Replace any stale session first (dropping the old flag stops the
    // owner thread, which drops the stream and releases the device).
    if let Some(old) = state.session.lock().unwrap().take() {
        old.active.store(false, Ordering::SeqCst);
    }

    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let energy: Arc<Mutex<(f64, u64)>> = Arc::new(Mutex::new((0.0, 0)));
    let active = Arc::new(AtomicBool::new(true));

    let (sample_rate, channels) = spawn_cpal_capture(
        app,
        buffer.clone(),
        energy.clone(),
        active.clone(),
        Some(device_name),
        "customer-audio-level",
    )?;
    *state.session.lock().unwrap() = Some(CaptureSession {
        buffer,
        active,
        sample_rate,
        channels,
    });
    Ok(())
}

/// Start capturing the agent's microphone via cpal — the webview's
/// getUserMedia is unreliable in WKWebView, so the mic is recorded by Rust
/// alongside the customer device. `device_name` = None records the DEFAULT
/// input device. Emits `agent-audio-level` events.
#[tauri::command]
async fn start_mic_capture(
    app: AppHandle,
    state: State<'_, AppState>,
    device_name: Option<String>,
) -> Result<(), String> {
    if let Some(old) = state.mic_session.lock().unwrap().take() {
        old.active.store(false, Ordering::SeqCst);
    }

    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let energy: Arc<Mutex<(f64, u64)>> = Arc::new(Mutex::new((0.0, 0)));
    let active = Arc::new(AtomicBool::new(true));

    let (sample_rate, channels) = spawn_cpal_capture(
        app,
        buffer.clone(),
        energy.clone(),
        active.clone(),
        device_name,
        "agent-audio-level",
    )?;
    *state.mic_session.lock().unwrap() = Some(CaptureSession {
        buffer,
        active,
        sample_rate,
        channels,
    });
    Ok(())
}

/// Stop the active capture and return everything recorded since the matching
/// `start_audio_capture` as a complete 16-bit PCM WAV file (raw bytes over
/// IPC — the frontend wraps it in a Blob and feeds it to the existing
/// segment-transcription pipeline). Returns an empty WAV when no session
/// is running, so callers can treat it as "nothing to flush".
#[tauri::command]
async fn stop_audio_capture(state: State<'_, AppState>) -> Result<Response, String> {
    let session = state.session.lock().unwrap().take();
    let Some(session) = session else {
        return Ok(Response::new(write_wav(&[], 1, 48_000)));
    };
    // Signals the owner thread to drop the stream (releases the device).
    session.active.store(false, Ordering::SeqCst);

    let pcm = session.buffer.lock().unwrap().clone();
    Ok(Response::new(write_wav(&pcm, session.channels, session.sample_rate)))
}

/// Stop the agent-mic capture and return the recorded window as a WAV.
#[tauri::command]
async fn stop_mic_capture(state: State<'_, AppState>) -> Result<Response, String> {
    let session = state.mic_session.lock().unwrap().take();
    let Some(session) = session else {
        return Ok(Response::new(write_wav(&[], 1, 48_000)));
    };
    session.active.store(false, Ordering::SeqCst);

    let pcm = session.buffer.lock().unwrap().clone();
    Ok(Response::new(write_wav(&pcm, session.channels, session.sample_rate)))
}

// ---------------------------------------------------------------------------
//  macOS-only: ScreenCaptureKit system-audio capture (macOS 13+).
//  Captures everything the system plays — no virtual loopback driver
//  (BlackHole) needed. Requires the user to grant "Screen & System Audio
//  Recording" in System Settings on first use.
// ---------------------------------------------------------------------------
#[cfg(target_os = "macos")]
#[tauri::command]
async fn start_system_audio_capture(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use screencapturekit::prelude::*;

    // Replace any stale session first.
    if let Some(old) = state.session.lock().unwrap().take() {
        old.active.store(false, Ordering::SeqCst);
    }

    const SAMPLE_RATE: u32 = 48_000;
    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let energy: Arc<Mutex<(f64, u64)>> = Arc::new(Mutex::new((0.0, 0)));
    let active = Arc::new(AtomicBool::new(true));

    // SCK delivers callbacks on its own queues; the stream is kept alive by
    // this dedicated thread and dropped here when the session stops.
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let buf_tx = buffer.clone();
    let en_tx = energy.clone();
    let active_tx = active.clone();
    let app_thread = app.clone();
    std::thread::spawn(move || {
        let started = (|| -> Result<SCStream, String> {
            // Triggers the TCC "Screen & System Audio Recording" prompt the
            // first time. If the user denies, no displays are returned.
            let content = SCShareableContent::get()
                .map_err(|e| format!("ScreenCaptureKit not available: {e}"))?;
            let display = content
                .displays()
                .into_iter()
                .next()
                .ok_or_else(|| {
                    "System audio needs the \"Screen & System Audio Recording\" permission. \
                     Grant it in System Settings › Privacy & Security, then RESTART this app \
                     (macOS requires a restart before capture becomes active) and try again"
                        .to_string()
                })?;

            let filter = SCContentFilter::create()
                .with_display(&display)
                .with_excluding_windows(&[])
                .build()
                .map_err(|e| format!("cannot build capture filter: {e}"))?;

            // Audio-only capture: 2px video keeps the stream cheap while
            // carries_audio turns on system-output recording.
            let config = SCStreamConfiguration::new()
                .with_width(2)
                .with_height(2)
                .with_captures_audio(true)
                .with_sample_rate(SAMPLE_RATE as i32)
                .with_channel_count(2);

            let mut stream =
                SCStream::new(&filter, &config).map_err(|e| format!("cannot open stream: {e}"))?;

            // Downmix every incoming buffer to mono f32 and accumulate.
            let buf_handler = buf_tx.clone();
            let en_handler = en_tx.clone();
            stream
                .add_output_handler(
                    move |sample: CMSampleBuffer, of_type: SCStreamOutputType| {
                        if of_type != SCStreamOutputType::Audio {
                            return;
                        }
                        let Ok(list) = sample.audio_buffer_list() else {
                            return;
                        };
                        let mut b = buf_handler.lock().unwrap();
                        let mut e = en_handler.lock().unwrap();
                        let push_sample = |v: f32, b: &mut Vec<f32>, e: &mut (f64, u64)| {
                            b.push(v);
                            e.0 += (v as f64) * (v as f64);
                            e.1 += 1;
                        };
                        if list.num_buffers() == 1 {
                            // Interleaved: one buffer carrying N channels.
                            if let Some(ab) = list.get(0) {
                                let ch = ab.number_channels.max(1) as usize;
                                let frames = (ab.data().len() / 4) / ch;
                                let d = ab.data();
                                for i in 0..frames {
                                    let mut sum = 0.0f32;
                                    for c in 0..ch {
                                        let off = (i * ch + c) * 4;
                                        if off + 4 <= d.len() {
                                            sum += f32::from_le_bytes([
                                                d[off], d[off + 1], d[off + 2], d[off + 3],
                                            ]);
                                        }
                                    }
                                    let v = sum / ch as f32;
                                    push_sample(v, &mut b, &mut e);
                                }
                            }
                        } else {
                            // Non-interleaved: one buffer per channel (typical
                            // for SCK stereo output). Average channels.
                            let chs = list.num_buffers();
                            let frames = list.get(0).map(|ab| ab.data().len() / 4).unwrap_or(0);
                            for i in 0..frames {
                                let mut sum = 0.0f32;
                                for c in 0..chs {
                                    if let Some(ab) = list.get(c) {
                                        let d = ab.data();
                                        let off = i * 4;
                                        if off + 4 <= d.len() {
                                            sum += f32::from_le_bytes([
                                                d[off], d[off + 1], d[off + 2], d[off + 3],
                                            ]);
                                        }
                                    }
                                }
                                let v = sum / chs as f32;
                                push_sample(v, &mut b, &mut e);
                            }
                        }
                    },
                    SCStreamOutputType::Audio,
                )
                .map_err(|e| format!("cannot register audio handler: {e}"))?;

            stream
                .start_capture()
                .map_err(|e| format!("cannot start system audio capture: {e}"))?;
            Ok(stream)
        })();

        match started {
            Ok(stream) => {
                let _ = tx.send(Ok(()));
                // Keep the stream alive on THIS thread; emit the input level
                // 4x/second until the session is stopped.
                while active_tx.load(Ordering::SeqCst) {
                    std::thread::sleep(Duration::from_millis(250));
                    let (sum_sq, n) = {
                        let mut e = en_tx.lock().unwrap();
                        std::mem::take(&mut *e)
                    };
                    let level = if n > 0 {
                        ((sum_sq / n as f64).sqrt() * 4.0).min(1.0)
                    } else {
                        0.0
                    };
                    let _ = app_thread.emit("customer-audio-level", level as f64);
                }
                let _ = stream.stop_capture();
                drop(stream);
            }
            Err(e) => {
                let _ = tx.send(Err(e));
            }
        }
    });

    rx.recv()
        .map_err(|_| "system-audio capture thread died".to_string())?
        .map_err(|e| e)?;

    *state.session.lock().unwrap() = Some(CaptureSession {
        buffer,
        active,
        sample_rate: SAMPLE_RATE,
        channels: 1, // handler downmixes to mono
    });
    Ok(())
}

/// Windows: WASAPI loopback capture of the DEFAULT RENDER device — records
/// everything the system plays (the softphone's caller audio), no virtual
/// loopback driver (VB-Cable) needed. This is the Windows equivalent of the
/// macOS ScreenCaptureKit path above.
#[cfg(target_os = "windows")]
#[tauri::command]
async fn start_system_audio_capture(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use wasapi::{
        AudioCaptureClient, AudioClient, DeviceEnumerator, Direction, SampleType, StreamMode,
        WaveFormat,
    };

    // Replace any stale session first.
    if let Some(old) = state.session.lock().unwrap().take() {
        old.active.store(false, Ordering::SeqCst);
    }

    const SAMPLE_RATE: u32 = 48_000;
    let buffer: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let energy: Arc<Mutex<(f64, u64)>> = Arc::new(Mutex::new((0.0, 0)));
    let active = Arc::new(AtomicBool::new(true));

    // The WASAPI COM objects are !Send, so the ENTIRE device lifecycle
    // (open → poll → stop) happens on this dedicated thread; startup errors
    // are reported back through a channel before the poll loop begins.
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let buf_tx = buffer.clone();
    let en_tx = energy.clone();
    let active_tx = active.clone();
    let app_thread = app.clone();
    std::thread::spawn(move || {
        // COM multi-threaded apartment for WASAPI on this thread.
        let _ = wasapi::initialize_mta();

        let started = (|| -> Result<(AudioClient, AudioCaptureClient), String> {
            let enumerator = DeviceEnumerator::new()
                .map_err(|e| format!("cannot enumerate audio devices: {e}"))?;
            let device = enumerator
                .get_default_device(&Direction::Render)
                .map_err(|e| format!("no default output device found: {e}"))?;
            let mut client = device
                .get_iaudioclient()
                .map_err(|e| format!("cannot open audio client: {e}"))?;

            // Request stereo f32 @ 48 kHz; shared-mode autoconvert means the
            // audio engine converts from the device's real mix format.
            let fmt = WaveFormat::new(
                32,
                32,
                &SampleType::Float,
                SAMPLE_RATE as usize,
                2,
                None,
            );

            // Loopback trick: initialize a CAPTURE direction on the RENDER
            // device's client in shared mode — the wasapi crate turns that
            // combination into AUDCLNT_STREAMFLAGS_LOOPBACK. Polling mode,
            // because event-driven loopback is unreliable on Windows.
            let mode = StreamMode::PollingShared {
                autoconvert: true,
                buffer_duration_hns: 2_000_000, // 200 ms
            };
            client
                .initialize_client(&fmt, &Direction::Capture, &mode)
                .map_err(|e| format!("cannot open loopback capture: {e}"))?;
            let capture = client
                .get_audiocaptureclient()
                .map_err(|e| format!("cannot get capture client: {e}"))?;
            client
                .start_stream()
                .map_err(|e| format!("cannot start loopback capture: {e}"))?;
            Ok((client, capture))
        })();

        match started {
            Ok((client, capture)) => {
                let _ = tx.send(Ok(()));
                // Poll every 20 ms, drain all pending packets, downmix stereo
                // f32 to mono, accumulate energy; emit the input level 4x per
                // second until the session is stopped.
                let block_align = 8usize; // 2ch × f32
                let mut scratch = vec![0u8; 1 << 20]; // ~2.7 s of 48 kHz stereo
                let mut last_emit = std::time::Instant::now();
                while active_tx.load(Ordering::SeqCst) {
                    loop {
                        let packet = match capture.get_next_packet_size() {
                            Ok(Some(n)) => n,
                            Ok(None) => 0,
                            Err(e) => {
                                log::warn!("loopback packet error: {e}");
                                0
                            }
                        };
                        if packet == 0 {
                            break;
                        }
                        let read = capture.read_from_device(&mut scratch);
                        match read {
                            Ok((frames, info)) => {
                                if frames == 0 || info.flags.silent {
                                    continue;
                                }
                                let bytes = frames as usize * block_align;
                                let mut b = buf_tx.lock().unwrap();
                                let mut e = en_tx.lock().unwrap();
                                for i in 0..(bytes / 8) {
                                    let off = i * 8;
                                    let l = f32::from_le_bytes([
                                        scratch[off],
                                        scratch[off + 1],
                                        scratch[off + 2],
                                        scratch[off + 3],
                                    ]);
                                    let r = f32::from_le_bytes([
                                        scratch[off + 4],
                                        scratch[off + 5],
                                        scratch[off + 6],
                                        scratch[off + 7],
                                    ]);
                                    let v = (l + r) / 2.0;
                                    b.push(v);
                                    e.0 += (v as f64) * (v as f64);
                                    e.1 += 1;
                                }
                            }
                            Err(e) => {
                                log::warn!("loopback read error: {e}");
                                break;
                            }
                        }
                    }
                    if last_emit.elapsed() >= Duration::from_millis(250) {
                        last_emit = std::time::Instant::now();
                        let (sum_sq, n) = {
                            let mut e = en_tx.lock().unwrap();
                            std::mem::take(&mut *e)
                        };
                        let level = if n > 0 {
                            ((sum_sq / n as f64).sqrt() * 4.0).min(1.0)
                        } else {
                            0.0
                        };
                        let _ = app_thread.emit("customer-audio-level", level as f64);
                    }
                    std::thread::sleep(Duration::from_millis(20));
                }
                let _ = client.stop_stream();
                // client + capture dropped here, on the thread that created
                // them — what COM wants.
            }
            Err(e) => {
                let _ = tx.send(Err(e));
            }
        }
    });

    rx.recv()
        .map_err(|_| "system-audio capture thread died".to_string())?
        .map_err(|e| e)?;

    *state.session.lock().unwrap() = Some(CaptureSession {
        buffer,
        active,
        sample_rate: SAMPLE_RATE,
        channels: 1, // poll loop downmixes to mono
    });
    Ok(())
}

/// Non-macOS/Windows stub so the invoke table stays identical across platforms.
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
#[tauri::command]
async fn start_system_audio_capture() -> Result<(), String> {
    Err("System audio capture is only available on macOS and Windows".into())
}

/// Minimal RIFF/WAVE writer — 16-bit PCM, universally decodable by
/// AudioContext.decodeAudioData in the webview.
fn write_wav(pcm: &[f32], channels: u16, sample_rate: u32) -> Vec<u8> {
    let data_len = pcm.len() * 2;
    let mut out = Vec::with_capacity(44 + data_len);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&((36 + data_len) as u32).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&channels.to_le_bytes());
    out.extend_from_slice(&sample_rate.to_le_bytes());
    let byte_rate = sample_rate * channels as u32 * 2;
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&((channels * 2) as u16).to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(data_len as u32).to_le_bytes());
    for s in pcm {
        let v = s.clamp(-1.0, 1.0);
        out.extend_from_slice(&((v * 32767.0) as i16).to_le_bytes());
    }
    out
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(AppState::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      list_audio_devices,
      start_audio_capture,
      stop_audio_capture,
      start_mic_capture,
      stop_mic_capture,
      start_system_audio_capture
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
