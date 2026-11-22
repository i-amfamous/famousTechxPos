import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LuCameraOff, LuKeyboard, LuRefreshCw, LuScanBarcode } from "react-icons/lu";
import { Button, Callout, Input, Spinner } from "@/components/ui";
import { cn } from "@/lib/format";
import { scanFeedback } from "./feedback";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93", "itf", "qr_code"];

interface Detector { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
declare global {
  interface Window { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }
}

type ScannerState = "starting" | "running" | "denied" | "nocamera" | "insecure" | "error";

/**
 * Live camera barcode scanner. Uses the browser's BarcodeDetector where it exists
 * (Chrome, Edge, Android) and falls back to ZXing everywhere else (Safari / iPhone, Firefox).
 * Camera access needs HTTPS (or localhost). A manual entry field keeps it usable if the camera fails.
 */
export function CameraScanner({ onDetected, paused, className, allowManual = true }: { onDetected: (code: string) => void; paused?: boolean; className?: string; allowManual?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScannerState>("starting");
  const [flash, setFlash] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const cb = useRef(onDetected);
  cb.current = onDetected;
  const flashTimer = useRef<number | undefined>(undefined);

  const hit = useCallback((raw: string) => {
    const code = raw.trim();
    const now = Date.now();
    if (!code || pausedRef.current) return;
    // Ignore the same code for a moment so one label doesn't fire dozens of times.
    if (code === last.current.code && now - last.current.at < 700) return;
    last.current = { code, at: now };
    setLastCode(code);
    scanFeedback(true);
    setFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 260);
    cb.current(code);
  }, []);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  useEffect(() => {
    if (!window.isSecureContext) { setState("insecure"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setState("nocamera"); return; }
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let zxingStop: (() => void) | undefined;
    setState("starting");
    setLastCode(null);

    const stopStream = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      if (video.current) video.current.srcObject = null;
    };

    /** ZXing path: it opens its own camera stream, so release the BarcodeDetector stream first. */
    const startZxing = async () => {
      stopStream();
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false },
        video.current!,
        (result) => { if (result) hit(result.getText()); },
      );
      zxingStop = () => controls.stop();
      if (stopped) zxingStop();
      else setState("running");
    };

    (async () => {
      try {
        if (window.BarcodeDetector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
          if (stopped) return stopStream();
          const v = video.current!;
          v.srcObject = stream;
          await v.play();

          let formats = FORMATS;
          try {
            const supported = await window.BarcodeDetector.getSupportedFormats?.();
            if (supported?.length) formats = FORMATS.filter((f) => supported.includes(f));
          } catch { /* use the default format list */ }
          if (!formats.length) formats = FORMATS;

          try {
            const detector = new window.BarcodeDetector({ formats });
            setState("running");
            const tick = async () => {
              if (stopped) return;
              try {
                if (v.readyState >= 2) {
                  const found = await detector.detect(v);
                  if (found[0]) hit(found[0].rawValue);
                }
              } catch { /* frame not ready - try the next one */ }
              timer = window.setTimeout(tick, 120);
            };
            void tick();
            return;
          } catch {
            // Some browsers expose BarcodeDetector but reject the requested formats.
            await startZxing();
            return;
          }
        }
        await startZxing();
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setState(name === "NotAllowedError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "nocamera" : "error");
      }
    })();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stopStream();
      zxingStop?.();
    };
  }, [attempt, hit]);

  const submitManual = (e: FormEvent) => {
    e.preventDefault();
    if (!manual.trim()) return;
    hit(manual);
    setManual("");
  };

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
        This device has no usable camera. Use a USB/Bluetooth scanner, pair your phone, or type the barcode below.
        <div className="mt-2"><Button size="sm" variant="secondary" icon={<LuRefreshCw className="size-4" />} onClick={() => setAttempt((a) => a + 1)}>Try again</Button></div>
      </Callout>
    );

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/10">
        <video ref={video} playsInline muted autoPlay aria-label="Live camera barcode scanner" className="aspect-[4/3] w-full bg-black object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className={cn("scanner-frame relative h-44 w-[78%] max-w-sm rounded-2xl border transition-colors duration-150", flash ? "border-emerald-400 bg-emerald-400/15" : "border-white/30 bg-white/5")}>
            <span className="scanner-corner tl" /><span className="scanner-corner tr" />
            <span className="scanner-corner bl" /><span className="scanner-corner br" />
            <span className={cn("scanner-line", flash && "scanner-line-hit")} />
          </div>
        </div>
        {state === "starting" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-ink-900/75 text-sm text-white">
            <Spinner className="size-6" /> Starting camera…
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-ink-900/90 to-transparent px-4 pb-3 pt-8 text-xs text-white">
          <span className="flex items-center gap-2 font-medium">
            <LuScanBarcode className={cn("size-4", state === "running" && !paused && !flash && "scanner-pulse text-rose-300")} />
            {paused ? "Paused" : state === "running" ? "Scanning - hold the barcode steady" : "Starting camera…"}
          </span>
          {lastCode && <span className="num max-w-[45%] truncate rounded-full bg-white/10 px-2 py-1 font-mono">{lastCode}</span>}
        </div>
      </div>

      {allowManual && (
        <form onSubmit={submitManual} className="mt-3 flex gap-2">
          <Input
            className="flex-1"
            placeholder="Or type the barcode number"
            inputMode="numeric"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-label="Type a barcode"
          />
          <Button type="submit" variant="secondary" icon={<LuKeyboard className="size-4" />}>Use code</Button>
        </form>
      )}
    </div>
  );
}
