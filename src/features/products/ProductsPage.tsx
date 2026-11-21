import { useState } from "react";
import { LuArchive, LuDownload, LuPackage, LuPlus, LuUpload, LuX } from "react-icons/lu";
import { actions, useCategories, useProducts } from "@/services/api";
import {
  Badge, Button, Card, DataState, DataTable, Drawer, EmptyState, FilterBar, Input, PageHeader, Pager, SearchInput, Select, Switch, Tabs,
  Textarea, useToast, type Column,
} from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { Product } from "@/types";

export function StockBadge({ p }: { p: Product }) {
  if (p.unit === "job") return <span className="text-xs text-ink-400">Service</span>;
  if (p.stock <= 0) return <Badge tone="danger">Out of stock</Badge>;
  if (p.stock <= p.reorderLevel) return <Badge tone="warning">Low · {p.stock}</Badge>;
  return <span className="num text-ink-700">{p.stock}</span>;
}

export function ProductsPage() {
  const q = useProducts();
  const categories = useCategories().data;
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [edit, setEdit] = useState<Product | "new" | null>(null);
  const rows = q.data.filter((p) => p.status === tab && (!cat || p.categoryId === cat) && (p.name + p.sku + (p.barcode ?? "")).toLowerCase().includes(search.toLowerCase()));

  const cols: Column<Product>[] = [
    {
      key: "n", header: "Product",
      cell: (p) => {
        const c = categories.find((x) => x.id === p.categoryId);
        return (
          <div className="flex items-center gap-3">
            <span className={`flex size-10 items-center justify-center rounded-lg text-xs font-bold ${c?.color ?? "bg-ink-100"}`}>{p.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}</span>
            <div><p className="font-medium text-ink-900">{p.name}</p><p className="text-xs text-ink-500">{p.sku}{p.variants && ` · ${p.variants.length} variants`}</p></div>
          </div>
        );
      },
    },
    { key: "c", header: "Category", hideBelow: "md", cell: (p) => categories.find((c) => c.id === p.categoryId)?.name },
    { key: "cost", header: "Cost", align: "right", hideBelow: "lg", cell: (p) => formatMoney(p.costPrice) },
    { key: "price", header: "Price", align: "right", cell: (p) => <span className="font-medium text-ink-900">{formatMoney(p.sellingPrice)}</span> },
    { key: "m", header: "Margin", align: "right", hideBelow: "lg", cell: (p) => (p.sellingPrice ? `${Math.round(((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100)}%` : "—") },
    { key: "s", header: "Stock", align: "right", cell: (p) => <StockBadge p={p} /> },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue, prices and stock levels at the selected branch."
        actions={<>
          <Button variant="secondary" icon={<LuUpload className="size-4" />}>Import CSV</Button>
          <Button variant="secondary" icon={<LuDownload className="size-4" />}>Export</Button>
          <Button icon={<LuPlus className="size-4" />} onClick={() => setEdit("new")}>Add product</Button>
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
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuPackage className="size-7" />} title={q.data.length ? "No products match" : "Add your first product"} description={q.data.length ? "Try a different search." : "Add products one by one or import a CSV."} action={!q.data.length && <Button icon={<LuPlus className="size-4" />} onClick={() => setEdit("new")}>Add product</Button>} />}>
          {(data) => <DataTable columns={cols} rows={data} rowKey={(p) => p.id} onRowClick={setEdit} footer={<Pager total={data.length} />} />}
        </DataState>
      </Card>
      <ProductDrawer product={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function ProductDrawer({ product, onClose }: { product: Product | "new" | null; onClose: () => void }) {
  const categories = useCategories().data;
  const toast = useToast();
  const p = product && product !== "new" ? product : null;
  const [variants, setVariants] = useState(false);
  const [taxable, setTaxable] = useState(true);
  return (
    <Drawer
      open={!!product}
      onClose={onClose}
      width="lg"
      title={p ? "Edit product" : "Add product"}
      footer={<>
        {p && <Button variant="ghost" className="mr-auto" icon={<LuArchive className="size-4" />}>Archive</Button>}
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={async () => { await actions.saveProduct({}); toast({ tone: "success", title: "Product saved" }); onClose(); }}>Save product</Button>
      </>}
    >
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()} key={p?.id ?? "new"}>
        <div className="flex items-center gap-4 rounded-lg border border-dashed border-ink-300 p-4">
          <span className="flex size-16 items-center justify-center rounded-lg bg-ink-100 text-ink-400"><LuPackage className="size-6" /></span>
          <div className="flex-1 text-sm"><p className="font-medium">Product photo</p><p className="text-ink-500">Optional. Square image works best.</p></div>
          <Button size="sm" variant="secondary">Upload</Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Product name" required defaultValue={p?.name} className="sm:col-span-2" />
          <Select label="Category" defaultValue={p?.categoryId}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select label="Unit" defaultValue={p?.unit ?? "pc"}><option value="pc">Piece</option><option value="job">Service / job</option><option value="box">Box</option><option value="kg">Kilogram</option></Select>
          <Input label="SKU" required defaultValue={p?.sku} hint="Must be unique" />
          <Input label="Barcode" defaultValue={p?.barcode} hint="Scan into this field" />
          <Textarea label="Description" className="sm:col-span-2" rows={2} />
        </div>
        <div className="grid gap-4 border-t border-ink-100 pt-6 sm:grid-cols-2">
          <Input label="Cost price" prefix="GH₵" inputMode="decimal" defaultValue={p?.costPrice} />
          <Input label="Selling price" prefix="GH₵" inputMode="decimal" required defaultValue={p?.sellingPrice} />
          <div className="sm:col-span-2"><Switch label="Charge tax on this product" checked={taxable} onChange={setTaxable} /></div>
        </div>
        <div className="grid gap-4 border-t border-ink-100 pt-6 sm:grid-cols-2">
          {!p && <Input label="Opening stock" inputMode="numeric" hint="At the selected branch" />}
          <Input label="Reorder level" inputMode="numeric" defaultValue={p?.reorderLevel} hint="Alert when stock falls to this" />
        </div>
        <div className="border-t border-ink-100 pt-6">
          <Switch label="This product has variants" description="e.g. colours, sizes or storage" checked={variants || !!p?.variants} onChange={setVariants} />
          {(variants || p?.variants) && (
            <div className="mt-4 space-y-2">
              {(p?.variants ?? [{ id: "x", label: "", sku: "", stock: 0 }]).map((v) => (
                <div key={v.id} className="grid grid-cols-[1fr_1fr_90px_auto] items-end gap-2">
                  <Input label="Variant" defaultValue={v.label} placeholder="e.g. Black" />
                  <Input label="SKU" defaultValue={v.sku} />
                  <Input label="Stock" defaultValue={v.stock} inputMode="numeric" />
                  <button aria-label="Remove variant" className="mb-2.5 text-ink-400 hover:text-rose-600"><LuX className="size-4" /></button>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<LuPlus className="size-4" />}>Add variant</Button>
            </div>
          )}
        </div>
      </form>
    </Drawer>
  );
}
