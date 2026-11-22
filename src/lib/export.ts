/**
 * Branded exports used across the app. Every export carries the business identity,
 * report title and generation time, and the printable version is styled for A4/PDF.
 */
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

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const stamp = () => new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

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

/** Opens a styled, print-ready report. The browser's print dialog can save it as PDF. */
export function exportPrintable(r: ExportReport) {
  const b = r.business;
  const contact = [b?.phone && `Tel ${esc(b.phone)}`, b?.email && esc(b.email), b?.tin && `TIN ${esc(b.tin)}`, b?.address && esc(b.address)].filter(Boolean).join(" · ");
  const head = r.columns.map((c) => `<th class="${c.align === "right" ? "r" : ""}">${esc(c.header)}</th>`).join("");
  const body = r.rows.length
    ? r.rows.map((row) => `<tr>${row.map((v, i) => {
        const right = r.columns[i]?.align === "right" || typeof v === "number";
        return `<td class="${right ? "r num" : ""}">${esc(v)}</td>`;
      }).join("")}</tr>`).join("")
    : `<tr><td class="empty" colspan="${r.columns.length}">No records for this selection.</td></tr>`;
  const summary = r.summary?.length
    ? `<div class="summary">${r.summary.map((s) => `<div><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`).join("")}</div>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.title)} - ${esc(b?.name ?? "Famous TechX")}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #14142b; font: 12px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: #f5f5fa; }
  .page { max-width: 960px; margin: 24px auto; background: #fff; box-shadow: 0 18px 48px -20px rgba(20,20,43,.3); }
  .top { background: linear-gradient(120deg,#3730a3,#4f46e5 55%,#7c3aed); color: #fff; padding: 26px 32px; position: relative; overflow: hidden; }
  .top::after { content:""; position:absolute; width:240px; height:240px; right:-70px; top:-130px; border-radius:50%; background:rgba(255,255,255,.09); }
  .brand { display:flex; align-items:center; gap:12px; }
  .mark { width:38px; height:38px; display:grid; place-items:center; border-radius:11px; background:rgba(255,255,255,.16); border:1px solid rgba(255,255,255,.35); font-weight:800; letter-spacing:-.5px; }
  .brand b { display:block; font-size:15px; text-transform:uppercase; letter-spacing:.05em; }
  .brand small { display:block; font-size:9px; letter-spacing:.26em; text-transform:uppercase; color:rgba(255,255,255,.7); }
  .title { margin: 22px 0 0; font-size: 25px; letter-spacing:-.02em; }
  .subtitle { margin-top:4px; color:rgba(255,255,255,.82); font-size:12px; }
  .meta { display:flex; flex-wrap:wrap; gap:8px 20px; margin-top:16px; font-size:10px; color:rgba(255,255,255,.78); }
  .body { padding: 26px 32px 32px; }
  .bar { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px; }
  .count { font-size:11px; color:#6b6b80; }
  .bar button { border:0; border-radius:8px; background:#4f46e5; color:#fff; padding:9px 15px; font:inherit; font-weight:600; cursor:pointer; }
  table { width:100%; border-collapse:collapse; }
  th { text-align:left; font-size:9px; letter-spacing:.13em; text-transform:uppercase; color:#6b6b80; background:#eef2ff; padding:10px 12px; border-bottom:1px solid #c7d2fe; }
  td { padding:9px 12px; border-bottom:1px solid #eeeef5; vertical-align:top; }
  tbody tr:nth-child(even) { background:#fafaff; }
  .r { text-align:right; }
  .num { font-variant-numeric: tabular-nums; }
  .empty { text-align:center; color:#9494a8; padding:32px; }
  .summary { display:flex; flex-wrap:wrap; gap:12px; margin-top:22px; }
  .summary div { flex:1 1 160px; background:#f5f5fa; border:1px solid #e0e0ea; border-radius:10px; padding:12px 14px; }
  .summary span { display:block; font-size:9px; text-transform:uppercase; letter-spacing:.12em; color:#6b6b80; }
  .summary strong { display:block; margin-top:4px; font-size:17px; font-variant-numeric:tabular-nums; }
  .foot { margin-top:26px; padding-top:12px; border-top:1px dashed #c8c8d6; display:flex; justify-content:space-between; gap:12px; font-size:9px; color:#9494a8; }
  @media print {
    body { background:#fff; }
    .page { margin:0; box-shadow:none; max-width:none; }
    .bar button { display:none; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
  }
</style></head><body>
<div class="page">
  <header class="top">
    <div class="brand"><div class="mark">FT</div><div><b>${esc(b?.name ?? "Famous TechX")}</b><small>Business report</small></div></div>
    <h1 class="title">${esc(r.title)}</h1>
    ${r.subtitle ? `<p class="subtitle">${esc(r.subtitle)}</p>` : ""}
    <div class="meta"><span>Generated ${esc(stamp())}</span>${contact ? `<span>${contact}</span>` : ""}</div>
  </header>
  <main class="body">
    <div class="bar"><span class="count">${r.rows.length} record${r.rows.length === 1 ? "" : "s"}</span><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    ${summary}
    <div class="foot"><span>Generated by Famous TechX POS</span><span>${esc(b?.name ?? "")} · Confidential</span></div>
  </main>
</div>
<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)});</script>
</body></html>`;
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
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
