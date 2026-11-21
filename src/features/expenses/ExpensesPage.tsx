import { useState } from "react";
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
  const [cat, setCat] = useState("");
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const rows = q.data.filter((e) => !cat || e.category === cat);
  const total = q.data.filter((e) => e.status === "recorded").reduce((s, e) => s + e.amount, 0);
  return (
    <>
      <PageHeader title="Expenses" description="Money going out of the business. Shown in reports as operating expenses — not subtracted from sales." actions={<Button icon={<LuPlus className="size-4" />} onClick={() => setAdding(true)}>Record expense</Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="This month" value={formatMoney(total)} icon={<LuWallet className="size-4" />} />
        <StatCard label="Largest category" value="Rent" hint={formatMoney(4500)} />
        <StatCard label="Voided" value={q.data.filter((e) => e.status === "voided").length} hint="kept for audit" />
      </div>
      <Card padded={false}>
        <FilterBar>
          <Select aria-label="Category" className="sm:w-48" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{CATS.map((c) => <option key={c}>{c}</option>)}</Select>
          <Select aria-label="Branch" className="sm:w-48"><option>All branches</option>{branches.map((b) => <option key={b.id}>{b.name}</option>)}</Select>
          <input type="month" aria-label="Month" className="h-10 rounded-lg border-0 px-3 text-sm ring-1 ring-ink-200" />
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
              { key: "v", header: "", align: "right", cell: (e) => (e.status === "voided" ? <Badge>Voided</Badge> : <Button size="sm" variant="ghost" onClick={() => setVoiding(e)}>Void</Button>) },
            ]} />
          )}
        </DataState>
      </Card>
      <Drawer open={adding} onClose={() => setAdding(false)} title="Record expense" footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={async () => { await actions.saveExpense({}); toast({ tone: "success", title: "Expense recorded" }); setAdding(false); }}>Save</Button></>}>
        <div className="space-y-4">
          <Input label="Amount" prefix="GH₵" inputMode="decimal" required autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" required>{CATS.map((c) => <option key={c}>{c}</option>)}</Select>
            <Input label="Date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <Select label="Paid by">{Object.entries(methodLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select label="Branch">{branches.map((b) => <option key={b.id}>{b.name}</option>)}</Select>
          <Textarea label="Description" required rows={2} />
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-ink-300 p-4 text-sm"><LuPaperclip className="size-5 text-ink-400" /><span className="flex-1 text-ink-500">Attach receipt photo or PDF</span><Button size="sm" variant="secondary">Upload</Button></div>
        </div>
      </Drawer>
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} title="Void this expense?" message="It stays on record, marked as voided, and is excluded from reports." requireReason confirmLabel="Void" onConfirm={() => toast({ tone: "success", title: "Expense voided" })} />
    </>
  );
}
