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
            || !is_string($origin) || !self::isOrigin($origin, $settings)) {
            throw new \RuntimeException('Installation configuration is invalid.');
        }

        return new self($id, $token, $origin);
    }

    /**
     * Fail-closed: loopback only when APP_ENV is dev|development and PANEL_ALLOW_LOCALHOST is true.
     * Values may come from the installation `.env` (parsed settings) or process environment.
     *
     * @param array<string, mixed> $settings
     */
    private static function allowsLocalhost(array $settings = []): bool
    {
        $rawEnv = $settings['APP_ENV'] ?? getenv('APP_ENV');
        $rawFlag = $settings['PANEL_ALLOW_LOCALHOST'] ?? getenv('PANEL_ALLOW_LOCALHOST');
        $env = strtolower((string) ($rawEnv !== false && $rawEnv !== null && $rawEnv !== '' ? $rawEnv : 'production'));
        $flag = strtolower((string) ($rawFlag !== false && $rawFlag !== null && $rawFlag !== '' ? $rawFlag : 'false'));
        $dev = $env === 'dev' || $env === 'development';
        $enabled = in_array($flag, ['1', 'true', 'yes'], true);

        return $dev && $enabled;
    }

    /** @param array<string, mixed> $settings */
    private static function isOrigin(string $origin, array $settings = []): bool
    {
        if (self::allowsLocalhost($settings)
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
