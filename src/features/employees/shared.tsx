import { useState, type ReactNode } from "react";
import {
  LuBadgePercent, LuBoxes, LuCheck, LuCopy, LuCoins, LuKeyRound, LuReceipt, LuSettings, LuShieldCheck, LuUndo2, LuUserCog,
} from "react-icons/lu";
import { Badge, useToast, type Tone } from "@/components/ui";
import { actions } from "@/services/api";
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


/** A read-only value (link, password) with a copy button. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl bg-ink-50 p-3 ring-1 ring-ink-200">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-700" title={value}>{value}</span>
      <button aria-label={label} className="rounded-lg p-1.5 text-ink-500 hover:bg-white hover:text-ink-900"
        onClick={async () => { await navigator.clipboard?.writeText(value).catch(() => null); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <LuCheck className="size-4 text-emerald-600" /> : <LuCopy className="size-4" />}
      </button>
    </div>
  );
}

/** Resends an invite; when the server can't email, copies the link so the manager can share it. */
export async function resendInvite(memberId: string, email: string | undefined, toast: ReturnType<typeof useToast>) {
  try {
    const r = await actions.employeeAdmin("resend_invite", memberId);
    if (r.inviteLink) {
      await navigator.clipboard?.writeText(r.inviteLink).catch(() => null);
      toast({ tone: "info", title: "Invite link copied", body: "Email isn't set up on the server — paste the link to the employee yourself." });
    } else toast({ tone: "success", title: "Invite resent", body: email });
  } catch (er) {
    toast({ tone: "error", title: (er as Error).message });
  }
}
