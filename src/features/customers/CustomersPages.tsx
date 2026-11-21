import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuPlus, LuUsers } from "react-icons/lu";
import { actions, useCustomers, useSales } from "@/services/api";
import {
  Avatar, Button, Card, CardHeader, DataState, DataTable, DL, Drawer, EmptyState, FilterBar, Input, PageHeader, Pager, SearchInput, StatCard,
  Textarea, useToast,
} from "@/components/ui";
import { formatDateTime, formatMoney, timeAgo } from "@/lib/format";
import { SaleStatusBadge } from "@/features/sales/SalesPages";

export function CustomersPage() {
  const q = useCustomers();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const rows = q.data.filter((c) => (c.name + c.phone + (c.email ?? "")).toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader title="Customers" description="People you've sold to, their history and total spend." actions={<Button icon={<LuPlus className="size-4" />} onClick={() => setAdding(true)}>Add customer</Button>} />
      <Card padded={false}>
        <FilterBar><SearchInput className="sm:w-80" placeholder="Name, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} /></FilterBar>
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuUsers className="size-7" />} title={q.data.length ? "No customers match" : "No customers yet"} description="Customers can also be added at checkout." />}>
          {(data) => (
            <DataTable
              rows={data}
              rowKey={(c) => c.id}
              onRowClick={(c) => navigate(`/customers/${c.id}`)}
              footer={<Pager total={data.length} />}
              columns={[
                { key: "n", header: "Customer", cell: (c) => <div className="flex items-center gap-3"><Avatar name={c.name} color="bg-ink-500" size="sm" /><div><p className="font-medium text-ink-900">{c.name}</p><p className="text-xs text-ink-500">{c.email ?? ""}</p></div></div> },
                { key: "p", header: "Phone", cell: (c) => c.phone },
                { key: "v", header: "Visits", align: "right", hideBelow: "sm", cell: (c) => c.visits },
                { key: "l", header: "Last visit", hideBelow: "md", cell: (c) => (c.lastVisit ? timeAgo(c.lastVisit) : "—") },
                { key: "s", header: "Total spend", align: "right", cell: (c) => <span className="font-medium">{formatMoney(c.totalSpend)}</span> },
              ]}
            />
          )}
        </DataState>
      </Card>
      <CustomerDrawer open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function CustomerDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  return (
    <Drawer open={open} onClose={onClose} title="Add customer" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={async () => { await actions.saveCustomer({}); toast({ tone: "success", title: "Customer saved" }); onClose(); }}>Save</Button></>}>
      <div className="space-y-4">
        <Input label="Full name" required autoFocus />
        <Input label="Phone" required inputMode="tel" />
        <Input label="Email" type="email" />
        <Input label="Address" />
        <Textarea label="Notes" rows={2} />
      </div>
    </Drawer>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const c = useCustomers().data.find((x) => x.id === id);
  const sales = useSales().data.filter((s) => s.customerId === id);
  const navigate = useNavigate();
  if (!c) return <EmptyState title="Customer not found" action={<Link to="/customers" className="text-sm text-brand-700">Back</Link>} />;
  return (
    <>
      <Link to="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><LuArrowLeft className="size-4" /> Customers</Link>
      <PageHeader title={c.name} description={c.phone} actions={<><Button variant="secondary">Edit</Button><Button variant="ghost">Archive</Button></>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Total spend" value={formatMoney(c.totalSpend)} />
        <StatCard label="Visits" value={c.visits} />
        <StatCard label="Average spend" value={formatMoney(c.totalSpend / Math.max(1, c.visits))} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="Details" /><DL cols={1} items={[{ label: "Phone", value: c.phone }, { label: "Email", value: c.email ?? "—" }, { label: "Address", value: c.address ?? "—" }, { label: "Notes", value: c.notes ?? "—" }]} /></Card>
        <Card padded={false} className="lg:col-span-2">
          <div className="px-5 pt-5"><h3 className="font-semibold">Purchase history</h3></div>
          <div className="mt-3">
            {sales.length ? (
              <DataTable rows={sales} rowKey={(s) => s.id} onRowClick={(s) => navigate(`/sales/${s.id}`)} columns={[
                { key: "r", header: "Receipt", cell: (s) => <span className="font-medium">{s.receiptNumber}</span> },
                { key: "d", header: "Date", cell: (s) => formatDateTime(s.createdAt) },
                { key: "s", header: "Status", cell: (s) => <SaleStatusBadge status={s.status} /> },
                { key: "t", header: "Total", align: "right", cell: (s) => formatMoney(s.total) },
              ]} />
            ) : <EmptyState title="No purchases in this period" className="py-8" />}
          </div>
        </Card>
      </div>
    </>
  );
}
