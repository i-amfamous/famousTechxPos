import { useState } from "react";
import { LuClock, LuPrinter, LuShieldCheck } from "react-icons/lu";
import { useEmployees, useShiftSummary, useShifts, useTerminals } from "@/services/api";
import {
  Avatar, Badge, Button, Card, DataState, DataTable, DL, Drawer, EmptyState, FilterBar, PageHeader, Select, StatCard, Tabs, type Column,
} from "@/components/ui";
import { formatDateTime, formatMoney, formatTime, methodLabel } from "@/lib/format";
import type { PaymentMethod, Shift } from "@/types";

export function VarianceBadge({ s }: { s: Shift }) {
  if (s.status === "open" || s.countedCash === undefined) return <span className="text-xs text-ink-400">—</span>;
  const v = s.countedCash - s.expectedCash;
  return <Badge tone={v === 0 ? "success" : Math.abs(v) > 10 ? "danger" : "warning"}>{v === 0 ? "Balanced" : `${v > 0 ? "+" : "−"}${formatMoney(Math.abs(v))}`}</Badge>;
}

export function ShiftsPage() {
  const q = useShifts();
  const employees = useEmployees().data;
  const terminals = useTerminals().data;
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [emp, setEmp] = useState("");
  const [open, setOpen] = useState<Shift | null>(null);
  const emp_ = (id: string) => employees.find((e) => e.id === id);
  const till = (id: string) => terminals.find((t) => t.id === id)?.name ?? "—";
  const [days, setDays] = useState("7");
  const rows = q.data.filter((s) => s.status === tab && (!emp || s.employeeId === emp) && (tab === "open" || Date.now() - new Date(s.openedAt).getTime() < Number(days) * 864e5));
  const openShifts = q.data.filter((s) => s.status === "open");

  const cols: Column<Shift>[] = [
    { key: "emp", header: "Employee", cell: (s) => { const e = emp_(s.employeeId); return e ? <div className="flex items-center gap-2.5"><Avatar name={e.fullName} color={e.avatarColor} size="sm" /><span className="font-medium text-ink-900">{e.fullName}</span></div> : "—"; } },
    { key: "till", header: "Till", cell: (s) => till(s.terminalId) },
    { key: "opened", header: "Opened", cell: (s) => formatDateTime(s.openedAt) },
    { key: "closed", header: "Closed", hideBelow: "md", cell: (s) => (s.closedAt ? formatTime(s.closedAt) : <Badge tone="success" dot>Open</Badge>) },
    { key: "sales", header: "Sales", align: "right", cell: (s) => <span>{formatMoney(s.salesTotal)}<span className="block text-xs text-ink-400">{s.salesCount} sales</span></span> },
    { key: "expected", header: "Expected cash", align: "right", hideBelow: "lg", cell: (s) => formatMoney(s.expectedCash) },
    { key: "counted", header: "Counted", align: "right", hideBelow: "lg", cell: (s) => (s.countedCash !== undefined ? formatMoney(s.countedCash) : "—") },
    { key: "var", header: "Variance", align: "right", cell: (s) => <VarianceBadge s={s} /> },
  ];

  return (
    <>
      <PageHeader title="Shifts & cash" description="Who opened each till, how much they sold and whether the drawer balanced." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open shifts now" value={openShifts.length} icon={<LuClock className="size-4" />} hint={openShifts.map((s) => emp_(s.employeeId)?.displayName).join(", ")} />
        <StatCard label="Cash expected in drawers" value={formatMoney(openShifts.reduce((a, s) => a + s.expectedCash, 0))} />
        {(() => {
          const week = q.data.filter((s) => s.status === "closed" && s.closedAt && Date.now() - new Date(s.closedAt).getTime() < 7 * 864e5);
          const v = week.reduce((a, s) => a + (s.countedCash ?? 0) - s.expectedCash, 0);
          return <StatCard label="Variance (last 7 days)" value={<span className={v < 0 ? "text-rose-600" : v > 0 ? "text-emerald-700" : ""}>{v > 0 ? "+" : v < 0 ? "−" : ""}{formatMoney(Math.abs(v))}</span>} hint={`${week.filter((s) => s.approvedBy).length} shift(s) needed approval`} />;
        })()}
      </div>
      <Card padded={false}>
        <Tabs className="px-4" value={tab} onChange={setTab} tabs={[{ value: "open", label: "Open", count: openShifts.length }, { value: "closed", label: "Closed" }]} />
        <FilterBar>
          <Select aria-label="Employee" className="sm:w-56" value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </Select>
          <Select aria-label="Period" className="sm:w-44" value={days} onChange={(e) => setDays(e.target.value)}><option value="1">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></Select>
        </FilterBar>
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuClock className="size-7" />} title={tab === "open" ? "No open shifts" : "No closed shifts in this period"} description="Shifts are opened from the POS lock screen." />}>
          {(data) => <DataTable columns={cols} rows={data} rowKey={(s) => s.id} onRowClick={setOpen} />}
        </DataState>
      </Card>
      <ShiftDrawer shift={open} onClose={() => setOpen(null)} />
    </>
  );
}

function ShiftDrawer({ shift, onClose }: { shift: Shift | null; onClose: () => void }) {
  const employees = useEmployees().data;
  const moves = useShiftSummary(shift?.id ?? null).data?.movements ?? [];
  const name = (id?: string) => employees.find((e) => e.id === id)?.fullName ?? "—";
  return (
    <Drawer
      open={!!shift}
      onClose={onClose}
      width="lg"
      title={shift?.status === "open" ? "Shift in progress" : "Z report"}
      description={shift ? `${name(shift.employeeId)} · ${formatDateTime(shift.openedAt)}` : undefined}
      footer={<Button variant="secondary" icon={<LuPrinter className="size-4" />} onClick={() => window.print()}>Print</Button>}
    >
      {shift && (
        <div className="space-y-6">
          <DL cols={3} items={[
            { label: "Opened", value: formatDateTime(shift.openedAt) },
            { label: "Closed", value: shift.closedAt ? formatDateTime(shift.closedAt) : "Still open" },
            { label: "Sales", value: `${shift.salesCount} · ${formatMoney(shift.salesTotal)}` },
          ]} />
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">By payment method</h3>
            <div className="rounded-lg ring-1 ring-ink-200">
              {(Object.keys(shift.byMethod) as PaymentMethod[]).map((m) => (
                <div key={m} className="flex justify-between border-b border-ink-100 px-4 py-2.5 text-sm last:border-0"><span>{methodLabel[m]}</span><span className="num">{formatMoney(shift.byMethod[m])}</span></div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Cash drawer</h3>
            <div className="space-y-1.5 rounded-lg bg-ink-50 p-4 text-sm">
              <div className="flex justify-between"><span>Opening float</span><span className="num">{formatMoney(shift.openingFloat)}</span></div>
              {moves.map((m) => (
                <div key={m.id} className="flex justify-between text-ink-600"><span>{m.type === "paid_in" ? "Cash in" : m.type === "paid_out" ? "Cash out" : m.type === "drop" ? "Drop to safe" : "No sale"} · {m.reason} <span className="text-xs text-ink-400">({name(m.actorId)}, {formatTime(m.createdAt)})</span></span><span className="num">{m.type === "paid_in" ? "+" : "−"}{formatMoney(m.amount)}</span></div>
              ))}
              <div className="flex justify-between border-t border-ink-200 pt-2 font-semibold"><span>Expected</span><span className="num">{formatMoney(shift.expectedCash)}</span></div>
              {shift.countedCash !== undefined && <div className="flex justify-between font-semibold"><span>Counted</span><span className="num">{formatMoney(shift.countedCash)}</span></div>}
              <div className="flex justify-between"><span>Variance</span><VarianceBadge s={shift} /></div>
            </div>
          </div>
          {shift.approvedBy && <p className="flex items-center gap-2 text-sm text-ink-600"><LuShieldCheck className="size-4 text-violet-600" /> Variance approved by {name(shift.approvedBy)}</p>}
          {shift.note && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">“{shift.note}”</div>}
        </div>
      )}
    </Drawer>
  );
}
