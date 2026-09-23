# Phase 2 engineering handoff

## Review and run

Branch: `phase-2/integrations`, targeting `main`. Leave the PR unmerged for manual review. This continues the merged Phase 1 and ten-theme baseline; it does not create a second application or cloud proxy.

Use Node 22 LTS and npm on Windows or macOS. Linux can run browser/tests but is not a release target.

```sh
git fetch origin
git switch phase-2/integrations
npm ci
npm run desktop:build
npm run desktop:start
```

Real integration mode starts with an empty **local profile**. Open the workspace, add a provider/model and test it, then configure remote MCP endpoints. Testing and saving a provider each make a small real inference request and may incur provider charges. Enter credentials only in the dedicated credential/custom-header fields. No `.env` or cloud account is required.

Browser demo, completely deterministic and requiring no paid credentials:

```sh
npm run dev
# http://localhost:3000 → Explore the demo
```

After `desktop:build`, `npm run desktop:demo` opens that same demo in Electron without a privileged preload. Demo data is separate from the real profile. Tests inject fixtures explicitly; the real desktop never imports test adapters.

## Architecture and contracts

`src/services/index.ts` chooses the existing mock implementations in browsers and the typed desktop client when preload exists. Existing `Services` interfaces, query hooks, Zustand theme/pane/model state and React pages remain the application boundary.

| Layer | Responsibility |
| --- | --- |
| Next/React renderer | Forms, streaming output, history, permissions, approval, Activity, settings, ten themes |
| `desktop/preload.ts` | Frozen `call` and change-subscription bridge; no Node/Electron primitives |
| `desktop/runtime/ipc.ts` | Explicit operation allowlist, Zod argument and size validation, window/main-frame/origin checks |
| `desktop/main.ts` | Isolated Electron lifecycle, loopback renderer server, safeStorage, file dialogs, external browser, updater |
| `desktop/runtime/service.ts` | Durable Services implementation and composition around injected adapters |
| `desktop/adapters/` | Direct provider HTTP, official MCP SDK transport, OAuth/PKCE |
| `desktop/runtime/orchestrator.ts` | Tool selection, policy, schema validation, bounded execution, approval and recovery |
| Storage/diagnostics | Atomic versioned local files; OS-encrypted credentials; payload-free structured diagnostic codes |

The production Next server binds only to `127.0.0.1` on a random port and checks Host. It renders UI only: credentials and integrations use IPC, not HTTP routes. Renderer Node integration is off, context isolation and sandbox are on, permissions/webviews are denied, foreign navigation is blocked and external HTTPS links open in the system browser. Production CSP uses per-request nonces and denies foreign scripts, framing and objects. Packaged developer tools are disabled.

The Electron process executes trusted application code only. MCP is remote HTTP; there is no arbitrary shell, filesystem-path, child-process or stdio API exposed to the renderer.

## Providers

| Adapter | Supported behavior |
| --- | --- |
| OpenAI-compatible and custom OpenAI | `/chat/completions`, SSE text/tool argument fragments, image input, native tool-result messages |
| Anthropic-compatible | `/v1/messages`, SSE text and tool blocks, images and tool results |
| Gemini-compatible | `/v1beta/models/{model}:streamGenerateContent?alt=sse`, text/images/function calls, opaque function thought-signature preservation |
| Generic REST | POST endpoint, Bearer/API-key/no-auth plus secure custom headers, JSON template placeholders, safe input/response paths, text-only response |

All standard adapters also accept JSON responses from compatible gateways. Credentials go in headers, never provider URLs. Redirects are rejected. Requests have cancellation, 90-second timeout and 4 MB response limits; typed auth/rate-limit/network/malformed/capability errors hide raw server bodies. SSE truncation reports failure rather than silently treating a partial answer as complete. Private reasoning blocks are not rendered.

Base URLs are the API root for each protocol: OpenAI normally includes `/v1`; Anthropic and Gemini omit protocol suffixes because the adapter adds them. Model identifiers must be provided by the user; successful tests confirm that configured model rather than pretending to enumerate the provider catalogue. Multiple connections can coexist; the chosen model is independent of MCP and pane selections. Optional organization/project values can be supplied through protected custom headers.

Generic REST supports `{{model}}`, `{{system}}`, `{{input}}` substitution inside JSON values and explicit input/response mapping paths. It intentionally rejects GET inference, streaming and tool/image orchestration. Choose custom OpenAI compatibility for those capabilities. Tool JSON schemas must be supported by the chosen provider/model; vendor-specific reasoning and generation options are not exposed in this phase.

## MCP, authentication and health

Uses official stable `@modelcontextprotocol/sdk` 1.30.0 and `StreamableHTTPClientTransport`; no obsolete SSE-only transport or local server execution. HTTPS is required, with loopback HTTP allowed for development. Pagination is bounded to 20 pages/500 tools; individual schemas to 50 KB; calls to 60 seconds and 200 KB results. Reconnect refreshes discovery. A 60-second ping monitors established clients and marks degraded/healthy state. Expired authorization pauses use and requires reconnect.

Manual authentication supports Bearer (`Authorization`), arbitrary API-key header names, no-auth endpoints and protected JSON custom headers. Invalid/unsafe headers and credentials in endpoint URLs are rejected.

OAuth uses SDK discovery, public-client registration or a supplied public client ID, PKCE, random timing-safe state validation and a single-use loopback callback at `http://127.0.0.1:43827/oauth/callback`. Authorization opens in the system browser, times out after two minutes and never exposes refresh tokens to React. Token refresh uses the SDK and encrypted vault. Background health/tool use can refresh tokens but cannot silently open a new authorization browser; interactive reconnect is required. Disconnect deletes manual credentials, OAuth tokens and client registration. Providers requiring confidential-client secrets or a different redirect registration need owner/server configuration.

New and materially changed tools are **disabled** until explicitly enabled. Tool descriptions and schemas come from discovery; category is a display choice, not a vendor binding. Desktop side panes show actual discovered capabilities without assuming a vendor's business-record schema. User requests can use any entitled, connected, enabled tool, regardless of visible panes.

## Orchestration, approval and recovery

Models receive only enabled tools (up to 100 per round), selected conversation context and necessary results. Every call rechecks discovery, connection, plan, enabled permission and JSON-schema arguments. Sequential execution preserves successful read results when a later call fails. Retry in the same process resumes unfinished work; repeated identical calls and the 12-round limit stop loops. Unknown/hallucinated tools never execute.

Read-only MCP annotations allow autonomous research. Destructive/non-read/unknown actions require explicit approval; classification does not use HTTP method. Servers and their annotations remain a trust dependency: connect endpoints you control or trust and inspect permissions. Tool output cannot modify the application policy.

Approval displays connection, tool, consequence and exact parameters. A hash binds connection endpoint, tool/schema and parameters. Approval rechecks current access and rejects changed proposals and stale/replayed approvals. Rejection invokes no mutation. Started/completed/uncertain execution state is durably recorded. A failed or interrupted write is not automatically retried; inspect the external app before requesting another mutation. The application cannot guarantee remote exactly-once delivery after a network interruption.

Activity records connection, authorization, permission, tool, approval, entitlement and update events. It does not persist full raw MCP outputs by default. It does retain user prompts, model replies, proposed action parameters and execution metadata, which can contain business information.

## Storage, restart and privacy

Data lives under Electron's OS-specific `userData/real-v1` directory (typically `%APPDATA%/G-Bot/real-v1` on Windows and `~/Library/Application Support/G-Bot/real-v1` on macOS; Electron/app naming can vary during development):

- `credentials.json`: base64 ciphertext from asynchronous Electron safeStorage, backed by the OS. Encryption unavailable means saving fails closed. No credential-read IPC exists. Save/replace/delete operations serialize; UI gets a masked indicator only.
- `workspace.json`: versioned configuration, local profile, conversations, approvals, permissions and Activity. This is ordinary local JSON, not encrypted business storage.
- `preferences.json`: versioned theme, model, drafts and pane state; desktop uses IPC storage rather than browser localStorage.
- `diagnostics.jsonl`: timestamp, fixed event identifier and domain code only. No request arguments, authorization headers, prompts, replies or business payloads are accepted. Rotates at 1 MB with one previous file. Activity is separate.

Writes use temporary files and atomic rename. Invalid envelopes/nested state are preserved as `.corrupt-*` files before fresh state is opened. Valid legacy unwrapped state upgrades to the versioned envelope. Existing browser appearance migrations retain all six legacy themes and all ten current combinations. Browser demo is not silently imported into the real profile.

On restart, configurations, permissions, history and appearance survive. MCP transports start disconnected and require reconnect. Interrupted runs and pending approvals become cancelled; started writes become uncertain. Raw in-memory model/tool context is not replayed across restart. This protects against unintended repeat actions.

Native files and drag/drop support UTF-8 TXT/CSV/Markdown and PNG/JPEG/WebP. Files are capped at 10 MB, images 4 MB, text 200,000 characters and five attachments/request. Raw attachment context is bounded in memory; reattach after restart or cache eviction. Small image previews may be saved with conversation metadata. PDF/DOCX extraction is explicitly unsupported. URLs are sent as links, not automatically fetched.

Data flows:

| Recipient | Data and reason |
| --- | --- |
| Selected AI provider | Prompt, recent conversation, chosen attachments, enabled tool schemas, necessary tool results for inference |
| Configured MCP server / its OAuth authority | Protocol requests, tool arguments and authentication/refresh needed for requested access |
| Release hosting | Update metadata and package download only when the user requests an update |
| G-Bot-operated cloud | No account, inference, business-data or telemetry service is implemented |

Third-party provider processing is not local processing. Protect the OS account, full-disk encryption and backups. Deleting credentials disconnects integrations without deleting history; logout also removes stored credentials. Do not paste secrets into prompts or ordinary templates expecting credential-vault treatment.

## Entitlements and cloud boundary

The existing central `EntitlementService` contract and `src/lib/entitlements.ts` enforce Free 1, Starter 5, Business 8 in both UI and trusted orchestration. All eight slots remain visible; downgrade retains saved configurations. Current implementation is explicitly **development entitlements**, changeable from Account. It is not paid licensing or tamper-resistant enforcement. Replace this service with verified remote entitlements in Phase 3; do not proxy customer AI/MCP traffic through that service.

## Desktop packaging and updates

```sh
npm run desktop:package   # unpacked application for the current OS
npm run desktop:dist      # Windows NSIS; macOS DMG/ZIP
```

Electron-builder bundles the production Next renderer and main/preload. CI builds and tests Windows/macOS separately and launches source Electron plus packaged executables. The update integration uses electron-updater with checking, up-to-date, available, downloading, ready-to-install and failed states. Download/install are explicit. Development runs show the missing packaged-release prerequisite; no fake success is shown.

Production release prerequisites, not included secrets:

- Windows signing certificate/appropriate signing service (`CSC_LINK`, `CSC_KEY_PASSWORD` when using certificate signing).
- Apple Developer identity and signing credentials; notarization via `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` or configured App Store Connect credentials.
- Owner-authorized GitHub release publishing token (`GH_TOKEN`) in release CI only; never embed a repository token in the application. Configure public/reachable update metadata and signed NSIS/macOS ZIP assets. A private repository feed requires a separate safe distribution strategy.
- Verify app identity, installer icons, certificate continuity, macOS entitlements, update rollback and clean-machine installation before public release. Unsigned CI packages are review artifacts, not production releases.

`GBOT_HEADLESS=1` is used only by the local smoke script for restricted Linux runners. It never changes production BrowserWindow sandbox settings. `GBOT_BROWSER_EXECUTABLE` optionally supplies a Chromium executable for browser CI. No integration credentials are CI environment requirements.

## Validation and limitations

See [Phase 2 validation](PHASE2_VALIDATION.md) for exact executed results and visual findings. Live paid-provider accounts and real production OAuth servers were not supplied. Contract fixtures and a real SDK loopback MCP server cover deterministic behavior; they do not substitute for owner acceptance with the actual target services.

Other deliberate limits: Streamable HTTP only; no legacy SSE/stdio servers; local profile rather than cloud authentication; Generic REST text-only POST; no PDF/DOCX parsing or URL crawler; bounded tool/attachment/context sizes; no automatic run resume after restart; no signed/public release issued. Native startup/notification preference switches remain stored preferences and do not grant unavailable OS permissions.

## Phase 3 priorities

1. Configure signed/notarized release CI, public update hosting and clean-machine install/update/rollback checks.
2. Verify real target providers and MCP OAuth authorities with owner credentials; add compatibility fixtures from those deployments.
3. Implement verified account/subscription entitlements behind the existing contract, separate from inference/MCP data.
4. Add retention/export controls and optional encrypted business-history storage; larger document parsing with explicit consent.
5. Add server-specific action policy overrides, remote idempotency support and longer-running task recovery only with explicit safe semantics.

## Meaningful dependencies

- Electron 44: maintained desktop security boundary, native dialogs and OS safeStorage. [Security](https://www.electronjs.org/docs/latest/tutorial/security), [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage).
- Official MCP TypeScript SDK 1.30 stable: protocol validation, Streamable HTTP and OAuth. [Stable SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x).
- electron-builder / electron-updater: OS packaging and release update lifecycle. [Distribution](https://www.electron.build/auto-update.html).
- esbuild: bundles strict TypeScript main/preload without a duplicate frontend framework.
- PostCSS 8.5.28 is pinned under Next to remove the vulnerable transitive 8.4.31 copy without changing the Phase 1 framework major version.
- Ajv: validates discovered tool argument JSON schemas independently of model output.

Provider adapters use built-in fetch and documented APIs to keep compatible endpoints configurable: [OpenAI](https://platform.openai.com/docs/api-reference/chat), [Anthropic](https://docs.anthropic.com/en/api/messages-streaming), [Gemini](https://ai.google.dev/gemini-api/docs/function-calling).
