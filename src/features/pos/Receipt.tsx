import { cn, formatDateTime, formatMoney, methodLabel } from "@/lib/format";
import type { SaleReceipt } from "@/types";

export type ReceiptData = SaleReceipt & { reprint?: boolean };

/** 80mm thermal-style receipt. Wrap in `.print-area` to print just this. */
export function Receipt({ data, className }: { data: ReceiptData; className?: string }) {
  const business = data.business;
  return (
    <div className={cn("receipt-paper relative mx-auto w-[300px] overflow-hidden bg-white text-ink-900 shadow-pop ring-1 ring-ink-200", className)}>
      {/* ── Branded header ── */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 px-5 pb-4 pt-5 text-white">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 text-base font-black tracking-tight ring-1 ring-white/30">FT</div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold uppercase tracking-[0.06em]">{business?.name ?? "Famous TechX"}</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.26em] text-white/70">Official receipt</p>
          </div>
        </div>
        <p className="mt-3 truncate text-[11px] font-medium text-white/90">{data.branch}</p>
        {(business?.phone || business?.tin) && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] tracking-wide text-white/70">
            {business?.phone && <span>TEL {business.phone}</span>}
            {business?.tin && <span>TIN {business.tin}</span>}
          </div>
        )}
      </div>

      <div className="px-5 py-4">
        {data.reprint && (
          <p className="mb-3 rounded-md border border-dashed border-amber-400 bg-amber-50 py-1 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">Reprint / copy</p>
        )}

        {/* ── Transaction meta ── */}
        <dl className="space-y-1 text-[10px]">
          <Meta label="Receipt no." value={data.receiptNumber} strong />
          <Meta label="Date" value={formatDateTime(data.createdAt)} />
          <Meta label="Served by" value={data.servedBy || "-"} />
          <Meta label="Till" value={data.terminal || "-"} />
          {data.customer && <Meta label="Customer" value={data.customer} />}
        </dl>

        <Rule />

        {/* ── Items ── */}
        <div className="mb-1.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.14em] text-ink-400">
          <span>Item</span><span>Amount</span>
        </div>
        <div className="space-y-2.5">
          {data.items.map((i, idx) => (
            <div key={idx} className="text-[11px]">
              <p className="font-medium leading-tight text-ink-800">{i.name}</p>
              <div className="mt-0.5 flex justify-between text-[10px] text-ink-500">
                <span className="tabular-nums">{i.quantity} × {formatMoney(i.unitPrice)}</span>
                <span className="num font-semibold text-ink-800">{formatMoney(i.quantity * i.unitPrice - i.discount)}</span>
              </div>
              {i.discount > 0 && <p className="mt-0.5 text-right text-[9px] text-emerald-700">−{formatMoney(i.discount)} discount</p>}
            </div>
          ))}
        </div>

        <Rule />

        {/* ── Totals ── */}
        <div className="space-y-1 text-[11px]">
          <TotalRow label="Subtotal" value={formatMoney(data.subtotal)} />
          {data.discountTotal > 0 && <TotalRow label="Discount" value={`−${formatMoney(data.discountTotal)}`} tone="emerald" />}
          <TotalRow label="Tax" value={formatMoney(data.taxTotal)} />
        </div>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2.5 text-white">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">Total paid</span>
          <span className="num text-base font-bold tracking-tight">{formatMoney(data.total)}</span>
        </div>

        {/* ── Payments ── */}
        <div className="mt-3 space-y-1 text-[10px]">
          {data.payments.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-ink-500">
                <span className="size-1.5 rounded-full bg-brand-500" />
                {methodLabel[p.method]}{p.reference && <span className="text-ink-400">· {p.reference}</span>}
              </span>
              <span className="num font-semibold text-ink-800">{formatMoney(p.amount)}</span>
            </div>
          ))}
          {!!data.change && (
            <div className="mt-1.5 flex items-center justify-between rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-900">
              <span className="text-[10px] font-semibold uppercase tracking-wide">Change due</span>
              <span className="num text-sm font-bold">{formatMoney(data.change)}</span>
            </div>
          )}
        </div>

        <Rule className="mt-4" />

        {/* ── Footer ── */}
        <p className="text-center text-[10px] font-medium text-ink-600">{business?.footer || "Thank you for shopping with us!"}</p>
        <p className="mt-1 text-center text-[9px] text-ink-400">Keep this receipt for your records · {data.receiptNumber}</p>
        <div className="mx-auto mt-3 h-8 w-48 bg-[repeating-linear-gradient(90deg,#101828_0_2px,transparent_2px_4px,#101828_4px_5px,transparent_5px_8px)]" aria-hidden />
        <p className="mt-1 text-center text-[9px] font-semibold tracking-[0.3em] text-ink-400">{data.receiptNumber}</p>
      </div>
    </div>
  );
}

const Meta = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="shrink-0 text-ink-400">{label}</dt>
    <dd className={cn("num truncate text-right", strong ? "font-bold text-ink-900" : "text-ink-700")}>{value}</dd>
  </div>
);

const TotalRow = ({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) => (
  <div className="flex justify-between">
    <span className="text-ink-500">{label}</span>
    <span className={cn("num font-medium", tone === "emerald" ? "text-emerald-700" : "text-ink-800")}>{value}</span>
  </div>
);

const Rule = ({ className }: { className?: string }) => <div className={cn("my-3 border-t border-dashed border-ink-300", className)} />;
