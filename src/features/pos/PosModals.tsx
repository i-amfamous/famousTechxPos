import { useEffect, useState, type ReactNode } from "react";
import {
  LuBanknote, LuCircleCheck, LuCreditCard, LuLandmark, LuPlus, LuPrinter, LuShieldCheck, LuSmartphone, LuTrash2, LuUserPlus,
} from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useApprovers, useCustomers, useEmployees, useHeldCarts, useShiftSummary } from "@/services/api";
import {
  Avatar, Badge, Button, Callout, ConfirmDialog, DL, Drawer, EmptyState, Input, Modal, PinPad, SearchInput, Segmented, Textarea, useToast,
} from "@/components/ui";
import { cn, formatMoney, formatTime, methodLabel, timeAgo } from "@/lib/format";
import { DEMO } from "@/lib/http";
import { openPaystackDialog } from "@/lib/paystack";
import { detectNetwork, formatPhone, normalizePhone } from "@/lib/momo";
import type { CartLine, Customer, HeldCart, PaymentLine, PaymentMethod, SaleReceipt } from "@/types";
import { Receipt } from "./Receipt";

/* ═════════════ Manager approval ═════════════ */
export interface ApprovalRequest {
  /** Server action key: discount | price_override | take_over_cart | no_sale | drop | shift_variance | refund | void */
  action: string;
  title: string;      // e.g. "Discount above your limit"
  detail: string;     // e.g. "15% on Samsung Galaxy A15 (your limit is 5%)"
  amount?: number;
  permission?: string; // permission the approver must hold
}

interface Approver { id: string; fullName: string; displayName: string; avatarColor: string; roleName: string }

export function ApprovalModal({ request, onClose, onApproved }: { request: ApprovalRequest | null; onClose: () => void; onApproved: (approver: Approver, approvalId: string) => void }) {
  const { posUser, terminal } = useSession();
  const approvers = useApprovers(request?.permission ?? "pos.approve").data;
  const [approver, setApprover] = useState<Approver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setApprover(null); setError(null); setBusy(false); }, [request]);

  return (
    <Modal open={!!request} onClose={onClose} title="Manager approval needed" size="md">
      {request && (
        <div className="space-y-5">
          <Callout tone="warning" icon={<LuShieldCheck className="size-5" />} title={request.title}>
            {request.detail}
            {request.amount !== undefined && <span className="num font-semibold"> · {formatMoney(Math.abs(request.amount))}</span>}
            <p className="mt-1 text-xs">Requested by {posUser?.fullName ?? "current cashier"}. Both names are recorded.</p>
          </Callout>
          {!approver ? (
            <div>
              <p className="mb-3 text-sm font-medium text-ink-700">Who is approving?</p>
              {approvers.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {approvers.map((a) => (
                    <button key={a.id} onClick={() => { setError(null); setApprover(a); }} className="flex flex-col items-center gap-2 rounded-xl p-3 ring-1 ring-ink-200 hover:bg-brand-50 hover:ring-brand-300">
                      <Avatar name={a.fullName} color={a.avatarColor} size="lg" />
                      <span className="text-sm font-medium">{a.displayName}</span>
                      <span className="text-xs text-ink-500">{a.roleName}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <Callout tone="danger">No one on this branch with a PIN can approve this. Ask an owner to adjust your limits or set up a manager.</Callout>
              )}
            </div>
          ) : (
            <div className="text-center">
              <p className="mb-4 text-sm text-ink-600"><span className="font-semibold text-ink-900">{approver.fullName}</span>, enter your PIN to approve.</p>
              <PinPad
                error={error}
                busy={busy}
                onComplete={async (pin) => {
                  setBusy(true);
                  try {
                    const id = await actions.approveAction({ terminalId: terminal?.id ?? null, approverId: approver.id, pin, action: request.action,
                      amount: request.amount !== undefined ? Math.abs(request.amount) : undefined, detail: request.detail });
                    onApproved(approver, id);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <button onClick={() => setApprover(null)} className="mt-4 text-sm text-ink-500 hover:text-ink-900">Choose someone else</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ═════════════ Discount ═════════════ */
export function DiscountModal({
  open, onClose, subtotal, limitPercent, onApply,
}: { open: boolean; onClose: () => void; subtotal: number; limitPercent: number; onApply: (amount: number, needsApproval: boolean, label: string, reason: string) => void }) {
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) { setValue(""); setReason(""); } }, [open]);
  const n = Number(value) || 0;
  const amount = kind === "percent" ? (subtotal * n) / 100 : n;
  const pct = subtotal ? (amount / subtotal) * 100 : 0;
  const over = pct > limitPercent;
  const invalid = amount <= 0 || amount > subtotal;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cart discount"
      description={`Your limit: ${limitPercent}% without approval`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={invalid || reason.trim().length < 2} onClick={() => onApply(amount, over, kind === "percent" ? `${n}%` : formatMoney(n), reason.trim())}>
            {over ? "Request approval" : "Apply discount"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented value={kind} onChange={setKind} options={[{ value: "percent", label: "Percent %" }, { value: "amount", label: "Amount GH₵" }]} />
        <Input label={kind === "percent" ? "Discount (%)" : "Discount (GH₵)"} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} autoFocus />
        <div className="flex flex-wrap gap-2">
          {(kind === "percent" ? [2, 5, 10, 15] : [5, 10, 20, 50]).map((q) => (
            <button key={q} onClick={() => setValue(String(q))} className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-ink-200 hover:bg-ink-50">{kind === "percent" ? `${q}%` : `GH₵ ${q}`}</button>
          ))}
        </div>
        <Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Loyal customer, damaged box" rows={2} />
        {!invalid && (
          <div className="rounded-lg bg-ink-50 p-3 text-sm">
            <div className="flex justify-between"><span>Discount</span><span className="num font-semibold">−{formatMoney(amount)} ({pct.toFixed(1)}%)</span></div>
            <div className="flex justify-between text-ink-500"><span>New total</span><span className="num">{formatMoney(subtotal - amount)}</span></div>
          </div>
        )}
        {over && !invalid && <Callout tone="warning" icon={<LuShieldCheck className="size-4" />}>This is above your {limitPercent}% limit. A manager will need to approve.</Callout>}
        {amount > subtotal && <p className="text-sm text-rose-600">Discount can't be more than the subtotal.</p>}
      </div>
    </Modal>
  );
}

/* ═════════════ Customer picker ═════════════ */
export function CustomerModal({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: Customer) => void }) {
  const customers = useCustomers().data;
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setQ(""); setCreating(false); setForm({ name: "", phone: "", email: "" }); setErr(null); } }, [open]);
  const list = customers.filter((c) => (c.name + c.phone).toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  return (
    <Modal open={open} onClose={onClose} title={creating ? "New customer" : "Attach customer"} size="md">
      {creating ? (
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true); setErr(null);
          try { onPick(await actions.saveCustomer(form)); } catch (er) { setErr((er as Error).message); } finally { setBusy(false); }
        }}>
          {err && <Callout tone="danger">{err}</Callout>}
          <Input label="Full name" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Phone" required inputMode="tel" placeholder="024 000 0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Email" type="email" hint="Optional" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>Back</Button>
            <Button type="submit" loading={busy} disabled={form.name.trim().length < 2 || form.phone.trim().length < 9}>Save & attach</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <SearchInput className="flex-1" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <Button variant="secondary" icon={<LuUserPlus className="size-4" />} onClick={() => { setCreating(true); if (/^\d/.test(q)) setForm((f) => ({ ...f, phone: q })); else setForm((f) => ({ ...f, name: q })); }}>New</Button>
          </div>
          <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto rounded-lg ring-1 ring-ink-200">
            {list.map((c) => (
              <li key={c.id}>
                <button onClick={() => onPick(c)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-50">
                  <Avatar name={c.name} size="sm" color="bg-ink-500" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink-900">{c.name}</p>
                    <p className="text-xs text-ink-500">{c.phone}</p>
                  </div>
                  <span className="num text-xs text-ink-500">{c.visits} visits</span>
                </button>
              </li>
            ))}
            {!list.length && <li className="p-6 text-center text-sm text-ink-500">{q ? `No customer matches “${q}”.` : "No customers yet."}</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/* ═════════════ Held carts ═════════════ */
export function HeldCartsDrawer({ open, onClose, onResume }: { open: boolean; onClose: () => void; onResume: (cart: HeldCart, needsApproval: boolean) => void }) {
  const { posUser, can } = useSession();
  const held = useHeldCarts().data;
  const employees = useEmployees().data;
  const toast = useToast();
  const [confirmDiscard, setConfirmDiscard] = useState<HeldCart | null>(null);
  const canTakeOver = can("pos.take_over_cart") || (!!posUser && posUser.overrides.some((o) => o.permission === "pos.take_over_cart" && o.effect === "grant"));
  return (
    <Drawer open={open} onClose={onClose} title="Held carts" description="Parked sales waiting to be completed">
      {held.length === 0 ? (
        <EmptyState title="No held carts" description="Use “Hold” on the cart to park a sale and serve the next customer." />
      ) : (
        <ul className="space-y-3">
          {held.map((h) => {
            const owner = employees.find((e) => e.id === h.ownerId);
            const mine = h.ownerId === posUser?.id;
            const total = h.lines.reduce((s, l) => s + l.unitPrice * l.quantity - l.discount, 0);
            return (
              <li key={h.id} className="rounded-xl p-4 ring-1 ring-ink-200">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink-900">{h.note || "Untitled"}</p>
                    <p className="text-xs text-ink-500">{owner?.fullName ?? "Someone"} · {timeAgo(h.createdAt)} · {h.lines.length} item{h.lines.length > 1 && "s"}</p>
                  </div>
                  <span className="num font-semibold">{formatMoney(total)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {mine ? <Badge tone="brand">Yours</Badge> : <Badge>{owner?.displayName ?? "Other"}'s cart</Badge>}
                  <div className="flex gap-2">
                    {(mine || canTakeOver) && <Button size="sm" variant="ghost" icon={<LuTrash2 className="size-4" />} onClick={() => setConfirmDiscard(h)}>Discard</Button>}
                    <Button size="sm" onClick={() => onResume(h, !mine && !canTakeOver)}>{mine || canTakeOver ? "Resume" : "Resume (needs approval)"}</Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!confirmDiscard}
        onClose={() => setConfirmDiscard(null)}
        title="Discard this held cart?"
        message={confirmDiscard?.note ? `“${confirmDiscard.note}” will be removed. This can't be undone.` : "This parked sale will be removed. This can't be undone."}
        confirmLabel="Discard cart"
        onConfirm={async () => {
          const cart = confirmDiscard;
          setConfirmDiscard(null);
          if (!cart) return;
          try { await actions.discardHeldCart(cart.id); toast({ tone: "success", title: "Held cart discarded" }); }
          catch (e) { toast({ tone: "error", title: (e as Error).message }); }
        }}
      />
    </Drawer>
  );
}

/* ═════════════ Cash in / out ═════════════ */
export type CashMoveType = "paid_in" | "paid_out" | "drop" | "no_sale";
export const cashMoveLabel: Record<CashMoveType, string> = { paid_in: "Cash in", paid_out: "Cash out", drop: "Cash drop (to safe)", no_sale: "Open drawer (no sale)" };

export function CashMovementModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: { type: CashMoveType; amount: number; reason: string; needsApproval: boolean }) => void }) {
  const { can, role } = useSession();
  const [type, setType] = useState<CashMoveType>("paid_out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) { setAmount(""); setReason(""); } }, [open]);
  const n = Number(amount) || 0;
  const needsApproval = type === "no_sale" ? !(can("pos.no_sale") || role.limits.allowNoSale) : type === "drop" ? !can("pos.approve") : false;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cash drawer"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={(type !== "no_sale" && n <= 0) || reason.trim().length < 2} onClick={() => onDone({ type, amount: n, reason: reason.trim(), needsApproval })}>{needsApproval ? "Get approval" : "Record"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(cashMoveLabel) as CashMoveType[]).map((k) => (
            <button key={k} onClick={() => setType(k)} className={cn("rounded-lg px-3 py-2.5 text-sm font-medium ring-1", type === k ? "bg-brand-50 text-brand-800 ring-brand-400" : "ring-ink-200 hover:bg-ink-50")}>
              {cashMoveLabel[k]}
            </button>
          ))}
        </div>
        {type !== "no_sale" && <Input label="Amount" prefix="GH₵" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} autoFocus />}
        <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === "paid_out" ? "e.g. Bought printer paper" : type === "drop" ? "e.g. Too much cash in drawer" : "Reason"} />
        {needsApproval && <Callout tone="info">This needs manager approval.</Callout>}
      </div>
    </Modal>
  );
}

/* ═════════════ X report (mid-shift) ═════════════ */
export function XReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { posUser, terminal, shiftId } = useSession();
  const q = useShiftSummary(open ? shiftId : null);
  const refetch = q.refetch;
  const shift = q.data?.shift;
  useEffect(() => { if (open) refetch(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} title="X report" description="Mid-shift summary - does not close the shift" size="md" footer={<Button variant="secondary" icon={<LuPrinter className="size-4" />} onClick={() => window.print()}>Print</Button>}>
      {q.loading ? <p className="text-sm text-ink-500">Loading…</p> : shift ? (
        <div className="space-y-5">
          <DL items={[
            { label: "Employee", value: posUser?.fullName ?? "-" },
            { label: "Till", value: terminal?.name },
            { label: "Opened", value: formatTime(shift.openedAt) },
            { label: "Sales", value: <span className="num">{shift.salesCount} · {formatMoney(shift.salesTotal)}</span> },
          ]} />
          <div className="rounded-lg ring-1 ring-ink-200">
            {(Object.keys(shift.byMethod) as PaymentMethod[]).map((m) => (
              <div key={m} className="flex justify-between border-b border-ink-100 px-4 py-2.5 text-sm last:border-0">
                <span>{methodLabel[m]}{m === "cash" ? " (after change)" : ""}</span><span className="num font-medium">{formatMoney(shift.byMethod[m])}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between rounded-lg bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800">
            <span>Expected cash in drawer</span><span className="num">{formatMoney(shift.expectedCash)}</span>
          </div>
        </div>
      ) : (
        <EmptyState title="No open shift" />
      )}
    </Modal>
  );
}

/* ═════════════ Payment ═════════════ */
const methods: { value: PaymentMethod; label: string; icon: ReactNode }[] = [
  { value: "cash", label: "Cash", icon: <LuBanknote className="size-5" /> },
  { value: "momo", label: "MoMo", icon: <LuSmartphone className="size-5" /> },
  { value: "card", label: "Card", icon: <LuCreditCard className="size-5" /> },
  { value: "bank", label: "Bank", icon: <LuLandmark className="size-5" /> },
];

export function PaymentModal({
  open, onClose, total, lines, customer, cartDiscount, discountReason, discountApprovalId, priceApprovalId, idempotencyKey, onComplete,
}: {
  open: boolean; onClose: () => void; total: number; lines: CartLine[]; customer: Customer | null; cartDiscount: number; discountReason?: string;
  discountApprovalId?: string | null; priceApprovalId?: string | null; idempotencyKey: string; onComplete: () => void;
}) {
  const { posUser, terminal, branch, business } = useSession();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [paystackBusy, setPaystackBusy] = useState(false);
  const [tenders, setTenders] = useState<PaymentLine[]>([]);
  const [stage, setStage] = useState<"pay" | "processing" | "done" | "error">("pay");
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [error, setError] = useState("");
  // The key belongs to the cart (owned by PosPage), so closing/reopening this modal can't create a second sale.

  useEffect(() => {
    if (open) {
      setTenders([]); setStage("pay"); setMethod("cash"); setAmount(""); setRef("");
      setContactEmail(customer?.email ?? ""); setPayerEmail(""); setPaystackBusy(false); setReceipt(null); setError("");
    }
  }, [open, idempotencyKey]);

  const paid = tenders.reduce((s, t) => s + t.amount, 0);
  const remaining = Math.max(0, +(total - paid).toFixed(2));
  const entered = amount === "" ? remaining : Number(amount) || 0;
  // Only cash can be over-tendered, so any overpayment is change due.
  const cashChange = paid > total ? +(paid - total).toFixed(2) : 0;

  const complete = async (payments = tenders) => {
    if (!terminal) return;
    setStage("processing");
    try {
      const r = await actions.checkout({ terminalId: terminal.id, lines, payments, customerId: customer?.id,
        customer: customer
          ? { name: customer.name, phone: customer.phone, email: payerEmail || contactEmail || customer.email }
          : payerEmail ? { email: payerEmail } : undefined,
        cartDiscount, discountReason, discountApprovalId, priceApprovalId, idempotencyKey });
      setReceipt({ ...r, servedBy: r.servedBy || posUser?.displayName || "", terminal: r.terminal || terminal.name, branch: r.branch || branch.name, customer: r.customer ?? customer?.name,
        business: r.business ?? (business ? { name: business.name, phone: business.phone, tin: business.tin } : undefined) });
      setStage("done");
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    }
  };

  /**
   * MoMo now starts in Paystack: reserve a reference on the server, open Inline so the customer
   * supplies their contact and MoMo number, then verify and complete the sale from the callback.
   */
  const startPaystack = async (payAmount: number) => {
    if (!terminal || paystackBusy || !(payAmount > 0)) return;
    setError("");
    setPaystackBusy(true);
    try {
      const init = await actions.initializePaystack({ amount: payAmount, email: contactEmail.trim() || customer?.email || "", phone: customer?.phone || "" });
      const finish = (responseReference: string) => {
        const reference = responseReference || init.reference;
        const phone = normalizePhone(customer?.phone ?? "");
        const network = detectNetwork(phone);
        const next: PaymentLine = {
          method: "momo", amount: init.amount, reference: `Paystack ${reference}`,
          ...(phone ? { phone } : {}), ...(network !== "Unknown" ? { network } : {}),
          paystackReference: reference,
        };
        const updated = [...tenders, next];
        setPayerEmail(init.email);
        setTenders(updated);
        setPaystackBusy(false);
        if (updated.reduce((sum, t) => sum + t.amount, 0) >= total - 0.001) void complete(updated);
      };

      if (DEMO) { finish(init.reference); return; }

      await openPaystackDialog({
        key: init.publicKey,
        email: init.email,
        amount: Math.round(init.amount * 100),
        currency: "GHS",
        ref: init.reference,
        channels: ["mobile_money"],
        metadata: { custom_fields: [{ display_name: "Receipt", variable_name: "receipt", value: idempotencyKey }] },
        callback: (response) => finish(String(response?.reference ?? init.reference)),
        onClose: () => setPaystackBusy(false),
      });
    } catch (e) {
      setPaystackBusy(false);
      setError((e as Error).message);
      setStage("error");
    }
  };

  const chooseMethod = (next: PaymentMethod) => {
    setMethod(next);
    if (next === "momo" && remaining > 0) void startPaystack(remaining);
  };

  const addTender = () => {
    if (entered <= 0 || entered > remaining || method === "momo") return;
    setTenders((t) => [...t, { method, amount: +entered.toFixed(2), reference: ref || undefined }]);
    setAmount("");
    setRef("");
  };

  const covered = paid >= total && total >= 0 && (tenders.length > 0 || total === 0);

  return (
    <Modal open={open} onClose={stage === "processing" || paystackBusy ? () => {} : stage === "done" ? onComplete : onClose} size="lg" dismissible={stage !== "processing" && !paystackBusy} title={stage === "done" ? undefined : "Take payment"}>
      {stage === "done" && receipt ? (
        <div className="grid justify-items-center gap-6 py-2 lg:grid-cols-[1fr_auto]">
          <div className="flex w-full flex-col items-center justify-center text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><LuCircleCheck className="size-9" /></div>
            <h2 className="mt-4 text-2xl font-semibold text-ink-900">Sale complete</h2>
            <p className="text-sm text-ink-500">Receipt {receipt.receiptNumber}</p>
            {!!receipt.paymentNotices?.length && (
              <div className="mt-3 w-full max-w-xs space-y-2 text-left">
                {receipt.paymentNotices.map((notice, i) => <Callout key={i} tone="info">{notice}</Callout>)}
              </div>
            )}
            {!!receipt.change && (
              <div className="mt-6 rounded-2xl bg-amber-50 px-8 py-4 ring-1 ring-amber-200">
                <p className="text-sm font-medium text-amber-800">Give change</p>
                <p className="num text-4xl font-bold text-amber-900">{formatMoney(receipt.change)}</p>
              </div>
            )}
            <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
              <Button size="lg" icon={<LuPrinter className="size-5" />} onClick={() => window.print()}>Print receipt</Button>
              <Button size="lg" variant="secondary" onClick={onComplete} autoFocus>New sale</Button>
            </div>
          </div>
          <div className="receipt-printer" aria-label="Printing receipt">
            <div className="printer-body print:hidden">
              <span className="printer-led" />
              <span className="printer-label">Famous TechX · Thermal printer</span>
              <span className="printer-head" />
            </div>
            <div className="printer-slot print:hidden" />
            <div className="receipt-output">
              <Receipt data={receipt} className="print-area" />
              <div className="receipt-tear print:hidden" aria-hidden />
            </div>
          </div>
        </div>
      ) : stage === "error" ? (
        <div className="space-y-4 text-center">
          <Callout tone="danger" title="Checkout didn't go through">{error} Your cart is still here. Retrying is safe - if the sale was saved, the same receipt is returned instead of charging again.</Callout>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={onClose}>Back to cart</Button>
            <Button onClick={() => void complete()}>Retry</Button>
          </div>
        </div>
      ) : stage === "processing" ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-center">
          <div className="size-14 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
          <div>
            <h2 className="text-lg font-semibold text-ink-900">Completing your sale</h2>
            <p className="mt-1 text-sm text-ink-500">Saving the payment and printing your receipt.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {methods.map((m) => (
                <button
                  key={m.value}
                  onClick={() => chooseMethod(m.value)}
                  className={cn("flex flex-col items-center gap-1 rounded-xl py-3 text-sm font-medium ring-1 transition-colors", method === m.value ? "bg-brand-600 text-white ring-brand-600" : "text-ink-700 ring-ink-200 hover:bg-ink-50")}
                >
                  {m.icon}{m.label}
                </button>
              ))}
            </div>
            {method === "momo" ? (
              <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-100">
                Paystack will ask the customer for <span className="num font-bold">{formatMoney(remaining)}</span>.
              </div>
            ) : (
              <Input
                label={`Amount (${methodLabel[method]})`}
                prefix="GH₵"
                inputMode="decimal"
                placeholder={remaining.toFixed(2)}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTender(); } }}
                hint={method !== "cash" ? "Can't be more than the remaining balance." : "Enter cash received - change is calculated."}
              />
            )}
            {method === "cash" && (
              <div className="flex flex-wrap gap-2">
                {[remaining, ...[...new Set([10, 50, 100, 500, 1000].map((m) => Math.ceil(remaining / m) * m))].filter((v) => v > remaining)].slice(0, 5).map((v, i) => (
                  <button key={i} onClick={() => setAmount(String(v))} className="num rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-ink-200 hover:bg-ink-50">{i === 0 ? "Exact" : formatMoney(v)}</button>
                ))}
              </div>
            )}
            {method === "momo" && (
              <div className="space-y-3">
                <Input
                  label="Email for the receipt"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder={customer?.email || "customer@example.com"}
                  hint="Paystack shows this in its dialog. The customer can change it there."
                />
                <Callout tone="info" icon={<LuSmartphone className="size-5" />}>
                  Paystack asks for the customer's mobile money number and email, then confirms the payment. MTN, Telecel and AirtelTigo all work. The receipt prints automatically.
                </Callout>
                <Button block size="lg" variant="checkout" icon={<LuSmartphone className="size-5" />} disabled={paystackBusy || remaining <= 0} loading={paystackBusy} onClick={() => void startPaystack(remaining)}>
                  {paystackBusy ? "Opening Paystack..." : `Pay ${formatMoney(remaining)} with Paystack`}
                </Button>
              </div>
            )}
            {(method === "card" || method === "bank") && <Input label="Reference" hint="Optional" value={ref} onChange={(e) => setRef(e.target.value)} />}
            {method !== "cash" && method !== "momo" && (
              <Callout tone="info">Recorded manually. Confirm you've seen the payment before adding it - it isn't verified electronically.</Callout>
            )}
            {method !== "momo" && (
              <Button block variant="outline" icon={<LuPlus className="size-4" />} disabled={entered <= 0 || (method !== "cash" && entered > remaining) || remaining === 0} onClick={addTender}>
                Add {formatMoney(entered)} {methodLabel[method]}
              </Button>
            )}
          </div>

          <div className="flex flex-col rounded-xl bg-ink-50 p-4 ring-1 ring-ink-200">
            <p className="text-sm text-ink-500">Total due</p>
            <p className="num text-3xl font-bold text-ink-900">{formatMoney(total)}</p>
            <div className="my-4 flex-1 space-y-2">
              {tenders.map((t, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-ink-200">
                  <div>
                    <p className="font-medium">{methodLabel[t.method]}</p>
                    {t.reference && <p className="text-xs text-ink-500">{t.paystackReference ? `Paystack · ${t.paystackReference.slice(-8)}` : t.method === "momo" ? `${t.network ?? detectNetwork(t.reference)} · ${formatPhone(t.reference)}` : t.reference}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="num">{formatMoney(t.amount)}</span>
                    <button aria-label="Remove payment" className="text-ink-400 hover:text-rose-600" onClick={() => setTenders((x) => x.filter((_, j) => j !== i))}><LuTrash2 className="size-4" /></button>
                  </div>
                </div>
              ))}
              {!tenders.length && <p className="text-sm text-ink-400">Add one or more payments. Split across methods if needed.</p>}
            </div>
            <div className="space-y-1 border-t border-ink-200 pt-3 text-sm">
              <div className="flex justify-between"><span>Paid</span><span className="num">{formatMoney(paid)}</span></div>
              <div className={cn("flex justify-between font-semibold", remaining > 0 ? "text-rose-600" : "text-emerald-700")}>
                <span>{remaining > 0 ? "Remaining" : "Change"}</span>
                <span className="num">{formatMoney(remaining > 0 ? remaining : cashChange)}</span>
              </div>
            </div>
            <Button size="lg" variant="checkout" className="mt-4" disabled={!covered} onClick={() => void complete()}>
              Complete sale
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
