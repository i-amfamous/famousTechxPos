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
        className={cn("flex items-center justify-center gap-3 sm:gap-4", error && "pin-dots-error")}
        aria-label={`${pin.length} of ${length} digits entered`}
      >
        {busy ? (
          <span className="pin-dots-busy inline-flex h-11 items-center gap-2 rounded-full bg-brand-50 px-4 text-sm font-medium text-brand-700 ring-1 ring-brand-200">
            <Spinner className="size-4" /> Checking PIN…
          </span>
        ) : (
          Array.from({ length }).map((_, i) => {
            const filled = i < pin.length;
            return (
              <span
                key={i}
                className={cn(
                  "relative flex size-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-inset ring-ink-200 transition-all duration-200 sm:size-11",
                  filled && "bg-brand-50/60 ring-brand-300 shadow-[0_0_0_3px_rgba(79,70,229,0.08)]",
                  error && "bg-rose-50 ring-rose-300 shadow-[0_0_0_3px_rgba(251,113,133,0.1)]",
                )}
              >
                <span
                  className={cn(
                    "rounded-full transition-all duration-200",
                    filled ? "pin-dot-filled size-2.5 bg-brand-600" : "size-1.5 bg-ink-300",
                    error && "bg-rose-500",
                  )}
                />
              </span>
            );
          })
        )}
      </div>

      <div className="mt-4 flex min-h-5 items-center justify-center gap-1.5 text-xs" aria-live="polite">
        {error ? (
          <>
            <LuCircleAlert className="size-3.5 shrink-0 text-rose-600" />
            <span role="alert" className="font-medium text-rose-600">{error}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-ink-500">
            <LuLockKeyhole className="size-3.5" /> {disabled ? "PIN locked - ask a manager" : `Enter your ${length}-digit PIN`}
          </span>
        )}
      </div>

      <div className="mt-5 grid w-full max-w-[300px] grid-cols-3 gap-3 sm:gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onClick={() => press(d)} disabled={disabled || busy}>{d}</Key>
        ))}
        <span className="size-[62px] sm:size-[70px]" aria-hidden />
        <Key onClick={() => press("0")} disabled={disabled || busy}>0</Key>
        <Key onClick={back} label="Delete digit" subtle disabled={disabled || busy}>
          <LuDelete className="size-5" />
        </Key>
      </div>
      <p className="mt-5 text-[11px] text-ink-500">Tip: you can type on your keyboard too.</p>
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
        "pin-key num flex size-[62px] items-center justify-center rounded-2xl border text-xl font-semibold sm:size-[70px]",
        subtle
          ? "pin-key-subtle border-brand-200 text-brand-700 hover:border-brand-300 hover:text-brand-800"
          : "border-ink-200 text-ink-900 hover:border-brand-300 hover:text-brand-700",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      <span className="relative z-10 inline-flex items-center justify-center">{children}</span>
    </button>
  );
}
