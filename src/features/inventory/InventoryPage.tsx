import { useEffect, useState } from "react";
import { LuArrowLeftRight, LuBoxes, LuClipboardCheck, LuMinus, LuPackagePlus, LuPlus, LuScanBarcode, LuSlidersHorizontal, LuTrash2, LuTriangleAlert } from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useEmployees, useProducts, useStockMovements, useTransfers } from "@/services/api";
import {
  Badge, Button, Callout, Card, DataState, DataTable, EmptyState, FilterBar, Input, Modal, PageHeader, SearchInput, Segmented, Select, StatCard,
  Tabs, Textarea, useToast, type Column,
} from "@/components/ui";
import { useScan } from "@/features/scanner/ScannerProvider";
import { ScanButton } from "@/features/scanner/ScanControls";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { Product, StockMovement } from "@/types";
import { ProductDrawer, ProductThumb, StockBadge } from "@/features/products/ProductsPage";

const moveLabel: Record<StockMovement["type"], [string, "success" | "danger" | "warning" | "info" | "neutral" | "brand"]> = {
  sale: ["Sale", "neutral"], receipt: ["Received", "success"], return: ["Return", "info"], adjustment: ["Adjustment", "warning"],
  transfer_out: ["Transfer out", "brand"], transfer_in: ["Transfer in", "brand"], damaged: ["Damaged", "danger"],
};

export function InventoryPage() {
  const q = useProducts();
  const moves = useStockMovements();
  const transfers = useTransfers();
  const employees = useEmployees().data;
  const { branch, branches, can } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<"levels" | "movements" | "transfers">("levels");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [search, setSearch] = useState("");
  const [adjust, setAdjust] = useState<Product | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [scanMode, setScanMode] = useState<"receive" | "count" | null>(null);
  const stocked = q.data.filter((p) => p.unit !== "job" && p.status === "active");
  const rows = stocked.filter((p) => (filter === "all" || (filter === "out" ? p.stock <= 0 : p.stock > 0 && p.stock <= p.reorderLevel)) && (p.name + p.sku + (p.barcode ?? "")).toLowerCase().includes(search.toLowerCase()));
  const value = stocked.reduce((s, p) => s + Math.max(0, p.stock) * p.costPrice, 0);

  // Scanning on this page (outside the scan window) jumps to the product's adjust dialog.
  useScan((code) => {
    const hit = q.data.find((p) => p.barcode === code || p.sku === code);
    if (!hit) throw new Error("Not in your catalogue - use “Scan stock in” to add it");
    setAdjust(hit);
    return `Opened ${hit.name}`;
  }, !scanMode && !adjust);

  const cols: Column<Product>[] = [
    { key: "n", header: "Product", cell: (p) => <div className="flex items-center gap-3"><ProductThumb p={p} className="size-9" /><div><p className="font-medium text-ink-900">{p.name}</p><p className="text-xs text-ink-500">{p.sku}</p></div></div> },
    { key: "s", header: "On hand", align: "right", cell: (p) => <StockBadge p={p} /> },
    { key: "r", header: "Reorder at", align: "right", hideBelow: "sm", cell: (p) => p.reorderLevel },
    { key: "v", header: "Stock value", align: "right", hideBelow: "md", cell: (p) => formatMoney(Math.max(0, p.stock) * p.costPrice) },
    { key: "a", header: <span className="sr-only">Actions</span>, align: "right", cell: (p) => can("inventory.adjust") && <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setAdjust(p); }}>Adjust</Button> },
  ];
  const bname = (id: string) => branches.find((b) => b.id === id)?.name ?? "-";

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`Stock at ${branch.name}. Scan items to receive or count them.`}
        actions={<>
          {can("inventory.transfer") && branches.length > 1 && <Button variant="secondary" icon={<LuArrowLeftRight className="size-4" />} onClick={() => setTransfer(true)}>New transfer</Button>}
          {can("inventory.adjust") && <Button variant="secondary" icon={<LuClipboardCheck className="size-4" />} onClick={() => setScanMode("count")}>Stock count</Button>}
          {can("inventory.adjust") && <Button variant="accent" icon={<LuScanBarcode className="size-4" />} onClick={() => setScanMode("receive")}>Scan stock in</Button>}
        </>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Stock value (at cost)" value={formatMoney(value)} icon={<LuBoxes className="size-4" />} />
        <StatCard label="Low stock" value={stocked.filter((p) => p.stock > 0 && p.stock <= p.reorderLevel).length} hint="at or below reorder level" icon={<LuTriangleAlert className="size-4" />} />
        <StatCard label="Out of stock" value={stocked.filter((p) => p.stock <= 0).length} hint="can't be sold" />
      </div>
      <Card padded={false}>
        <Tabs className="px-4" value={tab} onChange={setTab} tabs={[{ value: "levels", label: "Stock levels" }, { value: "movements", label: "Movements" }, { value: "transfers", label: "Transfers", count: transfers.data.filter((t) => t.status === "dispatched").length || undefined }]} />
        {tab === "levels" && (
          <>
            <FilterBar>
              <SearchInput className="sm:w-72" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
              <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "low", label: "Low" }, { value: "out", label: "Out" }]} />
            </FilterBar>
            <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuBoxes className="size-7" />} title="Nothing here" description={filter === "all" ? "Scan items in or add products with opening stock." : "Good news - nothing in this list."} />}>
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
                  { key: "p", header: "Product", cell: (m) => q.data.find((p) => p.id === m.productId)?.name ?? "-" },
                  { key: "t", header: "Type", cell: (m) => <Badge tone={moveLabel[m.type][1]}>{moveLabel[m.type][0]}</Badge> },
                  { key: "q", header: "Change", align: "right", cell: (m) => <span className={m.delta > 0 ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>{m.delta > 0 ? "+" : ""}{m.delta}</span> },
                  { key: "r", header: "Reason", hideBelow: "md", cell: (m) => <span className="text-ink-500">{m.reason ?? "-"}</span> },
                  { key: "a", header: "By", hideBelow: "sm", cell: (m) => employees.find((e) => e.id === m.actorId)?.fullName ?? "-" },
                ]}
              />
            )}
          </DataState>
        )}
        {tab === "transfers" && (
          <DataState query={transfers} empty={<EmptyState icon={<LuArrowLeftRight className="size-7" />} title="No transfers yet" description="Move stock between branches with “New transfer”." />}>
            {(data) => (
              <DataTable
                rows={data}
                rowKey={(t) => t.id}
                columns={[
                  { key: "i", header: "Transfer", cell: (t) => <span className="font-medium text-ink-900">{t.number}</span> },
                  { key: "f", header: "From → To", cell: (t) => `${bname(t.fromBranchId)} → ${bname(t.toBranchId)}` },
                  { key: "n", header: "Items", align: "right", cell: (t) => t.items.reduce((s, i) => s + i.quantity, 0) },
                  { key: "s", header: "Status", cell: (t) => <Badge tone={t.status === "received" ? "success" : t.status === "cancelled" ? "neutral" : "info"}>{t.status === "received" ? "Received" : t.status === "cancelled" ? "Cancelled" : "In transit"}</Badge> },
                  { key: "a", header: "", align: "right", cell: (t) => t.status === "dispatched" && t.toBranchId === branch.id && can("inventory.transfer") && (
                    <Button size="sm" variant="secondary" onClick={async () => { try { await actions.receiveTransfer(t.id); toast({ tone: "success", title: `${t.number} received` }); } catch (e) { toast({ tone: "error", title: (e as Error).message }); } }}>Receive</Button>
                  ) },
                ]}
              />
            )}
          </DataState>
        )}
      </Card>
      <AdjustModal product={adjust} onClose={() => setAdjust(null)} />
      <TransferModal open={transfer} onClose={() => setTransfer(false)} />
      <ScanStockModal mode={scanMode} onClose={() => setScanMode(null)} />
    </>
  );
}

/* ═════════════ Scan stock in / stock count ═════════════ */
interface ScanLine { product: Product; quantity: number; unitCost: string }

function ScanStockModal({ mode, onClose }: { mode: "receive" | "count" | null; onClose: () => void }) {
  const products = useProducts().data;
  const { branch } = useSession();
  const toast = useToast();
  const [lines, setLines] = useState<ScanLine[]>([]);
  const [reference, setReference] = useState("");
  const [unknown, setUnknown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  useEffect(() => { if (mode) { setLines([]); setReference(""); setUnknown(null); } }, [mode]);

  const addCode = (code: string) => {
    const p = products.find((x) => x.barcode === code || x.sku.toLowerCase() === code.toLowerCase() || x.variants?.some((v) => v.barcode === code));
    if (!p) { setUnknown(code); return `New barcode ${code} - add the product`; }
    if (p.unit === "job") throw new Error(`${p.name} is a service (no stock)`);
    setLines((ls) => {
      const ex = ls.find((l) => l.product.id === p.id);
      return ex ? ls.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l)) : [{ product: p, quantity: 1, unitCost: String(p.costPrice) }, ...ls];
    });
    return `+1 ${p.name}`;
  };
  useScan(addCode, !!mode && !unknown);

  const submit = async () => {
    setBusy(true);
    let done = 0;
    try {
      for (const l of lines) {
        if (mode === "receive") await actions.receiveStock(branch.id, l.product.id, l.quantity, l.unitCost === "" ? null : Number(l.unitCost), reference || "Scanned in");
        else await actions.adjustStock(branch.id, l.product.id, "set", l.quantity, `Stock count${reference ? `: ${reference}` : ""}`);
        done++;
      }
      toast({ tone: "success", title: mode === "receive" ? `Received ${lines.reduce((s, l) => s + l.quantity, 0)} items` : `Counted ${lines.length} products`, body: branch.name });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: `Stopped after ${done} of ${lines.length}`, body: (e as Error).message });
      setLines((ls) => ls.slice(done));
    } finally {
      setBusy(false);
    }
  };

  const units = lines.reduce((s, l) => s + l.quantity, 0);
  return (
    <>
      <Modal
        open={!!mode && !unknown}
        onClose={onClose}
        size="lg"
        title={mode === "receive" ? "Scan stock in" : "Stock count"}
        description={mode === "receive" ? `Scan each item as it arrives at ${branch.name}. Every scan adds 1.` : `Scan every item on the shelf. Quantities you save replace what the system shows at ${branch.name}.`}
        footer={<>
          <span className="mr-auto text-sm text-ink-500">{lines.length} product{lines.length === 1 ? "" : "s"} · {units} unit{units === 1 ? "" : "s"}</span>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!lines.length} loading={busy} onClick={submit}>{mode === "receive" ? "Receive stock" : "Save count"}</Button>
        </>}
      >
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-200">
          <LuScanBarcode className="size-5 text-brand-600" />
          <span className="flex-1 text-sm text-ink-700">Ready - scan with a USB/Bluetooth scanner, camera or phone.</span>
          <ScanButton size="sm" label="Camera / phone" />
        </div>
        <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { try { const r = addCode(manual.trim()); toast({ tone: "success", title: r }); } catch (er) { toast({ tone: "error", title: (er as Error).message }); } setManual(""); } }}>
          <Input className="flex-1" placeholder="Type a barcode or SKU" value={manual} onChange={(e) => setManual(e.target.value)} data-scan="native" aria-label="Barcode or SKU" />
          <Button type="submit" variant="secondary">Add</Button>
        </form>
        {mode === "receive" && <Input className="mb-4" label="Supplier invoice / reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />}
        {lines.length === 0 ? (
          <EmptyState icon={<LuScanBarcode className="size-7" />} title="Nothing scanned yet" description="Scanned items appear here. Unknown barcodes open the “Add product” form." className="py-8" />
        ) : (
          <ul className="divide-y divide-ink-100 rounded-xl ring-1 ring-ink-200">
            {lines.map((l) => (
              <li key={l.product.id} className="flex items-center gap-3 px-3 py-2.5">
                <ProductThumb p={l.product} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{l.product.name}</p>
                  <p className="text-xs text-ink-500">{mode === "receive" ? `On hand ${l.product.stock} → ${l.product.stock + l.quantity}` : `System shows ${l.product.stock}${l.quantity !== l.product.stock ? ` · difference ${l.quantity - l.product.stock > 0 ? "+" : ""}${l.quantity - l.product.stock}` : " · matches"}`}</p>
                </div>
                {mode === "receive" && (
                  <input aria-label="Unit cost" inputMode="decimal" value={l.unitCost} onChange={(e) => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, unitCost: e.target.value.replace(/[^\d.]/g, "") } : x)))}
                    className="num hidden h-9 w-24 rounded-lg border-0 px-2 text-right text-sm ring-1 ring-ink-200 sm:block" title="Unit cost (GH₵)" />
                )}
                <div className="flex items-center rounded-lg ring-1 ring-ink-200">
                  <button aria-label="Decrease" onClick={() => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, quantity: Math.max(mode === "count" ? 0 : 1, x.quantity - 1) } : x)))} className="flex size-9 items-center justify-center text-ink-600 hover:bg-ink-50"><LuMinus className="size-4" /></button>
                  <input aria-label="Quantity" inputMode="numeric" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, quantity: Number(e.target.value.replace(/\D/g, "")) || 0 } : x)))} className="num w-12 border-0 p-0 text-center text-sm font-semibold focus:ring-0" />
                  <button aria-label="Increase" onClick={() => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, quantity: x.quantity + 1 } : x)))} className="flex size-9 items-center justify-center text-ink-600 hover:bg-ink-50"><LuPlus className="size-4" /></button>
                </div>
                <button aria-label={`Remove ${l.product.name}`} className="text-ink-400 hover:text-rose-600" onClick={() => setLines((ls) => ls.filter((x) => x.product.id !== l.product.id))}><LuTrash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
        {mode === "count" && lines.length > 0 && <div className="mt-4"><Callout tone="info">Only scanned products are updated. Your name and the before/after quantities are recorded.</Callout></div>}
      </Modal>
      {/* Unknown barcode → add product (prefilled from online lookup) */}
      <ProductDrawer
        product={unknown ? "new" : null}
        initialBarcode={unknown}
        onClose={() => setUnknown(null)}
        onCreated={() => toast({ tone: "info", title: "Product added", body: "Scan it again to add it to this list." })}
      />
    </>
  );
}

function AdjustModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const toast = useToast();
  const { branch } = useSession();
  const [kind, setKind] = useState<"add" | "remove" | "set">("remove");
  const [n, setN] = useState("");
  const [reason, setReason] = useState("Damaged");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (product) { setN(""); setNote(""); setKind("remove"); setReason("Damaged"); } }, [product]);
  if (!product) return null;
  const v = Number(n) || 0;
  const after = kind === "add" ? product.stock + v : kind === "remove" ? product.stock - v : v;
  return (
    <Modal
      open
      onClose={onClose}
      title="Adjust stock"
      description={`${product.name} · ${branch.name}`}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={n === "" || after < 0 || note.trim().length < 3} onClick={async () => {
        setBusy(true);
        try { await actions.adjustStock(branch.id, product.id, kind, v, `${reason}: ${note}`); toast({ tone: "success", title: "Stock adjusted", body: `${product.stock} → ${after}` }); onClose(); }
        catch (e) { toast({ tone: "error", title: "Couldn't adjust stock", body: (e as Error).message }); }
        finally { setBusy(false); }
      }}>Save adjustment</Button></>}
    >
      <div className="space-y-4">
        <Segmented value={kind} onChange={setKind} options={[{ value: "add", label: "Add" }, { value: "remove", label: "Remove" }, { value: "set", label: "Set to" }]} />
        <Input label="Quantity" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} autoFocus />
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option>Damaged</option><option>Expired</option><option>Lost / stolen</option><option>Stock count correction</option><option>Other</option>
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
  const { branch, branches } = useSession();
  const products = useProducts().data.filter((p) => p.unit !== "job" && p.status === "active" && p.stock > 0);
  const toast = useToast();
  const others = branches.filter((b) => b.status === "active" && b.id !== branch.id);
  const [to, setTo] = useState("");
  const [items, setItems] = useState<{ productId: string; quantity: string }[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTo(others[0]?.id ?? ""); setItems([{ productId: products[0]?.id ?? "", quantity: "1" }]); setNote(""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useScan((code) => {
    const p = products.find((x) => x.barcode === code || x.sku === code);
    if (!p) throw new Error("Not in stock here");
    setItems((it) => (it.some((i) => i.productId === p.id) ? it.map((i) => (i.productId === p.id ? { ...i, quantity: String(Number(i.quantity) + 1) } : i)) : [...it.filter((i) => i.productId), { productId: p.id, quantity: "1" }]));
    return `+1 ${p.name}`;
  }, open);
  const invalid = !to || items.some((i) => !i.productId || !(Number(i.quantity) > 0) || Number(i.quantity) > (products.find((p) => p.id === i.productId)?.stock ?? 0));
  return (
    <Modal open={open} onClose={onClose} title="New stock transfer" description={`From ${branch.name}. Stock leaves now and arrives when the other branch receives it.`} size="md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={invalid} loading={busy} onClick={async () => {
        setBusy(true);
        try { await actions.createTransfer(branch.id, to, items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })), note); toast({ tone: "success", title: "Transfer dispatched", body: "The receiving branch must confirm receipt." }); onClose(); }
        catch (e) { toast({ tone: "error", title: (e as Error).message }); }
        finally { setBusy(false); }
      }}>Dispatch</Button></>}>
      <div className="space-y-4">
        <Select label="To branch" value={to} onChange={(e) => setTo(e.target.value)}>{others.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
        {items.map((it, i) => {
          const p = products.find((x) => x.id === it.productId);
          return (
            <div key={i} className="grid grid-cols-[1fr_90px_auto] items-end gap-3">
              <Select label={i === 0 ? "Product" : undefined} aria-label="Product" value={it.productId} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock})</option>)}
              </Select>
              <Input label={i === 0 ? "Qty" : undefined} aria-label="Quantity" inputMode="numeric" value={it.quantity} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: e.target.value.replace(/\D/g, "") } : x)))} error={p && Number(it.quantity) > p.stock ? `Max ${p.stock}` : undefined} />
              <button aria-label="Remove line" className="mb-2.5 text-ink-400 hover:text-rose-600" onClick={() => setItems(items.filter((_, j) => j !== i))}><LuTrash2 className="size-4" /></button>
            </div>
          );
        })}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" icon={<LuPackagePlus className="size-4" />} onClick={() => setItems([...items, { productId: products[0]?.id ?? "", quantity: "1" }])}>Add product</Button>
          <ScanButton size="sm" label="Scan items" />
        </div>
        <Textarea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        {others.length === 0 && <Callout tone="info">Add another branch first.</Callout>}
      </div>
    </Modal>
  );
}
