import { useState, type ReactNode } from "react";
import {
  LuBadgePercent, LuBoxes, LuChartLine, LuClipboardList, LuClock, LuCreditCard, LuDownload, LuFileText, LuPackage, LuUndo2, LuUsers, LuWallet,
} from "react-icons/lu";
import { useEmployees, useSalesTrend } from "@/services/api";
import { Avatar, BarChart, Button, Card, CardHeader, DataTable, PageHeader, Segmented, Select, StatCard } from "@/components/ui";
import { cn, formatMoney } from "@/lib/format";

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
  const [sel, setSel] = useState<ReportKey>("employees");
  const [range, setRange] = useState<"7d" | "30d" | "custom">("7d");
  const trend = useSalesTrend().data;
  const employees = useEmployees().data.filter((e) => e.status === "active");
  const r = reports.find((x) => x.key === sel)!;

  return (
    <>
      <PageHeader title="Reports" description="Every figure comes from recorded sales, payments, refunds and expenses." />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="space-y-5" aria-label="Reports">
          {["Sales", "Team", "Stock", "Money"].map((g) => (
            <div key={g}>
              <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-ink-500">{g}</p>
              {reports.filter((x) => x.group === g).map((x) => (
                <button key={x.key} onClick={() => setSel(x.key)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm [&>svg]:size-4", sel === x.key ? "bg-white font-medium text-brand-800 shadow-card ring-1 ring-ink-200" : "text-ink-600 hover:bg-white/60")}>
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
              <Segmented value={range} onChange={setRange} options={[{ value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "custom", label: "Custom" }]} />
              <Select aria-label="Branch" className="w-44"><option>All branches</option><option>Accra – Osu</option><option>Kumasi – Adum</option></Select>
              <Button variant="secondary" icon={<LuDownload className="size-4" />}>CSV</Button>
              <Button variant="secondary" icon={<LuDownload className="size-4" />}>PDF</Button>
            </div>
          </Card>

          {sel === "employees" || sel === "discounts" || sel === "shifts" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Team sales" value={formatMoney(52834)} change={6} hint="vs previous 7 days" />
                <StatCard label="Approvals given" value="9" hint="discounts, refunds, drawer" />
                <StatCard label="Net cash variance" value={<span className="text-rose-600">−{formatMoney(15)}</span>} hint="across 12 shifts" />
              </div>
              <Card padded={false}>
                <DataTable
                  rows={employees.filter((e) => e.roleId !== "r_inventory" && e.roleId !== "r_accountant")}
                  rowKey={(e) => e.id}
                  columns={[
                    { key: "e", header: "Employee", cell: (e) => <div className="flex items-center gap-2.5"><Avatar name={e.fullName} color={e.avatarColor} size="sm" /><span className="font-medium text-ink-900">{e.fullName}</span></div> },
                    { key: "s", header: "Sales", align: "right", cell: (e) => ({ e1: 3, e2: 18, e3: 41, e4: 33 } as Record<string, number>)[e.id] ?? 0 },
                    { key: "r", header: "Revenue", align: "right", cell: (e) => formatMoney(({ e1: 1820, e2: 8140, e3: 21420, e4: 18950 } as Record<string, number>)[e.id] ?? 0) },
                    { key: "a", header: "Avg sale", align: "right", hideBelow: "md", cell: () => formatMoney(498.2) },
                    { key: "d", header: "Discounts", align: "right", hideBelow: "md", cell: (e) => formatMoney(({ e3: 55, e4: 300 } as Record<string, number>)[e.id] ?? 0) },
                    { key: "f", header: "Refunds", align: "right", hideBelow: "lg", cell: (e) => (e.id === "e2" ? formatMoney(349) : "—") },
                    { key: "v", header: "Cash variance", align: "right", cell: (e) => ({ e3: <span className="text-emerald-700">+GH₵ 5.00</span>, e4: <span className="text-rose-600">−GH₵ 20.00</span> } as Record<string, ReactNode>)[e.id] ?? "—" },
                  ]}
                />
              </Card>
            </>
          ) : sel === "pnl" ? (
            <Card>
              <CardHeader title="Profit & loss" description="Revenue excludes tax collected. Expenses are shown separately — not subtracted from sales." />
              <dl className="max-w-lg space-y-2 text-sm">
                {[["Gross sales", 54220], ["Refunds", -1149], ["Discounts", -355], ["Net revenue", 52716, true], ["Cost of goods sold", -40880], ["Gross profit", 11836, true], ["Operating expenses", -5980], ["Net profit", 5856, true]].map(([l, v, b]) => (
                  <div key={l as string} className={cn("flex justify-between", b && "border-t border-ink-200 pt-2 font-semibold text-ink-900")}><dt>{l}</dt><dd className="num">{(v as number) < 0 ? `−${formatMoney(-(v as number))}` : formatMoney(v as number)}</dd></div>
                ))}
              </dl>
            </Card>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Net revenue" value={formatMoney(52716)} change={6} />
                <StatCard label="Transactions" value="166" />
                <StatCard label="Average sale" value={formatMoney(317.57)} />
              </div>
              <Card><CardHeader title="Daily" /><BarChart data={trend} /></Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
