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

## Branded PHP dashboard

The OEM dashboard shows one application. Upload the release asset
[setup.php](https://github.com/gemvc/fonitas-self-hosted-panel/releases/latest/download/setup.php)
to the document root of a dedicated HTTPS site with PHP 8.2+, cURL, ZIP, and OpenSSL.
Configure the web server to use `index.php` as the directory index. On an existing static
installation, move `index.html` out of the document root first. PHP needs write access to
create `index.php`. Keep `setup.php` on the site for management.

In Custom Domains in the developer portal, request the HTTPS origin for the application.
For an existing installation, assign its application in Custom Domains. Once the operator
issues the connection key, open `/setup.php`, paste the key, and set a separate management
password. The setup page installs the latest signed OEM dashboard. It also manages brand
name, logo, language, support link, permitted identities, updates, and rollback.

The PHP worker stores configuration, the installation credential, and releases in a
private directory outside the document root. Set `PANEL_DATA_DIR` to an absolute path
owned by the PHP worker with mode 0700 if the default sibling directory cannot be
created. The directory must not be mapped under any public web route. Behind an HTTPS
terminating proxy, set `PANEL_ORIGIN` to the exact HTTPS origin and restrict direct access
to the PHP origin server. Keep the private directory across deployments.

The OEM dashboard uses the site's own authentication. Configure the web server or its
authentication module to provide the authenticated account to PHP as the
`REMOTE_USER` server variable for both the root page and `/index.php`. Never map an
untrusted request header to that variable. Add the permitted identities in `/setup.php`.
An empty list denies access. The dashboard shows the authorized users the application's
name and status. Other functions of the developer portal use their existing login.

### Publishing OEM releases

Configure the repository Actions secret `OEM_RELEASE_SIGNING_KEY` with the PEM of a
dedicated RSA private key of at least 3072 bits. Back it up securely. The release job
embeds its public key in the generated `setup.php`; subsequent releases must use the
same signing key for existing installations to accept their manifests. If the key
changes, distribute the new signed-release installer through a trusted channel and
replace `setup.php` on each installation. Keep managing the same private data directory.
The installer verifies the signed manifest and the ZIP digest before activation. The
release also retains the existing static ZIP.
