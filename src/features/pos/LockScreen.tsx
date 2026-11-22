import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LuArrowLeft,
  LuArrowRight,
  LuCircleAlert,
  LuClock3,
  LuLock,
  LuLogIn,
  LuMonitorSmartphone,
  LuSearch,
  LuShieldCheck,
  LuShoppingBag,
  LuUsers,
} from "react-icons/lu";
import { useSession } from "@/app/session";
import { actions, useEmployees, useHeldCarts } from "@/services/api";
import { Avatar, Badge, Button, Callout, Input, PinPad } from "@/components/ui";
import { AuthBackdrop, AuthBrandHeader, AuthCard, AuthLoader, AuthStepper, SecurityBadge } from "@/features/auth/AuthChrome";
import { cn, formatTime } from "@/lib/format";
import type { RosterMember } from "@/types";

/**
 * POS lock screen on a registered terminal. Employees pick their tile and enter a PIN.
 * First-time users (no PIN yet) confirm their back-office password, then create one.
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
  const [stage, setStage] = useState<"idle" | "verifying" | "opening">("idle");
  const [blocked, setBlocked] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const now = useClock();

  // While locked, nobody should be signed in on a till.
  useEffect(() => { if (!demo && ready && signedIn && terminal) void actions.lockTerminal(); }, [demo, ready, terminal?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(refreshRoster, 60_000); return () => clearInterval(t); }, [refreshRoster]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter((e) => `${e.fullName} ${e.displayName} ${e.roleName}`.toLowerCase().includes(q));
  }, [roster, query]);

  if (!terminal && !rosterLoading) return <NotATill />;

  const pick = (e: RosterMember) => {
    setSelected(e);
    setError(null);
    setBlocked(false);
    setPassword("");
    setFirstPin("");
    setQuery("");
    setMode(e.hasPin ? "enter" : "password");
  };

  const finish = async (m: RosterMember) => {
    // Session is now this employee; remember who is on the till and check their shift.
    setStage("opening");
    try {
      setPosUser(employees.find((x) => x.id === m.id) ?? { ...user, id: m.id, fullName: m.fullName, displayName: m.displayName, avatarColor: m.avatarColor });
      const shift = demo ? null : await refreshShift().catch(() => null);
      navigate(shift ? "/pos" : "/pos/open-shift", { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setStage("idle");
    }
  };

  const onPin = async (pin: string) => {
    if (!selected || !terminalToken) return;
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
    if (mode === "confirm" && pin !== firstPin) {
      setError("PINs don't match. Let's choose it again.");
      setFirstPin("");
      setMode("create");
      return;
    }

    setStage("verifying");
    try {
      if (mode === "confirm") {
        await actions.pinSetup(selected.id, password, pin);
        await finish(selected);
        return;
      }
      const r = await actions.pinLogin(selected.id, pin);
      if (!r.ok) {
        setError(r.error ?? "That PIN didn't match. Try again.");
        if (r.error.startsWith("PIN locked") || r.attemptsLeft === 0) {
          setBlocked(true);
          refreshRoster();
        }
        setStage("idle");
        return;
      }
      await finish(selected);
    } catch (e) {
      setError((e as Error).message);
      if (mode === "confirm") setMode("password");
      setStage("idle");
    }
  };

  const steps = selected?.hasPin ? ["Select cashier", "Enter PIN"] : ["Select cashier", "Verify password", "Create PIN"];
  const activeStep = mode === "create" || mode === "confirm" ? 2 : 1;

  return (
    <AuthBackdrop>
      {/* Brand + terminal identity */}
      <div className="relative hidden w-[38%] shrink-0 flex-col justify-between border-r border-white/10 px-9 py-9 lg:flex xl:px-14 xl:py-12">
        <AuthBrandHeader />

        <div className="my-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-100 ring-1 ring-white/15">
            <LuLock className="size-3.5" /> Till locked
          </span>
          <p className="num mt-6 text-6xl font-semibold tracking-[-0.06em] xl:text-7xl">{formatTime(now.toISOString())}</p>
          <p className="mt-2 flex items-center gap-2 text-base text-brand-100">
            <LuClock3 className="size-4" /> {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </p>

          <div className="mt-8 space-y-2.5">
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/10 backdrop-blur-sm">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/15"><LuMonitorSmartphone className="size-5" /></span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-200">This terminal</p>
                <p className="truncate font-semibold">{terminal?.name ?? "Checking device…"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/10 backdrop-blur-sm">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/15"><LuUsers className="size-5" /></span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-200">Your branch</p>
                <p className="font-semibold">{branch.name === "—" ? "Loading…" : branch.name}</p>
              </div>
            </div>
            {heldCount > 0 && (
              <div className="flex items-center gap-3 rounded-2xl bg-amber-400/15 p-3.5 text-amber-50 ring-1 ring-amber-200/20">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white/15"><LuShoppingBag className="size-5" /></span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-100/80">Waiting carts</p>
                  <p className="font-semibold">{heldCount} held cart{heldCount > 1 ? "s" : ""}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
            <p className="flex items-center gap-2 text-sm font-semibold"><LuShieldCheck className="size-4 text-emerald-200" /> Secure till access</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-100">Every sale is tied to the person who unlocks this till. No shared accounts, no guesswork.</p>
          </div>
          <Link to="/login" className="mt-5 inline-flex items-center gap-2 text-sm text-brand-100 transition hover:text-white">
            <LuLogIn className="size-4" /> Back-office sign-in <LuArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>

      {/* Employee picker / PIN */}
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
        <div className="w-full max-w-3xl auth-panel-in" key={selected ? `${selected.id}-${mode}` : "roster"}>
          {!selected ? (
            <>
              <div className="mb-6">
                <div className="mb-5 lg:hidden"><AuthBrandHeader compact /></div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-100">Point of sale</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Who's selling?</h1>
                <p className="mt-2 max-w-lg text-sm text-brand-100">Tap your name and enter your 4-digit PIN. First time on a till? We'll help you set one up.</p>
              </div>

              <AuthCard>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-2 text-sm text-ink-600">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><LuUsers className="size-4" /></span>
                    <span><strong className="font-semibold text-ink-900">{roster.length}</strong> team member{roster.length !== 1 && "s"} ready</span>
                  </p>
                  <label className="relative block w-full sm:w-60">
                    <span className="sr-only">Search cashiers</span>
                    <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search name or role"
                      className="h-10 w-full rounded-xl bg-ink-50 pl-9 pr-3 text-sm text-ink-900 outline-none ring-1 ring-ink-200 transition placeholder:text-ink-400 focus:bg-white focus:ring-2 focus:ring-brand-400"
                    />
                  </label>
                </div>

                {rosterLoading ? (
                  <RosterSkeleton />
                ) : visible.length > 0 ? (
                  <div className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-y-auto pr-1 scrollbar-thin sm:grid-cols-3">
                    {visible.map((e) => {
                      const off = e.status !== "active" || e.pinLocked;
                      return (
                        <button
                          key={e.id}
                          disabled={off}
                          onClick={() => pick(e)}
                          className={cn(
                            "group relative flex min-h-44 flex-col items-start gap-3 overflow-hidden rounded-2xl border border-ink-200/80 bg-white p-4 text-left shadow-card transition-all duration-200",
                            off
                              ? "cursor-not-allowed opacity-65"
                              : "hover:-translate-y-1 hover:border-brand-300 hover:shadow-[0_18px_34px_-18px_rgba(79,70,229,0.55)] focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[.99]",
                          )}
                        >
                          <span className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-brand-50 text-brand-600 opacity-0 transition group-hover:opacity-100">
                            <LuArrowRight className="size-3.5" />
                          </span>
                          <Avatar name={e.fullName} color={e.avatarColor} size="lg" className="ring-2 ring-white shadow-sm" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink-900">{e.displayName}</p>
                            <p className="truncate text-xs text-ink-500">{e.roleName}</p>
                          </div>
                          <div className="mt-auto flex flex-wrap gap-1.5">
                            {e.status === "suspended" ? <Badge tone="warning">Suspended</Badge>
                              : e.pinLocked ? <Badge tone="danger">PIN locked</Badge>
                              : !e.hasPin ? <Badge tone="info">Set up PIN</Badge>
                              : e.heldCount ? <Badge tone="warning">{e.heldCount} held</Badge>
                              : <Badge tone="success" dot>Ready</Badge>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/70 px-6 py-12 text-center">
                    <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-white text-ink-400 shadow-card"><LuSearch className="size-6" /></span>
                    <p className="mt-4 font-semibold text-ink-900">{query ? "No one matches that search" : "No one can sell here yet"}</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">
                      {query ? "Try a different name or role." : "Ask an owner or manager to add staff to this branch in back office."}
                    </p>
                    {query && <Button variant="secondary" size="sm" className="mt-4" onClick={() => setQuery("")}>Clear search</Button>}
                  </div>
                )}
              </AuthCard>
              <p className="mt-5 text-center text-xs text-brand-100/80">Locked out? A manager can reset your PIN from Employees in back office.</p>
            </>
          ) : (
            <AuthCard className="mx-auto max-w-md text-center">
              <AuthStepper steps={steps} active={activeStep} className="mb-7" />

              <div className="mx-auto flex w-fit items-center gap-3 rounded-2xl bg-ink-50 p-2 pr-4 ring-1 ring-ink-200">
                <Avatar name={selected.fullName} color={selected.avatarColor} size="lg" />
                <div className="text-left">
                  <p className="font-semibold text-ink-900">{selected.displayName}</p>
                  <p className="text-xs text-ink-500">{selected.roleName}</p>
                </div>
              </div>
              <button onClick={() => { setSelected(null); setError(null); setBlocked(false); }} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 transition hover:text-brand-700">
                <LuArrowLeft className="size-3.5" /> Choose someone else
              </button>

              <div className="mt-6">
                <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
                  {mode === "enter" ? `Hi ${selected.displayName}` : mode === "password" ? "Confirm it's you" : mode === "create" ? "Create your PIN" : "Confirm your PIN"}
                </h2>
                <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-500">
                  {mode === "enter"
                    ? "Enter your 4-digit PIN to start selling."
                    : mode === "password"
                      ? "First time on a till: enter your back-office password, then choose a PIN."
                      : mode === "create"
                        ? "Choose 4 digits only you know. Avoid 1234 or 0000."
                        : "Enter the same PIN once more to confirm it."}
                </p>

                {mode === "password" ? (
                  <form
                    className="mt-6 space-y-4 text-left"
                    onSubmit={(e) => { e.preventDefault(); if (password) { setError(null); setMode("create"); } }}
                  >
                    {error && <Callout tone="danger" icon={<LuCircleAlert className="size-4" />}>{error}</Callout>}
                    <Input label="Back-office password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" hint="This is the password you use on the website." />
                    <Button type="submit" size="lg" block iconRight={<LuArrowRight className="size-4" />} disabled={!password}>Continue</Button>
                  </form>
                ) : (
                  <div className="mt-6">
                    <PinPad key={mode} onComplete={onPin} error={error} busy={stage === "verifying"} disabled={blocked} onInput={() => { if (error) setError(null); }} />
                  </div>
                )}
              </div>

              {blocked ? (
                <div className="mt-6 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
                  Too many attempts. Ask a manager to reset your PIN.
                </div>
              ) : mode === "enter" ? (
                <p className="mt-6 text-xs text-ink-400">Don't share your PIN — every sale is recorded against it.</p>
              ) : null}
            </AuthCard>
          )}
        </div>
      </div>

      {stage === "opening" && (
        <AuthLoader overlay label="Opening your till…" note={selected ? `Signed in as ${selected.displayName}` : "Famous TechX POS"} />
      )}
    </AuthBackdrop>
  );
}

/** Shown when this browser hasn't been registered as a till. */
function NotATill() {
  const navigate = useNavigate();
  return (
    <AuthBackdrop>
      <div className="flex flex-1 items-center justify-center p-5">
        <AuthCard className="max-w-lg text-center">
          <div className="hidden justify-center lg:flex"><AuthBrandHeader compact /></div>
          <span className="mx-auto mt-2 flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100"><LuMonitorSmartphone className="size-8" /></span>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">This device isn't a till yet</h1>
          <p className="mt-2 text-sm text-ink-600">An owner or admin registers a device once. After that, staff unlock it with their own PIN.</p>
          <ol className="mx-auto mt-6 max-w-sm space-y-3 text-left text-sm text-ink-700">
            <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">1</span> Sign in to back office with your password.</li>
            <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">2</span> Go to Settings → Tills → “Register this device”.</li>
            <li className="flex gap-3"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700">✓</span> Come back here and pick your name.</li>
          </ol>
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <Button size="lg" block className="flex-1" iconRight={<LuArrowRight className="size-4" />} onClick={() => navigate("/settings?tab=terminals")}>Register this device</Button>
            <Button variant="secondary" size="lg" block className="flex-1" icon={<LuLogIn className="size-4" />} onClick={() => navigate("/login")}>Back-office sign-in</Button>
          </div>
          <div className="mt-6 flex justify-center"><SecurityBadge /></div>
        </AuthCard>
      </div>
    </AuthBackdrop>
  );
}

function RosterSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading cashiers">
      <div className="grid max-h-[52vh] grid-cols-2 gap-3 overflow-hidden pr-1 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="min-h-44 rounded-2xl border border-ink-200/80 bg-white p-4">
            <div className="auth-shimmer size-12 rounded-full" />
            <div className="auth-shimmer mt-4 h-4 w-3/4 rounded" />
            <div className="auth-shimmer mt-2 h-3 w-1/2 rounded" />
            <div className="auth-shimmer mt-6 h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <p className="mt-5 text-center text-xs text-ink-500">Loading your team…</p>
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
