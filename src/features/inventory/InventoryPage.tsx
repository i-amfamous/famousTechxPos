import { useState } from "react";
import { LuArrowLeftRight, LuBoxes, LuPackageCheck, LuSlidersHorizontal, LuTriangleAlert } from "react-icons/lu";
import { actions, useBranches, useEmployees, useProducts, useStockMovements } from "@/services/api";
import {
  Badge, Button, Callout, Card, DataState, DataTable, EmptyState, FilterBar, Input, Modal, PageHeader, SearchInput, Segmented, Select, StatCard,
  Tabs, Textarea, useToast, type Column,
} from "@/components/ui";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Product, StockMovement } from "@/types";
import { StockBadge } from "@/features/products/ProductsPage";

const moveLabel: Record<StockMovement["type"], [string, "success" | "danger" | "warning" | "info" | "neutral" | "brand"]> = {
  sale: ["Sale", "neutral"], receipt: ["Received", "success"], return: ["Return", "info"], adjustment: ["Adjustment", "warning"],
  transfer_out: ["Transfer out", "brand"], transfer_in: ["Transfer in", "brand"], damaged: ["Damaged", "danger"],
};

export function InventoryPage() {
  const q = useProducts();
  const moves = useStockMovements();
  const employees = useEmployees().data;
  const [tab, setTab] = useState<"levels" | "movements" | "transfers">("levels");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [search, setSearch] = useState("");
  const [adjust, setAdjust] = useState<Product | null>(null);
  const [transfer, setTransfer] = useState(false);
  const stocked = q.data.filter((p) => p.unit !== "job" && p.status === "active");
  const rows = stocked.filter((p) => (filter === "all" || (filter === "out" ? p.stock <= 0 : p.stock > 0 && p.stock <= p.reorderLevel)) && p.name.toLowerCase().includes(search.toLowerCase()));
  const value = stocked.reduce((s, p) => s + p.stock * p.costPrice, 0);

  const cols: Column<Product>[] = [
    { key: "n", header: "Product", cell: (p) => <><p className="font-medium text-ink-900">{p.name}</p><p className="text-xs text-ink-500">{p.sku}</p></> },
    { key: "s", header: "On hand", align: "right", cell: (p) => <StockBadge p={p} /> },
    { key: "r", header: "Reorder at", align: "right", hideBelow: "sm", cell: (p) => p.reorderLevel },
    { key: "v", header: "Stock value", align: "right", hideBelow: "md", cell: (p) => formatMoney(p.stock * p.costPrice) },
    { key: "a", header: <span className="sr-only">Actions</span>, align: "right", cell: (p) => <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setAdjust(p); }}>Adjust</Button> },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock on hand, every movement and transfers between branches."
        actions={<>
          <Button variant="secondary" icon={<LuArrowLeftRight className="size-4" />} onClick={() => setTransfer(true)}>New transfer</Button>
          <Button variant="secondary" icon={<LuPackageCheck className="size-4" />}>Stock count</Button>
        </>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Stock value (at cost)" value={formatMoney(value)} icon={<LuBoxes className="size-4" />} />
        <StatCard label="Low stock" value={stocked.filter((p) => p.stock > 0 && p.stock <= p.reorderLevel).length} hint="at or below reorder level" icon={<LuTriangleAlert className="size-4" />} />
        <StatCard label="Out of stock" value={stocked.filter((p) => p.stock <= 0).length} hint="can't be sold" />
      </div>
      <Card padded={false}>
        <Tabs className="px-4" value={tab} onChange={setTab} tabs={[{ value: "levels", label: "Stock levels" }, { value: "movements", label: "Movements" }, { value: "transfers", label: "Transfers" }]} />
        {tab === "levels" && (
          <>
            <FilterBar>
              <SearchInput className="sm:w-72" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "low", label: "Low" }, { value: "out", label: "Out" }]} />
            </FilterBar>
            <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuBoxes className="size-7" />} title="Nothing here" description={filter === "all" ? "Add products with opening stock to start tracking." : "Good news — nothing in this list."} />}>
              {(data) => <DataTable columns={cols} rows={data} rowKey={(p) => p.id} />}
            </DataState>
          </>
        )}
        {tab === "movements" && (
          <DataState query={moves} empty={<EmptyState title="No stock movements yet" />}>
            {(data) => (
              <DataTable
                rows={data}
                rowKey={(m) => m.id}
                columns={[
                  { key: "d", header: "When", cell: (m) => formatDateTime(m.createdAt) },
                  { key: "p", header: "Product", cell: (m) => q.data.find((p) => p.id === m.productId)?.name },
                  { key: "t", header: "Type", cell: (m) => <Badge tone={moveLabel[m.type][1]}>{moveLabel[m.type][0]}</Badge> },
                  { key: "q", header: "Change", align: "right", cell: (m) => <span className={m.delta > 0 ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>{m.delta > 0 ? "+" : ""}{m.delta}</span> },
                  { key: "r", header: "Reason", hideBelow: "md", cell: (m) => <span className="text-ink-500">{m.reason ?? "—"}</span> },
                  { key: "a", header: "By", hideBelow: "sm", cell: (m) => employees.find((e) => e.id === m.actorId)?.fullName },
                ]}
              />
            )}
          </DataState>
        )}
        {tab === "transfers" && (
          <DataTable
            rows={[{ id: "TR-0008", to: "Kumasi – Adum", items: 3, status: "dispatched" }, { id: "TR-0007", to: "Kumasi – Adum", items: 1, status: "received" }]}
            rowKey={(t) => t.id}
            columns={[
              { key: "i", header: "Transfer", cell: (t) => <span className="font-medium text-ink-900">{t.id}</span> },
              { key: "f", header: "From → To", cell: (t) => `Accra – Osu → ${t.to}` },
              { key: "n", header: "Items", align: "right", cell: (t) => t.items },
              { key: "s", header: "Status", cell: (t) => <Badge tone={t.status === "received" ? "success" : "info"}>{t.status === "received" ? "Received" : "In transit"}</Badge> },
              { key: "a", header: "", align: "right", cell: (t) => t.status === "dispatched" && <Button size="sm" variant="secondary">Receive</Button> },
            ]}
          />
        )}
      </Card>
      <AdjustModal product={adjust} onClose={() => setAdjust(null)} />
      <TransferModal open={transfer} onClose={() => setTransfer(false)} />
    </>
  );
}

function AdjustModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<"add" | "remove" | "set">("remove");
  const [n, setN] = useState("");
  const [reason, setReason] = useState("damaged");
  const [note, setNote] = useState("");
  if (!product) return null;
  const v = Number(n) || 0;
  const after = kind === "add" ? product.stock + v : kind === "remove" ? product.stock - v : v;
  return (
    <Modal
      open
      onClose={onClose}
      title="Adjust stock"
      description={product.name}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!n || after < 0 || note.trim().length < 3} onClick={async () => { await actions.adjustStock(product.id, after - product.stock, `${reason}: ${note}`); toast({ tone: "success", title: "Stock adjusted", body: `${product.stock} → ${after}` }); onClose(); }}>Save adjustment</Button></>}
    >
      <div className="space-y-4">
        <Segmented value={kind} onChange={setKind} options={[{ value: "add", label: "Add" }, { value: "remove", label: "Remove" }, { value: "set", label: "Set to" }]} />
        <Input label="Quantity" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} autoFocus />
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="damaged">Damaged</option><option value="expired">Expired</option><option value="lost">Lost / stolen</option><option value="count">Stock count correction</option><option value="other">Other</option>
        </Select>
        <Textarea label="Note" required rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened?" />
        <div className="flex items-center justify-between rounded-lg bg-ink-50 px-4 py-3 text-sm">
          <span className="text-ink-500">On hand</span>
          <span className="num font-semibold">{product.stock} → <span className={after < 0 ? "text-rose-600" : "text-ink-900"}>{after}</span></span>
        </div>
        {after < 0 && <Callout tone="danger">Stock can't go below zero.</Callout>}
        <p className="flex items-center gap-2 text-xs text-ink-500"><LuSlidersHorizontal className="size-3.5" /> Your name, the reason and before/after are recorded.</p>
      </div>
    </Modal>
  );
}

function TransferModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const branches = useBranches().data.filter((b) => b.status === "active");
  const products = useProducts().data.filter((p) => p.unit !== "job" && p.status === "active");
  const toast = useToast();
  return (
    <Modal open={open} onClose={onClose} title="New stock transfer" size="md" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => { toast({ tone: "success", title: "Transfer dispatched", body: "The receiving branch must confirm receipt." }); onClose(); }}>Dispatch</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="From" defaultValue={branches[0]?.id}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
          <Select label="To" defaultValue={branches[1]?.id}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        </div>
        <div className="grid grid-cols-[1fr_100px] items-end gap-3">
          <Select label="Product">{products.map((p) => <option key={p.id}>{p.name} ({p.stock})</option>)}</Select>
          <Input label="Qty" inputMode="numeric" defaultValue="1" />
        </div>
        <Button size="sm" variant="ghost">+ Add another product</Button>
        <Textarea label="Note" rows={2} placeholder="Optional" />
      </div>
    </Modal>
  );
}
