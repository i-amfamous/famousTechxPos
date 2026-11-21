import { useNavigate } from "react-router-dom";
import { LuBuilding2, LuCompass, LuLock, LuServer } from "react-icons/lu";
import { useSession } from "@/app/session";
import { Avatar, Badge, Button, Card, CardHeader, DataTable, DL, Input, PageHeader, StatCard, useToast } from "@/components/ui";
import { formatDate } from "@/lib/format";

export function ProfilePage() {
  const { user, role } = useSession();
  const toast = useToast();
  return (
    <>
      <PageHeader title="My profile" />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-5 flex items-center gap-4"><Avatar name={user.fullName} color={user.avatarColor} size="xl" /><div><p className="text-lg font-semibold">{user.fullName}</p><p className="text-sm text-ink-500">{role.name}</p></div></div>
          <div className="space-y-4"><Input label="Full name" defaultValue={user.fullName} /><Input label="Phone" defaultValue={user.phone} /><Input label="Email" defaultValue={user.email} disabled hint="Ask the owner to change your email." /></div>
          <div className="mt-5 flex justify-end"><Button onClick={() => toast({ tone: "success", title: "Profile saved" })}>Save</Button></div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Change password" />
            <div className="space-y-4"><Input label="Current password" type="password" /><Input label="New password" type="password" hint="At least 8 characters with a number" /><Input label="Confirm new password" type="password" /></div>
            <div className="mt-5 flex justify-end"><Button onClick={() => toast({ tone: "success", title: "Password updated" })}>Update password</Button></div>
          </Card>
          <Card>
            <CardHeader title="POS PIN" description="Change it on any till: tap your name, then “Change PIN”." />
            <DL cols={1} items={[{ label: "Status", value: user.hasPin ? "Set" : "Not set" }]} />
          </Card>
        </div>
      </div>
    </>
  );
}

/** System-administrator area (SRS §4.17) — separate from business workspaces. */
export function PlatformAdminPage() {
  const rows = [
    { id: "b1", name: "Famous TechX", plan: "Business", status: "active", users: 8, since: "2023-02-01" },
    { id: "b2", name: "Demo Store", plan: "Trial", status: "trial", users: 2, since: "2026-11-10" },
  ];
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><LuServer className="size-6 text-ink-400" /> Platform admin</span>} description="System administrators only. Access to business data must be authorised, time-limited and audited." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Businesses" value="2" />
        <StatCard label="Active users" value="10" />
        <StatCard label="Payment provider" value={<Badge tone="warning">Not configured</Badge>} hint="Subscriptions managed manually" />
      </div>
      <Card padded={false}>
        <DataTable rows={rows} rowKey={(r) => r.id} columns={[
          { key: "n", header: "Business", cell: (r) => <span className="flex items-center gap-2 font-medium"><LuBuilding2 className="size-4 text-ink-400" />{r.name}</span> },
          { key: "p", header: "Plan", cell: (r) => r.plan },
          { key: "s", header: "Status", cell: (r) => <Badge tone={r.status === "active" ? "success" : "info"}>{r.status === "active" ? "Active" : "Trial"}</Badge> },
          { key: "u", header: "Users", align: "right", cell: (r) => r.users },
          { key: "d", header: "Since", cell: (r) => formatDate(r.since) },
          { key: "a", header: "", align: "right", cell: () => <Button size="sm" variant="secondary">Request support access</Button> },
        ]} />
      </Card>
    </>
  );
}

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
      <LuCompass className="size-12 text-ink-300" />
      <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
      <p className="mt-1 text-ink-500">The link may be old or mistyped.</p>
      <Button className="mt-6" onClick={() => navigate("/dashboard")}>Go to dashboard</Button>
    </div>
  );
}

export function UnauthorizedPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><LuLock className="size-7" /></span>
      <h1 className="mt-4 text-2xl font-semibold">You don't have access to this</h1>
      <p className="mt-1 max-w-sm text-ink-500">Your role doesn't include this page. Ask your manager or the business owner if you need it.</p>
      <Button className="mt-6" variant="secondary" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
    </div>
  );
}
