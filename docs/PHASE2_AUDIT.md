# Phase 2 contract audit

Baseline: main 9bbe3f0, tree 4e58ba5. Phase 1 and all ten theme variants are present.

Read engineering handoff, validation/theme records, service registry/contracts, mock database/orchestrator, domain models, workspace persistence, approval/provider/connection UI and service/browser tests before implementation.

The composition root exports `Services`; pages consume it through Query hooks. Preserve this boundary and deterministic browser mock services. Desktop uses a typed preload client and trusted runtime implementations. No SDK or filesystem imports belong in React.

| Existing boundary | Desktop replacement |
| --- | --- |
| Auth/Account | Explicit local profile, no false cloud-authentication claim |
| Entitlement | Central development entitlement service; remote authority remains deployment prerequisite |
| Providers | Direct trusted HTTP adapters for OpenAI-compatible, Anthropic, Gemini and mapped REST |
| Connections/Tools | Official remote MCP SDK; secure auth; discovered schemas and explicit permissions |
| Conversations/Activity | Versioned atomic local state; interrupted-run recovery |
| Execution/Approval | Bounded model/tool loop; exact argument binding; durable execution intent |
| Attachments | Native picker and bounded trusted file processing |
| SecureStorage | OS-backed Electron safeStorage, fail closed if unavailable |
| Updates | Signed-release updater states; no simulated production success |
| Workspace | Existing color/mode/panes/drafts with desktop persistence adapter |

Necessary additive model changes: generic JSON tool schemas/approval arguments, connection auth options/states, typed runtime errors, desktop/update metadata. Existing demo approval fields remain supported. Generic MCP servers cannot provide the demo's vendor-specific business records automatically; panes show actual connection/tool context instead of fabricated vendor records.

Preserve all existing tests; add boundary, adapters, OAuth, persistence, orchestration and native smoke coverage. Windows/macOS signing, notarization and provider-specific OAuth registrations require owner infrastructure.
