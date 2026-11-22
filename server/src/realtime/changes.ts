/**
 * In-process fan-out for lightweight data-change notices.
 * A notice carries identifiers and a category only, never row data. The browser still
 * has to refetch through the normal scoped API, so tenant rules stay in one place.
 */
export interface ChangeEvent {
  orgId: string;
  branchId?: string | null;
  type: string;
  at: number;
}

type Listener = (event: ChangeEvent) => void;
const listeners = new Set<Listener>();

/** Subscribe to committed changes. Returns an unsubscribe function. */
export function onChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Publish a committed change to every local subscriber, such as the WebSocket relay. */
export function emitChange(event: Omit<ChangeEvent, "at"> & { at?: number }) {
  if (!event.orgId || !event.type) return;
  const clean: ChangeEvent = {
    orgId: event.orgId,
    type: event.type,
    at: event.at ?? Date.now(),
    ...(event.branchId ? { branchId: event.branchId } : {}),
  };
  for (const listener of listeners) {
    try { listener(clean); }
    catch (e) { console.error("[changes] listener failed:", e); }
  }
}
