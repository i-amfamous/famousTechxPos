import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuBanknote, LuReceipt, LuTrendingUp, LuTriangleAlert, LuWallet } from "react-icons/lu";
import { useSession } from "@/app/session";
import { useEmployees, useProducts, useSales, useSalesTrend, useShifts, useTerminals } from "@/services/api";
import {
  Avatar, Badge, BarChart, Card, CardHeader, DataState, DataTable, EmptyState, PageHeader, Segmented, ShareBars, Skeleton, StatCard,
} from "@/components/ui";
import { formatMoney, formatTime, timeAgo } from "@/lib/format";
import { SaleStatusBadge } from "@/features/sales/SalesPages";

export function DashboardPage() {
  const { user, branch } = useSession();
  const [range, setRange] = useState<"today" | "7d" | "30d">("7d");
  const trend = useSalesTrend();
  const salesQ = useSales();
  const products = useProducts().data;
  const shifts = useShifts().data.filter((s) => s.status === "open");
  const employees = useEmployees().data;
  const terminals = useTerminals().data;
  const navigate = useNavigate();
  const low = products.filter((p) => p.unit !== "job" && p.status === "active" && p.stock <= p.reorderLevel).sort((a, b) => a.stock - b.stock);
  const hour = new Date().getHours();

  return (
    <>
      <PageHeader
        title={`Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}, ${user.displayName}`}
        description={`Here's how ${branch.name} is doing.`}
        actions={<Segmented value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />}
      />

      {trend.loading ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : trend.data.length === 0 ? (
        <Card className="mb-6"><EmptyState icon={<LuReceipt className="size-7" />} title="No sales yet" description="Once you make your first sale, your numbers show up here. Nothing on this page is estimated." action={<Link to="/pos" className="text-sm font-medium text-brand-700 hover:underline">Open the POS →</Link>} /></Card>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Revenue" value={formatMoney(8560)} change={-29} hint="vs yesterday" icon={<LuBanknote className="size-4" />} />
          <StatCard label="Sales" value="27" change={-12} hint="avg. GH₵ 317.04" icon={<LuReceipt className="size-4" />} />
          <StatCard label="Gross profit (est.)" value={formatMoney(1942.5)} hint="Revenue − cost of goods" icon={<LuTrendingUp className="size-4" />} />
          <StatCard label="Expenses" value={formatMoney(600)} hint="1 recorded today" icon={<LuWallet className="size-4" />} />
        </div>
      )}

      {(trend.loading || trend.data.length > 0) && <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales trend" description="Daily revenue, last 14 days" />
          {trend.loading ? <Skeleton className="h-56" /> : trend.data.length ? <BarChart data={trend.data} /> : <EmptyState title="Nothing to chart yet" />}
        </Card>

        <Card>
          <CardHeader title="On shift now" description="Who's selling right now" action={<Link to="/shifts" className="text-sm font-medium text-brand-700 hover:underline">All shifts</Link>} />
          {shifts.length ? (
            <ul className="space-y-3">
              {shifts.map((s) => {
                const e = employees.find((x) => x.id === s.employeeId);
                return (
                  <li key={s.id} className="flex items-center gap-3">
                    {e && <Avatar name={e.fullName} color={e.avatarColor} />}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-ink-900">{e?.fullName}</p>
                      <p className="text-xs text-ink-500">{terminals.find((t) => t.id === s.terminalId)?.name} · since {formatTime(s.openedAt)}</p>
                    </div>
                    <div className="text-right"><p className="num text-sm font-semibold">{formatMoney(s.salesTotal)}</p><p className="text-xs text-ink-500">{s.salesCount} sales</p></div>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyState title="No one is on shift" description="Shifts start from the POS lock screen." className="py-6" />}
        </Card>

        <Card>
          <CardHeader title="Payment methods" description="This period" />
          <ShareBars data={[
            { label: "Mobile Money", value: 28920, color: "bg-amber-400" },
            { label: "Cash", value: 14310, color: "bg-emerald-500" },
            { label: "Card", value: 7330, color: "bg-brand-500" },
            { label: "Bank transfer", value: 2274, color: "bg-violet-500" },
          ]} />
        </Card>

        <Card>
          <CardHeader title="Top products" description="By revenue" />
          <ol className="space-y-3">
            {[["Samsung Galaxy A15", 11994, 6], ["HP 250 G9 Laptop", 6199, 1], ["Oraimo FreePods 4", 3141, 9], ["Power Bank 20,000mAh", 2750, 11], ["Tempered Glass (Universal)", 1365, 39]].map(([n, v, q], i) => (
              <li key={n as string} className="flex items-center gap-3 text-sm">
                <span className="num flex size-6 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">{i + 1}</span>
                <span className="flex-1 truncate text-ink-800">{n}</span>
                <span className="text-xs text-ink-400">{q} sold</span>
                <span className="num w-24 text-right font-medium">{formatMoney(v as number)}</span>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHeader title="Low stock" description={`${low.length} item${low.length === 1 ? "" : "s"} at or below reorder level`} action={<Link to="/inventory" className="text-sm font-medium text-brand-700 hover:underline">Inventory</Link>} />
          {low.length ? (
            <ul className="space-y-2.5">
              {low.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-3 text-sm">
                  <LuTriangleAlert className={p.stock === 0 ? "size-4 text-rose-500" : "size-4 text-amber-500"} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <Badge tone={p.stock === 0 ? "danger" : "warning"}>{p.stock === 0 ? "Out" : `${p.stock} left`}</Badge>
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
                    { key: "c", header: "Served by", hideBelow: "sm", cell: (s) => employees.find((e) => e.id === s.cashierId)?.fullName },
                    { key: "s", header: "Status", cell: (s) => <SaleStatusBadge status={s.status} /> },
                    { key: "a", header: "Total", align: "right", cell: (s) => <span className="font-medium">{formatMoney(s.total)}</span> },
                  ]}
                />
              )}
            </DataState>
          </div>
        </Card>
      </div>}
    </>
  );
}
