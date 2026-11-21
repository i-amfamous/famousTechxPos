# famousTechxPos
A POS system built for a business

**Famous TechX POS — UI/UX layer.** React + TypeScript + Vite + Tailwind CSS v4.
Every screen is designed and wired with sample data. **No business logic, database or auth is implemented** — that's the logic layer to be written next (see "Connecting your logic" below).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # TypeScript check
npm run build
```

Start at `/login`, `/dashboard` or the till at `/pos/lock` (any 4-digit PIN works except `0000`, which simulates a wrong PIN).

## Screens

| Area | Routes |
|---|---|
| Auth & onboarding | `/login`, `/forgot-password`, `/accept-invite`, `/onboarding` |
| **POS till** (full screen) | `/pos/lock` (employee tiles + PIN, create PIN), `/pos/open-shift`, `/pos` (sell), `/pos/close-shift` (cash count / Z report) |
| POS modals | Payment (split tender, MoMo ref, change), manager approval (PIN), discount, line edit / price override, customer, hold cart, held carts, cash in/out/drop/no-sale, X report, receipt |
| Dashboard | `/dashboard` (incl. "On shift now") |
| Sales | `/sales`, `/sales/:id` (reprint, refund, void) |
| Catalogue & stock | `/products`, `/inventory` (levels, movements, transfers, adjust), `/suppliers`, `/purchases`, `/purchases/:id` |
| Customers | `/customers`, `/customers/:id` |
| **Team (multi-employee)** | `/employees`, `/employees/:id` (profile, role & permission overrides, branch access, activity, performance, sign-in history, security), `/roles` (edit + compare matrix), `/shifts`, `/activity` |
| Money | `/expenses`, `/reports` |
| Business | `/branches`, `/settings` (business, receipts & tax, POS & security, tills, ownership), `/notifications`, `/profile`, `/platform` |
| States | `/unauthorized`, any unknown URL → 404 |

**Review loading / empty / error states:** add `?demo=loading`, `?demo=empty` or `?demo=error` to any URL.

## Project structure

```
src/
  app/session.tsx        UI session: signed-in user, branch, terminal, POS user, shift flag, can()
  services/api.ts        ⟵ LOGIC SEAM: all data hooks (use…) and actions.* live here
  mock/data.ts           design-time sample data (delete when real data is wired)
  types/index.ts         domain types mirroring the SRS tables
  lib/format.ts          money/date formatting (GHS, Africa/Accra), cn()
  components/ui/         design system: Button, Form, Display, Overlay, Table, Toast, Charts, PinPad
  components/layout/     AppLayout (sidebar, branch switcher, user menu)
  features/<module>/     one folder per module (pos, employees, sales, …)
```

## Connecting your logic

1. **`src/services/api.ts`** — replace each `useX()` hook body with a Supabase query and each `actions.x()` with your RPC / Edge Function call. Keep the signatures; screens won't need changes. Every place that expects logic is marked with a `// LOGIC` comment (`grep -rn "LOGIC" src`).
2. **`src/app/session.tsx`** — hydrate the user, role, branch access and registered terminal from Supabase. `can(permission)` is for showing/hiding UI only; enforce in RLS and server functions.
3. **Money** — the cart and shift screens do simple arithmetic for display. Recompute totals decimal-safely in your checkout logic (SRS §5.2).
4. **Route guards** — wrap back-office routes in an auth guard and POS routes in a terminal guard (see the comment in `App.tsx`).
5. Remove `src/mock/` and the "Design preview · sample data" badge in `AppLayout` when real data is connected.

## Design tokens

Defined in `src/index.css` (`@theme`): `brand-*` (TechX blue), `ink-*` (neutrals), amber accent for the POS / primary CTAs, emerald for money-in, rose for destructive actions. Font: Inter. Numbers use `num` (tabular figures). Receipts print at 80 mm via `.print-area`.
