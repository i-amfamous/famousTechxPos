import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuCrown, LuEllipsisVertical, LuMonitorSmartphone, LuPlus, LuShieldCheck } from "react-icons/lu";
import { useSession, type Settings } from "@/app/session";
import { actions, useEmployees, useTerminals } from "@/services/api";
import {
  Avatar, Badge, Button, Callout, Card, CardHeader, ConfirmDialog, DataTable, Input, Menu, Modal, PageHeader, Segmented, Select, Switch, Tabs,
  Textarea, useToast,
} from "@/components/ui";
import { Logo } from "@/components/layout/AppLayout";
import { timeAgo } from "@/lib/format";
import { Receipt } from "@/features/pos/Receipt";
import type { Terminal } from "@/types";

type Tab = "business" | "receipts" | "pos" | "terminals" | "ownership";

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "business";
  return (
    <>
      <PageHeader title="Settings" description="Business details, receipts, POS security and tills." />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        tabs={[
          { value: "business", label: "Business" },
          { value: "receipts", label: "Receipts & tax" },
          { value: "pos", label: "POS & security" },
          { value: "terminals", label: "Tills" },
          { value: "ownership", label: "Ownership" },
        ]}
      />
      {tab === "business" && <BusinessTab />}
      {tab === "receipts" && <ReceiptsTab />}
      {tab === "pos" && <PosSecurityTab />}
      {tab === "terminals" && <TerminalsTab />}
      {tab === "ownership" && <OwnershipTab />}
    </>
  );
}

/** Saves business fields and/or settings, then reloads the session. */
function useSave() {
  const { refresh } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try { await actions.saveSettings(patch); await refresh(); toast({ tone: "success", title: "Settings saved" }); }
    catch (e) { toast({ tone: "error", title: "Couldn't save settings", body: (e as Error).message }); }
    finally { setBusy(false); }
  };
  return { save, busy };
}

function SaveBar({ onSave, busy }: { onSave: () => void; busy: boolean }) {
  return <div className="flex justify-end"><Button loading={busy} onClick={onSave}>Save changes</Button></div>;
}

function BusinessTab() {
  const { business, settings } = useSession();
  const { save, busy } = useSave();
  const [f, setF] = useState({ name: "", category: "", phone: "", email: "", address: "", tin: "", registration_no: "", logo_url: "", hours: "" });
  useEffect(() => {
    setF({ name: business?.name ?? "", category: business?.category ?? "Electronics", phone: business?.phone ?? "", email: business?.email ?? "", address: business?.address ?? "",
      tin: business?.tin ?? "", registration_no: business?.registration_no ?? "", logo_url: business?.logo_url ?? "", hours: String(settings.business_hours ?? "08:00 – 20:00") });
  }, [business, settings.business_hours]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title="Business profile" description="Shown on receipts and reports." />
        <div className="mb-5 flex items-center gap-4">
          {f.logo_url ? <img src={f.logo_url} alt="" className="size-14 rounded-xl object-contain ring-1 ring-ink-200" /> : <Logo className="size-14 text-lg" />}
          <Input className="flex-1" label="Logo URL" value={f.logo_url} onChange={set("logo_url")} placeholder="https://…" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Business name" value={f.name} onChange={set("name")} />
          <Select label="Category" value={f.category} onChange={set("category")}><option>Electronics</option><option>Retail</option><option>Pharmacy</option><option>Supermarket</option><option>Restaurant</option><option>Other</option></Select>
          <Input label="Phone" value={f.phone} onChange={set("phone")} />
          <Input label="Email" value={f.email} onChange={set("email")} />
          <Input label="Address" value={f.address} onChange={set("address")} className="sm:col-span-2" />
          <Input label="TIN (GRA)" placeholder="C000…" value={f.tin} onChange={set("tin")} />
          <Input label="Registration no." value={f.registration_no} onChange={set("registration_no")} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Region" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Currency" defaultValue="GHS" disabled><option value="GHS">Ghana cedi (GH₵)</option></Select>
          <Select label="Timezone" defaultValue="Africa/Accra" disabled><option>Africa/Accra</option></Select>
          <Input label="Business hours" value={f.hours} onChange={set("hours")} />
        </div>
      </Card>
      <SaveBar busy={busy} onSave={() => save({ name: f.name, category: f.category, phone: f.phone, email: f.email, address: f.address, tin: f.tin, registration_no: f.registration_no, logo_url: f.logo_url, settings: { business_hours: f.hours } })} />
    </div>
  );
}

function ReceiptsTab() {
  const { settings, business, branch } = useSession();
  const { save, busy } = useSave();
  const [s, setS] = useState<Settings>({});
  useEffect(() => { setS({ receipt_footer: settings.receipt_footer ?? "Thank you for shopping with us!", receipt_paper: settings.receipt_paper ?? "80", tax_rate: settings.tax_rate ?? 0, prices_include_tax: settings.prices_include_tax ?? true }); }, [settings]);
  const taxOn = Number(s.tax_rate) > 0;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Receipt" description="Receipt numbers are BRANCH-TILL-000001 (e.g. OSU-T1-000482)." />
          <div className="space-y-4">
            <Textarea label="Footer message" value={String(s.receipt_footer ?? "")} onChange={(e) => setS({ ...s, receipt_footer: e.target.value })} rows={2} />
            <Select label="Paper width" value={String(s.receipt_paper)} onChange={(e) => setS({ ...s, receipt_paper: e.target.value })}><option value="80">80 mm thermal</option><option value="58">58 mm thermal</option><option value="a4">A4</option></Select>
          </div>
        </Card>
        <Card>
          <CardHeader title="Tax" description="Applied at checkout. Tax collected is excluded from revenue in reports." />
          <div className="space-y-4">
            <Switch label="Charge tax on sales" checked={taxOn} onChange={(v) => setS({ ...s, tax_rate: v ? 15 : 0 })} />
            {taxOn && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Tax rate" prefix="%" inputMode="decimal" value={String(s.tax_rate)} onChange={(e) => setS({ ...s, tax_rate: e.target.value.replace(/[^\d.]/g, "") })} hint="Check current GRA rates" />
                <div className="pt-7"><Switch label="Prices already include tax" checked={!!s.prices_include_tax} onChange={(v) => setS({ ...s, prices_include_tax: v })} /></div>
              </div>
            )}
          </div>
        </Card>
        <SaveBar busy={busy} onSave={() => save({ settings: { ...s, tax_rate: Number(s.tax_rate) || 0 } })} />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-ink-600">Preview</p>
        <Receipt data={{ receiptNumber: `${branch.code ?? "BR"}-T1-000001`, createdAt: new Date().toISOString(), servedBy: "Kofi", terminal: "Till 1", branch: branch.name,
          business: { name: business?.name ?? "Your business", phone: business?.phone, tin: business?.tin, footer: String(s.receipt_footer ?? "") },
          items: [{ name: "USB-C Fast Charger 25W", quantity: 1, unitPrice: 120, discount: 0 }], subtotal: 120, discountTotal: 0, taxTotal: 0, total: 120, payments: [{ method: "cash", amount: 150 }], change: 30 }} />
      </div>
    </div>
  );
}

function PosSecurityTab() {
  const { settings } = useSession();
  const { save, busy } = useSave();
  const [s, setS] = useState<Settings>({});
  useEffect(() => { setS({ ...settings }); }, [settings]);
  const num = (k: string, d: number) => Number(s[k] ?? d);
  const bool = (k: string, d: boolean) => (s[k] === undefined ? d : !!s[k]);
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title="Employee switching" description="How staff unlock a shared till." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="PIN length" value={String(num("pin_length", 4))} disabled><option value="4">4 digits</option></Select>
          <Select label="Auto-lock after" value={String(num("auto_lock_minutes", 5))} onChange={(e) => setS({ ...s, auto_lock_minutes: Number(e.target.value) })}><option value="1">1 minute idle</option><option value="2">2 minutes</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="0">Never</option></Select>
          <Select label="Lock PIN after" value={String(num("pin_max_attempts", 5))} onChange={(e) => setS({ ...s, pin_max_attempts: Number(e.target.value) })}><option value="3">3 wrong tries</option><option value="5">5 wrong tries</option></Select>
        </div>
        <div className="mt-5 space-y-4">
          <Switch label="Notify managers about PIN lockouts" checked={bool("notify_pin_lockouts", true)} onChange={(v) => setS({ ...s, notify_pin_lockouts: v })} />
        </div>
        <div className="mt-5"><Callout tone="info" icon={<LuShieldCheck className="size-4" />}>A PIN only opens the POS on a registered till. Back office always needs a full password.</Callout></div>
      </Card>
      <Card>
        <CardHeader title="Shifts & cash drawer" />
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-ink-700">Cash drawer</p>
            <Segmented value={bool("shared_drawer", false) ? "shared" : "own"} onChange={(v) => setS({ ...s, shared_drawer: v === "shared" })} options={[{ value: "own", label: "Each employee counts their own drawer" }, { value: "shared", label: "Employees share one drawer" }]} />
            <p className="mt-2 text-xs text-ink-500">{bool("shared_drawer", false) ? "One shift per till; anyone on the till sells into it. Variances can't be traced to one person." : "Each employee opens and closes their own shift. Best for accountability."}</p>
          </div>
          <Switch label="Require an open shift to sell" checked={bool("require_shift", true)} onChange={(v) => setS({ ...s, require_shift: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Variance needing approval" prefix="GH₵" inputMode="decimal" value={String(s.variance_threshold ?? 10)} onChange={(e) => setS({ ...s, variance_threshold: e.target.value.replace(/[^\d.]/g, "") })} hint="Over or short by more than this" />
            <Select label="Flag shifts open longer than" value={String(num("flag_shift_hours", 12))} onChange={(e) => setS({ ...s, flag_shift_hours: Number(e.target.value) })}><option value="10">10 hours</option><option value="12">12 hours</option><option value="24">24 hours</option></Select>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Stock" />
        <Switch label="Block sales when stock is not enough" description="Turning this off lets staff sell more than the system shows (stock goes negative)." checked={bool("block_negative_stock", true)} onChange={(v) => setS({ ...s, block_negative_stock: v })} />
      </Card>
      <SaveBar busy={busy} onSave={() => save({ settings: { auto_lock_minutes: num("auto_lock_minutes", 5), pin_max_attempts: num("pin_max_attempts", 5), notify_pin_lockouts: bool("notify_pin_lockouts", true),
        shared_drawer: bool("shared_drawer", false), require_shift: bool("require_shift", true), variance_threshold: Number(s.variance_threshold ?? 10) || 0,
        flag_shift_hours: num("flag_shift_hours", 12), block_negative_stock: bool("block_negative_stock", true) } })} />
    </div>
  );
}

function TerminalsTab() {
  const terminals = useTerminals().data;
  const employees = useEmployees().data;
  const { branches, branch, terminal, linkTerminal } = useSession();
  const toast = useToast();
  const [reg, setReg] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<Terminal | null>(null);
  return (
    <div className="space-y-6">
      <Callout tone="info" icon={<LuMonitorSmartphone className="size-4" />} title="What's a till?">A computer or tablet you've registered for selling. Staff unlock it with their PIN. Unregistered devices can't use PIN sign-in.</Callout>
      {terminal && <Callout tone="success" title={`This device is “${terminal.name}”`}>Open the POS to use it.</Callout>}
      <Card padded={false}>
        <div className="flex items-center justify-between px-5 py-4"><h3 className="font-semibold">Registered tills</h3><Button icon={<LuPlus className="size-4" />} onClick={() => { setReg(true); setDone(null); setName(`Till ${terminals.filter((t) => t.status === "active").length + 1}`); setBranchId(branch.id); }}>Register this device</Button></div>
        <DataTable rows={terminals} rowKey={(t) => t.id} columns={[
          { key: "n", header: "Till", cell: (t) => <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-ink-100 text-ink-500"><LuMonitorSmartphone className="size-4" /></span><span className="font-medium text-ink-900">{t.name}{terminal?.id === t.id && <Badge tone="brand" className="ml-2">This device</Badge>}</span></div> },
          { key: "b", header: "Branch", cell: (t) => branches.find((b) => b.id === t.branchId)?.name ?? "—" },
          { key: "s", header: "Status", cell: (t) => (t.status === "active" ? <Badge tone="success" dot>Active</Badge> : <Badge>Revoked</Badge>) },
          { key: "l", header: "Last seen", hideBelow: "md", cell: (t) => timeAgo(t.lastSeenAt) },
          { key: "r", header: "Registered by", hideBelow: "lg", cell: (t) => employees.find((e) => e.id === t.registeredBy)?.fullName ?? "—" },
          { key: "m", header: "", align: "right", cell: (t) => t.status === "active" && (
            <Menu trigger={(p) => <button {...p} aria-label="Till actions" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100"><LuEllipsisVertical className="size-4" /></button>} items={[{ label: "Revoke", danger: true, onClick: () => setRevoke(t) }]} />
          ) },
        ]} />
      </Card>
      <Modal open={reg} onClose={() => setReg(false)} title={done ? "Till registered" : "Register this device as a till"} size="sm" footer={done ? <Button onClick={() => setReg(false)}>Done</Button> : <><Button variant="secondary" onClick={() => setReg(false)}>Cancel</Button><Button loading={busy} disabled={name.trim().length < 2 || !branchId} onClick={async () => {
        setBusy(true);
        try {
          const r = await actions.registerTerminal(name, branchId);
          linkTerminal({ token: r.token, id: r.terminalId });
          setDone(name);
        } catch (e) { toast({ tone: "error", title: "Couldn't register", body: (e as Error).message }); }
        finally { setBusy(false); }
      }}>Register</Button></>}>
        {done ? (
          <Callout tone="success" title={`This device is now “${done}”`}>Staff at {branches.find((b) => b.id === branchId)?.name} can unlock it with their PIN. Open the POS to start.</Callout>
        ) : (
          <div className="space-y-4">
            <Input label="Till name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <Select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.filter((b) => b.status === "active").map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
            <p className="text-xs text-ink-500">Only register devices that stay in the shop. You can revoke a till at any time.</p>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} title={`Revoke ${revoke?.name}?`} message="Anyone using it is signed out now and PIN sign-in stops working on it." confirmLabel="Revoke till" onConfirm={async () => {
        try { await actions.revokeTerminal(revoke!.id); if (terminal?.id === revoke!.id) linkTerminal(null); toast({ tone: "success", title: "Till revoked" }); }
        catch (e) { toast({ tone: "error", title: (e as Error).message }); }
      }} />
    </div>
  );
}

function OwnershipTab() {
  const { user, refresh } = useSession();
  const toast = useToast();
  const managers = useEmployees().data.filter((e) => e.status === "active" && !e.isOwner);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Business owner" description="The owner has full access that can't be reduced by anyone else." />
      <div className="flex items-center gap-3 rounded-lg bg-ink-50 p-4">
        <Avatar name={user.fullName} color={user.avatarColor} />
        <div className="flex-1"><p className="font-medium">{user.fullName}</p><p className="text-sm text-ink-500">{user.email}</p></div>
        {user.isOwner && <Badge tone="brand"><LuCrown className="size-3" /> Owner</Badge>}
      </div>
      {user.isOwner && <Button className="mt-5" variant="secondary" onClick={() => { setTo(managers[0]?.id ?? ""); setOpen(true); }} disabled={!managers.length}>Transfer ownership</Button>}
      <Modal open={open} onClose={() => setOpen(false)} title="Transfer ownership" size="sm" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" loading={busy} disabled={!to} onClick={async () => {
        setBusy(true);
        try { await actions.transferOwnership(to); await refresh(); toast({ tone: "success", title: "Ownership transferred" }); setOpen(false); }
        catch (e) { toast({ tone: "error", title: (e as Error).message }); }
        finally { setBusy(false); }
      }}>Transfer</Button></>}>
        <div className="space-y-4">
          <Callout tone="warning">You'll become an Administrator. This is recorded in the activity log and can only be undone by the new owner.</Callout>
          <Select label="New owner" value={to} onChange={(e) => setTo(e.target.value)}>{managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}</Select>
        </div>
      </Modal>
    </Card>
  );
}
