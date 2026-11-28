# Symfony track — OEM buyer Needed APIs

Panel work in this repository consumes OpenAPI only after these land in `symfony_fonitas`. Do **not** invent delete/device/cancel endpoints in the OEM UI.

| Backlog | Work | Notes |
| --- | --- | --- |
| C-03 server | Buyer list/attach/checkout scoped to OEM-bound `application_id` where missing | Client already filters; server must enforce. App-tenant buyer list/attach (any Identity tenant, not only `fonitas`) is fixed in License `BuyerPurchasesHandler`. |
| C-14 | Device register/remove API for buyers | Seats/devices are snapshot facts today |
| C-15 | Decide: no in-app key reveal (recommended) vs new capability | Raw key only via signed guest recovery |
| C-30 / C-62 | Auto-provision Support workspace on Support entitlement | Panel creates via `POST /support/workspaces` as fallback; message list + requester ticket scoping shipped |
| C-41 / C-43 | Buyer subscription cancel + invoices / Stripe Customer Portal | Cancel + payment methods stay disabled in panel |
| C-35 | Ticket attachment byte upload | Metadata-only today |
| C-60 | Application API key for software detection | Domain binding remains; key is complementary |

Ops checklist (not API design): CORS allowlist each OEM origin (C-61); Support/Help commercial entitlement for the app tenant (C-62).

Source backlog: [customer-feature-backlog.md](customer-feature-backlog.md).
