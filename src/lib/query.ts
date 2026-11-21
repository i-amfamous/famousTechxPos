/**
 * Tiny data-fetching cache (no extra dependency): dedupes requests, shares results
 * between components and refetches on `invalidate("prefix")` after mutations.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toAppError } from "./errors";

interface Entry {
  data: unknown;
  error: string | null;
  loading: boolean;
  loaded: boolean;
  fetcher?: () => Promise<unknown>;
  /** False while the screen says the query can't run yet (e.g. no branch chosen). */
  enabled: boolean;
  inflight?: Promise<void>;
  /** Identifies the current request so a cancelled older request can't clear the new one. */
  inflightToken?: object;
  /** Invalidated while a request was in flight: fetch again once it settles (its answer may be stale). */
  rerun?: boolean;
  /** Identity generation this entry's current request belongs to. */
  epoch: number;
  listeners: Set<() => void>;
  snapshot: { data: unknown; error: string | null; loading: boolean; loaded: boolean };
}

const cache = new Map<string, Entry>();
/** Bumped when the signed-in identity changes so late responses from the old session are discarded. */
let generation = 0;
/** Lets the toast layer report background load failures even on pages without an inline error state. */
export const QUERY_ERROR_EVENT = "ftx:query-error";

function entry(key: string): Entry {
  let e = cache.get(key);
  if (!e) {
    e = { data: undefined, error: null, loading: false, loaded: false, enabled: false, epoch: generation, listeners: new Set(), snapshot: { data: undefined, error: null, loading: false, loaded: false } };
    cache.set(key, e);
  }
  return e;
}

function emit(e: Entry) {
  e.snapshot = { data: e.data, error: e.error, loading: e.loading, loaded: e.loaded };
  e.listeners.forEach((l) => l());
}

function run(key: string) {
  const e = entry(key);
  if (!e.fetcher) return;
  if (!e.enabled) { e.loaded = false; return; } // runs as soon as it becomes enabled
  if (e.inflight) { e.rerun = true; return; }
  const startedAt = e.epoch;
  const token = {};
  e.inflightToken = token;
  e.loading = true;
  emit(e);
  const task = e
    .fetcher()
    .then((d) => {
      if (startedAt !== e.epoch) return; // a different person signed in while this was in flight
      e.data = d;
      e.error = null;
    })
    .catch((err) => {
      if (startedAt !== e.epoch) return;
      const message = toAppError(err).message;
      e.error = message;
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(QUERY_ERROR_EVENT, { detail: { key, message } }));
    })
    .finally(() => {
      if (e.inflightToken === token) { e.inflight = undefined; e.inflightToken = undefined; }
      if (startedAt !== e.epoch) { emit(e); return; }
      e.loading = false;
      e.loaded = true;
      emit(e);
      if (e.rerun) { e.rerun = false; run(key); }
    });
  e.inflight = task;
}

/** Refetch every query whose key starts with one of the prefixes (e.g. "sales", "products"). */
export function invalidate(...prefixes: string[]) {
  for (const [k, e] of cache) {
    if (prefixes.some((p) => k === p || k.startsWith(p + "|"))) {
      if (e.listeners.size) run(k);
      else e.loaded = false; // refetch next time it is used
    }
  }
}

/**
 * Forget cached results without refetching (after signing out, so no one sees the last person's data).
 * `keep` lists key prefixes that belong to the device rather than the person (e.g. the till roster).
 */
export function resetQueries(keep: string[] = []) {
  generation++;
  for (const [k, e] of cache) {
    if (keep.some((p) => k === p || k.startsWith(p + "|"))) continue;
    e.epoch = generation;
    e.data = undefined;
    e.error = null;
    e.loaded = false;
    e.loading = false;
    e.inflight = undefined; // a new session must start a fresh request, not reuse the old one
    e.inflightToken = undefined;
    e.rerun = false;
    emit(e);
  }
}

/** Refetch everything (e.g. after signing in as someone else). */
export function invalidateAll() {
  for (const [k, e] of cache) {
    if (e.listeners.size) run(k);
    else e.loaded = false;
  }
}

export interface QueryState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useQuery<T>(key: (string | number | null | undefined | boolean)[], fetcher: () => Promise<T>, fallback: T, enabled = true): QueryState<T> {
  const k = key.map((x) => String(x ?? "")).join("|");
  const e = entry(k);
  e.fetcher = fetcher as () => Promise<unknown>;
  e.enabled = enabled;

  const subscribe = useCallback((cb: () => void) => {
    const en = entry(k);
    en.listeners.add(cb);
    return () => en.listeners.delete(cb);
  }, [k]);
  const snap = useSyncExternalStore(subscribe, () => entry(k).snapshot);

  useEffect(() => {
    if (enabled && !entry(k).loaded) run(k);
  }, [k, enabled]);

  return {
    data: (snap.loaded && snap.data !== undefined ? snap.data : fallback) as T,
    loading: enabled && !snap.loaded,
    error: snap.error,
    refetch: () => run(k),
  };
}
