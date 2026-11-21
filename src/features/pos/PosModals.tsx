import { useEffect, useState, type ReactNode } from "react";
import {
  LuBanknote, LuCircleCheck, LuCreditCard, LuLandmark, LuPlus, LuPrinter, LuShieldCheck, LuSmartphone, LuTrash2, LuUserPlus,
} from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useCustomers, useEmployees, useHeldCarts, useShifts } from "@/services/api";
import {
  Avatar, Badge, Button, Callout, DL, Drawer, EmptyState, Input, Modal, PinPad, SearchInput, Segmented, Select, Textarea,
} from "@/components/ui";
import { cn, formatMoney, formatTime, methodLabel, timeAgo } from "@/lib/format";
import type { CartLine, Customer, Employee, PaymentLine, PaymentMethod } from "@/types";
import { Receipt, type ReceiptData } from "./Receipt";

/* ═════════════ Manager approval ═════════════ */
export interface ApprovalRequest {
  title: string;      // e.g. "Discount above your limit"
  detail: string;     // e.g. "15% on Samsung Galaxy A15 (your limit is 5%)"
  amount?: number;
  permission: string; // permission the approver must hold
}

export function ApprovalModal({ request, onClose, onApproved }: { request: ApprovalRequest | null; onClose: () => void; onApproved: (approver: Employee) => void }) {
  const { branch, roleOf, posUser } = useSession();
  const approvers = useEmployees().data.filter(
    (e) => e.status === "active" && e.id !== posUser?.id && e.branchIds.includes(branch.id) && roleOf(e).permissions.includes(request?.permission ?? "pos.approve"),
  );
  const [approver, setApprover] = useState<Employee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setApprover(null); setError(null); }, [request]);

  return (
    <Modal open={!!request} onClose={onClose} title="Manager approval needed" size="md">
      {request && (
        <div className="space-y-5">
          <Callout tone="warning" icon={<LuShieldCheck className="size-5" />} title={request.title}>
            {request.detail}
            {request.amount !== undefined && <span className="num font-semibold"> · {formatMoney(request.amount)}</span>}
            <p className="mt-1 text-xs">Requested by {posUser?.fullName ?? "current cashier"}. Both names are recorded.</p>
          </Callout>
          {!approver ? (
            <div>
              <p className="mb-3 text-sm font-medium text-ink-700">Who is approving?</p>
              {approvers.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {approvers.map((a) => (
                    <button key={a.id} onClick={() => setApprover(a)} className="flex flex-col items-center gap-2 rounded-xl p-3 ring-1 ring-ink-200 hover:bg-brand-50 hover:ring-brand-300">
                      <Avatar name={a.fullName} color={a.avatarColor} size="lg" />
                      <span className="text-sm font-medium">{a.displayName}</span>
                      <span className="text-xs text-ink-500">{roleOf(a).name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <Callout tone="danger">No one on this branch can approve this action. Cancel and ask an owner to adjust your limits.</Callout>
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
                  const ok = await actions.approveAction(approver.id, pin, { type: request.title, amount: request.amount }); // LOGIC
                  setBusy(false);
                  if (ok) onApproved(approver);
                  else setError("Wrong PIN or not allowed to approve.");
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
}: { open: boolean; onClose: () => void; subtotal: number; limitPercent: number; onApply: (amount: number, needsApproval: boolean, label: string) => void }) {
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
          <Button disabled={invalid || reason.trim().length < 2} onClick={() => onApply(amount, over, kind === "percent" ? `${n}%` : formatMoney(n))}>
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
  const list = customers.filter((c) => (c.name + c.phone).toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title={creating ? "New customer" : "Attach customer"} size="md">
      {creating ? (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setCreating(false); }}>
          <Input label="Full name" required autoFocus />
          <Input label="Phone" required inputMode="tel" placeholder="024 000 0000" />
          <Input label="Email" type="email" hint="Optional" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>Back</Button>
            <Button type="submit">Save & attach</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <SearchInput className="flex-1" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <Button variant="secondary" icon={<LuUserPlus className="size-4" />} onClick={() => setCreating(true)}>New</Button>
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
            {!list.length && <li className="p-6 text-center text-sm text-ink-500">No customer matches “{q}”.</li>}
          </ul>
        </div>
      )}
    </Modal>
  );
}

/* ═════════════ Held carts ═════════════ */
export function HeldCartsDrawer({ open, onClose, onResume }: { open: boolean; onClose: () => void; onResume: (lines: CartLine[], needsApproval: boolean) => void }) {
  const { posUser, roleOf } = useSession();
  const held = useHeldCarts().data;
  const employees = useEmployees().data;
  const canTakeOver = posUser ? (posUser.overrides.some((o) => o.permission === "pos.take_over_cart" && o.effect === "grant") || roleOf(posUser).permissions.includes("pos.take_over_cart")) : false;
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
                    <p className="text-xs text-ink-500">{owner?.fullName} · {timeAgo(h.createdAt)} · {h.lines.length} item{h.lines.length > 1 && "s"}</p>
                  </div>
                  <span className="num font-semibold">{formatMoney(total)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  {mine ? <Badge tone="brand">Yours</Badge> : <Badge>{owner?.displayName}'s cart</Badge>}
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" icon={<LuTrash2 className="size-4" />}>Discard</Button>
                    <Button size="sm" onClick={() => onResume(h.lines, !mine && !canTakeOver)}>{mine || canTakeOver ? "Resume" : "Resume (needs approval)"}</Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

/* ═════════════ Cash in / out ═════════════ */
export function CashMovementModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (needsApproval: boolean, amount: number, type: string) => void }) {
  const [type, setType] = useState<"paid_in" | "paid_out" | "drop" | "no_sale">("paid_out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) { setAmount(""); setReason(""); } }, [open]);
  const n = Number(amount) || 0;
  const labels = { paid_in: "Cash in", paid_out: "Cash out", drop: "Cash drop (to safe)", no_sale: "Open drawer (no sale)" };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cash drawer"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={(type !== "no_sale" && n <= 0) || reason.trim().length < 2} onClick={() => onDone(type === "no_sale" || type === "drop", n, labels[type])}>Record</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
            <button key={k} onClick={() => setType(k)} className={cn("rounded-lg px-3 py-2.5 text-sm font-medium ring-1", type === k ? "bg-brand-50 text-brand-800 ring-brand-400" : "ring-ink-200 hover:bg-ink-50")}>
              {labels[k]}
            </button>
          ))}
        </div>
        {type !== "no_sale" && <Input label="Amount" prefix="GH₵" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} autoFocus />}
        <Textarea label="Reason" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === "paid_out" ? "e.g. Bought printer paper" : type === "drop" ? "e.g. Too much cash in drawer" : "Reason"} />
        {(type === "no_sale" || type === "drop") && <Callout tone="info">This needs manager approval.</Callout>}
      </div>
    </Modal>
  );
}

/* ═════════════ X report (mid-shift) ═════════════ */
export function XReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const shift = useShifts().data.find((s) => s.status === "open");
  const { posUser, terminal } = useSession();
  return (
    <Modal open={open} onClose={onClose} title="X report" description="Mid-shift summary — does not close the shift" size="md" footer={<Button variant="secondary" icon={<LuPrinter className="size-4" />} onClick={() => window.print()}>Print</Button>}>
      {shift ? (
        <div className="space-y-5">
          <DL items={[
            { label: "Employee", value: posUser?.fullName ?? "—" },
            { label: "Till", value: terminal?.name },
            { label: "Opened", value: formatTime(shift.openedAt) },
            { label: "Sales", value: <span className="num">{shift.salesCount} · {formatMoney(shift.salesTotal)}</span> },
          ]} />
          <div className="rounded-lg ring-1 ring-ink-200">
            {(Object.keys(shift.byMethod) as PaymentMethod[]).map((m) => (
              <div key={m} className="flex justify-between border-b border-ink-100 px-4 py-2.5 text-sm last:border-0">
                <span>{methodLabel[m]}</span><span className="num font-medium">{formatMoney(shift.byMethod[m])}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between rounded-lg bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-900">
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
  open, onClose, total, lines, subtotal, discount, customer, onComplete,
}: {
  open: boolean; onClose: () => void; total: number; subtotal: number; discount: number; lines: CartLine[]; customer: Customer | null;
  onComplete: () => void;
}) {
  const { posUser, terminal, branch } = useSession();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [network, setNetwork] = useState("MTN");
  const [tenders, setTenders] = useState<PaymentLine[]>([]);
  const [stage, setStage] = useState<"pay" | "processing" | "done" | "error">("pay");
  const [receiptNo, setReceiptNo] = useState("");

  useEffect(() => {
    if (open) { setTenders([]); setStage("pay"); setMethod("cash"); setAmount(""); setRef(""); }
  }, [open]);

  const paid = tenders.reduce((s, t) => s + t.amount, 0);
  const remaining = Math.max(0, +(total - paid).toFixed(2));
  const entered = amount === "" ? remaining : Number(amount) || 0;
  // Only cash can be over-tendered, so any overpayment is change due.
  const cashChange = paid > total ? +(paid - total).toFixed(2) : 0;

  const addTender = () => {
    if (entered <= 0) return;
    if (method !== "cash" && entered > remaining) return; // only cash can exceed (change)
    setTenders((t) => [...t, { method, amount: entered, reference: method === "momo" ? `${network} ${ref}`.trim() : ref || undefined }]);
    setAmount("");
    setRef("");
  };

  const complete = async () => {
    setStage("processing");
    try {
      // LOGIC: one atomic, idempotent checkout call (SRS §5.2)
      const res = await actions.checkout({ lines, payments: tenders, customerId: customer?.id, idempotencyKey: crypto.randomUUID() });
      setReceiptNo(res.receiptNumber);
      setStage("done");
    } catch {
      setStage("error");
    }
  };

  const receipt: ReceiptData = {
    receiptNumber: receiptNo, createdAt: new Date().toISOString(), servedBy: posUser?.displayName ?? "", terminal: terminal?.name ?? "", branch: branch.name,
    customer: customer?.name, items: lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount })),
    subtotal, discountTotal: discount, taxTotal: 0, total, payments: tenders, change: cashChange,
  };

  const covered = paid >= total;

  return (
    <Modal open={open} onClose={stage === "processing" ? () => {} : stage === "done" ? onComplete : onClose} size="lg" dismissible={stage !== "processing"} title={stage === "done" ? undefined : "Take payment"}>
      {stage === "done" ? (
        <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><LuCircleCheck className="size-9" /></div>
            <h2 className="mt-4 text-2xl font-semibold text-ink-900">Sale complete</h2>
            <p className="text-sm text-ink-500">Receipt {receiptNo}</p>
            {cashChange > 0 && (
              <div className="mt-6 rounded-2xl bg-amber-50 px-8 py-4 ring-1 ring-amber-200">
                <p className="text-sm font-medium text-amber-800">Give change</p>
                <p className="num text-4xl font-bold text-amber-900">{formatMoney(cashChange)}</p>
              </div>
            )}
            <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
              <Button size="lg" icon={<LuPrinter className="size-5" />} onClick={() => window.print()}>Print receipt</Button>
              <Button size="lg" variant="secondary" onClick={onComplete}>New sale</Button>
            </div>
          </div>
          <Receipt data={receipt} className="hidden sm:block" />
        </div>
      ) : stage === "error" ? (
        <div className="space-y-4 text-center">
          <Callout tone="danger" title="Checkout didn't go through">No sale was saved and no stock was deducted. Your cart is still here — check the connection and try again.</Callout>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={onClose}>Back to cart</Button>
            <Button onClick={complete}>Retry</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {methods.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMethod(m.value)}
                  className={cn("flex flex-col items-center gap-1 rounded-xl py-3 text-sm font-medium ring-1 transition-colors", method === m.value ? "bg-brand-700 text-white ring-brand-700" : "text-ink-700 ring-ink-200 hover:bg-ink-50")}
                >
                  {m.icon}{m.label}
                </button>
              ))}
            </div>
            <Input
              label={`Amount (${methodLabel[method]})`}
              prefix="GH₵"
              inputMode="decimal"
              placeholder={remaining.toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              hint={method !== "cash" ? "Can't be more than the remaining balance." : "Enter cash received — change is calculated."}
            />
            {method === "cash" && (
              <div className="flex flex-wrap gap-2">
                {[remaining, ...[...new Set([10, 50, 100, 500, 1000].map((m) => Math.ceil(remaining / m) * m))].filter((v) => v > remaining)].slice(0, 5).map((v, i) => (
                  <button key={i} onClick={() => setAmount(String(v))} className="num rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-ink-200 hover:bg-ink-50">{i === 0 ? "Exact" : formatMoney(v)}</button>
                ))}
              </div>
            )}
            {method === "momo" && (
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <Select label="Network" value={network} onChange={(e) => setNetwork(e.target.value)}>
                  <option>MTN</option><option>Telecel</option><option>AT</option>
                </Select>
                <Input label="Transaction ID" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="From the customer's SMS" />
              </div>
            )}
            {(method === "card" || method === "bank") && <Input label="Reference" hint="Optional" value={ref} onChange={(e) => setRef(e.target.value)} />}
            {method !== "cash" && (
              <Callout tone="info">Recorded manually. Confirm you've seen the payment before adding it — it isn't verified electronically.</Callout>
            )}
            <Button block variant="outline" icon={<LuPlus className="size-4" />} disabled={entered <= 0 || (method !== "cash" && entered > remaining) || remaining === 0} onClick={addTender}>
              Add {formatMoney(entered)} {methodLabel[method]}
            </Button>
          </div>

          <div className="flex flex-col rounded-xl bg-ink-50 p-4 ring-1 ring-ink-200">
            <p className="text-sm text-ink-500">Total due</p>
            <p className="num text-3xl font-bold text-ink-900">{formatMoney(total)}</p>
            <div className="my-4 flex-1 space-y-2">
              {tenders.map((t, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-ink-200">
                  <div>
                    <p className="font-medium">{methodLabel[t.method]}</p>
                    {t.reference && <p className="text-xs text-ink-500">{t.reference}</p>}
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
            <Button size="lg" variant="success" className="mt-4" disabled={!covered} loading={stage === "processing"} onClick={complete}>
              Complete sale
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
