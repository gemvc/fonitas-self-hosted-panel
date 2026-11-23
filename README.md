# Fonitas Self-Hosted Developer Panel

Run a software dashboard on your own domain or, during development, on localhost. The [product direction](docs/engineering.md#product-direction-for-the-oem-dashboard) is a **customer-first** branded panel for one registered application (`APP_END_USER`), with purchases and licenses for signed-in customers.

Installation binding keeps the **domain connection key**. An **application API key** will identify the software once the Symfony contract is verified. Development allows HTTPS domains and localhost; production lock-down rejects localhost. See [installation detection](docs/engineering.md#installation-detection-api-key-and-domain) and [origin policy](docs/engineering.md#origin-policy-domain-and-localhost).

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
