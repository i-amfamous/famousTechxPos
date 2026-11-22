import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { LuCircleAlert, LuCircleCheck, LuInfo, LuX } from "react-icons/lu";
import { cn } from "@/lib/format";
import { QUERY_ERROR_EVENT } from "@/lib/query";

type ToastTone = "success" | "error" | "info";
interface Toast { id: number; tone: ToastTone; title: string; body?: string }

const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { ...t, id }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4000);
  }, []);
  const lastError = useRef<{ message: string; at: number } | null>(null);
  useEffect(() => {
    const onQueryError = (e: Event) => {
      const message = (e as CustomEvent<{ message?: string }>).detail?.message ?? "Something went wrong.";
      const now = Date.now();
      if (lastError.current?.message === message && now - lastError.current.at < 8_000) return;
      lastError.current = { message, at: now };
      push({ tone: "error", title: "Couldn't load data", body: message });
    };
    window.addEventListener(QUERY_ERROR_EVENT, onQueryError);
    return () => window.removeEventListener(QUERY_ERROR_EVENT, onQueryError);
  }, [push]);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="ui-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-white p-4 shadow-pop ring-1 ring-ink-200/80">
            <span className={cn("mt-0.5", t.tone === "success" ? "text-emerald-600" : t.tone === "error" ? "text-rose-600" : "text-brand-600")}>
              {t.tone === "success" ? <LuCircleCheck className="size-5" /> : t.tone === "error" ? <LuCircleAlert className="size-5" /> : <LuInfo className="size-5" />}
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-ink-900">{t.title}</p>
              {t.body && <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{t.body}</p>}
            </div>
            <button aria-label="Dismiss" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="rounded-md p-0.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700">
              <LuX className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
