import { cn, formatDateTime, formatMoney, methodLabel } from "@/lib/format";
import type { SaleReceipt } from "@/types";

export type ReceiptData = SaleReceipt & { reprint?: boolean };

/** 80mm thermal-style receipt. Wrap in `.print-area` to print just this. */
export function Receipt({ data, className }: { data: ReceiptData; className?: string }) {
  return (
    <div className={cn("print-area mx-auto w-[300px] bg-white px-5 py-6 font-mono text-[12px] leading-relaxed text-ink-900 shadow-card ring-1 ring-ink-200", className)}>
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-wide">{data.business?.name ?? "Famous TechX"}</p>
        <p>{data.branch}</p>
        {data.business?.phone && <p>Tel: {data.business.phone}</p>}
        {data.business?.tin && <p className="mt-1">TIN: {data.business.tin}</p>}
        {data.reprint && <p className="mt-2 border border-ink-900 py-0.5 font-bold">** REPRINT / COPY **</p>}
      </div>
      <Dash />
      <Row l="Receipt" r={data.receiptNumber} />
      <Row l="Date" r={formatDateTime(data.createdAt)} />
      <Row l="Served by" r={data.servedBy} />
      <Row l="Till" r={data.terminal} />
      {data.customer && <Row l="Customer" r={data.customer} />}
      <Dash />
      {data.items.map((i, idx) => (
        <div key={idx} className="mb-1">
          <p>{i.name}</p>
          <Row l={`  ${i.quantity} x ${formatMoney(i.unitPrice)}`} r={formatMoney(i.quantity * i.unitPrice)} />
          {i.discount > 0 && <Row l="  Discount" r={`-${formatMoney(i.discount)}`} />}
        </div>
      ))}
      <Dash />
      <Row l="Subtotal" r={formatMoney(data.subtotal)} />
      {data.discountTotal > 0 && <Row l="Discount" r={`-${formatMoney(data.discountTotal)}`} />}
      <Row l="Tax" r={formatMoney(data.taxTotal)} />
      <Row l="TOTAL" r={formatMoney(data.total)} bold />
      <Dash />
      {data.payments.map((p, i) => (
        <Row key={i} l={methodLabel[p.method] + (p.reference ? ` (${p.reference})` : "")} r={formatMoney(p.amount)} />
      ))}
      {!!data.change && <Row l="Change" r={formatMoney(data.change)} bold />}
      <Dash />
      <p className="text-center">{data.business?.footer || "Thank you for shopping with us!"}</p>
      <div className="mx-auto mt-3 h-8 w-48 bg-[repeating-linear-gradient(90deg,#101828_0_2px,transparent_2px_4px,#101828_4px_5px,transparent_5px_8px)]" aria-hidden />
      <p className="text-center text-[10px]">{data.receiptNumber}</p>
    </div>
  );
}

const Dash = () => <div className="my-2 border-t border-dashed border-ink-400" />;
const Row = ({ l, r, bold }: { l: string; r: string; bold?: boolean }) => (
  <div className={cn("flex justify-between gap-2", bold && "text-[13px] font-bold")}>
    <span className="truncate whitespace-pre">{l}</span>
    <span className="shrink-0 tabular-nums">{r}</span>
  </div>
);
