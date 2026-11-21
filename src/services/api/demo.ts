/**
 * DEMO mode plumbing. Without `VITE_API_URL` every hook serves sample data so the whole app can be explored.
 * Review helper: add `?demo=loading`, `?demo=empty` or `?demo=error` to a URL to see those states.
 */
import { useMemo } from "react";
import { DEMO } from "@/lib/http";
import { useQuery, type QueryState } from "@/lib/query";

type DemoState = "loading" | "empty" | "error" | null;

function demoState(): DemoState {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("demo");
  return v === "loading" || v === "empty" || v === "error" ? v : null;
}

export function useDemo<T>(value: T, empty: T): QueryState<T> {
  const state = demoState();
  return useMemo(() => ({
    data: state ? empty : value,
    loading: state === "loading",
    error: state === "error" ? "We couldn't load this data. Check your connection and try again." : null,
    refetch: () => {},
  }), [state, value]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Live query or demo value. Both hooks always run, so the hook order never changes. */
export function useData<T>(key: (string | number | null | undefined | boolean)[], live: () => Promise<T>, demo: T, empty: T, enabled = true): QueryState<T> {
  const live_ = useQuery(key, live, empty, !DEMO && enabled);
  const demo_ = useDemo(demo, empty);
  return DEMO ? demo_ : live_;
}

/** Resolves after a short delay, so demo actions feel like real requests. */
export const pause = <T,>(value?: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value as T), 350));
