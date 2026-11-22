/**
 * One place for every scan source. Whatever screen is on top registers a handler
 * with `useScan(handler)`; scans from any source go to it:
 *   1. USB / Bluetooth barcode scanners (they type like a keyboard + Enter) - always on
 *   2. This device's camera (CameraScanModal)
 *   3. A phone paired over Wi-Fi / internet (QR code → /scan/:session on the phone)
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui";
import { openScanChannel, type ScanChannel } from "./channel";
import { scanFeedback } from "./feedback";

/** A handler may return a short label ("Added Samsung A15") or throw to reject the scan. */
export type ScanHandler = (code: string, source: ScanSource) => void | string | Promise<void | string>;
export type ScanSource = "keyboard" | "camera" | "phone";

interface ScannerState {
  dispatch: (code: string, source: ScanSource) => Promise<{ ok: boolean; label: string }>;
  register: (h: ScanHandler) => () => void;
  /** Phone pairing */
  phone: { sessionId: string | null; connected: boolean; device: string | null; lastScan: string | null };
  startPhonePairing: () => string;
  stopPhonePairing: () => void;
  cameraOpen: boolean;
  setCameraOpen: (v: boolean) => void;
  pairingOpen: boolean;
  setPairingOpen: (v: boolean) => void;
}

const Ctx = createContext<ScannerState | null>(null);
const PAIR_KEY = "ftx.phoneScanner";

export function ScannerProvider({ children }: { children: ReactNode }) {
  const handlers = useRef<ScanHandler[]>([]);
  const toast = useToast();
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [phone, setPhone] = useState<ScannerState["phone"]>(() => ({ sessionId: sessionStorage.getItem(PAIR_KEY), connected: false, device: null, lastScan: null }));
  const channel = useRef<ScanChannel | null>(null);
  const greeted = useRef(false);

  const register = useCallback((h: ScanHandler) => {
    handlers.current.push(h);
    return () => { handlers.current = handlers.current.filter((x) => x !== h); };
  }, []);

  const dispatch = useCallback(async (code: string, source: ScanSource) => {
    const h = handlers.current[handlers.current.length - 1];
    if (!h) {
      toast({ tone: "info", title: `Scanned ${code}`, body: "Open the POS, Products or Inventory to use scans." });
      return { ok: false, label: "No screen is waiting for a scan" };
    }
    try {
      const label = (await h(code, source)) || `Scanned ${code}`;
      if (source === "keyboard") scanFeedback(true);
      return { ok: true, label };
    } catch (e) {
      if (source !== "camera") scanFeedback(false);
      const msg = (e as Error)?.message ?? "Scan rejected";
      toast({ tone: "error", title: msg, body: code });
      return { ok: false, label: msg };
    }
  }, [toast]);

  /* ── 1. Keyboard-wedge scanners (USB / Bluetooth HID) ── */
  useEffect(() => {
    let buf = "";
    let last = 0;
    let started = 0;
    let fast = 0;
    let target: HTMLInputElement | HTMLTextAreaElement | null = null;
    let before = "";
    const setNative = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      // Inputs marked data-scan="native" (e.g. POS search) handle scanner input themselves.
      if (el?.closest?.('[data-scan="native"]')) return;
      // Never swallow normal typing in a password box or rich-text field.
      if (el instanceof HTMLInputElement && el.type === "password") return;
      if (el?.isContentEditable) return;
      const now = performance.now();
      if (e.key === "Enter") {
        const avg = buf.length > 1 ? (now - started) / (buf.length - 1) : Infinity;
        // Scanners type ~5–15 ms per character; even fast humans are slower than 35 ms.
        if (buf.length >= 8 && fast >= buf.length - 2 && avg <= 35) {
          e.preventDefault();
          e.stopPropagation();
          if (target && target.value !== before && target.value.endsWith(buf)) setNative(target, before);
          void dispatch(buf, "keyboard");
        }
        buf = ""; fast = 0;
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (now - last > 60) {
        buf = ""; fast = 0; started = now;
        target = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
        before = target?.value ?? "";
      } else fast++;
      buf += e.key;
      last = now;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dispatch]);

  /* ── 3. Phone scanner channel ── */
  useEffect(() => {
    if (!phone.sessionId) return;
    greeted.current = false;
    const ch = openScanChannel(phone.sessionId, async (m) => {
      if (m.type === "hello") {
        setPhone((p) => ({ ...p, connected: true, device: m.device }));
        setPairingOpen(false);
        if (!greeted.current) {
          greeted.current = true;
          toast({ tone: "success", title: "Phone scanner connected", body: "Scan with your phone - items appear here." });
        }
      } else if (m.type === "peer") {
        // The relay tells us when the phone joins/leaves, even before it sends a scan.
        if (m.role === "phone" && m.state === "joined") setPhone((p) => ({ ...p, connected: true }));
        if (m.role === "phone" && m.state === "left") setPhone((p) => ({ ...p, connected: false, device: null }));
      } else if (m.type === "bye") {
        setPhone((p) => ({ ...p, connected: false, device: null }));
      } else if (m.type === "scan") {
        setPhone((p) => ({ ...p, connected: true, lastScan: m.code }));
        const r = await dispatch(m.code, "phone");
        ch.send({ type: "ack", id: m.id, ok: r.ok, label: r.label });
      }
    }, (connected) => {
      if (!connected) setPhone((p) => ({ ...p, connected: false, device: null }));
    });
    channel.current = ch;
    return () => { ch.close(); channel.current = null; };
  }, [phone.sessionId, dispatch, toast]);

  const startPhonePairing = useCallback(() => {
    const id = phone.sessionId ?? crypto.randomUUID();
    sessionStorage.setItem(PAIR_KEY, id);
    setPhone((p) => ({ ...p, sessionId: id }));
    return id;
  }, [phone.sessionId]);

  const stopPhonePairing = useCallback(() => {
    sessionStorage.removeItem(PAIR_KEY);
    setPhone({ sessionId: null, connected: false, device: null, lastScan: null });
  }, []);

  return (
    <Ctx.Provider value={{ dispatch, register, phone, startPhonePairing, stopPhonePairing, cameraOpen, setCameraOpen, pairingOpen, setPairingOpen }}>
      {children}
    </Ctx.Provider>
  );
}

export function useScanner() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScanner must be used inside <ScannerProvider>");
  return v;
}

/** Receive scans while this component is mounted (the most recently mounted handler wins). */
export function useScan(handler: ScanHandler, enabled = true) {
  const { register } = useScanner();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    return register((code, src) => ref.current(code, src));
  }, [register, enabled]);
}
