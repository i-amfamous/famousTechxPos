import { useEffect, useState, type ReactNode } from "react";
import { LuDelete } from "react-icons/lu";
import { cn } from "@/lib/format";
import { Spinner } from "./Button";

/**
 * Touch-friendly PIN keypad. Also accepts the physical keyboard (0-9, Backspace, Enter).
 * Calls `onComplete` when `length` digits are entered.
 */
export function PinPad({
  length = 4, onComplete, error, busy, disabled,
}: { length?: number; onComplete: (pin: string) => void; error?: string | null; busy?: boolean; disabled?: boolean }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (error) {
      setShake(true);
      setPin("");
      const t = setTimeout(() => setShake(false), 400);
      return () => clearTimeout(t);
    }
  }, [error]);

  const press = (d: string) => {
    if (busy || disabled) return;
    setPin((p) => {
      const n = (p + d).slice(0, length);
      if (n.length === length) setTimeout(() => onComplete(n), 80);
      return n;
    });
  };
  const back = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="flex flex-col items-center">
      <div className={cn("mb-2 flex h-8 items-center gap-3", shake && "animate-[shake_0.35s]")} aria-label={`${pin.length} of ${length} digits entered`}>
        {busy ? (
          <Spinner className="size-6 text-brand-600" />
        ) : (
          Array.from({ length }).map((_, i) => (
            <span key={i} className={cn("size-4 rounded-full transition-colors", i < pin.length ? "bg-brand-600" : "bg-ink-200", error && "bg-rose-400")} />
          ))
        )}
      </div>
      <p className={cn("mb-4 h-5 text-sm", error ? "text-rose-600" : "text-transparent")} role="alert">{error ?? "."}</p>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onClick={() => press(d)} disabled={disabled}>{d}</Key>
        ))}
        <span />
        <Key onClick={() => press("0")} disabled={disabled}>0</Key>
        <Key onClick={back} label="Delete digit" subtle disabled={disabled}><LuDelete className="size-6" /></Key>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
    </div>
  );
}

function Key({ children, onClick, label, subtle, disabled }: { children: ReactNode; onClick: () => void; label?: string; subtle?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "num flex size-18 items-center justify-center rounded-2xl text-2xl font-semibold transition-all active:scale-95 disabled:opacity-40 sm:size-20",
        subtle ? "text-ink-500 hover:bg-ink-100" : "bg-white text-ink-900 shadow-card ring-1 ring-ink-200 hover:bg-brand-50",
      )}
    >
      {children}
    </button>
  );
}
