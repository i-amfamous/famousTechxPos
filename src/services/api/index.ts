/**
 * The app's data layer. Screens read with `use…()` hooks and write with `actions.*`.
 *   queries.ts - read hooks (cached, invalidated by prefix after writes)
 *   actions.ts - writes, one API call each
 *   demo.ts    - sample-data mode when no API is configured
 */
export * from "./queries";
export * from "./actions";
