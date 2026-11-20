# Working on the self-hosted developer panel

Start with [the engineering handbook](docs/engineering.md). Its opening table identifies the runtime, owning repository, and entry point for each kind of task. Use the handbook to reach the code that owns the behavior you are changing.

- Identify whether the task concerns the static ZIP, the PHP OEM dashboard, the hosted developer portal, or the Symfony API. Say which modes are affected in the PR.
- Verify API fields and permissions against the Symfony route, request DTO, service, and consumer. Verify publication or deployment separately before reporting live behavior. Label any claims you could not verify.
- Keep installation credentials and management state in PHP. Keep OEM browser requests on the installed origin. Resolve application scope from the installation in Symfony.
- Follow the handbook’s [development and verification workflow](docs/engineering.md#development-workflow) for the affected paths. Update the handbook in the same change when a contract, deployment requirement, or release procedure changes.
