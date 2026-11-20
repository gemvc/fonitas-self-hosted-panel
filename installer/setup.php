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

function panelOrigin(): string
{
    $host = strtolower($_SERVER['HTTP_HOST'] ?? '');
    $configured = getenv('PANEL_ORIGIN');
    $origin = $configured === false ? 'https://'.$host : $configured;
    $https = in_array(strtolower($_SERVER['HTTPS'] ?? ''), ['on', '1'], true);
    if (strlen($origin) > 261 || !preg_match('~\Ahttps://(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*\z~D', $origin)
        || substr($origin, 8) !== $host || (!$https && $configured === false)) {
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

function panelRelease(string $directory, ?string $current): string
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
    $id = $version.'-'.substr($hash, 0, 16);
    if ($current !== null && version_compare($version, explode('-', $current, 2)[0], '<=')) {
        return $current;
    }
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

function panelField(string $name): string
{
    $value = $_POST[$name] ?? '';

    return is_string($value) ? trim($value) : '';
}

function panelBranding(): array
{
    $branding = ['name' => panelField('name'), 'logo' => panelField('logo'), 'accent' => panelField('accent'),
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

    return $branding;
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
    if (is_file(__DIR__.'/index.html')) {
        throw new RuntimeException('Move the existing index.html outside this document root before installing the dashboard.');
    }
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

    $identity = $_SERVER['REMOTE_USER'] ?? '';
    if (!is_string($identity) || $identity === '' || !in_array($identity, $state['users'] ?? [], true)) {
        panelFail(403, 'You do not have access to this dashboard.');
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
        panelJson($state['branding']);
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
        $branding = panelBranding();
        $users = panelUsers();
        $created = panelInstallEntry();
        try {
            $active = panelRelease($directory, null);
            $credential = panelActivate($origin, panelField('key'));
            panelSave($directory, [
                'origin' => $origin, 'password' => password_hash($password, PASSWORD_DEFAULT), 'credential' => $credential,
                'branding' => $branding, 'users' => $users, 'active' => $active, 'previous' => null,
            ]);
        } catch (Throwable $exception) {
            if ($created) {
                @unlink(__DIR__.'/index.php');
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
        unset($_SESSION['adminUntil']);
        session_regenerate_id(true);

        return;
    }
    if ($action === 'settings') {
        $state['branding'] = panelBranding();
        $state['users'] = panelUsers();
    } elseif ($action === 'update') {
        $current = $state['active'];
        $next = panelRelease($directory, $current);
        if ($next !== $current) {
            $state['previous'] = $current;
            $state['active'] = $next;
        }
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
    echo '<label>Brand name <input name="name" required maxlength="120" value="'.panelEscape($brand['name']).'"></label>';
    echo '<label>Logo HTTPS URL <input name="logo" type="url" value="'.panelEscape($brand['logo']).'"></label>';
    echo '<label>Support HTTPS URL <input name="support" type="url" value="'.panelEscape($brand['support']).'"></label>';
    echo '<label>Accent <input name="accent" type="color" value="'.panelEscape($brand['accent']).'"></label>';
    echo '<label>Language <select name="language">';
    foreach (['en' => 'English', 'fa' => 'فارسی', 'ar' => 'العربية'] as $code => $name) {
        echo '<option value="'.$code.'"'.($brand['language'] === $code ? ' selected' : '').'>'.$name.'</option>';
    }
    echo '</select></label>';
    echo '<label>Authorized users <textarea name="users" rows="5" maxlength="8192">'.panelEscape(implode("\n", $users)).'</textarea></label>';
    echo '<p>Enter one identity per line, exactly as your site sign-in reports it to PHP.</p>';
}

function panelForm(string $action): void
{
    echo '<form method="post" action="/setup.php"><input type="hidden" name="csrf" value="'.panelEscape($_SESSION['csrf']).'">';
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
        panelAction($directory, $origin, panelState($directory), panelField('action'));
        header('Location: /setup.php?saved=1', true, 303);
        exit;
    } catch (RuntimeException $exception) {
        $error = $exception->getMessage();
    } finally {
        fclose($lock);
    }
}
$admin = $state !== [] && ($_SESSION['adminUntil'] ?? 0) >= time();
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
?>
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard setup</title>
<style>
body{margin:3rem auto;padding:0 1rem;max-width:36rem;font:1rem system-ui;color:#172234}
form{margin:1.25rem 0}label{display:block;margin:.75rem 0}input,textarea,select{display:block;font:inherit;box-sizing:border-box;max-width:100%;padding:.35rem}button{font:inherit;padding:.5rem .85rem}p{line-height:1.45}[role=alert]{color:#aa261c}
</style>
<h1>Dashboard setup</h1>
<?php if ($error !== ''): ?><p role="alert"><?= panelEscape($error) ?></p><?php endif; ?>
<?php if (isset($_GET['saved']) && $admin): ?><p role="status">Operation completed.</p><?php endif; ?>
<?php if ($state === []): ?>
<p>Register <strong><?= panelEscape($origin) ?></strong> for the chosen application and copy its connection key from the <a href="https://developerpannel.fonitas.com/settings/custom-domains" rel="noreferrer">developer portal</a>.</p>
<?php panelForm('install'); ?>
<label>Connection key <input type="password" name="key" required autocomplete="off"></label>
<label>New management password <input type="password" name="password" required minlength="16" maxlength="72" autocomplete="new-password"></label>
<?php panelBrandingFields(['name' => '', 'logo' => '', 'accent' => '#2858b8', 'language' => 'en', 'support' => ''], []); ?>
<button>Install dashboard</button></form>
<?php elseif (!$admin): ?>
<?php panelForm('login'); ?>
<label>Management password <input type="password" name="password" required autocomplete="current-password"></label>
<button>Sign in</button></form>
<?php else: ?>
<p>Installed version <strong><?= panelEscape(explode('-', $state['active'], 2)[0]) ?></strong></p>
<?php panelForm('update'); ?><button>Check and install update</button></form>
<?php if ($state['previous'] !== null): ?>
<?php panelForm('rollback'); ?><button>Restore previous version</button></form>
<?php endif; ?>
<h2>Brand and access</h2>
<?php panelForm('settings'); panelBrandingFields($state['branding'], $state['users']); ?>
<button>Save settings</button></form>
<h2>Connection</h2>
<?php panelForm('reconnect'); ?>
<label>New connection key <input type="password" name="key" required autocomplete="off"></label>
<button>Reconnect</button></form>
<p><a href="/">Open dashboard</a></p>
<?php panelForm('logout'); ?><button>Sign out</button></form>
<?php endif; ?>
