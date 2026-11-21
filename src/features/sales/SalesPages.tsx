import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuBan, LuDownload, LuPrinter, LuReceipt, LuShieldCheck, LuUndo2 } from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useBranches, useCustomers, useEmployees, useSales, useTerminals } from "@/services/api";
import {
  Badge, Button, Callout, Card, CardHeader, Checkbox, ConfirmDialog, DataState, DataTable, DL, EmptyState, FilterBar, Modal, PageHeader,
  Pager, SearchInput, Select, Textarea, useToast, type Column,
} from "@/components/ui";
import { formatDateTime, formatMoney, methodLabel } from "@/lib/format";
import type { Sale, SaleStatus } from "@/types";
import { Receipt } from "@/features/pos/Receipt";

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  const m = { completed: ["success", "Completed"], refunded: ["danger", "Refunded"], partially_refunded: ["warning", "Part refunded"], voided: ["neutral", "Voided"] } as const;
  return <Badge tone={m[status][0]}>{m[status][1]}</Badge>;
}

export function SalesPage() {
  const q = useSales();
  const employees = useEmployees().data;
  const branches = useBranches().data;
  const customers = useCustomers().data;
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cashier, setCashier] = useState("");
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const rows = q.data.filter((s) => (!cashier || s.cashierId === cashier) && (!status || s.status === status) && (!branch || s.branchId === branch) && s.receiptNumber.toLowerCase().includes(search.toLowerCase()));

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
      <PageHeader title="Sales" description="Every transaction, who made it and how it was paid." actions={<Button variant="secondary" icon={<LuDownload className="size-4" />}>Export CSV</Button>} />
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
          <input type="date" aria-label="From" className="h-10 rounded-lg border-0 px-3 text-sm ring-1 ring-ink-200" />
        </FilterBar>
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuReceipt className="size-7" />} title={q.data.length ? "No sales match" : "No sales yet"} description={q.data.length ? "Try different filters." : "Sales made on the POS appear here."} />}>
          {(data) => <DataTable columns={cols} rows={data} rowKey={(s) => s.id} onRowClick={(s) => navigate(`/sales/${s.id}`)} footer={<Pager total={data.length} />} />}
        </DataState>
      </Card>
    </>
  );
}

export function SaleDetailPage() {
  const { id } = useParams();
  const sale = useSales().data.find((s) => s.id === id);
  const employees = useEmployees().data;
  const customers = useCustomers().data;
  const terminals = useTerminals().data;
  const branches = useBranches().data;
  const { roleOf, user } = useSession();
  const toast = useToast();
  const [refund, setRefund] = useState(false);
  const [voiding, setVoiding] = useState(false);
  if (!sale) return <EmptyState title="Sale not found" action={<Link to="/sales" className="text-sm font-medium text-brand-700">Back to sales</Link>} />;
  const cashier = employees.find((e) => e.id === sale.cashierId);
  const canRefund = sale.status === "completed" || sale.status === "partially_refunded";

  return (
    <>
      <Link to="/sales" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><LuArrowLeft className="size-4" /> Sales</Link>
      <PageHeader
        title={<span className="flex items-center gap-3">{sale.receiptNumber} <SaleStatusBadge status={sale.status} /></span>}
        description={formatDateTime(sale.createdAt)}
        actions={
          <>
            <Button variant="secondary" icon={<LuPrinter className="size-4" />} onClick={() => window.print()}>Reprint</Button>
            {canRefund && <Button variant="secondary" icon={<LuUndo2 className="size-4" />} onClick={() => setRefund(true)}>Refund</Button>}
            {sale.status === "completed" && <Button variant="dangerGhost" icon={<LuBan className="size-4" />} onClick={() => setVoiding(true)}>Void</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <DL cols={3} items={[
              { label: "Served by", value: cashier ? <Link className="text-brand-700 hover:underline" to={`/employees/${cashier.id}`}>{cashier.fullName}</Link> : "—" },
              { label: "Till · Branch", value: `${terminals.find((t) => t.id === sale.terminalId)?.name} · ${branches.find((b) => b.id === sale.branchId)?.name}` },
              { label: "Customer", value: customers.find((c) => c.id === sale.customerId)?.name ?? "Walk-in" },
            ]} />
          </Card>
          <Card padded={false}>
            <DataTable
              rows={sale.items}
              rowKey={(i) => i.sku}
              columns={[
                { key: "n", header: "Item", cell: (i) => <><p className="font-medium text-ink-900">{i.name}</p><p className="text-xs text-ink-500">{i.sku}</p></> },
                { key: "q", header: "Qty", align: "right", cell: (i) => i.quantity },
                { key: "p", header: "Price", align: "right", cell: (i) => formatMoney(i.unitPrice) },
                { key: "d", header: "Discount", align: "right", cell: (i) => (i.discount ? `−${formatMoney(i.discount)}` : "—") },
                { key: "t", header: "Total", align: "right", cell: (i) => <span className="font-medium">{formatMoney(i.unitPrice * i.quantity - i.discount)}</span> },
              ]}
            />
            <div className="space-y-1 border-t border-ink-200 px-4 py-4 text-sm">
              <div className="flex justify-end gap-8"><span className="text-ink-500">Subtotal</span><span className="num w-28 text-right">{formatMoney(sale.subtotal)}</span></div>
              <div className="flex justify-end gap-8"><span className="text-ink-500">Discount</span><span className="num w-28 text-right">−{formatMoney(sale.discountTotal)}</span></div>
              <div className="flex justify-end gap-8"><span className="text-ink-500">Tax</span><span className="num w-28 text-right">{formatMoney(sale.taxTotal)}</span></div>
              <div className="flex justify-end gap-8 text-base font-semibold"><span>Total</span><span className="num w-28 text-right">{formatMoney(sale.total)}</span></div>
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
            </ul>
          </Card>
          <Card>
            <CardHeader title="History" />
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3"><span className="mt-1.5 size-2 rounded-full bg-emerald-500" /><span><span className="font-medium">{cashier?.fullName}</span> completed the sale · {formatDateTime(sale.createdAt)}</span></li>
              {sale.discountTotal > 0 && <li className="flex gap-3"><span className="mt-1.5 size-2 rounded-full bg-violet-500" /><span>Discount {formatMoney(sale.discountTotal)} approved by <span className="font-medium">Ama Serwaa</span> (manager PIN)</span></li>}
              {sale.status === "partially_refunded" && <li className="flex gap-3"><span className="mt-1.5 size-2 rounded-full bg-rose-500" /><span><span className="font-medium">Ama Serwaa</span> refunded 1 × Oraimo FreePods 4 — “Faulty left earbud”. Not restocked.</span></li>}
              {sale.status === "voided" && <li className="flex gap-3"><span className="mt-1.5 size-2 rounded-full bg-ink-400" /><span>Voided by <span className="font-medium">Ama Serwaa</span> — “Rang up twice”.</span></li>}
            </ol>
          </Card>
        </div>
        <div className="hidden lg:block">
          <Receipt reprint data={{
            receiptNumber: sale.receiptNumber, createdAt: sale.createdAt, servedBy: cashier?.displayName ?? "", terminal: terminals.find((t) => t.id === sale.terminalId)?.name ?? "",
            branch: branches.find((b) => b.id === sale.branchId)?.name ?? "", customer: customers.find((c) => c.id === sale.customerId)?.name, items: sale.items,
            subtotal: sale.subtotal, discountTotal: sale.discountTotal, taxTotal: sale.taxTotal, total: sale.total, payments: sale.payments,
          }} />
        </div>
      </div>
      <RefundModal open={refund} onClose={() => setRefund(false)} sale={sale} limit={roleOf(user).limits.maxRefundAmount} />
      <ConfirmDialog open={voiding} onClose={() => setVoiding(false)} title="Void this sale?" message="The sale stays on record marked as voided and stock is returned. Use refunds for returned goods." requireReason confirmLabel="Void sale" onConfirm={async (r) => { await actions.voidSale(sale.id, r ?? ""); toast({ tone: "success", title: "Sale voided" }); }} />
    </>
  );
}

function RefundModal({ open, onClose, sale, limit }: { open: boolean; onClose: () => void; sale: Sale; limit: number }) {
  const toast = useToast();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [method, setMethod] = useState(sale.payments[0]?.method ?? "cash");
  useEffect(() => { if (open) { setQty({}); setReason(""); } }, [open]);
  const amount = sale.items.reduce((s, i) => s + (qty[i.sku] ?? 0) * i.unitPrice, 0);
  const over = amount > limit;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Refund items"
      description={`${sale.receiptNumber} — the original sale is kept and linked to this refund.`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!amount || reason.trim().length < 3} onClick={async () => { await actions.refundSale(sale.id, { items: Object.entries(qty).map(([sku, quantity]) => ({ sku, quantity })), reason, restock }); toast({ tone: "success", title: `Refunded ${formatMoney(amount)}` }); onClose(); }}>
            {over ? "Request approval" : `Refund ${formatMoney(amount)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <ul className="divide-y divide-ink-100 rounded-lg ring-1 ring-ink-200">
          {sale.items.map((i) => (
            <li key={i.sku} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1"><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-ink-500">Bought {i.quantity} × {formatMoney(i.unitPrice)}</p></div>
              <Select aria-label={`Quantity to refund for ${i.name}`} className="w-24" value={qty[i.sku] ?? 0} onChange={(e) => setQty({ ...qty, [i.sku]: Number(e.target.value) })}>
                {Array.from({ length: i.quantity + 1 }).map((_, n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </li>
          ))}
        </ul>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Refund to" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {Object.entries(methodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <div className="flex items-end pb-2"><Checkbox label="Items can be resold — return to stock" checked={restock} onChange={(e) => setRestock(e.target.checked)} /></div>
        </div>
        <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Faulty product, wrong item" />
        {over && amount > 0 && <Callout tone="warning" icon={<LuShieldCheck className="size-4" />}>{formatMoney(amount)} is above your refund limit of {formatMoney(limit)}. A manager will approve with their PIN.</Callout>}
        {method !== "cash" && amount > 0 && <Callout tone="info">Mobile Money, card and bank refunds are recorded here but must be sent through the provider. They're marked “pending” until confirmed.</Callout>}
      </div>
    </Modal>
  );
}
