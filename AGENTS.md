# Working on the self-hosted developer panel

Start with [the engineering handbook](docs/engineering.md). Its opening table identifies the runtime, owning repository, and entry point for each kind of task. Use the handbook to reach the code that owns the behavior you are changing.

- For product work, read the [OEM product direction](docs/engineering.md#product-direction-for-the-oem-dashboard). For released behavior, follow the current contracts and implementation linked in the same handbook.
- Identify whether the task concerns the static ZIP, the PHP OEM dashboard, the hosted developer portal, or the Symfony API. Say which modes are affected in the PR.
- Verify API fields and permissions against the Symfony route, request DTO, service, and consumer. Verify publication or deployment separately before reporting live behavior. Label any claims you could not verify.
- Use **existing Identity and organization keys only** (`APP_OWNER`, `APP_ADMIN`, `APP_END_USER`, `support.ticket.assign`, `ORG_ADMIN`, `ORG_MEMBER`, …). Do not invent panel-only role names. Confirm application-tenant seeding in Symfony `TenantRoleProvisioner` and map UI homes in [`src/roles.ts`](src/roles.ts). Prefer permissions for action gates. See [local role workspaces](docs/engineering.md#local-role-workspaces-static-ui).
- Keep installation credentials and management state in PHP. Keep OEM browser requests on the installed origin. Resolve application scope from the installation in Symfony.
- Follow the handbook’s [development and verification workflow](docs/engineering.md#development-workflow) for the affected paths. Update the handbook in the same change when a contract, deployment requirement, or release procedure changes.
