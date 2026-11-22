/** Every endpoint of the API, gathered from the modules. */
import { accountsRoutes } from "../modules/accounts/accounts.routes.js";
import { approvalsRoutes } from "../modules/approvals/approvals.routes.js";
import { businessRoutes } from "../modules/business/business.routes.js";
import { catalogueRoutes } from "../modules/catalogue/catalogue.routes.js";
import { customersRoutes } from "../modules/customers/customers.routes.js";
import { expensesRoutes } from "../modules/expenses/expenses.routes.js";
import { inventoryRoutes } from "../modules/inventory/inventory.routes.js";
import { notificationsRoutes } from "../modules/notifications/notifications.routes.js";
import { paystackRoutes } from "../modules/payments/paystack.routes.js";
import { peopleRoutes } from "../modules/people/people.routes.js";
import { purchasingRoutes } from "../modules/purchasing/purchasing.routes.js";
import { reportsRoutes } from "../modules/reports/reports.routes.js";
import { salesRoutes } from "../modules/sales/sales.routes.js";
import { shiftsRoutes } from "../modules/shifts/shifts.routes.js";
import { tillsRoutes } from "../modules/tills/tills.routes.js";
import { createRouter, type Route } from "./router.js";

export const routes: Route[] = [
  ...accountsRoutes,
  ...tillsRoutes,
  ...approvalsRoutes,
  ...shiftsRoutes,
  ...salesRoutes,
  ...customersRoutes,
  ...peopleRoutes,
  ...catalogueRoutes,
  ...inventoryRoutes,
  ...purchasingRoutes,
  ...expensesRoutes,
  ...businessRoutes,
  ...notificationsRoutes,
  ...reportsRoutes,
  ...paystackRoutes,
];

export const router = createRouter(routes);
