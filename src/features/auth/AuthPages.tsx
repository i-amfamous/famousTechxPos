import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LuArrowLeft, LuCheck, LuEye, LuEyeOff, LuMail, LuMonitorSmartphone } from "react-icons/lu";
import { actions } from "@/services/api";
import { Button, Callout, Card, Checkbox, Input, Select } from "@/components/ui";
import { Logo } from "@/components/layout/AppLayout";
import { cn } from "@/lib/format";

function AuthShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-full">
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3"><Logo className="size-11 text-base" /><span className="text-lg font-bold tracking-wide">FAMOUS TECHX</span></div>
        <div>
          <h2 className="text-4xl font-semibold leading-tight">Sell faster.<br />Know every cedi.<br />Trust your team.</h2>
          <p className="mt-4 max-w-sm text-brand-200">Sales, stock, staff and shifts for every branch — in one place.</p>
        </div>
        <p className="text-sm text-brand-400">© Famous TechX</p>
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-brand-700/40" />
        <div className="pointer-events-none absolute -bottom-32 right-10 size-72 rounded-full bg-amber-400/10" />
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className={cn("w-full", wide ? "max-w-2xl" : "max-w-sm")}>
          <div className="mb-8 flex items-center gap-3 lg:hidden"><Logo /><span className="font-bold tracking-wide text-brand-900">FAMOUS TECHX</span></div>
          {children}
        </div>
      </div>
    </div>
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await actions.signIn(email, password); navigate("/dashboard"); } // LOGIC
    catch { setError("Email/phone or password is incorrect."); }
    finally { setBusy(false); }
  };
  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold text-ink-900">Sign in</h1>
      <p className="mt-1 text-sm text-ink-500">Back office for owners, managers and staff.</p>
      <form className="mt-8 space-y-4" onSubmit={submit}>
        {error && <Callout tone="danger">{error}</Callout>}
        <Input label="Email or phone" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
        <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="flex items-center justify-between">
          <Checkbox label="Keep me signed in" defaultChecked />
          <Link to="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" block loading={busy}>Sign in</Button>
      </form>
      <div className="mt-8 rounded-xl bg-ink-100 p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-ink-800"><LuMonitorSmartphone className="size-4" /> Working on a till?</p>
        <p className="mt-1 text-ink-600">Cashiers sign in on a registered till with their PIN.</p>
        <Link to="/pos/lock" className="mt-2 inline-block font-medium text-brand-700 hover:underline">Go to POS lock screen →</Link>
      </div>
      <p className="mt-6 text-center text-sm text-ink-500">New business? <Link to="/onboarding" className="font-medium text-brand-700 hover:underline">Set up Famous TechX</Link></p>
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
      <Link to="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"><LuArrowLeft className="size-4" /> Back to sign in</Link>
      {sent ? (
        <>
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><LuMail className="size-6" /></div>
          <h1 className="text-2xl font-semibold text-ink-900">Check your email</h1>
          <p className="mt-2 text-sm text-ink-600">If an account exists for <span className="font-medium">{email}</span>, we've sent a link to reset your password.</p>
          <p className="mt-6 text-sm text-ink-500">No email? Staff without email should ask their manager to reset their password.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-ink-900">Reset your password</h1>
          <p className="mt-1 text-sm text-ink-500">We'll email you a reset link.</p>
          <form className="mt-8 space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await actions.requestPasswordReset(email); setBusy(false); setSent(true); }}>
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <Button type="submit" size="lg" block loading={busy}>Send reset link</Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

/* ═════════════ Accept invite / first sign-in ═════════════ */
export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const checks = [
    { ok: pw.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Z]/.test(pw) && /[a-z]/.test(pw), label: "Upper and lower case letters" },
    { ok: /\d/.test(pw), label: "At least one number" },
  ];
  const strong = checks.every((c) => c.ok);
  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold text-ink-900">Welcome to Famous TechX, Akosua</h1>
      <p className="mt-1 text-sm text-ink-500">Kwame Asante added you as a <span className="font-medium text-ink-700">Cashier</span> at Accra – Osu. Create your password to finish.</p>
      <form className="mt-8 space-y-4" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await actions.acceptInvite("token", pw); navigate("/dashboard"); }}>
        <Input label="Email" value="akosua.f@gmail.com" disabled />
        <PasswordInput label="New password" value={pw} onChange={setPw} autoComplete="new-password" />
        <ul className="space-y-1">
          {checks.map((c) => (
            <li key={c.label} className={cn("flex items-center gap-2 text-xs", c.ok ? "text-emerald-700" : "text-ink-500")}>
              <LuCheck className={cn("size-3.5", !c.ok && "opacity-30")} /> {c.label}
            </li>
          ))}
        </ul>
        <PasswordInput label="Confirm password" value={pw2} onChange={setPw2} error={pw2 && pw2 !== pw ? "Passwords don't match" : undefined} autoComplete="new-password" />
        <Button type="submit" size="lg" block loading={busy} disabled={!strong || pw !== pw2}>Create password & continue</Button>
        <p className="text-center text-xs text-ink-500">You'll set your 4-digit POS PIN the first time you use a till.</p>
      </form>
    </AuthShell>
  );
}

/* ═════════════ Onboarding ═════════════ */
const steps = ["Business", "Settings", "First branch", "Done"];
export function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  return (
    <AuthShell wide>
      <ol className="mb-8 flex items-center gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i < step ? "bg-emerald-600 text-white" : i === step ? "bg-brand-700 text-white" : "bg-ink-200 text-ink-500")}>
              {i < step ? <LuCheck className="size-4" /> : i + 1}
            </span>
            <span className={cn("hidden text-sm sm:block", i === step ? "font-medium text-ink-900" : "text-ink-500")}>{s}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-ink-200" />}
          </li>
        ))}
      </ol>
      <Card className="p-6 sm:p-8">
        {step === 0 && (
          <div className="space-y-4">
            <div><h1 className="text-xl font-semibold">Tell us about your business</h1><p className="text-sm text-ink-500">Shown on receipts and reports.</p></div>
            <Input label="Business name" defaultValue="Famous TechX" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Category" defaultValue="Electronics"><option>Electronics</option><option>Retail</option><option>Pharmacy</option><option>Supermarket</option><option>Restaurant</option><option>Other</option></Select>
              <Input label="Phone" defaultValue="030 201 4455" required />
            </div>
            <Input label="Email" type="email" defaultValue="hello@famoustechx.com" />
            <Input label="Address" defaultValue="Oxford St, Osu, Accra" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="TIN (GRA)" hint="Optional" />
              <Input label="Business registration no." hint="Optional" />
            </div>
            <div className="flex items-center gap-4 rounded-lg border border-dashed border-ink-300 p-4">
              <Logo className="size-12" />
              <div className="flex-1 text-sm"><p className="font-medium">Logo</p><p className="text-ink-500">PNG or JPG, square, up to 2 MB</p></div>
              <Button variant="secondary" size="sm">Upload</Button>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
            <div><h1 className="text-xl font-semibold">Money & time</h1><p className="text-sm text-ink-500">You can change these later in Settings.</p></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Currency" defaultValue="GHS"><option value="GHS">Ghana cedi (GH₵)</option><option value="NGN">Nigerian naira (₦)</option><option value="USD">US dollar ($)</option></Select>
              <Select label="Timezone" defaultValue="Africa/Accra"><option>Africa/Accra</option><option>Africa/Lagos</option></Select>
            </div>
            <Select label="Tax" defaultValue="vat_std" hint="LOGIC: tax rules are applied by your checkout logic.">
              <option value="none">No tax on sales</option>
              <option value="vat_std">VAT standard scheme (prices include tax)</option>
              <option value="vat_flat">VAT flat rate scheme</option>
            </Select>
            <Input label="Receipt footer" defaultValue="Thank you for shopping with us!" />
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div><h1 className="text-xl font-semibold">Your first branch</h1><p className="text-sm text-ink-500">Add more branches any time.</p></div>
            <Input label="Branch name" defaultValue="Accra – Osu (Main)" required />
            <Input label="Address" defaultValue="Oxford St, Osu, Accra" />
            <Input label="Branch phone" defaultValue="030 201 4455" />
            <Callout tone="info">You'll be the Owner. Next you can add products, invite employees and register this device as a till.</Callout>
          </div>
        )}
        {step === 3 && (
          <div className="py-4 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><LuCheck className="size-8" /></div>
            <h1 className="mt-4 text-2xl font-semibold">You're all set</h1>
            <p className="mt-1 text-sm text-ink-500">Here's what most businesses do next:</p>
            <div className="mx-auto mt-6 grid max-w-md gap-2 text-left">
              {[["Add products & opening stock", "/products"], ["Invite your employees", "/employees"], ["Register this device as a till", "/settings?tab=terminals"]].map(([l, to]) => (
                <Link key={to} to={to!} className="flex items-center justify-between rounded-lg px-4 py-3 text-sm font-medium ring-1 ring-ink-200 hover:bg-ink-50">{l}<span className="text-brand-700">→</span></Link>
              ))}
            </div>
          </div>
        )}
        <div className="mt-8 flex justify-between">
          {step > 0 && step < 3 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <span />}
          {step < 3 ? <Button onClick={() => setStep(step + 1)}>{step === 2 ? "Create business" : "Continue"}</Button> : <Button onClick={() => navigate("/dashboard")}>Go to dashboard</Button>}
        </div>
      </Card>
    </AuthShell>
  );
}
