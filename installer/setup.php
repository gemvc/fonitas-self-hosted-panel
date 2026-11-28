<?php

declare(strict_types=1);

const PANEL_API = 'https://api.fonitas.com/api/v1/developer-panels/oem';
const PANEL_RELEASES = 'https://github.com/gemvc/fonitas-self-hosted-panel/releases';
const PANEL_MINIMUM_RELEASE = '__PANEL_MINIMUM_RELEASE__';
const PANEL_PUBLIC_KEY = '__PANEL_RELEASE_PUBLIC_KEY__';
const PANEL_INDEX = "<?php\ndefine('PANEL_RUNTIME', true);\nrequire __DIR__.'/setup.php';\n";
const PANEL_FILES = '~\A(?:oem\.html|assets/[A-Za-z0-9_-]+\.(?:css|js))\z~D';
function panelFail(int $status, string $message): never
{
    http_response_code($status);
    echo panelEscape($message);
    exit;
}

function panelEscape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/**
 * Values parsed from document-root `.env`. File values win over process env so
 * shared-hosting empty PANEL_* variables cannot block login.
 *
 * @var array<string, string>
 */
function panelEnvFile(): array
{
    static $values = null;
    if (is_array($values)) {
        return $values;
    }
    $values = [];
    $path = __DIR__.'/.env';
    if (!is_file($path) || !is_readable($path)) {
        return $values;
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        return $values;
    }
    if (str_starts_with($raw, "\xEF\xBB\xBF")) {
        $raw = substr($raw, 3);
    }
    foreach (preg_split('/\R/', $raw) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        if (str_starts_with($line, 'export ')) {
            $line = trim(substr($line, 7));
        }
        [$name, $value] = explode('=', $line, 2);
        $name = trim($name);
        if ($name === '' || !preg_match('/\A[A-Z][A-Z0-9_]*\z/', $name)) {
            continue;
        }
        $value = trim($value);
        if (
            (str_starts_with($value, '"') && str_ends_with($value, '"'))
            || (str_starts_with($value, "'") && str_ends_with($value, "'"))
        ) {
            $value = substr($value, 1, -1);
            $value = str_replace(['\\n', '\\r', '\\t', '\\"', "\\'", '\\\\'], ["\n", "\r", "\t", '"', "'", '\\'], $value);
        }
        $values[$name] = $value;
    }

    return $values;
}

/** Load document-root `.env` into putenv/$_ENV once. File values always win. */
function panelLoadEnv(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;
    foreach (panelEnvFile() as $name => $value) {
        putenv($name.'='.$value);
        $_ENV[$name] = $value;
        $_SERVER[$name] = $value;
    }
}

function panelEnv(string $name, string $default = ''): string
{
    panelLoadEnv();
    $file = panelEnvFile();
    if (array_key_exists($name, $file)) {
        return $file[$name];
    }
    $value = getenv($name);

    return is_string($value) && $value !== '' ? $value : $default;
}

/** @return array{user: string, password: string} */
function panelRequireAdminEnv(): array
{
    $user = trim(panelEnv('PANEL_ADMIN_USER'));
    // Password: keep exact .env value (no extra trim beyond file parse).
    $password = panelEnv('PANEL_ADMIN_PASSWORD');
    if ($user === '' || strlen($user) > 120 || !preg_match('/\A[\x21-\x7e]+\z/', $user)) {
        throw new RuntimeException('Set PANEL_ADMIN_USER in .env (printable username, max 120 characters).');
    }
    if (strlen($password) < 16 || strlen($password) > 72) {
        throw new RuntimeException('Set PANEL_ADMIN_PASSWORD in .env (16–72 characters). Current length: '.strlen($password).'.');
    }

    return ['user' => $user, 'password' => $password];
}

function panelEnvReady(): bool
{
    try {
        panelRequireAdminEnv();

        return true;
    } catch (RuntimeException) {
        return false;
    }
}

function panelIsAdmin(): bool
{
    return ($_SESSION['adminUntil'] ?? 0) >= time();
}

function panelRequireLoginRedirect(): never
{
    header('Location: /setup.php?next=/', true, 302);
    exit;
}

/** Block web downloads of `.env` when Apache allows `.htaccess`. */
function panelProtectEnvFile(): void
{
    $htaccess = __DIR__.'/.htaccess';
    if (is_file($htaccess) || is_link($htaccess)) {
        return;
    }
    @file_put_contents($htaccess, "<Files \".env\">\nRequire all denied\n</Files>\n");
}

/** Fail-closed: loopback only when APP_ENV is dev|development and PANEL_ALLOW_LOCALHOST is true. */
function panelAllowsLocalhost(): bool
{
    panelLoadEnv();
    $env = strtolower(panelEnv('APP_ENV', 'production'));
    $flag = strtolower(panelEnv('PANEL_ALLOW_LOCALHOST', 'false'));
    $dev = $env === 'dev' || $env === 'development';
    $enabled = in_array($flag, ['1', 'true', 'yes'], true);

    return $dev && $enabled;
}

function panelIsLoopbackHost(string $host): bool
{
    $normalized = str_starts_with($host, '[') ? substr($host, 1, -1) : $host;

    return $normalized === 'localhost' || $normalized === '127.0.0.1' || $normalized === '::1';
}

function panelRequestIsHttps(): bool
{
    if (in_array(strtolower((string) ($_SERVER['HTTPS'] ?? '')), ['on', '1'], true)) {
        return true;
    }
    $forwarded = strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''));

    return $forwarded === 'https' || str_starts_with($forwarded, 'https,');
}

function panelOrigin(): string
{
    panelLoadEnv();
    $https = panelRequestIsHttps();
    $authority = strtolower($_SERVER['HTTP_HOST'] ?? '');
    $authority = preg_replace($https ? '~:443\z~' : '~:80\z~', '', $authority) ?? $authority;
    $configured = panelEnv('PANEL_ORIGIN');
    if ($configured !== '') {
        $origin = $configured;
    } elseif ($https) {
        $origin = 'https://'.$authority;
    } elseif (panelAllowsLocalhost()) {
        $origin = 'http://'.$authority;
    } else {
        panelFail(400, 'Open this panel through its configured HTTPS address (or set PANEL_ORIGIN in .env).');
    }

    if (strlen($origin) > 268 || preg_match('~\A(https|http)://(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?\z~', $origin, $parts) !== 1) {
        panelFail(400, 'Open this panel through its configured HTTPS address.');
    }

    $scheme = $parts[1];
    $host = $parts[2];
    $port = isset($parts[3]) ? (int) $parts[3] : ($scheme === 'https' ? 443 : 80);
    $prefix = $scheme.'://';
    if (!str_starts_with($origin, $prefix) || substr($origin, strlen($prefix)) !== $authority) {
        panelFail(400, 'Open this panel through its configured HTTPS address.');
    }
    if ($scheme === 'http' && (!panelAllowsLocalhost() || !panelIsLoopbackHost($host))) {
        panelFail(400, 'Open this panel through its configured HTTPS address.');
    }
    if ($scheme === 'https' && !$https && $configured === '') {
        panelFail(400, 'Open this panel through its configured HTTPS address.');
    }

    $validHost = str_starts_with($host, '[')
        ? filter_var(substr($host, 1, -1), FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false
        : filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false;
    if (!$validHost || $port < 1 || $port > 65535) {
        panelFail(400, 'Open this panel through its configured HTTPS address.');
    }

    return $origin;
}

function panelDirectory(bool $create): string
{
    $root = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    if ($root !== __DIR__) {
        panelFail(503, 'Install setup.php in the document root of a dedicated HTTPS site.');
    }
    $path = getenv('PANEL_DATA_DIR') ?: dirname($root).'/.panel-'.substr(hash('sha256', $root), 0, 16);
    $parent = realpath(dirname($path));
    if ($parent === false || $parent === $root || str_starts_with($parent, $root.'/')
        || !preg_match('/\A[A-Za-z0-9_.-]+\z/', basename($path)) || in_array(basename($path), ['.', '..'], true)) {
        panelFail(503, 'Set PANEL_DATA_DIR to a private directory outside the document root.');
    }
    $path = $parent.'/'.basename($path);
    if (is_link($path) || (file_exists($path) && !is_dir($path))) {
        panelFail(503, 'The private data directory is invalid.');
    }
    if (!is_dir($path) && $create && !@mkdir($path, 0700) && !is_dir($path)) {
        panelFail(503, 'PHP needs write access to the private data directory. Set PANEL_DATA_DIR if necessary.');
    }
    if (is_dir($path) && (fileperms($path) & 0077) !== 0) {
        @chmod($path, 0700);
    }
    if (is_dir($path) && (fileperms($path) & 0077) !== 0) {
        panelFail(503, 'Restrict the private data directory to its owner (0700).');
    }

    return $path;
}

function panelState(string $directory): array
{
    $file = $directory.'/state.json';
    if (!is_file($file)) {
        return [];
    }
    $data = file_get_contents($file);
    $state = $data === false ? null : json_decode($data, true);
    if (!is_array($state) || !isset($state['origin'], $state['password'], $state['credential'], $state['branding'], $state['active'])) {
        panelFail(503, 'The dashboard configuration could not be read.');
    }

    return $state;
}

function panelSave(string $directory, array $state): void
{
    $temporary = tempnam($directory, '.state-');
    if ($temporary === false) {
        throw new RuntimeException('Could not create a configuration file.');
    }
    try {
        $data = json_encode($state, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        if (file_put_contents($temporary, $data) !== strlen($data) || !rename($temporary, $directory.'/state.json')) {
            throw new RuntimeException('Could not save the dashboard configuration.');
        }
    } finally {
        if (is_file($temporary)) {
            unlink($temporary);
        }
    }
}

/** @return array{int, string} */
function panelHttp(string $url, int $limit, array $headers = [], ?array $body = null, bool $redirects = false): array
{
    $curl = curl_init($url);
    if ($curl === false) {
        throw new RuntimeException('The remote service could not be reached.');
    }
    $data = '';
    curl_setopt_array($curl, [
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_FOLLOWLOCATION => $redirects,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_USERAGENT => 'PanelSetup',
        CURLOPT_WRITEFUNCTION => static function ($_handle, string $bytes) use (&$data, $limit): int {
            if (strlen($data) + strlen($bytes) > $limit) {
                return 0;
            }
            $data .= $bytes;

            return strlen($bytes);
        },
    ]);
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body, JSON_THROW_ON_ERROR));
    }
    $success = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    unset($curl);
    if ($success === false) {
        throw new RuntimeException('The remote service could not be reached.');
    }

    return [$status, $data];
}

function panelActivate(string $origin, #[SensitiveParameter] string $key): string
{
    if (!preg_match('/\Afpk_[0-9a-f]{64}\z/', $key)) {
        throw new RuntimeException('Enter the current one-time connection key.');
    }
    [$status, $body] = panelHttp(PANEL_API.'/activate', 8192, ['Origin: '.$origin, 'Content-Type: application/json'], ['connection_key' => $key]);
    $payload = json_decode($body, true);
    $token = is_array($payload) ? ($payload['data']['installation_token'] ?? '') : '';
    if ($status !== 200 || !is_string($token) || !preg_match('/\Afpi_[0-9a-f]{64}\z/', $token)) {
        throw new RuntimeException('Connection key rejected. Check that the domain is linked to an application and the key is current.');
    }

    return $token;
}

/** @return array{version: string, sha256: string} */
function panelLatestRelease(): array
{
    if (!str_contains(PANEL_PUBLIC_KEY, 'BEGIN PUBLIC KEY')) {
        throw new RuntimeException('This setup.php is unsigned (repo source). Upload setup.php from the GitHub release assets (not the installer/ folder in git), then use Check again.');
    }
    [$status, $envelope] = panelHttp(PANEL_RELEASES.'/latest/download/oem-release.json', 16384, redirects: true);
    $signed = json_decode($envelope, true);
    if (!is_array($signed)) {
        throw new RuntimeException('The release manifest could not be verified.');
    }
    $manifest = base64_decode(is_string($signed['manifest'] ?? null) ? $signed['manifest'] : '', true);
    $signature = base64_decode(is_string($signed['signature'] ?? null) ? $signed['signature'] : '', true);
    if ($status !== 200 || !$manifest || !$signature || openssl_verify($manifest, $signature, PANEL_PUBLIC_KEY, OPENSSL_ALGO_SHA256) !== 1) {
        throw new RuntimeException('The release manifest could not be verified.');
    }
    $release = json_decode($manifest, true);
    if (!is_array($release)) {
        throw new RuntimeException('The release manifest is invalid.');
    }
    $version = $release['version'] ?? '';
    $hash = $release['sha256'] ?? '';
    if (!is_string($version) || !preg_match('/\A(?:0|[1-9][0-9]{0,7})(?:\.(?:0|[1-9][0-9]{0,7})){2}\z/', $version)
        || !is_string($hash) || !preg_match('/\A[0-9a-f]{64}\z/', $hash)) {
        throw new RuntimeException('The release manifest is invalid.');
    }

    if (version_compare($version, PANEL_MINIMUM_RELEASE, '<')) {
        throw new RuntimeException('The release is older than this installer supports.');
    }

    return ['version' => $version, 'sha256' => $hash];
}

/** @param array{version: string, sha256: string} $release */
function panelStageRelease(string $directory, array $release): string
{
    ['version' => $version, 'sha256' => $hash] = $release;
    $id = $version.'-'.substr($hash, 0, 16);
    $target = $directory.'/'.$id;
    if (is_file($target.'/oem.html')) {
        return $id;
    }
    [$status, $archive] = panelHttp(PANEL_RELEASES.'/download/v'.$version.'/panel-oem.zip', 8 * 1024 * 1024, redirects: true);
    if ($status !== 200 || !hash_equals($hash, hash('sha256', $archive))) {
        throw new RuntimeException('The downloaded dashboard package could not be verified.');
    }
    $temporary = $directory.'/.stage-'.bin2hex(random_bytes(10));
    if (!mkdir($temporary, 0700)) {
        throw new RuntimeException('Could not prepare the release directory.');
    }
    $zip = new ZipArchive();
    $opened = false;
    try {
        $path = $temporary.'/download.zip';
        if (file_put_contents($path, $archive) !== strlen($archive) || $zip->open($path, ZipArchive::RDONLY) !== true) {
            throw new RuntimeException('The downloaded dashboard package is invalid.');
        }
        $opened = true;
        if (!mkdir($temporary.'/assets', 0700) || $zip->numFiles > 100) {
            throw new RuntimeException('The dashboard package contains unexpected files.');
        }
        $total = 0;
        $seen = [];
        for ($index = 0; $index < $zip->numFiles; ++$index) {
            $entry = $zip->statIndex($index);
            $name = $entry['name'] ?? '';
            $size = $entry['size'] ?? -1;
            if (!preg_match(PANEL_FILES, $name) || isset($seen[$name]) || $size < 1 || ($total += $size) > 20 * 1024 * 1024) {
                throw new RuntimeException('The dashboard package contains unexpected files.');
            }
            $seen[$name] = true;
            $content = $zip->getFromIndex($index, $size);
            if ($content === false || strlen($content) !== $size || file_put_contents($temporary.'/'.$name, $content) !== $size) {
                throw new RuntimeException('Could not unpack the dashboard.');
            }
        }
        $zip->close();
        $opened = false;
        unlink($path);
        if (!isset($seen['oem.html']) || count($seen) < 2 || !rename($temporary, $target)) {
            throw new RuntimeException('The dashboard release could not be prepared.');
        }
    } finally {
        if ($opened) {
            $zip->close();
        }
        if (is_dir($temporary)) {
            foreach (glob($temporary.'/assets/*') ?: [] as $file) {
                unlink($file);
            }
            if (is_dir($temporary.'/assets')) {
                rmdir($temporary.'/assets');
            }
            foreach (glob($temporary.'/*') ?: [] as $file) {
                unlink($file);
            }
            rmdir($temporary);
        }
    }

    return $id;
}

function panelInstalledVersion(string $active): string
{
    return explode('-', $active, 2)[0];
}

function panelInstallerSigned(): bool
{
    return str_contains(PANEL_PUBLIC_KEY, 'BEGIN PUBLIC KEY');
}

function panelReleaseSetupUrl(): string
{
    return PANEL_RELEASES.'/latest/download/setup.php';
}

/** @return array{release: ?array{version: string, sha256: string}, error: ?string, expires: int} */
function panelReleaseStatus(): array
{
    $cache = $_SESSION['releaseCheck'] ?? null;
    if ($cache !== null && $cache['expires'] > time()) {
        return $cache;
    }

    try {
        $release = panelLatestRelease();

        return $_SESSION['releaseCheck'] = ['release' => $release, 'error' => null, 'expires' => time() + 300];
    } catch (RuntimeException $exception) {
        return $_SESSION['releaseCheck'] = ['release' => null, 'error' => $exception->getMessage(), 'expires' => time() + 60];
    }
}

function panelField(string $name): string
{
    $value = $_POST[$name] ?? '';

    return is_string($value) ? trim($value) : '';
}

function panelBrandImage(string $directory, string $field, int $maxBytes, int $maxSide): ?string
{
    $file = $_FILES[$field] ?? null;
    if ($file === null || ($file['error'] ?? null) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if (($file['error'] ?? null) !== UPLOAD_ERR_OK || !is_string($file['tmp_name'] ?? null)
        || !is_uploaded_file($file['tmp_name'])) {
        throw new RuntimeException('Could not upload the '.$field.' image.');
    }

    $bytes = file_get_contents($file['tmp_name'], length: $maxBytes + 1);
    if ($bytes === false || strlen($bytes) > $maxBytes) {
        throw new RuntimeException('Upload a smaller image for the '.$field.' (max '.$maxBytes.' bytes).');
    }
    $image = @getimagesizefromstring($bytes);
    $isPng = is_array($image) && ($image[2] ?? null) === IMAGETYPE_PNG;
    $isIco = $field === 'favicon' && (
        (is_array($image) && defined('IMAGETYPE_ICO') && ($image[2] ?? null) === IMAGETYPE_ICO)
        || str_starts_with($bytes, "\x00\x00\x01\x00")
    );
    if (!$isPng && !$isIco) {
        throw new RuntimeException($field === 'favicon'
            ? 'Favicon must be a PNG or ICO within the size and dimension limits.'
            : 'Logo must be a PNG within the size and dimension limits.');
    }
    if ($isPng) {
        if (!is_array($image) || $image[0] < 1 || $image[1] < 1 || $image[0] > $maxSide || $image[1] > $maxSide) {
            throw new RuntimeException('Upload a PNG for the '.$field.' that meets the size and dimension limits.');
        }
        $extension = 'png';
    } else {
        if (is_array($image) && isset($image[0], $image[1])
            && ($image[0] < 1 || $image[1] < 1 || $image[0] > $maxSide || $image[1] > $maxSide)) {
            throw new RuntimeException('Favicon ICO must be at most '.$maxSide.' × '.$maxSide.' pixels.');
        }
        $extension = 'ico';
    }
    $name = 'brand-'.hash('sha256', $bytes).'.'.$extension;
    $path = $directory.'/'.$name;
    if (!is_file($path)) {
        $temporary = tempnam($directory, '.brand-');
        if ($temporary === false) {
            throw new RuntimeException('Could not store the '.$field.'.');
        }
        try {
            if (file_put_contents($temporary, $bytes) !== strlen($bytes) || !rename($temporary, $path)) {
                throw new RuntimeException('Could not store the '.$field.'.');
            }
        } finally {
            if (is_file($temporary)) {
                unlink($temporary);
            }
        }
    }

    return $name;
}

function panelBrandImages(string $directory, array $branding): array
{
    foreach (['logo' => [1_048_576, 2048], 'favicon' => [65_536, 256]] as $field => [$maxBytes, $maxSide]) {
        $asset = panelBrandImage($directory, $field, $maxBytes, $maxSide);
        if ($asset !== null) {
            $branding[$field.'_file'] = $asset;
        }
    }

    return $branding;
}

function panelPruneBrandImages(string $directory, array $branding): void
{
    $selected = [$branding['logo_file'] ?? null, $branding['favicon_file'] ?? null];
    foreach ([...glob($directory.'/brand-*.png') ?: [], ...glob($directory.'/brand-*.ico') ?: []] as $path) {
        $name = basename($path);
        if (preg_match('/\Abrand-[a-f0-9]{64}\.(?:png|ico)\z/', $name) && !in_array($name, $selected, true)) {
            @unlink($path);
        }
    }
}

function panelBranding(array $previous): array
{
    $branding = ['name' => panelField('name'), 'logo' => $previous['logo'] ?? '', 'accent' => panelField('accent'),
        'language' => panelField('language'), 'support' => panelField('support')];
    if ($branding['name'] === '' || strlen($branding['name']) > 120
        || !preg_match('/\A#[0-9a-fA-F]{6}\z/', $branding['accent']) || !in_array($branding['language'], ['en', 'fa', 'ar'], true)) {
        throw new RuntimeException('Enter a brand name and select a valid color and language.');
    }
    foreach (['logo', 'support'] as $field) {
        $url = $branding[$field];
        if ($url !== '' && (strlen($url) > 512 || !filter_var($url, FILTER_VALIDATE_URL) || parse_url($url, PHP_URL_SCHEME) !== 'https'
            || parse_url($url, PHP_URL_USER) !== null)) {
            throw new RuntimeException('Logo and support URLs must use HTTPS.');
        }
    }

    return $branding + $previous;
}

function panelInstallEntry(): bool
{
    $entry = __DIR__.'/index.php';
    if (is_link($entry) || (file_exists($entry) && (!is_file($entry) || file_get_contents($entry) !== PANEL_INDEX))) {
        throw new RuntimeException('This document root already has an index.php. Use a dedicated site.');
    }
    if (is_file($entry)) {
        return false;
    }
    $entryFile = @fopen($entry, 'x');
    if ($entryFile === false) {
        throw new RuntimeException('PHP needs write access to create index.php in the document root.');
    }
    $written = fwrite($entryFile, PANEL_INDEX);
    fclose($entryFile);
    if ($written !== strlen(PANEL_INDEX)) {
        unlink($entry);
        throw new RuntimeException('The dashboard entry could not be written.');
    }

    return true;
}

function panelBackupStaticIndex(string $directory): ?string
{
    $path = __DIR__.'/index.html';
    if (!file_exists($path) && !is_link($path)) {
        return null;
    }
    $html = is_file($path) && !is_link($path) ? @file_get_contents($path, length: 65537) : false;
    if ($html === false || strlen($html) > 65536
        || !str_contains($html, '<title>Fonitas Developer Panel</title>')
        || !preg_match('~<script\b[^>]*\bsrc=["\x27](?:/|\./)?assets/index-[A-Za-z0-9_-]+\.js["\x27]~i', $html)
        || !preg_match('~<div\b[^>]*\bid=["\x27]root["\x27]~i', $html)) {
        throw new RuntimeException('This document root contains an unrecognized index.html. Use a dedicated site.');
    }

    $backup = $directory.'/legacy-index.html';
    if (file_exists($backup) || is_link($backup)) {
        throw new RuntimeException('A static dashboard backup already exists. Keep it in another private location before retrying.');
    }
    if (!@rename($path, $backup)) {
        throw new RuntimeException('Could not move the old dashboard into the private data directory.');
    }

    return $backup;
}

function panelRuntime(array $state, string $directory): never
{
    if ($state === []) {
        panelFail(503, 'Dashboard unavailable.');
    }
    $asset = $_GET['asset'] ?? '';
    if ($asset !== '') {
        if (!is_string($asset) || !preg_match('~\A([0-9]+\.[0-9]+\.[0-9]+-[0-9a-f]{16})/(assets/[A-Za-z0-9_-]+\.(js|css))\z~D', $asset, $match)
            || !in_array($match[1], [$state['active'], $state['previous'] ?? null], true) || !is_file($directory.'/'.$asset)) {
            panelFail(404, 'File unavailable.');
        }
        header('Content-Type: '.($match[3] === 'js' ? 'text/javascript' : 'text/css'));
        header('Cache-Control: public, max-age=31536000, immutable');
        readfile($directory.'/'.$asset);
        exit;
    }

    // Public: brand images for the customer shell (no admin session).
    $brandAsset = $_GET['brand'] ?? null;
    if ($brandAsset !== null) {
        if (!in_array($brandAsset, ['logo', 'favicon'], true)) {
            panelFail(404, 'File unavailable.');
        }
        $name = $state['branding'][$brandAsset.'_file'] ?? '';
        if (!is_string($name) || !preg_match('/\Abrand-[a-f0-9]{64}\.(?:png|ico)\z/', $name) || !is_file($directory.'/'.$name)) {
            panelFail(404, 'File unavailable.');
        }
        header('Content-Type: '.str_ends_with($name, '.ico') ? 'image/x-icon' : 'image/png');
        readfile($directory.'/'.$name);
        exit;
    }

    $view = $_GET['view'] ?? null;
    // Public allowlisted application id for OEM buyer UI filtering (no credential leak).
    if ($view === 'bound-application') {
        try {
            [$status, $body] = panelHttp(PANEL_API.'/application', 16384, ['Origin: '.$state['origin'], 'Authorization: Bearer '.$state['credential']]);
            $payload = json_decode($body, true);
            $application = is_array($payload) ? ($payload['data']['application'] ?? null) : null;
            $id = is_array($application) ? ($application['public_id'] ?? null) : null;
            if ($status !== 200 || !is_string($id)) {
                panelFail(503, 'Application unavailable.');
            }
            panelJson([
                'application_id' => $id,
                'name' => is_string($application['name'] ?? null) ? $application['name'] : null,
                'status' => is_string($application['status'] ?? null) ? $application['status'] : null,
            ]);
        } catch (RuntimeException) {
            panelFail(503, 'Application unavailable.');
        }
    }
    // Installation-credential JSON stays admin-only; buyers use Identity from the React shell.
    if ($view === 'application' || $view === 'branding') {
        if (!panelIsAdmin()) {
            panelRequireLoginRedirect();
        }
        if ($view === 'application') {
            try {
                [$status, $body] = panelHttp(PANEL_API.'/application', 16384, ['Origin: '.$state['origin'], 'Authorization: Bearer '.$state['credential']]);
                $payload = json_decode($body, true);
                $application = is_array($payload) ? ($payload['data']['application'] ?? null) : null;
                if ($status !== 200 || !is_array($application)
                    || !is_string($application['name'] ?? null) || !is_string($application['status'] ?? null)) {
                    panelFail(503, 'Application unavailable.');
                }
                panelJson(['name' => $application['name'], 'status' => $application['status']]);
            } catch (RuntimeException) {
                panelFail(503, 'Application unavailable.');
            }
        }
        $branding = $state['branding'];
        foreach (['logo', 'favicon'] as $field) {
            if (isset($branding[$field.'_file'])) {
                $branding[$field] = '/index.php?brand='.$field;
                unset($branding[$field.'_file']);
            }
        }
        panelJson($branding);
    }

    // Public customer React shell (login / register). Management stays on /setup.php.
    $html = @file_get_contents($directory.'/'.$state['active'].'/oem.html');
    if ($view !== null || $html === false) {
        panelFail(404, 'Dashboard unavailable.');
    }
    header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://api.fonitas.com; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    echo str_replace('"/assets/', '"/index.php?asset='.$state['active'].'/assets/', $html);
    exit;
}

function panelJson(array $data): never
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_THROW_ON_ERROR);
    exit;
}

function panelSession(string $origin, string $directory): void
{
    $https = panelRequestIsHttps() || str_starts_with($origin, 'https://');
    $sessionDir = $directory.'/sessions';
    if (!is_dir($sessionDir) && !@mkdir($sessionDir, 0700) && !is_dir($sessionDir)) {
        panelFail(503, 'PHP needs write access to create '.$sessionDir.' for login sessions.');
    }
    if (is_dir($sessionDir) && (fileperms($sessionDir) & 0077) !== 0) {
        @chmod($sessionDir, 0700);
    }
    session_save_path($sessionDir);
    // New cookie name avoids clashes with older path=/setup.php PanelSetup cookies.
    session_name('PanelSetup2');
    if (!session_start([
        'use_strict_mode' => 1,
        'use_only_cookies' => 1,
        'cookie_secure' => $https,
        'cookie_httponly' => true,
        'cookie_samesite' => 'Lax',
        'cookie_path' => '/',
        'cache_limiter' => '',
    ])) {
        panelFail(503, 'PHP could not start a session in the private data directory.');
    }
    if (($_SESSION['origin'] ?? null) !== $origin) {
        $_SESSION = ['origin' => $origin];
    }
    panelCsrfIssue($https);
}

/** Issue CSRF into the session and a first-party cookie (double-submit). */
function panelCsrfIssue(bool $https): string
{
    if (!isset($_SESSION['csrf']) || !is_string($_SESSION['csrf']) || strlen($_SESSION['csrf']) < 32) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    $token = $_SESSION['csrf'];
    setcookie('PanelCsrf', $token, [
        'expires' => 0,
        'path' => '/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    return $token;
}

function panelCsrfValid(string $posted): bool
{
    if ($posted === '' || strlen($posted) < 32) {
        return false;
    }
    $session = is_string($_SESSION['csrf'] ?? null) ? $_SESSION['csrf'] : '';
    if ($session !== '' && hash_equals($session, $posted)) {
        return true;
    }
    $cookie = is_string($_COOKIE['PanelCsrf'] ?? null) ? $_COOKIE['PanelCsrf'] : '';
    if ($cookie === '' || !hash_equals($cookie, $posted)) {
        return false;
    }
    // Session file was lost between GET and POST; restore the accepted token.
    $_SESSION['csrf'] = $posted;

    return true;
}

function panelInstallFromValues(
    string $directory,
    string $origin,
    #[SensitiveParameter] string $key,
    #[SensitiveParameter] string $password,
    array $branding,
): void {
    $created = false;
    $staticBackup = null;
    try {
        $branding = panelBrandImages($directory, $branding);
        $active = panelStageRelease($directory, panelLatestRelease());
        $created = panelInstallEntry();
        $staticBackup = panelBackupStaticIndex($directory);
        $credential = panelActivate($origin, $key);
        panelSave($directory, [
            'origin' => $origin,
            'password' => password_hash($password, PASSWORD_DEFAULT),
            'credential' => $credential,
            'branding' => $branding,
            'users' => [],
            'active' => $active,
            'previous' => null,
        ]);
    } catch (Throwable $exception) {
        if ($created) {
            @unlink(__DIR__.'/index.php');
        }
        if ($staticBackup !== null && (file_exists(__DIR__.'/index.html') || is_link(__DIR__.'/index.html')
            || !@rename($staticBackup, __DIR__.'/index.html'))) {
            throw new RuntimeException('Installation failed. The old dashboard is still backed up as legacy-index.html in the private data directory.', previous: $exception);
        }
        throw $exception;
    }
    session_regenerate_id(true);
    $_SESSION['adminUntil'] = time() + 28800;
}

function panelVerifyAdminLogin(string $user, #[SensitiveParameter] string $password, array $state): bool
{
    try {
        $creds = panelRequireAdminEnv();
        if (hash_equals($creds['user'], $user) && hash_equals($creds['password'], $password)) {
            return true;
        }
        // Allow the password saved at install time when .env user matches but the
        // operator still uses the original install password (common after edits).
        if (hash_equals($creds['user'], $user)
            && isset($state['password'])
            && is_string($state['password'])
            && password_verify($password, $state['password'])) {
            return true;
        }

        return false;
    } catch (RuntimeException) {
        return $user === 'admin'
            && isset($state['password'])
            && is_string($state['password'])
            && password_verify($password, $state['password']);
    }
}

function panelLoginFailureMessage(string $user, #[SensitiveParameter] string $password): string
{
    try {
        $creds = panelRequireAdminEnv();
    } catch (RuntimeException $exception) {
        return $exception->getMessage();
    }
    if (!hash_equals($creds['user'], $user)) {
        return 'Username does not match PANEL_ADMIN_USER in .env (check spelling and capital letters).';
    }
    if ($password === '') {
        return 'Password was empty. Enter PANEL_ADMIN_PASSWORD from .env.';
    }
    if (strlen($password) !== strlen($creds['password'])) {
        return 'Password does not match PANEL_ADMIN_PASSWORD in .env (length differs: typed '.strlen($password).', .env '.strlen($creds['password']).'). Remove extra quotes around the value in .env unless they are part of the password.';
    }

    return 'Password does not match PANEL_ADMIN_PASSWORD in .env. Open .env next to setup.php, copy the value after PANEL_ADMIN_PASSWORD= exactly, save the file, then try again.';
}

function panelAction(string $directory, string $origin, array $state, string $action): void
{
    if ($state === [] && $action === 'install-env') {
        $creds = panelRequireAdminEnv();
        $key = trim(panelEnv('PANEL_CONNECTION_KEY'));
        if ($key === '') {
            throw new RuntimeException('Set PANEL_CONNECTION_KEY in .env (from Custom Domains → Show connection key).');
        }
        $branding = [
            'name' => trim(panelEnv('PANEL_BRAND_NAME', 'Dashboard')),
            'logo' => '',
            'accent' => trim(panelEnv('PANEL_ACCENT', '#2858b8')),
            'language' => trim(panelEnv('PANEL_LANGUAGE', 'en')),
            'support' => trim(panelEnv('PANEL_SUPPORT_URL')),
        ];
        if ($branding['name'] === '' || strlen($branding['name']) > 120
            || !preg_match('/\A#[0-9a-fA-F]{6}\z/', $branding['accent'])
            || !in_array($branding['language'], ['en', 'fa', 'ar'], true)) {
            throw new RuntimeException('Check PANEL_BRAND_NAME, PANEL_ACCENT (#rrggbb), and PANEL_LANGUAGE (en|fa|ar) in .env.');
        }
        if ($branding['support'] !== '' && (strlen($branding['support']) > 512
            || !filter_var($branding['support'], FILTER_VALIDATE_URL)
            || parse_url($branding['support'], PHP_URL_SCHEME) !== 'https'
            || parse_url($branding['support'], PHP_URL_USER) !== null)) {
            throw new RuntimeException('PANEL_SUPPORT_URL must be empty or an HTTPS URL.');
        }
        panelInstallFromValues($directory, $origin, $key, $creds['password'], $branding);

        return;
    }
    if ($state === [] && $action === 'install') {
        $creds = panelRequireAdminEnv();
        $branding = panelBranding([]);
        panelInstallFromValues($directory, $origin, panelField('key'), $creds['password'], $branding);

        return;
    }
    if ($state === []) {
        throw new RuntimeException('Install the dashboard first.');
    }
    if ($action === 'login') {
        $user = panelField('username');
        // Do not trim passwords — .env parse already trims unquoted values; trimming here
        // only hides mismatches when the stored secret has edge spaces inside quotes.
        $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
        if (strlen($password) > 72 || !panelVerifyAdminLogin($user, $password, $state)) {
            usleep(350000);
            throw new RuntimeException(panelLoginFailureMessage($user, $password));
        }
        session_regenerate_id(true);
        $_SESSION['adminUntil'] = time() + 28800;

        return;
    }
    if (($_SESSION['adminUntil'] ?? 0) < time()) {
        throw new RuntimeException('Sign in to manage this dashboard.');
    }
    if ($action === 'logout') {
        unset($_SESSION['adminUntil'], $_SESSION['releaseCheck']);
        session_regenerate_id(true);

        return;
    }
    if ($action === 'check-update') {
        unset($_SESSION['releaseCheck']);

        return;
    }
    if ($action === 'settings') {
        $state['branding'] = panelBrandImages($directory, panelBranding($state['branding']));
    } elseif ($action === 'update') {
        unset($_SESSION['releaseCheck']);
        $check = panelReleaseStatus();
        $latest = $check['release'];
        if ($latest === null) {
            throw new RuntimeException($check['error'] ?? 'Could not check for updates.');
        }
        if (panelField('installed_release') !== $state['active'] || panelField('update_version') !== $latest['version']
            || !hash_equals($latest['sha256'], panelField('update_sha256'))
            || version_compare($latest['version'], panelInstalledVersion($state['active']), '<=')) {
            throw new RuntimeException('The available or installed release changed. Review the version below before confirming.');
        }
        $state['previous'] = $state['active'];
        $state['active'] = panelStageRelease($directory, $latest);
    } elseif ($action === 'rollback' && is_string($state['previous'])) {
        $state['active'] = $state['previous'];
        $state['previous'] = null;
    } elseif ($action === 'reconnect') {
        $key = panelField('key');
        if ($key === '') {
            $key = trim(panelEnv('PANEL_CONNECTION_KEY'));
        }
        $state['credential'] = panelActivate($origin, $key);
    } else {
        throw new RuntimeException('The requested action is unavailable.');
    }
    panelSave($directory, $state);
}

function panelBrandingFields(array $brand): void
{
    echo '<fieldset class="block"><legend>Branding</legend>';
    echo '<label>Brand name <input name="name" required maxlength="120" value="'.panelEscape($brand['name']).'"></label>';
    echo '<label>Logo PNG <input name="logo" type="file" accept="image/png,.png"></label>';
    echo '<p class="hint">Optional. PNG up to 1 MiB, 2048 × 2048 pixels.</p>';
    echo '<label>Favicon <input name="favicon" type="file" accept="image/png,image/x-icon,image/vnd.microsoft.icon,.png,.ico"></label>';
    echo '<p class="hint">Optional. PNG or ICO up to 64 KiB, 256 × 256 pixels.</p>';
    echo '<label>Support HTTPS URL <input name="support" type="url" value="'.panelEscape($brand['support']).'"></label>';
    echo '<label>Accent <input name="accent" type="color" value="'.panelEscape($brand['accent']).'"></label>';
    echo '<label>Language <select name="language">';
    foreach (['en' => 'English', 'fa' => 'فارسی', 'ar' => 'العربية'] as $code => $name) {
        echo '<option value="'.$code.'"'.($brand['language'] === $code ? ' selected' : '').'>'.$name.'</option>';
    }
    echo '</select></label></fieldset>';
}

function panelForm(string $action): void
{
    $encoding = in_array($action, ['install', 'settings'], true) ? ' enctype="multipart/form-data"' : '';
    $https = panelRequestIsHttps() || str_starts_with((string) ($_SESSION['origin'] ?? ''), 'https://');
    echo '<form method="post" action="/setup.php"'.$encoding.'><input type="hidden" name="csrf" value="'.panelEscape(panelCsrfIssue($https)).'">';
    echo '<input type="hidden" name="action" value="'.panelEscape($action).'">';
}

ini_set('display_errors', '0');
umask(0077);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
$runtime = defined('PANEL_RUNTIME');
$origin = panelOrigin();
// Always ensure the private data dir exists so login sessions have a writable save_path.
$directory = panelDirectory(true);
$state = panelState($directory);
if ($state !== [] && $state['origin'] !== $origin) {
    panelFail(400, 'This dashboard belongs to another address. PANEL_ORIGIN / HTTPS host must match the installed origin exactly.');
}
if (!extension_loaded('curl') || !extension_loaded('zip') || !extension_loaded('openssl')) {
    panelFail(503, 'Enable the PHP cURL, ZIP and OpenSSL extensions.');
}
panelLoadEnv();
panelProtectEnvFile();
panelSession($origin, $directory);
if ($runtime) {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
        panelFail(405, 'Method unavailable.');
    }
    panelRuntime($state, $directory);
}
$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $csrfPosted = panelField('csrf');
    if (!panelCsrfValid($csrfPosted)) {
        $https = panelRequestIsHttps() || str_starts_with($origin, 'https://');
        panelCsrfIssue($https);
        $error = 'Login form expired. Clear site cookies (or use a private window), reload once, then sign in with PANEL_ADMIN_USER / PANEL_ADMIN_PASSWORD from .env. Set PANEL_ORIGIN to '.$origin.' if this host sits behind a proxy.';
    } else {
        $lock = fopen($directory.'/manage.lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
            panelFail(409, 'Another management operation is in progress. Try again shortly.');
        }
        $action = '';
        try {
            $action = panelField('action');
            panelAction($directory, $origin, panelState($directory), $action);
            if (in_array($action, ['install', 'install-env', 'settings'], true)) {
                panelPruneBrandImages($directory, panelState($directory)['branding'] ?? []);
            }
            $next = panelField('next');
            if ($action === 'login' && $next === '/') {
                header('Location: /', true, 303);
                exit;
            }
            if ($action === 'install-env' || $action === 'install') {
                header('Location: /setup.php?saved=1', true, 303);
                exit;
            }
            header('Location: /setup.php'.($action === 'check-update' ? '' : '?saved=1'), true, 303);
            exit;
        } catch (RuntimeException $exception) {
            if (in_array($action, ['install', 'install-env', 'settings'], true)) {
                panelPruneBrandImages($directory, panelState($directory)['branding'] ?? []);
            }
            $error = $exception->getMessage();
        } finally {
            fclose($lock);
        }
    }
}
$admin = $state !== [] && panelIsAdmin();
$envReady = panelEnvReady();
$envHasKey = trim(panelEnv('PANEL_CONNECTION_KEY')) !== '';
$installedVersion = '';
/** @var array{release: ?array{version: string, sha256: string}, error: ?string, expires?: int} $releaseStatus */
$releaseStatus = ['release' => null, 'error' => null];
/** @var ?array{version: string, sha256: string} $latest */
$latest = null;
if ($admin) {
    $state = panelState($directory);
    $installedVersion = panelInstalledVersion($state['active']);
    $releaseStatus = panelReleaseStatus();
    $latest = $releaseStatus['release'];
}
$loginNext = isset($_GET['next']) && $_GET['next'] === '/' ? '/' : '';
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard setup</title>
<style>
body{margin:2.5rem auto;padding:0 1rem 3rem;max-width:40rem;font:1rem/1.5 system-ui;color:#172234}
h1{font-size:1.6rem;margin:0 0 .5rem}h2{font-size:1.15rem;margin:2rem 0 .5rem}
.lead,.hint{color:#445066}.hint{font-size:.92rem;margin:.35rem 0 .75rem}
.steps{margin:1rem 0 1.25rem;padding-left:1.25rem}.steps li{margin:.4rem 0}
.block{margin:1.25rem 0;padding:1rem 1rem .85rem;border:1px solid #d5dbe6;border-radius:.5rem}
.block legend{padding:0 .35rem;font-weight:600}
.notice{margin:1rem 0;padding:.85rem 1rem;border-radius:.5rem;background:#f3f6fb;border:1px solid #d5dbe6}
.notice.warn{background:#fff6f0;border-color:#f0c9b0}
form{margin:1rem 0}label{display:block;margin:.75rem 0;font-weight:550}
input,textarea,select{display:block;width:100%;font:inherit;box-sizing:border-box;margin-top:.35rem;padding:.45rem .55rem;border:1px solid #b8c0cf;border-radius:.35rem}
button{font:inherit;padding:.55rem .9rem;margin:.35rem .5rem .35rem 0;cursor:pointer}
[role=alert]{color:#aa261c;font-weight:550}[role=status].ok{color:#0f6b3c}
code{font:0.92rem ui-monospace,monospace}a{color:#1a4f9c}
</style>
</head>
<body>
<h1>Dashboard setup</h1>
<p class="lead">Installation for <strong><?= panelEscape($origin) ?></strong>. Login, install, and updates use <code>.env</code> in this folder — no cPanel Directory Privacy.</p>
<?php if ($error !== ''): ?><p role="alert"><?= panelEscape($error) ?></p><?php endif; ?>
<?php if (isset($_GET['saved']) && $admin): ?><p role="status" class="ok">Done. You can open the dashboard.</p><?php endif; ?>
<?php if ($state === []): ?>
<section class="notice<?= $envReady && $envHasKey ? '' : ' warn' ?>">
<p><strong>One-time setup</strong></p>
<ol class="steps">
<li>Upload <code>setup.php</code> and a <code>.env</code> file into this document root.</li>
<li>In <a href="https://developerpannel.fonitas.com/settings/custom-domains" rel="noreferrer">Custom Domains</a>, request <strong><?= panelEscape($origin) ?></strong> and copy the connection key into <code>PANEL_CONNECTION_KEY</code>.</li>
<li>Set <code>PANEL_ADMIN_USER</code> and <code>PANEL_ADMIN_PASSWORD</code> (16+ characters) in <code>.env</code>.</li>
<li>Click install below — PHP downloads the latest signed release, unzips it, and activates Fonitas.</li>
</ol>
<?php if (!$envReady): ?>
<p role="status">Missing <code>PANEL_ADMIN_USER</code> / <code>PANEL_ADMIN_PASSWORD</code> in <code>.env</code>.</p>
<?php elseif (!$envHasKey): ?>
<p role="status"><code>.env</code> login is ready. Add <code>PANEL_CONNECTION_KEY</code> from Custom Domains, then install.</p>
<?php else: ?>
<p role="status" class="ok"><code>.env</code> looks ready for automatic install.</p>
<?php endif; ?>
</section>
<?php if ($envReady && $envHasKey): ?>
<?php panelForm('install-env'); ?>
<button>Install latest dashboard from .env</button></form>
<?php endif; ?>
<details class="block"><summary>Advanced: install with a pasted key</summary>
<p class="hint">Still requires <code>PANEL_ADMIN_USER</code> / <code>PANEL_ADMIN_PASSWORD</code> in <code>.env</code>. Optional branding fields can override <code>PANEL_BRAND_*</code>.</p>
<?php if ($envReady): ?>
<?php panelForm('install'); ?>
<label>Connection key <input type="password" name="key" required autocomplete="off"></label>
<?php panelBrandingFields([
    'name' => trim(panelEnv('PANEL_BRAND_NAME', 'Dashboard')),
    'logo' => '',
    'accent' => trim(panelEnv('PANEL_ACCENT', '#2858b8')) ?: '#2858b8',
    'language' => trim(panelEnv('PANEL_LANGUAGE', 'en')) ?: 'en',
    'support' => trim(panelEnv('PANEL_SUPPORT_URL')),
]); ?>
<button>Install dashboard</button></form>
<?php else: ?>
<p class="hint">Create <code>.env</code> first.</p>
<?php endif; ?>
</details>
<?php elseif (!$admin): ?>
<section class="notice">
<p>Sign in with <code>PANEL_ADMIN_USER</code> and <code>PANEL_ADMIN_PASSWORD</code> from <code>.env</code>. Same login opens the dashboard and this management page.</p>
</section>
<?php panelForm('login'); ?>
<?php if ($loginNext !== ''): ?><input type="hidden" name="next" value="/"><?php endif; ?>
<label>Username <input name="username" required autocomplete="username" value="<?= panelEscape(trim(panelEnv('PANEL_ADMIN_USER'))) ?>"></label>
<label>Password <input type="password" name="password" required autocomplete="current-password"></label>
<button>Sign in</button></form>
<?php else: ?>
<section class="notice">
<p>Signed in. <a href="/">Open customer dashboard</a> (public login / register). This page is admin-only for updates and branding.</p>
</section>
<?php if (!panelInstallerSigned()): ?>
<section class="notice warn" role="status">
<p><strong>Wrong setup.php on the server.</strong> This file is the unsigned git source, so updates cannot be verified.</p>
<p>In cPanel File Manager, replace document-root <code>setup.php</code> with the release download (do not upload from your local <code>installer/</code> folder):</p>
<p><a href="<?= panelEscape(panelReleaseSetupUrl()) ?>" rel="noreferrer"><?= panelEscape(panelReleaseSetupUrl()) ?></a></p>
<p>After upload, reload this page. You should see installer signed, then use <strong>Check again</strong>.</p>
</section>
<?php endif; ?>
<section class="block">
<h2>Updates</h2>
<p>Installed version <strong><?= panelEscape($installedVersion) ?></strong></p>
<p class="hint">Installer: <?= panelInstallerSigned() ? 'signed (release asset, min '.panelEscape(PANEL_MINIMUM_RELEASE).')' : 'unsigned (repo source — replace from GitHub release)' ?></p>
<?php if ($latest === null): ?>
<p role="status">Update check unavailable. <?= panelEscape($releaseStatus['error'] ?? '') ?></p>
<?php elseif (version_compare($latest['version'], $installedVersion, '>')): ?>
<p role="status">Version <strong><?= panelEscape($latest['version']) ?></strong> is available.</p>
<?php panelForm('update'); ?>
<input type="hidden" name="installed_release" value="<?= panelEscape($state['active']) ?>">
<input type="hidden" name="update_version" value="<?= panelEscape($latest['version']) ?>">
<input type="hidden" name="update_sha256" value="<?= panelEscape($latest['sha256']) ?>">
<button>Download and install <?= panelEscape($latest['version']) ?></button></form>
<?php else: ?>
<p role="status">Up to date. Latest release: <?= panelEscape($latest['version']) ?>.</p>
<?php endif; ?>
<?php panelForm('check-update'); ?><button>Check again</button></form>
<?php if ($state['previous'] !== null): ?>
<?php panelForm('rollback'); ?><button>Restore previous version</button></form>
<?php endif; ?>
</section>
<h2>Branding</h2>
<?php
$branding = is_array($state['branding'] ?? null) ? $state['branding'] : ['name' => '', 'logo' => '', 'accent' => '#2858b8', 'language' => 'en', 'support' => ''];
panelForm('settings');
panelBrandingFields($branding);
?>
<button>Save branding</button></form>
<section class="block">
<h2>Reconnect to Fonitas</h2>
<p class="hint">Only when Custom Domains issues a new connection key. Paste it here or put it in <code>PANEL_CONNECTION_KEY</code> and leave the field empty.</p>
<?php panelForm('reconnect'); ?>
<label>New connection key <input type="password" name="key" autocomplete="off" placeholder="Uses .env when empty"></label>
<button>Reconnect</button></form>
</section>
<p><a href="/">Open dashboard</a></p>
<?php panelForm('logout'); ?><button>Sign out</button></form>
<?php endif; ?>
</body>
</html>
