let ctx: AudioContext | null = null;
/** Short, clearly audible beep + vibration so staff know a scan registered. */
export function scanFeedback(ok = true) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const duration = ok ? 0.12 : 0.24;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = ok ? "triangle" : "sine";
    o.frequency.setValueAtTime(ok ? 1200 : 380, now);
    if (ok) o.frequency.exponentialRampToValueAtTime(1680, now + 0.09);
    // A short envelope avoids a click while keeping the beep loud enough on a noisy shop floor.
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(ok ? 0.24 : 0.3, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    o.connect(g).connect(ctx.destination);
    o.start(now);
    o.stop(now + duration + 0.02);
  } catch { /* audio not available */ }
  try { navigator.vibrate?.(ok ? 60 : [80, 60, 80]); } catch { /* ignore */ }
}
