# Fonitas Self-Hosted Developer Panel

Run a **customer-only** dashboard on your own domain or, during local development, on localhost. The [product direction](docs/engineering.md#product-direction-for-the-oem-dashboard) is a branded panel for one registered application’s buyers (`APP_END_USER`).

Installation binding keeps the **domain connection key**. An **application API key** will identify the software once the Symfony contract is verified. Loopback origins are fail-closed (env + development runtime); production builds never allow them. See [installation detection](docs/engineering.md#installation-detection-api-key-and-domain) and [origin policy](docs/engineering.md#origin-policy-domain-and-localhost).

## Install or update

- [Static ZIP instructions](docs/engineering.md#install-the-static-zip) · [Download the latest stable ZIP](https://github.com/gemvc/fonitas-self-hosted-panel/releases/latest/download/fonitas-self-hosted-panel.zip)
- [Published versions and assets](https://github.com/gemvc/fonitas-self-hosted-panel/releases)

## Branded PHP dashboard

[PHP installer, hosting requirements, and identity setup](docs/engineering.md#install-the-php-oem-dashboard) · [Troubleshoot viewer access](docs/engineering.md#troubleshoot-the-php-oem-dashboard)

## Customer PHP backend

[Configure the customer-only backend and check the application binding](docs/engineering.md#customer-only-php-backend). The source checkout contains the readiness route. Customer sign-in and purchase and license views are planned.

## Build

[Engineering handbook](docs/engineering.md) · [Development and verification](docs/engineering.md#development-workflow) · [Agent entry point](AGENTS.md)

## Docker (local test before push)

```sh
npm run docker:dev        # Vite UI → http://localhost:5173
npm run docker:preview    # nginx build preview → http://localhost:4173
npm run docker:customer   # PHP /api/health → http://localhost:8080
npm run docker:down
```

Details: [Docker development](docs/engineering.md#docker-development).

## Release

[Release requirements and signing](docs/engineering.md#releases)
