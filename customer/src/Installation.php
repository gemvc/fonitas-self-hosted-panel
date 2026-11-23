<?php

declare(strict_types=1);

namespace Fonitas\Customer;

final readonly class Installation
{
    private function __construct(
        public string $applicationId,
        #[\SensitiveParameter] public string $token,
        public string $origin,
    ) {
    }

    public static function load(string $publicRoot): self
    {
        $directory = dirname($publicRoot);
        $path = $directory.'/.env';
        if (is_link($path) || !is_file($path) || !is_readable($path) || (fileperms($path) & 0077) !== 0) {
            throw new \RuntimeException('Installation configuration is missing or its permissions are invalid.');
        }
        $settings = @parse_ini_file($path, false, INI_SCANNER_RAW);
        if ($settings === false) {
            throw new \RuntimeException('Installation configuration could not be read.');
        }

        return self::fromSettings($settings);
    }

    /** @param array<string, mixed> $settings */
    public static function fromSettings(#[\SensitiveParameter] array $settings): self
    {
        $id = $settings['APP_ID'] ?? null;
        $token = $settings['DOMAIN_TOKEN'] ?? null;
        $origin = $settings['PANEL_ORIGIN'] ?? null;
        if (!is_string($id) || !preg_match('/\A[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\z/', $id)
            || !is_string($token) || !preg_match('/\Afpi_[0-9a-f]{64}\z/', $token)
            || !is_string($origin) || !self::isOrigin($origin)) {
            throw new \RuntimeException('Installation configuration is invalid.');
        }

        return new self($id, $token, $origin);
    }

    /** Development-phase: allow loopback. Set false before production lock-down. */
    private const bool ALLOW_LOCALHOST_ORIGINS = true;

    private static function isOrigin(string $origin): bool
    {
        if (self::ALLOW_LOCALHOST_ORIGINS
            && preg_match('~\A(https|http)://(localhost|127\.0\.0\.1|\[::1\])(?::([1-9][0-9]{0,4}))?\z~', $origin, $loopback) === 1) {
            if (!isset($loopback[3])) {
                return true;
            }
            $defaultPort = $loopback[1] === 'https' ? 443 : 80;
            $port = (int) $loopback[3];

            return $port >= 1 && $port <= 65535 && $port !== $defaultPort;
        }

        if (strlen($origin) > 268
            || !preg_match('~\Ahttps://(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([1-9][0-9]{0,4}))?\z~', $origin, $parts)) {
            return false;
        }
        $port = isset($parts[2]) ? (int) $parts[2] : null;
        if ($port === 443 || ($port !== null && $port > 65535)) {
            return false;
        }

        return str_starts_with($parts[1], '[')
            ? filter_var(substr($parts[1], 1, -1), FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false
            : filter_var($parts[1], FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) !== false;
    }
}
