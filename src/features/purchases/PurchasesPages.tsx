import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuClipboardList, LuPackageCheck, LuPlus, LuTruck } from "react-icons/lu";
import { actions, useBranches, useProducts, usePurchaseOrders, useSuppliers } from "@/services/api";
import {
  Badge, Button, Card, CardHeader, DataState, DataTable, DL, Drawer, EmptyState, FilterBar, Input, Modal, PageHeader, SearchInput, Select, Tabs,
  Textarea, useToast,
} from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { PurchaseOrder } from "@/types";

const poStatus: Record<PurchaseOrder["status"], [string, "neutral" | "info" | "warning" | "success" | "danger"]> = {
  draft: ["Draft", "neutral"], ordered: ["Ordered", "info"], partially_received: ["Part received", "warning"], received: ["Received", "success"], cancelled: ["Cancelled", "danger"],
};
const poTotal = (po: PurchaseOrder) => po.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

export function SuppliersPage() {
  const q = useSuppliers();
  const [adding, setAdding] = useState(false);
  const toast = useToast();
  return (
    <>
      <PageHeader title="Suppliers" description="Who you buy stock from." actions={<Button icon={<LuPlus className="size-4" />} onClick={() => setAdding(true)}>Add supplier</Button>} />
      <Card padded={false}>
        <FilterBar><SearchInput className="sm:w-72" placeholder="Search suppliers" /></FilterBar>
        <DataState query={q} empty={<EmptyState icon={<LuTruck className="size-7" />} title="No suppliers yet" action={<Button onClick={() => setAdding(true)}>Add supplier</Button>} />}>
          {(data) => (
            <DataTable rows={data} rowKey={(s) => s.id} columns={[
              { key: "n", header: "Supplier", cell: (s) => <><p className="font-medium text-ink-900">{s.name}</p><p className="text-xs text-ink-500">{s.address}</p></> },
              { key: "p", header: "Phone", cell: (s) => s.phone },
              { key: "e", header: "Email", hideBelow: "md", cell: (s) => s.email ?? "—" },
              { key: "o", header: "Open orders", align: "right", cell: (s) => s.openOrders },
              { key: "b", header: "Owed", align: "right", cell: (s) => (s.balance ? <span className="font-medium text-rose-700">{formatMoney(s.balance)}</span> : "—") },
            ]} />
          )}
        </DataState>
      </Card>
      <Drawer open={adding} onClose={() => setAdding(false)} title="Add supplier" footer={<><Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={async () => { await actions.saveSupplier({}); toast({ tone: "success", title: "Supplier saved" }); setAdding(false); }}>Save</Button></>}>
        <div className="space-y-4"><Input label="Name" required autoFocus /><Input label="Phone" required /><Input label="Email" type="email" /><Input label="Address" /><Textarea label="Notes" rows={2} /></div>
      </Drawer>
    </>
  );
}

export function PurchasesPage() {
  const q = usePurchaseOrders();
  const suppliers = useSuppliers().data;
  const navigate = useNavigate();
  const [tab, setTab] = useState<"all" | PurchaseOrder["status"]>("all");
  const [creating, setCreating] = useState(false);
  const rows = q.data.filter((p) => tab === "all" || p.status === tab);
  return (
    <>
      <PageHeader title="Purchase orders" description="Order stock from suppliers and receive it into inventory." actions={<Button icon={<LuPlus className="size-4" />} onClick={() => setCreating(true)}>New purchase order</Button>} />
      <Card padded={false}>
        <Tabs className="px-4" value={tab} onChange={setTab} tabs={[{ value: "all", label: "All" }, { value: "draft", label: "Draft" }, { value: "ordered", label: "Ordered" }, { value: "partially_received", label: "Part received" }, { value: "received", label: "Received" }]} />
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuClipboardList className="size-7" />} title="No purchase orders" description="Create one to restock from a supplier." />}>
          {(data) => (
            <DataTable rows={data} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/purchases/${p.id}`)} columns={[
              { key: "n", header: "PO", cell: (p) => <span className="font-medium text-ink-900">{p.number}</span> },
              { key: "s", header: "Supplier", cell: (p) => suppliers.find((s) => s.id === p.supplierId)?.name },
              { key: "d", header: "Created", hideBelow: "md", cell: (p) => formatDate(p.createdAt) },
              { key: "st", header: "Status", cell: (p) => <Badge tone={poStatus[p.status][1]}>{poStatus[p.status][0]}</Badge> },
              { key: "t", header: "Total", align: "right", cell: (p) => formatMoney(poTotal(p)) },
            ]} />
          )}
        </DataState>
      </Card>
      <NewPoModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewPoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const suppliers = useSuppliers().data;
  const products = useProducts().data.filter((p) => p.unit !== "job");
  const branches = useBranches().data;
  const toast = useToast();
  return (
    <Modal open={open} onClose={onClose} title="New purchase order" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" onClick={() => { toast({ tone: "success", title: "Draft saved" }); onClose(); }}>Save draft</Button><Button onClick={async () => { await actions.savePurchaseOrder({}); toast({ tone: "success", title: "Order placed" }); onClose(); }}>Place order</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Supplier">{suppliers.map((s) => <option key={s.id}>{s.name}</option>)}</Select>
          <Select label="Deliver to">{branches.map((b) => <option key={b.id}>{b.name}</option>)}</Select>
          <Input label="Expected date" type="date" />
        </div>
        <div className="rounded-lg ring-1 ring-ink-200">
          {[0, 1].map((i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_120px] gap-3 border-b border-ink-100 p-3 last:border-0">
              <Select aria-label="Product">{products.map((p) => <option key={p.id}>{p.name}</option>)}</Select>
              <Input aria-label="Quantity" defaultValue="10" inputMode="numeric" />
              <Input aria-label="Unit cost" prefix="GH₵" defaultValue={String(products[i]?.costPrice ?? 0)} inputMode="decimal" />
            </div>
          ))}
        </div>
        <Button size="sm" variant="ghost" icon={<LuPlus className="size-4" />}>Add line</Button>
      </div>
    </Modal>
  );
}

export function PurchaseDetailPage() {
  const { id } = useParams();
  const po = usePurchaseOrders().data.find((p) => p.id === id);
  const suppliers = useSuppliers().data;
  const products = useProducts().data;
  const branches = useBranches().data;
  const toast = useToast();
  const [receiving, setReceiving] = useState(false);
  if (!po) return <EmptyState title="Purchase order not found" action={<Link to="/purchases" className="text-sm text-brand-700">Back</Link>} />;
  const canReceive = po.status === "ordered" || po.status === "partially_received";
  return (
    <>
      <Link to="/purchases" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><LuArrowLeft className="size-4" /> Purchase orders</Link>
      <PageHeader
        title={<span className="flex items-center gap-3">{po.number} <Badge tone={poStatus[po.status][1]}>{poStatus[po.status][0]}</Badge></span>}
        description={suppliers.find((s) => s.id === po.supplierId)?.name}
        actions={<>{po.status === "draft" && <Button>Place order</Button>}{canReceive && <Button icon={<LuPackageCheck className="size-4" />} onClick={() => setReceiving(true)}>Receive stock</Button>}{po.status !== "received" && <Button variant="ghost">Cancel order</Button>}</>}
      />
      <Card className="mb-6"><DL cols={3} items={[{ label: "Created", value: formatDate(po.createdAt) }, { label: "Deliver to", value: branches.find((b) => b.id === po.branchId)?.name }, { label: "Total", value: formatMoney(poTotal(po)) }]} /></Card>
      <Card padded={false}>
        <DataTable rows={po.lines} rowKey={(l) => l.productId} columns={[
          { key: "p", header: "Product", cell: (l) => products.find((p) => p.id === l.productId)?.name },
          { key: "q", header: "Ordered", align: "right", cell: (l) => l.quantity },
          { key: "r", header: "Received", align: "right", cell: (l) => <span className={l.received >= l.quantity ? "text-emerald-700" : ""}>{l.received}</span> },
          { key: "c", header: "Unit cost", align: "right", cell: (l) => formatMoney(l.unitCost) },
          { key: "t", header: "Line total", align: "right", cell: (l) => formatMoney(l.unitCost * l.quantity) },
        ]} />
      </Card>
      <Modal open={receiving} onClose={() => setReceiving(false)} title="Receive stock" description="Enter what actually arrived. Stock is added to the branch." size="md" footer={<><Button variant="secondary" onClick={() => setReceiving(false)}>Cancel</Button><Button onClick={async () => { await actions.receivePurchaseOrder(po.id, []); toast({ tone: "success", title: "Stock received" }); setReceiving(false); }}>Receive</Button></>}>
        <CardHeader title="Lines" />
        <div className="space-y-3">
          {po.lines.map((l) => (
            <div key={l.productId} className="grid grid-cols-[1fr_100px] items-center gap-3">
              <div><p className="text-sm font-medium">{products.find((p) => p.id === l.productId)?.name}</p><p className="text-xs text-ink-500">{l.quantity - l.received} outstanding</p></div>
              <Input aria-label="Received now" inputMode="numeric" defaultValue={String(l.quantity - l.received)} />
            </div>
          ))}
          <Input label="Supplier invoice / reference" />
        </div>
      </Modal>
    </>
  );
}
