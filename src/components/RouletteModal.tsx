/**
 * RouletteModal — Wheel of Fortune betting round + reward ceremony, opened
 * right after a successful store purchase of a wheel product. Phase 1 is a
 * live betting board (standard European table: straight numbers, dozens,
 * columns, red/black/even/odd/high/low) where each click stacks one spice on
 * a spot. Phase 2 plays the ~20s spin: the wheel decelerates one way while
 * the ball races the opposite way around the outer track, spirals down,
 * rattles off frets and deflectors with damped bounces, and finally locks
 * into the pocket the SERVER decided (see /api/store/wheel/spin — the
 * animation merely replays the outcome).
 *
 * Ball motion is ONE continuous decelerating glide: its total angular
 * displacement is the shortest residual to the landing angle (wheel rest +
 * awarded pocket) minus a fixed number of full laps, so the ball travels the
 * long way round and still comes to rest exactly in the awarded pocket —
 * no phase blending, no discontinuities, nothing that can visibly jump.
 * The settlement is only revealed after the ball has landed. Fret-crossing
 * ticks are synthesized with WebAudio.
 */

import { useEffect, useRef, useState } from 'react';
import { RotateCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { spinWheel, type WheelSpinResult } from '@/lib/auth-client';

interface RouletteModalProps {
  /** One-time spin token minted by the purchase endpoint. */
  token: string;
  onSpiceChange: (spice: number) => void;
  onClose: () => void;
}

/** localStorage key holding an un-spun purchase token so a modal closed
 *  mid-betting can be resumed from the Store instead of eating the spice. */
export const WHEEL_PENDING_KEY = '__app_wheel_pending_token';

/** European wheel pocket order, clockwise from 0. */
const POCKET_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24,
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;
const RED_POCKETS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/** Profit multiplier per 1 🌶️ staked (standard casino odds × 1.5, rounded). */
const PAYOUT_STRAIGHT = Math.round(35 * 1.5); // 53
const PAYOUT_DOZEN = Math.round(2 * 1.5); // 3
const PAYOUT_EVEN = Math.round(1 * 1.5); // 2

const STEP = (Math.PI * 2) / POCKET_ORDER.length; // wedge angle per pocket
const DURATION_MS = 20_000;

// Motion shaping constants. The ball follows ONE continuous decelerating
// glide whose endpoint (mod 2π) is exactly the awarded pocket at the moment
// the wheel comes to rest — no phase blending, nothing to jump or cut.
const WHEEL_REVS = 5.5; // wheel turns (decelerating) over the full spin
const WHEEL_POW = 2.35; // wheel ease-out exponent
const BALL_REVS = 13; // extra ball laps (opposite direction) before the pocket
const BALL_POW = 2.6; // ball ease-out exponent
const DROP_START = 0.55; // ball leaves the outer track and spirals in
const DROP_END = 0.78; // ball reaches pocket radius; hops end exactly here
const LAND_T = 0.97; // highlight the winning wedge as the ball comes to rest
const DURATION_S = DURATION_MS / 1000;
const DEFLECTORS = 8; // bowl-mounted diamond deflector ramps
const DEFLECTOR_RADIAL = 0.03; // radial half-extent (×R) — short ramps
const DEFLECTOR_TANGENT = 0.058; // tangential half-extent (×R) — wide, like real ones
const BALL_RADIUS = 0.026; // ball radius (×R)
const IDLE_REVS_PER_S = 0.06; // lazy ceremonial rotation while bets are open

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const TAU = Math.PI * 2;
const wrapAngle = (a: number) => {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
};

/** Human label for a bet spot key (used in the settlement breakdown). */
function betLabel(key: string): string {
  if (key.startsWith('n:')) return key.slice(2);
  switch (key) {
    case 'red': return 'Red';
    case 'black': return 'Black';
    case 'even': return 'Even';
    case 'odd': return 'Odd';
    case 'low': return '1–18';
    case 'high': return '19–36';
    case 'dozen:1': return '1st 12';
    case 'dozen:2': return '2nd 12';
    case 'dozen:3': return '3rd 12';
    case 'col:1': return 'Col ▲1';
    case 'col:2': return 'Col ▲2';
    case 'col:3': return 'Col ▲3';
    default: return key;
  }
}

export default function RouletteModal({ token, onSpiceChange, onClose }: RouletteModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Phase 1 'betting' — board is live, wheel idles. Phase 2 'spinning' — the
  // server outcome is in and the ceremony replays it. Phase 3 'done'.
  const [phase, setPhase] = useState<'betting' | 'spinning' | 'done'>('betting');
  const [bets, setBets] = useState<Record<string, number>>({});
  const betStackRef = useRef<string[]>([]); // click order, for Undo
  const [result, setResult] = useState<WheelSpinResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  // Apply the spice delta exactly once, whichever way the modal closes.
  const spiceAppliedRef = useRef(false);
  const resultRef = useRef<WheelSpinResult | null>(null);
  // Wheel head angle from the idle loop — the spin continues from it so the
  // betting → spin handover never pops.
  const idleAngleRef = useRef(0);

  const staked = Object.values(bets).reduce((a, b) => a + b, 0);

  const applyAndClose = () => {
    if (!spiceAppliedRef.current && resultRef.current) {
      spiceAppliedRef.current = true;
      onSpiceChange(resultRef.current.spice);
    }
    if (resultRef.current) localStorage.removeItem(WHEEL_PENDING_KEY); // spent
    onClose();
  };

  // Spin: send the betting board to the server, then play the ceremony.
  const doSpin = () => {
    if (phase !== 'betting' || spinning || staked === 0) return;
    setSpinError(null);
    setSpinning(true);
    spinWheel(token, bets)
      .then((out) => {
        resultRef.current = out;
        setResult(out);
        setPhase('spinning');
      })
      .catch((err: unknown) => setSpinError(err instanceof Error ? err.message : 'Spin failed'))
      .finally(() => setSpinning(false));
  };

  // Whatever way the modal closes after a completed spin, apply the balance
  // and clear the pending-token marker. Closing during betting keeps the
  // token pending so the Store can resume it.
  useEffect(() => {
    return () => {
      if (spiceAppliedRef.current) return;
      if (resultRef.current) {
        spiceAppliedRef.current = true;
        onSpiceChange(resultRef.current.spice);
        localStorage.removeItem(WHEEL_PENDING_KEY);
      }
    };
  }, []);

  // ── idle loop (betting phase): lazy ceremonial wheel rotation ─────────────
  useEffect(() => {
    if (phase !== 'betting') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = Math.min(420, window.innerWidth - 48, window.innerHeight - 360);
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const R = (canvas.width / 2) * 0.96;
    const R_NUMBER = 0.655 * R;

    const drawHead = (thW: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(thW);
      for (let i = 0; i < POCKET_ORDER.length; i++) {
        const n = POCKET_ORDER[i];
        const a0 = i * STEP;
        ctx.beginPath();
        ctx.arc(0, 0, 0.7 * R, a0, a0 + STEP);
        ctx.arc(0, 0, 0.52 * R, a0 + STEP, a0, true);
        ctx.closePath();
        ctx.fillStyle = n === 0 ? '#1e8449' : RED_POCKETS.has(n) ? '#b03a2e' : '#16161a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(212,175,55,0.85)';
        ctx.lineWidth = Math.max(1, R * 0.004);
        ctx.stroke();
        ctx.save();
        ctx.rotate((i + 0.5) * STEP);
        ctx.fillStyle = '#f5f0e1';
        ctx.font = `700 ${Math.round(R * 0.055)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), R_NUMBER, 0);
        ctx.restore();
      }
      const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.52 * R);
      cone.addColorStop(0, '#3d2b1f');
      cone.addColorStop(1, '#241a11');
      ctx.beginPath();
      ctx.arc(0, 0, 0.52 * R, 0, TAU);
      ctx.fillStyle = cone;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 0.09 * R, 0, TAU);
      ctx.fillStyle = '#d4af37';
      ctx.fill();
      ctx.restore();
    };
    const drawBowl = () => {
      const rim = ctx.createRadialGradient(cx, cy, 0.86 * R, cx, cy, R);
      rim.addColorStop(0, '#7a4a22');
      rim.addColorStop(0.5, '#5b3a1e');
      rim.addColorStop(1, '#3a2412');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fillStyle = rim;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 0.9 * R, 0, TAU);
      ctx.arc(cx, cy, 0.79 * R, 0, TAU, true);
      ctx.fillStyle = '#241609';
      ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,55,0.5)';
      ctx.lineWidth = Math.max(1.5, R * 0.006);
      ctx.beginPath();
      ctx.arc(cx, cy, 0.9 * R, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 0.79 * R, 0, TAU);
      ctx.stroke();
      const DEF_DR = DEFLECTOR_RADIAL * R;
      const DEF_TW = DEFLECTOR_TANGENT * R;
      for (let k = 0; k < DEFLECTORS; k++) {
        const a = (k * TAU) / DEFLECTORS + TAU / (DEFLECTORS * 2);
        ctx.save();
        ctx.translate(cx + Math.cos(a) * 0.735 * R, cy + Math.sin(a) * 0.735 * R);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(DEF_DR, 0);
        ctx.lineTo(0, DEF_TW);
        ctx.lineTo(-DEF_DR, 0);
        ctx.lineTo(0, -DEF_TW);
        ctx.closePath();
        ctx.fillStyle = 'rgba(212,175,55,0.92)';
        ctx.fill();
        ctx.restore();
      }
    };

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      idleAngleRef.current += IDLE_REVS_PER_S * TAU * dt;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBowl();
      drawHead(idleAngleRef.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ── ceremony loop: replays the server outcome once it is known ────────────
  useEffect(() => {
    if (phase !== 'spinning' || !result) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pocketIndex = POCKET_ORDER.indexOf(result.pocket as (typeof POCKET_ORDER)[number]);
    const pocketAngle = (pocketIndex + 0.5) * STEP;

    // Continue seamlessly from the idle rotation; the ball joins fresh.
    const thetaW0 = idleAngleRef.current % TAU;
    const thetaB0 = Math.random() * TAU;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssSize = Math.min(420, window.innerWidth - 48, window.innerHeight - 360);
    canvas.width = Math.round(cssSize * dpr);
    canvas.height = Math.round(cssSize * dpr);
    canvas.style.width = `${cssSize}px`;
    canvas.style.height = `${cssSize}px`;

    // ── audio: tiny synthesized clicks when the ball crosses frets ──────────
    let audioCtx: AudioContext | null = null;
    let lastTickAt = 0;
    const click = (freq: number, gain: number) => {
      try {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        const now = audioCtx.currentTime;
        if (now - lastTickAt < 0.04) return;
        lastTickAt = now;
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.connect(g).connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
      } catch {
        /* audio is decorative — never fail the spin over it */
      }
    };

    // Deflector impact: a woody knock plus a short metallic ping, scaled by
    // how hard the ball slammed into the ramp.
    const impact = (strength: number) => {
      try {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        const now = audioCtx.currentTime;
        const knock = audioCtx.createOscillator();
        const kg = audioCtx.createGain();
        knock.type = 'triangle';
        knock.frequency.setValueAtTime(340 - strength * 120, now);
        knock.frequency.exponentialRampToValueAtTime(130, now + 0.09);
        kg.gain.setValueAtTime(0.02 + strength * 0.1, now);
        kg.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        knock.connect(kg).connect(audioCtx.destination);
        knock.start(now);
        knock.stop(now + 0.11);
        const ping = audioCtx.createOscillator();
        const pg = audioCtx.createGain();
        ping.type = 'sine';
        ping.frequency.value = 2300 + strength * 1400;
        pg.gain.setValueAtTime(0.012 + strength * 0.05, now);
        pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        ping.connect(pg).connect(audioCtx.destination);
        ping.start(now);
        ping.stop(now + 0.06);
      } catch {
        /* decorative */
      }
    };

    // Continuous rolling rumble — looped noise through a band-pass whose
    // centre frequency and gain track the ball's speed over the surface.
    let rollSrc: AudioBufferSourceNode | null = null;
    let rollGain: GainNode | null = null;
    let rollFilter: BiquadFilterNode | null = null;
    const ensureRoll = () => {
      if (rollSrc || !audioCtx) return;
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      rollSrc = audioCtx.createBufferSource();
      rollSrc.buffer = buf;
      rollSrc.loop = true;
      rollFilter = audioCtx.createBiquadFilter();
      rollFilter.type = 'bandpass';
      rollFilter.Q.value = 0.9;
      rollGain = audioCtx.createGain();
      rollGain.gain.value = 0;
      rollSrc.connect(rollFilter).connect(rollGain).connect(audioCtx.destination);
      rollSrc.start();
    };
    const setRoll = (speed: number) => {
      try {
        if (!audioCtx || speed < 0.15) {
          if (audioCtx && rollGain) rollGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.12);
          return;
        }
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        ensureRoll();
        if (!rollGain || !rollFilter) return;
        const now = audioCtx.currentTime;
        rollGain.gain.setTargetAtTime(Math.min(0.08, 0.012 + speed * 0.0035), now, 0.09);
        rollFilter.frequency.setTargetAtTime(Math.min(1500, 260 + speed * 55), now, 0.09);
      } catch {
        /* decorative */
      }
    };

    // ── geometry helpers ─────────────────────────────────────────────────────
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const R = (canvas.width / 2) * 0.96;
    const R_TRACK = 0.845 * R; // ball's outer-lane radius
    const R_POCKET = 0.575 * R; // where the ball finally rests
    const R_NUMBER = 0.655 * R;
    const DEFLECTOR_R = 0.735 * R;

    const wheelAngle = (t: number) => thetaW0 + WHEEL_REVS * TAU * (1 - Math.pow(1 - t, WHEEL_POW));

    // Ball: a single decelerating glide from thetaB0 that ends exactly on the
    // awarded pocket (mod 2π) when the wheel comes to rest.
    const landAngle = thetaW0 + WHEEL_REVS * TAU + pocketAngle; // wheel rest + pocket centre
    let ballDelta = landAngle - thetaB0;
    ballDelta -= TAU * Math.round(ballDelta / TAU); // reduce to (-π, π]
    ballDelta -= BALL_REVS * TAU; // …then take the scenic route (opposite the wheel)
    const ballAngle = (t: number) => thetaB0 + ballDelta * (1 - Math.pow(1 - t, BALL_POW));

    // Hop-free radial journey — collision math uses this so the baked hops
    // never feed back into the trajectory (they are layered on top).
    const baseRadius = (t: number) => {
      const hd = clamp01((t - DROP_START) / (DROP_END - DROP_START));
      return R_TRACK + (R_POCKET - R_TRACK) * smooth(hd);
    };

    // ── deflector collision pre-pass ─────────────────────────────────────────
    const DEF_DR = DEFLECTOR_RADIAL * R;
    const DEF_TW = DEFLECTOR_TANGENT * R;
    const BALL_R = BALL_RADIUS * R;
    const bandInner = DEFLECTOR_R - (DEF_DR + BALL_R * 0.9);
    const bandOuter = DEFLECTOR_R + (DEF_DR + BALL_R * 0.9);
    const inBand = (t: number) => {
      const r = baseRadius(t);
      return r >= bandInner && r <= bandOuter;
    };
    // Peak of the smoothstep drop speed — the normaliser for impact strength.
    const vRef = (1.5 * (R_TRACK - R_POCKET)) / ((DROP_END - DROP_START) * DURATION_S);
    interface DeflectorHit { t0: number; amp: number; strength: number }
    const hits: DeflectorHit[] = [];
    {
      const SPACING = TAU / DEFLECTORS;
      const PHASE = TAU / (DEFLECTORS * 2);
      const fretPos = (t: number) => (ballAngle(t) - PHASE) / SPACING; // decreasing
      const SCAN = 0.0004;
      let prev = fretPos(DROP_START);
      for (let t = DROP_START + SCAN; t <= DROP_END + SCAN; t += SCAN) {
        const cur = fretPos(t);
        if (inBand(t)) {
          // Each integer boundary crossed = ball passing one deflector angle.
          for (let m = Math.ceil(cur); m <= Math.floor(prev); m++) {
            const target = m * SPACING + PHASE;
            let lo = t - SCAN;
            let hi = t;
            for (let it = 0; it < 24; it++) {
              const mid = (lo + hi) / 2;
              if (ballAngle(mid) > target) lo = mid; else hi = mid;
            }
            const tHit = (lo + hi) / 2;
            const eps = 0.0015;
            const vDrop = (baseRadius(tHit + eps) - baseRadius(tHit - eps)) / (2 * eps * DURATION_S);
            const strength = clamp01(-vDrop / vRef);
            if (strength > 0.12) {
              hits.push({ t0: tHit, strength, amp: (0.016 + 0.038 * strength) * R });
            }
          }
        }
        prev = cur;
      }
    }
    // Total damped hop from all deflector kicks up to time t (px, radially).
    const deflectorHop = (t: number) => {
      let h = 0;
      for (const hit of hits) {
        const dt = t - hit.t0;
        if (dt <= 0) continue;
        // Earth-gravity bounce: tight parabolic humps (~140 ms hang time) with
        // fast decay — snappy, not floaty.
        h += hit.amp * Math.exp(-7 * dt) * Math.abs(Math.sin(dt * Math.PI * 7));
      }
      return h;
    };

    const ballState = (t: number) => {
      const thW = wheelAngle(t);
      const theta = ballAngle(t);
      const hd = clamp01((t - DROP_START) / (DROP_END - DROP_START));
      const decay = Math.pow(1 - hd, 2);
      const hop = Math.abs(Math.sin(hd * Math.PI * 20)) * decay * 0.11 * R;
      const kick = deflectorHop(t);
      const jump = Math.abs(Math.sin(hd * Math.PI * 20 + Math.PI / 3)) * decay * 0.08 * R + kick;
      const radius = R_TRACK + (R_POCKET - R_TRACK) * smooth(hd) + hop + kick * 0.55;
      return { theta, radius, jump, hd, thW };
    };

    // ── painting ─────────────────────────────────────────────────────────────
    const tNormRef = { current: 0 };
    const drawWheelHead = (thW: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(thW);
      // Pocket wedges.
      for (let i = 0; i < POCKET_ORDER.length; i++) {
        const n = POCKET_ORDER[i];
        const a0 = i * STEP;
        const a1 = a0 + STEP;
        ctx.beginPath();
        ctx.arc(0, 0, 0.7 * R, a0, a1);
        ctx.arc(0, 0, 0.52 * R, a1, a0, true);
        ctx.closePath();
        ctx.fillStyle = n === 0 ? '#1e8449' : RED_POCKETS.has(n) ? '#b03a2e' : '#16161a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(212,175,55,0.85)'; // gold frets
        ctx.lineWidth = Math.max(1, R * 0.004);
        ctx.stroke();
        // Number label, rotated to face outward.
        ctx.save();
        ctx.rotate((i + 0.5) * STEP);
        ctx.fillStyle = '#f5f0e1';
        ctx.font = `700 ${Math.round(R * 0.055)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), R_NUMBER, 0);
        ctx.restore();
      }
      // Highlight the winning wedge once the ball is coming to rest.
      if (tNormRef.current > LAND_T) {
        const a0 = pocketIndex * STEP;
        ctx.beginPath();
        ctx.arc(0, 0, 0.7 * R, a0, a0 + STEP);
        ctx.arc(0, 0, 0.52 * R, a0 + STEP, a0, true);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,215,64,0.28)';
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = Math.max(2, R * 0.008);
        ctx.stroke();
      }
      // Inner cone + turret.
      const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.52 * R);
      cone.addColorStop(0, '#3d2b1f');
      cone.addColorStop(1, '#241a11');
      ctx.beginPath();
      ctx.arc(0, 0, 0.52 * R, 0, TAU);
      ctx.fillStyle = cone;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 0.09 * R, 0, TAU);
      ctx.fillStyle = '#d4af37';
      ctx.fill();
      for (let k = 0; k < 4; k++) {
        ctx.save();
        ctx.rotate((k * TAU) / 4);
        ctx.beginPath();
        ctx.ellipse(0.17 * R, 0, 0.09 * R, 0.022 * R, 0, 0, TAU);
        ctx.fillStyle = '#d4af37';
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    };

    const drawBowl = () => {
      // Outer wooden rim (static bowl).
      const rim = ctx.createRadialGradient(cx, cy, 0.86 * R, cx, cy, R);
      rim.addColorStop(0, '#7a4a22');
      rim.addColorStop(0.5, '#5b3a1e');
      rim.addColorStop(1, '#3a2412');
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.fillStyle = rim;
      ctx.fill();
      // Ball track groove.
      ctx.beginPath();
      ctx.arc(cx, cy, 0.9 * R, 0, TAU);
      ctx.arc(cx, cy, 0.79 * R, 0, TAU, true);
      ctx.fillStyle = '#241609';
      ctx.fill();
      ctx.strokeStyle = 'rgba(212,175,55,0.5)';
      ctx.lineWidth = Math.max(1.5, R * 0.006);
      ctx.beginPath();
      ctx.arc(cx, cy, 0.9 * R, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 0.79 * R, 0, TAU);
      ctx.stroke();
      // Eight diamond deflectors fixed to the bowl — short radially, long
      // tangentially, like the ramp-shaped frets on a real wheel.
      for (let k = 0; k < DEFLECTORS; k++) {
        const a = (k * TAU) / DEFLECTORS + TAU / (DEFLECTORS * 2);
        const dx = cx + Math.cos(a) * DEFLECTOR_R;
        const dy = cy + Math.sin(a) * DEFLECTOR_R;
        ctx.save();
        ctx.translate(dx, dy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(DEF_DR, 0);
        ctx.lineTo(0, DEF_TW);
        ctx.lineTo(-DEF_DR, 0);
        ctx.lineTo(0, -DEF_TW);
        ctx.closePath();
        ctx.fillStyle = 'rgba(212,175,55,0.92)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,232,160,0.85)';
        ctx.lineWidth = Math.max(1, R * 0.003);
        ctx.stroke();
        ctx.restore();
      }
    };

    // ── loop ─────────────────────────────────────────────────────────────────
    const start = performance.now();
    const trail: Array<{ x: number; y: number }> = [];
    let lastFret = -1;
    let nextHit = 0;
    let raf = 0;
    let revealedNow = false;

    const frame = (now: number) => {
      const t = clamp01((now - start) / DURATION_MS);
      tNormRef.current = t;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBowl();
      drawWheelHead(wheelAngle(t));

      const { theta, radius, jump, hd } = ballState(t);

      // Sound: deflector impacts fire as the ball reaches them, and the
      // rolling rumble tracks the ball's combined speed over the surfaces.
      while (nextHit < hits.length && t >= hits[nextHit].t0) {
        impact(hits[nextHit].strength);
        nextHit += 1;
      }
      const relSpeed = (
        Math.abs(ballDelta) * BALL_POW * Math.pow(1 - t, BALL_POW - 1)
        + WHEEL_REVS * TAU * WHEEL_POW * Math.pow(1 - t, WHEEL_POW - 1)
      ) / DURATION_S;
      setRoll(relSpeed);
      const bx = cx + Math.cos(theta) * radius;
      const by = cy + Math.sin(theta) * radius;

      // Ground shadow at the track/pocket surface, offset by the jump height.
      ctx.beginPath();
      ctx.ellipse(bx, by + jump * 0.4, R * 0.028, R * 0.012, 0, 0, TAU);
      ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - clamp01(jump / (0.09 * R)))})`;
      ctx.fill();
      // Fading trail.
      trail.push({ x: bx, y: by - jump });
      if (trail.length > 12) trail.shift();
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, R * 0.014 * (i / trail.length), 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${0.14 * (i / trail.length)})`;
        ctx.fill();
      }
      // The ball.
      const ballR = BALL_R;
      const grad = ctx.createRadialGradient(bx - ballR * 0.4, by - jump - ballR * 0.4, ballR * 0.2, bx, by - jump, ballR);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.7, '#e8e8e8');
      grad.addColorStop(1, '#9a9a9a');
      ctx.beginPath();
      ctx.arc(bx, by - jump, ballR, 0, TAU);
      ctx.fillStyle = grad;
      ctx.fill();

      // Click track: relative-angle fret crossings → ticks.
      const rel = wrapAngle(theta - wheelAngle(t));
      const fret = Math.floor(((rel % TAU) + TAU) % TAU / STEP);
      if (fret !== lastFret) {
        lastFret = fret;
        // Higher-pitched rail ticks on the outer track, duller pocket frets
        // once the ball has dropped below the rim.
        if (t > 0.12) click(hd > 0 ? 900 : 2200, hd > 0 ? 0.06 : 0.035);
      }

      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else if (!revealedNow) {
        // Ball has landed — only now is the settlement revealed to the player.
        revealedNow = true;
        setPhase('done');
        setRevealed(true);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      try {
        rollSrc?.stop();
      } catch {
        /* already stopped */
      }
    };
  }, [phase, result]);

  // ── betting board ────────────────────────────────────────────────────────────
  const addBet = (key: string) => {
    if (phase !== 'betting') return;
    betStackRef.current.push(key);
    setBets((b) => ({ ...b, [key]: (b[key] ?? 0) + 1 }));
  };
  const removeBet = (key: string) => {
    if (phase !== 'betting') return;
    setBets((b) => {
      const next = { ...b };
      const left = (next[key] ?? 0) - 1;
      if (left > 0) next[key] = left;
      else delete next[key];
      return next;
    });
    const i = betStackRef.current.lastIndexOf(key);
    if (i >= 0) betStackRef.current.splice(i, 1);
  };
  const undoBet = () => {
    const key = betStackRef.current.pop();
    if (key) removeBet(key);
  };
  const clearBets = () => {
    if (phase !== 'betting') return;
    betStackRef.current = [];
    setBets({});
  };

  const chip = (n: number) =>
    n > 0 ? (
      <span className="absolute -right-1 -top-1 z-10 flex min-w-4 items-center justify-center rounded-full border border-amber-200/70 bg-amber-400 px-0.5 text-[9px] font-black tabular-nums text-black shadow">
        {n}
      </span>
    ) : null;

  const spot = (key: string, label: string, extra: string, place?: { gridColumn?: string; gridRow?: string }) => {
    const n = bets[key] ?? 0;
    return (
      <button
        key={key}
        type="button"
        onClick={() => addBet(key)}
        onContextMenu={(e) => {
          e.preventDefault();
          removeBet(key);
        }}
        style={place}
        title={`${label} — pays ×${key.startsWith('n:') ? PAYOUT_STRAIGHT : key.startsWith('dozen:') || key.startsWith('col:') ? PAYOUT_DOZEN : PAYOUT_EVEN}`}
        className={cn(
          'relative flex h-7 min-w-0 items-center justify-center rounded border font-mono text-[10px] font-bold transition-all',
          'hover:brightness-125 active:scale-95 disabled:cursor-not-allowed',
          n > 0 ? 'border-amber-300 ring-1 ring-amber-300/60' : '',
          extra,
        )}
      >
        {label}
        {chip(n)}
      </button>
    );
  };

  // Standard European table orientation: top row 3,6,…,36; middle 2,5,…,35;
  // bottom 1,4,…,34; the three "2:1" column cells sit to the right of the row
  // they cover. Everything is placed explicitly — auto-flow would scramble it.
  const bettingBoard = (
    <div className="w-full select-none rounded-xl border border-emerald-900/60 bg-emerald-950/40 p-2">
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: '28px repeat(12, minmax(0,1fr)) 38px', gridTemplateRows: 'repeat(5, 28px)' }}
      >
        {spot('n:0', '0', 'bg-emerald-700/80 text-emerald-100', { gridColumn: '1', gridRow: '1 / span 3' })}
        {[1, 2, 3].map((row) =>
          Array.from({ length: 12 }, (_, c) => c + 1).map((col) => {
            const n = col * 3 - (row - 1);
            return spot(
              `n:${n}`,
              String(n),
              RED_POCKETS.has(n) ? 'bg-red-800/80 text-red-100' : 'bg-zinc-900/90 text-zinc-200',
              { gridColumn: String(col + 1), gridRow: String(row) }
            );
          })
        )}
        {spot('col:3', '2:1', 'bg-emerald-900/70 text-emerald-100', { gridColumn: '14', gridRow: '1' })}
        {spot('col:2', '2:1', 'bg-emerald-900/70 text-emerald-100', { gridColumn: '14', gridRow: '2' })}
        {spot('col:1', '2:1', 'bg-emerald-900/70 text-emerald-100', { gridColumn: '14', gridRow: '3' })}
        {spot('dozen:1', '1st 12', 'bg-emerald-900/70 text-emerald-100', { gridColumn: '2 / span 4', gridRow: '4' })}
        {spot('dozen:2', '2nd 12', 'bg-emerald-900/70 text-emerald-100', { gridColumn: '6 / span 4', gridRow: '4' })}
        {spot('dozen:3', '3rd 12', 'bg-emerald-900/70 text-emerald-100', { gridColumn: '10 / span 4', gridRow: '4' })}
        {spot('low', '1–18', 'bg-emerald-900/70 text-emerald-100', { gridColumn: '2 / span 2', gridRow: '5' })}
        {spot('even', 'EVEN', 'bg-emerald-900/70 text-emerald-100', { gridColumn: '4 / span 2', gridRow: '5' })}
        {spot('red', 'RED', 'bg-red-800/80 text-red-100', { gridColumn: '6 / span 2', gridRow: '5' })}
        {spot('black', 'BLACK', 'bg-zinc-900/90 text-zinc-200', { gridColumn: '8 / span 2', gridRow: '5' })}
        {spot('odd', 'ODD', 'bg-emerald-900/70 text-emerald-100', { gridColumn: '10 / span 2', gridRow: '5' })}
        {spot('high', '19–36', 'bg-emerald-900/70 text-emerald-100', { gridColumn: '12 / span 2', gridRow: '5' })}
      </div>
    </div>
  );

  const colorLabel = result ? (result.pocket === 0 ? 'GREEN' : RED_POCKETS.has(result.pocket) ? 'RED' : 'BLACK') : '';

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) applyAndClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') applyAndClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Wheel of Fortune"
        className="glass-panel relative flex max-h-[95vh] w-[min(600px,calc(100vw-24px))] flex-col items-center gap-3 overflow-y-auto rounded-2xl border-amber-400/30 p-5 shadow-2xl"
      >
        <button
          type="button"
          onClick={applyAndClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        <h2 className="flex items-center gap-2 font-mono text-xl font-extrabold tracking-tight text-amber-400">
          <RotateCw className="size-5" /> Wheel of Fortune
        </h2>

        <canvas ref={canvasRef} className={phase === 'betting' ? '' : ''} />

        {/* Payout reference (standard casino odds × 1.5). */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {[
            [`Straight ×${PAYOUT_STRAIGHT}`, 'n:0'],
            [`Dozen/Column ×${PAYOUT_DOZEN}`, 'dozen:1'],
            [`Red/Black/Even/Odd/High/Low ×${PAYOUT_EVEN}`, 'red'],
          ].map(([label, probe]) => {
            const key = probe;
            const won =
              revealed &&
              result !== null &&
              result.wins.some((w) =>
                key === 'n:0'
                  ? w.key.startsWith('n:')
                  : key === 'dozen:1'
                    ? w.key.startsWith('dozen:') || w.key.startsWith('col:')
                    : !w.key.startsWith('n:') && !w.key.startsWith('dozen:') && !w.key.startsWith('col:')
              );
            return (
              <span
                key={label}
                className={cn(
                  'rounded border px-2 py-0.5 font-mono text-[10px] tracking-tight transition-colors',
                  won ? 'border-amber-400/60 bg-amber-400/10 text-foreground' : 'border-border/50 text-muted-foreground'
                )}
              >
                {label}
              </span>
            );
          })}
        </div>

        {spinError && (
          <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300">
            {spinError}
          </p>
        )}

        {/* Betting phase: live board + controls. */}
        {phase === 'betting' && (
          <div className="flex w-full flex-col items-center gap-2">
            {bettingBoard}
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={undoBet}
                  disabled={staked === 0}
                  className="rounded-lg border border-border/60 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-foreground/10 disabled:opacity-40"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={clearBets}
                  disabled={staked === 0}
                  className="rounded-lg border border-border/60 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-foreground/10 disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
              <p className="font-mono text-sm font-extrabold text-amber-400">
                Staked <span className="tabular-nums">{staked}</span> 🌶️
              </p>
              <button
                type="button"
                onClick={doSpin}
                disabled={staked === 0 || spinning}
                className="rounded-lg border border-amber-400/50 bg-amber-500/80 px-6 py-1.5 text-sm font-extrabold text-white transition-colors hover:brightness-110 disabled:opacity-40"
              >
                {spinning ? 'No more bets…' : 'SPIN'}
              </button>
            </div>
            <p className="text-center font-mono text-[10px] text-muted-foreground/70">
              Click a spot to stack 1 🌶️ · right-click to remove one · zero kills outside bets
            </p>
          </div>
        )}

        {phase === 'spinning' && <p className="font-mono text-xs text-muted-foreground">No more bets…</p>}

        {revealed && result && (
          <div className="flex w-full flex-col items-center gap-2 pb-1">
            <p className="font-mono text-lg font-extrabold text-foreground">
              <span
                className={
                  result.pocket === 0 ? 'text-emerald-400' : RED_POCKETS.has(result.pocket) ? 'text-red-400' : 'text-zinc-200'
                }
              >
                {result.pocket} {colorLabel}
              </span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className={result.net > 0 ? 'text-amber-400' : result.net < 0 ? 'text-red-400' : 'text-muted-foreground'}>
                {result.net > 0 ? `+${result.net}` : result.net} 🌶️
              </span>
            </p>
            {result.wins.length > 0 && (
              <p className="max-w-full text-center font-mono text-[11px] text-muted-foreground">
                {result.wins
                  .map((w) => `${betLabel(w.key)} ×${w.stake} → +${w.stake + w.profit}`)
                  .join('  ·  ')}
              </p>
            )}
            <p className="font-mono text-[10px] text-muted-foreground/70">
              staked {result.staked} · returned {result.returned}
            </p>
            <button
              type="button"
              onClick={applyAndClose}
              className="rounded-lg border border-amber-400/50 bg-amber-500/80 px-6 py-2 text-sm font-extrabold text-white transition-colors hover:brightness-110"
            >
              Collect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
