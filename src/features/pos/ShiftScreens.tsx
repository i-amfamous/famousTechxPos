import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { LuArrowLeft, LuCircleCheck, LuClock, LuLock, LuPrinter, LuShieldCheck } from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useShiftSummary } from "@/services/api";
import { Avatar, Badge, Button, Callout, Card, CardHeader, Input, Textarea, useToast } from "@/components/ui";
import { cn, formatMoney, formatTime, methodLabel } from "@/lib/format";
import type { PaymentMethod } from "@/types";
import { ApprovalModal } from "./PosModals";

const NOTES = [200, 100, 50, 20, 10, 5, 2, 1];
const COINS = [2, 1, 0.5, 0.2, 0.1];

/** Shell used by the shift screens on the terminal. */
function TerminalShell({ title, children, back }: { title: string; children: ReactNode; back?: () => void }) {
  const { posUser, terminal, branch } = useSession();
  return (
    <div className="min-h-full bg-ink-100">
      <header className="flex h-14 items-center gap-3 border-b border-ink-200 bg-white px-4 text-ink-900">
        {back && <button onClick={back} aria-label="Back" className="rounded-lg p-1.5 hover:bg-ink-100"><LuArrowLeft className="size-5" /></button>}
        <h1 className="font-semibold">{title}</h1>
        <span className="text-sm text-ink-500">· {terminal?.name} · {branch.name}</span>
        {posUser && (
          <span className="ml-auto flex items-center gap-2 rounded-full bg-ink-100 py-1 pl-1 pr-3 text-sm">
            <Avatar name={posUser.fullName} color={posUser.avatarColor} size="sm" /> {posUser.displayName}
          </span>
        )}
      </header>
      <div className="mx-auto max-w-5xl p-4 sm:p-6">{children}</div>
    </div>
  );
}

/* ═════════════ Open shift ═════════════ */
export function OpenShiftPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { posUser, setShiftId, setPosUser, terminal, shiftId } = useSession();
  const [float, setFloat] = useState("300");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (shiftId) navigate("/pos", { replace: true }); }, [shiftId, navigate]);
  if (!posUser) return null;

  const open = async () => {
    if (!terminal) return;
    setBusy(true);
    try {
      const id = await actions.openShift(terminal.id, Number(float) || 0);
      setShiftId(id);
      navigate("/pos");
    } catch (e) {
      toast({ tone: "error", title: "Couldn't open shift", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <TerminalShell title="Open shift">
      <div className="mx-auto max-w-md">
        <Card className="p-6 sm:p-8">
          <div className="text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><LuClock className="size-7" /></div>
            <h2 className="mt-4 text-xl font-semibold text-ink-900">Start your shift, {posUser.displayName}</h2>
            <p className="mt-1 text-sm text-ink-500">Count the cash in the drawer before you start selling.</p>
          </div>
          <div className="mt-6 space-y-4">
            <Input
              label="Opening float (cash in drawer)"
              prefix="GH₵"
              inputMode="decimal"
              value={float}
              onChange={(e) => setFloat(e.target.value.replace(/[^\d.]/g, ""))}
              className="[&_input]:h-14 [&_input]:text-2xl [&_input]:font-semibold"
              autoFocus
            />
            <div className="flex gap-2">
              {[100, 200, 300, 500].map((v) => (
                <button key={v} onClick={() => setFloat(String(v))} className={cn("num flex-1 rounded-lg py-2 text-sm font-medium ring-1", float === String(v) ? "bg-brand-50 text-brand-800 ring-brand-400" : "ring-ink-200 hover:bg-ink-50")}>GH₵ {v}</button>
              ))}
            </div>
            <Button
              size="xl"
              block
              loading={busy}
              disabled={float === ""}
              onClick={open}
            >
              Open shift & start selling
            </Button>
            <Button variant="ghost" block icon={<LuLock className="size-4" />} onClick={async () => { if (terminal) await actions.lockTerminal(); setPosUser(null); navigate("/pos/lock"); }}>Cancel and lock</Button>
          </div>
        </Card>
      </div>
    </TerminalShell>
  );
}

/* ═════════════ Close shift (Z report) ═════════════ */
export function CloseShiftPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { posUser, setShiftOpen, setPosUser, shiftId, terminal, settings } = useSession();
  const q = useShiftSummary(shiftId);
  const shift = q.data?.shift;
  const moves = q.data?.movements ?? [];
  const threshold = Number(settings.variance_threshold ?? 10);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [approval, setApproval] = useState(false);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [approvedBy, setApprovedBy] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const counted = useMemo(() => +[...NOTES, ...COINS].reduce((s, d) => s + d * (Number(counts[d]) || 0), 0).toFixed(2), [counts]);
  const touched = Object.values(counts).some((v) => v !== "");
  if (!posUser) return null;
  if (q.loading) return <TerminalShell title="Close shift" back={() => navigate("/pos")}><p className="text-sm text-ink-500">Loading shift…</p></TerminalShell>;
  if (!shift) return <TerminalShell title="Close shift" back={() => navigate("/pos")}><Callout tone="info" title="No open shift on this till">Open a shift from the lock screen to start selling.</Callout></TerminalShell>;
  const variance = +(counted - shift.expectedCash).toFixed(2);
  const needsApproval = touched && Math.abs(variance) > threshold;

  const close = async (apprId?: string | null) => {
    if (!shiftId) return;
    setBusy(true);
    try {
      await actions.closeShift(shiftId, Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v) || 0])), note, apprId ?? approvalId);
      setDone(true);
      setShiftOpen(false);
      toast({ tone: "success", title: "Shift closed", body: "Z report saved." });
    } catch (e) {
      toast({ tone: "error", title: "Couldn't close shift", body: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <TerminalShell title="Shift closed">
        <Card className="mx-auto max-w-lg p-8 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><LuCircleCheck className="size-9" /></div>
          <h2 className="mt-4 text-2xl font-semibold">Z report saved</h2>
          <p className="mt-1 text-sm text-ink-500">Counted {formatMoney(counted)} · Variance {variance >= 0 ? "+" : ""}{formatMoney(variance)}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button size="lg" icon={<LuPrinter className="size-5" />} onClick={() => window.print()}>Print Z report</Button>
            <Button size="lg" variant="secondary" icon={<LuLock className="size-5" />} onClick={async () => { if (terminal) await actions.lockTerminal(); setPosUser(null); navigate("/pos/lock"); }}>Lock terminal</Button>
          </div>
        </Card>
      </TerminalShell>
    );
  }

  return (
    <TerminalShell title="Close shift" back={() => navigate("/pos")}>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Count the drawer" description="Enter how many of each note and coin are in the drawer." />
          <DenomGrid title="Notes" denoms={NOTES} counts={counts} setCounts={setCounts} />
          <DenomGrid title="Coins" denoms={COINS} counts={counts} setCounts={setCounts} className="mt-6" />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Shift summary" description={`${posUser.fullName} · opened ${formatTime(shift.openedAt)}`} />
            <dl className="space-y-2 text-sm">
              <Row l="Sales" r={`${shift.salesCount} · ${formatMoney(shift.salesTotal)}`} />
              {(Object.keys(shift.byMethod) as PaymentMethod[]).map((m) => <Row key={m} l={methodLabel[m]!} r={formatMoney(shift.byMethod[m])} muted />)}
              <div className="my-2 border-t border-ink-100" />
              <Row l="Opening float" r={formatMoney(shift.openingFloat)} muted />
              {moves.filter((m) => m.type !== "no_sale").map((m) => <Row key={m.id} l={`${m.type === "paid_in" ? "Cash in" : m.type === "paid_out" ? "Cash out" : "Cash drop"} · ${m.reason}`} r={`${m.type === "paid_in" ? "+" : "−"}${formatMoney(m.amount)}`} muted />)}
              {!!q.data?.refundsCash && <Row l="Cash refunds" r={`−${formatMoney(q.data.refundsCash)}`} muted />}
              <Row l="Expected cash" r={formatMoney(shift.expectedCash)} strong />
              <Row l="Counted cash" r={formatMoney(counted)} strong />
            </dl>
            <div className={cn(
              "mt-4 flex items-center justify-between rounded-xl px-4 py-3",
              !touched ? "bg-ink-50 text-ink-500" : variance === 0 ? "bg-emerald-50 text-emerald-800" : needsApproval ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800",
            )}>
              <span className="text-sm font-medium">{!touched ? "Variance" : variance === 0 ? "Balanced" : variance > 0 ? "Over" : "Short"}</span>
              <span className="num text-xl font-bold">{touched ? `${variance > 0 ? "+" : ""}${formatMoney(variance)}` : "—"}</span>
            </div>
          </Card>

          <Card>
            <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={needsApproval ? "Explain the difference (required)" : "Optional"} required={needsApproval} rows={2} />
            {needsApproval && touched && (
              <div className="mt-3">
                {approvedBy ? (
                  <Badge tone="success"><LuShieldCheck className="size-3.5" /> Approved by {approvedBy}</Badge>
                ) : (
                  <Callout tone="danger" icon={<LuShieldCheck className="size-4" />}>Variance is more than {formatMoney(threshold)}. A manager must approve.</Callout>
                )}
              </div>
            )}
            <Button
              size="lg"
              block
              className="mt-4"
              loading={busy}
              disabled={!touched || (needsApproval && note.trim().length < 3)}
              onClick={() => (needsApproval && !approvedBy ? setApproval(true) : void close())}
            >
              {needsApproval && !approvedBy ? "Get approval & close" : "Close shift"}
            </Button>
          </Card>
        </div>
      </div>

      <ApprovalModal
        request={approval ? { action: "shift_variance", title: "Cash variance on shift close", detail: `${variance > 0 ? "Over" : "Short"} by ${formatMoney(Math.abs(variance))}. Note: ${note}`, amount: Math.abs(variance), permission: "pos.approve" } : null}
        onClose={() => setApproval(false)}
        onApproved={(a, id) => { setApprovedBy(a.fullName); setApprovalId(id); setApproval(false); void close(id); }}
      />
    </TerminalShell>
  );
}

function DenomGrid({ title, denoms, counts, setCounts, className }: { title: string; denoms: number[]; counts: Record<string, string>; setCounts: (f: (c: Record<string, string>) => Record<string, string>) => void; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {denoms.map((d) => {
          const v = counts[d] ?? "";
          return (
            <label key={d} className="rounded-xl p-3 ring-1 ring-ink-200 focus-within:ring-2 focus-within:ring-brand-500">
              <span className="text-xs font-medium text-ink-500">{d >= 1 ? `GH₵ ${d}` : `${Math.round(d * 100)}p`}</span>
              <input
                inputMode="numeric"
                value={v}
                placeholder="0"
                onChange={(e) => { const x = e.target.value.replace(/\D/g, ""); setCounts((c) => ({ ...c, [d]: x })); }}
                className="num mt-1 block w-full border-0 bg-transparent p-0 text-xl font-semibold text-ink-900 outline-none placeholder:text-ink-300 focus:outline-none focus-visible:outline-none"
                aria-label={`Number of ${d >= 1 ? `GH₵ ${d}` : `${Math.round(d * 100)} pesewas`}`}
              />
              <span className="num text-xs text-ink-400">{formatMoney(d * (Number(v) || 0))}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const Row = ({ l, r, muted, strong }: { l: string; r: string; muted?: boolean; strong?: boolean }) => (
  <div className={cn("flex justify-between gap-3", muted && "text-ink-500", strong && "font-semibold text-ink-900")}>
    <dt className="truncate">{l}</dt>
    <dd className="num shrink-0">{r}</dd>
  </div>
);
