import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { LuCircleCheck, LuCircleX, LuKeyboard, LuSmartphone, LuWifi, LuWifiOff } from "react-icons/lu";
import { Badge, Button, Input } from "@/components/ui";
import { Logo } from "@/components/layout/AppLayout";
import { cn, timeAgo } from "@/lib/format";
import { openScanChannel, type ScanChannel } from "./channel";
import { CameraScanner } from "./CameraScanner";

interface Sent { id: string; code: string; at: string; status: "sending" | "ok" | "rejected"; label?: string }

/** Opened on the phone from the pairing QR code. Sends each scan to the paired computer. */
export function PhoneScanPage() {
  const { session = "" } = useParams();
  const ch = useRef<ScanChannel | null>(null);
  const [ready, setReady] = useState(false);
  const [sent, setSent] = useState<Sent[]>([]);
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!session) return;
    const device = /iPhone|iPad/.test(navigator.userAgent) ? "iPhone" : /Android/.test(navigator.userAgent) ? "Android phone" : "Phone";
    const c = openScanChannel(session, (m) => {
      if (m.type === "ack") setSent((s) => s.map((x) => (x.id === m.id ? { ...x, status: m.ok ? "ok" : "rejected", label: m.label } : x)));
      if (m.type === "peer" && m.role === "till" && m.state === "left") setReady(false);
    }, (connected) => {
      setReady(connected);
      if (connected) c.send({ type: "hello", device }); // re-announce after every reconnect
    }, "phone");
    ch.current = c;
    const bye = () => c.send({ type: "bye" });
    window.addEventListener("pagehide", bye);
    return () => { window.removeEventListener("pagehide", bye); bye(); c.close(); };
  }, [session]);

  const send = (code: string) => {
    const id = crypto.randomUUID();
    setSent((s) => [{ id, code, at: new Date().toISOString(), status: "sending" as const }, ...s].slice(0, 30));
    ch.current?.send({ type: "scan", code, id });
  };

  return (
    <div className="mx-auto min-h-full max-w-md bg-ink-50 p-4">
      <header className="mb-4 flex items-center gap-3">
        <Logo className="size-9" />
        <div className="flex-1">
          <p className="font-semibold text-ink-900">Phone scanner</p>
          <p className="text-xs text-ink-500">Famous TechX POS</p>
        </div>
        {ready ? <Badge tone="success"><LuWifi className="size-3" /> Connected</Badge> : <Badge tone="warning"><LuWifiOff className="size-3" /> Connecting…</Badge>}
      </header>

      <CameraScanner onDetected={send} />

      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { send(manual.trim()); setManual(""); } }}>
        <Input className="flex-1" placeholder="Or type a barcode" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Type a barcode" />
        <Button type="submit" variant="secondary" icon={<LuKeyboard className="size-4" />}>Send</Button>
      </form>

      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-ink-500">Sent to computer</h2>
      {sent.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-white p-4 text-sm text-ink-500 ring-1 ring-ink-200"><LuSmartphone className="size-4" /> Scanned items will show here.</p>
      ) : (
        <ul className="space-y-2">
          {sent.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-ink-200">
              {s.status === "ok" ? <LuCircleCheck className="size-5 text-emerald-600" /> : s.status === "rejected" ? <LuCircleX className="size-5 text-rose-600" /> : <span className="size-5 animate-pulse rounded-full bg-ink-200" />}
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium", s.status === "rejected" ? "text-rose-700" : "text-ink-900")}>{s.label ?? "Sending…"}</p>
                <p className="font-mono text-xs text-ink-400">{s.code} · {timeAgo(s.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
