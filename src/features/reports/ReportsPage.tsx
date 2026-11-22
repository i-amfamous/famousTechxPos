import { useState, type ReactNode } from "react";
import {
  LuBadgePercent, LuBoxes, LuChartLine, LuClipboardList, LuClock, LuCreditCard, LuDownload, LuFileText, LuPackage, LuUndo2, LuUsers, LuWallet,
} from "react-icons/lu";
import { useSession } from "@/app/session";
import { rangeFor, useDashboard, useEmployeeReport, useExpenses, usePnl, useProducts, usePurchaseOrders, useSales, useSuppliers } from "@/services/api";
import { Avatar, BarChart, Button, Card, CardHeader, DataTable, EmptyState, PageHeader, Segmented, Select, ShareBars, Skeleton, StatCard } from "@/components/ui";
import { cn, formatDate, formatMoney, methodLabel } from "@/lib/format";
import { exportCsv as downloadCsv, exportPrintable, type ExportReport } from "@/lib/export";

type ReportKey = "sales" | "pnl" | "employees" | "products" | "stock" | "payments" | "refunds" | "discounts" | "shifts" | "expenses" | "purchases";
const reports: { key: ReportKey; label: string; icon: ReactNode; group: string }[] = [
  { key: "sales", label: "Sales summary", icon: <LuChartLine />, group: "Sales" },
  { key: "pnl", label: "Profit & loss", icon: <LuFileText />, group: "Sales" },
  { key: "payments", label: "Payment methods", icon: <LuCreditCard />, group: "Sales" },
  { key: "refunds", label: "Refunds & voids", icon: <LuUndo2 />, group: "Sales" },
  { key: "employees", label: "Employee performance", icon: <LuUsers />, group: "Team" },
  { key: "discounts", label: "Discounts & approvals", icon: <LuBadgePercent />, group: "Team" },
  { key: "shifts", label: "Shift & cash variance", icon: <LuClock />, group: "Team" },
  { key: "products", label: "Product performance", icon: <LuPackage />, group: "Stock" },
  { key: "stock", label: "Stock valuation", icon: <LuBoxes />, group: "Stock" },
  { key: "purchases", label: "Purchases", icon: <LuClipboardList />, group: "Stock" },
  { key: "expenses", label: "Expenses", icon: <LuWallet />, group: "Money" },
];

export function ReportsPage() {
  const { branches, branch, business } = useSession();
  const [sel, setSel] = useState<ReportKey>("sales");
  const [range, setRange] = useState<"today" | "7d" | "30d">("7d");
  const [scope, setScope] = useState<string>(branch.id);
  const branchId = scope === "all" ? null : scope;
  const [from, to] = rangeFor(range);
  const r = reports.find((x) => x.key === sel)!;

  const dash = useDashboard(range, scope === "all");
  const emp = useEmployeeReport(range, branchId);
  const pnl = usePnl(range, branchId);
  const products = useProducts().data.filter((p) => p.unit !== "job" && p.status === "active");
  const expenses = useExpenses().data.filter((e) => e.status === "recorded" && new Date(e.date) >= from && new Date(e.date) <= to && (!branchId || e.branchId === branchId));
  const sales = useSales().data.filter((s) => new Date(s.createdAt) >= from);
  const pos = usePurchaseOrders().data.filter((p) => new Date(p.createdAt) >= from && (!branchId || p.branchId === branchId));
  const suppliers = useSuppliers().data;

  const loading = dash.loading || emp.loading || pnl.loading;
  const stockValue = products.reduce((s, p) => s + Math.max(0, p.stock) * p.costPrice, 0);
  const expByCat = Object.entries(expenses.reduce<Record<string, number>>((a, e) => ({ ...a, [e.category]: (a[e.category] ?? 0) + e.amount }), {})).sort((a, b) => b[1] - a[1]);
  const refunded = sales.filter((s) => s.status !== "completed");

  const buildReport = (): ExportReport => {
    const base = { filename: `famous-${sel}-${range}`, title: r.label, business, subtitle: `${formatDate(from.toISOString())} – ${formatDate(to.toISOString())} · ${scope === "all" ? "All branches" : branches.find((b) => b.id === branchId)?.name ?? ""}` };
    if (sel === "employees" || sel === "discounts" || sel === "shifts")
      return { ...base,
        columns: ["Employee", "Sales", "Revenue", "Avg sale", "Discounts", "Refunds", "Approvals given", "Cash variance", "Shifts"].map((header) => ({ key: header, header, align: ["Sales", "Revenue", "Avg sale", "Discounts", "Refunds", "Approvals given", "Cash variance", "Shifts"].includes(header) ? "right" as const : "left" as const })),
        rows: emp.data.map((e) => [e.fullName, e.salesCount, e.revenue, e.avgSale.toFixed(2), e.discounts, e.refunds, e.approvalsGiven, e.cashVariance, e.shifts]) };
    if (sel === "pnl") return { ...base, columns: [{ key: "line", header: "Line" }, { key: "amount", header: "Amount", align: "right" }], rows: Object.entries(pnl.data).map(([k, v]) => [k, v]) };
    if (sel === "stock") return { ...base, columns: [{ key: "product", header: "Product" }, { key: "sku", header: "SKU" }, { key: "onhand", header: "On hand", align: "right" }, { key: "cost", header: "Cost", align: "right" }, { key: "value", header: "Value", align: "right" }], rows: products.map((p) => [p.name, p.sku, p.stock, p.costPrice, Math.max(0, p.stock) * p.costPrice]) };
    if (sel === "expenses") return { ...base, columns: [{ key: "date", header: "Date" }, { key: "cat", header: "Category" }, { key: "desc", header: "Description" }, { key: "amount", header: "Amount", align: "right" }, { key: "by", header: "Paid by" }], rows: expenses.map((e) => [e.date, e.category, e.description, e.amount, methodLabel[e.method] ?? e.method]) };
    if (sel === "purchases") return { ...base, columns: [{ key: "po", header: "PO" }, { key: "supplier", header: "Supplier" }, { key: "status", header: "Status" }, { key: "total", header: "Total", align: "right" }], rows: pos.map((p) => [p.number, suppliers.find((s) => s.id === p.supplierId)?.name ?? "", p.status, p.lines.reduce((a, l) => a + l.quantity * l.unitCost, 0)]) };
    if (sel === "refunds") return { ...base, columns: [{ key: "receipt", header: "Receipt" }, { key: "date", header: "Date" }, { key: "status", header: "Status" }, { key: "total", header: "Total", align: "right" }, { key: "refunded", header: "Refunded", align: "right" }], rows: refunded.map((s) => [s.receiptNumber, s.createdAt, s.status, s.total, s.refundedTotal ?? 0]) };
    if (sel === "payments") return { ...base, columns: [{ key: "method", header: "Method" }, { key: "amount", header: "Amount", align: "right" }], rows: dash.data.byMethod.map((m) => [methodLabel[m.method] ?? m.method, m.amount]) };
    if (sel === "products") return { ...base, columns: [{ key: "product", header: "Product" }, { key: "qty", header: "Quantity", align: "right" }, { key: "revenue", header: "Revenue", align: "right" }], rows: dash.data.topProducts.map((t) => [t.name, t.quantity, t.revenue]) };
    return { ...base, columns: [{ key: "day", header: "Day" }, { key: "revenue", header: "Revenue", align: "right" }], rows: dash.data.trend.map((t) => [t.label, t.value]) };
  };
  const exportCsv = () => downloadCsv(buildReport());
  const exportPdf = () => exportPrintable(buildReport());

  return (
    <>
      <PageHeader title="Reports" description="Every figure comes from recorded sales, payments, refunds and expenses." />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="space-y-5" aria-label="Reports">
          {["Sales", "Team", "Stock", "Money"].map((g) => (
            <div key={g}>
              <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{g}</p>
              {reports.filter((x) => x.group === g).map((x) => (
                <button key={x.key} onClick={() => setSel(x.key)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm [&>svg]:size-4", sel === x.key ? "bg-white font-medium text-brand-700 shadow-card ring-1 ring-ink-200" : "text-ink-600 hover:bg-white/60")}>
                  {x.icon}{x.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="mr-auto text-lg font-semibold text-ink-900">{r.label}</h2>
              <Segmented value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />
              <Select aria-label="Branch" className="w-48" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
              <Button variant="secondary" icon={<LuDownload className="size-4" />} onClick={exportCsv}>CSV</Button>
              <Button variant="secondary" icon={<LuDownload className="size-4" />} onClick={exportPdf}>PDF</Button>
            </div>
            <p className="mt-2 text-xs text-ink-500">{formatDate(from.toISOString())} – {formatDate(to.toISOString())}</p>
          </Card>

          {loading ? <Skeleton className="h-72 w-full" /> : sel === "employees" || sel === "discounts" || sel === "shifts" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Team sales" value={formatMoney(emp.data.reduce((s, e) => s + e.revenue, 0))} />
                <StatCard label="Approvals given" value={emp.data.reduce((s, e) => s + e.approvalsGiven, 0)} hint="discounts, refunds, drawer" />
                <StatCard label="Net cash variance" value={(() => { const v = emp.data.reduce((s, e) => s + e.cashVariance, 0); return <span className={v < 0 ? "text-rose-600" : v > 0 ? "text-emerald-700" : ""}>{v > 0 ? "+" : ""}{formatMoney(v)}</span>; })()} hint={`across ${emp.data.reduce((s, e) => s + e.shifts, 0)} shifts`} />
              </div>
              <Card padded={false}>
                {emp.data.length ? (
                  <DataTable
                    rows={emp.data}
                    rowKey={(e) => e.memberId}
                    columns={[
                      { key: "e", header: "Employee", cell: (e) => <div className="flex items-center gap-2.5"><Avatar name={e.fullName} color={e.avatarColor} size="sm" /><span className="font-medium text-ink-900">{e.fullName}</span></div> },
                      { key: "s", header: "Sales", align: "right", cell: (e) => e.salesCount },
                      { key: "r", header: "Revenue", align: "right", cell: (e) => formatMoney(e.revenue) },
                      { key: "a", header: "Avg sale", align: "right", hideBelow: "md", cell: (e) => formatMoney(e.avgSale) },
                      { key: "d", header: "Discounts", align: "right", hideBelow: "md", cell: (e) => formatMoney(e.discounts) },
                      { key: "f", header: "Refunds", align: "right", hideBelow: "lg", cell: (e) => (e.refunds ? formatMoney(e.refunds) : "—") },
                      { key: "ap", header: "Approvals", align: "right", hideBelow: "lg", cell: (e) => e.approvalsGiven || "—" },
                      { key: "v", header: "Cash variance", align: "right", cell: (e) => (e.cashVariance ? <span className={e.cashVariance < 0 ? "text-rose-600" : "text-emerald-700"}>{e.cashVariance > 0 ? "+" : "−"}{formatMoney(Math.abs(e.cashVariance))}</span> : "—") },
                    ]}
                  />
                ) : <EmptyState title="No activity in this period" />}
              </Card>
            </>
          ) : sel === "pnl" ? (
            <Card>
              <CardHeader title="Profit & loss" description="Revenue excludes tax collected. Expenses are shown separately — not subtracted from sales." />
              <dl className="max-w-lg space-y-2 text-sm">
                {([["Gross sales", pnl.data.grossSales], ["Discounts", -pnl.data.discounts], ["Refunds", -pnl.data.refunds], ["Tax collected", -pnl.data.taxCollected], ["Net revenue", pnl.data.netRevenue, true],
                  ["Cost of goods sold", -pnl.data.cogs], ["Gross profit", pnl.data.grossProfit, true], ["Operating expenses", -pnl.data.operatingExpenses],
                  ["Net profit", pnl.data.grossProfit - pnl.data.operatingExpenses, true]] as [string, number, boolean?][]).map(([l, v, b]) => (
                  <div key={l} className={cn("flex justify-between", b && "border-t border-ink-200 pt-2 font-semibold text-ink-900")}><dt>{l}</dt><dd className="num">{v < 0 ? `−${formatMoney(-v)}` : formatMoney(v)}</dd></div>
                ))}
              </dl>
              <p className="mt-4 text-xs text-ink-500">{pnl.data.salesCount} sales in this period.</p>
            </Card>
          ) : sel === "payments" ? (
            <Card><CardHeader title="By payment method" description="Cash shown after change given" />{dash.data.byMethod.length ? <ShareBars data={dash.data.byMethod.map((m) => ({ label: methodLabel[m.method] ?? m.method, value: m.amount }))} /> : <EmptyState title="No payments in this period" />}</Card>
          ) : sel === "products" ? (
            <Card padded={false}>{dash.data.topProducts.length ? <DataTable rows={dash.data.topProducts} rowKey={(t) => t.productId} columns={[
              { key: "n", header: "Product", cell: (t) => t.name }, { key: "q", header: "Sold", align: "right", cell: (t) => t.quantity }, { key: "r", header: "Revenue", align: "right", cell: (t) => formatMoney(t.revenue) },
            ]} /> : <EmptyState title="No sales in this period" />}</Card>
          ) : sel === "stock" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Stock value (cost)" value={formatMoney(stockValue)} />
                <StatCard label="Retail value" value={formatMoney(products.reduce((s, p) => s + Math.max(0, p.stock) * p.sellingPrice, 0))} />
                <StatCard label="Products in stock" value={products.filter((p) => p.stock > 0).length} hint={`of ${products.length} at ${branch.name}`} />
              </div>
              <Card padded={false}><DataTable rows={[...products].sort((a, b) => b.stock * b.costPrice - a.stock * a.costPrice)} rowKey={(p) => p.id} columns={[
                { key: "n", header: "Product", cell: (p) => p.name }, { key: "s", header: "On hand", align: "right", cell: (p) => p.stock },
                { key: "c", header: "Cost", align: "right", hideBelow: "sm", cell: (p) => formatMoney(p.costPrice) }, { key: "v", header: "Value", align: "right", cell: (p) => formatMoney(Math.max(0, p.stock) * p.costPrice) },
              ]} /></Card>
            </>
          ) : sel === "expenses" ? (
            <Card><CardHeader title="Expenses by category" description={`${expenses.length} recorded · ${formatMoney(expenses.reduce((s, e) => s + e.amount, 0))}`} />{expByCat.length ? <ShareBars data={expByCat.map(([label, value]) => ({ label, value }))} /> : <EmptyState title="No expenses in this period" />}</Card>
          ) : sel === "purchases" ? (
            <Card padded={false}>{pos.length ? <DataTable rows={pos} rowKey={(p) => p.id} columns={[
              { key: "n", header: "PO", cell: (p) => p.number }, { key: "s", header: "Supplier", cell: (p) => suppliers.find((x) => x.id === p.supplierId)?.name ?? "—" },
              { key: "st", header: "Status", cell: (p) => p.status.replace("_", " ") }, { key: "t", header: "Total", align: "right", cell: (p) => formatMoney(p.lines.reduce((a, l) => a + l.quantity * l.unitCost, 0)) },
            ]} /> : <EmptyState title="No purchase orders in this period" />}</Card>
          ) : sel === "refunds" ? (
            <Card padded={false}>{refunded.length ? <DataTable rows={refunded} rowKey={(s) => s.id} columns={[
              { key: "r", header: "Receipt", cell: (s) => s.receiptNumber }, { key: "d", header: "Date", cell: (s) => formatDate(s.createdAt) },
              { key: "s", header: "Status", cell: (s) => s.status.replace("_", " ") }, { key: "t", header: "Refunded", align: "right", cell: (s) => formatMoney(s.status === "voided" ? s.total : s.refundedTotal ?? 0) },
            ]} /> : <EmptyState title="No refunds or voids in this period" />}</Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Net revenue" value={formatMoney(dash.data.revenue)} />
                <StatCard label="Transactions" value={dash.data.salesCount} />
                <StatCard label="Average sale" value={formatMoney(dash.data.salesCount ? dash.data.revenue / dash.data.salesCount : 0)} />
              </div>
              <Card><CardHeader title="Daily" />{dash.data.trend.length ? <BarChart data={dash.data.trend} /> : <EmptyState title="No sales in this period" />}</Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
