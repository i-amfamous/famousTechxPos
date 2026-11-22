import type { ReactNode } from "react";
import { LuArrowDownRight, LuArrowUpRight, LuCircleAlert, LuInbox, LuRefreshCw } from "react-icons/lu";
import { cn, initials } from "@/lib/format";
import { Button } from "./Button";

/* ───── Card ───── */
export function Card({ className, children, padded = true }: { className?: string; children: ReactNode; padded?: boolean }) {
  return <div className={cn("rounded-2xl bg-white shadow-card ring-1 ring-ink-200/80", padded && "p-5 sm:p-6", className)}>{children}</div>;
}
export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight text-ink-900">{title}</h3>
        {description && <p className="mt-1 text-sm leading-relaxed text-ink-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ───── Badge ───── */
export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "violet";
const tones: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};
export function Badge({ tone = "neutral", children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/* ───── Avatar ───── */
export function Avatar({ name, color = "bg-brand-600", size = "md", className }: { name: string; color?: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const s = { sm: "size-7 text-[11px]", md: "size-9 text-sm", lg: "size-12 text-base", xl: "size-16 text-xl" }[size];
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm ring-2 ring-white/80", color, s, className)}>
      {initials(name)}
    </span>
  );
}

/* ───── Page header ───── */
export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-7">
      {back}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-[1.75rem]">{title}</h1>
          {description && <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ───── Stat card ───── */
export function StatCard({ label, value, change, hint, icon }: { label: string; value: ReactNode; change?: number; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-600">{label}</p>
        {icon && <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700 ring-1 ring-brand-100">{icon}</span>}
      </div>
      <p className="num mt-3 text-[1.75rem] font-semibold leading-none tracking-tight text-ink-900">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {change !== undefined && (
          <span className={cn("inline-flex items-center gap-0.5 font-semibold", change >= 0 ? "text-emerald-600" : "text-rose-600")}>
            {change >= 0 ? <LuArrowUpRight className="size-3.5" /> : <LuArrowDownRight className="size-3.5" />}
            {Math.abs(change)}%
          </span>
        )}
        {hint && <span className="text-ink-500">{hint}</span>}
      </div>
    </Card>
  );
}

/* ───── States ───── */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-ink-200/60", className)} />;
}
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-ink-100" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-1/4" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}
export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-4 rounded-2xl bg-brand-50 p-4 text-brand-600 ring-1 ring-brand-100">{icon ?? <LuInbox className="size-7" />}</div>
      <h3 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center" role="alert">
      <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-rose-600 ring-1 ring-rose-100"><LuCircleAlert className="size-7" /></div>
      <h3 className="text-lg font-semibold tracking-tight text-ink-900">Something went wrong</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-600">{message}</p>
      {onRetry && <Button variant="secondary" className="mt-5" icon={<LuRefreshCw className="size-4" />} onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Renders loading / error / empty / content for any query. */
export function DataState<T>({
  query, isEmpty, empty, children, skeleton,
}: {
  query: { data: T; loading: boolean; error: string | null; refetch: () => void };
  isEmpty?: (d: T) => boolean;
  empty: ReactNode;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.loading) return <>{skeleton ?? <TableSkeleton />}</>;
  if (query.error) return <ErrorState message={query.error} onRetry={query.refetch} />;
  const emptyCheck = isEmpty ?? ((d: T) => (Array.isArray(d) ? d.length === 0 : d == null));
  if (emptyCheck(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}

/* ───── Description list ───── */
export function DL({ items, cols = 2 }: { items: { label: string; value: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", cols === 1 ? "grid-cols-1" : cols === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-xs font-medium text-ink-500">{i.label}</dt>
          <dd className="mt-1 text-sm font-medium text-ink-900">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───── Callout ───── */
export function Callout({ tone = "info", icon, title, children }: { tone?: "info" | "warning" | "danger" | "success"; icon?: ReactNode; title?: string; children?: ReactNode }) {
  const t = {
    info: "bg-sky-50 text-sky-900 ring-sky-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
    danger: "bg-rose-50 text-rose-900 ring-rose-200",
    success: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  }[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl p-4 text-sm leading-relaxed ring-1 ring-inset", t)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-1", "opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}
