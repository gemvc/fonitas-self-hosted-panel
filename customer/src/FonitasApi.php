<?php

declare(strict_types=1);

namespace Fonitas\Customer;

final readonly class FonitasApi
{
    private const APPLICATION = 'https://api.fonitas.com/api/v1/developer-panels/oem/application';
    private const RESPONSE_LIMIT = 16_384;

    public function __construct(private Installation $installation)
    {
    }

    /**
     * @return array{status: int, body: string}
     */
    private function fetchApplication(): array
    {
        if (!extension_loaded('curl')) {
            throw new \RuntimeException('PHP cURL is unavailable.');
        }
        $curl = curl_init(self::APPLICATION);
        if ($curl === false) {
            throw new \RuntimeException('Could not initialize the API client.');
        }
        $body = '';
        curl_setopt_array($curl, [
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Origin: '.$this->installation->origin,
                'Authorization: Bearer '.$this->installation->token,
            ],
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body): int {
                if (strlen($body) + strlen($chunk) > self::RESPONSE_LIMIT) {
                    return 0;
                }
                $body .= $chunk;

                return strlen($chunk);
            },
        ]);
        if (curl_exec($curl) === false) {
            throw new \RuntimeException('Fonitas API is unavailable.');
        }
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);

        return ['status' => $status, 'body' => $body];
    }

    public function bindingIsValid(): bool
    {
        $response = $this->fetchApplication();

        return $this->matchesBinding($response['status'], $response['body']);
    }

    /**
     * Public allowlisted binding for the OEM buyer UI (no credential leak).
     *
     * @return array{application_id: string, name: string|null, status: string|null}
     */
    public function boundApplication(): array
    {
        $response = $this->fetchApplication();
        if (!$this->matchesBinding($response['status'], $response['body'])) {
            throw new \RuntimeException('Installation binding is invalid.');
        }
        $payload = json_decode($response['body'], true);
        $application = is_array($payload) ? ($payload['data']['application'] ?? null) : null;
        $id = is_array($application) ? ($application['public_id'] ?? null) : null;
        if (!is_string($id)) {
            throw new \RuntimeException('Invalid application response from Fonitas.');
        }
        $name = is_array($application) && is_string($application['name'] ?? null) ? $application['name'] : null;
        $status = is_array($application) && is_string($application['status'] ?? null) ? $application['status'] : null;

        return [
            'application_id' => $id,
            'name' => $name,
            'status' => $status,
        ];
    }

    public function matchesBinding(int $status, string $body): bool
    {
        if (in_array($status, [401, 403, 404], true)) {
            return false;
        }
        if ($status !== 200) {
            throw new \RuntimeException('Fonitas API is unavailable.');
        }
        $id = json_decode($body, true)['data']['application']['public_id'] ?? null;
        if (!is_string($id)) {
            throw new \RuntimeException('Invalid application response from Fonitas.');
        }

        return hash_equals($this->installation->applicationId, $id);
    }
}
