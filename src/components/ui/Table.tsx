import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { Button } from "./Button";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  hideBelow?: "sm" | "md" | "lg";
}

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

export function DataTable<T>({
  columns, rows, rowKey, onRowClick, footer, dense,
}: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; footer?: ReactNode; dense?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50/80">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-600 sm:px-5",
                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                  c.hideBelow && hide[c.hideBelow],
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(r) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn("transition-colors", onRowClick && "cursor-pointer hover:bg-brand-50/50 focus:bg-brand-50/70 focus:outline-none")}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-4 text-ink-700 sm:px-5",
                    dense ? "py-2" : "py-3.5",
                    c.align === "right" ? "num text-right" : c.align === "center" ? "text-center" : "",
                    c.hideBelow && hide[c.hideBelow],
                    c.className,
                  )}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer && <div className="flex items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/50 px-4 py-3 text-sm text-ink-600 sm:px-5">{footer}</div>}
    </div>
  );
}

/** Pagination footer - LOGIC: wire to server-side paging. */
export function Pager({ total, page = 1, pageSize = 25 }: { total: number; page?: number; pageSize?: number }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <>
      <span>Showing <span className="font-semibold text-ink-700">{from}–{to}</span> of <span className="font-semibold text-ink-700">{total}</span></span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1}>Previous</Button>
        <Button variant="secondary" size="sm" disabled={to >= total}>Next</Button>
      </div>
    </>
  );
}

/* ───── Tabs ───── */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("-mb-px flex gap-1 overflow-x-auto border-b border-ink-200 scrollbar-thin", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            value === t.value ? "border-brand-600 text-brand-700" : "border-transparent text-ink-600 hover:border-ink-300 hover:text-ink-900",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn("rounded-full px-1.5 text-xs", value === t.value ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-600")}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ───── Filter bar ───── */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-t-2xl border-b border-ink-100 bg-ink-50/40 p-4 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}
