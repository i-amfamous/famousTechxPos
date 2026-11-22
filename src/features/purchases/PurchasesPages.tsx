import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LuArrowLeft, LuClipboardList, LuPackageCheck, LuPlus, LuTrash2, LuTruck } from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useProducts, usePurchaseOrders, useSuppliers } from "@/services/api";
import {
  Badge, Button, Card, DataState, DataTable, DL, Drawer, EmptyState, FilterBar, Input, Modal, PageHeader, SearchInput, Select, Tabs,
  Textarea, useToast,
} from "@/components/ui";
import { useScan } from "@/features/scanner/ScannerProvider";
import { ScanButton } from "@/features/scanner/ScanControls";
import { formatDate, formatMoney } from "@/lib/format";
import type { PurchaseOrder, Supplier } from "@/types";

const poStatus: Record<PurchaseOrder["status"], [string, "neutral" | "info" | "warning" | "success" | "danger"]> = {
  draft: ["Draft", "neutral"], ordered: ["Ordered", "info"], partially_received: ["Part received", "warning"], received: ["Received", "success"], cancelled: ["Cancelled", "danger"],
};
const poTotal = (po: PurchaseOrder) => po.lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

export function SuppliersPage() {
  const q = useSuppliers();
  const [edit, setEdit] = useState<Supplier | "new" | null>(null);
  const [search, setSearch] = useState("");
  const rows = q.data.filter((s) => (s.name + s.phone + (s.email ?? "")).toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <PageHeader title="Suppliers" description="Who you buy stock from." actions={<Button icon={<LuPlus className="size-4" />} onClick={() => setEdit("new")}>Add supplier</Button>} />
      <Card padded={false}>
        <FilterBar><SearchInput className="sm:w-72" placeholder="Search suppliers" value={search} onChange={(e) => setSearch(e.target.value)} /></FilterBar>
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuTruck className="size-7" />} title={q.data.length ? "No suppliers match" : "No suppliers yet"} action={!q.data.length && <Button onClick={() => setEdit("new")}>Add supplier</Button>} />}>
          {(data) => (
            <DataTable rows={data} rowKey={(s) => s.id} onRowClick={(row) => setEdit(row)} columns={[
              { key: "n", header: "Supplier", cell: (s) => <><p className="font-medium text-ink-900">{s.name}</p><p className="text-xs text-ink-500">{s.address}</p></> },
              { key: "p", header: "Phone", cell: (s) => s.phone || "-" },
              { key: "e", header: "Email", hideBelow: "md", cell: (s) => s.email ?? "-" },
              { key: "o", header: "Open orders", align: "right", cell: (s) => s.openOrders },
              { key: "b", header: "Owed", align: "right", cell: (s) => (s.balance ? <span className="font-medium text-rose-700">{formatMoney(s.balance)}</span> : "-") },
            ]} />
          )}
        </DataState>
      </Card>
      <SupplierDrawer supplier={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function SupplierDrawer({ supplier, onClose }: { supplier: Supplier | "new" | null; onClose: () => void }) {
  const toast = useToast();
  const s = supplier && supplier !== "new" ? supplier : null;
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (supplier) setF({ name: s?.name ?? "", phone: s?.phone ?? "", email: s?.email ?? "", address: s?.address ?? "", notes: "" }); }, [supplier]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer open={!!supplier} onClose={onClose} title={s ? "Edit supplier" : "Add supplier"} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={f.name.trim().length < 2} onClick={async () => {
      setBusy(true);
      try { await actions.saveSupplier({ id: s?.id, ...f }); toast({ tone: "success", title: "Supplier saved" }); onClose(); }
      catch (e) { toast({ tone: "error", title: "Couldn't save", body: (e as Error).message }); }
      finally { setBusy(false); }
    }}>Save</Button></>}>
      <div className="space-y-4">
        <Input label="Name" required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input label="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input label="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <Textarea label="Notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
    </Drawer>
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
      <PageHeader title="Purchase orders" description="Order stock from suppliers and receive it into inventory." actions={<Button icon={<LuPlus className="size-4" />} onClick={() => setCreating(true)} disabled={!suppliers.length}>New purchase order</Button>} />
      <Card padded={false}>
        <Tabs className="px-4" value={tab} onChange={setTab} tabs={[{ value: "all", label: "All" }, { value: "draft", label: "Draft" }, { value: "ordered", label: "Ordered" }, { value: "partially_received", label: "Part received" }, { value: "received", label: "Received" }]} />
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuClipboardList className="size-7" />} title="No purchase orders" description={suppliers.length ? "Create one to restock from a supplier." : "Add a supplier first."} />}>
          {(data) => (
            <DataTable rows={data} rowKey={(p) => p.id} onRowClick={(p) => navigate(`/purchases/${p.id}`)} columns={[
              { key: "n", header: "PO", cell: (p) => <span className="font-medium text-ink-900">{p.number}</span> },
              { key: "s", header: "Supplier", cell: (p) => suppliers.find((s) => s.id === p.supplierId)?.name ?? "-" },
              { key: "d", header: "Created", hideBelow: "md", cell: (p) => formatDate(p.createdAt) },
              { key: "st", header: "Status", cell: (p) => <Badge tone={poStatus[p.status][1]}>{poStatus[p.status][0]}</Badge> },
              { key: "t", header: "Total", align: "right", cell: (p) => formatMoney(poTotal(p)) },
            ]} />
          )}
        </DataState>
      </Card>
      <NewPoModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/purchases/${id}`)} />
    </>
  );
}

function NewPoModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const suppliers = useSuppliers().data;
  const products = useProducts().data.filter((p) => p.unit !== "job" && p.status === "active");
  const { branch, branches } = useSession();
  const toast = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [expected, setExpected] = useState("");
  const [lines, setLines] = useState<{ productId: string; quantity: string; unitCost: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setSupplierId(suppliers[0]?.id ?? "");
    setBranchId(branch.id);
    setExpected("");
    setLines([]);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const addProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setLines((ls) => (ls.some((l) => l.productId === id) ? ls.map((l) => (l.productId === id ? { ...l, quantity: String(Number(l.quantity) + 1) } : l)) : [...ls, { productId: id, quantity: "1", unitCost: String(p.costPrice) }]));
  };
  useScan((code) => {
    const p = products.find((x) => x.barcode === code || x.sku === code);
    if (!p) throw new Error("Not in your catalogue - add the product first");
    addProduct(p.id);
    return `Added ${p.name}`;
  }, open);
  const valid = supplierId && branchId && lines.length > 0 && lines.every((l) => Number(l.quantity) > 0 && Number(l.unitCost) >= 0);
  const save = async (place: boolean) => {
    setBusy(true);
    try {
      const id = await actions.savePurchaseOrder({ supplierId, branchId, expectedAt: expected, place, lines: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })) });
      toast({ tone: "success", title: place ? "Order placed" : "Draft saved" });
      onClose();
      onCreated(id);
    } catch (e) {
      toast({ tone: "error", title: "Couldn't save", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const total = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0);
  return (
    <Modal open={open} onClose={onClose} title="New purchase order" size="lg" footer={<><span className="mr-auto text-sm font-medium">Total {formatMoney(total)}</span><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="secondary" loading={busy} disabled={!valid} onClick={() => save(false)}>Save draft</Button><Button loading={busy} disabled={!valid} onClick={() => save(true)}>Place order</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select label="Deliver to" value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.filter((b) => b.status === "active").map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          <Input label="Expected date" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Select aria-label="Add product" className="flex-1" value="" onChange={(e) => addProduct(e.target.value)}>
            <option value="">+ Add a product…</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock} in stock)</option>)}
          </Select>
          <ScanButton label="Scan" />
        </div>
        {lines.length === 0 ? <EmptyState title="No lines yet" description="Add products from the list or scan their barcodes." className="py-6" /> : (
          <div className="rounded-lg ring-1 ring-ink-200">
            {lines.map((l, i) => (
              <div key={l.productId} className="grid grid-cols-[1fr_80px_120px_auto] items-center gap-3 border-b border-ink-100 p-3 last:border-0">
                <span className="truncate text-sm font-medium">{products.find((p) => p.id === l.productId)?.name}</span>
                <Input aria-label="Quantity" inputMode="numeric" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/\D/g, "") } : x)))} />
                <Input aria-label="Unit cost" prefix="GH₵" inputMode="decimal" value={l.unitCost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitCost: e.target.value.replace(/[^\d.]/g, "") } : x)))} />
                <button aria-label="Remove line" className="text-ink-400 hover:text-rose-600" onClick={() => setLines(lines.filter((_, j) => j !== i))}><LuTrash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function PurchaseDetailPage() {
  const { id } = useParams();
  const po = usePurchaseOrders().data.find((p) => p.id === id);
  const suppliers = useSuppliers().data;
  const products = useProducts().data;
  const { branches } = useSession();
  const toast = useToast();
  const [receiving, setReceiving] = useState(false);
  const [recv, setRecv] = useState<Record<string, string>>({});
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  useScan((code) => {
    if (!po) return;
    const p = products.find((x) => x.barcode === code || x.sku === code);
    const line = po.lines.find((l) => l.productId === p?.id);
    if (!line?.id) throw new Error("That product isn't on this order");
    setReceiving(true);
    setRecv((r) => ({ ...r, [line.id!]: String(Math.min(line.quantity - line.received, Number(r[line.id!] ?? 0) + 1)) }));
    return `+1 ${p!.name}`;
  }, !!po && (po.status === "ordered" || po.status === "partially_received"));
  if (!po) return <EmptyState title="Purchase order not found" action={<Link to="/purchases" className="text-sm text-brand-700">Back</Link>} />;
  const canReceive = po.status === "ordered" || po.status === "partially_received";
  const setStatus = async (s: "ordered" | "cancelled") => {
    try { await actions.setPurchaseOrderStatus(po.id, s); toast({ tone: "success", title: s === "ordered" ? "Order placed" : "Order cancelled" }); }
    catch (e) { toast({ tone: "error", title: (e as Error).message }); }
  };
  return (
    <>
      <Link to="/purchases" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><LuArrowLeft className="size-4" /> Purchase orders</Link>
      <PageHeader
        title={<span className="flex items-center gap-3">{po.number} <Badge tone={poStatus[po.status][1]}>{poStatus[po.status][0]}</Badge></span>}
        description={suppliers.find((s) => s.id === po.supplierId)?.name}
        actions={<>
          {po.status === "draft" && <Button onClick={() => setStatus("ordered")}>Place order</Button>}
          {canReceive && <Button icon={<LuPackageCheck className="size-4" />} onClick={() => { setRecv(Object.fromEntries(po.lines.map((l) => [l.id ?? l.productId, String(l.quantity - l.received)]))); setReceiving(true); }}>Receive stock</Button>}
          {(po.status === "draft" || po.status === "ordered") && <Button variant="ghost" onClick={() => setStatus("cancelled")}>Cancel order</Button>}
        </>}
      />
      <Card className="mb-6"><DL cols={3} items={[{ label: "Created", value: formatDate(po.createdAt) }, { label: "Deliver to", value: branches.find((b) => b.id === po.branchId)?.name ?? "-" }, { label: "Total", value: formatMoney(poTotal(po)) }]} /></Card>
      <Card padded={false}>
        <DataTable rows={po.lines} rowKey={(l) => l.id ?? l.productId} columns={[
          { key: "p", header: "Product", cell: (l) => products.find((p) => p.id === l.productId)?.name ?? "-" },
          { key: "q", header: "Ordered", align: "right", cell: (l) => l.quantity },
          { key: "r", header: "Received", align: "right", cell: (l) => <span className={l.received >= l.quantity ? "text-emerald-700" : ""}>{l.received}</span> },
          { key: "c", header: "Unit cost", align: "right", cell: (l) => formatMoney(l.unitCost) },
          { key: "t", header: "Line total", align: "right", cell: (l) => formatMoney(l.unitCost * l.quantity) },
        ]} />
      </Card>
      <Modal open={receiving} onClose={() => setReceiving(false)} title="Receive stock" description="Enter (or scan) what actually arrived. Stock is added to the branch." size="md"
        footer={<><ScanButton size="sm" label="Scan" /><span className="flex-1" /><Button variant="secondary" onClick={() => setReceiving(false)}>Cancel</Button><Button loading={busy} disabled={!Object.values(recv).some((v) => Number(v) > 0)} onClick={async () => {
          setBusy(true);
          try {
            await actions.receivePurchaseOrder(po.id, po.lines.filter((l) => Number(recv[l.id ?? l.productId]) > 0).map((l) => ({ itemId: l.id ?? "", quantity: Number(recv[l.id ?? l.productId]) })), reference);
            toast({ tone: "success", title: "Stock received" });
            setReceiving(false);
          } catch (e) { toast({ tone: "error", title: "Couldn't receive", body: (e as Error).message }); }
          finally { setBusy(false); }
        }}>Receive</Button></>}>
        <div className="space-y-3">
          {po.lines.map((l) => {
            const k = l.id ?? l.productId;
            const left = l.quantity - l.received;
            return (
              <div key={k} className="grid grid-cols-[1fr_100px] items-center gap-3">
                <div><p className="text-sm font-medium">{products.find((p) => p.id === l.productId)?.name}</p><p className="text-xs text-ink-500">{left} outstanding</p></div>
                <Input aria-label="Received now" inputMode="numeric" value={recv[k] ?? ""} disabled={left <= 0} onChange={(e) => setRecv({ ...recv, [k]: String(Math.min(left, Number(e.target.value.replace(/\D/g, "")) || 0)) })} />
              </div>
            );
          })}
          <Input label="Supplier invoice / reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
