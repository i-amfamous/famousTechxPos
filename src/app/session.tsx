/**
 * UI session state: who is signed in, which branch is selected, which POS
 * terminal this device is and whether a shift is open.
 *
 * LOGIC: hydrate this from Supabase Auth + business_members + terminal
 * registration. `can()` is for showing/hiding UI only — real enforcement
 * belongs in RLS and server functions (SRS §7).
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { branches, employees, roles, terminals } from "@/mock/data";
import type { Branch, Employee, Role, Terminal } from "@/types";

interface SessionState {
  user: Employee;
  role: Role;
  branch: Branch;
  setBranchId: (id: string) => void;
  terminal: Terminal | null;
  /** Employee currently using the POS on this terminal (PIN session). */
  posUser: Employee | null;
  setPosUser: (e: Employee | null) => void;
  shiftOpen: boolean;
  setShiftOpen: (v: boolean) => void;
  can: (permission: string) => boolean;
  roleOf: (e: Employee) => Role;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [branchId, setBranchId] = useState(branches[0]!.id);
  const [posUser, setPosUser] = useState<Employee | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);

  const value = useMemo<SessionState>(() => {
    const user = employees[0]!; // signed-in back-office user (Owner) for design review
    const roleOf = (e: Employee) => roles.find((r) => r.id === e.roleId) ?? roles[0]!;
    const role = roleOf(user);
    return {
      user,
      role,
      branch: branches.find((b) => b.id === branchId) ?? branches[0]!,
      setBranchId,
      terminal: terminals[0]!,
      posUser,
      setPosUser,
      shiftOpen,
      setShiftOpen,
      roleOf,
      can: (p) => {
        const o = user.overrides.find((x) => x.permission === p);
        if (o) return o.effect === "grant";
        return role.permissions.includes(p);
      },
    };
  }, [branchId, posUser, shiftOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}
