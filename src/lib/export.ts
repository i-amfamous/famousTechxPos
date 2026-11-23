/**
 * Branded exports used across the app. Every PDF, report and receipt uses the same
 * clear, colourful print template so printed documents always look like they came
 * from Famous TechX.
 */
import { formatDateTime, formatMoney, methodLabel } from "./format";
import { receiptLink, receiptQrSvg } from "./qr";
import type { PaymentMethod } from "@/types";

export interface ExportColumn { key: string; header: string; align?: "left" | "right" }
export interface ExportReport {
  filename: string;
  title: string;
  subtitle?: string;
  business?: { name: string; phone?: string; email?: string; tin?: string; address?: string } | null;
  columns: ExportColumn[];
  rows: (string | number)[][];
  summary?: { label: string; value: string }[];
}

export interface PrintableReceipt {
  receiptNumber: string;
  createdAt: string;
  servedBy: string;
  terminal?: string;
  branch?: string;
  customer?: string;
  business?: { name: string; phone?: string; tin?: string; footer?: string; address?: string; email?: string } | null;
  items: { name: string; quantity: number; unitPrice: number; discount: number }[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  payments: { method: PaymentMethod; amount: number; reference?: string; phone?: string; network?: string }[];
  change?: number;
  reprint?: boolean;
  shareToken?: string;
}

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const stamp = () => new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const money = (v: number) => formatMoney(Number(v) || 0);

/** CSV with UTF-8 BOM and a readable metadata header (opens cleanly in Excel/Sheets). */
export function exportCsv(r: ExportReport) {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const meta = [
    [`# ${r.business?.name ?? "Famous TechX"}`],
    [`# ${r.title}${r.subtitle ? ` - ${r.subtitle}` : ""}`],
    [`# Generated ${stamp()}`],
    [],
    r.columns.map((c) => c.header),
    ...r.rows,
  ];
  const csv = meta.map((row) => row.map(cell).join(",")).join("\r\n");
  download(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), `${r.filename}.csv`);
}

/** Opens the shared report template. The browser's print dialog can save it as PDF. */
export function exportPrintable(r: ExportReport) {
  const b = r.business;
  const contact = [b?.email && esc(b.email), b?.phone && `Tel ${esc(b.phone)}`, b?.tin && `TIN ${esc(b.tin)}`, b?.address && esc(b.address)].filter(Boolean).join(" · ");
  const head = r.columns.map((c) => `<th class="${c.align === "right" ? "r" : ""}">${esc(c.header)}</th>`).join("");
  const body = r.rows.length
    ? r.rows.map((row) => `<tr>${row.map((v, i) => {
        const right = r.columns[i]?.align === "right" || typeof v === "number";
        return `<td class="${right ? "r num" : ""}">${esc(v)}</td>`;
      }).join("")}</tr>`).join("")
    : `<tr><td class="empty" colspan="${r.columns.length}">No records for this selection.</td></tr>`;
  const summary = r.summary?.length
    ? `<section class="summary">${r.summary.map((s, i) => `<div class="tone-${i % 3}"><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`).join("")}</section>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.title)} - ${esc(b?.name ?? "Famous TechX")}</title>
<style>
  ${PRINT_BASE}
  .page { max-width: 1000px; }
  .hero { background: linear-gradient(125deg,#312e81 0%,#4f46e5 52%,#7c3aed 100%); }
  .hero::before { width: 280px; height: 280px; right: -80px; top: -150px; }
  .hero::after { width: 120px; height: 120px; right: 96px; bottom: -78px; background: rgba(52,211,153,.22); }
  .brand-mark { background: linear-gradient(135deg,#fff,#dbeafe); color:#4338ca; }
  .brand-name { font-size:16px; }
  .hero h1 { font-size:27px; }
  .hero-grid { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; }
  .stamp { flex:0 0 auto; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.12); border-radius:12px; padding:10px 14px; font-size:10px; line-height:1.6; color:rgba(255,255,255,.9); text-align:right; }
  .stamp b { display:block; color:#fff; font-size:12px; }
  th { background: linear-gradient(90deg,#eef2ff,#f5f3ff); color:#4338ca; border-bottom:2px solid #c7d2fe; }
  .summary div.tone-0 { background:linear-gradient(135deg,#eef2ff,#e0e7ff); border-color:#c7d2fe; }
  .summary div.tone-0 span { color:#4338ca; }
  .summary div.tone-1 { background:linear-gradient(135deg,#ecfdf5,#d1fae5); border-color:#a7f3d0; }
  .summary div.tone-1 span { color:#047857; }
  .summary div.tone-2 { background:linear-gradient(135deg,#fffbeb,#fef3c7); border-color:#fde68a; }
  .summary div.tone-2 span { color:#b45309; }
</style></head><body>
<div class="page">
  <header class="hero">
    <div class="hero-grid">
      <div>
        <div class="brand"><div class="brand-mark">FT</div><div><div class="brand-name">${esc(b?.name ?? "Famous TechX")}</div>${contact ? `<div class="contact">${contact}</div>` : ""}</div></div>
        <h1>${esc(r.title)}</h1>
        ${r.subtitle ? `<p class="subtitle">${esc(r.subtitle)}</p>` : ""}
      </div>
      <div class="stamp"><b>${esc(stamp())}</b>${r.rows.length} record${r.rows.length === 1 ? "" : "s"}<br>Famous TechX POS</div>
    </div>
  </header>
  <main class="body">
    <div class="bar"><span class="count">Prepared for ${esc(b?.name ?? "Famous TechX")}</span><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    ${summary}
    <div class="foot"><span>Generated by Famous TechX POS</span><span>${esc(b?.name ?? "")} · Confidential</span></div>
  </main>
</div>
${AUTOPRINT}
</body></html>`;
  openPrintWindow(html);
}

/** Opens a clear branded receipt template, sized for an 80mm thermal printer or PDF. */
export function printReceipt(data: PrintableReceipt) {
  const b = data.business;
  const shareUrl = data.shareToken ? receiptLink(data.shareToken) : "";
  const qr = shareUrl ? receiptQrSvg(shareUrl) : "";
  const contact = [b?.phone && `Tel ${esc(b.phone)}`, b?.tin && `TIN ${esc(b.tin)}`, b?.email && esc(b.email), b?.address && esc(b.address)].filter(Boolean).join(" · ");
  const items = data.items.length
    ? data.items.map((i) => `<tr><td><b>${esc(i.name)}</b><small>${i.quantity} × ${money(i.unitPrice)}${i.discount ? ` · ${money(i.discount)} off` : ""}</small></td><td class="r num">${money(i.quantity * i.unitPrice - i.discount)}</td></tr>`).join("")
    : `<tr><td class="empty" colspan="2">No items on this receipt.</td></tr>`;
  const payments = data.payments.map((p) => `<div class="pay"><span><i></i>${esc(methodLabel[p.method] ?? p.method)}${p.reference ? `<small>${esc(p.reference)}</small>` : ""}</span><b class="num">${money(p.amount)}</b></div>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${esc(data.receiptNumber)} - ${esc(b?.name ?? "Famous TechX")}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { margin:0; background:#eef2ff; color:#182033; font:12px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  .sheet { width:80mm; margin:20px auto; background:#fff; box-shadow:0 18px 48px -20px rgba(30,27,75,.45); }
  .hero { padding:18px 16px 16px; background:linear-gradient(135deg,#312e81,#4f46e5 58%,#7c3aed); color:#fff; position:relative; overflow:hidden; }
  .hero::after { content:""; position:absolute; width:110px; height:110px; border-radius:50%; background:rgba(255,255,255,.1); right:-42px; top:-54px; }
  .brand { display:flex; align-items:center; gap:10px; }
  .brand-mark { width:34px; height:34px; flex:0 0 auto; display:grid; place-items:center; border-radius:10px; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.4); font-weight:800; }
  .brand b { display:block; font-size:13px; letter-spacing:.02em; }
  .brand span { display:block; color:rgba(255,255,255,.75); font-size:9px; }
  .branch { margin-top:10px; font-size:10px; color:rgba(255,255,255,.9); }
  .contact { margin-top:3px; font-size:8px; color:rgba(255,255,255,.7); }
  .body { padding:15px 16px 18px; }
  .copy { margin-bottom:12px; border:1px dashed #f59e0b; background:#fffbeb; color:#b45309; border-radius:7px; padding:5px; text-align:center; font-size:9px; font-weight:700; }
  .meta { display:grid; gap:3px; margin-bottom:12px; }
  .meta div { display:flex; justify-content:space-between; gap:10px; font-size:9px; }
  .meta span { color:#6b7280; }
  .meta b { text-align:right; color:#1f2937; }
  .rule { height:1px; margin:12px 0; background:repeating-linear-gradient(90deg,#cbd5e1 0 4px,transparent 4px 8px); }
  table { width:100%; border-collapse:collapse; }
  td { padding:7px 0; border-bottom:1px solid #e5e7eb; vertical-align:top; font-size:10px; }
  td b { display:block; color:#111827; font-size:10px; }
  td small { display:block; margin-top:1px; color:#6b7280; font-size:8px; }
  .r { text-align:right; }
  .empty { text-align:center; color:#94a3b8; padding:18px 0; }
  .totals { display:grid; gap:3px; font-size:10px; }
  .totals div { display:flex; justify-content:space-between; }
  .totals span { color:#6b7280; }
  .total { margin-top:9px; display:flex; align-items:center; justify-content:space-between; border-radius:9px; background:#111827; color:#fff; padding:9px 10px; }
  .total span { color:rgba(255,255,255,.7); font-size:9px; font-weight:700; }
  .total b { font-size:15px; }
  .pay { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:5px; font-size:9px; }
  .pay span { display:flex; align-items:center; gap:5px; color:#4b5563; }
  .pay small { color:#9ca3af; font-size:8px; }
  .pay i { width:6px; height:6px; border-radius:50%; background:#6366f1; }
  .change { margin-top:9px; display:flex; justify-content:space-between; border-radius:8px; background:#fffbeb; color:#92400e; padding:7px 9px; font-weight:700; }
  .thanks { margin-top:14px; text-align:center; color:#374151; font-size:10px; font-weight:600; }
  .foot { margin-top:4px; text-align:center; color:#9ca3af; font-size:8px; }
  .qr { margin:12px auto 3px; width:36mm; text-align:center; }
  .qr svg { display:block; width:36mm; height:36mm; margin:0 auto; }
  .qr span { display:block; margin-top:3px; color:#4b5563; font-size:8px; font-weight:700; }
  .bar { margin:0 auto 14px; width:80mm; display:flex; justify-content:center; }
  .bar button { border:0; border-radius:9px; background:#4f46e5; color:#fff; padding:9px 16px; font:inherit; font-weight:700; cursor:pointer; box-shadow:0 8px 20px -8px rgba(79,70,229,.8); }
  @media print { body { background:#fff; } .sheet { margin:0; box-shadow:none; } .bar { display:none; } }
</style></head><body>
<div class="bar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
<div class="sheet">
  <header class="hero">
    <div class="brand"><div class="brand-mark">FT</div><div><b>${esc(b?.name ?? "Famous TechX")}</b><span>Official receipt</span></div></div>
    <div class="branch">${esc(data.branch || "Famous TechX")}</div>
    ${contact ? `<div class="contact">${contact}</div>` : ""}
  </header>
  <main class="body">
    ${data.reprint ? `<div class="copy">Reprint / copy</div>` : ""}
    <div class="meta">
      <div><span>Receipt no.</span><b>${esc(data.receiptNumber)}</b></div>
      <div><span>Date</span><b>${esc(formatDateTime(data.createdAt))}</b></div>
      <div><span>Served by</span><b>${esc(data.servedBy || "-")}</b></div>
      <div><span>Till</span><b>${esc(data.terminal || "-")}</b></div>
      ${data.customer ? `<div><span>Customer</span><b>${esc(data.customer)}</b></div>` : ""}
    </div>
    <div class="rule"></div>
    <table><tbody>${items}</tbody></table>
    <div class="rule"></div>
    <div class="totals">
      <div><span>Subtotal</span><b>${money(data.subtotal)}</b></div>
      ${data.discountTotal ? `<div><span>Discount</span><b>-${money(data.discountTotal)}</b></div>` : ""}
      <div><span>Tax</span><b>${money(data.taxTotal)}</b></div>
    </div>
    <div class="total"><span>Total paid</span><b>${money(data.total)}</b></div>
    <div class="rule"></div>
    ${payments}
    ${data.change ? `<div class="change"><span>Change due</span><b>${money(data.change)}</b></div>` : ""}
    <p class="thanks">${esc(b?.footer || "Thank you for shopping with us!")}</p>
    <p class="foot">Keep this receipt for your records · ${esc(data.receiptNumber)}</p>
    ${shareUrl ? `<div class="qr">${qr}<span>Scan for digital receipt</span></div>` : ""}
    <p class="foot">${esc(data.receiptNumber)}</p>
  </main>
</div>
${AUTOPRINT}
</body></html>`;
  openPrintWindow(html);
}

const PRINT_BASE = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { margin:0; color:#182033; font:12px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; background:#eef2ff; }
  .page { margin:24px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 18px 48px -20px rgba(30,27,75,.4); }
  .hero { color:#fff; padding:28px 32px; position:relative; overflow:hidden; }
  .hero::before,.hero::after { content:""; position:absolute; border-radius:50%; background:rgba(255,255,255,.09); }
  .hero::before { width:240px; height:240px; right:-70px; top:-130px; }
  .hero::after { width:110px; height:110px; right:78px; bottom:-80px; background:rgba(52,211,153,.18); }
  .hero > * { position:relative; z-index:1; }
  .brand { display:flex; align-items:center; gap:12px; }
  .brand-mark { width:40px; height:40px; display:grid; place-items:center; border-radius:12px; font-weight:800; letter-spacing:-.4px; }
  .brand-name { font-size:14px; font-weight:700; letter-spacing:.02em; }
  .contact { margin-top:2px; font-size:9px; color:rgba(255,255,255,.72); }
  .hero h1 { margin:20px 0 0; font-size:25px; line-height:1.2; letter-spacing:-.02em; }
  .subtitle { margin:6px 0 0; color:rgba(255,255,255,.84); font-size:12px; }
  .body { padding:24px 32px 30px; }
  .bar { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; }
  .count { font-size:11px; color:#64748b; }
  .bar button { border:0; border-radius:9px; background:#4f46e5; color:#fff; padding:9px 16px; font:inherit; font-weight:700; cursor:pointer; box-shadow:0 8px 20px -8px rgba(79,70,229,.8); }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:9px; font-weight:700; color:#4338ca; padding:11px 12px; border-bottom:1px solid #c7d2fe; }
  td { padding:10px 12px; border-bottom:1px solid #e8eaf2; vertical-align:top; }
  tbody tr:nth-child(even) { background:#fafaff; }
  .r { text-align:right; }
  .num { font-variant-numeric:tabular-nums; }
  .empty { text-align:center; color:#94a3b8; padding:32px; }
  .summary { display:flex; flex-wrap:wrap; gap:12px; margin-top:22px; }
  .summary div { flex:1 1 160px; border:1px solid #e2e8f0; border-radius:12px; padding:13px 15px; }
  .summary span { display:block; font-size:10px; color:#64748b; }
  .summary strong { display:block; margin-top:5px; font-size:18px; letter-spacing:-.01em; font-variant-numeric:tabular-nums; }
  .foot { margin-top:26px; padding-top:12px; border-top:1px dashed #cbd5e1; display:flex; justify-content:space-between; gap:12px; font-size:9px; color:#94a3b8; }
  @media print {
    body { background:#fff; }
    .page { margin:0; border-radius:0; box-shadow:none; max-width:none; }
    .bar button { display:none; }
    thead { display:table-header-group; }
    tr { break-inside:avoid; }
    .summary div { break-inside:avoid; }
  }
`;

const AUTOPRINT = `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)});</script>`;

function openPrintWindow(html: string) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
