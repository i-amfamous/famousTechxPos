import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  LuArrowLeft, LuCircleCheck, LuCircleX, LuCrown, LuEllipsisVertical, LuKeyRound, LuLogOut, LuMail, LuShieldCheck, LuTrash2, LuUserCheck, LuUserX,
} from "react-icons/lu";
import { useSession } from "@/app/session";
import {
  actions, useActivity, useBranches, useEmployee, useEmployeePerformance, usePermissions, useRoles, useSignIns,
} from "@/services/api";
import {
  Avatar, Badge, BarChart, Button, Callout, Card, CardHeader, Checkbox, ConfirmDialog, DataTable, DL, EmptyState, ErrorState, Input,
  Menu, Modal, Select, Skeleton, StatCard, Tabs, useToast,
} from "@/components/ui";
import { cn, formatDate, formatDateTime, formatMoney, timeAgo } from "@/lib/format";
import type { Employee, Permission } from "@/types";
import { activityIcon, PinBadge, StatusBadge, resendInvite } from "./shared";

type Tab = "overview" | "permissions" | "branches" | "activity" | "performance" | "signins" | "security";

export function EmployeeDetailPage() {
  const { id = "" } = useParams();
  const q = useEmployee(id);
  const [tab, setTab] = useState<Tab>("overview");
  const roles = useRoles().data;
  const navigate = useNavigate();
  const toast = useToast();
  const { can, user } = useSession();
  const [confirm, setConfirm] = useState<null | "suspend" | "deactivate" | "reactivate" | "pin" | "password" | "signout" | "delete">(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  if (q.loading) return <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (q.error) return <ErrorState message={q.error} onRetry={q.refetch} />;
  const e = q.data;
  if (!e) return <EmptyState title="Employee not found" description="They may have been removed or you don't have access." action={<Button onClick={() => navigate("/employees")}>Back to employees</Button>} />;
  const role = roles.find((r) => r.id === e.roleId);

  return (
    <>
      <Link to="/employees" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><LuArrowLeft className="size-4" /> Employees</Link>

      <Card className="mb-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={e.fullName} color={e.avatarColor} size="xl" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-ink-900">{e.fullName}</h1>
              <StatusBadge status={e.status} />
              {e.isOwner && <Badge tone="brand"><LuCrown className="size-3" /> Owner</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-500">{role?.name} · {e.employeeCode} · {e.email ?? e.phone}</p>
            <p className="mt-0.5 text-xs text-ink-400">{e.lastSignInAt ? `Last signed in ${timeAgo(e.lastSignInAt)}` : "Hasn't signed in yet"}</p>
          </div>
          <div className="flex gap-2">
            {e.status === "invited" && can("employees.manage") && <Button variant="secondary" icon={<LuMail className="size-4" />} onClick={() => resendInvite(e.id, e.email, toast)}>Resend invite</Button>}
            {(e.status === "suspended" || e.status === "deactivated") && <Button icon={<LuUserCheck className="size-4" />} onClick={() => setConfirm("reactivate")}>Reactivate</Button>}
            <Menu
              trigger={(p) => <Button {...p} variant="secondary" icon={<LuEllipsisVertical className="size-4" />}>More</Button>}
              items={[
                ...(e.status !== "deleted" ? [
                  { label: "Reset POS PIN", icon: <LuKeyRound />, onClick: () => setConfirm("pin"), disabled: !e.hasPin },
                  { label: "Reset password", icon: <LuKeyRound />, onClick: () => setConfirm("password") },
                  { label: "Sign out everywhere", icon: <LuLogOut />, onClick: () => setConfirm("signout") },
                  "divider" as const,
                  { label: "Suspend", icon: <LuUserX />, onClick: () => setConfirm("suspend"), disabled: e.isOwner || e.status !== "active" },
                  { label: "Deactivate", icon: <LuUserX />, danger: true, onClick: () => setConfirm("deactivate"), disabled: e.isOwner || e.status === "deactivated" },
                ] : []),
                ...(user.isOwner && !e.isOwner && e.status !== "deleted" ? [
                  "divider" as const,
                  { label: "Delete account", icon: <LuTrash2 />, danger: true, onClick: () => setConfirm("delete") },
                ] : []),
              ]}
            />
          </div>
        </div>
        {e.status === "suspended" && <div className="mt-4"><Callout tone="warning" title="Suspended">This employee can't sign in to the back office or POS. Their records are kept.</Callout></div>}
        {e.status === "deleted" && <div className="mt-4"><Callout tone="danger" title="Account deleted">This login was permanently removed and access can't be restored. All of their sales, shifts and records remain in your history with their name.</Callout></div>}
        {e.pinLocked && <div className="mt-3"><Callout tone="danger" title="POS PIN locked">Too many wrong PIN attempts. Reset the PIN so they can sign in again.</Callout></div>}
      </Card>

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: "Profile" },
          { value: "permissions", label: "Role & permissions" },
          { value: "branches", label: "Branch access" },
          { value: "activity", label: "Activity" },
          { value: "performance", label: "Performance" },
          { value: "signins", label: "Sign-in history" },
          { value: "security", label: "Security" },
        ]}
      />

      {tab === "overview" && <ProfileTab e={e} />}
      {tab === "permissions" && <PermissionsTab e={e} />}
      {tab === "branches" && <BranchesTab e={e} />}
      {tab === "activity" && <ActivityTab e={e} />}
      {tab === "performance" && <PerformanceTab e={e} />}
      {tab === "signins" && <SignInsTab e={e} />}
      {tab === "security" && <SecurityTab e={e} onAction={setConfirm} />}

      {tempPassword && (
        <Modal open onClose={() => setTempPassword(null)} title="New temporary password" size="sm" footer={<Button onClick={() => setTempPassword(null)}>Done</Button>}>
          <p className="text-sm text-ink-600">Give this to {e.fullName} privately. They must change it when they sign in. It's shown only once.</p>
          <p className="mt-4 rounded-lg bg-ink-50 p-3 text-center font-mono text-lg ring-1 ring-ink-200">{tempPassword}</p>
        </Modal>
      )}
      {confirm && (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          tone={confirm === "suspend" || confirm === "deactivate" || confirm === "delete" ? "danger" : "primary"}
          requireReason={confirm === "suspend" || confirm === "deactivate" || confirm === "delete"}
          title={{ suspend: "Suspend employee?", deactivate: "Deactivate employee?", reactivate: "Reactivate employee?", pin: "Reset POS PIN?", password: "Reset password?", signout: "Sign out everywhere?", delete: `Delete ${e.fullName}'s account?` }[confirm]}
          reasonLabel={confirm === "delete" ? "Reason (saved in the activity log)" : undefined}
          message={{
            suspend: "They're signed out immediately and blocked until reactivated.",
            deactivate: "For staff who have left. Access ends now; history is kept.",
            reactivate: "They'll be able to sign in again.",
            pin: "They'll create a new PIN next time they use the POS.",
            password: e.email ? `A reset link will be emailed to ${e.email}.` : "A new temporary password will be shown once.",
            signout: "All their sessions on every device end now.",
            delete: "Permanently removes their login and access. Their sales, shifts and records stay in your history with their name — nothing is erased. This can't be undone.",
          }[confirm]}
          confirmLabel={confirm === "delete" ? "Delete account" : "Confirm"}
          onConfirm={async (reason) => {
            try {
              if (confirm === "delete") {
                await actions.deleteEmployee(e.id, reason ?? "");
                toast({ tone: "success", title: `${e.fullName} deleted`, body: "Their history is kept in your records." });
                navigate("/employees");
                return;
              }
              if (confirm === "pin") await actions.resetPin(e.id);
              else if (confirm === "signout") await actions.employeeAdmin("sign_out", e.id);
              else if (confirm === "password") {
                const r = await actions.employeeAdmin("reset_password", e.id);
                if (r.tempPassword) setTempPassword(r.tempPassword);
              } else await actions.employeeAdmin("set_status", e.id, { status: confirm === "reactivate" ? "active" : confirm === "suspend" ? "suspended" : "deactivated", reason });
              toast({ tone: "success", title: "Done" });
            } catch (er) {
              toast({ tone: "error", title: "Couldn't complete that", body: (er as Error).message });
            }
          }}
        />
      )}
    </>
  );
}

/* ───── Profile ───── */
function ProfileTab({ e }: { e: Employee }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ fullName: e.fullName, displayName: e.displayName, phone: e.phone, email: e.email ?? "", employeeCode: e.employeeCode, hireDate: e.hireDate });
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { can } = useSession();
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Personal details" action={!editing && can("employees.manage") && <Button size="sm" variant="secondary" onClick={() => { setF({ fullName: e.fullName, displayName: e.displayName, phone: e.phone, email: e.email ?? "", employeeCode: e.employeeCode, hireDate: e.hireDate }); setEditing(true); }}>Edit</Button>} />
        {editing ? (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={async (ev) => {
            ev.preventDefault(); setBusy(true);
            try { await actions.updateEmployeeProfile(e.id, f); setEditing(false); toast({ tone: "success", title: "Profile saved" }); }
            catch (er) { toast({ tone: "error", title: "Couldn't save", body: (er as Error).message }); }
            finally { setBusy(false); }
          }}>
            <Input label="Full name" value={f.fullName} onChange={(x) => setF({ ...f, fullName: x.target.value })} required />
            <Input label="Name on receipts" value={f.displayName} onChange={(x) => setF({ ...f, displayName: x.target.value })} required />
            <Input label="Phone" value={f.phone} onChange={(x) => setF({ ...f, phone: x.target.value })} required />
            <Input label="Email (contact)" type="email" value={f.email} onChange={(x) => setF({ ...f, email: x.target.value })} hint="Changing this doesn't change their sign-in email." />
            <Input label="Employee code" value={f.employeeCode} onChange={(x) => setF({ ...f, employeeCode: x.target.value })} />
            <Input label="Start date" type="date" value={f.hireDate} onChange={(x) => setF({ ...f, hireDate: x.target.value })} />
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" loading={busy}>Save changes</Button>
            </div>
          </form>
        ) : (
          <DL items={[
            { label: "Full name", value: e.fullName },
            { label: "Name on receipts", value: `Served by ${e.displayName}` },
            { label: "Phone", value: e.phone },
            { label: "Email", value: e.email ?? <span className="text-ink-400">Not provided</span> },
            { label: "Employee code", value: e.employeeCode },
            { label: "Start date", value: formatDate(e.hireDate) },
          ]} />
        )}
      </Card>
      <Card>
        <CardHeader title="Access" />
        <DL cols={1} items={[
          { label: "Account status", value: <StatusBadge status={e.status} /> },
          { label: "POS PIN", value: <PinBadge e={e} /> },
          { label: "Sign-in", value: e.email ? "Email & password" : "Phone & password" },
          { label: "Last sign-in", value: e.lastSignInAt ? formatDateTime(e.lastSignInAt) : "—" },
        ]} />
      </Card>
    </div>
  );
}

/* ───── Role & permissions ───── */
function PermissionsTab({ e }: { e: Employee }) {
  const roles = useRoles().data;
  const perms = usePermissions().data;
  const toast = useToast();
  const [roleId, setRoleId] = useState(e.roleId);
  const [overrides, setOverrides] = useState(e.overrides);
  const role = roles.find((r) => r.id === roleId);
  const modules = useMemo(() => [...new Set(perms.map((p) => p.module))], [perms]);
  const dirty = roleId !== e.roleId || JSON.stringify(overrides) !== JSON.stringify(e.overrides);

  const state = (p: Permission) => {
    const o = overrides.find((x) => x.permission === p.key);
    const fromRole = !!role?.permissions.includes(p.key);
    return { on: o ? o.effect === "grant" : fromRole, fromRole, override: o?.effect };
  };
  const toggle = (p: Permission) => {
    const s = state(p);
    const nextOn = !s.on;
    setOverrides((os) => {
      const rest = os.filter((x) => x.permission !== p.key);
      return nextOn === s.fromRole ? rest : [...rest, { permission: p.key, effect: nextOn ? "grant" : "revoke" }];
    });
  };

  if (e.isOwner) return <Callout tone="info" icon={<LuCrown className="size-4" />} title="Owners have every permission">The owner's access can't be reduced. Transfer ownership from Settings if needed.</Callout>;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Role" description="Sets the default permissions and limits." />
          <Select value={roleId} onChange={(ev) => setRoleId(ev.target.value)} aria-label="Role">
            {roles.filter((r) => r.key !== "owner").map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <p className="mt-2 text-sm text-ink-500">{role?.description}</p>
          {role && (
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink-500">Max discount without approval</dt><dd className="num font-medium">{role.limits.maxDiscountPercent}%</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Max refund without approval</dt><dd className="num font-medium">{role.limits.maxRefundAmount ? formatMoney(role.limits.maxRefundAmount) : "Not allowed"}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-500">Open drawer (no sale)</dt><dd className="font-medium">{role.limits.allowNoSale ? "Yes" : "Needs approval"}</dd></div>
            </dl>
          )}
          <Link to="/roles" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">Edit role templates →</Link>
        </Card>
        <Card>
          <CardHeader title="Custom changes" description="Permissions that differ from the role." />
          {overrides.length ? (
            <ul className="space-y-2">
              {overrides.map((o) => (
                <li key={o.permission} className="flex items-center gap-2 text-sm">
                  {o.effect === "grant" ? <LuCircleCheck className="size-4 text-emerald-600" /> : <LuCircleX className="size-4 text-rose-600" />}
                  <span className="flex-1">{perms.find((p) => p.key === o.permission)?.label}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-500">None — uses the role exactly.</p>}
          {overrides.length > 0 && <Button size="sm" variant="ghost" className="mt-3" onClick={() => setOverrides([])}>Reset to role defaults</Button>}
        </Card>
      </div>

      <Card className="lg:col-span-2" padded={false}>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div>
            <h3 className="font-semibold text-ink-900">Permissions</h3>
            <p className="text-sm text-ink-500">Switch on or off to override the role for {e.displayName} only.</p>
          </div>
          <Button disabled={!dirty} onClick={async () => { try { await actions.saveMemberAccess(e.id, roleId, overrides, e.branchIds); toast({ tone: "success", title: "Permissions saved", body: "Logged in the activity log." }); } catch (er) { toast({ tone: "error", title: "Couldn't save", body: (er as Error).message }); } }}>Save</Button>
        </div>
        <div className="divide-y divide-ink-100">
          {modules.map((m) => (
            <div key={m} className="px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{m}</p>
              <ul className="space-y-1">
                {perms.filter((p) => p.module === m).map((p) => {
                  const s = state(p);
                  return (
                    <li key={p.key} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-ink-50">
                      <button
                        role="switch"
                        aria-checked={s.on}
                        aria-label={p.label}
                        onClick={() => toggle(p)}
                        className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", s.on ? "bg-brand-600" : "bg-ink-300")}
                      >
                        <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform", s.on ? "translate-x-4.5" : "translate-x-0.5")} />
                      </button>
                      <span className="flex-1 text-sm text-ink-800">{p.label}</span>
                      {p.sensitive && <Badge tone="warning">Sensitive</Badge>}
                      {s.override === "grant" && <Badge tone="violet">Added</Badge>}
                      {s.override === "revoke" && <Badge tone="danger">Removed</Badge>}
                      {!s.override && s.fromRole && <span className="text-xs text-ink-400">From role</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ───── Branches ───── */
function BranchesTab({ e }: { e: Employee }) {
  const branches = useBranches().data;
  const [sel, setSel] = useState(e.branchIds);
  const toast = useToast();
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Branch access" description="They can only sell, see stock and see records for these branches." />
      <ul className="divide-y divide-ink-100 rounded-lg ring-1 ring-ink-200">
        {branches.map((b) => (
          <li key={b.id} className="flex items-center justify-between px-4 py-3">
            <Checkbox label={<span><span className="font-medium text-ink-900">{b.name}</span><span className="block text-xs text-ink-500">{b.address}</span></span>} checked={sel.includes(b.id)} disabled={b.status !== "active"} onChange={(ev) => setSel((s) => (ev.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id)))} />
            {b.status !== "active" && <Badge>Inactive</Badge>}
          </li>
        ))}
      </ul>
      {sel.length === 0 && <p className="mt-2 text-sm text-rose-600">Choose at least one branch.</p>}
      <div className="mt-4 flex justify-end"><Button disabled={!sel.length || e.isOwner} onClick={async () => { try { await actions.saveMemberAccess(e.id, e.roleId, e.overrides, sel); toast({ tone: "success", title: "Branch access saved" }); } catch (er) { toast({ tone: "error", title: "Couldn't save", body: (er as Error).message }); } }}>Save</Button></div>
    </Card>
  );
}

/* ───── Activity ───── */
export function ActivityList({ events, showActor }: { events: ReturnType<typeof useActivity>["data"]; showActor?: (id: string) => Employee | undefined }) {
  if (!events.length) return <EmptyState title="No activity yet" description="Sign-ins, sales, refunds and changes will show here." />;
  return (
    <ol className="relative space-y-1">
      {events.map((a) => {
        const ic = activityIcon[a.category];
        const actor = showActor?.(a.actorId);
        return (
          <li key={a.id} className="flex gap-3 rounded-lg px-2 py-2.5 hover:bg-ink-50">
            <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full [&>svg]:size-4", ic.cls)}>{ic.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-900">
                {actor && <span className="font-semibold">{actor.fullName} </span>}
                <span className={actor ? "text-ink-600" : "font-medium"}>{actor ? a.action.toLowerCase() : a.action}</span>
              </p>
              <p className="truncate text-xs text-ink-500">{a.detail}</p>
            </div>
            <div className="shrink-0 text-right">
              {a.amount !== undefined && <p className="num text-sm font-medium text-ink-900">{formatMoney(a.amount)}</p>}
              <p className="text-xs text-ink-400">{timeAgo(a.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ActivityTab({ e }: { e: Employee }) {
  const events = useActivity().data.filter((a) => a.actorId === e.id || a.detail.includes(e.fullName)).slice(0, 60);
  return (
    <Card>
      <CardHeader title="Recent activity" description="Everything this employee did or that affected them." action={<Link to="/activity" className="text-sm font-medium text-brand-700 hover:underline">Full activity log →</Link>} />
      <ActivityList events={events} />
    </Card>
  );
}

/* ───── Performance ───── */
function PerformanceTab({ e }: { e: Employee }) {
  const q = useEmployeePerformance(e.id);
  const d = q.data;
  if (q.loading) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sales (7 days)" value={formatMoney(d.revenue)} hint="after refunds" />
        <StatCard label="Transactions" value={d.salesCount} hint="7 days" />
        <StatCard label="Average sale" value={formatMoney(d.avgSale)} />
        <StatCard label="Discounts given" value={formatMoney(d.discounts)} hint={`${d.discountsApproved} needed approval`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Daily sales" description="Last 7 days" />
          {d.trend.length ? <BarChart data={d.trend} /> : <EmptyState title="No sales yet" className="py-8" />}
        </Card>
        <Card>
          <CardHeader title="Cash accuracy" description="Recent shift variances" />
          {d.shifts.length ? (
            <ul className="space-y-3">
              {d.shifts.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink-600">{formatDate(s.closedAt)}</span>
                  <Badge tone={s.variance === 0 ? "success" : Math.abs(s.variance) > 10 ? "danger" : "warning"}>{s.variance === 0 ? "Balanced" : `${s.variance > 0 ? "+" : "−"}${formatMoney(Math.abs(s.variance))}`}</Badge>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-ink-500">No closed shifts yet.</p>}
        </Card>
      </div>
    </div>
  );
}

/* ───── Sign-ins ───── */
function SignInsTab({ e }: { e: Employee }) {
  const rows = useSignIns().data.filter((s) => s.employeeId === e.id);
  return (
    <Card padded={false}>
      {rows.length ? (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { key: "when", header: "When", cell: (r) => formatDateTime(r.createdAt) },
            { key: "method", header: "Method", cell: (r) => (r.method === "pin" ? "POS PIN" : "Password") },
            { key: "device", header: "Device / till", cell: (r) => r.device },
            { key: "result", header: "Result", cell: (r) => (r.success ? <Badge tone="success">Success</Badge> : <Badge tone="danger">Failed</Badge>) },
          ]}
        />
      ) : <EmptyState title="No sign-ins yet" />}
    </Card>
  );
}

/* ───── Security ───── */
function SecurityTab({ e, onAction }: { e: Employee; onAction: (k: "suspend" | "deactivate" | "pin" | "password" | "signout" | "delete") => void }) {
  const { user } = useSession();
  const deleted = e.status === "deleted";
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader title="POS PIN" description="Used to unlock the till and approve actions. Only the employee knows it." />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><LuKeyRound className="size-5 text-ink-400" /><PinBadge e={e} /></div>
          <Button variant="secondary" onClick={() => onAction("pin")} disabled={!e.hasPin || deleted}>Reset PIN</Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Password & sessions" />
        <div className="space-y-4">
          <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Reset password</p><p className="text-xs text-ink-500">{e.email ? "Emails a reset link." : "Issues a new temporary password."}</p></div><Button variant="secondary" onClick={() => onAction("password")} disabled={deleted}>Reset</Button></div>
          <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Sign out everywhere</p><p className="text-xs text-ink-500">Ends all back-office and POS sessions now.</p></div><Button variant="secondary" icon={<LuLogOut className="size-4" />} onClick={() => onAction("signout")} disabled={deleted}>Sign out</Button></div>
        </div>
      </Card>
      {!e.isOwner ? (
        <Card className="ring-rose-200">
          <CardHeader title={<span className="text-rose-700">Danger zone</span>} />
          <div className="space-y-4">
            <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Suspend</p><p className="text-xs text-ink-500">Temporarily block access, e.g. during an investigation.</p></div><Button variant="secondary" disabled={deleted || e.status !== "active"} onClick={() => onAction("suspend")}>Suspend</Button></div>
            <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Deactivate</p><p className="text-xs text-ink-500">They've left the business. History stays; the seat is freed.</p></div><Button variant="danger" disabled={deleted || e.status === "deactivated"} onClick={() => onAction("deactivate")}>Deactivate</Button></div>
            {user.isOwner && !deleted && (
              <div className="flex items-center justify-between border-t border-rose-200 pt-4"><div><p className="text-sm font-medium text-rose-700">Delete account</p><p className="text-xs text-ink-500">Permanently removes their login. Their sales, shifts and records stay in your history.</p></div><Button variant="danger" icon={<LuTrash2 className="size-4" />} onClick={() => onAction("delete")}>Delete</Button></div>
            )}
            <p className="flex items-center gap-2 text-xs text-ink-500"><LuShieldCheck className="size-4" /> Deleting an employee never erases their data — it only revokes their access. Only the owner can delete accounts.</p>
          </div>
        </Card>
      ) : (
        <Callout tone="info" icon={<LuCrown className="size-4" />} title="Owner account is protected">It can't be suspended or deactivated by other users. Transfer ownership from Settings first.</Callout>
      )}
    </div>
  );
}
