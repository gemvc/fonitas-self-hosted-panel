# Self-hosted developer panel engineering handbook

This handbook is the repository's reference for architecture, API discovery, development, and operations. The implementation owns executable behavior. Follow the source links to verify details before using this document to design a change.

## Start here

| Task | Owning component | Entry point |
| --- | --- | --- |
| Change the static ZIP dashboard, pairing, or on-origin customer auth UI | This repository, React and TypeScript | [index.html](../index.html), [main.tsx](../src/main.tsx), [customer-session.ts](../src/customer-session.ts), [panel-login.ts](../src/panel-login.ts) |
| Change the customer dashboard sections or Identity role gate | This repository, React and TypeScript | [roles.ts](../src/roles.ts), [workspace.tsx](../src/workspace.tsx), [customer-dashboard.tsx](../src/pages/customer-dashboard.tsx), [customer-nav.ts](../src/customer-nav.ts) |
| Change the customer PHP API or installation validation | This repository, server-side PHP | [customer/public/index.php](../customer/public/index.php), [customer/src](../customer/src/) |
| Change allowed installation origins (HTTPS domain / localhost policy) | This repository, and Symfony origin validation | [origin.ts](../src/origin.ts), [installer `panelOrigin`](../installer/setup.php), Symfony [`DeveloperPanelOriginPolicy`][panels] |
| Change local Docker development images | This repository | [Dockerfile](../Dockerfile), [docker-compose.yml](../docker-compose.yml) |
| Change the installed customer shell (OEM ZIP) | This repository, React and TypeScript | [oem.html](../oem.html) builds [main.tsx](../src/main.tsx); legacy status viewer [oem.ts](../src/oem.ts) is unused in new releases |
| Change OEM setup, configuration, access, or updates | This repository, server-side PHP | [installer/setup.php](../installer/setup.php), especially `panelAction`, `panelRuntime`, `panelLatestRelease`, and `panelStageRelease` |
| Change the organization admin's domain workflow | Hosted developer portal | [Custom Domains page][hosted-domains] |
| Change hosted sign-in consent or return to the custom domain | Hosted developer portal and Symfony | [Hosted consent][hosted-consent], [session controller][session-controller] |
| Change a route, credential, permission, or application scope | Symfony Organization module | [Developer panel controller][panel-controller], [session controller][session-controller], [services](#source-of-truth) |
| Change a downloadable release asset | This repository, GitHub Actions | [release.yml](../.github/workflows/release.yml), [sign-release.mjs](../installer/sign-release.mjs) |

## Product direction for the OEM dashboard

The customer dashboard is installed on a subdomain (or site) of software a developer publishes on Fonitas. It is the branded account area for that application’s buyers only. Symfony remains the authority for purchases, licenses, subscriptions, payments, tickets, and email. This repository ships the on-origin UI shell; customer PHP and verified Fonitas routes fill the data. Deep organization administration stays on the hosted Fonitas portal. [Customer-only PHP backend](#customer-only-php-backend) · [Operations](#operations)

### Product and roles

Fonitas is a software publishing platform. The developer publishes an application on Fonitas and installs this dashboard on their own subdomain for that application. **The audience is the application customer** (`APP_END_USER`). The shell uses a top navbar (language plus a profile avatar menu with Profile, Send ticket, and Sign out) and a sidebar: overview, buy now, licenses (with devices), subscriptions, billing (purchases and payment history), support tickets, and profile. Profile holds account details, email verification (8-character Fonitas code), change password, payment methods, and mailbox email.

Use **existing Symfony keys** only. Do not invent panel-only role names. Application-tenant roles are seeded by Identity [`TenantRoleProvisioner`][tenant-roles].

| Actor | Existing backend key | Local dashboard | Hosted Fonitas |
| --- | --- | --- | --- |
| End user / buyer | `APP_END_USER` | Full customer dashboard (primary product) | — |
| Organization administrator | `ORG_ADMIN` | Install / pair only | Domain binding, connection keys, deep admin |
| Application owner / admin | `APP_OWNER`, `APP_ADMIN` | Not the primary local audience | Deep administration |
| Support agent | `support.ticket.assign` | Optional later; not required for customer-first scope | Support tools as provided on Fonitas |

Fonitas supplies identity, purchasing and payments, licensing, invoices, support tickets, business email, and reporting. Symfony remains the authority for ownership, entitlement, and business records. See [local customer workspace](#local-customer-workspace-static-ui) and [installation detection](#installation-detection-api-key-and-domain).

### Installation detection (API key and domain)

Target integration uses **two complementary identifiers**. Keep both; do not replace domain registration with an API key alone.

| Identifier | Purpose | Current status |
| --- | --- | --- |
| **Domain / connection key** | Binds the exact installation origin (`Origin`) to an organization (and for OEM, one application). Pairing and OEM activation redeem the one-time connection key (`fpk_…`) for that origin | Live for panel pair / OEM activate |
| **Application API key** | Lets frontend and backend detect **which software** the installation serves, independent of UI chrome | Planned. Document the Symfony producer and this consumer before locking request fields |

Loopback origins are **fail-closed**. They are allowed only when an explicit env flag is boolean-true **and** the runtime is development. Missing env is treated as `false`. Production / prod builds always reject loopback even if a flag is accidentally `true`.

| Layer | Development enablement | Production |
| --- | --- | --- |
| Static client (Vite) | `import.meta.env.DEV` **and** `VITE_ALLOW_LOCALHOST_ORIGINS=true` (set in gitignored `.env` / `.env.development.local`; see [`.env.example`](../.env.example)) | Production builds (`import.meta.env.DEV === false`) never allow loopback |
| PHP installer / OEM | `APP_ENV=dev` or `development` **and** `PANEL_ALLOW_LOCALHOST=true` | Defaults reject loopback |
| Customer PHP | Same `APP_ENV` + `PANEL_ALLOW_LOCALHOST` (from process env or `customer/.env`) | Defaults reject loopback |
| Symfony | `APP_ENV=dev` **and** `PANEL_ALLOW_LOCALHOST_ORIGINS=true` (`.env.dev` sets true; `.env` defaults false) | `APP_ENV=prod` always rejects loopback |

Verify Symfony is deployed with the dual-gate policy before relying on localhost pairing against a remote API.

### First milestone: customer registration from the app site

The app's own website (this OEM panel) hosts login and registration forms. The buyer never leaves that origin for another Fonitas website. Buyers register and verify email in the **application-owned Identity realm** (not tenant `fonitas`). Symfony provisions that realm when an application is approved (and ensures it when an OEM panel binds an application). The panel resolves `tenant_slug` via `GET /api/v1/developer-panels/oem/identity-tenant` from the installation `Origin` before register / resend / verify-code.

- Email uniqueness is `(identity_tenant, email)`. The same address may exist on fonitas.com and on App A / App B as separate users.
- Resolve the application (and owning organization) from the installation binding. A browser-supplied company or application identifier does not establish authorization.
- Register in an application tenant grants `APP_END_USER` in that realm. Sessions use lane `APPLICATION_TENANT`.
- Same-origin customer PHP against Identity cookies remains a follow-up; the static UI currently opens a local OEM session after Identity register. [Customer PHP backend](#customer-only-php-backend)

### Future installation and branding

The customer backend initially uses private environment configuration and an existing installation credential. The hosted administrator onboarding below is a later improvement.

1. The organization administrator opens `/setup.php` on the registered HTTPS origin and selects **Sign in with Fonitas**. The Fonitas sign-in page handles account credentials and any MFA. After authentication, a short-lived, one-time authorization code returns to the registered origin. The installer validates callback state and exchanges the code server-side.
2. Symfony verifies that the actor can manage the organization and that the origin is bound to its registered application. The installer loads organization and application details from that binding. The installer flow needs a backend authorization step that works before the installation is connected. The existing organization-member sign-in flow requires an already connected installation. [Current session service][sessions]
3. The organization display name is prefilled. The editable form has the display name, a PNG logo upload, and a favicon upload. Store uploaded branding assets on the self-hosted server and serve them on the dashboard origin. Validate file content and size server-side. Keep branding across bundle updates and rollback.
4. Activation uses the authorized installer session. The target flow removes manual connection-key entry, a separate installer password, a local user list, and reliance on `REMOTE_USER`. Installation credentials and server state stay in PHP. Brand assets are local configuration that survives signed dashboard bundle updates.

### Target authorization and integration boundaries

- Symfony resolves the bound application from the installation (domain / connection key today; application API key when that contract ships). Each customer operation checks the signed-in identity and ownership of the requested data within that application.
- The hosted Fonitas sign-in flow supplies shared identity. Local buyer access targets `APP_END_USER`. Customer authorization for purchases derives from Fonitas purchase or license data.
- Keep application business state in Fonitas. The self-hosted site stores the installation state, branding, static assets, and the configuration needed to serve its own dashboard.
- Treat the flows in this section as requirements for future API and frontend work. Verify the producer and consumer before documenting concrete routes, request fields, or compatibility guarantees. The [current API contracts](#api-contracts) describe the existing routes only.

### Customer-only PHP backend

The merged PHP foundation exposes one readiness route. It is available in the source checkout. The published static and OEM ZIPs and `setup.php` package the existing dashboards.

#### Configure and check an installation

1. Use PHP 8.2 or later with cURL. On a test virtual host, set the document root to `customer/public` and route `/api/health` to [`customer/public/index.php`](../customer/public/index.php).
2. Create `customer/.env` from [`customer/.env.example`](../customer/.env.example). Keep it outside the document root, readable by the PHP worker, with mode `0600`.

| Key | Value |
| --- | --- |
| `APP_ID` | The public UUID of the application bound to this installation |
| `PANEL_ORIGIN` | The exact registered origin. Production uses HTTPS without a trailing slash or default port `443`. Loopback such as `http://localhost:5173` is accepted only when `APP_ENV` is `dev`/`development` and `PANEL_ALLOW_LOCALHOST=true`. |
| `DOMAIN_TOKEN` | The OEM installation credential issued by activation. It starts with `fpi_`. The activation form uses a separate one-time key starting with `fpk_`. An activated OEM install stores the credential in its private state file. |
| `APP_ENV` | Defaults to `production`. Use `development` (or `dev`) only for local Docker / local PHP. |
| `PANEL_ALLOW_LOCALHOST` | Defaults to `false`. Set `true` only together with a development `APP_ENV` when using a loopback `PANEL_ORIGIN`. |

3. Run the following commands from the repository root in separate terminals to check the local PHP route.

```sh
php -S 127.0.0.1:8080 -t customer/public customer/public/index.php
```

```sh
curl -i http://127.0.0.1:8080/api/health
```

The API check uses `PANEL_ORIGIN` from configuration. The local command binds to loopback and leaves the actual registered origin unchanged.

| Response | Meaning |
| --- | --- |
| `200` with `{"status":"ready"}` | Fonitas accepted the installation credential and returned the configured application. |
| `503` with `installation_binding_invalid` | Fonitas rejected the installation or returned a different application UUID. Compare the origin, token, and app binding. |
| `503` with `installation_unavailable` | Check the configuration, file permissions, cURL, and outbound HTTPS to `api.fonitas.com`. An unexpected Fonitas response also produces this status. |
| `404` or `405` | The route only handles `GET /api/health`. A different request method to that path receives `405`. |

The readiness route returns no application details, buyer data, or credential. A successful result verifies the installation-to-app binding. Customer sign-in and app-scoped purchase and license routes remain to be implemented. [PHP configuration loader](../customer/src/Installation.php) · [PHP client](../customer/src/FonitasApi.php) · [OEM service][oem-service]

## Purpose and architecture

The current releases give software developers and authorized viewers a read-only view of application status on a custom domain. It has two distributions that share CSS and release automation. The hosted developer portal owns organization administration, domain requests, and application changes. Symfony owns application data, installation binding, and Fonitas authorization.

| | Static ZIP | Branded PHP dashboard (OEM) |
| --- | --- | --- |
| Build and entry | `npm run build` → `dist/index.html` → `src/main.tsx` | `npm run build:oem` → `dist-oem/oem.html` → same `src/main.tsx` customer shell. The installer creates the installed site's `index.php` |
| Identity | Buyers register / sign in on-origin (application Identity tenant). Optional `?setup=1` pairing for static installs | Same customer login / register on `/`. Admin management uses `.env` login on `/setup.php` only (`PANEL_ADMIN_USER` / `PANEL_ADMIN_PASSWORD`) |
| Browser requests | Browser calls the Symfony panel / Identity APIs | Customer UI calls Identity at `api.fonitas.com`. PHP serves the shell and brand assets without an admin session; installation-credential JSON views stay admin-only |
| Application scope | An unbound installation lists applications in its organization. A bound installation lists only its selected application | One application selected in Custom Domains; Identity tenant resolved from installation `Origin` |
| Operator and viewer | Organizations manage domains and keys in the hosted portal | Administrators manage updates / branding on `/setup.php`. Buyers use the public customer shell on `/` |

`SoftwareApplication` represents the software shown in the dashboard. The binding uses its public UUID. Application name and status come from Symfony. OEM brand name, logo, favicon, accent, language, support URL, and permitted viewers are local configuration. Current dashboard routes provide an application summary. Customer licensing, billing, and support views are part of the [target product direction](#product-direction-for-the-oem-dashboard).

### Local customer workspace (static UI)

The static React client’s first page is **on-origin customer login and register** ([`main.tsx`](../src/main.tsx)), plus **Continue without account** for guest buy (online sales must not require registration). After register or sign-in, unverified emails see only the **verification gate** ([`email-verification-gate.tsx`](../src/email-verification-gate.tsx): code entry + resend). Verified `APP_END_USER` opens the **customer dashboard** ([`customer-dashboard.tsx`](../src/pages/customer-dashboard.tsx), [`customer-nav.ts`](../src/customer-nav.ts)). Account features require a verified email; guests may still browse Buy without an account. There is **no browser redirect** to the hosted developer portal for buyers. Accounts without `APP_END_USER` see a no-access message.

Register resolves the application Identity tenant, then calls `POST /auth/register` (via [`identity-api.ts`](../src/identity-api.ts)) with that `tenant_slug`. Identity creates the user, grants `APP_END_USER`, and dispatches the verification email (Resend alias `verification-code`, variable `VERIFICATION_CODE` — see Symfony [`docs/email-templates/README.md`](https://github.com/gemvc/symfony_fonitas/blob/main/docs/email-templates/README.md)). The panel then opens a **local OEM session** ([`customer-session.ts`](../src/customer-session.ts)) and, when the email is still unverified, the **verification gate** only ([`email-verification-gate.tsx`](../src/email-verification-gate.tsx): code + resend + sign out). Verification uses `POST /auth/verification/resend` and `POST /auth/verify-email/code` with the same tenant. In Docker/Vite DEV those requests go same-origin through `/fonitas-api` (see [`vite.config.ts`](../vite.config.ts)). Optional `VITE_IDENTITY_TENANT_SLUG` overrides resolve for local testing only. Resend returns `204` even for unknown emails (anti-enumeration); production must load `RESEND_TEMPLATE_EMAIL_VERIFICATION=verification-code` into the running container (`up -d --force-recreate` after `.env` edits). Installation pairing is not on the customer landing; open `?setup=1` for the connection-key form.

Identity `GET /api/v1/auth/me` returns `display_name`, `roles`, and `permissions`. Prefer **permissions** for action gates when those APIs ship.

### Origin policy (domain and localhost)

| Mode | Allowed installation origins |
| --- | --- |
| **Default / production** | Canonical `https://` public hosts (optional non-default port). Loopback is rejected. |
| **Local development** | Same HTTPS hosts, plus `http(s)://localhost` / `127.0.0.1` / `[::1]` (optional port) **only** when the layer’s env flag is true **and** the runtime is development (see [installation detection](#installation-detection-api-key-and-domain)). |

The static UI uses [`isAllowedPanelOrigin`](../src/origin.ts) before pairing and sign-in. OEM PHP uses [`panelOrigin`](../installer/setup.php) / `panelAllowsLocalhost()`. Customer PHP uses [`Installation`](../customer/src/Installation.php). Symfony uses [`DeveloperPanelOriginPolicy`][panels].

### Next steps

| Order | Work | Owner |
| --- | --- | --- |
| 1 | Deploy / verify Symfony fail-closed localhost origin policy with the self-hosted client | `symfony_fonitas` + this repo |
| 2 | Same-origin buyer login via customer PHP / Identity cookies in the application realm (replace local OEM session) | Symfony + customer PHP + static client |
| 3 | Customer dashboard API consumers: purchases, licenses, devices, subscriptions, payments, methods, tickets, email | This repo + Symfony (License, payments, support, mail) |
| 4 | Application API key contract for software detection (keep domain connection key) | Symfony first, then this repo |

### Static trust flow

1. A hosted organization admin submits the panel's HTTPS address. The stored origin includes the host and any non-default port, and the static callback uses the site root. Registration makes a single-use connection key available immediately. The key is valid for 15 minutes. The installation is stored in Symfony and survives frontend replacement. [Installation lifecycle][panels]
2. An organization administrator opens the panel with `?setup=1` and submits the key to the pairing endpoint. The browser supplies its origin. Pairing acknowledges a connected installation, while customer sign-in remains a separate step. [Static pairing UI](../src/main.tsx)
3. On the customer landing, Sign in and Register stay on this origin. The UI currently opens a local customer session for the branded shell. When the [customer registration milestone](#first-milestone-customer-registration-from-the-app-site) ships, the same forms will post to same-origin customer PHP, which will call Fonitas Identity without sending the buyer to another website. [Static UI](../src/main.tsx) · [Customer session](../src/customer-session.ts)
4. Customer data access must be scoped by the signed-in buyer, the installation origin, and the bound application. [Session service][sessions] · [Static UI](../src/main.tsx)

### OEM trust flow

1. The hosted admin selects a software application for the domain. Symfony validates that it belongs to the selected organization. The registration issues a connection key for the installation. PHP redeems it from the installed site and stores the installation credential. Symfony stores its hash. [Custom Domains page][hosted-domains] · [OEM service][oem-service]
2. Operators sign in on `/setup.php` with `.env` credentials for management only (updates, branding, reconnect). The public site root serves the customer login / register shell without that session. [Installer, `panelSession` and `panelRuntime`](../installer/setup.php)
3. PHP keeps the installation credential for admin JSON and activation. Buyers resolve the application Identity tenant from `Origin` via Symfony. Reassignment clears credentials. Revocation removes the installation. [OEM service][oem-service] · [Application ownership and summary][panel-applications] · [Installer runtime](../installer/setup.php)

## API contracts

These are the routes consumed by the panel and hosted setup. Symfony JSON successes use the `data` envelope shown below. PHP JSON views return their fields at the top level. The linked controllers, request DTOs, and runtime define exact behavior.

### Hosted organization administration

Paths in this table are relative to `/api/v1/organizations/{organizationId}/developer-panels`. Requests come from the hosted portal with a Fonitas organization-admin session and use the portal's CSRF flow for mutations. [Controller and request DTOs][panel-controller] · [Hosted consumer][hosted-domains]

| Method and path | Input | Success |
| --- | --- | --- |
| `GET` base path | Organization UUID in the path | `200`, `data.installations` |
| `POST /requests` | `origin` and, for new requests in the current portal, `application_public_id`. Reconnection sends `origin` and `reconnect: true` | `202` |
| `GET /{panelId}/connection-key` | Installation UUID | `200`, `data.connection_key` and `data.expires_at` for an active key |
| `PATCH /{panelId}/application` | `application_public_id` for a software application owned by this organization | `204` |
| `DELETE /{panelId}` | Installation UUID | `204` |

The installation list includes `public_id`, `origin`, nullable `application_public_id`, `expires_at`, `connected_at`, `status`, `reconnection_status`, and `connection_key_available`. Existing installations can have no application binding. For an existing installation without one, use **Assign application** in Custom Domains. [Installation lifecycle][panels]

### Static sign-in and data

| Method and path | Input and caller | Success |
| --- | --- | --- |
| `POST /api/v1/developer-panels/pair` | Static browser, `Origin`, JSON `connection_key` | `204` |
| `GET /api/v1/organizations/developer-panel-sign-in` | Hosted session, query `origin` | `200`, `data.organizations[]` with `public_id` and `display_name` |
| `POST /api/v1/organizations/developer-panel-sign-in` | Hosted session and CSRF, JSON `origin`, `organization_id`, `challenge`, `state` | `200`, `data.redirect_url` |
| `POST /api/v1/developer-panels/session` | Static browser, `Origin`, JSON `code` and `verifier` | `200`, `data.access_token` (`fps_…`) and `data.expires_in` |
| `GET /api/v1/developer-panels/session/applications` | Static browser, `Origin`, panel bearer, and optional `page` | `200`, `data.organization`, `data.applications[]`, `data.page`, `data.last_page` |
| `DELETE /api/v1/developer-panels/session` | Static browser, `Origin` and panel bearer | `204` |

The app summary has `public_id`, `name`, `slug`, and `status`. For a bound installation, page 1 contains the selected application and later pages are empty. The CORS subscriber allows the static pairing and session routes to be called cross-origin without credentials such as cookies. This transport configuration is separate from the server's origin and token checks. [Pair controller][panel-controller] · [Session controller][session-controller] · [CORS subscriber][cors]

Signed-in workspace homes no longer treat `session/applications` as the primary UI. Role and permission data come from Identity:

| Method and path | Input and caller | Success |
| --- | --- | --- |
| `GET /api/v1/auth/me` | Identity cookie session | `200`, `data.display_name`, `data.roles`, `data.permissions` |

Verified seeded application-tenant roles: `APP_OWNER`, `APP_ADMIN`, `APP_END_USER`. Verified support gate: permission `support.ticket.assign`. [RBAC guide][identity-rbac] · [TenantRoleProvisioner][tenant-roles]

The static client currently loads identity through [`panel-me.ts`](../src/panel-me.ts) (`/session/me` on the panel API). **That bridge is not verified in Symfony.** Until a verified panel-session identity endpoint exists, treat `GET /api/v1/auth/me` as the role source of truth and label any panel-bearer identity claims as unverified.

### OEM server API and same-origin views

| Method and path | Input and caller | Success |
| --- | --- | --- |
| `POST /api/v1/developer-panels/oem/activate` | PHP only, exact `Origin` and JSON `connection_key` for a bound installation | `200`, `data.installation_token` (`fpi_…`) |
| `GET /api/v1/developer-panels/oem/application` | PHP only, exact `Origin` and installation bearer | `200`, `data.application` with `public_id`, `name`, `slug`, and `status` |
| `GET /index.php?view=branding` | OEM browser, host-authenticated allowlisted viewer | `200`, `name`, `logo`, optional `favicon`, `accent`, `language`, `support` |
| `GET /index.php?view=application` | Same OEM viewer | `200`, `name` and `status` |
| `GET /index.php?brand=logo` or `?brand=favicon` | Same OEM viewer | `200`, stored PNG for the requested role |
| `GET /index.php?asset=…` | OEM browser, versioned allowlisted static bundle path | `200`, JavaScript or CSS from the active or previous release |

The PHP runtime returns `403` for a viewer without permitted identity. It returns `503` when an application response is unavailable or invalid. Assets are checked before the viewer identity. Only the allowed versioned JS and CSS paths are served through that route. [OEM controller][panel-controller] · [OEM service][oem-service] · [Runtime code](../installer/setup.php)

## Development workflow

1. **Trace the behavior.** Identify the deployed mode, then follow HTML or route entry point → consumer → PHP or Symfony controller → ownership service. Use the source links below when a separate repository owns the contract.
2. **Make the smallest compatible change.** For display changes, start in the relevant browser entry. For new OEM data, check existing backend fields, add only required fields to the PHP response, and update `src/oem.ts` in the same change. For permission or scope changes, enforce them in the owning server code and cover both allowed and rejected requests. A browser filter provides presentation only.
3. **Preserve deployed installations.** Existing static ZIPs and signed OEM installers can outlive the frontend that shipped with them. Check current contracts, nullable application binding, existing `state.json`, and reconnect behavior. When changing the installer archive layout, check both the Vite output and `panelStageRelease`'s exact path allowlist. Avoid new frontend dependencies without a concrete requirement.
4. **Verify the changed path.** Use the checks below. In a multi-repository PR, identify the backend contract and describe which components must deploy first. Report production status only from a live check or deployment evidence.
5. **Update the reference.** Change the relevant section in this handbook in the same PR when behavior changes. Keep README and AGENTS as entry points and link to the same section.

Use Node.js 24 and run the repository commands:

```sh
npm ci
npm run build
npm run build:oem
php -l installer/setup.php
```

### Docker development

Use Docker to exercise the customer UI and optional customer PHP API on localhost before push. Loopback is fail-closed: enable it only via local env (see [origin policy](#origin-policy-domain-and-localhost)).

| Command | What it runs | URL |
| --- | --- | --- |
| `npm run docker:dev` | Vite panel with live reload (`docker compose up panel`) | http://localhost:5173 |
| `npm run docker:preview` | Built static ZIP served by nginx | http://localhost:4173 |
| `npm run docker:customer` | Customer PHP readiness API | http://localhost:8080/api/health |
| `npm run docker:down` | Stop compose services | — |

```sh
# Vite: copy .env.example → .env (or .env.development.local) and set VITE_ALLOW_LOCALHOST_ORIGINS=true
docker compose up panel
# optional production-shaped image (never allows loopback HTTP)
docker build -t fonitas-self-hosted-panel .
docker run --rm -p 4173:80 fonitas-self-hosted-panel
```

For the customer API profile, copy [`customer/.env.example`](../customer/.env.example) to `customer/.env`, set `APP_ID`, `DOMAIN_TOKEN` (`fpi_…`), and `PANEL_ORIGIN`. For local UI use `PANEL_ORIGIN=http://localhost:5173` with `APP_ENV=development` and `PANEL_ALLOW_LOCALHOST=true`, then `chmod 600 customer/.env`. Compose also sets those two vars on the `customer` service. Without a valid `.env`, `/api/health` returns `503`.

Files: [`Dockerfile`](../Dockerfile), [`docker-compose.yml`](../docker-compose.yml), [`.dockerignore`](../.dockerignore).

| Change | Verify |
| --- | --- |
| Static UI or authentication | Build the static output, or use `npm run docker:dev` / `docker:preview`. Confirm the customer landing keeps login/register on-origin (no hosted redirect). Smoke-test pairing at `?setup=1` when needed. Confirm only `APP_END_USER` opens the customer home |
| Identity role mapping | Confirm `APP_END_USER` against [TenantRoleProvisioner][tenant-roles] and [RBAC][identity-rbac]. Do not add panel-only role names |
| Origin / API-key detection | Keep domain connection-key flow. Document any new application API-key contract against Symfony before coding consumers. Cover allowed loopback and rejected non-local HTTP in Symfony origin tests |
| OEM runtime or branding | Build the OEM output. Use a signed test release and a PHP site with trusted viewer identity. Verify an allowed viewer and an unlisted viewer, same-origin requests, and the intended display fields |
| Installer, state, or release | Check PHP syntax. In a disposable document root and private directory, exercise installation, failed verification, update confirmation and rollback. Confirm that branding and access settings survive the update |
| Hosted admin changes | Update or run the [hosted Custom Domains browser tests][hosted-tests] in the hosted repository |
| Symfony API or permission changes | Use the [backend database runbook][backend-db] for test services and run [DeveloperPanelControllerTest][backend-tests]. Cover the legitimate installation and behavior with an incorrect origin, another application's scope, and a revoked or reassigned credential as relevant |

[package.json](../package.json) defines the build commands. The local Vite dev server previews the frontend; the hosted sign-in flow requires a registered HTTPS origin and the OEM JSON views require PHP.

## Operations

### Temporary automatic deployment to Infrasible

[Deploy Infrasible dashboard test](../.github/workflows/deploy-infrasible-test.yml) uploads the customer PHP readiness service via FTPS after a push to `main`. It uses a separate GitHub environment and upload state from the Infrasible website. It is disabled until the repository variable `INFRASIBLE_TEST_DEPLOY_ENABLED` is `true`.

1. Create a dedicated FTPS account whose home is the dashboard test application directory. Use a fresh directory outside other public web roots and keep the previous dashboard document root for rollback. The workflow uploads relative to the account's home.
2. On the host, put the private `.env` in that application directory using the [customer configuration](#customer-only-php-backend). Configure the dashboard virtual host's document root as the directory's `public/` subdirectory. The checked-in Apache rewrite sends `/api/health` to `index.php`. Use PHP 8.2 or later with cURL and enable Apache-compatible rewrite support for that directory.
3. In the repository, create the `infrasible-dashboard-test` environment and add `DASHBOARD_FTPS_SERVER`, `DASHBOARD_FTPS_USERNAME`, and `DASHBOARD_FTPS_PASSWORD` as environment secrets. Use the provider's hostname that matches the FTPS certificate. Set the repository variable to `true`. Open **Actions → Deploy Infrasible dashboard test** and run it from `main` with **dry_run** before the first upload.
4. Run the workflow without **dry_run**. It verifies `https://dashboard.infrasible.com/api/health`. This deployment currently serves only the readiness endpoint. Switching the document root makes the previous dashboard page unavailable on that domain until you restore its root or deploy the customer frontend.

The upload contains the three PHP files and the public rewrite configuration. Keep `.env` on the host. To stop automatic deployments after the test, set `INFRASIBLE_TEST_DEPLOY_ENABLED` to `false` or remove it. To revert the site, separately restore its previous document root.

### Install the static ZIP

1. Download and extract the [static ZIP][static-zip]. Put `index.html` and `assets/` directly at the root of the HTTPS domain.
2. In [Custom Domains][custom-domains], select the organization and submit the panel's HTTPS address. Select **Show connection key** and copy it.
3. Open the custom domain with `?setup=1` and paste the key into **Connect to Fonitas**. Return to the customer landing and use the on-page **Sign in** or **Register** forms (no hosted redirect).
4. For updates, replace the build in the same document root. The existing domain connection is held in Symfony.

### Install the PHP OEM dashboard

1. Download `setup.php` and copy [`installer/panel.env.example`](../installer/panel.env.example) to `.env` in the document root of a dedicated HTTPS site (PHP 8.2+, cURL, ZIP, OpenSSL). PHP must be able to write the document root and a private data directory. Prefer denying public reads of `.env` (setup writes an Apache deny rule into `.htaccess` when missing).
2. In [Custom Domains][custom-domains], request the exact origin with the intended application. Put the connection key in `PANEL_CONNECTION_KEY`, and set `PANEL_ADMIN_USER` / `PANEL_ADMIN_PASSWORD` (16+ characters) in `.env`.
3. Open `/setup.php` and choose **Install latest dashboard from .env**. PHP downloads the signed OEM release, unzips it, creates `index.php`, and activates Fonitas. Sign in later with the same `.env` username and password — that session opens both `/setup.php` and the dashboard. No cPanel Directory Privacy / `REMOTE_USER` list is required.
4. Optional: set `PANEL_BRAND_NAME`, `PANEL_LANGUAGE`, `PANEL_ACCENT`, `PANEL_SUPPORT_URL` before install, or edit branding after login. Clear `PANEL_CONNECTION_KEY` after a successful install. Keep `setup.php` for updates and reconnect.

| Configuration | Owner and behavior |
| --- | --- |
| `.env` | Document-root file. Source of `PANEL_ADMIN_USER`, `PANEL_ADMIN_PASSWORD`, optional `PANEL_CONNECTION_KEY` / branding / `PANEL_ORIGIN`. Required for install and login |
| `PANEL_DATA_DIR` | PHP environment override. Absolute path outside the document root, mode `0700`. Default: hidden sibling of the document root. Login sessions are stored under `$PANEL_DATA_DIR/sessions` |
| `PANEL_ORIGIN` | Optional exact origin when behind an HTTPS-terminating proxy |
| `APP_ENV` / `PANEL_ALLOW_LOCALHOST` | Fail-closed loopback gates for local development only |
| `state.json` | Private installer state: origin, password hash fallback, installation credential, branding, active/previous release ids |

The management page automatically checks the signed release manifest when an administrator opens it. It shows the installed version and any newer release. **Check again** refreshes the result. The ZIP is downloaded only after the administrator selects **Install version**. If the release or installed version changes before confirmation, review the new result and confirm again. Use **Restore previous version** to roll back a successful update. The update replaces the dashboard bundle. To update an older copy of the PHP installer itself, replace `setup.php` with the one from the published assets.

For an expired key or an older request without a key, select **Get connection key** on its installation row.

### Troubleshoot the PHP OEM dashboard

| Symptom | What to check |
| --- | --- |
| The installer rejects the connection key | In **Custom Domains**, check the exact HTTPS origin and the application binding. Generate a new key if the previous key has expired or been used. |
| The logo upload asks for a PNG within the limits | Logo must be PNG (1 MiB, 2048 × 2048). Favicon may be PNG or ICO (64 KiB, 256 × 256). Both are optional and can be set later on `/setup.php`. Replace signed `setup.php` from the latest release if the form still says “Favicon PNG” only. |
| `/` shows setup login instead of customer login / register | Install a release that packages the customer shell and serves `/` publicly (v0.4.22+). Admin login belongs only on `/setup.php`. Use **Download and install** after replacing signed `setup.php`. |
| Admin needs updates / branding | Open `/setup.php` and sign in with `PANEL_ADMIN_USER` / `PANEL_ADMIN_PASSWORD` from `.env`. |
| Sign-in says the form expired / cookies were blocked | Confirm `PANEL_ORIGIN` matches the browser HTTPS address. Clear site cookies or use a private window, reload once, then retry. Replace `setup.php` with the latest release asset so sessions use the private data directory and double-submit CSRF. |
| Sign-in rejects username / password | `PANEL_ADMIN_PASSWORD` must be 16–72 characters in document-root `.env`. Prefer unquoted values. The page error now reports whether the username or password length mismatches `.env`. Document-root `.env` overrides empty host env vars. |
| Update check unavailable / unsigned installer | Document-root `setup.php` must be the **release asset** (public key embedded). Do not upload `installer/setup.php` from git. Download `setup.php` from the latest GitHub release, replace the file, sign in, then **Check again** / **Download and install**. |
| The dashboard opens and the application is unavailable | Check the installation credential, application binding, and backend response. [OEM service][oem-service] |

Dashboard and setup share one PHP session after `.env` login. Updates use **Download and install** on `/setup.php` (signed GitHub release). Reconnect only when Custom Domains issues a new `fpk_` key. [PHP runtime and settings](../installer/setup.php)

### Resume OEM customer sign-in work

The last reported check on `dashboard.infrasible.com` showed the PHP viewer guard's `403` after `v0.3.5` was published. The host's authenticated identity and successful dashboard access have not been confirmed.

Continue from the [customer PHP foundation](#customer-only-php-backend). Start with [customer registration from the app site](#first-milestone-customer-registration-from-the-app-site). Then add the Symfony contract that checks both the signed-in buyer and the application bound to the installation. Then wire the PHP routes and build the customer frontend. Verify that an entitled buyer can sign in and see their purchases and licenses, and that other buyers and applications stay isolated. The existing organization-member sign-in is for the developer dashboard. The existing buyer-purchase route authenticates the buyer but does not apply the OEM installation's app binding. [Organization session service][sessions] · [Buyer purchases API](https://github.com/gemvc/symfony_fonitas/blob/main/src/License/Presentation/Http/Rest/BuyerPurchasesController.php)

## Releases

Every push to `main`, including a merged pull request, starts the [release workflow](../.github/workflows/release.yml) for the pushed head commit. [VERSION](../VERSION) sets the base version. CI increases its patch number by the number of first-parent commits since the base was set or automatic versioning was introduced, whichever is later. A push with several commits publishes one version for its final commit. Re-running a commit keeps its version. To start a new major or minor series, update the base in `VERSION`, `package.json`, and `package-lock.json` together. ([Version resolver](../scripts/resolve-release-version.sh))

CI applies the calculated version in its build workspace. The static ZIP includes a `VERSION` file and the OEM installer uses the same version in its signed manifest. CI stores the static ZIP as an Actions artifact before OEM signing. After both builds and signing succeed, the same run creates the matching tag if it is missing and publishes the Release. A tag already pointing to another commit stops publication. An existing complete release is preserved.

Use **Actions → Publish self-hosted panel ZIP → Run workflow** on `main` to retry the current commit. A manual tag must match the calculated version on the tagged commit. The workflow publishes these assets together:

| Asset | Purpose |
| --- | --- |
| `fonitas-self-hosted-panel.zip` | Static ZIP |
| `setup.php` | PHP installer and manager with the public verification key and minimum version embedded |
| `oem-release.json` | Signed manifest containing the release version and SHA-256 of the OEM ZIP |
| `panel-oem.zip` | OEM dashboard files downloaded by PHP |

Configure the GitHub Actions repository secret `OEM_RELEASE_SIGNING_KEY` with a securely backed-up RSA private key in PEM format of at least 3072 bits. Reuse the key for compatible updates. If it changes, replace the installed `setup.php` with one generated from the trusted release while preserving the private directory. PHP verifies the signature and ZIP digest before staging an update. A successful switch retains the previous installed version for rollback. [Signing implementation](../installer/sign-release.mjs) · [Installer, `panelLatestRelease`, `panelStageRelease`, and `panelAction`](../installer/setup.php)

For an OEM rollout, deploy Symfony with the [Organization migration][migration] before depending on the new portal or installer routes. Deploy the hosted developer portal for application assignment and key management. Verify the required assets on the [published release][releases]. A merge or a value in `VERSION` confirms the repository state. Published assets and live behavior require separate verification.

## Source of truth

| Fact | Verify against |
| --- | --- |
| Target customer and developer experience | [Product direction for the OEM dashboard](#product-direction-for-the-oem-dashboard) |
| Application-tenant role keys and default permissions | [TenantRoleProvisioner][tenant-roles], [Identity RBAC][identity-rbac], [roles.ts](../src/roles.ts) |
| Allowed installation origins (domain / localhost) | [origin.ts](../src/origin.ts), [panelOrigin](../installer/setup.php), [Installation](../customer/src/Installation.php), Symfony [DeveloperPanelOriginPolicy][panels] |
| Application API key for software detection | Planned — verify Symfony producer before documenting fields |
| Support ticket assign permission | [Support domain][support-domain], permission `support.ticket.assign` |
| Routes, DTOs, response envelopes, and allowed browser origins | [Symfony panel controller][panel-controller], [session controller][session-controller], [CORS subscriber][cors] |
| Installation keys and lifecycle | [DeveloperPanels][panels], [backend Organization reference][backend-organization] |
| Browser user tokens and validity | [DeveloperPanelSessions][sessions] |
| Identity session roles and permissions | [GET /api/v1/auth/me][identity-rbac] |
| OEM activation, binding, and application ownership | [OemDeveloperPanel][oem-service], [DeveloperPanelApplications][panel-applications], [Organization migration][migration] |
| Actual payloads sent and fields consumed | [hosted settings][hosted-domains], [hosted consent][hosted-consent], [static client](../src/panel-login.ts), [workspace](../src/workspace.tsx), [OEM PHP](../installer/setup.php), [OEM browser client](../src/oem.ts) |
| Build commands, publishing logic, and current downloads | [package.json](../package.json), [release workflow](../.github/workflows/release.yml), [GitHub Releases][releases] |

When sources disagree, inspect producer and consumer at the relevant Git refs and record which ref or release you verified. If a repository or live environment is unavailable, identify the specific unverified behavior. Do not infer an endpoint or payload from a UI label, staged change, package version, or deployment expectation.

[hosted-domains]: https://github.com/gemvc/Fonitas-developer-panel/blob/main/src/app/publisher/custom-domains-page.tsx
[hosted-consent]: https://github.com/gemvc/Fonitas-developer-panel/blob/main/src/app/pairing/hosted-panel-consent.tsx
[hosted-tests]: https://github.com/gemvc/Fonitas-developer-panel/blob/main/tests/browser/custom-domains.spec.ts
[panel-controller]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Presentation/Http/Rest/DeveloperPanel/DeveloperPanelController.php
[session-controller]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Presentation/Http/Rest/DeveloperPanel/DeveloperPanelSessionsController.php
[cors]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Shared/Infrastructure/Http/CorsSubscriber.php
[panels]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Application/DeveloperPanel/DeveloperPanelOriginPolicy.php
[sessions]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Application/DeveloperPanel/DeveloperPanelSessions.php
[oem-service]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Application/DeveloperPanel/OemDeveloperPanel.php
[panel-applications]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Application/DeveloperPanel/DeveloperPanelApplications.php
[migration]: https://github.com/gemvc/symfony_fonitas/blob/main/migrations/organization/Version20261120150000.php
[backend-organization]: https://github.com/gemvc/symfony_fonitas/blob/main/docs/domains/organization.md#self-hosted-developer-panels
[backend-db]: https://github.com/gemvc/symfony_fonitas/blob/main/docs/03-database-operations.md
[backend-tests]: https://github.com/gemvc/symfony_fonitas/blob/main/tests/Organization/Presentation/Http/Rest/DeveloperPanelControllerTest.php
[tenant-roles]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Identity/Application/Role/TenantRoleProvisioner.php
[identity-rbac]: https://github.com/gemvc/symfony_fonitas/blob/main/docs/frontend/Identity/rbac.md
[support-domain]: https://github.com/gemvc/symfony_fonitas/blob/main/docs/domains/support.md
[custom-domains]: https://developerpannel.fonitas.com/settings/custom-domains
[releases]: https://github.com/gemvc/fonitas-self-hosted-panel/releases
[static-zip]: https://github.com/gemvc/fonitas-self-hosted-panel/releases/latest/download/fonitas-self-hosted-panel.zip
