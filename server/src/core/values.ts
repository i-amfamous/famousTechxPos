/** Small value helpers for request input and database rows. */
import { randomUUID } from "node:crypto";


export const uuid = () => randomUUID();

/** Numeric input from JSON/DB. Non-finite values become 0 so they can't bypass amount checks. */
export const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export const bool = (v: unknown) => v === true || v === 1 || v === "1";

export function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null || v === "") return fallback;
  if (typeof v === "object") return v as T;
  try { return JSON.parse(String(v)) as T; } catch { return fallback; }
}

export const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");

export const nullIfEmpty = (s: unknown) => (clean(s) === "" ? null : clean(s));

export const digits = (s: string) => s.replace(/\D/g, "").replace(/^233/, "0");
