import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider } from "@/app/session";
import { ToastProvider } from "@/components/ui";
import { AppLayout } from "@/components/layout/AppLayout";
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

/**
 * Routes. LOGIC: wrap back-office routes in an auth guard (Supabase session) and
 * POS routes in a terminal guard (registered device). Use `can()` from the session
 * to redirect to /unauthorized for pages the user's role doesn't include.
 */
export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Routes>
            {/* Public / auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />

            {/* POS terminal (full screen) */}
            <Route path="/pos/lock" element={<LockScreen />} />
            <Route path="/pos/open-shift" element={<OpenShiftPage />} />
            <Route path="/pos/close-shift" element={<CloseShiftPage />} />
            <Route path="/pos" element={<PosPage />} />

            {/* Back office */}
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/sales" element={<SalesPage />} />
              <Route path="/sales/:id" element={<SaleDetailPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/purchases" element={<PurchasesPage />} />
              <Route path="/purchases/:id" element={<PurchaseDetailPage />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/employees/:id" element={<EmployeeDetailPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route path="/shifts" element={<ShiftsPage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/branches" element={<BranchesPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/platform" element={<PlatformAdminPage />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}
