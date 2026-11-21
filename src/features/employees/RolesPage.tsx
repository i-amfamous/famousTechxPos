import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LuCheck, LuCopy, LuLock, LuMinus, LuPlus, LuShieldCheck, LuTrash2 } from "react-icons/lu";
import { actions, usePermissions, useRoles } from "@/services/api";
import { Badge, Button, Callout, Card, ConfirmDialog, Input, PageHeader, Switch, Tabs, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/format";
import type { Role } from "@/types";

export function RolesPage() {
  const roles = useRoles().data;
  const perms = usePermissions().data;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"edit" | "compare">("edit");
  const [selId, setSelId] = useState<string | undefined>(roles[2]?.id ?? roles[0]?.id);
  useEffect(() => { if (!selId && roles.length) setSelId(roles.find((r) => r.key === "manager")?.id ?? roles[0]!.id); }, [roles, selId]);
  const [draft, setDraft] = useState<Role | null>(null);
  const [del, setDel] = useState(false);
  const modules = useMemo(() => [...new Set(perms.map((p) => p.module))], [perms]);
  const sel = roles.find((r) => r.id === selId);

  useEffect(() => { if (sel) setDraft(structuredClone(sel)); }, [sel]);

  const dirty = draft && sel && JSON.stringify(draft) !== JSON.stringify(sel);
  const locked = draft?.key === "owner";
  const toggle = (key: string) => setDraft((d) => d && { ...d, permissions: d.permissions.includes(key) ? d.permissions.filter((k) => k !== key) : [...d.permissions, key] });
  const toggleModule = (m: string, on: boolean) => {
    const keys = perms.filter((p) => p.module === m).map((p) => p.key);
    setDraft((d) => d && { ...d, permissions: on ? [...new Set([...d.permissions, ...keys])] : d.permissions.filter((k) => !keys.includes(k)) });
  };

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Roles are templates. Changing a role updates everyone who has it (except their custom changes)."
        actions={<Button icon={<LuPlus className="size-4" />} onClick={() => { setDraft({ id: "new", key: "custom", name: "New role", description: "", isSystem: false, memberCount: 0, limits: { maxDiscountPercent: 0, maxRefundAmount: 0, allowNoSale: false }, permissions: ["pos.sell"] }); setSelId("new"); setView("edit"); }}>New role</Button>}
      />
      <Tabs className="mb-6" value={view} onChange={setView} tabs={[{ value: "edit", label: "Edit roles" }, { value: "compare", label: "Compare all roles" }]} />

      {view === "compare" ? (
        <Card padded={false} className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50">
                <th className="sticky left-0 bg-ink-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">Permission</th>
                {roles.map((r) => <th key={r.id} className="whitespace-nowrap px-3 py-3 text-center text-xs font-semibold text-ink-700">{r.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {modules.map((m) => (
                <FragmentRows key={m} title={m} span={roles.length + 1}>
                  {perms.filter((p) => p.module === m).map((p) => (
                    <tr key={p.key} className="border-b border-ink-100 hover:bg-ink-50/60">
                      <td className="sticky left-0 bg-white px-4 py-2 text-ink-700">{p.label}{p.sensitive && <span className="ml-1.5 text-amber-600" title="Sensitive">●</span>}</td>
                      {roles.map((r) => (
                        <td key={r.id} className="px-3 py-2 text-center">
                          {r.permissions.includes(p.key) ? <LuCheck className="mx-auto size-4 text-emerald-600" aria-label="Yes" /> : <LuMinus className="mx-auto size-4 text-ink-300" aria-label="No" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </FragmentRows>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <Card padded={false} className="h-fit">
            <ul className="divide-y divide-ink-100">
              {roles.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setSelId(r.id)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left", selId === r.id ? "bg-brand-50" : "hover:bg-ink-50")}>
                    <span className={cn("flex size-9 items-center justify-center rounded-lg", selId === r.id ? "bg-gradient-to-br from-brand-500 to-violet-600 text-white" : "bg-ink-100 text-ink-500")}>{r.key === "owner" ? <LuLock className="size-4" /> : <LuShieldCheck className="size-4" />}</span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-ink-900">{r.name}</span>
                      <span className="block text-xs text-ink-500">{r.memberCount} member{r.memberCount === 1 ? "" : "s"} · {r.isSystem ? "Default" : "Custom"}</span>
                    </span>
                  </button>
                </li>
              ))}
              {selId === "new" && <li className="bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800">New role (unsaved)</li>}
            </ul>
          </Card>

          {draft && (
            <div className="space-y-6">
              {locked && <Callout tone="info" icon={<LuLock className="size-4" />} title="The Owner role can't be changed">Owners always have full access.</Callout>}
              <Card>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Role name" value={draft.name} disabled={locked} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  <Textarea label="Description" rows={1} value={draft.description} disabled={locked} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
                <h3 className="mt-6 text-sm font-semibold text-ink-900">Limits without manager approval</h3>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <Input label="Max discount" prefix="%" inputMode="numeric" value={String(draft.limits.maxDiscountPercent)} disabled={locked} onChange={(e) => setDraft({ ...draft, limits: { ...draft.limits, maxDiscountPercent: Number(e.target.value.replace(/\D/g, "")) || 0 } })} />
                  <Input label="Max refund" prefix="GH₵" inputMode="numeric" value={String(draft.limits.maxRefundAmount)} disabled={locked} onChange={(e) => setDraft({ ...draft, limits: { ...draft.limits, maxRefundAmount: Number(e.target.value.replace(/\D/g, "")) || 0 } })} hint="0 = always needs approval" />
                  <div className="pt-7"><Switch label="Open drawer without sale" checked={draft.limits.allowNoSale} disabled={locked} onChange={(v) => setDraft({ ...draft, limits: { ...draft.limits, allowNoSale: v } })} /></div>
                </div>
              </Card>

              <Card padded={false}>
                <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
                  <div>
                    <h3 className="font-semibold text-ink-900">Permissions</h3>
                    <p className="text-sm text-ink-500">{draft.permissions.length} of {perms.length} enabled</p>
                  </div>
                  <Badge tone="warning">● Sensitive actions are logged</Badge>
                </div>
                <div className="grid gap-px bg-ink-100 sm:grid-cols-2">
                  {modules.map((m) => {
                    const mp = perms.filter((p) => p.module === m);
                    const allOn = mp.every((p) => draft.permissions.includes(p.key));
                    return (
                      <div key={m} className="bg-white p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-sm font-semibold text-ink-900">{m}</p>
                          {!locked && <button className="text-xs font-medium text-brand-700 hover:underline" onClick={() => toggleModule(m, !allOn)}>{allOn ? "Turn all off" : "Turn all on"}</button>}
                        </div>
                        <ul className="space-y-2.5">
                          {mp.map((p) => (
                            <li key={p.key} className="flex items-center gap-3">
                              <input id={`p-${p.key}`} type="checkbox" className="size-4 rounded accent-brand-600" checked={draft.permissions.includes(p.key)} disabled={locked} onChange={() => toggle(p.key)} />
                              <label htmlFor={`p-${p.key}`} className="flex-1 text-sm text-ink-700">{p.label}</label>
                              {p.sensitive && <span className="text-amber-500" title="Sensitive">●</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {!locked && (
                <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-pop ring-1 ring-ink-200">
                  <div className="flex gap-2">
                    <Button variant="secondary" icon={<LuCopy className="size-4" />} onClick={() => { setDraft({ ...draft, id: "new", name: `${draft.name} (copy)`, isSystem: false, memberCount: 0 }); setSelId("new"); }}>Duplicate</Button>
                    {!draft.isSystem && draft.id !== "new" && <Button variant="dangerGhost" icon={<LuTrash2 className="size-4" />} onClick={() => setDel(true)}>Delete</Button>}
                  </div>
                  <div className="flex items-center gap-3">
                    {draft.memberCount > 0 && dirty && <span className="text-xs text-ink-500">Affects {draft.memberCount} employee{draft.memberCount > 1 && "s"}</span>}
                    <Button variant="secondary" disabled={!dirty} onClick={() => sel && setDraft(structuredClone(sel))}>Discard</Button>
                    <Button loading={busy} disabled={(!dirty && draft.id !== "new") || draft.name.trim().length < 2} onClick={async () => {
                      setBusy(true);
                      try { const id = await actions.saveRole(draft); setSelId(id); toast({ tone: "success", title: "Role saved", body: "Change recorded in the activity log." }); }
                      catch (e) { toast({ tone: "error", title: "Couldn't save role", body: (e as Error).message }); }
                      finally { setBusy(false); }
                    }}>Save role</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <ConfirmDialog open={del} onClose={() => setDel(false)} title={`Delete “${draft?.name}”?`} message={draft?.memberCount ? `Move its ${draft.memberCount} members to another role first.` : "This custom role will be removed."} confirmLabel="Delete role" onConfirm={async () => {
        if (!draft) return;
        try { await actions.deleteRole(draft.id); setSelId(roles.find((r) => r.key === "cashier")?.id ?? roles[0]?.id); toast({ tone: "success", title: "Role deleted" }); }
        catch (e) { toast({ tone: "error", title: "Couldn't delete role", body: (e as Error).message }); }
      }} />
    </>
  );
}

function FragmentRows({ title, span, children }: { title: string; span: number; children: ReactNode }) {
  return (
    <>
      <tr className="bg-ink-50/60"><td colSpan={span} className="sticky left-0 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</td></tr>
      {children}
    </>
  );
}
