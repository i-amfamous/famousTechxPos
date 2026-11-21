import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuArrowLeft, LuCircleAlert, LuLock, LuLogIn, LuMonitorSmartphone, LuShoppingBag } from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useEmployees, useHeldCarts } from "@/services/api";
import { Avatar, Badge, PinPad } from "@/components/ui";
import { Logo } from "@/components/layout/AppLayout";
import { cn, formatTime } from "@/lib/format";
import type { Employee } from "@/types";

/**
 * POS lock screen on a registered terminal. Employees pick their tile and enter a PIN.
 * First-time users (no PIN yet) are asked to create one.
 */
export function LockScreen() {
  const { terminal, branch, roleOf, setPosUser, shiftOpen } = useSession();
  const team = useEmployees().data.filter((e) => e.branchIds.includes(branch.id) && (e.status === "active" || e.status === "suspended") && roleOf(e).permissions.includes("pos.sell"));
  const held = useHeldCarts().data;
  const [selected, setSelected] = useState<Employee | null>(null);
  const [mode, setMode] = useState<"enter" | "create" | "confirm">("enter");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const navigate = useNavigate();
  const now = useClock();

  const pick = (e: Employee) => {
    setSelected(e);
    setError(null);
    setAttempts(0);
    setMode(e.hasPin ? "enter" : "create");
  };

  const onPin = async (pin: string) => {
    if (!selected) return;
    if (mode === "create") {
      if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
        setError("That PIN is too easy to guess. Try another.");
        return;
      }
      setFirstPin(pin);
      setMode("confirm");
      setError(null);
      return;
    }
    if (mode === "confirm") {
      if (pin !== firstPin) { setError("PINs don't match. Start again."); setMode("create"); return; }
    }
    setBusy(true);
    const ok = await actions.verifyPin(selected.id, pin); // LOGIC
    setBusy(false);
    if (!ok) {
      const n = attempts + 1;
      setAttempts(n);
      setError(n >= 5 ? "PIN locked after 5 attempts. A manager has been notified." : `Wrong PIN. ${5 - n} attempt${5 - n === 1 ? "" : "s"} left.`);
      return;
    }
    setPosUser(selected);
    navigate(shiftOpen ? "/pos" : "/pos/open-shift");
  };

  return (
    <div className="flex min-h-full flex-col bg-brand-900 lg:flex-row">
      {/* Left: terminal identity */}
      <div className="flex flex-col justify-between p-6 text-white lg:w-[38%] lg:p-10">
        <div className="flex items-center gap-3">
          <Logo className="size-11 text-base" />
          <div>
            <p className="font-bold tracking-wide">FAMOUS TECHX</p>
            <p className="text-sm text-brand-300">{branch.name}</p>
          </div>
        </div>
        <div className="my-8 lg:my-0">
          <p className="num text-6xl font-semibold tracking-tight lg:text-7xl">{formatTime(now.toISOString())}</p>
          <p className="mt-2 text-brand-200">{now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm"><LuMonitorSmartphone className="size-4" /> {terminal?.name ?? "Unregistered device"}</span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm"><LuLock className="size-4" /> Locked</span>
            {held.length > 0 && <span className="inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-3 py-1.5 text-sm text-amber-200"><LuShoppingBag className="size-4" /> {held.length} held cart{held.length > 1 && "s"}</span>}
          </div>
        </div>
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-brand-300 hover:text-white">
          <LuLogIn className="size-4" /> Back-office sign-in (email & password)
        </Link>
      </div>

      {/* Right: employee picker / PIN */}
      <div className="flex flex-1 items-center justify-center rounded-t-3xl bg-ink-50 p-6 lg:rounded-l-3xl lg:rounded-tr-none lg:p-10">
        {!selected ? (
          <div className="w-full max-w-2xl">
            <h1 className="text-2xl font-semibold text-ink-900">Who's selling?</h1>
            <p className="mt-1 text-sm text-ink-500">Tap your name and enter your PIN.</p>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {team.map((e) => {
                const blocked = e.status === "suspended" || e.pinLocked;
                return (
                  <button
                    key={e.id}
                    disabled={blocked}
                    onClick={() => pick(e)}
                    className={cn(
                      "flex flex-col items-center gap-3 rounded-2xl bg-white p-5 text-center shadow-card ring-1 ring-ink-200 transition-all",
                      blocked ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5 hover:ring-brand-400 active:scale-[.98]",
                    )}
                  >
                    <Avatar name={e.fullName} color={e.avatarColor} size="xl" />
                    <div>
                      <p className="font-semibold text-ink-900">{e.displayName}</p>
                      <p className="text-xs text-ink-500">{roleOf(e).name}</p>
                    </div>
                    {e.pinLocked ? <Badge tone="danger">PIN locked</Badge> : !e.hasPin ? <Badge tone="info">Set up PIN</Badge> : null}
                  </button>
                );
              })}
            </div>
            {team.length === 0 && (
              <div className="mt-6 rounded-xl bg-white p-6 text-center text-sm text-ink-500 ring-1 ring-ink-200">
                No employees are assigned to this branch yet. Ask an admin to add staff in back office.
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
              {mode === "enter" ? `Hi ${selected.displayName}` : mode === "create" ? "Create your PIN" : "Confirm your PIN"}
            </h2>
            <p className="mb-6 text-sm text-ink-500">
              {mode === "enter" ? "Enter your 4-digit PIN" : mode === "create" ? "Choose 4 digits only you know. Avoid 1234 or 0000." : "Enter the same PIN again"}
            </p>
            <PinPad key={mode} onComplete={onPin} error={error} busy={busy} disabled={attempts >= 5} />
            {attempts >= 5 ? (
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

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
