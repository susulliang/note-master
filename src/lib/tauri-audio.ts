/**
 * Tauri desktop audio bridge.
 *
 * In the desktop build, WKWebView's getDisplayMedia (screen/tab share) is
 * unreliable and enumerateDevices hides devices until permission quirks are
 * satisfied — so the customer's voice is captured by the RUST side via
 * cpal (CoreAudio / WASAPI), which reliably lists every device including
 * virtual loopback drivers like BlackHole. The agent picks the device by
 * NAME here; capture is driven per segment window by use-call-capture.
 *
 * Only imported dynamically inside Tauri-gated code paths, so the browser
 * extension build never bundles @tauri-apps/api.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface RustAudioDevice {
  name: string;
  is_input: boolean;
  is_output: boolean;
  is_default_input: boolean;
  is_default_output: boolean;
}

/**
 * Sentinel device "name" meaning: capture EVERYTHING the system plays via
 * macOS ScreenCaptureKit (macOS 13+) — no virtual loopback driver needed.
 * Requires the "Screen & System Audio Recording" TCC permission.
 * (Canonical definition in tauri-env.ts; re-exported for convenience.)
 */
export { SYSTEM_AUDIO_DEVICE } from './tauri-env';

/** All audio devices the OS exposes (inputs + outputs), via cpal. */
export async function listRustAudioDevices(): Promise<RustAudioDevice[]> {
  return invoke('list_audio_devices');
}

/** Begin recording `deviceName` (an input device). */
export async function startDeviceCapture(deviceName: string): Promise<void> {
  await invoke('start_audio_capture', { deviceName });
}

/** Begin capturing system output audio via ScreenCaptureKit (macOS 13+). */
export async function startSystemAudioCapture(): Promise<void> {
  await invoke('start_system_audio_capture');
}

/** Begin capturing the agent's microphone via cpal (Rust side — WKWebView's
 *  getUserMedia is unreliable, so the mic never goes through the webview in
 *  desktop mode). Pass a device name to record that input device, or omit
 *  for the system default microphone. Emits 'agent-audio-level' events. */
export async function startMicCapture(deviceName?: string): Promise<void> {
  await invoke('start_mic_capture', { deviceName: deviceName ?? null });
}

/** Stop the mic capture and return the recorded window as a WAV Blob. */
export async function stopMicCapture(): Promise<Blob> {
  const bytes: ArrayBuffer = await invoke('stop_mic_capture');
  return new Blob([bytes], { type: 'audio/wav' });
}

/** Subscribe to live agent-mic input-level events (0..1).
 *  Returns an unlisten function. */
export async function onAgentLevel(
  cb: (level: number) => void
): Promise<() => void> {
  const un = await listen<number>('agent-audio-level', (e) => cb(e.payload));
  return un;
}

/** Stop recording and return everything captured since start as a WAV Blob. */
export async function stopDeviceCapture(): Promise<Blob> {
  const bytes: ArrayBuffer = await invoke('stop_audio_capture');
  return new Blob([bytes], { type: 'audio/wav' });
}

/** Subscribe to live input-level events (0..1) while a capture runs.
 *  Returns an unlisten function. */
export async function onCustomerLevel(
  cb: (level: number) => void
): Promise<() => void> {
  const un = await listen<number>('customer-audio-level', (e) => cb(e.payload));
  return un;
}

/** Names that look like a virtual loopback driver carrying another app's
 *  audio — used to auto-select the most likely customer-audio device. */
const LOOPBACK_RE =
  /blackhole|vb.?cable|voice.?meeter|loopback|virtual.*audio|stereo.*mix| aggregate /i;

export function looksLikeLoopback(name: string): boolean {
  return LOOPBACK_RE.test(name);
}
