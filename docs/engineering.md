# Self-hosted developer panel engineering handbook

This handbook is the repository's reference for architecture, API discovery, development, and operations. The implementation owns executable behavior. Follow the source links to verify details before using this document to design a change.

## Start here

| Task | Owning component | Entry point |
| --- | --- | --- |
| Change the static ZIP dashboard, pairing, or Fonitas sign-in | This repository, React and TypeScript | [index.html](../index.html), [main.tsx](../src/main.tsx), [panel-login.ts](../src/panel-login.ts) |
| Change OEM branding or the application summary | This repository, HTML and TypeScript | [oem.html](../oem.html), [oem.ts](../src/oem.ts), shared [styles.css](../src/styles.css) |
| Change OEM setup, configuration, access, or updates | This repository, server-side PHP | [installer/setup.php](../installer/setup.php), especially `panelAction`, `panelRuntime`, and `panelRelease` |
| Change the organization admin's domain workflow | Hosted developer portal | [Custom Domains page][hosted-domains] |
| Change hosted sign-in consent or return to the custom domain | Hosted developer portal and Symfony | [Hosted consent][hosted-consent], [session controller][session-controller] |
| Change a route, credential, permission, or application scope | Symfony Organization module | [Developer panel controller][panel-controller], [session controller][session-controller], [services](#source-of-truth) |
| Change a downloadable release asset | This repository, GitHub Actions | [release.yml](../.github/workflows/release.yml), [sign-release.mjs](../installer/sign-release.mjs) |

## Purpose and architecture

The dashboard gives software developers and authorized viewers a read-only view of application status on a custom domain. It has two distributions that share CSS and release automation. The hosted developer portal owns organization administration, domain requests, and application changes. Symfony owns application data, installation binding, and Fonitas authorization.

| | Static ZIP | Branded PHP dashboard (OEM) |
| --- | --- | --- |
| Build and entry | `npm run build` → `dist/index.html` → `src/main.tsx` | `npm run build:oem` → `dist-oem/oem.html` → `src/oem.ts`. The installer creates the installed site's `index.php` |
| Identity | User signs in via the hosted Fonitas portal and approves the organization | The host authenticates the viewer and passes the trusted `REMOTE_USER` server variable. PHP checks the local allowlist |
| Browser requests | Browser calls the Symfony panel API without cookies. Data reads use a short-lived panel bearer | Browser calls the site's own PHP runtime. PHP calls Symfony with an installation credential |
| Application scope | An unbound installation lists applications in its organization. A bound installation lists only its selected application | One application selected in Custom Domains and enforced by Symfony |
| Operator and viewer | Organizations manage domains and keys in the hosted portal. Active organization members can use static sign-in | An administrator uses the hosted portal for domain binding and a separate local management password for `/setup.php`. Viewers use the site's own authentication |

`SoftwareApplication` represents the software shown in the dashboard. The binding uses its public UUID. Application name and status come from Symfony. OEM brand name, logo, accent, language, support URL, and permitted viewers are local configuration. The dashboard has no application editing, release publishing, or customer licensing API.

### Static trust flow

1. A hosted organization admin requests an exact custom HTTPS origin. A Fonitas operator issues a single-use connection key, valid for 15 minutes. The installation is stored in Symfony and survives frontend replacement. [Installation lifecycle][panels]
2. The static UI submits the key to the pairing endpoint. The browser supplies its origin. Pairing acknowledges a connected installation, while user sign-in remains a separate step. [Static pairing UI](../src/main.tsx)
3. The browser generates a state and a verifier, stores them in tab session storage, and sends the hex SHA-256 challenge to the hosted consent page. After consent, Symfony returns a URL on the registered origin with the one-time code and state in the fragment. The static client clears the fragment, validates state, and exchanges the code with the verifier. The code lasts 60 seconds. The panel bearer lasts 900 seconds and stays in memory. [Static sign-in client](../src/panel-login.ts) · [Session service][sessions]
4. Data access is scoped by the bearer, request origin, active installation, active Fonitas Identity session, and active organization membership. Signing out revokes the panel bearer and leaves the hosted Fonitas session available for a later sign-in. [Session service][sessions] · [Static UI](../src/main.tsx)

### OEM trust flow

1. The hosted admin selects a software application for the domain. Symfony validates that it belongs to the selected organization. The operator issues a connection key for the installation. PHP redeems it from the installed site and stores the installation credential. Symfony stores its hash. [Custom Domains page][hosted-domains] · [OEM service][oem-service]
2. The web server's authentication layer sets `REMOTE_USER`. PHP allows the HTML and JSON views only for exact identities listed by the installer admin. Setup uses its own origin-bound PHP session, management password hash, and form CSRF token. An empty viewer list denies access. Never derive `REMOTE_USER` from an untrusted browser header. [Installer, `panelSession` and `panelRuntime`](../installer/setup.php)
3. PHP uses the stored exact origin and credential to read the bound application. Symfony checks the active organization and resolves ownership from the installation, regardless of any browser-supplied application identifier. PHP exposes only the fields used by the UI. Reassignment clears credentials and panel sessions. Revocation removes the installation. [OEM service][oem-service] · [Application ownership and summary][panel-applications] · [Installer runtime](../installer/setup.php)

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

### OEM server API and same-origin views

| Method and path | Input and caller | Success |
| --- | --- | --- |
| `POST /api/v1/developer-panels/oem/activate` | PHP only, exact `Origin` and JSON `connection_key` for a bound installation | `200`, `data.installation_token` (`fpi_…`) |
| `GET /api/v1/developer-panels/oem/application` | PHP only, exact `Origin` and installation bearer | `200`, `data.application` with `public_id`, `name`, `slug`, and `status` |
| `GET /index.php?view=branding` | OEM browser, host-authenticated allowlisted viewer | `200`, `name`, `logo`, `accent`, `language`, `support` |
| `GET /index.php?view=application` | Same OEM viewer | `200`, `name` and `status` |
| `GET /index.php?asset=…` | OEM browser, versioned allowlisted static bundle path | `200`, JavaScript or CSS from the active or previous release |

The PHP runtime returns `403` for a viewer without permitted identity. It returns `503` when an application response is unavailable or invalid. Assets are checked before the viewer identity. Only the allowed versioned JS and CSS paths are served through that route. [OEM controller][panel-controller] · [OEM service][oem-service] · [Runtime code](../installer/setup.php)

## Development workflow

1. **Trace the behavior.** Identify the deployed mode, then follow HTML or route entry point → consumer → PHP or Symfony controller → ownership service. Use the source links below when a separate repository owns the contract.
2. **Make the smallest compatible change.** For display changes, start in the relevant browser entry. For new OEM data, check existing backend fields, add only required fields to the PHP response, and update `src/oem.ts` in the same change. For permission or scope changes, enforce them in the owning server code and cover both allowed and rejected requests. A browser filter provides presentation only.
3. **Preserve deployed installations.** Existing static ZIPs and signed OEM installers can outlive the frontend that shipped with them. Check current contracts, nullable application binding, existing `state.json`, and reconnect behavior. When changing the installer archive layout, check both the Vite output and `panelRelease`'s exact path allowlist. Avoid new frontend dependencies without a concrete requirement.
4. **Verify the changed path.** Use the checks below. In a multi-repository PR, identify the backend contract and describe which components must deploy first. Report production status only from a live check or deployment evidence.
5. **Update the reference.** Change the relevant section in this handbook in the same PR when behavior changes. Keep README and AGENTS as entry points and link to the same section.

Use Node.js 24 and run the repository commands:

```sh
npm ci
npm run build
npm run build:oem
php -l installer/setup.php
```

| Change | Verify |
| --- | --- |
| Static UI or authentication | Build the static output. Smoke-test exact-origin pairing, hosted consent and callback, application list, sign-out confirmation and retry on an HTTPS test site |
| OEM runtime or branding | Build the OEM output. Use a signed test release and a PHP site with trusted viewer identity. Verify an allowed viewer and an unlisted viewer, same-origin requests, and the intended display fields |
| Installer, state, or release | Check PHP syntax. In a disposable document root and private directory, exercise installation, failed verification, update and rollback. Confirm that branding and access settings survive the update |
| Hosted admin changes | Update or run the [hosted Custom Domains browser tests][hosted-tests] in the hosted repository |
| Symfony API or permission changes | Use the [backend database runbook][backend-db] for test services and run [DeveloperPanelControllerTest][backend-tests]. Cover the legitimate installation and behavior with an incorrect origin, another application's scope, and a revoked or reassigned credential as relevant |

[package.json](../package.json) defines the build commands. The local Vite dev server previews the frontend; the hosted sign-in flow requires a registered HTTPS origin and the OEM JSON views require PHP.

## Operations

### Install the static ZIP

1. Download and extract the [static ZIP][static-zip]. Put `index.html` and `assets/` directly at the root of the HTTPS domain.
2. In [Custom Domains][custom-domains], select the organization and request the exact HTTPS origin. After an operator issues the key, select **Show connection key** and copy it.
3. Paste the key into **Connect to Fonitas** on the custom domain. Select **Sign in with Fonitas**, sign in, and confirm the organization.
4. For updates, replace the build in the same document root. The existing domain connection is held in Symfony.

### Install the PHP OEM dashboard

1. Check the [published release assets][releases] for `setup.php`. Upload that generated installer to the document root of a dedicated HTTPS site with PHP 8.2 or later, cURL, ZIP, and OpenSSL. Configure `index.php` as the directory index. For a migration from static hosting, move the previous `index.html` outside the document root before setup. PHP must be able to create `index.php`.
2. In [Custom Domains][custom-domains], request the exact origin with the intended application, or assign the application to the existing installation. After the operator issues the connection key, open `/setup.php`, paste the key, and choose a separate management password. Keep `setup.php` for settings, reconnect, and updates.
3. Set the brand, language, and exact permitted user identities. Configure the site's authentication module to provide `REMOTE_USER` for both the root and `/index.php`. Confirm that the authorized viewer gets the intended app and another identity receives a denial.

| Configuration | Owner and behavior |
| --- | --- |
| `PANEL_DATA_DIR` | PHP environment override. Use an absolute path outside the document root, owned by the PHP worker, with mode `0700`. By default, PHP uses a hidden sibling of the document root. Keep this directory across deployments and outside all public web mappings |
| `PANEL_ORIGIN` | PHP environment override for an HTTPS-terminating proxy. Set the exact origin and restrict direct access to the PHP origin server |
| `state.json` | Installer-owned private state. Holds origin, management password hash, the installation credential, branding, permitted identities, and active and previous versions. Setup writes it atomically. Change settings through the management page |
| `REMOTE_USER` | Trusted identity supplied by the site's web-server authentication module. Matching against the private list is exact |

Operators use the [backend production runbook][key-operations] to issue a key.

**Troubleshooting.** A rejected key can be expired, already consumed, issued for another origin, or missing the app binding required for OEM. Use the Custom Domains request or reconnect flow and the current key. A viewer's `403` calls for checking the web-server identity and the exact allowlist value. If a viewer can load the shell but the application is unavailable, check the installation credential, binding, and backend deployment. [Installer](../installer/setup.php) · [OEM service][oem-service]

## Releases

Bump [VERSION](../VERSION) as well as the matching versions in [package.json](../package.json) and [package-lock.json](../package-lock.json), then merge to `main`. A push that changes `VERSION` on `main` starts the [release workflow](../.github/workflows/release.yml). CI builds the static ZIP from that exact commit and stores it as an Actions artifact before signing the OEM bundle.

After both builds and OEM signing succeed, the same run creates the matching `vX.Y.Z` tag if it is missing and publishes the GitHub Release. An existing tag must point to the commit being packaged. An existing complete release is preserved. A matching manual tag push from `main` history also works. To release a version already on `main`, use **Actions → Publish self-hosted panel ZIP → Run workflow** on `main`. The workflow publishes these assets together:

| Asset | Purpose |
| --- | --- |
| `fonitas-self-hosted-panel.zip` | Static ZIP |
| `setup.php` | PHP installer and manager with the public verification key and minimum version embedded |
| `oem-release.json` | Signed manifest containing the release version and SHA-256 of the OEM ZIP |
| `panel-oem.zip` | OEM dashboard files downloaded by PHP |

Configure the GitHub Actions repository secret `OEM_RELEASE_SIGNING_KEY` with a securely backed-up RSA private key in PEM format of at least 3072 bits. Reuse the key for compatible updates. If it changes, replace the installed `setup.php` with one generated from the trusted release while preserving the private directory. PHP verifies the signature and ZIP digest before staging an update. A successful switch retains the previous installed version for rollback. [Signing implementation](../installer/sign-release.mjs) · [Installer, `panelRelease` and `panelAction`](../installer/setup.php)

For an OEM rollout, deploy Symfony with the [Organization migration][migration] before depending on the new portal or installer routes. Deploy the hosted developer portal for application assignment and key management. Verify the required assets on the [published release][releases]. A merge or a value in `VERSION` confirms the repository state. Published assets and live behavior require separate verification.

## Source of truth

| Fact | Verify against |
| --- | --- |
| Routes, DTOs, response envelopes, and allowed browser origins | [Symfony panel controller][panel-controller], [session controller][session-controller], [CORS subscriber][cors] |
| Installation keys and lifecycle | [DeveloperPanels][panels], [backend Organization reference][backend-organization] |
| Browser user tokens and validity | [DeveloperPanelSessions][sessions] |
| OEM activation, binding, and application ownership | [OemDeveloperPanel][oem-service], [DeveloperPanelApplications][panel-applications], [Organization migration][migration] |
| Actual payloads sent and fields consumed | [hosted settings][hosted-domains], [hosted consent][hosted-consent], [static client](../src/panel-login.ts), [OEM PHP](../installer/setup.php), [OEM browser client](../src/oem.ts) |
| Build commands, publishing logic, and current downloads | [package.json](../package.json), [release workflow](../.github/workflows/release.yml), [GitHub Releases][releases] |

When sources disagree, inspect producer and consumer at the relevant Git refs and record which ref or release you verified. If a repository or live environment is unavailable, identify the specific unverified behavior. Do not infer an endpoint or payload from a UI label, staged change, package version, or deployment expectation.

[hosted-domains]: https://github.com/gemvc/Fonitas-developer-panel/blob/main/src/app/publisher/custom-domains-page.tsx
[hosted-consent]: https://github.com/gemvc/Fonitas-developer-panel/blob/main/src/app/pairing/hosted-panel-consent.tsx
[hosted-tests]: https://github.com/gemvc/Fonitas-developer-panel/blob/main/tests/browser/custom-domains.spec.ts
[panel-controller]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Presentation/Http/Rest/DeveloperPanel/DeveloperPanelController.php
[session-controller]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Presentation/Http/Rest/DeveloperPanel/DeveloperPanelSessionsController.php
[cors]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Shared/Infrastructure/Http/CorsSubscriber.php
[panels]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Application/DeveloperPanel/DeveloperPanels.php
[sessions]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Application/DeveloperPanel/DeveloperPanelSessions.php
[oem-service]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Application/DeveloperPanel/OemDeveloperPanel.php
[panel-applications]: https://github.com/gemvc/symfony_fonitas/blob/main/src/Organization/Application/DeveloperPanel/DeveloperPanelApplications.php
[migration]: https://github.com/gemvc/symfony_fonitas/blob/main/migrations/organization/Version20261120150000.php
[backend-organization]: https://github.com/gemvc/symfony_fonitas/blob/main/docs/domains/organization.md#self-hosted-developer-panels
[key-operations]: https://github.com/gemvc/symfony_fonitas/blob/main/docs/02-production-operations.md#issue-a-developer-panel-connection-key-manually
[backend-db]: https://github.com/gemvc/symfony_fonitas/blob/main/docs/03-database-operations.md
[backend-tests]: https://github.com/gemvc/symfony_fonitas/blob/main/tests/Organization/Presentation/Http/Rest/DeveloperPanelControllerTest.php
[custom-domains]: https://developerpannel.fonitas.com/settings/custom-domains
[releases]: https://github.com/gemvc/fonitas-self-hosted-panel/releases
[static-zip]: https://github.com/gemvc/fonitas-self-hosted-panel/releases/latest/download/fonitas-self-hosted-panel.zip
