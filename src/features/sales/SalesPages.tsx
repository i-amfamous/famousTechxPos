import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuBan, LuDownload, LuFileText, LuPrinter, LuReceipt, LuShieldCheck, LuUndo2 } from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useBranches, useCustomers, useEmployees, useSale, useSaleRefunds, useSales, useTerminals } from "@/services/api";
import {
  Badge, Button, Callout, Card, CardHeader, Checkbox, ConfirmDialog, DataState, DataTable, DL, EmptyState, FilterBar, Modal, PageHeader,
  Pager, SearchInput, Select, Textarea, useToast, type Column,
} from "@/components/ui";
import { formatDateTime, formatMoney, methodLabel } from "@/lib/format";
import { exportCsv as downloadCsv, exportPrintable, printReceipt, type ExportReport } from "@/lib/export";
import type { PaymentMethod, Sale, SaleStatus } from "@/types";
import { Receipt } from "@/features/pos/Receipt";
import { ApprovalModal, type ApprovalRequest } from "@/features/pos/PosModals";

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  const m = { completed: ["success", "Completed"], refunded: ["danger", "Refunded"], partially_refunded: ["warning", "Part refunded"], voided: ["neutral", "Voided"] } as const;
  return <Badge tone={m[status][0]}>{m[status][1]}</Badge>;
}

export function SalesPage() {
  const q = useSales();
  const employees = useEmployees().data;
  const branches = useBranches().data;
  const customers = useCustomers().data;
  const { business } = useSession();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cashier, setCashier] = useState("");
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = q.data.filter((s) => (!cashier || s.cashierId === cashier) && (!status || s.status === status) && (!branch || s.branchId === branch)
    && (!from || s.createdAt.slice(0, 10) >= from) && (!to || s.createdAt.slice(0, 10) <= to) && s.receiptNumber.toLowerCase().includes(search.toLowerCase()));

  const report = (): ExportReport => ({
    filename: "famous-sales",
    title: "Sales history",
    subtitle: `${rows.length} transactions · Total ${formatMoney(rows.reduce((sum, s) => sum + s.total, 0))}${from || to ? ` · ${from || "…"} to ${to || "…"}` : ""}`,
    business,
    columns: [
      { key: "receipt", header: "Receipt" }, { key: "date", header: "Date" }, { key: "cashier", header: "Served by" },
      { key: "customer", header: "Customer" }, { key: "branch", header: "Branch" }, { key: "pay", header: "Payment" },
      { key: "status", header: "Status" }, { key: "total", header: "Total", align: "right" },
    ],
    rows: rows.map((s) => [s.receiptNumber, formatDateTime(s.createdAt), employees.find((e) => e.id === s.cashierId)?.fullName ?? "", customers.find((c) => c.id === s.customerId)?.name ?? "Walk-in",
      branches.find((b) => b.id === s.branchId)?.name ?? "", s.payments.map((p) => methodLabel[p.method]).join(" + "), s.status, s.total]),
    summary: [
      { label: "Transactions", value: String(rows.length) },
      { label: "Gross sales", value: formatMoney(rows.reduce((sum, s) => sum + s.total, 0)) },
      { label: "Average sale", value: formatMoney(rows.length ? rows.reduce((sum, s) => sum + s.total, 0) / rows.length : 0) },
    ],
  });
  const exportCsv = () => downloadCsv(report());
  const exportPdf = () => exportPrintable(report());

  const cols: Column<Sale>[] = [
    { key: "r", header: "Receipt", cell: (s) => <span className="font-medium text-ink-900">{s.receiptNumber}</span> },
    { key: "d", header: "Date", cell: (s) => formatDateTime(s.createdAt) },
    { key: "e", header: "Served by", hideBelow: "md", cell: (s) => employees.find((e) => e.id === s.cashierId)?.fullName },
    { key: "c", header: "Customer", hideBelow: "lg", cell: (s) => customers.find((c) => c.id === s.customerId)?.name ?? <span className="text-ink-400">Walk-in</span> },
    { key: "b", header: "Branch", hideBelow: "lg", cell: (s) => branches.find((b) => b.id === s.branchId)?.name.split(" – ")[0] },
    { key: "p", header: "Payment", hideBelow: "md", cell: (s) => s.payments.map((p) => methodLabel[p.method]).join(" + ") },
    { key: "s", header: "Status", cell: (s) => <SaleStatusBadge status={s.status} /> },
    { key: "t", header: "Total", align: "right", cell: (s) => <span className="font-medium text-ink-900">{formatMoney(s.total)}</span> },
  ];

  return (
    <>
      <PageHeader title="Sales" description="Every transaction, who made it and how it was paid." actions={<>
        <Button variant="secondary" icon={<LuDownload className="size-4" />} onClick={exportCsv}>Export CSV</Button>
        <Button variant="secondary" icon={<LuFileText className="size-4" />} onClick={exportPdf}>PDF</Button>
      </>} />
      <Card padded={false}>
        <FilterBar>
          <SearchInput className="sm:w-60" placeholder="Receipt number" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select aria-label="Employee" className="sm:w-48" value={cashier} onChange={(e) => setCashier(e.target.value)}>
            <option value="">All employees</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </Select>
          <Select aria-label="Status" className="sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option><option value="completed">Completed</option><option value="partially_refunded">Part refunded</option><option value="refunded">Refunded</option><option value="voided">Voided</option>
          </Select>
          <Select aria-label="Branch" className="sm:w-48" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 rounded-lg border-0 px-3 text-sm ring-1 ring-ink-200" />
          <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className="h-10 rounded-lg border-0 px-3 text-sm ring-1 ring-ink-200" />
        </FilterBar>
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuReceipt className="size-7" />} title={q.data.length ? "No sales match" : "No sales yet"} description={q.data.length ? "Try different filters." : "Sales made on the POS appear here."} />}>
          {(data) => <DataTable columns={cols} rows={data} rowKey={(s) => s.id} onRowClick={(s) => navigate(`/sales/${s.id}`)} footer={<Pager total={data.length} />} />}
        </DataState>
      </Card>
    </>
  );
}

export function SaleDetailPage() {
  const { id = "" } = useParams();
  const q = useSale(id);
  const sale = q.data;
  const refunds = useSaleRefunds(id).data;
  const employees = useEmployees().data;
  const customers = useCustomers().data;
  const terminals = useTerminals().data;
  const branches = useBranches().data;
  const { role, user, can, business } = useSession();
  const toast = useToast();
  const [refund, setRefund] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [approval, setApproval] = useState<(ApprovalRequest & { onOk: (id: string) => void }) | null>(null);
  const [shareToken, setShareToken] = useState<string>();
  useEffect(() => {
    let alive = true;
    if (id) void actions.saleReceipt(id).then((r) => { if (alive) setShareToken(r?.shareToken); }).catch(() => undefined);
    return () => { alive = false; };
  }, [id]);
  if (q.loading) return <p className="text-sm text-ink-500">Loading sale…</p>;
  if (!sale) return <EmptyState title="Sale not found" description="It may be at another branch, or you only have access to your own sales." action={<Link to="/sales" className="text-sm font-medium text-brand-700">Back to sales</Link>} />;
  const cashier = employees.find((e) => e.id === sale.cashierId);
  const canRefund = (sale.status === "completed" || sale.status === "partially_refunded");
  const receipt = {
    reprint: true, receiptNumber: sale.receiptNumber, createdAt: sale.createdAt, servedBy: cashier?.displayName ?? "", terminal: terminals.find((t) => t.id === sale.terminalId)?.name ?? "",
    branch: branches.find((b) => b.id === sale.branchId)?.name ?? "", customer: customers.find((c) => c.id === sale.customerId)?.name,
    business: business ? { name: business.name, phone: business.phone, tin: business.tin } : undefined,
    items: sale.items, subtotal: sale.subtotal, discountTotal: sale.discountTotal, taxTotal: sale.taxTotal, total: sale.total, payments: sale.payments, change: sale.changeDue, shareToken: shareToken ?? sale.receipt?.shareToken,
  };
  const doVoid = async (reason: string, approvalId?: string) => {
    try { await actions.voidSale(sale.id, reason, approvalId); toast({ tone: "success", title: "Sale voided" }); }
    catch (e) { toast({ tone: "error", title: "Couldn't void sale", body: (e as Error).message }); }
  };

  return (
    <>
      <Link to="/sales" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><LuArrowLeft className="size-4" /> Sales</Link>
      <PageHeader
        title={<span className="flex items-center gap-3">{sale.receiptNumber} <SaleStatusBadge status={sale.status} /></span>}
        description={formatDateTime(sale.createdAt)}
        actions={
          <>
            <Button variant="secondary" icon={<LuPrinter className="size-4" />} onClick={() => printReceipt(receipt)}>Reprint</Button>
            {canRefund && <Button variant="secondary" icon={<LuUndo2 className="size-4" />} onClick={() => setRefund(true)}>Refund</Button>}
            {sale.status === "completed" && !sale.refundedTotal && <Button variant="dangerGhost" icon={<LuBan className="size-4" />} onClick={() => setVoiding(true)}>Void</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <DL cols={3} items={[
              { label: "Served by", value: cashier ? <Link className="text-brand-700 hover:underline" to={`/employees/${cashier.id}`}>{cashier.fullName}</Link> : "-" },
              { label: "Till · Branch", value: `${terminals.find((t) => t.id === sale.terminalId)?.name ?? "-"} · ${branches.find((b) => b.id === sale.branchId)?.name ?? ""}` },
              { label: "Customer", value: customers.find((c) => c.id === sale.customerId)?.name ?? "Walk-in" },
            ]} />
          </Card>
          <Card padded={false}>
            <DataTable
              rows={sale.items}
              rowKey={(i) => i.id ?? i.sku}
              columns={[
                { key: "n", header: "Item", cell: (i) => <><p className="font-medium text-ink-900">{i.name}</p><p className="text-xs text-ink-500">{i.sku}{i.refundedQuantity ? ` · ${i.refundedQuantity} refunded` : ""}</p></> },
                { key: "q", header: "Qty", align: "right", cell: (i) => i.quantity },
                { key: "p", header: "Price", align: "right", cell: (i) => formatMoney(i.unitPrice) },
                { key: "d", header: "Discount", align: "right", cell: (i) => (i.discount ? `−${formatMoney(i.discount)}` : "-") },
                { key: "t", header: "Total", align: "right", cell: (i) => <span className="font-medium">{formatMoney(i.lineTotal ?? i.unitPrice * i.quantity - i.discount)}</span> },
              ]}
            />
            <div className="space-y-1 border-t border-ink-200 px-4 py-4 text-sm">
              <div className="flex justify-end gap-8"><span className="text-ink-500">Subtotal</span><span className="num w-28 text-right">{formatMoney(sale.subtotal)}</span></div>
              <div className="flex justify-end gap-8"><span className="text-ink-500">Discount</span><span className="num w-28 text-right">−{formatMoney(sale.discountTotal)}</span></div>
              <div className="flex justify-end gap-8"><span className="text-ink-500">Tax</span><span className="num w-28 text-right">{formatMoney(sale.taxTotal)}</span></div>
              <div className="flex justify-end gap-8 text-base font-semibold"><span>Total</span><span className="num w-28 text-right">{formatMoney(sale.total)}</span></div>
              {!!sale.refundedTotal && <div className="flex justify-end gap-8 text-rose-700"><span>Refunded</span><span className="num w-28 text-right">−{formatMoney(sale.refundedTotal)}</span></div>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Payments" />
            <ul className="divide-y divide-ink-100">
              {sale.payments.map((p, i) => (
                <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                  <span>{methodLabel[p.method]} {p.reference && <span className="text-ink-500">· {p.reference}</span>}</span>
                  <span className="flex items-center gap-3"><Badge tone="neutral">Recorded manually</Badge><span className="num font-medium">{formatMoney(p.amount)}</span></span>
                </li>
              ))}
              {!!sale.changeDue && <li className="flex justify-between py-2.5 text-sm text-ink-500"><span>Change given</span><span className="num">−{formatMoney(sale.changeDue)}</span></li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="History" />
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-emerald-500" /><span><span className="font-medium">{cashier?.fullName ?? "Cashier"}</span> completed the sale · {formatDateTime(sale.createdAt)}</span></li>
              {sale.discountTotal > 0 && <li className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-violet-500" /><span>Discount of {formatMoney(sale.discountTotal)} given (see Activity log for approvals)</span></li>}
              {refunds.map((r) => (
                <li key={r.id} className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-rose-500" /><span><span className="font-medium">{r.actorName}</span> refunded {formatMoney(r.amount)} by {methodLabel[r.method]} - “{r.reason}”. {r.restocked ? "Returned to stock." : "Not restocked."} {r.status === "pending" && <Badge tone="warning">Provider refund pending</Badge>} · {formatDateTime(r.createdAt)}</span></li>
              ))}
              {sale.status === "voided" && <li className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-ink-400" /><span>Sale voided - stock returned.</span></li>}
            </ol>
          </Card>
        </div>
        <div className="hidden lg:block">
          <Receipt className="print-area" data={receipt} />
        </div>
      </div>
      <RefundModal open={refund} onClose={() => setRefund(false)} sale={sale} limit={user.isOwner ? Infinity : can("sales.refund") ? role.limits.maxRefundAmount : 0}
        requestApproval={(r, ok) => setApproval({ ...r, onOk: ok })} />
      <ConfirmDialog open={voiding} onClose={() => setVoiding(false)} title="Void this sale?" message="The sale stays on record marked as voided and stock is returned. Use refunds for returned goods." requireReason confirmLabel={can("sales.void") ? "Void sale" : "Get approval"}
        onConfirm={async (r) => {
          if (can("sales.void")) await doVoid(r ?? "");
          else setApproval({ action: "void", title: "Void sale", detail: `${sale.receiptNumber}: ${r}`, amount: sale.total, permission: "pos.approve", onOk: (id) => void doVoid(r ?? "", id) });
        }} />
      <ApprovalModal request={approval} onClose={() => setApproval(null)} onApproved={(_a, id) => { approval?.onOk(id); setApproval(null); }} />
    </>
  );
}

function RefundModal({ open, onClose, sale, limit, requestApproval }: { open: boolean; onClose: () => void; sale: Sale; limit: number; requestApproval: (r: ApprovalRequest, ok: (id: string) => void) => void }) {
  const toast = useToast();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>(sale.payments[0]?.method ?? "cash");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setQty({}); setReason(""); setRestock(true); } }, [open]);
  const key = (i: Sale["items"][number]) => i.id ?? i.sku;
  const amount = +sale.items.reduce((s, i) => s + (qty[key(i)] ?? 0) * ((i.lineTotal ?? i.unitPrice * i.quantity - i.discount) / i.quantity), 0).toFixed(2);
  const over = amount > limit;
  const submit = async (approvalId?: string) => {
    setBusy(true);
    try {
      await actions.refundSale(sale.id, { items: sale.items.filter((i) => (qty[key(i)] ?? 0) > 0).map((i) => ({ saleItemId: i.id ?? "", quantity: qty[key(i)]! })), reason, restock, method, approvalId });
      toast({ tone: "success", title: `Refunded ${formatMoney(amount)}`, body: method === "cash" ? "Give the customer their cash." : "Send the refund through the provider - it's marked pending." });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "Refund failed", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Refund items"
      description={`${sale.receiptNumber} - the original sale is kept and linked to this refund.`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} disabled={!amount || reason.trim().length < 3} onClick={() => {
            if (over) { onClose(); requestApproval({ action: "refund", title: "Refund above your limit", detail: `${sale.receiptNumber}: ${reason}`, amount, permission: "sales.refund" }, (id) => void submit(id)); }
            else void submit();
          }}>
            {over ? "Request approval" : `Refund ${formatMoney(amount)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <ul className="divide-y divide-ink-100 rounded-lg ring-1 ring-ink-200">
          {sale.items.map((i) => {
            const left = i.quantity - (i.refundedQuantity ?? 0);
            return (
              <li key={key(i)} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1"><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-ink-500">Bought {i.quantity} × {formatMoney(i.unitPrice)}{i.refundedQuantity ? ` · ${i.refundedQuantity} already refunded` : ""}</p></div>
                <Select aria-label={`Quantity to refund for ${i.name}`} className="w-24" value={qty[key(i)] ?? 0} disabled={left <= 0} onChange={(e) => setQty({ ...qty, [key(i)]: Number(e.target.value) })}>
                  {Array.from({ length: left + 1 }).map((_, n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </li>
            );
          })}
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Refund to" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(methodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <div className="flex items-end pb-2"><Checkbox label="Items can be resold - return to stock" checked={restock} onChange={(e) => setRestock(e.target.checked)} /></div>
        </div>
        <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Faulty product, wrong item" />
        {over && amount > 0 && <Callout tone="warning" icon={<LuShieldCheck className="size-4" />}>{formatMoney(amount)} is above your refund limit{Number.isFinite(limit) ? ` of ${formatMoney(limit)}` : ""}. A manager will approve with their PIN.</Callout>}
        {method !== "cash" && amount > 0 && <Callout tone="info">Mobile Money, card and bank refunds are recorded here but must be sent through the provider. They're marked “pending” until confirmed.</Callout>}
      </div>
    </Modal>
  );
}
