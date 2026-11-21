let ctx: AudioContext | null = null;
/** Short beep + vibration so staff know a scan registered. */
export function scanFeedback(ok = true) {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = ok ? 1250 : 320;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.08 : 0.22));
  } catch { /* audio not available */ }
  try { navigator.vibrate?.(ok ? 60 : [80, 60, 80]); } catch { /* ignore */ }
}
