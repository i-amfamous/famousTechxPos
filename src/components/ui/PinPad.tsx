import { useCallback, useEffect, useState, type ReactNode } from "react";
import { LuCircleAlert, LuDelete, LuLockKeyhole } from "react-icons/lu";
import { cn } from "@/lib/format";
import { Spinner } from "./Button";

/**
 * Touch-friendly PIN keypad. Also accepts the physical keyboard (0-9, Backspace).
 * Calls `onComplete` when `length` digits are entered.
 */
export function PinPad({
  length = 4,
  onComplete,
  error,
  busy,
  disabled,
  onInput,
}: {
  length?: number;
  onComplete: (pin: string) => void;
  error?: string | null;
  busy?: boolean;
  disabled?: boolean;
  onInput?: () => void;
}) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (error) setPin("");
  }, [error]);

  const press = useCallback(
    (d: string) => {
      if (busy || disabled) return;
      onInput?.();
      setPin((p) => {
        const next = (p + d).slice(0, length);
        if (next.length === length) setTimeout(() => onComplete(next), 90);
        return next;
      });
    },
    [busy, disabled, length, onComplete, onInput],
  );

  const back = useCallback(() => {
    if (busy || disabled) return;
    onInput?.();
    setPin((p) => p.slice(0, -1));
  }, [busy, disabled, onInput]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, back]);

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "flex h-14 w-full items-center justify-center rounded-2xl bg-ink-50 ring-1 ring-inset ring-ink-200 transition-colors",
          busy && "pin-dots-busy",
          error && "pin-dots-error bg-rose-50 ring-rose-200",
        )}
        aria-label={`${pin.length} of ${length} digits entered`}
      >
        {busy ? (
          <span className="flex items-center gap-2 text-sm font-medium text-brand-700">
            <Spinner className="size-5" /> Checking PIN…
          </span>
        ) : (
          Array.from({ length }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-4 rounded-full transition-all duration-200",
                i < pin.length && "scale-110 bg-brand-600 shadow-[0_0_0_4px_rgba(79,70,229,0.12)]",
                i >= pin.length && "bg-ink-200",
                error && "bg-rose-400 shadow-[0_0_0_4px_rgba(251,113,133,0.14)]",
              )}
            />
          ))
        )}
      </div>

      <div className="mt-3 flex h-5 items-center justify-center gap-1.5 text-xs" aria-live="polite">
        {error ? (
          <>
            <LuCircleAlert className="size-3.5 shrink-0 text-rose-600" />
            <span role="alert" className="font-medium text-rose-600">{error}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-ink-400">
            <LuLockKeyhole className="size-3.5" /> {disabled ? "PIN locked - ask a manager" : "Enter your 4-digit PIN"}
          </span>
        )}
      </div>

      <div className="mt-3 grid w-full max-w-[318px] grid-cols-3 gap-2.5 sm:gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onClick={() => press(d)} disabled={disabled || busy}>{d}</Key>
        ))}
        <span />
        <Key onClick={() => press("0")} disabled={disabled || busy}>0</Key>
        <Key onClick={back} label="Delete digit" subtle disabled={disabled || busy}>
          <LuDelete className="size-6" />
        </Key>
      </div>
      <p className="mt-4 text-[11px] text-ink-400">Tip: you can type on your keyboard too.</p>
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
        "pin-key num flex size-16 items-center justify-center rounded-2xl text-2xl font-semibold transition-all duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 sm:size-[68px]",
        subtle ? "bg-transparent text-ink-500 hover:bg-white hover:text-ink-900" : "bg-white text-ink-900 ring-1 ring-ink-200 hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-300",
      )}
    >
      {children}
    </button>
  );
}
