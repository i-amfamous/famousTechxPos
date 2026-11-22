import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LuBluetooth, LuCamera, LuCircleCheck, LuCircleX, LuKeyboard, LuPackage, LuScanBarcode, LuSmartphone, LuSparkles, LuUnplug, LuUsb, LuWifi } from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useProducts } from "@/services/api";
import { Badge, Button, Callout, Input, Menu, Modal, Spinner } from "@/components/ui";
import { cn, formatMoney } from "@/lib/format";
import type { BarcodeLookup } from "@/types";
import { CameraScanner } from "./CameraScanner";
import { useScanner } from "./ScannerProvider";

/**
 * "Scan" button with every scan source. Put it on any screen that uses `useScan`.
 * USB/Bluetooth scanners need no setup - they work whenever the screen is open.
 */
export function ScanButton({ label = "Scan", size = "md", variant = "secondary", className }: { label?: string; size?: "sm" | "md" | "lg"; variant?: "secondary" | "primary" | "accent"; className?: string }) {
  const s = useScanner();
  return (
    <>
      <Menu
        trigger={(p) => (
          <Button {...p} size={size} variant={variant} className={className} icon={<LuScanBarcode className="size-4" />}>
            {label}
            {s.phone.connected && <span className="ml-1 size-2 rounded-full bg-emerald-500" aria-label="Phone connected" />}
          </Button>
        )}
        items={[
          { label: "Use this device's camera", icon: <LuCamera />, onClick: () => s.setCameraOpen(true) },
          { label: s.phone.connected ? "Phone scanner connected" : "Use my phone as a scanner", icon: <LuSmartphone />, onClick: () => { s.startPhonePairing(); s.setPairingOpen(true); } },
          ...(s.phone.sessionId ? [{ label: "Disconnect phone", icon: <LuUnplug />, onClick: s.stopPhonePairing }] : []),
          "divider" as const,
          { label: <span className="text-xs text-ink-500">USB & Bluetooth scanners work automatically - just scan.</span>, icon: <LuUsb />, onClick: () => {}, disabled: true },
        ]}
      />
    </>
  );
}

interface ScanResult {
  code: string;
  label: string;
  ok: boolean;
  loading: boolean;
  lookup?: BarcodeLookup;
}

/** Mounted once (in App). Renders the camera + phone pairing windows. */
export function ScannerWindows() {
  const s = useScanner();
  const products = useProducts().data;
  const { can } = useSession();
  const navigate = useNavigate();
  const [result, setResult] = useState<ScanResult | null>(null);
  const seq = useRef(0);

  useEffect(() => { if (!s.cameraOpen) setResult(null); }, [s.cameraOpen]);

  const onDetected = async (code: string) => {
    const mine = ++seq.current;
    const r = await s.dispatch(code, "camera");
    setResult({ code, label: r.label, ok: r.ok, loading: true });
    try {
      const lookup = await actions.lookupBarcode(code, products);
      if (mine === seq.current) setResult({ code, label: r.label, ok: r.ok, loading: false, lookup });
    } catch {
      if (mine === seq.current) setResult({ code, label: r.label, ok: r.ok, loading: false, lookup: { found: false, source: "none" } });
    }
  };

  return (
    <>
      <Modal
        open={s.cameraOpen}
        onClose={() => s.setCameraOpen(false)}
        title="Scan with camera"
        description="Hold the barcode inside the frame. The moving line shows it's scanning - each code is read and looked up."
        size="md"
        footer={<Button onClick={() => s.setCameraOpen(false)}>Done</Button>}
      >
        {s.cameraOpen && <CameraScanner onDetected={onDetected} />}
        {result && <ScanResultCard result={result} canManage={can("products.manage")} onOpenProduct={() => { s.setCameraOpen(false); navigate(`/products?barcode=${encodeURIComponent(result.code)}`); }} />}
      </Modal>
      <PhonePairingModal />
    </>
  );
}

function ScanResultCard({ result, canManage, onOpenProduct }: { result: ScanResult; canManage: boolean; onOpenProduct: () => void }) {
  const online = result.lookup?.source === "online" ? result.lookup.online : undefined;
  const local = result.lookup?.source === "catalogue" ? result.lookup.product : undefined;
  const image = local?.imageUrl || online?.images[0];
  return (
    <div className={cn("mt-4 overflow-hidden rounded-2xl ring-1", result.ok ? "bg-emerald-50/70 ring-emerald-200" : "bg-rose-50/70 ring-rose-200")}>
      <div className="flex items-start gap-3 p-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", result.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
          {result.ok ? <LuCircleCheck className="size-5" /> : <LuCircleX className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold", result.ok ? "text-emerald-900" : "text-rose-900")}>{result.label}</p>
          <p className="mt-0.5 font-mono text-xs text-ink-500">Barcode {result.code}</p>
        </div>
        {result.loading && <Spinner className="mt-1 size-4 text-brand-600" />}
      </div>

      <div className="border-t border-white/70 bg-white/80 p-4">
        {result.loading ? (
          <p className="flex items-center gap-2 text-sm text-ink-600"><Spinner className="size-4 text-brand-600" /> Fetching product details for this code…</p>
        ) : local ? (
          <div className="flex gap-3">
            {image ? <img src={image} alt="" className="size-16 shrink-0 rounded-xl bg-white object-cover ring-1 ring-ink-200" /> : <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><LuPackage className="size-7" /></span>}
            <div className="min-w-0">
              <p className="font-semibold text-ink-900">{local.name}</p>
              <p className="text-xs text-ink-500">{[local.brand, local.sku].filter(Boolean).join(" · ")}</p>
              <p className="num mt-1 text-sm font-medium text-ink-800">{formatMoney(local.sellingPrice)} <span className="text-xs font-normal text-ink-500">· {local.stock} in stock</span></p>
              <Badge tone="success" className="mt-2">In your catalogue</Badge>
            </div>
          </div>
        ) : online ? (
          <div className="flex gap-3">
            {image ? <img src={image} alt="" className="size-16 shrink-0 rounded-xl bg-white object-contain ring-1 ring-ink-200" /> : <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><LuSparkles className="size-7" /></span>}
            <div className="min-w-0">
              <p className="font-semibold text-ink-900">{online.name}</p>
              <p className="text-xs text-ink-500">{[online.brand, online.category].filter(Boolean).join(" · ")}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700"><LuSparkles className="size-3.5" /> Found via {online.source}</p>
              {online.description && <p className="mt-1 line-clamp-2 text-xs text-ink-500">{online.description}</p>}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-ink-800">No details found for this barcode</p>
            <p className="mt-1 text-xs text-ink-500">You can still add it manually - we'll keep the code and let you fill in the rest.</p>
          </div>
        )}

        {canManage && (local || online || result.lookup?.source === "none") && (
          <Button size="sm" variant="secondary" className="mt-3" icon={<LuKeyboard className="size-4" />} onClick={onOpenProduct}>
            {local ? "Open product" : "Add details to catalogue"}
          </Button>
        )}
      </div>
    </div>
  );
}

function PhonePairingModal() {
  const s = useScanner();
  const [qr, setQr] = useState<string | null>(null);
  const local = typeof location !== "undefined" && /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const [base, setBase] = useState(() => localStorage.getItem("ftx.publicUrl") ?? (local ? "" : location.origin));
  const url = s.phone.sessionId && base ? `${base.replace(/\/$/, "")}/scan/${s.phone.sessionId}` : "";

  useEffect(() => {
    let alive = true;
    if (!url) { setQr(null); return; }
    import("qrcode").then((m) => m.default.toDataURL(url, { margin: 1, width: 240, color: { dark: "#14142b", light: "#ffffff" } })).then((d) => alive && setQr(d)).catch(() => setQr(null));
    return () => { alive = false; };
  }, [url]);

  return (
    <Modal open={s.pairingOpen} onClose={() => s.setPairingOpen(false)} title="Use your phone as a scanner" description="Works over Wi-Fi or mobile data. No app to install." size="md">
      <div className="grid gap-5 sm:grid-cols-[240px_1fr]">
        <div className="flex aspect-square items-center justify-center rounded-2xl bg-white p-2 ring-1 ring-ink-200">
          {qr ? <img src={qr} alt="QR code to pair your phone" className="size-full" /> : <p className="p-4 text-center text-sm text-ink-500">{base ? "Generating QR…" : "Enter the address your phone can open →"}</p>}
        </div>
        <div className="space-y-4 text-sm">
          <ol className="list-decimal space-y-2 pl-4 text-ink-700">
            <li>Open your phone's camera and point it at the QR code.</li>
            <li>Tap the link, then allow camera access.</li>
            <li>Scan items with your phone - they appear on this screen.</li>
          </ol>
          <div className="flex items-center gap-2">
            {s.phone.connected ? <Badge tone="success" dot>Connected{s.phone.device ? ` · ${s.phone.device}` : ""}</Badge> : <Badge tone="info" dot>Waiting for phone…</Badge>}
          </div>
          {local && (
            <Callout tone="warning" icon={<LuWifi className="size-4" />} title="Your phone can't open “localhost”">
              Use the deployed site, or run <code>npm run dev:https</code> and enter this computer's network address (e.g. https://192.168.1.20:5173).
              <Input className="mt-2" placeholder="https://192.168.1.20:5173" value={base} onChange={(e) => { setBase(e.target.value); localStorage.setItem("ftx.publicUrl", e.target.value); }} />
            </Callout>
          )}
          {url && <p className="break-all font-mono text-xs text-ink-400">{url}</p>}
        </div>
      </div>
      <div className="mt-5 grid gap-2 rounded-xl bg-ink-50 p-4 text-xs text-ink-600 sm:grid-cols-2">
        <p className="flex gap-2"><LuBluetooth className="mt-0.5 size-4 shrink-0 text-brand-600" /> <span><b>Bluetooth scanner?</b> Pair it with this computer/tablet in system settings (it works like a keyboard). Then just scan.</span></p>
        <p className="flex gap-2"><LuUsb className="mt-0.5 size-4 shrink-0 text-brand-600" /> <span><b>USB scanner?</b> Plug it in and scan - nothing to set up.</span></p>
      </div>
    </Modal>
  );
}
