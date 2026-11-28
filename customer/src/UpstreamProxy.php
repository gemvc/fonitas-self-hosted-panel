<?php

declare(strict_types=1);

namespace Fonitas\Customer;

/**
 * Same-origin reverse proxy to the Fonitas REST API (Identity cookie bridge + customer APIs).
 * Rewrites Set-Cookie Domain so browser cookies bind to the OEM host.
 */
final class UpstreamProxy
{
    private const UPSTREAM = 'https://api.fonitas.com';
    private const BODY_LIMIT = 2_097_152;

    public function __construct(private Installation $installation)
    {
    }

    public function forward(string $pathWithQuery, string $method): never
    {
        if (!extension_loaded('curl')) {
            $this->fail(503, '{"error":"proxy_unavailable"}');
        }
        if (!str_starts_with($pathWithQuery, '/api/v1')) {
            $this->fail(404, '{"error":"not_found"}');
        }

        $url = self::UPSTREAM.$pathWithQuery;
        $curl = curl_init($url);
        if ($curl === false) {
            $this->fail(503, '{"error":"proxy_unavailable"}');
        }

        $headers = [
            'Accept: application/json',
            'Origin: '.$this->installation->origin,
        ];
        $contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
        if (is_string($contentType) && $contentType !== '') {
            $headers[] = 'Content-Type: '.$contentType;
        }
        $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (is_string($csrf) && $csrf !== '') {
            $headers[] = 'X-CSRF-Token: '.$csrf;
        }
        $cookie = $_SERVER['HTTP_COOKIE'] ?? '';
        if (is_string($cookie) && $cookie !== '') {
            $headers[] = 'Cookie: '.$cookie;
        }
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (is_string($auth) && $auth !== '') {
            $headers[] = 'Authorization: '.$auth;
        }

        $body = '';
        if (!in_array(strtoupper($method), ['GET', 'HEAD'], true)) {
            $raw = file_get_contents('php://input');
            $body = is_string($raw) ? $raw : '';
            if (strlen($body) > self::BODY_LIMIT) {
                $this->fail(413, '{"error":"payload_too_large"}');
            }
        }

        $responseHeaders = [];
        curl_setopt_array($curl, [
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_POSTFIELDS => $body === '' ? null : $body,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HEADERFUNCTION => static function ($handle, string $header) use (&$responseHeaders): int {
                $len = strlen($header);
                $line = trim($header);
                if ($line === '' || str_starts_with(strtolower($line), 'http/')) {
                    return $len;
                }
                $responseHeaders[] = $line;

                return $len;
            },
            CURLOPT_RETURNTRANSFER => true,
        ]);

        $responseBody = curl_exec($curl);
        if ($responseBody === false) {
            $this->fail(502, '{"error":"upstream_unavailable"}');
        }
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);

        http_response_code($status > 0 ? $status : 502);
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');

        foreach ($responseHeaders as $header) {
            $lower = strtolower($header);
            if (str_starts_with($lower, 'transfer-encoding:')) {
                continue;
            }
            if (str_starts_with($lower, 'content-length:')) {
                continue;
            }
            if (str_starts_with($lower, 'set-cookie:')) {
                header('Set-Cookie: '.$this->rewriteSetCookie(substr($header, strlen('Set-Cookie:'))), false);
                continue;
            }
            if (str_starts_with($lower, 'content-type:')
                || str_starts_with($lower, 'x-request-id:')
                || str_starts_with($lower, 'retry-after:')
                || str_starts_with($lower, 'www-authenticate:')) {
                header($header, false);
            }
        }

        echo is_string($responseBody) ? $responseBody : '';
        exit;
    }

    private function rewriteSetCookie(string $value): string
    {
        $parts = array_map('trim', explode(';', $value));
        $out = [];
        foreach ($parts as $i => $part) {
            if ($i === 0) {
                $out[] = $part;
                continue;
            }
            $lower = strtolower($part);
            if (str_starts_with($lower, 'domain=')) {
                continue;
            }
            $out[] = $part;
        }

        return implode('; ', $out);
    }

    private function fail(int $status, string $json): never
    {
        http_response_code($status);
        header('Cache-Control: no-store');
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        echo $json;
        exit;
    }
}
