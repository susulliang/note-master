/**
 * card-sfx — WebAudio sound effects for the TCG card-opening ceremony.
 * Fully synthesized (no asset files): a start whoosh, a ticker tick that
 * decelerates with the strip, and a reveal sting that swells with rarity.
 * The AudioContext is created lazily on first user-gesture-driven call.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Short filtered noise whoosh — pack tear / draw start. */
export function sfxStart(): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const len = 0.35;
  const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 1.6;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.exponentialRampToValueAtTime(3200, t + len);
  filter.Q.value = 1.1;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start(t);
}

/** Single ticker tick — pitched blip. Called on a decelerating schedule. */
export function sfxTick(speed = 1): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(1800 + speed * 600, t);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.055, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}

const RARITY_SCORE: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  'Super Rare': 3,
  'Ultra Rare': 4,
  'Secret Rare': 5,
};

/** Reveal sting — arpeggio that grows with rarity (secrets get a shimmer). */
export function sfxReveal(rarity: string): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const score = RARITY_SCORE[rarity] ?? 0;
  // Base minor-to-major rise; higher tiers add more notes, volume, and length.
  const roots = [523.25, 587.33, 698.46, 783.99, 880, 1046.5, 1174.66, 1396.91];
  const notes = roots.slice(0, Math.min(3 + score, roots.length));
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    osc.type = i >= notes.length - 2 ? 'triangle' : 'sine';
    osc.frequency.value = freq;
    const gain = ac.createGain();
    const start = t + i * (score >= 3 ? 0.12 : 0.09);
    const peak = 0.1 + score * 0.018;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6 + score * 0.12);
    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.8 + score * 0.15);
  });
  // Secret Rare shimmer — high sparkle arpeggio over the sting.
  if (score >= 5) {
    for (let i = 0; i < 6; i += 1) {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 2093 + i * 220;
      const gain = ac.createGain();
      const start = t + 0.5 + i * 0.07;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ac.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    }
  }
}

/** Muted thud — landing on the won card (right before the sting). */
export function sfxLand(): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.18);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.25);
}
