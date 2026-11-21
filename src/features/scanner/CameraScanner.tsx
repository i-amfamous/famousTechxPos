import { useEffect, useRef, useState } from "react";
import { LuCameraOff, LuRefreshCw, LuScanBarcode } from "react-icons/lu";
import { Button, Callout, Spinner } from "@/components/ui";
import { cn } from "@/lib/format";
import { scanFeedback } from "./feedback";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "qr_code"];

interface Detector { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
declare global {
  interface Window { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }
}

/**
 * Live camera barcode scanner. Uses the browser's built-in BarcodeDetector when available
 * (Chrome, Edge, Android) and falls back to ZXing (Safari / iPhone, Firefox).
 * Camera access needs HTTPS (or localhost).
 */
export function CameraScanner({ onDetected, paused, className }: { onDetected: (code: string) => void; paused?: boolean; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "running" | "denied" | "nocamera" | "insecure" | "error">("starting");
  const [flash, setFlash] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const cb = useRef(onDetected);
  cb.current = onDetected;

  useEffect(() => {
    if (!window.isSecureContext) { setState("insecure"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setState("nocamera"); return; }
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let zxingStop: (() => void) | undefined;
    setState("starting");

    const hit = (raw: string) => {
      const code = raw.trim();
      const now = Date.now();
      if (!code || pausedRef.current) return;
      if (code === last.current.code && now - last.current.at < 400) return; // one scan per barcode, but allow quick repeat scans
      last.current = { code, at: now };
      scanFeedback(true);
      setFlash(true);
      setTimeout(() => setFlash(false), 220);
      cb.current(code);
    };

    (async () => {
      try {
        if (window.BarcodeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
          if (stopped) return stream.getTracks().forEach((t) => t.stop());
          const v = video.current!;
          v.srcObject = stream;
          await v.play();
          const supported = (await window.BarcodeDetector.getSupportedFormats?.()) ?? FORMATS;
          const detector = new window.BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
          setState("running");
          const tick = async () => {
            if (stopped) return;
            try {
              if (v.readyState >= 2) {
                const found = await detector.detect(v);
                if (found[0]) hit(found[0].rawValue);
              }
            } catch { /* frame not ready */ }
            timer = window.setTimeout(tick, 180);
          };
          void tick();
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video.current!, (result) => {
            if (result) hit(result.getText());
          });
          zxingStop = () => controls.stop();
          if (stopped) zxingStop();
          else setState("running");
        }
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setState(name === "NotAllowedError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "nocamera" : "error");
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      zxingStop?.();
    };
  }, [attempt]);

  if (state === "insecure")
    return <Callout tone="warning" icon={<LuCameraOff className="size-4" />} title="Camera needs a secure connection">Open the app over HTTPS (or on localhost). For local testing run <code>npm run dev:https</code>.</Callout>;
  if (state === "denied")
    return (
      <Callout tone="danger" icon={<LuCameraOff className="size-4" />} title="Camera access was blocked">
        Allow camera access for this site in the browser's address bar, then try again.
        <div className="mt-2"><Button size="sm" variant="secondary" icon={<LuRefreshCw className="size-4" />} onClick={() => setAttempt((a) => a + 1)}>Try again</Button></div>
      </Callout>
    );
  if (state === "nocamera" || state === "error")
    return (
      <Callout tone="warning" icon={<LuCameraOff className="size-4" />} title="No camera found">
        This device has no usable camera. Use a USB/Bluetooth scanner or pair your phone instead.
        <div className="mt-2"><Button size="sm" variant="secondary" icon={<LuRefreshCw className="size-4" />} onClick={() => setAttempt((a) => a + 1)}>Try again</Button></div>
      </Callout>
    );

  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-ink-900", className)}>
      <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
      {/* aiming frame */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className={cn("relative h-1/3 w-3/4 rounded-xl border-2 transition-colors", flash ? "border-emerald-400 bg-emerald-400/20" : "border-white/80")}>
          <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-rose-500/80" />
        </div>
      </div>
      {state === "starting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-900/70 text-sm text-white">
          <Spinner className="size-6" /> Starting camera…
        </div>
      )}
      <p className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-ink-900/80 to-transparent px-3 pb-3 pt-6 text-sm text-white">
        <LuScanBarcode className="size-4" /> {paused ? "Paused" : "Point at a barcode"}
      </p>
    </div>
  );
}
