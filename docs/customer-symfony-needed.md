# Symfony track — OEM buyer Needed APIs

Panel work in this repository consumes OpenAPI only after these land in `symfony_fonitas`. Do **not** invent delete/device/cancel endpoints in the OEM UI.

| Backlog | Work | Notes |
| --- | --- | --- |
| C-03 server | Buyer list/attach/checkout scoped to OEM-bound `application_id` where missing | **Done in Symfony:** Origin→bound app via Organization lookup port; License list/attach, Payment checkout, and public catalog enforce it. |
| C-14 | Device register/remove API for buyers | **Done in Symfony:** `…/purchases/{id}/devices` register/list/remove with seat quota. Panel UI pending. |
| C-15 | Decide: no in-app key reveal (recommended) vs new capability | **Resolved:** stay email-only / guest recovery; no signed-in reveal API. |
| C-30 / C-62 | Auto-provision Support workspace on Support entitlement | Panel creates via `POST /support/workspaces` as fallback; message list + requester ticket scoping shipped |
| C-41 / C-43 | Buyer subscription cancel + invoices / Stripe Customer Portal | **Done in Symfony:** `POST /payments/billing-portal-sessions`. Panel button still pending. |
| C-35 | Ticket attachment byte upload | **Done in Symfony:** `POST /support/tickets/{id}/attachments/upload`. |
| C-36 | Support CSAT submit | **Done in Symfony:** `POST /support/tickets/{id}/csat`. Email ingress remains deferred. |
| C-60 | Application API key for software detection | **Done in Symfony:** issue + `GET /applications/detection`. Domain binding remains. |

Ops checklist (not API design): CORS allowlist each OEM origin (C-61); Support/Help commercial entitlement for the app tenant (C-62).

Source backlog: [customer-feature-backlog.md](customer-feature-backlog.md).
