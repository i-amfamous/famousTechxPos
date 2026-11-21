import { useState, type ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LuActivity, LuBell, LuBoxes, LuBuilding2, LuChartColumn, LuChevronDown, LuClock, LuLayoutDashboard, LuLogOut,
  LuMenu, LuMonitorSmartphone, LuPackage, LuReceipt, LuSettings, LuShieldCheck, LuShoppingCart, LuTruck,
  LuUser, LuUsers, LuWallet, LuX, LuClipboardList, LuServer,
} from "react-icons/lu";
import { useSession } from "@/app/session";
import { useBranches, useNotifications } from "@/services/api";
import { Avatar, Badge, Menu } from "@/components/ui";
import { cn } from "@/lib/format";

interface NavItem { to: string; label: string; icon: ReactNode; perm?: string }
const groups: { title?: string; items: NavItem[] }[] = [
  { items: [{ to: "/dashboard", label: "Dashboard", icon: <LuLayoutDashboard /> }] },
  {
    title: "Sell",
    items: [
      { to: "/sales", label: "Sales", icon: <LuReceipt />, perm: "sales.view_all" },
      { to: "/customers", label: "Customers", icon: <LuUsers />, perm: "customers.manage" },
    ],
  },
  {
    title: "Stock",
    items: [
      { to: "/products", label: "Products", icon: <LuPackage />, perm: "products.view" },
      { to: "/inventory", label: "Inventory", icon: <LuBoxes />, perm: "inventory.adjust" },
      { to: "/suppliers", label: "Suppliers", icon: <LuTruck />, perm: "purchases.manage" },
      { to: "/purchases", label: "Purchase orders", icon: <LuClipboardList />, perm: "purchases.manage" },
    ],
  },
  {
    title: "Team",
    items: [
      { to: "/employees", label: "Employees", icon: <LuUsers />, perm: "employees.view" },
      { to: "/roles", label: "Roles & permissions", icon: <LuShieldCheck />, perm: "roles.manage" },
      { to: "/shifts", label: "Shifts & cash", icon: <LuClock />, perm: "shift.view_all" },
      { to: "/activity", label: "Activity log", icon: <LuActivity />, perm: "activity.view" },
    ],
  },
  {
    title: "Money",
    items: [
      { to: "/expenses", label: "Expenses", icon: <LuWallet />, perm: "expenses.manage" },
      { to: "/reports", label: "Reports", icon: <LuChartColumn />, perm: "reports.view" },
    ],
  },
  {
    title: "Business",
    items: [
      { to: "/branches", label: "Branches", icon: <LuBuilding2 />, perm: "branches.manage" },
      { to: "/settings", label: "Settings", icon: <LuSettings />, perm: "settings.manage" },
    ],
  },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useSession();
  return (
    <nav className="flex h-full flex-col bg-brand-900 text-brand-100" aria-label="Main">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <Logo />
        <div className="leading-tight">
          <p className="text-sm font-bold tracking-wide text-white">FAMOUS TECHX</p>
          <p className="text-[11px] text-brand-300">Point of Sale</p>
        </div>
      </div>
      <div className="px-3 pb-3">
        <NavLink
          to="/pos"
          onClick={onNavigate}
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 text-sm font-semibold text-brand-900 shadow-sm transition-colors hover:bg-amber-300"
        >
          <LuShoppingCart className="size-4" /> Open POS
        </NavLink>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 scrollbar-thin">
        {groups.map((g, gi) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm));
          if (!items.length) return null;
          return (
            <div key={gi}>
              {g.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-400">{g.title}</p>}
              <ul className="space-y-0.5">
                {items.map((i) => (
                  <li key={i.to}>
                    <NavLink
                      to={i.to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&>svg]:size-[18px]",
                          isActive ? "bg-white/10 text-white" : "text-brand-200 hover:bg-white/5 hover:text-white",
                        )
                      }
                    >
                      {i.icon}
                      {i.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-9 items-center justify-center rounded-xl bg-amber-400 text-sm font-black text-brand-900", className)} aria-hidden>
      FX
    </span>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, role, branch, setBranchId } = useSession();
  const branches = useBranches().data.filter((b) => b.status === "active");
  const unread = useNotifications().data.filter((n) => !n.read).length;
  const navigate = useNavigate();

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-64"><Sidebar /></div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-72">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button className="absolute right-3 top-4 rounded-lg p-1.5 text-brand-200 hover:bg-white/10" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
              <LuX className="size-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-2 text-ink-600 hover:bg-ink-100 lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <LuMenu className="size-5" />
          </button>

          <Menu
            align="left"
            trigger={(p) => (
              <button {...p} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-ink-100">
                <LuBuilding2 className="size-4 text-ink-500" />
                <span className="max-w-40 truncate font-medium text-ink-800 sm:max-w-none">{branch.name}</span>
                <LuChevronDown className="size-4 text-ink-400" />
              </button>
            )}
            items={[
              ...branches.map((b) => ({ label: b.name, onClick: () => setBranchId(b.id), icon: b.id === branch.id ? <span className="block size-2 rounded-full bg-brand-600" /> : undefined })),
              "divider" as const,
              { label: "All branches (consolidated)", onClick: () => {} },
            ]}
          />

          <div className="ml-auto flex items-center gap-1">
            <NavLink to="/notifications" className="relative rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label={`Notifications, ${unread} unread`}>
              <LuBell className="size-5" />
              {unread > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">{unread}</span>}
            </NavLink>
            <Menu
              trigger={(p) => (
                <button {...p} className="ml-1 flex items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 hover:bg-ink-100">
                  <Avatar name={user.fullName} color={user.avatarColor} size="sm" />
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-sm font-medium text-ink-900">{user.fullName}</span>
                    <span className="block text-xs text-ink-500">{role.name}</span>
                  </span>
                  <LuChevronDown className="hidden size-4 text-ink-400 sm:block" />
                </button>
              )}
              items={[
                { label: "My profile", icon: <LuUser />, onClick: () => navigate("/profile") },
                { label: "POS terminals", icon: <LuMonitorSmartphone />, onClick: () => navigate("/settings?tab=terminals") },
                { label: "Platform admin", icon: <LuServer />, onClick: () => navigate("/platform") },
                "divider",
                { label: "Sign out", icon: <LuLogOut />, danger: true, onClick: () => navigate("/login") },
              ]}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <footer className="px-6 pb-4 text-center text-xs text-ink-400">
          <Badge tone="warning">Design preview · sample data</Badge>
        </footer>
      </div>
    </div>
  );
}
