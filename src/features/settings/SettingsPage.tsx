import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuCrown, LuEllipsisVertical, LuMonitorSmartphone, LuPlus, LuShieldCheck } from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useBranches, useEmployees, useTerminals } from "@/services/api";
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
  const toast = useToast();
  const save = async () => { await actions.saveSettings({}); toast({ tone: "success", title: "Settings saved" }); };

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
      {tab === "business" && <BusinessTab onSave={save} />}
      {tab === "receipts" && <ReceiptsTab onSave={save} />}
      {tab === "pos" && <PosSecurityTab onSave={save} />}
      {tab === "terminals" && <TerminalsTab />}
      {tab === "ownership" && <OwnershipTab />}
    </>
  );
}

function SaveBar({ onSave }: { onSave: () => void }) {
  return <div className="flex justify-end"><Button onClick={onSave}>Save changes</Button></div>;
}

function BusinessTab({ onSave }: { onSave: () => void }) {
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title="Business profile" />
        <div className="mb-5 flex items-center gap-4"><Logo className="size-14 text-lg" /><Button size="sm" variant="secondary">Change logo</Button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Business name" defaultValue="Famous TechX" />
          <Select label="Category" defaultValue="Electronics"><option>Electronics</option><option>Retail</option></Select>
          <Input label="Phone" defaultValue="030 201 4455" />
          <Input label="Email" defaultValue="hello@famoustechx.com" />
          <Input label="Address" defaultValue="Oxford St, Osu, Accra" className="sm:col-span-2" />
          <Input label="TIN (GRA)" placeholder="C000…" />
          <Input label="Registration no." />
        </div>
      </Card>
      <Card>
        <CardHeader title="Region" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="Currency" defaultValue="GHS"><option value="GHS">Ghana cedi (GH₵)</option></Select>
          <Select label="Timezone" defaultValue="Africa/Accra"><option>Africa/Accra</option></Select>
          <Input label="Business hours" defaultValue="08:00 – 20:00" />
        </div>
      </Card>
      <SaveBar onSave={onSave} />
    </div>
  );
}

function ReceiptsTab({ onSave }: { onSave: () => void }) {
  const [footer, setFooter] = useState("Thank you for shopping with us!");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Receipt" />
          <div className="space-y-4">
            <Input label="Receipt number prefix" defaultValue="{BRANCH}-{TILL}-" hint="e.g. OSU-T1-000482" />
            <Textarea label="Footer message" value={footer} onChange={(e) => setFooter(e.target.value)} rows={2} />
            <Switch label="Show employee name (“Served by”)" checked onChange={() => {}} />
            <Switch label="Show customer name when attached" checked onChange={() => {}} />
            <Select label="Paper width" defaultValue="80"><option value="80">80 mm thermal</option><option value="58">58 mm thermal</option><option value="a4">A4</option></Select>
          </div>
        </Card>
        <Card>
          <CardHeader title="Tax" description="Applied by your checkout logic. Tax collected is excluded from revenue in reports." />
          <div className="space-y-4">
            <Select label="Tax scheme" defaultValue="vat_std"><option value="none">No tax</option><option value="vat_std">VAT standard (prices include tax)</option><option value="vat_flat">VAT flat rate</option></Select>
            <Switch label="Prices include tax" checked onChange={() => {}} />
          </div>
        </Card>
        <SaveBar onSave={onSave} />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-ink-600">Preview</p>
        <Receipt data={{ receiptNumber: "OSU-T1-000001", createdAt: new Date().toISOString(), servedBy: "Kofi", terminal: "Till 1", branch: "Accra – Osu (Main)", items: [{ name: "USB-C Fast Charger 25W", quantity: 1, unitPrice: 120, discount: 0 }], subtotal: 120, discountTotal: 0, taxTotal: 0, total: 120, payments: [{ method: "cash", amount: 150 }], change: 30 }} />
      </div>
    </div>
  );
}

function PosSecurityTab({ onSave }: { onSave: () => void }) {
  const [drawer, setDrawer] = useState<"own" | "shared">("own");
  const [s, set] = useState({ requireShift: true, blockNegative: true, pinOnEverySale: false, notify: true });
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title="Employee switching" description="How staff unlock a shared till." />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select label="PIN length" defaultValue="4"><option value="4">4 digits</option><option value="6">6 digits</option></Select>
          <Select label="Auto-lock after" defaultValue="5"><option value="1">1 minute idle</option><option value="2">2 minutes</option><option value="5">5 minutes</option><option value="10">10 minutes</option><option value="0">Never</option></Select>
          <Select label="Lock PIN after" defaultValue="5"><option value="3">3 wrong tries</option><option value="5">5 wrong tries</option></Select>
        </div>
        <div className="mt-5 space-y-4">
          <Switch label="Ask for PIN on every sale" description="Stricter — for busy tills with many staff." checked={s.pinOnEverySale} onChange={(v) => set({ ...s, pinOnEverySale: v })} />
          <Switch label="Notify managers about PIN lockouts" checked={s.notify} onChange={(v) => set({ ...s, notify: v })} />
        </div>
        <div className="mt-5"><Callout tone="info" icon={<LuShieldCheck className="size-4" />}>A PIN only opens the POS on a registered till. Back office always needs a full password.</Callout></div>
      </Card>
      <Card>
        <CardHeader title="Shifts & cash drawer" />
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-ink-700">Cash drawer</p>
            <Segmented value={drawer} onChange={setDrawer} options={[{ value: "own", label: "Each employee counts their own drawer" }, { value: "shared", label: "Employees share one drawer" }]} />
            <p className="mt-2 text-xs text-ink-500">{drawer === "own" ? "Each employee opens and closes their own shift. Best for accountability." : "One shift per till; anyone on the till sells into it. Variances can't be traced to one person."}</p>
          </div>
          <Switch label="Require an open shift to sell" checked={s.requireShift} onChange={(v) => set({ ...s, requireShift: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Variance needing approval" prefix="GH₵" defaultValue="10" hint="Over or short by more than this" />
            <Select label="Flag shifts open longer than" defaultValue="12"><option value="10">10 hours</option><option value="12">12 hours</option><option value="24">24 hours</option></Select>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Stock" />
        <Switch label="Block sales when stock is not enough" description="Turning this off lets permitted staff oversell." checked={s.blockNegative} onChange={(v) => set({ ...s, blockNegative: v })} />
      </Card>
      <SaveBar onSave={onSave} />
    </div>
  );
}

function TerminalsTab() {
  const terminals = useTerminals().data;
  const branches = useBranches().data;
  const employees = useEmployees().data;
  const toast = useToast();
  const [reg, setReg] = useState(false);
  const [done, setDone] = useState(false);
  const [revoke, setRevoke] = useState<Terminal | null>(null);
  return (
    <div className="space-y-6">
      <Callout tone="info" icon={<LuMonitorSmartphone className="size-4" />} title="What's a till?">A computer or tablet you've registered for selling. Staff unlock it with their PIN. Unregistered devices can't use PIN sign-in.</Callout>
      <Card padded={false}>
        <div className="flex items-center justify-between px-5 py-4"><h3 className="font-semibold">Registered tills</h3><Button icon={<LuPlus className="size-4" />} onClick={() => { setReg(true); setDone(false); }}>Register this device</Button></div>
        <DataTable rows={terminals} rowKey={(t) => t.id} columns={[
          { key: "n", header: "Till", cell: (t) => <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-ink-100 text-ink-500"><LuMonitorSmartphone className="size-4" /></span><span className="font-medium text-ink-900">{t.name}</span></div> },
          { key: "b", header: "Branch", cell: (t) => branches.find((b) => b.id === t.branchId)?.name },
          { key: "s", header: "Status", cell: (t) => (t.status === "active" ? <Badge tone="success" dot>Active</Badge> : <Badge>Revoked</Badge>) },
          { key: "l", header: "Last seen", hideBelow: "md", cell: (t) => timeAgo(t.lastSeenAt) },
          { key: "r", header: "Registered by", hideBelow: "lg", cell: (t) => employees.find((e) => e.id === t.registeredBy)?.fullName },
          { key: "m", header: "", align: "right", cell: (t) => t.status === "active" && (
            <Menu trigger={(p) => <button {...p} aria-label="Till actions" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100"><LuEllipsisVertical className="size-4" /></button>} items={[{ label: "Rename", onClick: () => {} }, { label: "Move to branch", onClick: () => {} }, "divider", { label: "Revoke", danger: true, onClick: () => setRevoke(t) }]} />
          ) },
        ]} />
      </Card>
      <Modal open={reg} onClose={() => setReg(false)} title={done ? "Till registered" : "Register this device as a till"} size="sm" footer={done ? <Button onClick={() => setReg(false)}>Done</Button> : <><Button variant="secondary" onClick={() => setReg(false)}>Cancel</Button><Button onClick={async () => { await actions.registerTerminal("Till 3", "br1"); setDone(true); }}>Register</Button></>}>
        {done ? (
          <Callout tone="success" title="This device is now “Till 3”">Staff at Accra – Osu can unlock it with their PIN. Open the POS to start.</Callout>
        ) : (
          <div className="space-y-4">
            <Input label="Till name" defaultValue="Till 3" autoFocus />
            <Select label="Branch">{branches.filter((b) => b.status === "active").map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select>
            <p className="text-xs text-ink-500">Only register devices that stay in the shop. You can revoke a till at any time.</p>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} title={`Revoke ${revoke?.name}?`} message="Anyone using it is signed out now and PIN sign-in stops working on it." confirmLabel="Revoke till" onConfirm={async () => { await actions.revokeTerminal(revoke!.id); toast({ tone: "success", title: "Till revoked" }); }} />
    </div>
  );
}

function OwnershipTab() {
  const { user } = useSession();
  const managers = useEmployees().data.filter((e) => e.status === "active" && !e.isOwner);
  const [open, setOpen] = useState(false);
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Business owner" description="The owner has full access that can't be reduced by anyone else." />
      <div className="flex items-center gap-3 rounded-lg bg-ink-50 p-4">
        <Avatar name={user.fullName} color={user.avatarColor} />
        <div className="flex-1"><p className="font-medium">{user.fullName}</p><p className="text-sm text-ink-500">{user.email}</p></div>
        <Badge tone="brand"><LuCrown className="size-3" /> Owner</Badge>
      </div>
      <Button className="mt-5" variant="secondary" onClick={() => setOpen(true)}>Transfer ownership</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Transfer ownership" size="sm" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger">Transfer</Button></>}>
        <div className="space-y-4">
          <Callout tone="warning">You'll become an Administrator. This is recorded in the activity log and can only be undone by the new owner.</Callout>
          <Select label="New owner">{managers.map((m) => <option key={m.id}>{m.fullName}</option>)}</Select>
          <Input label="Your password" type="password" required hint="Confirm it's really you" />
        </div>
      </Modal>
    </Card>
  );
}
