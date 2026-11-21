import type { ReactNode } from "react";
import {
  LuBadgePercent, LuBoxes, LuCoins, LuKeyRound, LuReceipt, LuSettings, LuShieldCheck, LuUndo2, LuUserCog,
} from "react-icons/lu";
import { Badge, type Tone } from "@/components/ui";
import type { ActivityEvent, Employee } from "@/types";

export const statusTone: Record<Employee["status"], Tone> = { active: "success", invited: "info", suspended: "warning", deactivated: "neutral" };
export const statusLabel: Record<Employee["status"], string> = { active: "Active", invited: "Invited", suspended: "Suspended", deactivated: "Deactivated" };

export function StatusBadge({ status }: { status: Employee["status"] }) {
  return <Badge tone={statusTone[status]} dot>{statusLabel[status]}</Badge>;
}

export function PinBadge({ e }: { e: Employee }) {
  if (e.pinLocked) return <Badge tone="danger">Locked</Badge>;
  if (e.hasPin) return <Badge tone="neutral">Set</Badge>;
  return <span className="text-xs text-ink-400">Not set</span>;
}

export const activityIcon: Record<ActivityEvent["category"], { icon: ReactNode; cls: string }> = {
  auth: { icon: <LuKeyRound />, cls: "bg-sky-100 text-sky-700" },
  sale: { icon: <LuReceipt />, cls: "bg-emerald-100 text-emerald-700" },
  refund: { icon: <LuUndo2 />, cls: "bg-rose-100 text-rose-700" },
  discount: { icon: <LuBadgePercent />, cls: "bg-amber-100 text-amber-700" },
  approval: { icon: <LuShieldCheck />, cls: "bg-violet-100 text-violet-700" },
  stock: { icon: <LuBoxes />, cls: "bg-brand-100 text-brand-700" },
  cash: { icon: <LuCoins />, cls: "bg-amber-100 text-amber-800" },
  employee: { icon: <LuUserCog />, cls: "bg-fuchsia-100 text-fuchsia-700" },
  settings: { icon: <LuSettings />, cls: "bg-ink-200 text-ink-700" },
};
export const activityCategoryLabel: Record<ActivityEvent["category"], string> = {
  auth: "Sign-in", sale: "Sales", refund: "Refunds", discount: "Discounts", approval: "Approvals", stock: "Stock", cash: "Cash drawer", employee: "Team", settings: "Settings",
};

