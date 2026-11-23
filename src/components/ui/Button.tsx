import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerGhost" | "success" | "checkout" | "outline" | "accent" | "onDark" | "cash" | "momo" | "card" | "bank";
type Size = "sm" | "md" | "lg" | "xl";

const variants: Record<Variant, string> = {
  primary: "bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-sm hover:from-brand-500 hover:to-brand-600 hover:shadow-glow active:scale-[.98] disabled:from-brand-300 disabled:to-brand-300",
  secondary: "bg-white text-ink-700 shadow-sm ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:ring-ink-300 disabled:text-ink-400",
  outline: "bg-transparent text-brand-700 ring-1 ring-inset ring-brand-300 hover:bg-brand-50 hover:ring-brand-400",
  ghost: "bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:bg-rose-300",
  dangerGhost: "bg-transparent text-rose-600 hover:bg-rose-50",
  accent: "bg-gradient-to-r from-brand-600 to-violet-600 text-white hover:from-brand-700 hover:to-violet-700 shadow-glow",
  onDark: "bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  success: "bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-sm hover:from-emerald-500 hover:to-emerald-600 active:scale-[.98] disabled:from-emerald-300 disabled:to-emerald-300",
  checkout: "bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-[0_10px_28px_-10px_rgba(5,150,105,.75)] ring-1 ring-inset ring-white/25 hover:from-emerald-400 hover:via-emerald-500 hover:to-teal-500 hover:shadow-[0_14px_32px_-10px_rgba(5,150,105,.85)] active:scale-[.98] disabled:from-emerald-300 disabled:to-emerald-300 disabled:shadow-none",
  cash: "bg-cash text-white shadow-[0_10px_28px_-10px_rgba(22,163,74,.75)] ring-1 ring-inset ring-white/25 hover:bg-emerald-700 active:scale-[.98] disabled:bg-cash/40 disabled:shadow-none",
  momo: "bg-momo text-ink-900 shadow-[0_10px_28px_-10px_rgba(255,204,0,.8)] ring-1 ring-inset ring-white/40 hover:bg-[#f0bf00] active:scale-[.98] disabled:bg-momo/40 disabled:text-ink-500 disabled:shadow-none",
  card: "bg-card text-white shadow-[0_10px_28px_-10px_rgba(37,99,235,.75)] ring-1 ring-inset ring-white/25 hover:bg-blue-700 active:scale-[.98] disabled:bg-card/40 disabled:shadow-none",
  bank: "bg-bank text-white shadow-[0_10px_28px_-10px_rgba(13,148,136,.75)] ring-1 ring-inset ring-white/25 hover:bg-teal-700 active:scale-[.98] disabled:bg-bank/40 disabled:shadow-none",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
  xl: "h-16 px-6 text-lg gap-3 rounded-2xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, iconRight, loading, block, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-150 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn("inline-flex size-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200/70", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
