import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { LuKeyRound } from "react-icons/lu";
import { SessionProvider, useSession } from "@/app/session";
import { Button, Spinner, ToastProvider } from "@/components/ui";
import { AppLayout, Logo } from "@/components/layout/AppLayout";
import { ScannerProvider } from "@/features/scanner/ScannerProvider";
import { ScannerWindows } from "@/features/scanner/ScanControls";
import { PhoneScanPage } from "@/features/scanner/PhoneScanPage";
import { AcceptInvitePage, ForgotPasswordPage, LoginPage, OnboardingPage } from "@/features/auth/AuthPages";
import { LockScreen } from "@/features/pos/LockScreen";
import { PosPage } from "@/features/pos/PosPage";
import { CloseShiftPage, OpenShiftPage } from "@/features/pos/ShiftScreens";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { SaleDetailPage, SalesPage } from "@/features/sales/SalesPages";
import { ProductsPage } from "@/features/products/ProductsPage";
import { InventoryPage } from "@/features/inventory/InventoryPage";
import { CustomerDetailPage, CustomersPage } from "@/features/customers/CustomersPages";
import { EmployeesPage } from "@/features/employees/EmployeesPage";
import { EmployeeDetailPage } from "@/features/employees/EmployeeDetailPage";
import { RolesPage } from "@/features/employees/RolesPage";
import { ShiftsPage } from "@/features/employees/ShiftsPage";
import { ActivityPage } from "@/features/employees/ActivityPage";
import { PurchaseDetailPage, PurchasesPage, SuppliersPage } from "@/features/purchases/PurchasesPages";
import { ExpensesPage } from "@/features/expenses/ExpensesPage";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { BranchesPage } from "@/features/branches/BranchesPage";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { NotFoundPage, PlatformAdminPage, ProfilePage, UnauthorizedPage } from "@/features/misc/MiscPages";

function FullScreenLoader() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 text-ink-500">
      <Logo className="size-12 text-lg" />
      <Spinner className="size-6 text-brand-600" />
    </div>
  );
}

/** Back office needs a password session with an active membership. */
function RequireBackOffice() {
  const s = useSession();
  const loc = useLocation();
  const navigate = useNavigate();
  if (s.demo) return <Outlet />;
  if (!s.ready) return <FullScreenLoader />;
  if (!s.signedIn) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (s.mustChangePassword) return <Navigate to="/accept-invite" replace />;
  if (s.needsOnboarding) return <Navigate to="/onboarding" replace />;
  if (!s.passwordSession)
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-pop ring-1 ring-ink-200">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><LuKeyRound className="size-7" /></span>
          <h1 className="mt-4 text-xl font-semibold">Back office needs your password</h1>
          <p className="mt-2 text-sm text-ink-600">You're signed in on a till with a PIN. For security, back office only opens with a full password sign-in.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={async () => { await s.signOut(); navigate(`/login?next=${encodeURIComponent(loc.pathname)}`); }}>Sign in with password</Button>
            <Button variant="secondary" onClick={() => navigate("/pos")}>Back to the till</Button>
          </div>
        </div>
      </div>
    );
  return <Outlet />;
}

/** Till screens need someone unlocked on this till. Waits for the session and shift lookup before deciding. */
function RequireTillUser() {
  const s = useSession();
  if (!s.ready || s.rosterLoading || (s.posUser && !s.shiftChecked)) return <FullScreenLoader />;
  if (!s.posUser) return <Navigate to="/pos/lock" replace />;
  return <Outlet />;
}

/** Hides pages the user's role doesn't include (the database enforces it too). */
function Perm({ p, children }: { p: string | string[]; children: ReactNode }) {
  const { can, user } = useSession();
  const ok = user.isOwner || (Array.isArray(p) ? p.some(can) : can(p));
  return ok ? <>{children}</> : <UnauthorizedPage />;
}

/** The platform simulator is sample-data-only; it has no live API behind it. */
function DemoOnly({ children }: { children: ReactNode }) {
  const { demo } = useSession();
  return demo ? <>{children}</> : <UnauthorizedPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <ScannerProvider>
            <Routes>
              {/* Public / auth */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/accept-invite" element={<AcceptInvitePage />} />
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/scan/:session" element={<PhoneScanPage />} />

              {/* POS till (full screen; PIN sessions) */}
              <Route path="/pos/lock" element={<LockScreen />} />
              <Route element={<RequireTillUser />}>
                <Route path="/pos/open-shift" element={<OpenShiftPage />} />
                <Route path="/pos/close-shift" element={<CloseShiftPage />} />
                <Route path="/pos" element={<PosPage />} />
              </Route>

              {/* Back office */}
              <Route element={<RequireBackOffice />}>
                <Route element={<AppLayout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/sales" element={<Perm p={["sales.view_all", "sales.view_own"]}><SalesPage /></Perm>} />
                  <Route path="/sales/:id" element={<Perm p={["sales.view_all", "sales.view_own"]}><SaleDetailPage /></Perm>} />
                  <Route path="/customers" element={<Perm p="customers.manage"><CustomersPage /></Perm>} />
                  <Route path="/customers/:id" element={<Perm p="customers.manage"><CustomerDetailPage /></Perm>} />
                  <Route path="/products" element={<Perm p="products.view"><ProductsPage /></Perm>} />
                  <Route path="/inventory" element={<Perm p={["inventory.adjust", "inventory.transfer"]}><InventoryPage /></Perm>} />
                  <Route path="/suppliers" element={<Perm p="purchases.manage"><SuppliersPage /></Perm>} />
                  <Route path="/purchases" element={<Perm p="purchases.manage"><PurchasesPage /></Perm>} />
                  <Route path="/purchases/:id" element={<Perm p="purchases.manage"><PurchaseDetailPage /></Perm>} />
                  <Route path="/employees" element={<Perm p="employees.view"><EmployeesPage /></Perm>} />
                  <Route path="/employees/:id" element={<Perm p="employees.view"><EmployeeDetailPage /></Perm>} />
                  <Route path="/roles" element={<Perm p="roles.manage"><RolesPage /></Perm>} />
                  <Route path="/shifts" element={<Perm p="shift.view_all"><ShiftsPage /></Perm>} />
                  <Route path="/activity" element={<Perm p="activity.view"><ActivityPage /></Perm>} />
                  <Route path="/expenses" element={<Perm p="expenses.manage"><ExpensesPage /></Perm>} />
                  <Route path="/reports" element={<Perm p="reports.view"><ReportsPage /></Perm>} />
                  <Route path="/branches" element={<Perm p="branches.manage"><BranchesPage /></Perm>} />
                  <Route path="/notifications" element={<NotificationsPage />} />
                  <Route path="/settings" element={<Perm p="settings.manage"><SettingsPage /></Perm>} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/platform" element={<DemoOnly><PlatformAdminPage /></DemoOnly>} />
                  <Route path="/unauthorized" element={<UnauthorizedPage />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            <ScannerWindows />
          </ScannerProvider>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
