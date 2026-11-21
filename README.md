# Famous TechX POS

**Famous TechX POS** is a point-of-sale and back-office system for a business with several employees, tills and branches.

| Part | Folder | Stack |
|---|---|---|
| Website (POS + back office) | `/` | React 19, TypeScript, Vite, Tailwind CSS v4 |
| API server | `server/` | Node.js, Express, TypeScript, WebSocket |
| Database | TiDB Cloud | MySQL-compatible, set up by `npm run migrate` |
| Email | Brevo | SMTP relay for invites and password resets |

The website has two modes:
- **Demo mode:** when `VITE_API_URL` is empty, the app runs on sample data. Any PIN works on the till except `0000`, which simulates a wrong PIN.
- **Live mode:** when `VITE_API_URL` points to the server, everything is saved in TiDB and the server enforces every permission.

---

## 1. Try it in 2 minutes (no database needed)

```bash
# terminal 1 — the API on a throw-away in-memory database
cd server && npm install && npm run dev:memory

# terminal 2 — the website
npm install
cp .env.example .env        # VITE_API_URL=/api
npm run dev                 # open http://localhost:5173/onboarding
```

Create the owner account and business, add a product, register this computer as a till (**Settings → Tills**) and open the POS. Invite emails are printed in terminal 1.

## 2. Go live

`VITE_API_URL` is **baked into the bundle at build time**. If it is empty, the app silently runs on sample data. `npm run build` now refuses to produce that bundle unless you set `ALLOW_DEMO_BUILD=1` deliberately.

1. **Database:** create a TiDB Cloud Serverless cluster, put its connection string in `server/.env` as `DATABASE_URL`, and run `cd server && npm run migrate`. The `famous_pos` database and tables are created for you. Ensure the cluster has automated backups/PITR enabled before taking real payments. See [server/README.md](server/README.md#1-set-up-tidb-cloud-about-5-minutes).
2. **Email (Brevo):** in Brevo go to **SMTP & API → SMTP**, generate an SMTP key and verify a sender address, then add to `server/.env`: `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER` (your Brevo login email), `SMTP_PASS` (the SMTP key — not the API key) and `MAIL_FROM` (the verified sender, e.g. `Famous TechX <no-reply@yourdomain.com>`). Without SMTP the app still works — invite links are shown on screen for you to share manually.
3. **API server:** deploy `server/` to Render using the included `render.yaml` blueprint, or to Railway with `server/railway.json`. Set these variables on the host (secrets are never committed):
   - `DATABASE_URL` — the TiDB connection string
   - `APP_URL` — the **public website address** (required in production; invite/reset links and CORS depend on it)
   - `CORS_ORIGINS` — extra origins if you use both a custom domain and an `onrender.com` URL
   - `NODE_ENV=production` (set in `render.yaml`; set it manually on Railway)
   - SMTP values above
4. **Website:** copy `.env.production.example` to `.env.production` and set `VITE_API_URL` to the **full public API origin** (for example `https://famous-techx-pos-api.onrender.com`). Do **not** use `/api` in production unless your host proxies both `/api` and `/ws`. Run `npm run build` and host `dist/`. The Render blueprint includes a static site with a rewrite of all paths to `index.html`; if you host elsewhere (Netlify, Vercel, …), add the same SPA rewrite.
5. **Verify before opening the tills:**
   - `curl https://<your-api>/health` returns `{"ok":true,...}`.
   - Sign in at the website, add a product, then register a till in **Settings → Tills** and sell something. Confirm the sale appears in **Sales** after a full page reload — that proves data is coming from the database, not sample data.
   - Open the site over HTTPS; browsers only allow camera scanning on HTTPS (or localhost). Phone scanning also needs the full API origin above.
   - Check the server logs for `APP_URL` / `DATABASE_URL` startup errors.

## 3. Everyday commands

```bash
npm run dev          # website on http://localhost:5173 (API proxied from /api → localhost:8080)
npm run dev:https    # same, over HTTPS on your Wi-Fi, so phones can use their camera as a scanner
npm run typecheck    # TypeScript check
npm run build        # production build in dist/ (requires VITE_API_URL; ALLOW_DEMO_BUILD=1 for a demo bundle)

cd server
npm run dev          # API with auto-reload (uses server/.env → TiDB)
npm test             # end-to-end API tests
```

## 4. Barcode scanning

Every screen that uses scans (POS, Products, Inventory, Transfers, Purchase orders) accepts all of these sources at the same time:

| Source | Setup |
|---|---|
| **USB scanner** | Plug it in. It types like a keyboard, and the app recognises the fast input. |
| **Bluetooth scanner** | Pair it with the computer or tablet in system Bluetooth settings (keyboard/HID mode). Then just scan. |
| **This device's camera** | Click **Scan → Use this device's camera**. This uses the browser's built-in scanner where available, and falls back to ZXing on iPhone, Safari and Firefox. |
| **Your phone over Wi-Fi or the internet** | Click **Scan → Use my phone as a scanner** and scan the QR code with your phone. Each barcode the phone scans appears on the computer instantly through the server's WebSocket relay. You don't need to install an app. |

- **Adding a product:** a scanned barcode is checked against your catalogue first. If the item exists, the form offers to *receive stock* instead of creating a duplicate. If it doesn't, the barcode is looked up online (UPCitemdb, then Open Food Facts), and the name, brand, description, photo and category are filled in for you.
- **Inventory:** **Scan stock in** adds 1 for each scan. **Stock count** scans the shelf and sets the true quantities.

Cameras only work on **HTTPS** or `localhost`. To test with a phone on your local network, run `npm run dev:https`, then enter `https://<your-computer-ip>:5173` in the pairing window.

## 5. How employees work

- **Separate logins:** every employee has their own account, created by email invite or with a temporary password. Staff without email sign in with their phone number.
- **Tills:** a till is a device the owner registers. Staff unlock it by tapping their name and entering a 4-digit PIN. They set the PIN themselves the first time, after confirming their password.
- **PIN limits:** a PIN only opens the POS. The back office always needs a full password; the server checks how the user signed in, and a PIN sign-in only works on its own till.
- **Manager approval:** discounts above a limit, refunds, voids, price changes, opening the drawer without a sale, cash drops, taking over someone else's held cart and cash variances above the threshold all need a manager to enter their PIN on the till. Each approval is single-use and logged with both names.
- **Shifts:** a shift has an opening float, cash in and out, an X report during the shift, and a Z report at close with a count by cedi denomination and the difference from expected cash.
- **Activity log:** every sale, refund, approval, stock change, PIN lockout and permission change is recorded.

## 6. Project structure

```
src/
  app/session.tsx          who is signed in, business, permissions, branch, till, PIN user, shift
  lib/http.ts              API client (session + till credentials, errors, demo switch)
  lib/errors.ts            AppError — messages that are safe to show staff
  lib/query.ts             small cache: dedupes requests, refetches after changes, clears on sign-out
  services/api/            the data layer screens use
    queries.ts             use…() read hooks
    actions.ts             actions.* writes, one API call each
    demo.ts                sample-data mode
  features/scanner/        scanner provider, camera scanner, phone pairing (/scan/:session)
  features/<module>/       screens (pos, products, inventory, employees, sales, …)
  components/ui/           design system
  mock/data.ts             demo data
server/                    API server — architecture, security model and endpoints in server/README.md
```

## 7. Notes and limits

- **Payments:** Mobile Money, card and bank payments are *recorded manually*. They're not verified with Paystack, Hubtel or MTN MoMo until those integrations and credentials are added.
- **Offline:** offline selling is not supported. Checkout needs a connection, and a retry never double-charges.
- **Tax:** set your tax rate in **Settings → Receipts & tax**, and check current GRA rates yourself.
