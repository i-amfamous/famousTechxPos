/**
 * Session state for the whole app.
 *  - Back office: the signed-in employee, their business, role, permissions and branch.
 *  - Tills: which registered terminal this device is, who is unlocked on it (PIN) and their shift.
 * In DEMO mode (no VITE_API_URL) it serves sample data so every screen can be explored.
 *
 * `can()` only shows/hides UI. Real enforcement happens on the API server.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as mock from "@/mock/data";
import { AppError } from "@/lib/errors";
import { DEMO, SIGNED_OUT_EVENT, credentials, http, storage, type TerminalLink } from "@/lib/http";
import { invalidateAll, resetQueries, SESSION_REFRESH_EVENT, useQuery } from "@/lib/query";
import type { Branch, Employee, Role, RosterMember, Terminal } from "@/types";

export interface Business { id: string; name: string; phone?: string; email?: string; address?: string; tin?: string; registration_no?: string; category?: string; logo_url?: string; timezone?: string }
export type Settings = Record<string, string | number | boolean>;

interface SessionState {
  demo: boolean;
  /** Auth state resolved (always true in demo). */
  ready: boolean;
  signedIn: boolean;
  passwordSession: boolean;
  needsOnboarding: boolean;
  mustChangePassword: boolean;
  authEmail: string | null;

  orgId: string;
  seatLimit: number;
  business: Business | null;
  settings: Settings;
  user: Employee;
  role: Role;
  permissions: string[];
  can: (permission: string) => boolean;
  roleOf: (e: Pick<Employee, "roleId">) => Role;
  roles: Role[];

  branches: Branch[];
  branch: Branch;
  setBranchId: (id: string) => void;

  /** This device as a till. */
  terminal: Terminal | null;
  terminalToken: string | null;
  linkTerminal: (link: TerminalLink | null) => void;
  roster: RosterMember[];
  rosterLoading: boolean;
  refreshRoster: () => void;

  /** Employee unlocked on the till (PIN session). */
  posUser: Employee | null;
  setPosUser: (e: Employee | null) => void;
  shiftId: string | null;
  /** The till's open shift has been looked up for the current POS user. */
  shiftChecked: boolean;
  shiftOpen: boolean;
  setShiftOpen: (v: boolean) => void;
  setShiftId: (id: string | null) => void;
  refreshShift: () => Promise<string | null>;

  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

const BRANCH_KEY = "ftx.branch";
/** Cached data that belongs to this device (kept when someone signs out). */
const DEVICE_QUERIES = ["roster"];

const placeholderUser: Employee = { id: "", fullName: "", displayName: "", phone: "", employeeCode: "", roleId: "", branchIds: [], status: "active", hasPin: false, hireDate: "", avatarColor: "bg-brand-600", overrides: [] };
const placeholderRole: Role = { id: "", key: "none", name: "", description: "", isSystem: true, memberCount: 0, limits: { maxDiscountPercent: 0, maxRefundAmount: 0, allowNoSale: false }, permissions: [] };
const placeholderBranch: Branch = { id: "", name: "—", address: "", phone: "", status: "active" };

export function SessionProvider({ children }: { children: ReactNode }) {
  return DEMO ? <DemoSession>{children}</DemoSession> : <LiveSession>{children}</LiveSession>;
}

/* ═════════════ Demo ═════════════ */
function DemoSession({ children }: { children: ReactNode }) {
  const [branchId, setBranchId] = useState(mock.branches[0]!.id);
  const [posUser, setPosUser] = useState<Employee | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const changePosUser = useCallback((e: Employee | null) => { setPosUser(e); setShiftOpen(false); }, []);
  const value = useMemo<SessionState>(() => {
    const user = mock.employees[0]!;
    const roleOf = (e: Pick<Employee, "roleId">) => mock.roles.find((r) => r.id === e.roleId) ?? mock.roles[0]!;
    const branch = mock.branches.find((b) => b.id === branchId) ?? mock.branches[0]!;
    const terminal = mock.terminals[0]!;
    return {
      demo: true, ready: true, signedIn: true, passwordSession: true, needsOnboarding: false, mustChangePassword: false, authEmail: user.email ?? null,
      orgId: "demo", seatLimit: 10, business: { id: "demo", name: "Famous TechX", phone: "030 201 4455", tin: "C000XXXXXXX" },
      settings: { variance_threshold: 10, auto_lock_minutes: 5, pin_length: 4, receipt_footer: "Thank you for shopping with us!" },
      user, role: roleOf(user), permissions: roleOf(user).permissions, roles: mock.roles,
      can: (p) => { const o = user.overrides.find((x) => x.permission === p); return o ? o.effect === "grant" : roleOf(user).permissions.includes(p); },
      roleOf, branches: mock.branches, branch, setBranchId,
      terminal, terminalToken: "demo", linkTerminal: () => {},
      roster: mock.employees
        .filter((e) => e.branchIds.includes(terminal.branchId) && (e.status === "active" || e.status === "suspended") && roleOf(e).permissions.includes("pos.sell"))
        .map((e) => ({ id: e.id, fullName: e.fullName, displayName: e.displayName, avatarColor: e.avatarColor, roleName: roleOf(e).name, hasPin: e.hasPin, status: e.status, pinLocked: !!e.pinLocked, heldCount: mock.heldCarts.filter((c) => c.ownerId === e.id).length })),
      rosterLoading: false, refreshRoster: () => {},
      posUser, setPosUser: changePosUser, shiftId: shiftOpen ? "sh1" : null, shiftChecked: true, shiftOpen, setShiftOpen, setShiftId: (id) => setShiftOpen(!!id),
      refreshShift: async () => (shiftOpen ? "sh1" : null),
      refresh: async () => {}, signOut: async () => { changePosUser(null); },
    };
  }, [branchId, posUser, shiftOpen, changePosUser]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ═════════════ Live (API server) ═════════════ */
/** `GET /me` — everything the app needs to know about the signed-in person. */
interface MeResponse {
  user: { id: string; email: string | null; phone: string | null; fullName: string };
  mustChangePassword: boolean;
  passwordSession: boolean;
  method: "password" | "pin";
  terminalId: string | null;
  business: Business | null;
  member: Employee | null;
  role: Role | null;
  permissions: string[];
  branchIds: string[];
  settings: Settings;
  plan: { maxMembers: number; maxBranches: number } | null;
}

interface RosterResponse {
  terminal: { id: string; name: string; code: string; branchId: string; organizationId: string };
  branch: { id: string; name: string } | null;
  members: RosterMember[];
}

function LiveSession({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [link, setLink] = useState<TerminalLink | null>(() => credentials.terminal());
  const [branchId, setBranchIdState] = useState<string | null>(() => storage.get<string>(BRANCH_KEY));
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [shiftChecked, setShiftChecked] = useState(false);
  /** Guards against a slow shift lookup for the previous employee landing after a PIN switch. */
  const shiftEpoch = useRef(0);
  /** Both the lock screen and the session effect ask for the same shift; share one request. */
  const shiftLookup = useRef<{ promise: Promise<string | null> } | null>(null);
  /** Shown on the till between a successful PIN and `/me` confirming it. */
  const [pendingPosUser, setPendingPosUser] = useState<Employee | null>(null);

  const loadContext = useCallback(async () => {
    if (!credentials.session()) { setMe(null); return; }
    try {
      setMe(await http.get<MeResponse>("/me"));
    } catch (e) {
      if ((e as AppError).code === "unauthorized") setMe(null);
      else throw e;
    }
  }, []);

  useEffect(() => {
    loadContext().catch(() => setMe(null)).finally(() => setReady(true));
    const onSignedOut = () => { shiftEpoch.current++; shiftLookup.current = null; resetQueries(DEVICE_QUERIES); setMe(null); setPendingPosUser(null); setShiftId(null); setShiftChecked(false); };
    const onRefresh = () => { void loadContext().catch(() => undefined); };
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    window.addEventListener(SESSION_REFRESH_EVENT, onRefresh);
    return () => { window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut); window.removeEventListener(SESSION_REFRESH_EVENT, onRefresh); };
  }, [loadContext]);

  const orgId = me?.business?.id ?? "";
  const rolesQ = useQuery(["roles", orgId], () => http.get<Role[]>("/roles"), [] as Role[], !!orgId);
  const branchesQ = useQuery(["branches", orgId], () => http.get<Branch[]>("/branches"), [] as Branch[], !!orgId);
  // A locked till shows its roster using the device token alone — nobody needs to be signed in.
  const rosterQ = useQuery(["roster", link?.token ?? ""], () => http.get<RosterResponse>("/terminal/roster"), null as RosterResponse | null, !!link);

  const terminal: Terminal | null = rosterQ.data
    ? { id: rosterQ.data.terminal.id, name: rosterQ.data.terminal.name, branchId: rosterQ.data.terminal.branchId, status: "active", lastSeenAt: new Date().toISOString(), registeredBy: "" }
    : null;

  const user: Employee = me?.member ? { ...me.member, email: me.member.email ?? me.user.email ?? undefined, phone: me.member.phone || me.user.phone || "" } : placeholderUser;
  const role: Role = me?.role ?? placeholderRole;
  const permissions = me?.permissions ?? [];

  // The person signed in with a PIN on this very till is the POS user.
  const pinSessionHere = me?.method === "pin" && !!link && me.terminalId === link.id && !!me.member;
  const posUser = pinSessionHere ? user : pendingPosUser;

  // Branch: a till is pinned to its own branch; the back office remembers the last selection.
  const accessible = branchesQ.data.filter((b) => user.isOwner || (me?.branchIds ?? []).includes(b.id));
  const branch = (terminal && posUser ? branchesQ.data.find((b) => b.id === terminal.branchId) : undefined)
    ?? accessible.find((b) => b.id === branchId) ?? accessible[0] ?? placeholderBranch;

  const refreshShift = useCallback((): Promise<string | null> => {
    if (shiftLookup.current) return shiftLookup.current.promise;
    const epoch = ++shiftEpoch.current;
    const run = async (): Promise<string | null> => {
      if (!link) { setShiftChecked(true); return null; }
      try {
        const { shiftId: id } = await http.get<{ shiftId: string | null }>("/shifts/current", { terminalId: link.id });
        if (epoch !== shiftEpoch.current) return null;
        setShiftId(id);
        setShiftChecked(true);
        return id;
      } catch (e) {
        if (epoch === shiftEpoch.current) setShiftChecked(false);
        throw e;
      }
    };
    const holder = {} as { promise: Promise<string | null> };
    holder.promise = run().finally(() => { if (shiftLookup.current === holder) shiftLookup.current = null; });
    shiftLookup.current = holder;
    return holder.promise;
  }, [link]);

  useEffect(() => { if (pinSessionHere) void refreshShift().catch(() => null); }, [pinSessionHere, me?.member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const value: SessionState = {
    demo: false, ready, signedIn: !!me, passwordSession: !!me?.passwordSession,
    needsOnboarding: !!me && !me.business, mustChangePassword: !!me?.mustChangePassword, authEmail: me?.user.email ?? null,
    orgId, seatLimit: me?.plan?.maxMembers ?? 10, business: me?.business ?? null, settings: me?.settings ?? {},
    user, role, permissions, roles: rolesQ.data,
    can: (p) => permissions.includes(p),
    roleOf: (e) => rolesQ.data.find((r) => r.id === e.roleId) ?? placeholderRole,
    branches: branchesQ.data, branch,
    setBranchId: (id) => { storage.set(BRANCH_KEY, id); setBranchIdState(id); invalidateAll(); },
    terminal, terminalToken: link?.token ?? null,
    linkTerminal: (l) => { credentials.setTerminal(l); setLink(l); },
    roster: rosterQ.data?.members ?? [], rosterLoading: !!link && rosterQ.loading, refreshRoster: rosterQ.refetch,
    posUser,
    setPosUser: (e) => {
      shiftEpoch.current++;
      shiftLookup.current = null;
      setPendingPosUser(e);
      setShiftId(null);
      setShiftChecked(false);
      if (e) void loadContext();
    },
    shiftId, shiftChecked, shiftOpen: !!shiftId, setShiftOpen: (v) => { if (!v) setShiftId(null); }, setShiftId, refreshShift,
    refresh: loadContext,
    signOut: async () => {
      await http.post("/auth/logout").catch(() => null);
      credentials.setSession(null);
      shiftEpoch.current++;
      shiftLookup.current = null;
      resetQueries(DEVICE_QUERIES);
      setPendingPosUser(null);
      setShiftId(null);
      setShiftChecked(false);
      setMe(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}
