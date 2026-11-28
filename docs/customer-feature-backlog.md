# Application-customer feature backlog

Backlog for the OEM **buyer** dashboard (`APP_END_USER`) in this repository. Map each feature to **live** Symfony APIs or a **needed** contract. API detail: [customer-backend-apis.md](customer-backend-apis.md). Product shell: [engineering.md](engineering.md).

**Legend**

| Tag | Meaning |
| --- | --- |
| Ready | Backend live; panel can wire UI (respect CORS/CSRF/tenant) |
| Partial | Backend exists but OEM binding, workspace, or PHP bridge still missing |
| Needed | No suitable buyer API yet — design in Symfony before UI |

Sidebar sections today: overview · buy · licenses · subscriptions · billing · support · profile.

---

## P0 — Session and installation trust

| ID | Feature | APIs / work | Status |
| --- | --- | --- | --- |
| C-01 | Same-origin Identity cookies via customer PHP | Proxy `/api/v1/*` through `customer/` (`UpstreamProxy`); OEM UI uses `/api/v1` | Ready (OEM) — local shell session still used for gate |
| C-02 | Resolve app Identity tenant from installation | `GET /developer-panels/oem/identity-tenant` | Ready |
| C-03 | Enforce installation → single application on every data call | Client: `/api/bound-application` + filters; Symfony buyer routes must check bound `application_id` (extend as needed) | Partial — client Ready; server track open |
| C-04 | Email verification gate (already shipping) | `/auth/verification/resend`, `/auth/verify-email/code` | Ready |

---

## P1 — Licenses and purchases (Licenses + Billing)

| ID | Feature | APIs / work | Status |
| --- | --- | --- | --- |
| C-10 | List my purchases / licenses (no raw key) | `GET /license/me/purchases` (+ `validity`); app Identity tenants supported | Wired |
| C-11 | Attach guest purchase to account | Recovery `#recovery=` / signed URL → `POST /license/me/purchases/{id}/attach` | Wired |
| C-12 | Show edition, platforms, seats, runtime/support cutoffs | From purchase `snapshot` + `validity` on C-10 | Wired |
| C-13 | Overview counters (licenses, open tickets, …) | Derive from C-10 / Support list | Wired |
| C-14 | Device register / remove UI | **Needed** — seats/devices are snapshot facts only; no device CRUD | Needed |
| C-15 | In-app “reveal key” without recovery link | **Needed** — raw key only via signed guest recovery; do not invent a key dump | Needed (or keep email-only) |

---

## P2 — Buy now

| ID | Feature | APIs / work | Status |
| --- | --- | --- | --- |
| C-20 | Show sellable offers for **this** application only | `GET /catalog/applications` (+ detail); filter by installation-bound app / listing | Wired (price/billing/seats cards) |
| C-21 | Start checkout (guest or signed-in email) | `POST /payments/checkouts` → Stripe URL | Wired (guest omit-cookies; FREE vs Stripe outcomes) |
| C-22 | Post-pay “claim / attach” path in panel | Email recovery + `?checkout=success\|cancel` return copy + Licenses attach | Wired |
| C-23 | Freemium / matrix offers in OEM buy | Same catalog + checkout; depends on publisher gallery activation | Wired (FREEMIUM path); gallery activate stays publisher-side |

---

## P3 — Support ticketing (customer)

| ID | Feature | APIs / work | Status |
| --- | --- | --- | --- |
| C-30 | Ensure Support workspace for app tenant | `POST /support/workspaces` (or provision on Platform Support entitlement) | Wired (create-on-visit); auto-provision on entitlement still Symfony |
| C-31 | Open ticket from panel | `POST /support/workspaces/{id}/tickets` (`source: PORTAL`) | Wired |
| C-32 | List my tickets / open ticket detail | `GET …/tickets` (requester-scoped), `GET /support/tickets/{id}`, `GET …/messages` | Wired |
| C-33 | Reply as customer | `POST /support/tickets/{id}/messages` with `COMMENT` | Wired |
| C-34 | Hide agent actions | Assign / resolve / close / reopen / `NOTE` only if `support.ticket.assign` | Wired (RBAC + agent actions in OEM) |
| C-35 | Attachments upload | Metadata-only today; **Needed** byte upload contract if buyers must attach files | Needed (or defer) |
| C-36 | Ticket email ingress / CSAT | Documented deferred in Support domain | Needed (later) |

---

## P4 — Subscriptions and billing UI

| ID | Feature | APIs / work | Status |
| --- | --- | --- | --- |
| C-40 | Show active subscription periods | Infer from C-10 `validity.runtime_valid_until` / support dates | Wired (display) |
| C-41 | Cancel / change plan | **Needed** buyer subscription lifecycle API | Needed |
| C-42 | Purchase history (billing section) | Same as C-10; optionally checkout ids from snapshot | Wired |
| C-43 | Saved payment methods / invoices in panel | Stripe Customer Portal or **Needed** Fonitas routes | Needed |

---

## P5 — Profile and help

| ID | Feature | APIs / work | Status |
| --- | --- | --- | --- |
| C-50 | Profile edit / picture | `/auth/personal-profile*` | Ready |
| C-51 | Change password | Password reset flow or signed-in change if exposed | Partial — forgot/reset Ready; confirm signed-in change in OpenAPI before UI |
| C-52 | In-app Help articles | `GET /help/public/{space}/{slug}`; deep links | Ready (read) |
| C-53 | Notification inbox | `GET /notifications`, mark read, preferences | Partial — API Ready; few buyer events published yet |

---

## P6 — Platform / ops (not buyer UI, but blockers)

| ID | Feature | APIs / work | Status |
| --- | --- | --- | --- |
| C-60 | Application API key for software detection | Planned alongside domain binding | Needed |
| C-61 | CORS allowlist for each OEM origin | Symfony `CORS_ALLOWED_ORIGINS` / panel origin policy | Ops |
| C-62 | Commercial Support/Help entitlement for the app | Platform products `SUPPORT` / `HELP` | Partial — commercial live; OEM onboarding UX TBD |

---

## Recommended build sequence

```text
C-01/C-03 (trust) → C-10/C-11 (licenses) → C-20/C-21 (buy)
  → C-30–C-33 (tickets) → C-40/C-42 (subscriptions/billing display)
  → C-14/C-41/C-43 only after Symfony contracts exist
```

## Explicit non-goals for this backlog

- Publisher Contracts / QA / Publishing / Gallery activate (hosted developer panel)
- Staff Support console (`fonitas-ops`)
- Building a second Identity, Support, or Help stack inside PHP

When a backlog item is **Needed**, open or extend the Symfony domain doc + OpenAPI first; do not invent panel-only endpoints. Track: [customer-symfony-needed.md](customer-symfony-needed.md).
