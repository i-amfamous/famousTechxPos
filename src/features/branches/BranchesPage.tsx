import { useEffect, useState } from "react";
import { LuBuilding2, LuMapPin, LuMonitorSmartphone, LuPhone, LuPlus, LuUsers } from "react-icons/lu";
import { actions, useBranches, useEmployees, useTerminals } from "@/services/api";
import { Badge, Button, Card, DataState, Drawer, EmptyState, Input, PageHeader, Switch, useToast } from "@/components/ui";
import type { Branch } from "@/types";

export function BranchesPage() {
  const q = useBranches();
  const employees = useEmployees().data;
  const terminals = useTerminals().data;
  const [edit, setEdit] = useState<Branch | "new" | null>(null);
  return (
    <>
      <PageHeader title="Branches" description="Each branch has its own stock, tills, staff and sales." actions={<Button icon={<LuPlus className="size-4" />} onClick={() => setEdit("new")}>Add branch</Button>} />
      <DataState query={q} empty={<Card><EmptyState icon={<LuBuilding2 className="size-7" />} title="No branches" /></Card>}>
        {(data) => (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.map((b) => (
              <Card key={b.id} className={b.status === "inactive" ? "opacity-70" : ""}>
                <div className="flex items-start justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><LuBuilding2 className="size-5" /></span>
                  <div className="flex gap-1.5">{b.isDefault && <Badge tone="brand">Main</Badge>}<Badge tone={b.status === "active" ? "success" : "neutral"} dot>{b.status === "active" ? "Active" : "Inactive"}</Badge></div>
                </div>
                <h3 className="mt-3 font-semibold text-ink-900">{b.name}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-500"><LuMapPin className="size-3.5" /> {b.address}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-500"><LuPhone className="size-3.5" /> {b.phone}</p>
                <div className="mt-4 flex gap-4 border-t border-ink-100 pt-4 text-sm text-ink-600">
                  <span className="flex items-center gap-1.5"><LuUsers className="size-4 text-ink-400" /> {employees.filter((e) => e.branchIds.includes(b.id) && e.status === "active").length} staff</span>
                  <span className="flex items-center gap-1.5"><LuMonitorSmartphone className="size-4 text-ink-400" /> {terminals.filter((t) => t.branchId === b.id && t.status === "active").length} tills</span>
                </div>
                <Button variant="secondary" size="sm" className="mt-4" block onClick={() => setEdit(b)}>Edit</Button>
              </Card>
            ))}
          </div>
        )}
      </DataState>
      <BranchDrawer branch={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function BranchDrawer({ branch, onClose }: { branch: Branch | "new" | null; onClose: () => void }) {
  const toast = useToast();
  const b = branch && branch !== "new" ? branch : null;
  const [f, setF] = useState({ name: "", code: "", address: "", phone: "", active: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (branch) setF({ name: b?.name ?? "", code: b?.code ?? "", address: b?.address ?? "", phone: b?.phone ?? "", active: b ? b.status === "active" : true }); }, [branch]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Drawer open={!!branch} onClose={onClose} title={b ? "Edit branch" : "Add branch"} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={f.name.trim().length < 2} onClick={async () => {
      setBusy(true);
      try { await actions.saveBranch({ id: b?.id, name: f.name, code: f.code, address: f.address, phone: f.phone, status: f.active ? "active" : "inactive" }); toast({ tone: "success", title: "Branch saved" }); onClose(); }
      catch (e) { toast({ tone: "error", title: "Couldn't save branch", body: (e as Error).message }); }
      finally { setBusy(false); }
    }}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Input label="Branch name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          <Input label="Code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().slice(0, 4) })} hint="On receipts" />
        </div>
        <Input label="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        <Input label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Switch label="Active" description="Inactive branches can't sell and are hidden from tills." checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
      </div>
    </Drawer>
  );
}
