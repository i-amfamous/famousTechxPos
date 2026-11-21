import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuArrowLeftRight, LuBadgePercent, LuChevronDown, LuClock, LuCoins, LuFileText, LuLayoutDashboard, LuLock, LuMinus, LuPause,
  LuPencil, LuPlus, LuScanBarcode, LuShoppingBag, LuShoppingCart, LuTrash2, LuUserPlus, LuX,
} from "react-icons/lu";
import { useSession } from "@/app/session";
import { useCategories, useHeldCarts, useProducts } from "@/services/api";
import { Avatar, Badge, Button, ConfirmDialog, IconButton, Input, Menu, Modal, useToast } from "@/components/ui";
import { Logo } from "@/components/layout/AppLayout";
import { cn, formatMoney } from "@/lib/format";
import type { CartLine, Customer, Product } from "@/types";
import {
  ApprovalModal, type ApprovalRequest, CashMovementModal, CustomerModal, DiscountModal, HeldCartsDrawer, PaymentModal, XReportModal,
} from "./PosModals";

export function PosPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { posUser, setPosUser, roleOf, terminal, branch, setShiftOpen } = useSession();
  const products = useProducts().data.filter((p) => p.status === "active");
  const categories = useCategories().data;
  const heldCount = useHeldCarts().data.length;

  // UI state (LOGIC: cart totals should be recomputed decimal-safe by your checkout logic)
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | "pay" | "discount" | "customer" | "held" | "cash" | "x" | "clear" | "hold">(null);
  const [approval, setApproval] = useState<(ApprovalRequest & { onOk: () => void }) | null>(null);
  const [editLine, setEditLine] = useState<CartLine | null>(null);
  const [cartOpenMobile, setCartOpenMobile] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const user = posUser;
  const role = user ? roleOf(user) : null;
  const limits = role?.limits ?? { maxDiscountPercent: 0, maxRefundAmount: 0, allowNoSale: false };

  const filtered = useMemo(
    () => products.filter((p) => (cat === "all" || p.categoryId === cat) && (p.name + p.sku + (p.barcode ?? "")).toLowerCase().includes(q.toLowerCase())),
    [products, cat, q],
  );

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const lineDiscounts = lines.reduce((s, l) => s + l.discount, 0);
  const discount = lineDiscounts + cartDiscount;
  const tax = 0; // LOGIC: tax rules from business settings
  const total = Math.max(0, subtotal - discount + tax);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

  // Keyboard shortcuts: F2 search, F8 hold, F9 pay, Esc clears search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === "F9" && lines.length) { e.preventDefault(); setModal("pay"); }
      if (e.key === "F8" && lines.length) { e.preventDefault(); setModal("hold"); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [lines.length]);

  // No PIN session on this terminal → lock screen. (Shift flag kept in sync for design review.)
  useEffect(() => {
    if (!posUser) navigate("/pos/lock", { replace: true });
    else setShiftOpen(true);
  }, [posUser, navigate, setShiftOpen]);

  if (!user) return null;

  const isService = (p: Product) => p.unit === "job";
  const inCart = (id: string) => lines.find((l) => l.productId === id)?.quantity ?? 0;

  const add = (p: Product) => {
    if (!isService(p) && inCart(p.id) >= p.stock) {
      toast({ tone: "error", title: "Not enough stock", body: `Only ${p.stock} ${p.name} available at ${branch.name}.` });
      return;
    }
    setLines((ls) => {
      const ex = ls.find((l) => l.productId === p.id);
      if (ex) return ls.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { productId: p.id, name: p.name, sku: p.sku, unitPrice: p.sellingPrice, quantity: 1, discount: 0 }];
    });
  };
  const setQty = (id: string, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.productId !== id) : ls.map((l) => (l.productId === id ? { ...l, quantity: qty } : l))));
  const reset = () => { setLines([]); setCartDiscount(0); setCustomer(null); };

  const requestApproval = (r: ApprovalRequest, onOk: () => void) => setApproval({ ...r, onOk });

  const lock = () => { setPosUser(null); navigate("/pos/lock"); };

  const onScan = (e: FormEvent) => {
    e.preventDefault();
    const hit = products.find((p) => p.barcode === q.trim() || p.sku.toLowerCase() === q.trim().toLowerCase());
    if (hit) { add(hit); setQ(""); }
    else if (filtered.length === 1) { add(filtered[0]!); setQ(""); }
  };

  /* ───── Cart panel (shared desktop + mobile sheet) ───── */
  const cart = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-ink-900">Current sale</h2>
          {itemCount > 0 && <Badge tone="brand">{itemCount} item{itemCount > 1 && "s"}</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Clear cart" disabled={!lines.length} onClick={() => setModal("clear")}><LuTrash2 className="size-4" /></IconButton>
          <IconButton label="Close cart" className="lg:hidden" onClick={() => setCartOpenMobile(false)}><LuX className="size-5" /></IconButton>
        </div>
      </div>

      <button onClick={() => setModal("customer")} className="mx-4 mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ring-1 ring-dashed ring-ink-300 hover:bg-ink-50">
        {customer ? (
          <>
            <Avatar name={customer.name} size="sm" color="bg-ink-500" />
            <span className="flex-1"><span className="block font-medium text-ink-900">{customer.name}</span><span className="block text-xs text-ink-500">{customer.phone}</span></span>
            <span role="button" tabIndex={0} aria-label="Remove customer" onClick={(e) => { e.stopPropagation(); setCustomer(null); }} className="text-ink-400 hover:text-rose-600"><LuX className="size-4" /></span>
          </>
        ) : (
          <><LuUserPlus className="size-4 text-ink-400" /><span className="text-ink-500">Add customer (optional)</span></>
        )}
      </button>

      <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-10 text-center text-ink-400">
            <LuShoppingCart className="mb-3 size-10" />
            <p className="text-sm font-medium text-ink-600">Cart is empty</p>
            <p className="text-xs">Tap a product or scan a barcode</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.productId} className="rounded-xl p-3 ring-1 ring-ink-200">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{l.name}</p>
                    <p className="num text-xs text-ink-500">{formatMoney(l.unitPrice)} each{l.discount > 0 && <span className="text-emerald-600"> · −{formatMoney(l.discount)}</span>}</p>
                  </div>
                  <button aria-label={`Edit ${l.name}`} onClick={() => setEditLine(l)} className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><LuPencil className="size-3.5" /></button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center rounded-lg ring-1 ring-ink-200">
                    <button aria-label="Decrease" onClick={() => setQty(l.productId, l.quantity - 1)} className="flex size-9 items-center justify-center text-ink-600 hover:bg-ink-50"><LuMinus className="size-4" /></button>
                    <span className="num w-9 text-center text-sm font-semibold">{l.quantity}</span>
                    <button aria-label="Increase" onClick={() => { const p = products.find((x) => x.id === l.productId); if (p) add(p); }} className="flex size-9 items-center justify-center text-ink-600 hover:bg-ink-50"><LuPlus className="size-4" /></button>
                  </div>
                  <span className="num font-semibold text-ink-900">{formatMoney(l.unitPrice * l.quantity - l.discount)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-ink-200 bg-ink-50/60 px-4 py-4">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between text-ink-600"><dt>Subtotal</dt><dd className="num">{formatMoney(subtotal)}</dd></div>
          <div className="flex justify-between text-ink-600">
            <dt className="flex items-center gap-2">Discount {cartDiscount > 0 && <button className="text-xs text-rose-600 hover:underline" onClick={() => setCartDiscount(0)}>remove</button>}</dt>
            <dd className="num">{discount ? `−${formatMoney(discount)}` : formatMoney(0)}</dd>
          </div>
          <div className="flex justify-between text-ink-600"><dt>Tax</dt><dd className="num">{formatMoney(tax)}</dd></div>
          <div className="flex justify-between pt-2 text-lg font-bold text-ink-900"><dt>Total</dt><dd className="num">{formatMoney(total)}</dd></div>
        </dl>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Button variant="secondary" icon={<LuPause className="size-4" />} disabled={!lines.length} onClick={() => setModal("hold")}>Hold</Button>
          <Button variant="secondary" icon={<LuBadgePercent className="size-4" />} disabled={!lines.length} onClick={() => setModal("discount")}>Discount</Button>
          <Button variant="secondary" icon={<LuShoppingBag className="size-4" />} onClick={() => setModal("held")}>
            Held {heldCount > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{heldCount}</span>}
          </Button>
        </div>
        <Button size="xl" variant="success" block className="mt-3" disabled={!lines.length} onClick={() => setModal("pay")}>
          <span className="flex w-full items-center justify-between"><span>Charge</span><span className="num">{formatMoney(total)}</span></span>
        </Button>
        <p className="mt-2 hidden text-center text-[11px] text-ink-400 lg:block">F2 search · F8 hold · F9 charge</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-ink-100">
      {/* ───── Top bar ───── */}
      <header className="flex h-14 shrink-0 items-center gap-3 bg-brand-900 px-3 text-white sm:px-4">
        <Logo className="size-8 text-xs" />
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-semibold">{terminal?.name}</p>
          <p className="text-[11px] text-brand-300">{branch.name}</p>
        </div>

        <Menu
          align="left"
          trigger={(p) => (
            <button {...p} className="ml-2 flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25">
              <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Shift open <LuChevronDown className="size-3.5" />
            </button>
          )}
          items={[
            { label: "X report (mid-shift)", icon: <LuFileText />, onClick: () => setModal("x") },
            { label: "Cash in / out", icon: <LuCoins />, onClick: () => setModal("cash") },
            "divider",
            { label: "Close shift", icon: <LuClock />, onClick: () => navigate("/pos/close-shift") },
          ]}
        />

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="onDark" className="hidden md:inline-flex" icon={<LuLayoutDashboard className="size-4" />} onClick={() => navigate("/dashboard")}>
            Back office
          </Button>
          <div className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3">
            <Avatar name={user.fullName} color={user.avatarColor} size="sm" />
            <span className="text-sm font-medium">{user.displayName}</span>
            <span className="hidden text-xs text-brand-300 sm:inline">· {role?.name}</span>
          </div>
          <Button size="sm" variant="accent" icon={<LuLock className="size-4" />} onClick={lock}>
            <span className="hidden sm:inline">Lock / Switch</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ───── Products ───── */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="space-y-3 border-b border-ink-200 bg-white p-3 sm:p-4">
            <form onSubmit={onScan} className="relative">
              <LuScanBarcode className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-400" />
              <input
                ref={searchRef}
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Scan barcode or search product / SKU…"
                aria-label="Scan barcode or search products"
                className="h-12 w-full rounded-xl border-0 bg-ink-50 pl-11 pr-4 text-base ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:bg-white focus:ring-2 focus:ring-brand-500"
              />
            </form>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-thin">
              {[{ id: "all", name: "All" }, ...categories].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCat(c.id)}
                  className={cn("h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors", cat === c.id ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200")}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 pb-24 sm:p-4 lg:pb-4">
            {filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-ink-500">
                <LuScanBarcode className="mb-2 size-10 text-ink-300" />
                <p className="font-medium text-ink-700">No product matches “{q}”</p>
                <p className="text-sm">Check the spelling or scan again.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filtered.map((p) => {
                  const svc = isService(p);
                  const out = !svc && p.stock <= 0;
                  const low = !svc && !out && p.stock <= p.reorderLevel;
                  const qty = inCart(p.id);
                  const color = categories.find((c) => c.id === p.categoryId)?.color ?? "bg-ink-100 text-ink-700";
                  return (
                    <button
                      key={p.id}
                      disabled={out}
                      onClick={() => add(p)}
                      className={cn(
                        "relative flex flex-col rounded-2xl bg-white p-3 text-left shadow-card ring-1 transition-all",
                        out ? "cursor-not-allowed opacity-55 ring-ink-200" : "ring-ink-200 hover:ring-brand-400 active:scale-[.98]",
                        qty > 0 && "ring-2 ring-brand-500",
                      )}
                    >
                      <div className={cn("mb-3 flex aspect-[4/3] items-center justify-center rounded-xl text-2xl font-bold", color)}>
                        {p.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                      </div>
                      <p className="line-clamp-2 min-h-10 text-sm font-medium leading-5 text-ink-900">{p.name}</p>
                      <div className="mt-1 flex items-end justify-between gap-1">
                        <span className="num font-semibold text-ink-900">{formatMoney(p.sellingPrice)}</span>
                        {svc ? <span className="text-[11px] text-ink-400">Service</span> : out ? <Badge tone="danger">Out</Badge> : low ? <Badge tone="warning">{p.stock} left</Badge> : <span className="num text-[11px] text-ink-400">{p.stock} in stock</span>}
                      </div>
                      {qty > 0 && <span className="num absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white shadow">{qty}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ───── Cart (desktop) ───── */}
        <aside className="hidden w-[380px] shrink-0 border-l border-ink-200 lg:block xl:w-[420px]">{cart}</aside>
      </div>

      {/* ───── Cart (mobile / tablet portrait) ───── */}
      {!cartOpenMobile && lines.length > 0 && (
        <div className="fixed inset-x-3 bottom-3 lg:hidden">
          <Button size="xl" block onClick={() => setCartOpenMobile(true)}>
            <span className="flex w-full items-center justify-between"><span className="flex items-center gap-2"><LuShoppingCart className="size-5" /> View cart · {itemCount}</span><span className="num">{formatMoney(total)}</span></span>
          </Button>
        </div>
      )}
      {cartOpenMobile && <div className="fixed inset-0 z-40 lg:hidden">{cart}</div>}

      {/* ───── Modals ───── */}
      <PaymentModal
        open={modal === "pay"}
        onClose={() => setModal(null)}
        total={total}
        subtotal={subtotal}
        discount={discount}
        lines={lines}
        customer={customer}
        onComplete={() => { setModal(null); reset(); setCartOpenMobile(false); }}
      />
      <DiscountModal
        open={modal === "discount"}
        onClose={() => setModal(null)}
        subtotal={subtotal - lineDiscounts}
        limitPercent={limits.maxDiscountPercent}
        onApply={(amt, needs, label) => {
          setModal(null);
          if (needs) requestApproval({ title: "Discount above your limit", detail: `${label} off this sale (your limit is ${limits.maxDiscountPercent}%)`, amount: amt, permission: "pos.approve" }, () => setCartDiscount(amt));
          else setCartDiscount(amt);
        }}
      />
      <CustomerModal open={modal === "customer"} onClose={() => setModal(null)} onPick={(c) => { setCustomer(c); setModal(null); }} />
      <HeldCartsDrawer
        open={modal === "held"}
        onClose={() => setModal(null)}
        onResume={(ls, needs) => {
          setModal(null);
          const go = () => setLines(ls);
          if (needs) requestApproval({ title: "Resume another employee's cart", detail: "Taking over a held cart started by someone else.", permission: "pos.approve" }, go);
          else go();
        }}
      />
      <CashMovementModal
        open={modal === "cash"}
        onClose={() => setModal(null)}
        onDone={(needs, amt, label) => {
          setModal(null);
          const done = () => toast({ tone: "success", title: `${label} recorded`, body: amt ? formatMoney(amt) : undefined });
          if (needs) requestApproval({ title: label, detail: "Cash drawer action", amount: amt || undefined, permission: "pos.approve" }, done);
          else done();
        }}
      />
      <XReportModal open={modal === "x"} onClose={() => setModal(null)} />
      <HoldModal open={modal === "hold"} onClose={() => setModal(null)} onHold={(note) => { setModal(null); reset(); toast({ tone: "success", title: "Cart held", body: note || "Find it under Held carts." }); }} />
      <ConfirmDialog open={modal === "clear"} onClose={() => setModal(null)} title="Clear this cart?" message="All items, discount and customer will be removed." confirmLabel="Clear cart" onConfirm={() => reset()} />
      <LineEditModal
        line={editLine}
        onClose={() => setEditLine(null)}
        onSave={(l, priceChanged) => {
          const apply = () => setLines((ls) => ls.map((x) => (x.productId === l.productId ? l : x)));
          setEditLine(null);
          if (priceChanged && !role?.permissions.includes("pos.price_override")) requestApproval({ title: "Price override", detail: `${l.name} changed to ${formatMoney(l.unitPrice)}`, permission: "pos.approve" }, apply);
          else apply();
        }}
        onRemove={(id) => { setQty(id, 0); setEditLine(null); }}
      />
      <ApprovalModal
        request={approval}
        onClose={() => setApproval(null)}
        onApproved={(a) => { approval?.onOk(); setApproval(null); toast({ tone: "success", title: "Approved", body: `Approved by ${a.fullName}` }); }}
      />
    </div>
  );
}

function HoldModal({ open, onClose, onHold }: { open: boolean; onClose: () => void; onHold: (note: string) => void }) {
  const [note, setNote] = useState("");
  useEffect(() => { if (open) setNote(""); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Hold this cart" size="sm" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={<LuPause className="size-4" />} onClick={() => onHold(note)}>Hold cart</Button></>}>
      <Input label="Note" placeholder="e.g. Customer went to get cash" value={note} onChange={(e) => setNote(e.target.value)} hint="Helps you find it later. The cart stays yours." autoFocus />
    </Modal>
  );
}

function LineEditModal({ line, onClose, onSave, onRemove }: { line: CartLine | null; onClose: () => void; onSave: (l: CartLine, priceChanged: boolean) => void; onRemove: (id: string) => void }) {
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("0");
  useEffect(() => { if (line) { setQty(String(line.quantity)); setPrice(String(line.unitPrice)); } }, [line]);
  if (!line) return null;
  const priceChanged = Number(price) !== line.unitPrice;
  return (
    <Modal
      open
      onClose={onClose}
      title={line.name}
      description={line.sku}
      size="sm"
      footer={
        <>
          <Button variant="dangerGhost" className="mr-auto" icon={<LuTrash2 className="size-4" />} onClick={() => onRemove(line.productId)}>Remove</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ ...line, quantity: Math.max(1, Number(qty) || 1), unitPrice: Number(price) || 0 }, priceChanged)}>Save</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Input label="Quantity" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
        <Input label="Unit price" prefix="GH₵" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ""))} hint={priceChanged ? "Price override may need approval" : undefined} />
      </div>
      <p className="mt-4 flex items-center gap-2 text-xs text-ink-500"><LuArrowLeftRight className="size-3.5" /> To change colour/size, remove this line and add the variant.</p>
    </Modal>
  );
}
