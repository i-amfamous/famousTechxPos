import { useState, type ReactNode } from "react";
import { LuBell, LuCheckCheck, LuClipboardList, LuClock, LuShieldAlert, LuTriangleAlert, LuUndo2, LuUser } from "react-icons/lu";
import { actions, useNotifications } from "@/services/api";
import { Button, Card, DataState, EmptyState, PageHeader, Segmented } from "@/components/ui";
import { cn, timeAgo } from "@/lib/format";
import type { AppNotification } from "@/types";

const icons: Record<AppNotification["type"], [ReactNode, string]> = {
  low_stock: [<LuTriangleAlert key="a" />, "bg-amber-100 text-amber-700"],
  refund: [<LuUndo2 key="b" />, "bg-rose-100 text-rose-700"],
  purchase: [<LuClipboardList key="c" />, "bg-brand-100 text-brand-700"],
  account: [<LuUser key="d" />, "bg-sky-100 text-sky-700"],
  shift: [<LuClock key="e" />, "bg-violet-100 text-violet-700"],
  security: [<LuShieldAlert key="f" />, "bg-rose-100 text-rose-700"],
};

export function NotificationsPage() {
  const q = useNotifications();

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [readIds, setReadIds] = useState<string[]>([]);
  const isRead = (n: AppNotification) => n.read || readIds.includes(n.id);
  const rows = q.data.filter((n) => filter === "all" || !isRead(n));
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={<><Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }]} /><Button variant="secondary" icon={<LuCheckCheck className="size-4" />} onClick={async () => { await actions.markNotificationsRead(); setReadIds(q.data.map((n) => n.id)); }}>Mark all read</Button></>}
      />
      <Card padded={false} className="max-w-3xl">
        <DataState query={{ ...q, data: rows }} empty={<EmptyState icon={<LuBell className="size-7" />} title={filter === "unread" ? "You're all caught up" : "No notifications"} />}>
          {(data) => (
            <ul className="divide-y divide-ink-100">
              {data.map((n) => (
                <li key={n.id}>
                  <button onClick={() => { setReadIds((r) => [...r, n.id]); if (!n.read) void actions.markNotificationsRead([n.id]); }} className={cn("flex w-full gap-4 px-5 py-4 text-left hover:bg-ink-50", !isRead(n) && "bg-brand-50/40")}>
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full [&>svg]:size-4", icons[n.type][1])}>{icons[n.type][0]}</span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-ink-900">{n.title}</span>
                      <span className="block text-sm text-ink-500">{n.body}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-xs text-ink-400">{timeAgo(n.createdAt)}</span>
                      {!isRead(n) && <span className="size-2 rounded-full bg-brand-600" aria-label="Unread" />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DataState>
      </Card>
    </>
  );
}
