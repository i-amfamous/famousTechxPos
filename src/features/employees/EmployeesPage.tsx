import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuCopy, LuEllipsisVertical, LuKeyRound, LuLogOut, LuMail, LuPencil, LuUserCheck, LuUserPlus, LuUserX, LuUsers,
} from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useBranches, useEmployees, useRoles } from "@/services/api";
import {
  Avatar, Badge, Button, Callout, Card, Checkbox, ConfirmDialog, DataState, DataTable, Drawer, EmptyState, FilterBar, Input, Menu,
  PageHeader, Pager, SearchInput, Segmented, Select, Tabs, useToast, type Column,
} from "@/components/ui";
import { timeAgo } from "@/lib/format";
import type { Employee } from "@/types";
import { CopyField, PinBadge, StatusBadge, resendInvite } from "./shared";


export function EmployeesPage() {
  const q = useEmployees();
  const roles = useRoles().data;
  const branches = useBranches().data;
  const navigate = useNavigate();
  const toast = useToast();
  const { seatLimit: SEATS, can } = useSession();
  const [tab, setTab] = useState<"all" | Employee["status"]>("all");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [branch, setBranch] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<{ e: Employee; kind: "suspend" | "deactivate" | "reactivate" | "pin" | "signout" } | null>(null);

  const all = q.data;
  const counts = useMemo(() => ({
    all: all.length,
    active: all.filter((e) => e.status === "active").length,
    invited: all.filter((e) => e.status === "invited").length,
    suspended: all.filter((e) => e.status === "suspended").length,
    deactivated: all.filter((e) => e.status === "deactivated").length,
  }), [all]);
  const seatsUsed = counts.active + counts.invited + counts.suspended;

  const rows = all.filter(
    (e) =>
      (tab === "all" || e.status === tab) &&
      (!role || e.roleId === role) &&
      (!branch || e.branchIds.includes(branch)) &&
      (e.fullName + e.employeeCode + (e.email ?? "") + e.phone).toLowerCase().includes(search.toLowerCase()),
  );

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "—";

  const columns: Column<Employee>[] = [
    {
      key: "name", header: "Employee",
      cell: (e) => (
        <div className="flex items-center gap-3">
          <Avatar name={e.fullName} color={e.status === "deactivated" ? "bg-ink-400" : e.avatarColor} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium text-ink-900">{e.fullName}{e.isOwner && <Badge tone="brand">Owner</Badge>}</p>
            <p className="truncate text-xs text-ink-500">{e.employeeCode} · {e.email ?? e.phone}</p>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", cell: (e) => <span className="text-ink-800">{roleName(e.roleId)}{e.overrides.length > 0 && <span className="ml-1.5 text-xs text-violet-600">+{e.overrides.length} custom</span>}</span> },
    { key: "branches", header: "Branches", hideBelow: "lg", cell: (e) => <span className="text-ink-600">{e.branchIds.map((b) => branches.find((x) => x.id === b)?.name.split(" – ")[0]).join(", ")}</span> },
    { key: "status", header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
    { key: "pin", header: "POS PIN", hideBelow: "md", cell: (e) => <PinBadge e={e} /> },
    { key: "last", header: "Last sign-in", hideBelow: "md", cell: (e) => <span className="text-ink-500">{e.lastSignInAt ? timeAgo(e.lastSignInAt) : e.status === "invited" ? "Invite pending" : "Never"}</span> },
    {
      key: "menu", header: <span className="sr-only">Actions</span>, align: "right",
      cell: (e) => (
        <div onClick={(ev) => ev.stopPropagation()}>
          <Menu
            trigger={(p) => <button {...p} aria-label={`Actions for ${e.fullName}`} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><LuEllipsisVertical className="size-4" /></button>}
            items={[
              { label: "View & edit", icon: <LuPencil />, onClick: () => navigate(`/employees/${e.id}`) },
              ...(e.status === "invited" ? [{ label: "Resend invite", icon: <LuMail />, onClick: () => resendInvite(e.id, e.email, toast) }] : []),
              { label: "Reset POS PIN", icon: <LuKeyRound />, onClick: () => setConfirm({ e, kind: "pin" }), disabled: e.status === "deactivated" },
              { label: "Sign out everywhere", icon: <LuLogOut />, onClick: () => setConfirm({ e, kind: "signout" }), disabled: e.status !== "active" },
              "divider",
              e.status === "suspended" || e.status === "deactivated"
                ? { label: "Reactivate", icon: <LuUserCheck />, onClick: () => setConfirm({ e, kind: "reactivate" }) }
                : { label: "Suspend", icon: <LuUserX />, onClick: () => setConfirm({ e, kind: "suspend" }), disabled: e.isOwner },
              ...(e.status !== "deactivated" ? [{ label: "Deactivate", icon: <LuUserX />, danger: true, onClick: () => setConfirm({ e, kind: "deactivate" }), disabled: e.isOwner }] : []),
            ]}
          />
        </div>
      ),
    },
  ];

  const confirmCopy = confirm && {
    suspend: { title: `Suspend ${confirm.e.fullName}?`, message: "They'll be signed out immediately and can't use the POS or back office until reactivated. Their history stays.", label: "Suspend", reason: true },
    deactivate: { title: `Deactivate ${confirm.e.fullName}?`, message: "Use this when someone leaves. They lose access immediately. Their sales and activity stay in reports. You can reactivate later.", label: "Deactivate", reason: true },
    reactivate: { title: `Reactivate ${confirm.e.fullName}?`, message: "They'll be able to sign in again with their existing role and branches.", label: "Reactivate", reason: false },
    pin: { title: `Reset ${confirm.e.displayName}'s PIN?`, message: "Their current PIN stops working. They'll create a new one the next time they tap their name on the POS.", label: "Reset PIN", reason: false },
    signout: { title: `Sign ${confirm.e.displayName} out everywhere?`, message: "Ends all their back-office and POS sessions right away.", label: "Sign out", reason: false },
  }[confirm.kind];

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone who can sign in to your business. Each person has their own login and POS PIN."
        actions={can("employees.manage") && <Button icon={<LuUserPlus className="size-4" />} onClick={() => setAdding(true)} disabled={seatsUsed >= SEATS}>Add employee</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm shadow-card ring-1 ring-ink-200/70">
        <LuUsers className="size-4 text-ink-400" />
        <span className="text-ink-600"><span className="num font-semibold text-ink-900">{seatsUsed}</span> of {SEATS} employee seats used on your plan</span>
        <div className="h-1.5 w-32 rounded-full bg-ink-100"><div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(seatsUsed / SEATS) * 100}%` }} /></div>
        <span className="text-xs text-ink-400">Deactivated employees don't use a seat.</span>
      </div>

      <Card padded={false}>
        <Tabs
          className="px-4"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "all", label: "All", count: counts.all },
            { value: "active", label: "Active", count: counts.active },
            { value: "invited", label: "Invited", count: counts.invited },
            { value: "suspended", label: "Suspended", count: counts.suspended },
            { value: "deactivated", label: "Deactivated", count: counts.deactivated },
          ]}
        />
        <FilterBar>
          <SearchInput className="sm:w-72" placeholder="Search name, code, email, phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select aria-label="Role" className="sm:w-48" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">All roles</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Select aria-label="Branch" className="sm:w-52" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </FilterBar>
        <DataState
          query={{ ...q, data: rows }}
          empty={
            all.length === 0 && !q.loading ? (
              <EmptyState icon={<LuUsers className="size-7" />} title="No employees yet" description="Add your first cashier or manager. They'll get their own login and POS PIN." action={<Button icon={<LuUserPlus className="size-4" />} onClick={() => setAdding(true)}>Add employee</Button>} />
            ) : (
              <EmptyState title="No employees match" description="Try a different search or filter." />
            )
          }
        >
          {(data) => <DataTable columns={columns} rows={data} rowKey={(e) => e.id} onRowClick={(e) => navigate(`/employees/${e.id}`)} footer={<Pager total={data.length} />} />}
        </DataState>
      </Card>

      <AddEmployeeDrawer open={adding} onClose={() => setAdding(false)} />

      {confirm && confirmCopy && (
        <ConfirmDialog
          open
          onClose={() => setConfirm(null)}
          title={confirmCopy.title}
          message={confirmCopy.message}
          confirmLabel={confirmCopy.label}
          tone={confirm.kind === "reactivate" || confirm.kind === "pin" || confirm.kind === "signout" ? "primary" : "danger"}
          requireReason={confirmCopy.reason}
          onConfirm={async (reason) => {
            const e = confirm.e;
            try {
              if (confirm.kind === "pin") await actions.resetPin(e.id);
              else if (confirm.kind === "signout") await actions.employeeAdmin("sign_out", e.id);
              else await actions.employeeAdmin("set_status", e.id, { status: confirm.kind === "reactivate" ? "active" : confirm.kind === "suspend" ? "suspended" : "deactivated", reason });
              toast({ tone: "success", title: `${confirmCopy.label}: ${e.fullName}` });
            } catch (er) {
              toast({ tone: "error", title: "Couldn't complete that", body: (er as Error).message });
            }
          }}
        />
      )}
    </>
  );
}

/* ═════════════ Add employee ═════════════ */
export function AddEmployeeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const roles = useRoles().data.filter((r) => r.key !== "owner");
  const branches = useBranches().data.filter((b) => b.status === "active");
  const toast = useToast();
  const { can, branch } = useSession();
  const [method, setMethod] = useState<"email" | "temp_password">("email");
  const [roleId, setRoleId] = useState("");
  const [selBranches, setSelBranches] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; tempPassword?: string; inviteLink?: string } | null>(null);
  useEffect(() => {
    if (open) {
      setRoleId(roles.find((r) => r.key === "cashier")?.id ?? roles[0]?.id ?? "");
      setSelBranches(branch.id ? [branch.id] : []);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const role = roles.find((r) => r.id === roleId);

  const errors = {
    name: name && name.trim().length < 3 ? "Enter the full name" : undefined,
    email: email && !/^\S+@\S+\.\S+$/.test(email) ? "Enter a valid email" : undefined,
  };
  const valid = name.trim().length >= 3 && phone.replace(/\D/g, "").length >= 9 && selBranches.length > 0 && !!roleId && (method === "temp_password" ? !errors.email : /^\S+@\S+\.\S+$/.test(email));

  const close = () => { setCreated(null); setName(""); setDisplayName(""); setCode(""); setEmail(""); setPhone(""); setError(null); onClose(); };

  return (
    <Drawer
      open={open}
      onClose={close}
      title={created ? "Employee added" : "Add employee"}
      description={created ? undefined : "They'll have their own login. Their POS PIN is created the first time they use a till."}
      footer={
        created ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button
              disabled={!valid}
              loading={busy}
              onClick={async () => {
                setBusy(true); setError(null);
                try {
                  const r = await actions.createEmployee({ fullName: name.trim(), displayName: displayName.trim() || undefined, phone, email: email.trim() || undefined, roleId,
                    branchIds: selBranches, inviteMethod: method, hireDate, employeeCode: code.trim() || undefined });
                  setCreated({ name, tempPassword: r.tempPassword, inviteLink: r.inviteLink });
                  toast({ tone: "success", title: method === "email" ? (r.inviteLink ? "Employee added" : "Invite sent") : "Employee created", body: name });
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {method === "email" ? "Send invite" : "Create account"}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          {method === "email" && created.inviteLink ? (
            <>
              <Callout tone="warning" title="Email isn't set up on the server">Send {created.name} this invite link yourself (WhatsApp, SMS…). It works once and expires in 7 days.</Callout>
              <CopyField value={created.inviteLink} label="Copy invite link" />
            </>
          ) : method === "email" ? (
            <Callout tone="success" title={`Invite sent to ${email}`}>{created.name} will appear as “Invited” until they accept and set a password.</Callout>
          ) : (
            <>
              <Callout tone="success" title={`${created.name} can sign in now`}>Give them these details privately. They must change the password the first time they sign in.</Callout>
              <div className="space-y-2 rounded-xl bg-ink-50 p-4 font-mono text-sm ring-1 ring-ink-200">
                <div className="flex justify-between"><span className="text-ink-500">Sign in with</span><span>{email || phone}</span></div>
                <div className="flex items-center justify-between"><span className="text-ink-500">Temporary password</span><span className="flex items-center gap-2">{created.tempPassword}<button aria-label="Copy password" className="text-ink-400 hover:text-ink-800" onClick={() => navigator.clipboard?.writeText(created.tempPassword ?? "")}><LuCopy className="size-4" /></button></span></div>
              </div>
              <p className="text-xs text-ink-500">This password is shown once. You can issue a new one from their profile.</p>
            </>
          )}
        </div>
      ) : (
        <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
          {error && <Callout tone="danger">{error}</Callout>}
          <section className="space-y-4">
            <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Name on receipts" placeholder={name.split(" ")[0] || "e.g. Kofi"} value={displayName} onChange={(e) => setDisplayName(e.target.value)} hint="“Served by …”" />
              <Input label="Employee code" placeholder="Auto" value={code} onChange={(e) => setCode(e.target.value)} hint="Leave empty to auto-number" />
            </div>
            <Input label="Phone" required inputMode="tel" placeholder="024 000 0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </section>

          <section className="space-y-3 border-t border-ink-100 pt-5">
            <p className="text-sm font-medium text-ink-700">How will they get access?</p>
            <Segmented value={method} onChange={setMethod} options={[{ value: "email", label: "Email invite" }, { value: "temp_password", label: "Temporary password" }]} />
            {method === "email" ? (
              <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} hint="They'll get a link to set their own password." />
            ) : (
              <>
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} hint="Optional — staff without email sign in with their phone number." />
                <Callout tone="info">You'll see a temporary password once. They must change it at first sign-in.</Callout>
              </>
            )}
          </section>

          <section className="space-y-3 border-t border-ink-100 pt-5">
            <Select label="Role" required value={roleId} onChange={(e) => setRoleId(e.target.value)} hint={role?.description}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            {role && (
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg bg-ink-50 p-2"><p className="text-ink-500">Max discount</p><p className="num font-semibold text-ink-900">{role.limits.maxDiscountPercent}%</p></div>
                <div className="rounded-lg bg-ink-50 p-2"><p className="text-ink-500">Max refund</p><p className="num font-semibold text-ink-900">{role.limits.maxRefundAmount ? `GH₵ ${role.limits.maxRefundAmount.toLocaleString()}` : "None"}</p></div>
                <div className="rounded-lg bg-ink-50 p-2"><p className="text-ink-500">Permissions</p><p className="num font-semibold text-ink-900">{role.permissions.length}</p></div>
              </div>
            )}
            {can("roles.manage") && <p className="text-xs text-ink-500">You can fine-tune individual permissions after creating them.</p>}
          </section>

          <section className="space-y-2 border-t border-ink-100 pt-5">
            <p className="text-sm font-medium text-ink-700">Branch access <span className="text-rose-600">*</span></p>
            {branches.map((b) => (
              <Checkbox
                key={b.id}
                className="flex"
                label={b.name}
                checked={selBranches.includes(b.id)}
                onChange={(e) => setSelBranches((s) => (e.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id)))}
              />
            ))}
            {selBranches.length === 0 && <p className="text-xs text-rose-600">Choose at least one branch.</p>}
          </section>

          <section className="border-t border-ink-100 pt-5">
            <Input label="Start date" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
          </section>
        </form>
      )}
    </Drawer>
  );
}
