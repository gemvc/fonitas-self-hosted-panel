# Fonitas Self-Hosted Developer Panel

Install the Fonitas developer application list at the root of your own HTTPS domain or subdomain.

- [Download the latest stable ZIP](https://github.com/gemvc/fonitas-self-hosted-panel/releases/latest/download/fonitas-self-hosted-panel.zip)
- [Versions and release notes](https://github.com/gemvc/fonitas-self-hosted-panel/releases)

## Install or update

1. Download and extract the ZIP into the document root of your HTTPS domain. The extracted `index.html` and `assets/` directory belong directly at the root.
2. For a new domain, open [Custom Domains in Fonitas](https://developerpannel.fonitas.com/settings/custom-domains), select the organization, and request the exact HTTPS origin.
3. After Fonitas issues a connection key, select **Show connection key** and **Copy key** on the installation row. Open your domain and paste it into **Connect to Fonitas**. The key is single-use and expires after 15 minutes.
4. Select **Sign in with Fonitas** on your domain. Sign in on Fonitas and confirm the organization. The application list then opens on your domain.

For an already connected domain, update the files in the same document root and sign in. The connection is stored in Fonitas and survives a file update. The current build displays the organization's applications and their statuses. Use the hosted panel for application changes. **Sign out** ends the session on this domain. The existing Fonitas account session can be used when you choose to sign in again.

## Build

Install Node.js 24 and run:

```bash
npm ci
npm run build
```

Serve the contents of `dist/` at the root of the registered HTTPS origin. The bundle contains no account credentials or installation keys.

## Release

Update `VERSION` and the package version in `package.json` and `package-lock.json`. After those changes are on `main`, push a matching stable tag such as `v0.2.9`. The release workflow builds the frontend and attaches `fonitas-self-hosted-panel.zip` to the tagged release.
