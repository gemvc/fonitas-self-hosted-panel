<?php

declare(strict_types=1);

use Fonitas\Customer\FonitasApi;
use Fonitas\Customer\Installation;
use Fonitas\Customer\UpstreamProxy;

require dirname(__DIR__).'/src/Installation.php';
require dirname(__DIR__).'/src/FonitasApi.php';
require dirname(__DIR__).'/src/UpstreamProxy.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = is_string($path) ? $path : '/';
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

try {
    $installation = Installation::load(__DIR__);
} catch (RuntimeException) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(503);
    echo '{"error":"installation_unavailable"}';

    return;
}

// Same-origin Fonitas REST bridge (Identity cookies + buyer APIs).
if (str_starts_with($path, '/api/v1')) {
    $query = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY);
    $forward = $path.(is_string($query) && $query !== '' ? '?'.$query : '');
    (new UpstreamProxy($installation))->forward($forward, $method);
}

header('Content-Type: application/json; charset=utf-8');

if ($path === '/api/health') {
    if ($method !== 'GET') {
        header('Allow: GET');
        http_response_code(405);
        echo '{"error":"method_not_allowed"}';

        return;
    }
    try {
        $api = new FonitasApi($installation);
        if ($api->bindingIsValid()) {
            echo '{"status":"ready"}';

            return;
        }
        http_response_code(503);
        echo '{"error":"installation_binding_invalid"}';
    } catch (RuntimeException) {
        http_response_code(503);
        echo '{"error":"installation_unavailable"}';
    }

    return;
}

if ($path === '/api/bound-application') {
    if ($method !== 'GET') {
        header('Allow: GET');
        http_response_code(405);
        echo '{"error":"method_not_allowed"}';

        return;
    }
    try {
        $api = new FonitasApi($installation);
        $bound = $api->boundApplication();
        echo json_encode([
            'application_id' => $bound['application_id'],
            'name' => $bound['name'],
            'status' => $bound['status'],
        ], JSON_THROW_ON_ERROR);
    } catch (RuntimeException) {
        http_response_code(503);
        echo '{"error":"installation_binding_invalid"}';
    }

    return;
}

http_response_code(404);
echo '{"error":"not_found"}';
