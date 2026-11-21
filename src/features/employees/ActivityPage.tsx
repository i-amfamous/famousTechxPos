import { useMemo, useState } from "react";
import { LuDownload } from "react-icons/lu";
import { useActivity, useBranches, useEmployees, useTerminals } from "@/services/api";
import { Button, Card, DataState, EmptyState, FilterBar, PageHeader, SearchInput, Select } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { ActivityEvent } from "@/types";
import { ActivityList } from "./EmployeeDetailPage";
import { activityCategoryLabel } from "./shared";

export function ActivityPage() {
  const q = useActivity();
  const employees = useEmployees().data;
  const branches = useBranches().data;
  const terminals = useTerminals().data;
  const [emp, setEmp] = useState("");
  const [cat, setCat] = useState("");
  const [branch, setBranch] = useState("");
  const [till, setTill] = useState("");
  const [search, setSearch] = useState("");

  const rows = q.data.filter(
    (a) => (!emp || a.actorId === emp) && (!cat || a.category === cat) && (!branch || a.branchId === branch) && (!till || a.terminalId === till) && (a.action + a.detail).toLowerCase().includes(search.toLowerCase()),
  );
  const grouped = useMemo(() => {
    const m = new Map<string, ActivityEvent[]>();
    rows.forEach((a) => { const d = formatDate(a.createdAt); m.set(d, [...(m.get(d) ?? []), a]); });
    return [...m.entries()];
  }, [rows]);

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every sign-in, sale, refund, approval, stock change and permission change — who did it, where and when."
        actions={<Button variant="secondary" icon={<LuDownload className="size-4" />}>Export CSV</Button>}
      />
      <Card padded={false}>
        <FilterBar>
          <SearchInput className="sm:w-64" placeholder="Search activity" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select aria-label="Employee" className="sm:w-48" value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </Select>
          <Select aria-label="Type" className="sm:w-40" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(activityCategoryLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select aria-label="Branch" className="sm:w-48" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select aria-label="Till" className="sm:w-36" value={till} onChange={(e) => setTill(e.target.value)}>
            <option value="">All tills</option>
            {terminals.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <input type="date" aria-label="Date" className="h-10 rounded-lg border-0 px-3 text-sm ring-1 ring-ink-200" />
        </FilterBar>
        <DataState query={{ ...q, data: rows }} empty={<EmptyState title="No activity found" description="Try widening the filters." />}>
          {() => (
            <div className="divide-y divide-ink-100">
              {grouped.map(([day, events]) => (
                <section key={day} className="px-3 py-3">
                  <h3 className="sticky top-16 z-10 bg-white px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{day}</h3>
                  <ActivityList events={events} showActor={(id) => employees.find((e) => e.id === id)} />
                </section>
              ))}
            </div>
          )}
        </DataState>
      </Card>
    </>
  );
}
