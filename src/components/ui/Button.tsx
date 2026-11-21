import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerGhost" | "success" | "outline" | "accent" | "onDark";
type Size = "sm" | "md" | "lg" | "xl";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-brand-300",
  secondary: "bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 shadow-sm disabled:text-ink-400",
  outline: "bg-transparent text-brand-700 ring-1 ring-inset ring-brand-300 hover:bg-brand-50",
  ghost: "bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm disabled:bg-rose-300",
  dangerGhost: "bg-transparent text-rose-600 hover:bg-rose-50",
  accent: "bg-gradient-to-r from-brand-600 to-violet-600 text-white hover:from-brand-700 hover:to-violet-700 shadow-glow",
  onDark: "bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:bg-emerald-300",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
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
        "inline-flex select-none items-center justify-center font-medium transition-colors disabled:cursor-not-allowed",
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
      className={cn("inline-flex size-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900", className)}
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
