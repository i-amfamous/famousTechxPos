import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LuTriangleAlert, LuX } from "react-icons/lu";
import { cn } from "@/lib/format";
import { Button, IconButton } from "./Button";
import { Textarea } from "./Form";

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

function useAutoFocus(open: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => ref.current?.querySelector<HTMLElement>("[autofocus],input,select,textarea,button:not([aria-label='Close'])")?.focus(), 30);
  }, [open]);
  return ref;
}

export function Modal({
  open, onClose, title, description, children, footer, size = "md", dismissible = true,
}: {
  open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl"; dismissible?: boolean;
}) {
  useEscape(open && dismissible, onClose);
  const ref = useAutoFocus(open);
  if (!open) return null;
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="ui-overlay absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={dismissible ? onClose : undefined} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" className={cn("ui-surface relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop ring-1 ring-ink-900/5 sm:rounded-2xl", w)}>
        {(title || dismissible) && (
          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>}
              {description && <p className="mt-1 text-sm leading-relaxed text-ink-600">{description}</p>}
            </div>
            {dismissible && <IconButton label="Close" onClick={onClose} className="-mr-2"><LuX className="size-5" /></IconButton>}
          </div>
        )}
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 bg-ink-50/70 px-6 py-4 sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open, onClose, title, description, children, footer, width = "md",
}: { open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: "md" | "lg" }) {
  useEscape(open, onClose);
  const ref = useAutoFocus(open);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="ui-overlay absolute inset-0 bg-ink-900/45" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" className={cn("ui-surface relative flex h-full w-full flex-col bg-white shadow-pop", width === "lg" ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-5">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>}
            {description && <p className="mt-1 text-sm leading-relaxed text-ink-600">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-2"><LuX className="size-5" /></IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 bg-ink-50/70 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation for destructive / important actions. Optionally requires a reason. */
export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel = "Confirm", tone = "danger", requireReason, reasonLabel = "Reason",
}: {
  open: boolean; onClose: () => void; onConfirm: (reason?: string) => Promise<void> | void; title: string; message: ReactNode;
  confirmLabel?: string; tone?: "danger" | "primary"; requireReason?: boolean; reasonLabel?: string;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setReason(""); }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            disabled={requireReason && reason.trim().length < 3}
            onClick={async () => { setBusy(true); try { await onConfirm(reason); onClose(); } finally { setBusy(false); } }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone === "danger" ? "bg-rose-100 text-rose-600 ring-1 ring-rose-200" : "bg-brand-100 text-brand-700 ring-1 ring-brand-200")}>
          <LuTriangleAlert className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-ink-900">{title}</h3>
          <div className="mt-1 text-sm text-ink-600">{message}</div>
          {requireReason && <Textarea className="mt-4" label={reasonLabel} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="This is recorded in the activity log" />}
        </div>
      </div>
    </Modal>
  );
}

/* ───── Dropdown menu ───── */
export function Menu({ trigger, items, align = "right" }: { trigger: (p: { onClick: () => void; "aria-expanded": boolean }) => ReactNode; items: ({ label: ReactNode; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | "divider")[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open })}
      {open && (
        <div role="menu" className={cn("ui-surface absolute z-40 mt-1 min-w-52 origin-top rounded-xl bg-white p-1.5 shadow-pop ring-1 ring-ink-200/80", align === "right" ? "right-0" : "left-0")}>
          {items.map((it, i) =>
            it === "divider" ? (
              <div key={i} className="my-1 h-px bg-ink-100" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onClick(); }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm disabled:opacity-40",
                  it.danger ? "text-rose-600 hover:bg-rose-50" : "text-ink-700 hover:bg-ink-100",
                )}
              >
                {it.icon && <span className="size-4 shrink-0 [&>svg]:size-4">{it.icon}</span>}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
