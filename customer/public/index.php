<?php

declare(strict_types=1);

use Fonitas\Customer\FonitasApi;
use Fonitas\Customer\Installation;

require dirname(__DIR__).'/src/Installation.php';
require dirname(__DIR__).'/src/FonitasApi.php';

header('Cache-Control: no-store');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path !== '/api/health') {
    http_response_code(404);
    echo '{"error":"not_found"}';

    return;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo '{"error":"method_not_allowed"}';

    return;
}

try {
    $api = new FonitasApi(Installation::load(__DIR__));
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
