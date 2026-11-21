/** Money is calculated in pesewas (integer cents) and stored as DECIMAL(14,2) cedis. */
import { n } from "./values.js";

/** Money is calculated in pesewas (integers) to avoid floating-point errors. */
export const cents = (v: unknown) => Math.round(n(v) * 100);

export const money = (c: number) => Math.round(c) / 100;
