import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LuArrowRight, LuCheck, LuMonitorSmartphone, LuShieldCheck } from "react-icons/lu";
import { Logo } from "@/components/layout/AppLayout";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/format";

/**
 * Shared visual language for every sign-in surface: the till lock screen,
 * back-office auth pages and the first-load/boot loader.
 */
export function AuthBackdrop({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("auth-scene relative isolate min-h-full text-white", className)}>
      <div className="auth-grid" aria-hidden="true" />
      <div className="auth-orb auth-orb-one" aria-hidden="true" />
      <div className="auth-orb auth-orb-two" aria-hidden="true" />
      <div className="relative z-10 flex min-h-full">{children}</div>
    </div>
  );
}

export function AuthBrandHeader({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Logo className={cn("shrink-0 ring-2 ring-white/30", compact ? "size-10 text-sm" : "size-12 text-base")} />
      <div>
        <p className={cn("font-black tracking-[0.16em]", compact ? "text-sm" : "text-base")}>FAMOUS TECHX</p>
        <p className="mt-0.5 text-xs text-brand-100">Point of sale, made simple</p>
      </div>
    </div>
  );
}

/** Soft white surface used on top of the brand backdrop. */
export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("auth-card relative w-full overflow-hidden rounded-[28px] border border-white/80 bg-white/95 p-6 shadow-[0_28px_80px_-32px_rgba(20,20,43,0.55)] ring-1 ring-ink-200/60 sm:p-9", className)}>
      {children}
    </div>
  );
}

/** Compact progress rail for PIN setup and onboarding. */
export function AuthStepper({ steps, active, className }: { steps: string[]; active: number; className?: string }) {
  return (
    <ol className={cn("flex items-center gap-2", className)} aria-label="Progress">
      {steps.map((label, i) => {
        const done = i < active;
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
                done && "bg-emerald-600 text-white",
                i === active && "bg-brand-600 text-white shadow-[0_0_0_4px_rgba(79,70,229,0.14)]",
                i > active && "bg-ink-100 text-ink-400",
              )}
              aria-current={i === active ? "step" : undefined}
            >
              {done ? <LuCheck className="size-4" /> : i + 1}
            </span>
            <span className={cn("hidden truncate text-xs sm:block", i === active ? "font-semibold text-ink-900" : "text-ink-500")}>{label}</span>
            {i < steps.length - 1 && <span className={cn("h-px flex-1", done ? "bg-emerald-300" : "bg-ink-200")} />}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Branded loader used while auth resolves, a login is submitted, or a till is handed over.
 * `overlay` keeps the current screen visible behind a soft blur for in-flow transitions.
 */
export function AuthLoader({
  label = "Securing your session…",
  note = "Famous TechX POS",
  overlay = false,
}: {
  label?: string;
  note?: string;
  overlay?: boolean;
}) {
  const content = (
    <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
      <div className="relative mb-6">
        <span className="absolute -inset-8 rounded-full bg-brand-300/25 blur-2xl" aria-hidden="true" />
        <span className="absolute -inset-2 animate-ping rounded-full border border-white/20" aria-hidden="true" />
        <Logo className="relative size-[72px] rounded-[22px] text-2xl ring-1 ring-white/30 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]" />
        <span className="absolute -bottom-2 -right-2 flex size-8 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur">
          <Spinner className="size-4 text-white" />
        </span>
      </div>
      <p className="text-lg font-semibold tracking-tight">{label}</p>
      <p className="mt-1 text-sm text-brand-100">{note}</p>
      <div className="mt-5 h-1 w-44 overflow-hidden rounded-full bg-white/20">
        <span className="auth-progress block h-full w-1/3 rounded-full bg-white/90" />
      </div>
    </div>
  );

  if (overlay) {
    return <div className="absolute inset-0 z-50 flex items-center justify-center bg-brand-900/80 p-6 backdrop-blur-md">{content}</div>;
  }
  return (
    <AuthBackdrop>
      <div className="flex w-full items-center justify-center p-6">{content}</div>
    </AuthBackdrop>
  );
}

/** Small "we're on a till" shortcut used on the back-office panels. */
export function TillShortcut() {
  return (
    <Link
      to="/pos/lock"
      className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-brand-100 ring-1 ring-white/15 transition hover:bg-white/20 hover:text-white"
    >
      <LuMonitorSmartphone className="size-3.5" /> Till mode <LuArrowRight className="size-3.5" />
    </Link>
  );
}

export function SecurityBadge({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1",
        dark ? "bg-emerald-400/15 text-emerald-100 ring-emerald-200/20" : "bg-emerald-50 text-emerald-700 ring-emerald-200",
      )}
    >
      <LuShieldCheck className="size-3.5" /> Secure access
    </span>
  );
}
