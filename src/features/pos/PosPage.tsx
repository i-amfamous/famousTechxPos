import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuArrowLeftRight, LuBadgePercent, LuChevronDown, LuClock, LuCoins, LuFileText, LuLayoutDashboard, LuLock, LuMinus, LuPause,
  LuPencil, LuPlus, LuScanBarcode, LuShoppingBag, LuShoppingCart, LuTrash2, LuUserPlus, LuX,
} from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useCategories, useHeldCarts, useProducts } from "@/services/api";
import { Avatar, Badge, Button, ConfirmDialog, IconButton, Input, Menu, Modal, useToast } from "@/components/ui";
import { ProductCover } from "@/features/products/ProductsPage";
import { useScan } from "@/features/scanner/ScannerProvider";
import { ScanButton } from "@/features/scanner/ScanControls";
import { Logo } from "@/components/layout/AppLayout";
import { cn, formatMoney } from "@/lib/format";
import type { CartLine, Customer, Product } from "@/types";
import {
  ApprovalModal, type ApprovalRequest, CashMovementModal, cashMoveLabel, CustomerModal, DiscountModal, HeldCartsDrawer, PaymentModal, XReportModal,
} from "./PosModals";

export function PosPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { posUser, setPosUser, roleOf, terminal, branch, setShiftOpen, shiftId, demo, settings, can } = useSession();
  const products = useProducts().data.filter((p) => p.status === "active");
  const categories = useCategories().data;
  const heldCount = useHeldCarts().data.length;

  // UI state (LOGIC: cart totals should be recomputed decimal-safe by your checkout logic)
  const [lines, setLines] = useState<CartLine[]>([]);
  /** One key for the whole cart: retries of the same sale can never create a second charge. */
  const [checkoutKey, setCheckoutKey] = useState(() => crypto.randomUUID());
  const [cartDiscount, setCartDiscount] = useState(0);
  const [discountMeta, setDiscountMeta] = useState<{ reason: string; approvalId: string | null }>({ reason: "", approvalId: null });
  const [priceApprovalId, setPriceApprovalId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<null | "pay" | "discount" | "customer" | "held" | "cash" | "x" | "clear" | "hold">(null);
  const [approval, setApproval] = useState<(ApprovalRequest & { onOk: (approvalId: string) => void }) | null>(null);
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
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    return counts;
  }, [products]);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "Product";

  // Mirrors the server's checkout maths (pesewas, tax-inclusive setting, taxable flag per product).
  const cents = (v: number) => Math.round((Number(v) || 0) * 100);
  const priced = lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    return { price: cents(l.unitPrice), qty: Math.max(0, Math.round(l.quantity)), disc: cents(l.discount), taxable: p?.taxable !== false };
  });
  const subCents = priced.reduce((s, l) => s + l.price * l.qty, 0);
  const lineDiscCents = priced.reduce((s, l) => s + Math.min(l.disc, l.price * l.qty), 0);
  const cartDiscCents = Math.max(0, cents(cartDiscount));
  const discCents = Math.min(subCents, lineDiscCents + cartDiscCents);
  const rate = Number(settings.tax_rate) || 0;
  const taxIncluded = settings.prices_include_tax !== false && settings.prices_include_tax !== "false";
  const baseCents = subCents - lineDiscCents;
  let left = Math.max(0, Math.min(cartDiscCents, baseCents));
  let taxCents = 0;
  priced.forEach((l, i) => {
    const gross = l.price * l.qty;
    const net0 = gross - Math.min(l.disc, gross);
    const alloc = i === priced.length - 1 ? left : baseCents > 0 ? Math.round((cartDiscCents * net0) / baseCents) : 0;
    if (i !== priced.length - 1) left = Math.max(0, left - alloc);
    const net = Math.max(0, net0 - alloc);
    if (l.taxable && rate > 0) taxCents += Math.round(taxIncluded ? (net * rate) / (100 + rate) : (net * rate) / 100);
  });
  const totalCents = Math.max(0, subCents - discCents + (taxIncluded ? 0 : taxCents));
  const subtotal = subCents / 100;
  const lineDiscounts = lineDiscCents / 100;
  const discount = discCents / 100;
  const tax = taxCents / 100;
  const total = totalCents / 100;
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

  // No open shift → open one (the route guard already ensured someone is unlocked).
  useEffect(() => {
    if (!posUser) return;
    if (demo) setShiftOpen(true);
    else if (!shiftId && settings.require_shift !== false) navigate("/pos/open-shift", { replace: true });
  }, [posUser, shiftId, demo, navigate, setShiftOpen, settings.require_shift]);

  // Auto-lock when idle (Settings → POS & security). The cart stays with its owner (held).
  useEffect(() => {
    const mins = Number(settings.auto_lock_minutes ?? 5);
    if (!posUser || !mins) return;
    let t = window.setTimeout(lockNow, mins * 60_000);
    const reset = () => { clearTimeout(t); t = window.setTimeout(lockNow, mins * 60_000); };
    const evs = ["pointerdown", "keydown"];
    evs.forEach((e) => window.addEventListener(e, reset));
    return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reset)); };
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Scans from any source (USB/Bluetooth scanner, camera, paired phone) add to the cart.
  useScan((code) => {
    const c = code.trim();
    const hit = products.find((p) => p.barcode === c || p.sku.toLowerCase() === c.toLowerCase());
    const variant = hit ? undefined : products.flatMap((p) => (p.variants ?? []).map((v) => ({ p, v }))).find(({ v }) => v.barcode === c || v.sku === c);
    const p = hit ?? variant?.p;
    if (!p) throw new Error(`No product with barcode ${c}`);
    add(p, variant?.v);
    return `Added ${p.name}${variant ? ` (${variant.v.label})` : ""}`;
  }, !!posUser && !modal && !approval && !editLine);

  if (!user) return null;

  const isService = (p: Product) => p.unit === "job";
  const inCart = (id: string) => lines.filter((l) => l.productId === id).reduce((a, l) => a + l.quantity, 0);

  const add = (p: Product, v?: { id: string; label: string; sku: string; stock: number }) => {
    if (!lines.length) setCheckoutKey(crypto.randomUUID()); // a fresh cart is a fresh sale
    const lineId = v ? `${p.id}:${v.id}` : p.id;
    const available = v ? v.stock : p.stock;
    const inCartNow = lines.find((l) => (l.variantId ? `${l.productId}:${l.variantId}` : l.productId) === lineId)?.quantity ?? 0;
    if (!isService(p) && inCartNow >= available && settings.block_negative_stock !== false) {
      toast({ tone: "error", title: "Not enough stock", body: `Only ${available} ${p.name} available at ${branch.name}.` });
      throw new Error(`Only ${available} ${p.name} in stock`);
    }
    setLines((ls) => {
      const ex = ls.find((l) => (l.variantId ? `${l.productId}:${l.variantId}` : l.productId) === lineId);
      if (ex) return ls.map((l) => (l === ex ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { productId: p.id, variantId: v?.id, name: v ? `${p.name} - ${v.label}` : p.name, sku: v?.sku ?? p.sku, unitPrice: p.sellingPrice, quantity: 1, discount: 0 }];
    });
  };
  const tryAdd = (p: Product) => { try { add(p); } catch { /* toast already shown */ } };
  const keyOf = (l: CartLine) => (l.variantId ? `${l.productId}:${l.variantId}` : l.productId);
  const setQty = (key: string, qty: number) => {
    if (qty <= 0 && lines.length === 1) setCheckoutKey(crypto.randomUUID());
    setLines((ls) => (qty <= 0 ? ls.filter((l) => keyOf(l) !== key) : ls.map((l) => (keyOf(l) === key ? { ...l, quantity: qty } : l))));
  };
  const reset = () => { setLines([]); setCartDiscount(0); setDiscountMeta({ reason: "", approvalId: null }); setPriceApprovalId(null); setCustomer(null); setCheckoutKey(crypto.randomUUID()); };

  const requestApproval = (r: ApprovalRequest, onOk: (approvalId: string) => void) => setApproval({ ...r, onOk });

  async function lockNow() {
    if (lines.length && posUser && terminal) {
      try { await actions.holdCart({ branchId: branch.id, terminalId: terminal.id, lines, note: "Auto-held when the till locked" }); } catch { /* keep going */ }
    }
    if (terminal) await actions.lockTerminal();
    setPosUser(null);
    navigate("/pos/lock");
  }
  const lock = () => { void lockNow(); };

  const onScan = (e: FormEvent) => {
    e.preventDefault();
    const hit = products.find((p) => p.barcode === q.trim() || p.sku.toLowerCase() === q.trim().toLowerCase());
    if (hit) { tryAdd(hit); setQ(""); }
    else if (filtered.length === 1) { tryAdd(filtered[0]!); setQ(""); }
    else if (q.trim()) toast({ tone: "error", title: `No product matches “${q.trim()}”` });
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
              <li key={keyOf(l)} className="rounded-xl p-3 ring-1 ring-ink-200">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{l.name}</p>
                    <p className="num text-xs text-ink-500">{formatMoney(l.unitPrice)} each{l.discount > 0 && <span className="text-emerald-600"> · −{formatMoney(l.discount)}</span>}</p>
                  </div>
                  <button aria-label={`Edit ${l.name}`} onClick={() => setEditLine(l)} className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><LuPencil className="size-3.5" /></button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center rounded-lg ring-1 ring-ink-200">
                    <button aria-label="Decrease" onClick={() => setQty(keyOf(l), l.quantity - 1)} className="flex size-9 items-center justify-center text-ink-600 hover:bg-ink-50"><LuMinus className="size-4" /></button>
                    <span className="num w-9 text-center text-sm font-semibold">{l.quantity}</span>
                    <button aria-label="Increase" onClick={() => { const p = products.find((x) => x.id === l.productId); if (p) { try { add(p, l.variantId ? p.variants?.find((v) => v.id === l.variantId) : undefined); } catch { /* shown */ } } }} className="flex size-9 items-center justify-center text-ink-600 hover:bg-ink-50"><LuPlus className="size-4" /></button>
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
            <dt className="flex items-center gap-2">Discount {cartDiscount > 0 && <button className="text-xs text-rose-600 hover:underline" onClick={() => { setCartDiscount(0); setDiscountMeta({ reason: "", approvalId: null }); }}>remove</button>}</dt>
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
        <Button size="xl" variant="checkout" block className="mt-3" disabled={!lines.length} onClick={() => setModal("pay")}>
          <span className="flex w-full items-center justify-between"><span>Charge</span><span className="num">{formatMoney(total)}</span></span>
        </Button>
        <p className="mt-2 hidden text-center text-[11px] text-ink-400 lg:block">F2 search · F8 hold · F9 charge</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col bg-ink-100">
      {/* ───── Top bar ───── */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-3 text-ink-900 sm:px-4">
        <Logo className="size-8 text-xs" />
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-semibold">{terminal?.name}</p>
          <p className="text-[11px] text-ink-500">{branch.name}</p>
        </div>

        <Menu
          align="left"
          trigger={(p) => (
            <button {...p} className="ml-2 flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">
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
          <div className="flex items-center gap-2 rounded-full bg-ink-100 py-1 pl-1 pr-3">
            <Avatar name={user.fullName} color={user.avatarColor} size="sm" />
            <span className="text-sm font-medium">{user.displayName}</span>
            <span className="hidden text-xs text-ink-500 sm:inline">· {role?.name}</span>
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
            <form onSubmit={onScan} className="relative flex gap-2">
              <LuScanBarcode className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-ink-400" />
              <input
                ref={searchRef}
                data-scan="native"
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Scan a barcode or search by name or SKU"
                aria-label="Scan barcode or search products"
                className="h-12 w-full rounded-2xl border-0 bg-ink-50 pl-11 pr-4 text-base shadow-card ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:bg-white focus:ring-2 focus:ring-brand-500"
              />
              <ScanButton label="" size="lg" className="h-12 shrink-0 rounded-2xl px-4" />
            </form>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 scrollbar-thin">
              {[{ id: "all", name: "All" }, ...categories].map((c) => {
                const active = cat === c.id;
                const count = c.id === "all" ? products.length : (categoryCounts.get(c.id) ?? 0);
                return (
                  <button
                    key={c.id}
                    onClick={() => setCat(c.id)}
                    aria-pressed={active}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all",
                      active ? "bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow-glow" : "bg-ink-100 text-ink-600 ring-1 ring-ink-200 hover:bg-white hover:text-brand-700 hover:ring-brand-300",
                    )}
                  >
                    {c.name}
                    <span className={cn("num rounded-full px-1.5 py-0.5 text-[10px] font-bold", active ? "bg-white/20 text-white" : "bg-white text-ink-500")}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-ink-500"><span className="num font-semibold text-ink-700">{filtered.length}</span> product{filtered.length === 1 ? "" : "s"}</p>
              <p className="hidden text-xs text-ink-400 sm:block">Tap a product to add it to the sale</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 pb-24 sm:p-4 lg:pb-4">
            {filtered.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-ink-500">
                <span className="mb-4 grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-50 to-violet-100 text-brand-500 ring-1 ring-brand-100">
                  <LuScanBarcode className="size-8" />
                </span>
                <p className="font-semibold text-ink-700">No product matches “{q}”</p>
                <p className="mt-1 text-sm">Check the spelling, try another category or scan again.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
                {filtered.map((p, i) => (
                  <ProductTile
                    key={p.id}
                    p={p}
                    index={i}
                    qty={inCart(p.id)}
                    category={categoryName(p.categoryId)}
                    onAdd={() => tryAdd(p)}
                  />
                ))}
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
        lines={lines}
        customer={customer}
        cartDiscount={cartDiscount}
        discountReason={discountMeta.reason}
        discountApprovalId={discountMeta.approvalId}
        priceApprovalId={priceApprovalId}
        idempotencyKey={checkoutKey}
        onComplete={() => { setModal(null); reset(); setCartOpenMobile(false); searchRef.current?.focus(); }}
      />
      <DiscountModal
        open={modal === "discount"}
        onClose={() => setModal(null)}
        subtotal={subtotal - lineDiscounts}
        limitPercent={limits.maxDiscountPercent}
        onApply={(amt, needs, label, reason) => {
          setModal(null);
          if (needs) requestApproval({ action: "discount", title: "Discount above your limit", detail: `${label} off this sale (your limit is ${limits.maxDiscountPercent}%). ${reason}`, amount: amt + lineDiscounts, permission: "pos.approve" },
            (id) => { setCartDiscount(amt); setDiscountMeta({ reason, approvalId: id }); });
          else { setCartDiscount(amt); setDiscountMeta({ reason, approvalId: null }); }
        }}
      />
      <CustomerModal open={modal === "customer"} onClose={() => setModal(null)} onPick={(c) => { setCustomer(c); setModal(null); }} />
      <HeldCartsDrawer
        open={modal === "held"}
        onClose={() => setModal(null)}
        onResume={(cart, needs) => {
          setModal(null);
          const go = async (approvalId?: string) => {
            try {
              const ls = await actions.resumeHeldCart(cart.id, approvalId);
              if (!lines.length) setCheckoutKey(crypto.randomUUID());
              setLines((cur) => [...cur, ...ls]);
              toast({ tone: "success", title: "Cart resumed", body: cart.note || undefined });
            } catch (e) { toast({ tone: "error", title: "Couldn't resume cart", body: (e as Error).message }); }
          };
          if (needs) requestApproval({ action: "take_over_cart", title: "Resume another employee's cart", detail: "Taking over a held cart started by someone else.", permission: "pos.approve" }, (id) => void go(id));
          else void go();
        }}
      />
      <CashMovementModal
        open={modal === "cash"}
        onClose={() => setModal(null)}
        onDone={(m) => {
          setModal(null);
          const record = async (approvalId?: string) => {
            if (!shiftId) { toast({ tone: "error", title: "Open a shift first" }); return; }
            try {
              await actions.recordCashMovement(shiftId, m.type, m.amount, m.reason, approvalId);
              toast({ tone: "success", title: `${cashMoveLabel[m.type]} recorded`, body: m.amount ? formatMoney(m.amount) : undefined });
            } catch (e) { toast({ tone: "error", title: "Couldn't record", body: (e as Error).message }); }
          };
          if (m.needsApproval) requestApproval({ action: m.type, title: cashMoveLabel[m.type], detail: m.reason, amount: m.amount || undefined, permission: "pos.approve" }, (id) => void record(id));
          else void record();
        }}
      />
      <XReportModal open={modal === "x"} onClose={() => setModal(null)} />
      <HoldModal open={modal === "hold"} onClose={() => setModal(null)} onHold={async (note) => {
        if (!posUser) return;
        try {
          await actions.holdCart({ branchId: branch.id, terminalId: terminal?.id ?? null, lines, note });
          setModal(null); reset(); toast({ tone: "success", title: "Cart held", body: note || "Find it under Held carts." });
        } catch (e) { toast({ tone: "error", title: "Couldn't hold cart", body: (e as Error).message }); }
      }} />
      <ConfirmDialog open={modal === "clear"} onClose={() => setModal(null)} title="Clear this cart?" message="All items, discount and customer will be removed." confirmLabel="Clear cart" onConfirm={() => reset()} />
      <LineEditModal
        line={editLine}
        onClose={() => setEditLine(null)}
        onSave={(l, priceChanged) => {
          const apply = () => setLines((ls) => ls.map((x) => (x.productId === l.productId && x.variantId === l.variantId ? l : x)));
          setEditLine(null);
          if (priceChanged && !can("pos.price_override")) requestApproval({ action: "price_override", title: "Price override", detail: `${l.name} changed to ${formatMoney(l.unitPrice)}`, permission: "pos.approve" }, (id) => { setPriceApprovalId(id); apply(); });
          else apply();
        }}
        onRemove={(key) => { setQty(key, 0); setEditLine(null); }}
      />
      <ApprovalModal
        request={approval}
        onClose={() => setApproval(null)}
        onApproved={(a, id) => { approval?.onOk(id); setApproval(null); toast({ tone: "success", title: "Approved", body: `Approved by ${a.fullName}` }); }}
      />
    </div>
  );
}

/** A product tile built for fast tills: photo, price, stock and one obvious add target. */
function ProductTile({ p, qty, category, index, onAdd }: { p: Product; qty: number; category: string; index: number; onAdd: () => void }) {
  const svc = p.unit === "job";
  const out = !svc && p.stock <= 0;
  const low = !svc && !out && p.stock <= p.reorderLevel;
  const stockText = svc ? "Service" : out ? "Out of stock" : low ? `Only ${p.stock} left` : `${p.stock} in stock`;
  const dot = svc ? "bg-ink-300" : out ? "bg-rose-500" : low ? "bg-amber-500" : "bg-emerald-500";
  const stockTextColor = svc ? "text-ink-400" : out ? "text-rose-600" : low ? "text-amber-600" : "text-emerald-600";

  return (
    <button
      type="button"
      disabled={out}
      onClick={onAdd}
      aria-label={`Add ${p.name}, ${formatMoney(p.sellingPrice)}${out ? ", out of stock" : ""}`}
      className={cn(
        "pos-tile group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-card ring-1 ring-ink-200 transition-[transform,box-shadow] duration-200",
        out ? "cursor-not-allowed" : "hover:-translate-y-1 hover:shadow-pop hover:ring-brand-300 active:translate-y-0 active:scale-[.99]",
        qty > 0 && "ring-2 ring-brand-500",
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 18}ms` }}
    >
      <div className="relative overflow-hidden bg-gradient-to-br from-ink-50 via-white to-brand-50/70">
        <div className="h-1 w-full bg-gradient-to-r from-brand-500 via-indigo-500 to-violet-500" />
        <ProductCover p={p} className="aspect-[5/4] h-auto w-full rounded-none object-cover text-3xl ring-0 transition-transform duration-300 group-hover:scale-[1.04]" />
        {qty > 0 && <span className="num absolute right-2 top-3 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-600 px-2 text-xs font-bold text-white shadow-lg ring-2 ring-white">{qty}</span>}
        {out && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/55 backdrop-blur-[1px]">
            <span className="rounded-full bg-ink-900/80 px-3 py-1.5 text-xs font-semibold text-white">Out of stock</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <p className="line-clamp-2 min-h-10 text-[13px] font-semibold leading-5 text-ink-900">{p.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-ink-400">{category}{p.sku ? ` · ${p.sku}` : ""}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            <p className="num text-[17px] font-bold leading-none tracking-tight text-ink-900">{formatMoney(p.sellingPrice)}</p>
            <span className={cn("mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium", stockTextColor)}>
              <span className={cn("size-1.5 shrink-0 rounded-full", dot)} />
              {stockText}
            </span>
          </div>
          <span className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl transition-all duration-200",
            out ? "bg-ink-100 text-ink-300" : "bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white group-hover:shadow-glow",
          )}>
            <LuPlus className="size-5" strokeWidth={2.4} />
          </span>
        </div>
      </div>
    </button>
  );
}

function HoldModal({ open, onClose, onHold }: { open: boolean; onClose: () => void; onHold: (note: string) => void | Promise<void> }) {
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
          <Button variant="dangerGhost" className="mr-auto" icon={<LuTrash2 className="size-4" />} onClick={() => onRemove(line.variantId ? `${line.productId}:${line.variantId}` : line.productId)}>Remove</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ ...line, quantity: Math.max(1, Number(qty) || 1), unitPrice: Number(price) || 0, priceOverride: line.priceOverride || priceChanged }, priceChanged)}>Save</Button>
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
