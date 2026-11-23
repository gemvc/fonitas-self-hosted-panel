# Working on the self-hosted developer panel

Start with [the engineering handbook](docs/engineering.md). Its opening table identifies the runtime, owning repository, and entry point for each kind of task. Use the handbook to reach the code that owns the behavior you are changing.

- For product work, read the [OEM product direction](docs/engineering.md#product-direction-for-the-oem-dashboard). The local dashboard is **customer-only** (`APP_END_USER`). For released behavior, follow the current contracts and implementation linked in the same handbook.
- Identify whether the task concerns the static ZIP, the PHP OEM dashboard, the hosted developer portal, or the Symfony API. Say which modes are affected in the PR.
- Verify API fields and permissions against the Symfony route, request DTO, service, and consumer. Verify publication or deployment separately before reporting live behavior. Label any claims you could not verify.
- Use **existing Identity and organization keys only**. Do not invent panel-only role names. Local access requires `APP_END_USER` ([`src/roles.ts`](src/roles.ts)). See [local customer workspace](docs/engineering.md#local-customer-workspace-static-ui).
- Keep **domain / connection-key** installation binding. Add an **application API key** for software detection only with a verified Symfony contract. During development, allow HTTPS domains and localhost; before production lock-down, reject localhost in [`src/origin.ts`](src/origin.ts), PHP `PANEL_DEV_ALLOW_LOCALHOST`, and Symfony `DeveloperPanels::ALLOW_LOCALHOST_ORIGINS`. See [installation detection](docs/engineering.md#installation-detection-api-key-and-domain), [origin policy](docs/engineering.md#origin-policy-domain-and-localhost), and [next steps](docs/engineering.md#next-steps).
- Keep installation credentials and management state in PHP. Keep OEM browser requests on the installed origin. Resolve application scope from the installation in Symfony.
- Follow the handbook’s [development and verification workflow](docs/engineering.md#development-workflow) for the affected paths. Update the handbook in the same change when a contract, deployment requirement, or release procedure changes.
