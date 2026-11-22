import { useEffect, useState } from "react";
import { useSession } from "@/app/session";
import { LuPaperclip, LuPlus, LuWallet } from "react-icons/lu";
import { actions, useBranches, useEmployees, useExpenses } from "@/services/api";
import {
  Badge, Button, Card, ConfirmDialog, DataState, DataTable, Drawer, EmptyState, FilterBar, Input, PageHeader, Select, StatCard, Textarea, useToast,
} from "@/components/ui";
import { formatDate, formatMoney, methodLabel } from "@/lib/format";
import type { Expense } from "@/types";

const CATS = ["Rent", "Utilities", "Transport", "Supplies", "Internet", "Salaries", "Repairs", "Marketing", "Other"];

export function ExpensesPage() {
  const q = useExpenses();
  const employees = useEmployees().data;
  const branches = useBranches().data;
  const toast = useToast();
  const { branch: curBranch, can } = useSession();
  const [cat, setCat] = useState("");
  const [branchF, setBranchF] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const rows = q.data.filter((e) => (!cat || e.category === cat) && (!branchF || e.branchId === branchF) && (!month || e.date.slice(0, 7) === month));
  const recorded = rows.filter((e) => e.status === "recorded");
  const total = recorded.reduce((s, e) => s + e.amount, 0);
  const byCat = Object.entries(recorded.reduce<Record<string, number>>((a, e) => ({ ...a, [e.category]: (a[e.category] ?? 0) + e.amount }), {})).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <PageHeader title="Expenses" description="Money going out of the business. Shown in reports as operating expenses - not subtracted from sales." actions={<Button icon={<LuPlus className="size-4" />} onClick={() => setAdding(true)}>Record expense</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={month ? "Selected month" : "All time"} value={formatMoney(total)} icon={<LuWallet className="size-4" />} />
        <StatCard label="Largest category" value={byCat[0]?.[0] ?? "-"} hint={byCat[0] ? formatMoney(byCat[0][1]) : undefined} />
        <StatCard label="Voided" value={rows.filter((e) => e.status === "voided").length} hint="kept for audit" />
      </div>
      <Card padded={false}>
        <FilterBar>
          <Select aria-label="Category" className="sm:w-48" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</Select>
          <Select aria-label="Branch" className="sm:w-48" value={branchF} onChange={(e) => setBranchF(e.target.value)}><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          <input type="month" aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-lg border-0 px-3 text-sm ring-1 ring-ink-200" />
        </FilterBar>
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuWallet className="size-7" />} title="No expenses recorded" action={<Button onClick={() => setAdding(true)}>Record expense</Button>} />}>
          {(data) => (
            <DataTable rows={data} rowKey={(e) => e.id} columns={[
              { key: "d", header: "Date", cell: (e) => formatDate(e.date) },
              { key: "c", header: "Category", cell: (e) => <Badge>{e.category}</Badge> },
              { key: "x", header: "Description", cell: (e) => <span className={e.status === "voided" ? "text-ink-400 line-through" : ""}>{e.description} {e.hasAttachment && <LuPaperclip className="ml-1 inline size-3.5 text-ink-400" aria-label="Has receipt" />}</span> },
              { key: "m", header: "Paid by", hideBelow: "md", cell: (e) => methodLabel[e.method] },
              { key: "a", header: "Recorded by", hideBelow: "lg", cell: (e) => employees.find((x) => x.id === e.actorId)?.fullName },
              { key: "t", header: "Amount", align: "right", cell: (e) => <span className={e.status === "voided" ? "text-ink-400 line-through" : "font-medium"}>{formatMoney(e.amount)}</span> },
              { key: "v", header: "", align: "right", cell: (e) => (e.status === "voided" ? <Badge>Voided</Badge> : can("expenses.void") && <Button size="sm" variant="ghost" onClick={() => setVoiding(e)}>Void</Button>) },
            ]} />
          )}
        </DataState>
      </Card>
      <ExpenseDrawer open={adding} onClose={() => setAdding(false)} defaultBranch={curBranch.id} branches={branches} />
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} title="Void this expense?" message="It stays on record, marked as voided, and is excluded from reports." requireReason confirmLabel="Void" onConfirm={async (r) => { if (!voiding) return; try { await actions.voidExpense(voiding.id, r ?? ""); toast({ tone: "success", title: "Expense voided" }); } catch (e) { toast({ tone: "error", title: (e as Error).message }); } }} />
    </>
  );
}

function ExpenseDrawer({ open, onClose, defaultBranch, branches }: { open: boolean; onClose: () => void; defaultBranch: string; branches: { id: string; name: string }[] }) {
  const toast = useToast();
  const [f, setF] = useState({ amount: "", category: CATS[0]!, date: new Date().toISOString().slice(0, 10), method: "cash" as Expense["method"], branchId: defaultBranch, description: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ amount: "", category: CATS[0]!, date: new Date().toISOString().slice(0, 10), method: "cash", branchId: defaultBranch, description: "" }); }, [open, defaultBranch]);
  return (
    <Drawer open={open} onClose={onClose} title="Record expense" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!(Number(f.amount) > 0) || f.description.trim().length < 3 || !f.branchId} onClick={async () => {
      setBusy(true);
      try { await actions.saveExpense({ ...f, amount: Number(f.amount) }); toast({ tone: "success", title: "Expense recorded" }); onClose(); }
      catch (e) { toast({ tone: "error", title: "Couldn't save", body: (e as Error).message }); }
      finally { setBusy(false); }
    }}>Save</Button></>}>
      <div className="space-y-4">
        <Input label="Amount" prefix="GH₵" inputMode="decimal" required autoFocus value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Category" required value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</Select>
          <Input label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </div>
        <Select label="Paid by" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as Expense["method"] })}>{Object.entries(methodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select label="Branch" value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        <Textarea label="Description" required rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </div>
    </Drawer>
  );
}
