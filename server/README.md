# Famous TechX POS — API server

Node.js + Express + TypeScript API for the POS. Data lives in **TiDB Cloud** (MySQL-compatible). Email goes out over **SMTP**. Deploys to **Render** or **Railway**.

```bash
npm install
npm run dev:memory   # try it now: in-memory database, no setup (data is lost on stop)
npm test             # 26 end-to-end tests, also on an in-memory database
```

---

## 1. Set up TiDB Cloud (about 5 minutes)

1. Create a free **TiDB Cloud Serverless** cluster at <https://tidbcloud.com>. Choose the region closest to your shops.
2. Open the cluster, click **Connect**, choose **Connect with: General**, and generate a password.
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL` with that host, user and password. Keep the database name `famous_pos`. It's created for you.
4. Create the tables:
   ```bash
   npm run migrate      # safe to run again; every statement is "IF NOT EXISTS"
   ```
5. Start the server:
   ```bash
   npm run dev          # http://localhost:8080 — check http://localhost:8080/health
   ```
6. In the website folder, set `VITE_API_URL=/api` in `.env` and run `npm run dev`. Open <http://localhost:5173/onboarding> to create the owner account and business.

## 2. Email (invites and password resets)

Set the `SMTP_*` values in `.env`.

- **Gmail:** use `smtp.gmail.com`, port `465` and an **App Password** (Google Account → Security → 2-Step Verification → App passwords). Your normal password won't work.
- **Zoho:** use `smtp.zoho.com` and port `465`.

Without SMTP, nothing breaks: when you add an employee by email invite, the app shows the invite link for you to share yourself (for example on WhatsApp).

## 3. Deploy

**Render:** the root `render.yaml` blueprint creates **two** services: this API (`rootDir: server`) and the static website. In Render choose **New → Blueprint**, select the repository, then fill in the `sync: false` values: `DATABASE_URL`, `APP_URL` (the website's public address), `CORS_ORIGINS` (if you use more than one domain), the SMTP values, and `VITE_API_URL` for the website (the full API origin). Tables are created automatically on each deploy (`preDeployCommand`). Use a paid instance: free instances sleep when idle, and tills need the API awake.

**Railway:** create a service from the repository, set the **root directory** to `server`, and add these variables in the dashboard: `DATABASE_URL`, `APP_URL`, `NODE_ENV=production`, SMTP values, and optionally `CORS_ORIGINS`. `railway.json` builds the server, runs migrations before each deploy, and checks `/health`. Railway does not deploy the website — host `dist/` separately.

`APP_URL` is **required in production**: the server exits at startup without it so invite links and CORS can never silently point at `localhost`. Do not set the website's `VITE_API_URL` to `/api` in production unless your host proxies both `/api` and `/ws` to this server; use the full origin (for example `https://famous-techx-pos-api.onrender.com`). Enable backups/PITR on your TiDB cluster before going live, and verify `GET /health` after every deploy.

---

## Architecture

```
server/
  db/schema.sql                 tables and indexes (portable MySQL/TiDB SQL)
  scripts/
    migrate.ts                  creates the database and tables, seeds permissions and plans
    dev-memory.ts               runs the API on an in-memory database (no TiDB needed)
  src/
    index.ts                    starts HTTP + WebSocket, connects to TiDB
    app.ts                      Express: CORS, JSON, error responses
    config.ts                   environment variables
    http/
      router.ts                 Route type, matching, access levels, rate limits, dispatch
      routes.ts                 every module's routes in one list
    core/                       building blocks with no business rules
      db.ts                     database interface + mysql2 pool adapter
      errors.ts                 AppError (status, machine code, message safe to show staff)
      money.ts  time.ts  values.ts  settings.ts  activity-log.ts  mail.ts  numbering.ts
    auth/
      crypto.ts                 scrypt hashing, random tokens
      sessions.ts               bearer sessions (only a SHA-256 of each token is stored)
      access.ts                 the Actor (who is calling), permission and branch checks
      permission-catalogue.ts   every permission and the default roles
      link-tokens.ts            one-time invite / reset links
    realtime/scan-relay.ts      WebSocket relay for "use my phone as a scanner"
    modules/<domain>/           one folder per business area
      <domain>.routes.ts        endpoints: method, path, access level → service call
      *.service.ts              the business rules for that area
```

The modules are `accounts`, `tills` (devices and PINs), `approvals`, `shifts`, `sales` (checkout, receipts, returns, held carts), `customers`, `people` (employees, roles, activity), `catalogue`, `inventory` (stock ledger, adjustments, transfers), `purchasing`, `expenses`, `business` (branches, settings), `notifications` and `reports`.

### Conventions

- **Routes are data.** Each module exports a `Route[]`, and the router gives handlers a typed context: `member` routes always receive `c.actor`. Express and the tests run the same `dispatch()`, so the tests cover the real request path.
- **Services own the rules.** A service receives `(db, actor, input)`. It checks permissions itself (`requirePerm`, `requireBranch`) and throws `AppError`. It never sees HTTP.
- **Stock changes in one place.** `applyStock()` in `inventory/stock-ledger.ts` locks the row, applies the change, records the movement and raises low-stock alerts. Sales, refunds, voids, transfers, purchase orders and adjustments all go through it.
- **Money is in pesewas.** Calculations use whole numbers (`cents()` and `money()`) and are stored as `DECIMAL(14,2)`.
- **Portable SQL.** Queries use `?` placeholders and avoid MySQL-only syntax, so the same code runs on TiDB in production and on SQLite in tests. Integrity comes from transactions with `SELECT … FOR UPDATE` and the unique keys in `schema.sql`.
- **Timestamps are UTC.** Reports group days in the business's time zone (Africa/Accra by default).

### Security model

| Concern | How it's handled |
|---|---|
| Passwords and PINs | Hashed with scrypt and a salt per user. PIN hashes never leave the server. |
| Sessions | Random 256-bit bearer tokens; the database stores only their SHA-256. Suspending an employee, resetting a password, revoking a till or using "sign out everywhere" ends sessions on their next request. |
| PIN vs password | A PIN session only works on the till it was created on. Admin actions such as managing employees, roles, settings and tills require a password session. |
| Tills | Each registered device holds its own token (`X-Terminal-Token`), which is shown once at registration. A PIN only works on a registered, active till. |
| PIN guessing | PINs lock after the configured number of wrong attempts (5 by default) and managers are notified. Sign-in endpoints are also rate-limited. |
| Manager approval | Single-use and valid for 15 minutes. Each approval is tied to the requester, the action and a maximum amount, and both names are logged. |
| Business isolation | Every query is scoped to the caller's business and checked against their branch access. |
| Money integrity | Checkout is one transaction and is idempotent: a retried request returns the same sale. Prices come from the catalogue unless an approved override is sent. |

---

## API overview

All endpoints take and return JSON. Send `Authorization: Bearer <token>` once signed in. Errors look like `{ "error": "insufficient_stock", "message": "Not enough stock: …" }`.

| Area | Endpoints |
|---|---|
| Accounts | `POST /auth/signup` `/auth/login` `/auth/logout` `/auth/forgot` `/auth/reset` · `GET /me` · `POST /me/password` `/me/pin` · `PATCH /me/profile` · `POST /business` |
| Tills | `GET /terminal/roster` · `POST /terminal/pin-login` `/terminal/pin-setup` `/terminal/lock` · `GET/POST /terminals` · `POST /terminals/:id/revoke` |
| Approvals | `GET /approvers` · `POST /approvals` |
| Shifts | `GET /shifts` `/shifts/current` `/shifts/:id/summary` `/cash-movements` · `POST /shifts` `/shifts/:id/cash-movements` `/shifts/:id/close` |
| Selling | `POST /checkout` · `GET /sales` `/sales/:id` `/sales/:id/receipt` `/sales/:id/refunds` · `POST /sales/:id/refund` `/sales/:id/void` · `GET/POST /held-carts` · `POST /held-carts/:id/resume` · `DELETE /held-carts/:id` |
| Customers | `GET/POST /customers` · `PATCH /customers/:id` · `POST /customers/:id/archive` |
| People | `GET /employees` `/roles` `/permissions` `/activity` `/sign-ins` · `POST /employees` · `PATCH /employees/:id` · `PUT /employees/:id/access` · `POST /employees/:id/{status,sign-out,reset-password,resend-invite,reset-pin,make-owner}` · `POST /roles` · `PUT/DELETE /roles/:id` |
| Catalogue | `GET/POST /categories` · `GET/POST /products` · `PATCH /products/:id` · `GET /barcode/:code` |
| Inventory | `POST /stock/adjust` `/stock/receive` · `GET /stock/movements` · `GET/POST /transfers` · `POST /transfers/:id/receive` |
| Purchasing | `GET/POST /suppliers` · `PATCH /suppliers/:id` · `GET/POST /purchase-orders` · `POST /purchase-orders/:id/{status,receive}` |
| Money | `GET/POST /expenses` · `POST /expenses/:id/void` · `GET /reports/{dashboard,employees,pnl}` · `GET /reports/employees/:id` |
| Business | `GET/POST /branches` · `PATCH /branches/:id` · `PATCH /settings` · `GET /notifications` · `POST /notifications/read` |
| Realtime | `WS /ws/scan?session=<id>&role=till\|phone` |
| Health | `GET /health` |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API with auto-reload, using `.env` |
| `npm run dev:memory` | API on an in-memory database, with emails printed to the console |
| `npm run migrate` | create or update the tables (`migrate:prod` runs the compiled version) |
| `npm test` | end-to-end tests: accounts, tills, PINs, checkout, approvals, refunds, shifts, stock, purchasing, reports, isolation, scan relay |
| `npm run typecheck` | strict TypeScript check of the server and the tests |
| `npm run build` / `npm start` | compile to `dist/` and run it |
