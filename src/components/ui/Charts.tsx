/**
 * Lightweight SVG charts (no dependency). Swap for Recharts later if you prefer —
 * the props are just `{ label, value }[]`.
 */
import { useState } from "react";
import { cn, formatMoney } from "@/lib/format";

export function BarChart({ data, height = 220, format = formatMoney }: { data: { label: string; value: number }[]; height?: number; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const step = niceStep(Math.max(1, ...data.map((d) => d.value)) / 4);
  const max = step * 4;
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  return (
    <div className="relative" style={{ height }}>
      <div className="absolute inset-0 flex flex-col justify-between pb-6 pl-14">
        {ticks.slice().reverse().map((t) => (
          <div key={t} className="relative border-t border-dashed border-ink-200">
            <span className="num absolute -top-2 -left-14 w-12 text-right text-[11px] text-ink-400">{t >= 1000 ? `${+(t / 1000).toFixed(1)}k` : t}</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex items-end gap-1.5 pb-6 pl-14 sm:gap-2.5">
        {data.map((d, i) => (
          <div
            key={d.label}
            className="group relative flex h-full flex-1 flex-col justify-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="num absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-xs text-white" style={{ bottom: `${(d.value / max) * 100}%` }}>
                {d.label}: {format(d.value)}
              </div>
            )}
            <div
              className={cn("w-full rounded-t-[4px] transition-colors", i === data.length - 1 ? "bg-brand-600" : hover === i ? "bg-brand-500" : "bg-brand-300")}
              style={{ height: `${(d.value / max) * 100}%` }}
              aria-label={`${d.label}: ${format(d.value)}`}
            />
            <span className="absolute -bottom-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-[10px] text-ink-400 sm:block">
              {i % 2 === data.length % 2 ? "" : d.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal share bars — good for payment-method mix / top products. */
export function ShareBars({ data, format = formatMoney }: { data: { label: string; value: number; color?: string }[]; format?: (n: number) => string }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-ink-700">{d.label}</span>
            <span className="num font-medium text-ink-900">{format(d.value)} <span className="font-normal text-ink-400">· {Math.round((d.value / total) * 100)}%</span></span>
          </div>
          <div className="h-2 rounded-full bg-ink-100">
            <div className={cn("h-2 rounded-full", d.color ?? "bg-brand-500")} style={{ width: `${(d.value / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}
