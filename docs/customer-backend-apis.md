# Application-customer backend APIs

Short map of **live** Symfony `/api/v1` surfaces that an OEM panel can call for **application buyers** (`APP_END_USER` in the application Identity tenant). Base URL: `https://api.fonitas.com/api/v1`. Field-level truth: [OpenAPI](https://api.fonitas.com/api/v1/openapi.yaml) and `symfony_fonitas` domain docs.

This panel is **customer-only**. Publisher / org-admin / staff routes are out of scope here.

## Auth model for OEM buyers

| Piece | Status | Notes |
| --- | --- | --- |
| Application Identity tenant | Live | Provisioned when the app is approved. Resolve slug with `GET /developer-panels/oem/identity-tenant` (`Origin` header). |
| Register / login / MFA / refresh / logout | Live | `POST /auth/register`, `/auth/login`, `/auth/mfa/verify`, `/auth/refresh`, `/auth/logout`. Cookie JWTs + CSRF. Lane: `APPLICATION_TENANT`. |
| Email verification | Live | `POST /auth/verification/resend`, `POST /auth/verify-email/code` (and related verify routes). |
| Password forgot / reset | Live | `POST /auth/password/forgot`, `/auth/password/reset`. |
| Session profile | Live | `GET /auth/me` (roles/permissions). Personal profile routes under `/auth/personal-profile*`. |
| Same-origin customer PHP proxy for Identity cookies | **Live (OEM)** | Customer PHP forwards `/api/v1/*` to Fonitas and rewrites `Set-Cookie` to the OEM host. OEM builds set `VITE_OEM_SAME_ORIGIN_API`. Local OEM session may still gate the shell. |

Do **not** register buyers into tenant `fonitas`.

## What you can deploy today (buyer-relevant)

### Identity (account)

| Method | Path | Buyer use |
| --- | --- | --- |
| GET | `/developer-panels/oem/identity-tenant` | Resolve `tenant_slug` for this installation `Origin` |
| POST | `/auth/register` | Create `APP_END_USER` in the app tenant |
| POST | `/auth/login` (+ MFA) | Sign in |
| GET | `/auth/me` | Gate UI on roles / verified email |
| POST | `/auth/verification/resend`, `/auth/verify-email/code` | Verify email |
| POST | `/auth/password/forgot`, `/auth/password/reset` | Recovery |
| GET/PATCH | `/auth/personal-profile` (+ picture / ID uploads) | Profile details |

### Buy / catalog / checkout

| Method | Path | Buyer use |
| --- | --- | --- |
| GET | `/catalog/applications` | Public catalog (allowlisted fields; no cookies required) |
| GET | `/catalog/applications/{listingId}` | One public listing + offers |
| POST | `/payments/checkouts` | Start Stripe/FREE checkout (`offer_id`, `buyer_email`, …). Guest OK |
| GET | `/payments/checkouts/{id}` | Read checkout status (org/staff oriented; buyers usually follow Stripe + email) |
| POST | `/payments/checkouts/{id}/confirm` | Test-provider confirm only; Stripe waits for webhook |

OEM **Buy** must filter catalog/offers to the **installation-bound application** (from OEM activate / panel binding). Do not show other apps’ offers. The panel resolves that id via `GET /api/bound-application` (customer PHP) or `index.php?view=bound-application`, with optional `VITE_APPLICATION_ID`.

**Deploy note:** Route the OEM host’s `/api/*` to `customer/public` so health, bound-application, and the `/api/v1` UpstreamProxy share the buyer origin.

### Licenses (after purchase)

| Method | Path | Buyer use |
| --- | --- | --- |
| GET | `/license/purchases/{id}` | Guest recovery via **signed** capability URL (email link). Returns key once transport is valid |
| POST | `/license/me/purchases/{id}/attach` | Attach sale to verified signed-in buyer (`signed_url` body + CSRF) |
| GET | `/license/me/purchases` | Buyer purchase history + snapshots + `validity` (no raw keys) |
| POST | `/license/keys/validate` | App runtime validation (machine; not a dashboard CRUD) |

Publisher list/revoke/resend (`GET/POST /license/keys…`) are **not** buyer APIs.

### Support (ticketing SaaS)

Live ticket stack — suitable for an in-panel “Send ticket / My tickets” experience **once** the app (or org) has a Support **workspace** in the correct Identity tenant.

| Method | Path | Buyer / agent |
| --- | --- | --- |
| GET, POST | `/support/workspaces` | List / create workspace (tenant-scoped) |
| GET | `/support/workspaces/{id}` | Workspace detail |
| GET, POST | `/support/workspaces/{id}/tickets` | List / open ticket (`PORTAL` or `API`) |
| GET | `/support/tickets/{id}` | Ticket + thread |
| POST | `/support/tickets/{id}/messages` | `COMMENT` for requester; `NOTE` needs `support.ticket.assign` |
| POST | `/support/tickets/{id}/assign` | Agent only (`support.ticket.assign`) |
| POST | `/support/tickets/{id}/resolve` | Agent |
| POST | `/support/tickets/{id}/close` | Agent |
| POST | `/support/tickets/{id}/reopen` | Agent |

**Buyer panel verbs:** create ticket, list own tickets, reply with `COMMENT`. Hide assign / resolve / close / reopen / `NOTE` unless `/auth/me` includes `support.ticket.assign`.

**Deploy caveat:** Support is an optional Platform SaaS product. Publishing an app does **not** auto-create a Support workspace or entitlement. OEM ticketing needs a workspace bound to that application (or a documented org/app correlation) before the UI is useful.

### Help (knowledge base)

| Method | Path | Buyer use |
| --- | --- | --- |
| GET | `/help/public/{spaceSlug}/{articleSlug}` | Public article (no session) |
| GET | `/help/spaces…`, articles, publish… | Authoring — publisher/staff, not the buyer shell |

OEM can deep-link public Help articles; full in-app help browser is optional.

### Notifications (inbox)

| Method | Path | Buyer use |
| --- | --- | --- |
| GET | `/notifications` | Recipient list |
| GET/PATCH | `/notifications/preferences` | Own preferences |
| POST | `/notifications/{id}/read` | Mark read |

Create is staff-only. Domains do not yet emit buyer events into Notification for all flows — treat as optional UI.

## Not available / not for OEM buyers yet

| Need | Backend today |
| --- | --- |
| Device register / remove for a license | Declared on purchase snapshot only; **no** buyer device CRUD API |
| Buyer cancel / manage Stripe subscription | Checkout + webhook periods exist; **no** buyer “cancel subscription” REST |
| Buyer invoice PDF / payment-method vault UI | Stripe-hosted; **no** first-class buyer billing CRUD in OpenAPI |
| Installation-scoped “only this app’s tickets/purchases” guard on every route | Identity tenant + attach/list help; OEM must still enforce **application binding** from the installation (planned PHP + Symfony checks) |
| Application API key for software detection | Planned (domain binding remains live) |

## Suggested first wiring order

1. Identity session already on the panel → keep verification + profile.
2. `GET /license/me/purchases` (+ attach from recovery) → Licenses / Billing history.
3. Catalog filtered to bound app + `POST /payments/checkouts` → Buy.
4. Ensure Support workspace for the app tenant → ticket create/list/reply → Support.
5. Optional: public Help links; notifications inbox.

## Sources

- [engineering.md](engineering.md) — OEM product direction and installation binding  
- Symfony: `docs/domains/identity.md`, `support.md`, `help.md`, `license.md`, `payment.md`, `gallery.md`  
- OpenAPI: `contracts/openapi/fonitas-v1.yaml` / live `/api/v1/openapi.yaml`  
- Bridge narrative: Fonitas `docs/frontend/what-fonitas-provides.md`
