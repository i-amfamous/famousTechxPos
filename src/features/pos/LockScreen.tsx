import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuArrowLeft, LuCircleAlert, LuLock, LuLogIn, LuMonitorSmartphone, LuShoppingBag } from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useEmployees, useHeldCarts } from "@/services/api";
import { Avatar, Badge, Button, Input, PinPad } from "@/components/ui";
import { Logo } from "@/components/layout/AppLayout";
import { cn, formatTime } from "@/lib/format";
import type { RosterMember } from "@/types";

/**
 * POS lock screen on a registered terminal. Employees pick their tile and enter a PIN.
 * First-time users (no PIN yet) are asked to create one.
 */
export function LockScreen() {
  const { terminal, terminalToken, branch, setPosUser, roster, rosterLoading, refreshRoster, refreshShift, demo, user, ready, signedIn } = useSession();
  const held = useHeldCarts().data;
  const rosterHeld = roster.reduce((s, e) => s + (e.heldCount ?? 0), 0);
  const heldCount = roster.some((e) => e.heldCount !== undefined) ? rosterHeld : held.length;
  const employees = useEmployees().data;
  const [selected, setSelected] = useState<RosterMember | null>(null);
  const [mode, setMode] = useState<"enter" | "password" | "create" | "confirm">("enter");
  const [password, setPassword] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const navigate = useNavigate();
  const now = useClock();

  // While locked, nobody should be signed in on a till.
  useEffect(() => { if (!demo && ready && signedIn && terminal) void actions.lockTerminal(); }, [demo, ready, terminal?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(refreshRoster, 60_000); return () => clearInterval(t); }, [refreshRoster]);

  if (!terminal && !rosterLoading) return <NotATill />;

  const pick = (e: RosterMember) => {
    setSelected(e);
    setError(null);
    setBlocked(false);
    setPassword("");
    setMode(e.hasPin ? "enter" : "password");
  };

  const finish = async (m: RosterMember) => {
    // Session is now this employee; remember who is on the till and check their shift.
    setPosUser(employees.find((x) => x.id === m.id) ?? { ...user, id: m.id, fullName: m.fullName, displayName: m.displayName, avatarColor: m.avatarColor });
    const shift = demo ? null : await refreshShift().catch(() => null);
    navigate(shift ? "/pos" : "/pos/open-shift");
  };

  const onPin = async (pin: string) => {
    if (!selected || !terminalToken) return;
    if (mode === "create") {
      if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) { setError("That PIN is too easy to guess. Try another."); return; }
      setFirstPin(pin); setMode("confirm"); setError(null); return;
    }
    setBusy(true);
    try {
      if (mode === "confirm") {
        if (pin !== firstPin) { setError("PINs don't match. Start again."); setMode("create"); return; }
        await actions.pinSetup(selected.id, password, pin);
        await finish(selected);
        return;
      }
      const r = await actions.pinLogin(selected.id, pin);
      if (!r.ok) {
        setError(r.error);
        if (r.error.startsWith("PIN locked") || r.attemptsLeft === 0) { setBlocked(true); refreshRoster(); }
        return;
      }
      await finish(selected);
    } catch (e) {
      setError((e as Error).message);
      if (mode === "confirm") setMode("password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-br from-brand-600 via-brand-700 to-violet-800 lg:flex-row">
      {/* Left: terminal identity */}
      <div className="flex flex-col justify-between p-6 text-white lg:w-[38%] lg:p-10">
        <div className="flex items-center gap-3">
          <Logo className="size-11 text-base ring-2 ring-white/30" />
          <div>
            <p className="font-bold tracking-wide">FAMOUS TECHX</p>
            <p className="text-sm text-brand-100">{branch.name !== "—" ? branch.name : ""}</p>
          </div>
        </div>
        <div className="my-8 lg:my-0">
          <p className="num text-6xl font-semibold tracking-tight lg:text-7xl">{formatTime(now.toISOString())}</p>
          <p className="mt-2 text-brand-200">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm"><LuMonitorSmartphone className="size-4" /> {terminal?.name ?? "…"}</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm"><LuLock className="size-4" /> Locked</span>
            {heldCount > 0 && <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white"><LuShoppingBag className="size-4" /> {heldCount} held cart{heldCount > 1 && "s"}</span>}
          </div>
        </div>
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-brand-100 hover:text-white">
          <LuLogIn className="size-4" /> Back-office sign-in (email & password)
        </Link>
      </div>

      {/* Right: employee picker / PIN */}
      <div className="flex flex-1 items-center justify-center rounded-t-3xl bg-ink-50 p-6 lg:rounded-l-3xl lg:rounded-tr-none lg:p-10">
        {!selected ? (
          <div className="w-full max-w-2xl">
            <h1 className="text-2xl font-semibold text-ink-900">Who's selling?</h1>
            <p className="mt-1 text-sm text-ink-500">Tap your name and enter your PIN.</p>
            {rosterLoading ? (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white ring-1 ring-ink-200" />)}</div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {roster.map((e) => {
                  const off = e.status !== "active" || e.pinLocked;
                  return (
                    <button
                      key={e.id}
                      disabled={off}
                      onClick={() => pick(e)}
                      className={cn(
                        "flex flex-col items-center gap-3 rounded-2xl bg-white p-5 text-center shadow-card ring-1 ring-ink-200 transition-all",
                        off ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5 hover:ring-brand-400 active:scale-[.98]",
                      )}
                    >
                      <Avatar name={e.fullName} color={e.avatarColor} size="xl" />
                      <div>
                        <p className="font-semibold text-ink-900">{e.displayName}</p>
                        <p className="text-xs text-ink-500">{e.roleName}</p>
                      </div>
                      {e.status === "suspended" ? <Badge tone="warning">Suspended</Badge> : e.pinLocked ? <Badge tone="danger">PIN locked</Badge> : !e.hasPin ? <Badge tone="info">Set up PIN</Badge> : e.heldCount ? <Badge tone="warning">{e.heldCount} held</Badge> : null}
                    </button>
                  );
                })}
              </div>
            )}
            {!rosterLoading && roster.length === 0 && (
              <div className="mt-6 rounded-xl bg-white p-6 text-center text-sm text-ink-500 ring-1 ring-ink-200">
                No employees can sell at this branch yet. Ask an admin to add staff in back office.
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-sm text-center">
            <button onClick={() => setSelected(null)} className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
              <LuArrowLeft className="size-4" /> Not you?
            </button>
            <Avatar name={selected.fullName} color={selected.avatarColor} size="xl" className="mx-auto" />
            <h2 className="mt-3 text-xl font-semibold text-ink-900">
              {mode === "enter" ? `Hi ${selected.displayName}` : mode === "password" ? "Confirm it's you" : mode === "create" ? "Create your PIN" : "Confirm your PIN"}
            </h2>
            <p className="mb-6 text-sm text-ink-500">
              {mode === "enter" ? "Enter your 4-digit PIN" : mode === "password" ? "First time on a till: enter your back-office password, then choose a PIN." : mode === "create" ? "Choose 4 digits only you know. Avoid 1234 or 0000." : "Enter the same PIN again"}
            </p>
            {mode === "password" ? (
              <form className="space-y-3 text-left" onSubmit={(e) => { e.preventDefault(); if (password) { setError(null); setMode("create"); } }}>
                {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
                <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
                <Button type="submit" block size="lg" disabled={!password}>Continue</Button>
              </form>
            ) : (
              <PinPad key={mode} onComplete={onPin} error={error} busy={busy} disabled={blocked} />
            )}
            {blocked ? (
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-rose-600"><LuCircleAlert className="size-4" /> Ask a manager to reset your PIN.</div>
            ) : (
              mode === "enter" && <p className="mt-6 text-xs text-ink-400">Forgot your PIN? A manager can reset it from Employees.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Shown when this browser hasn't been registered as a till. */
function NotATill() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-600 via-brand-700 to-violet-800 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-pop">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><LuMonitorSmartphone className="size-7" /></span>
        <h1 className="mt-4 text-xl font-semibold text-ink-900">This device isn't a till yet</h1>
        <p className="mt-2 text-sm text-ink-600">An owner or admin registers a device once. After that, staff unlock it with their PIN.</p>
        <ol className="mt-5 space-y-1 text-left text-sm text-ink-700">
          <li>1. Sign in to back office with your password.</li>
          <li>2. Go to Settings → Tills → “Register this device”.</li>
        </ol>
        <Button className="mt-6" block size="lg" onClick={() => navigate("/settings?tab=terminals")}>Register this device</Button>
      </div>
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
