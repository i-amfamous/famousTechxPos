import { useEffect, useMemo, useState } from "react";
import {
  LuArchive, LuArchiveRestore, LuDownload, LuFileText, LuGlobe, LuPackage, LuPackageCheck, LuPlus, LuScanBarcode, LuSparkles, LuX,
} from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useCategories, useProducts } from "@/services/api";
import {
  Badge, Button, Callout, Card, DataState, DataTable, Drawer, EmptyState, FilterBar, Input, PageHeader, Pager, SearchInput, Select, Spinner, Switch, Tabs,
  Textarea, useToast, type Column,
} from "@/components/ui";
import { useScan } from "@/features/scanner/ScannerProvider";
import { ScanButton } from "@/features/scanner/ScanControls";
import { cn, formatMoney } from "@/lib/format";
import { exportCsv as downloadCsv, exportPrintable, type ExportReport } from "@/lib/export";
import type { BarcodeLookup, Product } from "@/types";

export function StockBadge({ p }: { p: Product }) {
  if (p.unit === "job") return <span className="text-xs text-ink-400">Service</span>;
  if (p.stock <= 0) return <Badge tone="danger">Out of stock</Badge>;
  if (p.stock <= p.reorderLevel) return <Badge tone="warning">Low · {p.stock}</Badge>;
  return <span className="num text-ink-700">{p.stock}</span>;
}

/** Product cover with a category-coloured initials fallback if the photo is missing or fails to load. */
export function ProductCover({ p, className }: { p: Pick<Product, "name" | "imageUrl" | "categoryId">; className?: string }) {
  const categories = useCategories().data;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [p.imageUrl]);
  const c = categories.find((x) => x.id === p.categoryId);
  const initials = p.name.split(" ").filter((w) => /[a-z0-9]/i.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  if (p.imageUrl && !broken)
    return <img src={p.imageUrl} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className={cn("size-10 rounded-lg bg-white object-cover ring-1 ring-ink-200", className)} />;
  return <span className={cn("flex size-10 items-center justify-center rounded-lg text-xs font-bold", c?.color ?? "bg-ink-100 text-ink-600", className)}>{initials}</span>;
}

export const ProductThumb = ProductCover;

export function ProductsPage() {
  const q = useProducts();
  const categories = useCategories().data;
  const { can, business } = useSession();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<Product | "new" | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const rows = q.data.filter((p) => p.status === tab && (!cat || p.categoryId === cat) && (p.name + p.sku + (p.barcode ?? "")).toLowerCase().includes(search.toLowerCase()));

  // Scanning on the list opens the product (or a new prefilled form).
  useScan((code) => {
    const hit = q.data.find((p) => p.barcode === code || p.sku === code);
    if (hit) { setEdit(hit); return `Opened ${hit.name}`; }
    setScanned(code);
    setEdit("new");
    return "New product — details being looked up";
  }, !edit);

  const report = (): ExportReport => ({
    filename: "famous-products",
    title: "Product catalogue",
    subtitle: `${rows.length} products${cat ? ` · ${categories.find((c) => c.id === cat)?.name ?? ""}` : ""}`,
    business,
    columns: [
      { key: "name", header: "Product" }, { key: "sku", header: "SKU" }, { key: "barcode", header: "Barcode" },
      { key: "category", header: "Category" }, { key: "cost", header: "Cost", align: "right" },
      { key: "price", header: "Price", align: "right" }, { key: "stock", header: "Stock", align: "right" },
      { key: "reorder", header: "Reorder", align: "right" }, { key: "status", header: "Status" },
    ],
    rows: rows.map((p) => [p.name, p.sku, p.barcode ?? "", categories.find((c) => c.id === p.categoryId)?.name ?? "", p.costPrice, p.sellingPrice, p.stock, p.reorderLevel, p.status]),
    summary: [
      { label: "Products", value: String(rows.length) },
      { label: "Stock value", value: formatMoney(rows.reduce((sum, p) => sum + Math.max(0, p.stock) * p.costPrice, 0)) },
    ],
  });
  const exportCsv = () => downloadCsv(report());
  const exportPdf = () => exportPrintable(report());

  const cols: Column<Product>[] = [
    { key: "n", header: "Product", cell: (p) => <div className="flex items-center gap-3"><ProductThumb p={p} /><div><p className="font-medium text-ink-900">{p.name}</p><p className="text-xs text-ink-500">{p.sku}{p.barcode && ` · ${p.barcode}`}{p.variants && ` · ${p.variants.length} variants`}</p></div></div> },
    { key: "c", header: "Category", hideBelow: "md", cell: (p) => categories.find((c) => c.id === p.categoryId)?.name ?? "—" },
    { key: "cost", header: "Cost", align: "right", hideBelow: "lg", cell: (p) => formatMoney(p.costPrice) },
    { key: "price", header: "Price", align: "right", cell: (p) => <span className="font-medium text-ink-900">{formatMoney(p.sellingPrice)}</span> },
    { key: "m", header: "Margin", align: "right", hideBelow: "lg", cell: (p) => (p.sellingPrice ? `${Math.round(((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100)}%` : "—") },
    { key: "s", header: "Stock", align: "right", cell: (p) => <StockBadge p={p} /> },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue, prices and stock at the selected branch. Scan a barcode anytime to find or add a product."
        actions={<>
          <Button variant="secondary" icon={<LuDownload className="size-4" />} onClick={exportCsv}>Export CSV</Button>
          <Button variant="secondary" icon={<LuFileText className="size-4" />} onClick={exportPdf}>PDF</Button>
          <ScanButton label="Scan to add" />
          {can("products.manage") && <Button icon={<LuPlus className="size-4" />} onClick={() => { setScanned(null); setEdit("new"); }}>Add product</Button>}
        </>}
      />
      <Card padded={false}>
        <Tabs className="px-4" value={tab} onChange={setTab} tabs={[{ value: "active", label: "Active", count: q.data.filter((p) => p.status === "active").length }, { value: "archived", label: "Archived", count: q.data.filter((p) => p.status === "archived").length }]} />
        <FilterBar>
          <SearchInput className="sm:w-72" placeholder="Name, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select aria-label="Category" className="sm:w-48" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FilterBar>
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuPackage className="size-7" />} title={q.data.length ? "No products match" : "Add your first product"} description={q.data.length ? "Try a different search." : "Scan a barcode and we'll fill in the details, or add products by hand."} action={!q.data.length && can("products.manage") && <Button icon={<LuPlus className="size-4" />} onClick={() => setEdit("new")}>Add product</Button>} />}>
          {(data) => <DataTable columns={cols} rows={data} rowKey={(p) => p.id} onRowClick={setEdit} footer={<Pager total={data.length} />} />}
        </DataState>
      </Card>
      <ProductDrawer product={edit} initialBarcode={scanned} onClose={() => { setEdit(null); setScanned(null); }} onOpenExisting={(p) => setEdit(p)} />
    </>
  );
}

/* ═════════════ Add / edit product (with scan-to-fill) ═════════════ */
interface Form {
  name: string; brand: string; description: string; imageUrl: string; categoryId: string; unit: string; sku: string; barcode: string;
  costPrice: string; sellingPrice: string; taxable: boolean; openingStock: string; reorderLevel: string;
  variants: { label: string; sku: string; barcode: string; openingStock: string }[];
}
const blank: Form = { name: "", brand: "", description: "", imageUrl: "", categoryId: "", unit: "pc", sku: "", barcode: "", costPrice: "", sellingPrice: "", taxable: true, openingStock: "", reorderLevel: "", variants: [] };
const skuFrom = (name: string) => name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w.slice(0, 4)).join("-") + "-" + Math.floor(100 + Math.random() * 900);

export function ProductDrawer({ product, initialBarcode, onClose, onOpenExisting, onCreated }: {
  product: Product | "new" | null; initialBarcode?: string | null; onClose: () => void; onOpenExisting?: (p: Product) => void; onCreated?: (id: string) => void;
}) {
  const { branch, can } = useSession();
  const categories = useCategories().data;
  const catalogue = useProducts().data;
  const toast = useToast();
  const p = product && product !== "new" ? product : null;
  const [f, setF] = useState<Form>(blank);
  const [lookup, setLookup] = useState<{ code: string; busy: boolean; result?: BarcodeLookup } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!product) return;
    setErrors({});
    setLookup(null);
    if (p) {
      setF({ name: p.name, brand: p.brand ?? "", description: p.description ?? "", imageUrl: p.imageUrl ?? "", categoryId: p.categoryId, unit: p.unit, sku: p.sku,
        barcode: p.barcode ?? "", costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice), taxable: p.taxable, openingStock: "", reorderLevel: String(p.reorderLevel), variants: [] });
    } else {
      setF({ ...blank, categoryId: categories[0]?.id ?? "" });
      if (initialBarcode) void runLookup(initialBarcode);
    }
  }, [product, initialBarcode]); // eslint-disable-line react-hooks/exhaustive-deps

  const runLookup = async (code: string) => {
    setLookup({ code, busy: true });
    setF((x) => ({ ...x, barcode: code }));
    const r = await actions.lookupBarcode(code, catalogue);
    setLookup({ code, busy: false, result: r });
    if (r.source === "online" && r.online) {
      const o = r.online;
      const cat = o.category ? categories.find((c) => c.name.toLowerCase() === o.category!.toLowerCase() || o.category!.toLowerCase().includes(c.name.toLowerCase())) : undefined;
      setF((x) => ({
        ...x, barcode: code, name: x.name || o.name, brand: x.brand || (o.brand ?? ""), description: x.description || (o.description ?? ""),
        imageUrl: x.imageUrl || (o.images[0] ?? ""), categoryId: cat?.id ?? x.categoryId, sku: x.sku || skuFrom(o.name),
      }));
    }
  };

  // While the form is open, scans fill the barcode (new) and look it up.
  useScan((code) => {
    if (p) { set("barcode", code); return "Barcode updated"; }
    void runLookup(code);
    return "Looking up product…";
  }, !!product);

  const validate = () => {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 2) e.name = "Enter the product name";
    if (!f.sku.trim()) e.sku = "SKU is required";
    if (f.sellingPrice === "" || Number(f.sellingPrice) < 0) e.sellingPrice = "Enter a selling price";
    if (Number(f.costPrice) < 0) e.costPrice = "Can't be negative";
    if (f.barcode && catalogue.some((x) => x.barcode === f.barcode && x.id !== p?.id)) e.barcode = "Another product already uses this barcode";
    if (catalogue.some((x) => x.sku.toLowerCase() === f.sku.trim().toLowerCase() && x.id !== p?.id)) e.sku = "Another product already uses this SKU";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      if (p) {
        await actions.updateProduct(p.id, { name: f.name.trim(), brand: f.brand, description: f.description, imageUrl: f.imageUrl, categoryId: f.categoryId, unit: f.unit, sku: f.sku.trim(),
          barcode: f.barcode.trim(), costPrice: Number(f.costPrice) || 0, sellingPrice: Number(f.sellingPrice), taxable: f.taxable, reorderLevel: Number(f.reorderLevel) || 0 });
        toast({ tone: "success", title: "Product saved", body: f.name });
      } else {
        const id = await actions.createProduct(branch.id, { name: f.name.trim(), sku: f.sku.trim(), barcode: f.barcode.trim(), brand: f.brand, description: f.description,
          imageUrl: f.imageUrl, categoryId: f.categoryId, costPrice: Number(f.costPrice) || 0, sellingPrice: Number(f.sellingPrice), unit: f.unit, taxable: f.taxable,
          reorderLevel: Number(f.reorderLevel) || 0, openingStock: Number(f.openingStock) || 0,
          variants: f.variants.map((v) => ({ label: v.label, sku: v.sku || `${f.sku}-${v.label.toUpperCase().slice(0, 3)}`, barcode: v.barcode, openingStock: Number(v.openingStock) || 0 })) });
        toast({ tone: "success", title: "Product added", body: `${f.name}${Number(f.openingStock) > 0 ? ` · ${f.openingStock} in stock at ${branch.name}` : ""}` });
        onCreated?.(id);
      }
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "Couldn't save product", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    if (!p) return;
    await actions.updateProduct(p.id, { status: p.status === "active" ? "archived" : "active" });
    toast({ tone: "success", title: p.status === "active" ? "Product archived" : "Product restored" });
    onClose();
  };

  const existing = lookup?.result?.source === "catalogue" ? lookup.result.product : undefined;
  const readOnly = !can("products.manage");

  return (
    <Drawer
      open={!!product}
      onClose={onClose}
      width="lg"
      title={p ? "Edit product" : "Add product"}
      description={p ? p.sku : "Scan the barcode with any scanner, camera or your phone — we'll fill in what we can."}
      footer={readOnly ? <Button variant="secondary" onClick={onClose}>Close</Button> : <>
        {p && <Button variant="ghost" className="mr-auto" icon={p.status === "active" ? <LuArchive className="size-4" /> : <LuArchiveRestore className="size-4" />} onClick={toggleArchive}>{p.status === "active" ? "Archive" : "Restore"}</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={save} disabled={!!existing}>{p ? "Save changes" : "Add product"}</Button>
      </>}
    >
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {!p && (
          <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white"><LuScanBarcode className="size-5" /></span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink-900">Scan to fill</p>
                <p className="text-xs text-ink-500">USB/Bluetooth scanner, this device's camera or your phone.</p>
              </div>
              <ScanButton size="sm" />
            </div>
            {lookup?.busy && <p className="mt-3 flex items-center gap-2 text-sm text-ink-600"><Spinner className="size-4 text-brand-600" /> Looking up {lookup.code}…</p>}
            {existing && (
              <div className="mt-3">
                <Callout tone="info" icon={<LuPackageCheck className="size-4" />} title={`Already in your catalogue: ${existing.name}`}>
                  {existing.stock} in stock at {branch.name}. Receive more stock instead of adding a duplicate.
                  <div className="mt-2 flex gap-2">
                    {onOpenExisting && <Button size="sm" variant="secondary" onClick={() => onOpenExisting(existing)}>Open product</Button>}
                    <ReceiveInline product={existing} onDone={onClose} />
                  </div>
                </Callout>
              </div>
            )}
            {lookup?.result?.source === "online" && (
              <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><LuSparkles className="size-4" /> Filled from {lookup.result.online?.source}. Check the details and add your prices.</p>
            )}
            {lookup && !lookup.busy && lookup.result?.source === "none" && (
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-600"><LuGlobe className="size-4" /> No details found online for {lookup.code}. Fill them in below.</p>
            )}
          </div>
        )}

        <fieldset disabled={readOnly || !!existing} className="space-y-6">
          <div className="flex gap-4">
            <div className="shrink-0">
              {f.imageUrl ? (
                <div className="relative">
                  <img src={f.imageUrl} alt="" className="size-24 rounded-xl bg-white object-contain ring-1 ring-ink-200" />
                  <button type="button" aria-label="Remove photo" onClick={() => set("imageUrl", "")} className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-ink-500 shadow ring-1 ring-ink-200 hover:text-rose-600"><LuX className="size-3.5" /></button>
                </div>
              ) : (
                <span className="flex size-24 items-center justify-center rounded-xl bg-ink-100 text-ink-400"><LuPackage className="size-8" /></span>
              )}
            </div>
            <div className="grid flex-1 gap-4 sm:grid-cols-2">
              <Input label="Product name" required value={f.name} onChange={(e) => set("name", e.target.value)} error={errors.name} className="sm:col-span-2" autoFocus={!initialBarcode} />
              <Input label="Brand" value={f.brand} onChange={(e) => set("brand", e.target.value)} />
              <Input label="Photo URL" value={f.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" hint="Filled automatically when found online" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <CategoryPicker value={f.categoryId} onChange={(v) => set("categoryId", v)} />
            <Select label="Unit" value={f.unit} onChange={(e) => set("unit", e.target.value)}><option value="pc">Piece</option><option value="job">Service / job (no stock)</option><option value="box">Box</option><option value="kg">Kilogram</option></Select>
            <Input label="SKU" required value={f.sku} onChange={(e) => set("sku", e.target.value)} error={errors.sku} hint={!f.sku && f.name ? <button type="button" className="text-brand-700 hover:underline" onClick={() => set("sku", skuFrom(f.name))}>Generate from name</button> : "Must be unique"} />
            <Input label="Barcode" value={f.barcode} onChange={(e) => set("barcode", e.target.value)} onBlur={() => !p && f.barcode.length >= 8 && lookup?.code !== f.barcode && runLookup(f.barcode)} error={errors.barcode} hint="Scan or type" data-scan="native"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!p && f.barcode.length >= 6) void runLookup(f.barcode); } }} />
            <Textarea label="Description" className="sm:col-span-2" rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid gap-4 border-t border-ink-100 pt-6 sm:grid-cols-2">
            <Input label="Cost price" prefix="GH₵" inputMode="decimal" value={f.costPrice} onChange={(e) => set("costPrice", e.target.value.replace(/[^\d.]/g, ""))} error={errors.costPrice} />
            <Input label="Selling price" prefix="GH₵" inputMode="decimal" required value={f.sellingPrice} onChange={(e) => set("sellingPrice", e.target.value.replace(/[^\d.]/g, ""))} error={errors.sellingPrice}
              hint={Number(f.sellingPrice) > 0 && Number(f.costPrice) > 0 ? `Margin ${Math.round(((Number(f.sellingPrice) - Number(f.costPrice)) / Number(f.sellingPrice)) * 100)}%` : undefined} />
            <div className="sm:col-span-2"><Switch label="Charge tax on this product" checked={f.taxable} onChange={(v) => set("taxable", v)} /></div>
          </div>
          {f.unit !== "job" && (
            <div className="grid gap-4 border-t border-ink-100 pt-6 sm:grid-cols-2">
              {!p && <Input label="Opening stock" inputMode="numeric" value={f.openingStock} onChange={(e) => set("openingStock", e.target.value.replace(/\D/g, ""))} hint={`At ${branch.name}`} />}
              <Input label="Reorder level" inputMode="numeric" value={f.reorderLevel} onChange={(e) => set("reorderLevel", e.target.value.replace(/\D/g, ""))} hint="Alert when stock falls to this" />
            </div>
          )}
          {!p && (
            <div className="border-t border-ink-100 pt-6">
              <Switch label="This product has variants" description="e.g. colours, sizes or storage" checked={f.variants.length > 0} onChange={(v) => set("variants", v ? [{ label: "", sku: "", barcode: "", openingStock: "" }] : [])} />
              {f.variants.length > 0 && (
                <div className="mt-4 space-y-2">
                  {f.variants.map((v, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_80px_auto] items-end gap-2">
                      <Input label={i === 0 ? "Variant" : undefined} aria-label="Variant" value={v.label} placeholder="e.g. Black" onChange={(e) => set("variants", f.variants.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                      <Input label={i === 0 ? "SKU" : undefined} aria-label="Variant SKU" value={v.sku} placeholder="auto" onChange={(e) => set("variants", f.variants.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))} />
                      <Input label={i === 0 ? "Barcode" : undefined} aria-label="Variant barcode" value={v.barcode} onChange={(e) => set("variants", f.variants.map((x, j) => (j === i ? { ...x, barcode: e.target.value } : x)))} />
                      <Input label={i === 0 ? "Stock" : undefined} aria-label="Variant stock" inputMode="numeric" value={v.openingStock} onChange={(e) => set("variants", f.variants.map((x, j) => (j === i ? { ...x, openingStock: e.target.value.replace(/\D/g, "") } : x)))} />
                      <button type="button" aria-label="Remove variant" className="mb-2.5 text-ink-400 hover:text-rose-600" onClick={() => set("variants", f.variants.filter((_, j) => j !== i))}><LuX className="size-4" /></button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" icon={<LuPlus className="size-4" />} onClick={() => set("variants", [...f.variants, { label: "", sku: "", barcode: "", openingStock: "" }])}>Add variant</Button>
                </div>
              )}
            </div>
          )}
        </fieldset>
      </form>
    </Drawer>
  );
}

function CategoryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const categories = useCategories().data;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const toast = useToast();
  const sorted = useMemo(() => [...categories].sort((a, b) => a.name.localeCompare(b.name)), [categories]);
  if (adding)
    return (
      <div className="flex items-end gap-2">
        <Input className="flex-1" label="New category" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
        <Button disabled={name.trim().length < 2} onClick={async () => { try { const c = await actions.createCategory(name); onChange(c.id); setAdding(false); setName(""); } catch (e) { toast({ tone: "error", title: (e as Error).message }); } }}>Add</Button>
      </div>
    );
  return (
    <Select label="Category" value={value} onChange={(e) => (e.target.value === "__new" ? setAdding(true) : onChange(e.target.value))}>
      <option value="">No category</option>
      {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      <option value="__new">+ New category…</option>
    </Select>
  );
}

function ReceiveInline({ product, onDone }: { product: Product; onDone: () => void }) {
  const { branch } = useSession();
  const toast = useToast();
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <input aria-label="Quantity to receive" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} className="h-8 w-16 rounded-lg border-0 px-2 text-sm ring-1 ring-ink-300" />
      <Button size="sm" loading={busy} disabled={!Number(qty)} onClick={async () => {
        setBusy(true);
        try { await actions.receiveStock(branch.id, product.id, Number(qty), null, "Scanned in"); toast({ tone: "success", title: `Received ${qty} × ${product.name}` }); onDone(); }
        catch (e) { toast({ tone: "error", title: (e as Error).message }); }
        finally { setBusy(false); }
      }}>Receive</Button>
    </span>
  );
}
