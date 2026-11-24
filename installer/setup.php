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
 * Viewer identity from the host auth module only (never from a client-forged header).
 * Apache often sets REMOTE_USER; cPanel Directory Privacy / PHP-FPM often sets PHP_AUTH_USER.
 */
function panelViewerIdentity(): string
{
    foreach (['REMOTE_USER', 'REDIRECT_REMOTE_USER', 'PHP_AUTH_USER'] as $key) {
        $value = $_SERVER[$key] ?? '';
        if (is_string($value) && $value !== '') {
            return $value;
        }
    }

    return '';
}

/** Explain the viewer gate when the dashboard is opened without access. */
function panelAccessDenied(?string $identity): never
{
    http_response_code(403);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    $who = $identity === null || $identity === ''
        ? 'Your host did not send a signed-in username to PHP (no <code>REMOTE_USER</code> / <code>PHP_AUTH_USER</code>).'
        : 'Signed-in as <code>'.panelEscape($identity).'</code>, which is not on the Authorized users list.';
    echo '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
    echo '<title>Dashboard access</title><style>body{margin:3rem auto;padding:0 1rem;max-width:40rem;font:1rem system-ui;line-height:1.5;color:#172234}';
    echo 'ol{padding-left:1.25rem}code{font:0.95rem ui-monospace,monospace}a{color:#1a4f9c}</style>';
    echo '<h1>You do not have access to this dashboard</h1>';
    echo '<p>'.$who.'</p>';
    echo '<p>This page is separate from Fonitas login. Access needs two things:</p><ol>';
    echo '<li>Password-protect this folder (cPanel <strong>Directory Privacy</strong>). When the browser asks for a username/password, that username must reach PHP.</li>';
    echo '<li>Open <a href="/setup.php">/setup.php</a>, sign in with the <strong>management password</strong>, and add that exact username under <strong>Authorized users</strong> (one per line).</li>';
    echo '</ol><p>Then reload this page and sign in with that host username when the browser prompts.</p></html>';
    exit;
}

/** Fail-closed: loopback only when APP_ENV is dev|development and PANEL_ALLOW_LOCALHOST is true. */
function panelAllowsLocalhost(): bool
{
    $env = strtolower((string) (getenv('APP_ENV') !== false ? getenv('APP_ENV') : 'production'));
    $flag = strtolower((string) (getenv('PANEL_ALLOW_LOCALHOST') !== false ? getenv('PANEL_ALLOW_LOCALHOST') : 'false'));
    $dev = $env === 'dev' || $env === 'development';
    $enabled = in_array($flag, ['1', 'true', 'yes'], true);

    return $dev && $enabled;
}

function panelIsLoopbackHost(string $host): bool
{
    $normalized = str_starts_with($host, '[') ? substr($host, 1, -1) : $host;

    return $normalized === 'localhost' || $normalized === '127.0.0.1' || $normalized === '::1';
}

function panelOrigin(): string
{
    $https = in_array(strtolower($_SERVER['HTTPS'] ?? ''), ['on', '1'], true);
    $authority = strtolower($_SERVER['HTTP_HOST'] ?? '');
    $authority = preg_replace($https ? '~:443\z~' : '~:80\z~', '', $authority) ?? $authority;
    $configured = getenv('PANEL_ORIGIN');
    if ($configured !== false) {
        $origin = $configured;
    } elseif ($https) {
        $origin = 'https://'.$authority;
    } elseif (panelAllowsLocalhost()) {
        $origin = 'http://'.$authority;
    } else {
        panelFail(400, 'Open this panel through its configured HTTPS address.');
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
    if ($scheme === 'https' && !$https && $configured === false) {
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
        CURLOPT_WRITEFUNCTION => static function ($handle, string $bytes) use (&$data, $limit): int {
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
    $token = json_decode($body, true)['data']['installation_token'] ?? '';
    if ($status !== 200 || !is_string($token) || !preg_match('/\Afpi_[0-9a-f]{64}\z/', $token)) {
        throw new RuntimeException('Connection key rejected. Check that the domain is linked to an application and the key is current.');
    }

    return $token;
}

/** @return array{version: string, sha256: string} */
function panelLatestRelease(): array
{
    if (!str_contains(PANEL_PUBLIC_KEY, 'BEGIN PUBLIC KEY')) {
        throw new RuntimeException('Download the signed installer from the release page.');
    }
    [$status, $envelope] = panelHttp(PANEL_RELEASES.'/latest/download/oem-release.json', 16384, redirects: true);
    $signed = json_decode($envelope, true);
    $manifest = base64_decode(is_string($signed['manifest'] ?? null) ? $signed['manifest'] : '', true);
    $signature = base64_decode(is_string($signed['signature'] ?? null) ? $signed['signature'] : '', true);
    if ($status !== 200 || !$manifest || !$signature || openssl_verify($manifest, $signature, PANEL_PUBLIC_KEY, OPENSSL_ALGO_SHA256) !== 1) {
        throw new RuntimeException('The release manifest could not be verified.');
    }
    $release = json_decode($manifest, true);
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
        throw new RuntimeException('Could not upload the '.$field.' PNG.');
    }

    $bytes = file_get_contents($file['tmp_name'], length: $maxBytes + 1);
    $image = $bytes === false ? false : @getimagesizefromstring($bytes);
    if ($bytes === false || strlen($bytes) > $maxBytes || $image === false || $image[2] !== IMAGETYPE_PNG
        || $image[0] < 1 || $image[1] < 1 || $image[0] > $maxSide || $image[1] > $maxSide) {
        throw new RuntimeException('Upload a PNG for the '.$field.' that meets the size and dimension limits.');
    }
    $name = 'brand-'.hash('sha256', $bytes).'.png';
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
    foreach (glob($directory.'/brand-*.png') ?: [] as $path) {
        $name = basename($path);
        if (preg_match('/\Abrand-[a-f0-9]{64}\.png\z/', $name) && !in_array($name, $selected, true)) {
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

function panelUsers(): array
{
    $list = panelField('users');
    if (strlen($list) > 8192) {
        throw new RuntimeException('The list of authorized users is too long.');
    }

    return array_values(array_unique(array_filter(array_map('trim', preg_split('/\R/', $list) ?: []))));
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

    $identity = panelViewerIdentity();
    if ($identity === '' || !in_array($identity, $state['users'] ?? [], true)) {
        panelAccessDenied($identity === '' ? null : $identity);
    }
    $brandAsset = $_GET['brand'] ?? null;
    if ($brandAsset !== null) {
        if (!in_array($brandAsset, ['logo', 'favicon'], true)) {
            panelFail(404, 'File unavailable.');
        }
        $name = $state['branding'][$brandAsset.'_file'] ?? '';
        if (!is_string($name) || !preg_match('/\Abrand-[a-f0-9]{64}\.png\z/', $name) || !is_file($directory.'/'.$name)) {
            panelFail(404, 'File unavailable.');
        }
        header('Content-Type: image/png');
        readfile($directory.'/'.$name);
        exit;
    }
    $view = $_GET['view'] ?? null;
    if ($view === 'application') {
        try {
            [$status, $body] = panelHttp(PANEL_API.'/application', 16384, ['Origin: '.$state['origin'], 'Authorization: Bearer '.$state['credential']]);
            $application = json_decode($body, true)['data']['application'] ?? [];
            if ($status !== 200 || !is_string($application['name'] ?? null) || !is_string($application['status'] ?? null)) {
                panelFail(503, 'Application unavailable.');
            }
            panelJson(['name' => $application['name'], 'status' => $application['status']]);
        } catch (RuntimeException) {
            panelFail(503, 'Application unavailable.');
        }
    }
    if ($view === 'branding') {
        $branding = $state['branding'];
        foreach (['logo', 'favicon'] as $field) {
            if (isset($branding[$field.'_file'])) {
                $branding[$field] = '/index.php?brand='.$field;
                unset($branding[$field.'_file']);
            }
        }
        panelJson($branding);
    }
    $html = @file_get_contents($directory.'/'.$state['active'].'/oem.html');
    if ($view !== null || $html === false) {
        panelFail(404, 'Dashboard unavailable.');
    }
    header("Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
    echo str_replace('"/assets/', '"/index.php?asset='.$state['active'].'/assets/', $html);
    exit;
}

function panelJson(array $data): never
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_THROW_ON_ERROR);
    exit;
}

function panelSession(string $origin): void
{
    session_name('PanelSetup');
    session_start([
        'use_strict_mode' => 1, 'use_only_cookies' => 1, 'cookie_secure' => true, 'cookie_httponly' => true,
        'cookie_samesite' => 'Strict', 'cookie_path' => '/setup.php', 'cache_limiter' => '',
    ]);
    if (($_SESSION['origin'] ?? null) !== $origin) {
        $_SESSION = ['origin' => $origin];
    }
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

function panelAction(string $directory, string $origin, array $state, string $action): void
{
    if ($state === [] && $action === 'install') {
        $password = panelField('password');
        if (strlen($password) < 16 || strlen($password) > 72) {
            throw new RuntimeException('Choose a management password between 16 and 72 bytes.');
        }
        $branding = panelBranding([]);
        $users = panelUsers();
        $created = false;
        $staticBackup = null;
        try {
            $branding = panelBrandImages($directory, $branding);
            $active = panelStageRelease($directory, panelLatestRelease());
            $created = panelInstallEntry();
            $staticBackup = panelBackupStaticIndex($directory);
            $credential = panelActivate($origin, panelField('key'));
            panelSave($directory, [
                'origin' => $origin, 'password' => password_hash($password, PASSWORD_DEFAULT), 'credential' => $credential,
                'branding' => $branding, 'users' => $users, 'active' => $active, 'previous' => null,
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
        $_SESSION['adminUntil'] = time() + 900;

        return;
    }
    if ($state === []) {
        throw new RuntimeException('Install the dashboard first.');
    }
    if ($action === 'login') {
        $password = panelField('password');
        if (strlen($password) > 72 || !password_verify($password, $state['password'])) {
            usleep(350000);
            throw new RuntimeException('Invalid management password.');
        }
        session_regenerate_id(true);
        $_SESSION['adminUntil'] = time() + 900;

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
        $state['users'] = panelUsers();
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
        $state['credential'] = panelActivate($origin, panelField('key'));
    } else {
        throw new RuntimeException('The requested action is unavailable.');
    }
    panelSave($directory, $state);
}

function panelBrandingFields(array $brand, array $users): void
{
    echo '<fieldset class="block"><legend>Branding</legend>';
    echo '<label>Brand name <input name="name" required maxlength="120" value="'.panelEscape($brand['name']).'"></label>';
    echo '<label>Logo PNG <input name="logo" type="file" accept="image/png"></label>';
    echo '<p class="hint">Optional. PNG up to 1 MiB, 2048 × 2048 pixels.</p>';
    echo '<label>Favicon PNG <input name="favicon" type="file" accept="image/png"></label>';
    echo '<p class="hint">Optional. PNG up to 64 KiB, 256 × 256 pixels.</p>';
    echo '<label>Support HTTPS URL <input name="support" type="url" value="'.panelEscape($brand['support']).'"></label>';
    echo '<label>Accent <input name="accent" type="color" value="'.panelEscape($brand['accent']).'"></label>';
    echo '<label>Language <select name="language">';
    foreach (['en' => 'English', 'fa' => 'فارسی', 'ar' => 'العربية'] as $code => $name) {
        echo '<option value="'.$code.'"'.($brand['language'] === $code ? ' selected' : '').'>'.$name.'</option>';
    }
    echo '</select></label></fieldset>';
    echo '<fieldset class="block"><legend>Who can open the dashboard</legend>';
    echo '<p class="hint">The dashboard is <strong>not</strong> opened with your Fonitas account. Enable cPanel <strong>Directory Privacy</strong> on this folder, then list those usernames here — exact match, one per line. PHP reads <code>REMOTE_USER</code> or <code>PHP_AUTH_USER</code>.</p>';
    echo '<label>Authorized users <textarea name="users" rows="5" maxlength="8192" placeholder="alice&#10;bob">'.panelEscape(implode("\n", $users)).'</textarea></label>';
    echo '<p class="hint">Empty list = nobody can open the dashboard. This <code>/setup.php</code> page still uses the management password only.</p></fieldset>';
}

function panelForm(string $action): void
{
    $encoding = in_array($action, ['install', 'settings'], true) ? ' enctype="multipart/form-data"' : '';
    echo '<form method="post" action="/setup.php"'.$encoding.'><input type="hidden" name="csrf" value="'.panelEscape($_SESSION['csrf']).'">';
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
$directory = panelDirectory(!$runtime && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST');
$state = panelState($directory);
if ($state !== [] && $state['origin'] !== $origin) {
    panelFail(400, 'This dashboard belongs to another address.');
}
if (!extension_loaded('curl') || !extension_loaded('zip') || !extension_loaded('openssl')) {
    panelFail(503, 'Enable the PHP cURL, ZIP and OpenSSL extensions.');
}
if ($runtime) {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
        panelFail(405, 'Method unavailable.');
    }
    panelRuntime($state, $directory);
}

panelSession($origin);
$error = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    if (!hash_equals($_SESSION['csrf'], panelField('csrf'))) {
        panelFail(403, 'Reload the management page and try again.');
    }
    $lock = fopen($directory.'/manage.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
        panelFail(409, 'Another management operation is in progress. Try again shortly.');
    }
    try {
        $action = panelField('action');
        panelAction($directory, $origin, panelState($directory), $action);
        if (in_array($action, ['install', 'settings'], true)) {
            panelPruneBrandImages($directory, panelState($directory)['branding'] ?? []);
        }
        header('Location: /setup.php'.($action === 'check-update' ? '' : '?saved=1'), true, 303);
        exit;
    } catch (RuntimeException $exception) {
        if (in_array($action ?? '', ['install', 'settings'], true)) {
            panelPruneBrandImages($directory, panelState($directory)['branding'] ?? []);
        }
        $error = $exception->getMessage();
    } finally {
        fclose($lock);
    }
}
$admin = $state !== [] && ($_SESSION['adminUntil'] ?? 0) >= time();
if ($admin) {
    $state = panelState($directory);
    $installedVersion = panelInstalledVersion($state['active']);
    $releaseStatus = panelReleaseStatus();
    $latest = $releaseStatus['release'];
}
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
$viewerCount = is_array($state['users'] ?? null) ? count($state['users']) : 0;
?>
<!doctype html>
<html lang="en">
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
<h1>Dashboard setup</h1>
<p class="lead">Manage installation for <strong><?= panelEscape($origin) ?></strong>. This page is for the site owner (management password). Day-to-day dashboard viewers use your host’s Directory Privacy username.</p>
<?php if ($error !== ''): ?><p role="alert"><?= panelEscape($error) ?></p><?php endif; ?>
<?php if (isset($_GET['saved']) && $admin): ?><p role="status" class="ok">Saved. If you changed Authorized users, open the dashboard again with that host username.</p><?php endif; ?>
<?php if ($state === []): ?>
<section class="notice">
<p><strong>First-time install — do this in order:</strong></p>
<ol class="steps">
<li>In the <a href="https://developerpannel.fonitas.com/settings/custom-domains" rel="noreferrer">developer portal → Custom Domains</a>, request this exact address and choose the application.</li>
<li>Copy the connection key (valid about 15 minutes).</li>
<li>Paste it below, choose a management password (16+ characters), set brand name, and add at least one <strong>Authorized user</strong>.</li>
<li>After install, enable cPanel <strong>Directory Privacy</strong> on this folder with that same username, then open the site root.</li>
</ol>
</section>
<?php panelForm('install'); ?>
<fieldset class="block"><legend>1. Connect to Fonitas</legend>
<label>Connection key <input type="password" name="key" required autocomplete="off"></label>
<p class="hint">From Custom Domains → Show connection key. Not your Fonitas login password.</p>
<label>New management password <input type="password" name="password" required minlength="16" maxlength="72" autocomplete="new-password"></label>
<p class="hint">Only for this <code>/setup.php</code> page (settings and updates). Keep it private.</p>
</fieldset>
<?php panelBrandingFields(['name' => '', 'logo' => '', 'accent' => '#2858b8', 'language' => 'en', 'support' => ''], []); ?>
<button>Install dashboard</button></form>
<?php elseif (!$admin): ?>
<section class="notice">
<p>Sign in with the <strong>management password</strong> you chose at install. That is not your Fonitas account, and not the Directory Privacy username used to view the dashboard.</p>
<p class="hint">Seeing “You do not have access to this dashboard” on the home page? Sign in here, add your Directory Privacy username under Authorized users, save, then open the site root again.</p>
</section>
<?php panelForm('login'); ?>
<label>Management password <input type="password" name="password" required autocomplete="current-password"></label>
<button>Sign in to manage</button></form>
<?php else: ?>
<section class="notice<?= $viewerCount === 0 ? ' warn' : '' ?>">
<p><strong>Open the dashboard:</strong> protect this folder with Directory Privacy, use a username listed under Authorized users, then visit <a href="/">the site root</a>.</p>
<?php if ($viewerCount === 0): ?>
<p role="status">No authorized users are saved yet — the dashboard will deny everyone until you add at least one username below and save.</p>
<?php else: ?>
<p class="hint"><?= (int) $viewerCount ?> authorized user(s) saved. Username must match Directory Privacy exactly.</p>
<?php endif; ?>
</section>
<section class="block">
<h2>Updates</h2>
<p>Installed version <strong><?= panelEscape($installedVersion) ?></strong></p>
<?php if ($latest === null): ?>
<p role="status">Update check unavailable. <?= panelEscape($releaseStatus['error'] ?? '') ?></p>
<?php elseif (version_compare($latest['version'], $installedVersion, '>')): ?>
<p role="status">Version <strong><?= panelEscape($latest['version']) ?></strong> is available.</p>
<?php panelForm('update'); ?>
<input type="hidden" name="installed_release" value="<?= panelEscape($state['active']) ?>">
<input type="hidden" name="update_version" value="<?= panelEscape($latest['version']) ?>">
<input type="hidden" name="update_sha256" value="<?= panelEscape($latest['sha256']) ?>">
<button>Install version <?= panelEscape($latest['version']) ?></button></form>
<?php else: ?>
<p role="status">Up to date. Latest release: <?= panelEscape($latest['version']) ?>.</p>
<?php endif; ?>
<?php panelForm('check-update'); ?><button>Check again</button></form>
<?php if ($state['previous'] !== null): ?>
<?php panelForm('rollback'); ?><button>Restore previous version</button></form>
<?php endif; ?>
</section>
<h2>Brand and who can open the dashboard</h2>
<?php panelForm('settings'); panelBrandingFields($state['branding'], $state['users']); ?>
<button>Save settings</button></form>
<section class="block">
<h2>Reconnect to Fonitas</h2>
<p class="hint">Only if Custom Domains issued a new connection key (reconnect / reassign). Paste the new key here. Does not change Authorized users.</p>
<?php panelForm('reconnect'); ?>
<label>New connection key <input type="password" name="key" required autocomplete="off"></label>
<button>Reconnect</button></form>
</section>
<p><a href="/">Open dashboard</a> · keep this <code>/setup.php</code> bookmark for settings.</p>
<?php panelForm('logout'); ?><button>Sign out of management</button></form>
<?php endif; ?>
