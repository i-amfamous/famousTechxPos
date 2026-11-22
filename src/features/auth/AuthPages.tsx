import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "@/app/session";
import { LuArrowLeft, LuArrowRight, LuCheck, LuCircleAlert, LuEye, LuEyeOff, LuKeyRound, LuLockKeyhole, LuMail, LuMonitorSmartphone, LuShieldCheck } from "react-icons/lu";
import { actions } from "@/services/api";
import { Button, Callout, Card, Checkbox, Input, Select } from "@/components/ui";
import { cn } from "@/lib/format";
import { AuthBackdrop, AuthBrandHeader, AuthCard, AuthLoader, AuthStepper, SecurityBadge, TillShortcut } from "./AuthChrome";

function AuthShell({ children, wide, card = true }: { children: ReactNode; wide?: boolean; card?: boolean }) {
  return (
    <AuthBackdrop>
      <div className="relative hidden w-[42%] shrink-0 flex-col justify-between border-r border-white/10 px-11 py-11 lg:flex xl:px-14 xl:py-12">
        <AuthBrandHeader />
        <div className="auth-panel-in my-8">
          <SecurityBadge dark />
          <h2 className="mt-6 text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">
            Sell faster.<br />Know every cedi.<br /><span className="text-brand-200">Trust your team.</span>
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-brand-100">Sales, stock, staff and shifts for every branch - in one place.</p>
          <div className="mt-8 flex items-center gap-3 rounded-2xl bg-white/10 p-3.5 ring-1 ring-white/10 backdrop-blur-sm">
            <span className="flex size-10 items-center justify-center rounded-xl bg-white/15"><LuShieldCheck className="size-5" /></span>
            <p className="text-xs leading-relaxed text-brand-100"><span className="font-semibold text-white">Built for busy counters.</span><br />Fast checkout, clear shift handovers and a full audit trail.</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-brand-200">© {new Date().getFullYear()} Famous TechX</p>
          <TillShortcut />
        </div>
      </div>
      <div className="flex flex-1 justify-center overflow-x-hidden overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
        <div className={cn("my-auto w-full min-w-0 auth-panel-in", wide ? "max-w-3xl" : "max-w-md")}>
          <div className="mb-4 sm:mb-6 lg:hidden"><AuthBrandHeader compact /></div>
          {card ? <AuthCard>{children}</AuthCard> : children}
        </div>
      </div>
    </AuthBackdrop>
  );
}

function PasswordInput({ label, value, onChange, hint, error, autoComplete }: { label: string; value: string; onChange: (v: string) => void; hint?: string; error?: string; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input label={label} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} hint={hint} error={error} required autoComplete={autoComplete} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-[34px] text-ink-400 hover:text-ink-700">
        {show ? <LuEyeOff className="size-4" /> : <LuEye className="size-4" />}
      </button>
    </div>
  );
}

/* ═════════════ Login ═════════════ */
export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refresh, signedIn, passwordSession, signOut, demo } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = params.get("next") || "/dashboard";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!demo && signedIn && !passwordSession) await signOut(); // replace a till PIN session
      await actions.signIn(email, password);
      await refresh();
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell>
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-900">Welcome back</h1>
        <p className="mt-1.5 text-sm text-ink-500">Sign in to manage sales, stock, staff and shifts.</p>
      </div>
      <form className="mx-auto mt-7 w-full max-w-sm space-y-4 text-left" onSubmit={submit}>
        {error && <Callout tone="danger" icon={<LuCircleAlert className="size-4" />}>{error}</Callout>}
        <Input label="Email or phone" hint="Staff without email use their phone number" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
        <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="flex items-center justify-between">
          <Checkbox label="Keep me signed in" defaultChecked />
          <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" block loading={busy} iconRight={!busy ? <LuArrowRight className="size-4" /> : undefined}>Sign in</Button>
      </form>
      <div className="mx-auto mt-7 flex max-w-sm gap-3 rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 p-4 text-left ring-1 ring-brand-100">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm"><LuMonitorSmartphone className="size-4" /></span>
        <div className="text-sm">
          <p className="font-semibold text-ink-800">Working on a till?</p>
          <p className="mt-0.5 text-ink-600">Cashiers use their own PIN on a registered till.</p>
          <Link to="/pos/lock" className="mt-1.5 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline">Go to POS lock screen <LuArrowRight className="size-3.5" /></Link>
        </div>
      </div>
      <p className="mx-auto mt-6 max-w-sm text-center text-sm text-ink-500">New business? <Link to="/onboarding" className="font-medium text-brand-700 hover:underline">Set up Famous TechX</Link></p>
    </AuthShell>
  );
}

/* ═════════════ Forgot password ═════════════ */
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell>
      <Link to="/login" className="mx-auto mb-6 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><LuArrowLeft className="size-4" /> Back to sign in</Link>
      {sent ? (
        <div className="auth-panel-in py-2 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <LuMail className="size-7" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink-900">Check your email</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-600">
            If an account exists for <span className="font-semibold text-ink-900">{email}</span>, we've sent a branded reset link from <span className="font-medium">Famous TechX POS</span>.
          </p>
          <p className="mx-auto mt-5 max-w-sm text-xs text-ink-500">No email? Staff without email should ask their manager to reset their password from Employees.</p>
          <Link to="/login" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">Back to sign in <LuArrowRight className="size-3.5" /></Link>
        </div>
      ) : (
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-500/25 ring-1 ring-white/40">
            <LuKeyRound className="size-6" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-ink-900">Forgot your password?</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-500">No problem. Enter the email you use for Famous TechX POS and we'll send you a secure link to choose a new one.</p>
          <form className="mx-auto mt-7 w-full max-w-sm space-y-4 text-left" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await actions.requestPasswordReset(email); setSent(true); } catch { setSent(true); } finally { setBusy(false); } }}>
            <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" required autoFocus />
            <Button type="submit" size="lg" block loading={busy} iconRight={!busy ? <LuArrowRight className="size-4" /> : undefined}>Send reset link</Button>
          </form>
          <div className="mx-auto mt-6 flex max-w-sm items-start gap-2.5 rounded-2xl bg-ink-50/80 p-3.5 text-left ring-1 ring-ink-100">
            <LuShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <p className="text-xs leading-relaxed text-ink-600">The email comes from <span className="font-semibold text-ink-800">Famous TechX POS</span> and the link expires in 1 hour. If you don't see it, check your spam folder.</p>
          </div>
        </div>
      )}
    </AuthShell>
  );
}

/* ═════════════ Accept invite / first sign-in ═════════════ */
export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const linkToken = params.get("token");
  const isReset = params.get("type") === "recovery";
  const { authEmail, signedIn, ready, refresh, user, business, mustChangePassword, demo } = useSession();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checks = [
    { ok: pw.length >= 8, label: "At least 8 characters", short: "8+ characters" },
    { ok: /[A-Z]/.test(pw) && /[a-z]/.test(pw), label: "Upper and lower case letters", short: "Upper & lower" },
    { ok: /\d/.test(pw), label: "At least one number", short: "One number" },
  ];
  const score = checks.filter((c) => c.ok).length;
  const strong = score === checks.length;
  const heading = mustChangePassword || isReset ? "Choose a new password" : `Welcome${user.displayName ? `, ${user.displayName}` : ""}`;
  const intro = mustChangePassword
    ? "You signed in with a temporary password. Create your own to keep your account secure and carry on."
    : isReset
      ? "Pick a fresh password for your Famous TechX POS account. Your sales and settings are all safe."
      : `Create your password to finish setting up your account${business ? ` at ${business.name}` : ""}. It only takes a moment.`;

  if (!demo && !ready) return <AuthLoader label="Checking your invitation…" note="Famous TechX POS" />;
  // Without a link token the page is only for someone signed in with a temporary password.
  if (!demo && ready && !signedIn && !linkToken)
    return (
      <AuthShell>
        <div className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200 sm:size-14"><LuCircleAlert className="size-6" /></div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink-900 sm:mt-5">This link has expired</h1>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-600 sm:mt-2">Invite and reset links work once and expire for your security. Ask your manager to resend the invitation, or request a fresh reset link.</p>
          <div className="mt-5 flex flex-col justify-center gap-2 sm:mt-6 sm:flex-row"><Button variant="secondary" onClick={() => navigate("/forgot-password")}>Reset password</Button><Button onClick={() => navigate("/login")}>Sign in</Button></div>
        </div>
      </AuthShell>
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!strong) { setError("Please meet all three password requirements below."); return; }
    if (pw !== pw2) { setError("The two passwords don't match. Please try again."); return; }
    setBusy(true);
    try { await actions.setPassword(pw, linkToken); await refresh(); navigate("/dashboard", { replace: true }); }
    catch (er) { setError((er as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <div className="text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-500/25 ring-1 ring-white/40 sm:size-14">
          <LuLockKeyhole className="size-6" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink-900 sm:mt-5 sm:text-3xl">{heading}</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500 sm:mt-2">{intro}</p>
      </div>

      <div className="mx-auto mt-4 w-full max-w-sm rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 to-violet-50 p-3 text-left sm:mt-6 sm:p-4">
        <p className="flex items-center gap-2 text-xs font-semibold text-brand-800"><LuShieldCheck className="size-4" /> Secure, one-time setup</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-600 sm:mt-1.5">This link came from Famous TechX POS and only you can use it. Your password is stored as a one-way hash, never in plain text.</p>
      </div>

      <form className="mx-auto mt-4 w-full max-w-sm space-y-3 text-left sm:mt-6 sm:space-y-4" onSubmit={submit}>
        {error && <Callout tone="danger" icon={<LuCircleAlert className="size-4" />}>{error}</Callout>}
        {signedIn && <Input label="Account" value={authEmail ?? user.phone} disabled />}
        <div>
          <PasswordInput label="New password" value={pw} onChange={setPw} autoComplete="new-password" hint="Use at least 8 characters" />
          <div className="mt-2 flex gap-1.5" aria-hidden="true">
            {[1, 2, 3].map((n) => <span key={n} className={cn("h-1.5 flex-1 rounded-full transition-colors", score >= n ? (strong ? "bg-emerald-500" : "bg-amber-400") : "bg-ink-200")} />)}
          </div>
          <ul className="mt-2.5 grid grid-cols-1 gap-1 rounded-xl bg-ink-50/80 p-2.5 ring-1 ring-ink-100 sm:mt-3 sm:grid-cols-3 sm:gap-1.5 sm:p-3">
            {checks.map((c) => (
              <li key={c.label} className={cn("flex items-center gap-1.5 text-[11px] transition-colors sm:gap-2 sm:text-xs", c.ok ? "font-medium text-emerald-700" : "text-ink-500")}>
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full", c.ok ? "bg-emerald-600 text-white" : "bg-ink-200 text-ink-400")}>
                  <LuCheck className="size-3" />
                </span>
                <span className="sm:hidden">{c.short}</span>
                <span className="hidden sm:inline">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <PasswordInput label="Confirm password" value={pw2} onChange={setPw2} error={pw2 && pw2 !== pw ? "Passwords don't match" : undefined} autoComplete="new-password" />
        <Button type="submit" size="lg" block loading={busy} iconRight={!busy ? <LuArrowRight className="size-4" /> : undefined}>Save password & continue</Button>
        <p className="text-center text-xs text-ink-500">You'll set your 4-digit POS PIN the first time you use a till.</p>
      </form>
    </AuthShell>
  );
}

/* ═════════════ Onboarding ═════════════ */
const steps = ["Account", "Business", "Settings", "First branch"];
export function OnboardingPage() {
  const navigate = useNavigate();
  const { signedIn, needsOnboarding, refresh, demo, ready } = useSession();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acct, setAcct] = useState({ name: "", email: "", password: "" });
  const [b, setB] = useState({ name: "", category: "Electronics", phone: "", email: "", address: "", tin: "", registration_no: "", currency: "GHS", timezone: "Africa/Accra",
    tax: "none", tax_rate: "15", footer: "Thank you for shopping with us!", branch_name: "", branch_code: "", branch_address: "", branch_phone: "" });
  const set = (k: keyof typeof b, v: string) => setB((x) => ({ ...x, [k]: v }));

  useEffect(() => { if (!demo && ready && signedIn && step === 0) setStep(1); }, [demo, ready, signedIn, step]);
  useEffect(() => { if (!demo && ready && signedIn && !needsOnboarding) navigate("/dashboard", { replace: true }); }, [demo, ready, signedIn, needsOnboarding, navigate]);
  if (!demo && !ready) return <AuthLoader label="Preparing your setup…" note="Famous TechX POS" />;

  const createAccount = async () => {
    setBusy(true); setError(null);
    try {
      await actions.signUp(acct.email, acct.password, acct.name);
      await refresh(); // the new owner is signed in straight away
      setStep(1);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true); setError(null);
    try {
      await actions.createBusiness({
        name: b.name, category: b.category, phone: b.phone, email: b.email, address: b.address, tin: b.tin, registration_no: b.registration_no,
        currency: b.currency, timezone: b.timezone, owner_name: acct.name || undefined,
        branch_name: b.branch_name || "Main branch", branch_code: b.branch_code || b.branch_name.slice(0, 3), branch_address: b.branch_address || b.address, branch_phone: b.branch_phone || b.phone,
        settings: { tax_rate: b.tax === "none" ? 0 : Number(b.tax_rate) || 0, prices_include_tax: b.tax !== "exclusive", receipt_footer: b.footer },
      });
      await refresh();
      navigate("/dashboard?welcome=1", { replace: true });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const canNext = step === 0 ? acct.name.trim().length > 1 && /\S+@\S+\.\S+/.test(acct.email) && acct.password.length >= 8
    : step === 1 ? b.name.trim().length > 1 && b.phone.trim().length >= 9 : step === 3 ? b.branch_name.trim().length > 1 : true;

  return (
    <AuthShell wide>
      <AuthStepper steps={steps} active={step} className="mb-8" />
      <Card className="p-6 sm:p-8">
        {error && <div className="mb-4"><Callout tone="danger">{error}</Callout></div>}
        {step === 0 && (
          <div className="space-y-4">
            <div><h1 className="text-xl font-semibold">Create your owner account</h1><p className="text-sm text-ink-500">You'll be the business owner with full access.</p></div>
            <Input label="Your full name" required value={acct.name} onChange={(e) => setAcct({ ...acct, name: e.target.value })} autoFocus />
            <Input label="Email" type="email" required value={acct.email} onChange={(e) => setAcct({ ...acct, email: e.target.value })} autoComplete="email" />
            <PasswordInput label="Password" value={acct.password} onChange={(v) => setAcct({ ...acct, password: v })} hint="At least 8 characters" autoComplete="new-password" />
            <p className="text-sm text-ink-500">Already have an account? <Link to="/login?next=/onboarding" className="font-medium text-brand-700 hover:underline">Sign in</Link></p>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <div><h1 className="text-xl font-semibold">Tell us about your business</h1><p className="text-sm text-ink-500">Shown on receipts and reports.</p></div>
            <Input label="Business name" required value={b.name} onChange={(e) => set("name", e.target.value)} autoFocus />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Category" value={b.category} onChange={(e) => set("category", e.target.value)}><option>Electronics</option><option>Retail</option><option>Pharmacy</option><option>Supermarket</option><option>Restaurant</option><option>Other</option></Select>
              <Input label="Phone" required value={b.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <Input label="Email" type="email" value={b.email} onChange={(e) => set("email", e.target.value)} />
            <Input label="Address" value={b.address} onChange={(e) => set("address", e.target.value)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="TIN (GRA)" hint="Optional" value={b.tin} onChange={(e) => set("tin", e.target.value)} />
              <Input label="Business registration no." hint="Optional" value={b.registration_no} onChange={(e) => set("registration_no", e.target.value)} />
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div><h1 className="text-xl font-semibold">Money & time</h1><p className="text-sm text-ink-500">You can change these later in Settings.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Currency" value={b.currency} onChange={(e) => set("currency", e.target.value)}><option value="GHS">Ghana cedi (GH₵)</option></Select>
              <Select label="Timezone" value={b.timezone} onChange={(e) => set("timezone", e.target.value)}><option>Africa/Accra</option></Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <Select label="Tax on sales" value={b.tax} onChange={(e) => set("tax", e.target.value)}>
                <option value="none">No tax</option>
                <option value="inclusive">Prices include tax</option>
                <option value="exclusive">Tax added on top of prices</option>
              </Select>
              {b.tax !== "none" && <Input label="Tax rate" prefix="%" inputMode="decimal" value={b.tax_rate} onChange={(e) => set("tax_rate", e.target.value.replace(/[^\d.]/g, ""))} hint="Check current GRA rates" />}
            </div>
            <Input label="Receipt footer" value={b.footer} onChange={(e) => set("footer", e.target.value)} />
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <div><h1 className="text-xl font-semibold">Your first branch</h1><p className="text-sm text-ink-500">Add more branches any time.</p></div>
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <Input label="Branch name" required value={b.branch_name} onChange={(e) => set("branch_name", e.target.value)} placeholder="e.g. Accra – Osu" autoFocus />
              <Input label="Short code" value={b.branch_code} onChange={(e) => set("branch_code", e.target.value.toUpperCase().slice(0, 4))} placeholder="OSU" hint="On receipt numbers" />
            </div>
            <Input label="Address" value={b.branch_address} onChange={(e) => set("branch_address", e.target.value)} placeholder={b.address} />
            <Input label="Branch phone" value={b.branch_phone} onChange={(e) => set("branch_phone", e.target.value)} placeholder={b.phone} />
            <Callout tone="info">Next: add products (scan their barcodes), invite employees and register this device as a till.</Callout>
          </div>
        )}
        <div className="mt-8 flex justify-between">
          {step > 1 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
          {step === 0 ? <Button loading={busy} disabled={!canNext} onClick={createAccount}>Create account</Button>
            : step < 3 ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Continue</Button>
            : <Button loading={busy} disabled={!canNext} onClick={create}>Create business</Button>}
        </div>
      </Card>
    </AuthShell>
  );
}
