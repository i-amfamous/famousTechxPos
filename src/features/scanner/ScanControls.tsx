import { useEffect, useState } from "react";
import { LuBluetooth, LuCamera, LuScanBarcode, LuSmartphone, LuUnplug, LuUsb, LuWifi } from "react-icons/lu";
import { Badge, Button, Callout, Input, Menu, Modal } from "@/components/ui";
import { cn } from "@/lib/format";
import { CameraScanner } from "./CameraScanner";
import { useScanner } from "./ScannerProvider";

/**
 * "Scan" button with every scan source. Put it on any screen that uses `useScan`.
 * USB/Bluetooth scanners need no setup — they work whenever the screen is open.
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
          { label: <span className="text-xs text-ink-500">USB & Bluetooth scanners work automatically — just scan.</span>, icon: <LuUsb />, onClick: () => {}, disabled: true },
        ]}
      />
    </>
  );
}

/** Mounted once (in App). Renders the camera + phone pairing windows. */
export function ScannerWindows() {
  const s = useScanner();
  const [last, setLast] = useState<{ code: string; label: string; ok: boolean } | null>(null);
  useEffect(() => { if (!s.cameraOpen) setLast(null); }, [s.cameraOpen]);
  return (
    <>
      <Modal open={s.cameraOpen} onClose={() => s.setCameraOpen(false)} title="Scan with camera" description="Hold the barcode inside the frame. Keep scanning — each item is added." size="md"
        footer={<Button onClick={() => s.setCameraOpen(false)}>Done</Button>}>
        {s.cameraOpen && (
          <CameraScanner onDetected={async (code) => { const r = await s.dispatch(code, "camera"); setLast({ code, ...r }); }} />
        )}
        {last && (
          <div className={cn("mt-3 rounded-lg px-3 py-2 text-sm ring-1", last.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-rose-200")}>
            {last.label} <span className="font-mono text-xs opacity-70">· {last.code}</span>
          </div>
        )}
      </Modal>
      <PhonePairingModal />
    </>
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
            <li>Scan items with your phone — they appear on this screen.</li>
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
        <p className="flex gap-2"><LuUsb className="mt-0.5 size-4 shrink-0 text-brand-600" /> <span><b>USB scanner?</b> Plug it in and scan — nothing to set up.</span></p>
      </div>
    </Modal>
  );
}
