import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuBanknote, LuMonitorSmartphone, LuPackagePlus, LuReceipt, LuTrendingUp, LuTriangleAlert, LuUserPlus, LuWallet } from "react-icons/lu";
import { useSession } from "@/app/session";
import { useDashboard, useEmployees, useSales } from "@/services/api";
import {
  Avatar, Badge, BarChart, Card, CardHeader, DataState, DataTable, EmptyState, ErrorState, PageHeader, Segmented, ShareBars, Skeleton, StatCard,
} from "@/components/ui";
import { formatMoney, formatTime, methodLabel, timeAgo } from "@/lib/format";
import { SaleStatusBadge } from "@/features/sales/SalesPages";

const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : undefined);
const methodColor: Record<string, string> = { momo: "bg-violet-500", cash: "bg-emerald-500", card: "bg-brand-500", bank: "bg-sky-500" };

export function DashboardPage() {
  const { user, branch, can } = useSession();
  const [range, setRange] = useState<"today" | "7d" | "30d">("today");
  const q = useDashboard(range);
  const trend30 = useDashboard("30d");
  const salesQ = useSales();
  const employees = useEmployees().data;
  const navigate = useNavigate();
  const d = q.data;
  const hour = new Date().getHours();
  const label = range === "today" ? "yesterday" : range === "7d" ? "previous 7 days" : "previous 30 days";
  const noData = !q.loading && !q.error && d.salesCount === 0 && trend30.data.trend.every((t) => t.value === 0) && salesQ.data.length === 0;

  return (
    <>
      <PageHeader
        title={`Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${user.displayName}`}
        description={`Here's how ${branch.name} is doing.`}
        actions={<Segmented value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />}
      />

      {q.error ? (
        <Card><ErrorState message={q.error} onRetry={q.refetch} /></Card>
      ) : q.loading ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : noData ? (
        <Card className="mb-6">
          <EmptyState icon={<LuReceipt className="size-7" />} title="No sales yet" description="Your numbers appear here as soon as you sell. Nothing on this page is estimated." />
          <div className="mx-auto grid max-w-2xl gap-3 pb-6 sm:grid-cols-3">
            {[["Add products", "/products", <LuPackagePlus key="a" className="size-5" />], ["Add employees", "/employees", <LuUserPlus key="b" className="size-5" />], ["Register a till", "/settings?tab=terminals", <LuMonitorSmartphone key="c" className="size-5" />]].map(([l, to, icon]) => (
              <Link key={to as string} to={to as string} className="flex items-center gap-3 rounded-xl p-4 text-sm font-medium ring-1 ring-ink-200 hover:bg-brand-50 hover:ring-brand-300"><span className="text-brand-600">{icon}</span>{l}</Link>
            ))}
          </div>
        </Card>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Revenue" value={formatMoney(d.revenue)} change={pct(d.revenue, d.prevRevenue)} hint={`vs ${label}`} icon={<LuBanknote className="size-4" />} />
          <StatCard label="Sales" value={d.salesCount} change={pct(d.salesCount, d.prevSalesCount)} hint={d.salesCount ? `avg. ${formatMoney(d.revenue / d.salesCount)}` : undefined} icon={<LuReceipt className="size-4" />} />
          <StatCard label="Gross profit (est.)" value={formatMoney(d.grossProfit)} hint="Revenue − cost of goods" icon={<LuTrendingUp className="size-4" />} />
          <StatCard label="Expenses" value={formatMoney(d.expenses)} hint={`${d.expenseCount} recorded`} icon={<LuWallet className="size-4" />} />
        </div>
      )}

      {!noData && !q.error && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Sales trend" description="Daily revenue, last 14 days" />
            {trend30.loading ? <Skeleton className="h-56" /> : <BarChart data={trend30.data.trend.slice(-14)} />}
          </Card>

          <Card>
            <CardHeader title="On shift now" description="Who's selling right now" action={can("shift.view_all") && <Link to="/shifts" className="text-sm font-medium text-brand-700 hover:underline">All shifts</Link>} />
            {d.onShift.length ? (
              <ul className="space-y-3">
                {d.onShift.map((s) => (
                  <li key={s.shiftId} className="flex items-center gap-3">
                    <Avatar name={s.fullName} color={s.avatarColor} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink-900">{s.fullName}</p>
                      <p className="text-xs text-ink-500">{s.terminal} · since {formatTime(s.openedAt)}</p>
                    </div>
                    <div className="text-right"><p className="num text-sm font-semibold">{formatMoney(s.salesTotal)}</p><p className="text-xs text-ink-500">{s.salesCount} sales</p></div>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No one is on shift" description="Shifts start from the POS lock screen." className="py-6" />}
          </Card>

          <Card>
            <CardHeader title="Payment methods" description="This period" />
            {d.byMethod.length ? <ShareBars data={d.byMethod.map((m) => ({ label: methodLabel[m.method] ?? m.method, value: m.amount, color: methodColor[m.method] }))} /> : <p className="text-sm text-ink-500">No payments in this period.</p>}
          </Card>

          <Card>
            <CardHeader title="Top products" description="By revenue, this period" />
            {d.topProducts.length ? (
              <ol className="space-y-3">
                {d.topProducts.map((t, i) => (
                  <li key={t.productId} className="flex items-center gap-3 text-sm">
                    <span className="num flex size-6 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">{i + 1}</span>
                    <span className="flex-1 truncate text-ink-800">{t.name}</span>
                    <span className="whitespace-nowrap text-xs text-ink-400">{t.quantity} sold</span>
                    <span className="num w-28 text-right font-medium">{formatMoney(t.revenue)}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-ink-500">No sales in this period.</p>}
          </Card>

          <Card>
            <CardHeader title="Low stock" description={`${d.lowStock.length} item${d.lowStock.length === 1 ? "" : "s"} at or below reorder level`} action={<Link to="/inventory" className="text-sm font-medium text-brand-700 hover:underline">Inventory</Link>} />
            {d.lowStock.length ? (
              <ul className="space-y-2.5">
                {d.lowStock.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 text-sm">
                    <LuTriangleAlert className={p.quantity <= 0 ? "size-4 text-rose-500" : "size-4 text-amber-500"} />
                    <span className="flex-1 truncate">{p.name}</span>
                    <Badge tone={p.quantity <= 0 ? "danger" : "warning"}>{p.quantity <= 0 ? "Out" : `${p.quantity} left`}</Badge>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-500">All stock is above reorder levels.</p>}
          </Card>

          <Card padded={false} className="xl:col-span-3">
            <div className="flex items-center justify-between px-5 pt-5"><h3 className="font-semibold text-ink-900">Recent sales</h3><Link to="/sales" className="text-sm font-medium text-brand-700 hover:underline">View all</Link></div>
            <div className="mt-3">
              <DataState query={salesQ} empty={<EmptyState title="No sales yet" />}>
                {(sales) => (
                  <DataTable
                    rows={sales.slice(0, 6)}
                    rowKey={(s) => s.id}
                    onRowClick={(s) => navigate(`/sales/${s.id}`)}
                    columns={[
                      { key: "r", header: "Receipt", cell: (s) => <span className="font-medium text-ink-900">{s.receiptNumber}</span> },
                      { key: "t", header: "Time", cell: (s) => timeAgo(s.createdAt) },
                      { key: "c", header: "Served by", hideBelow: "sm", cell: (s) => employees.find((e) => e.id === s.cashierId)?.fullName ?? "—" },
                      { key: "s", header: "Status", cell: (s) => <SaleStatusBadge status={s.status} /> },
                      { key: "a", header: "Total", align: "right", cell: (s) => <span className="font-medium">{formatMoney(s.total)}</span> },
                    ]}
                  />
                )}
              </DataState>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
