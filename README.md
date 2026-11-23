# Fonitas Self-Hosted Developer Panel

Run a software dashboard on your own HTTPS domain. The [product direction](docs/engineering.md#product-direction-for-the-oem-dashboard) defines a branded customer dashboard for one registered application with purchases and licenses for signed-in customers.

Local workspace homes follow **existing Identity roles** seeded for application tenants: `APP_OWNER`, `APP_ADMIN`, and `APP_END_USER`. Support uses permission `support.ticket.assign`. See [local role workspaces](docs/engineering.md#local-role-workspaces-static-ui).

Current releases: the static ZIP uses Fonitas sign-in and role-based homes (identity bridge unverified). The branded PHP dashboard shows one bound application and uses the host's sign-in.

## Install or update

- [Static ZIP instructions](docs/engineering.md#install-the-static-zip) · [Download the latest stable ZIP](https://github.com/gemvc/fonitas-self-hosted-panel/releases/latest/download/fonitas-self-hosted-panel.zip)
- [Published versions and assets](https://github.com/gemvc/fonitas-self-hosted-panel/releases)

## Branded PHP dashboard

[PHP installer, hosting requirements, and identity setup](docs/engineering.md#install-the-php-oem-dashboard) · [Troubleshoot viewer access](docs/engineering.md#troubleshoot-the-php-oem-dashboard)

## Customer PHP backend

[Configure the customer-only backend and check the application binding](docs/engineering.md#customer-only-php-backend). The source checkout contains the readiness route. Customer sign-in and purchase and license views are planned.

## Build

[Engineering handbook](docs/engineering.md) · [Development and verification](docs/engineering.md#development-workflow) · [Agent entry point](AGENTS.md)

## Release

[Release requirements and signing](docs/engineering.md#releases)
