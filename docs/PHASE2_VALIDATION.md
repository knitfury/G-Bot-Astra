# Phase 2 validation record

## Executed locally

| Check | Observed result |
| --- | --- |
| `npm ci` | Passed from the committed lockfile |
| `npm run typecheck` | Passed |
| `npm test` | 19 passed, 0 failed; all original service, migration and ten-theme contrast tests |
| `npm run test:desktop` | 30 passed, 0 failed |
| `npm run build` | Passed; optimized Next.js production output |
| `npm run desktop:build` | Passed; production renderer plus bundled main/preload |
| `npm run test:e2e` | 20 passed, 0 failed (3.2 minutes): all 19 original browser tests plus Phase 2 acceptance |
| Focused Phase 2 browser test after responsive/retry fixes | 1 passed, 0 failed |
| `npm audit --json` | 0 vulnerabilities after resolving Next's PostCSS dependency to 8.5.28 |
| `git diff --check` and credential-pattern review | Passed; fixtures use synthetic credentials |

Local Electron launch is blocked by this managed Linux environment's process-singleton Unix-socket restriction. Native verification therefore runs on Windows and macOS GitHub Actions. It is not reported as a local native pass.

## Automated native verification

`.github/workflows/ci.yml` runs three jobs: browser/unit/integration verification on Ubuntu and Electron build/launch/package validation on Windows and macOS. Native smoke checks use the real production Next server and actual isolated Electron preload, not browser fixtures. They check Node isolation, rejected arbitrary IPC, local profile, appearance persistence, reload/restart, and the honest update prerequisite state. After packaging, the executable is launched and restarted again. No paid third-party credentials or release-signing credentials are used.

The first implementation checkpoint [35816065044](https://github.com/knitfury/G-Bot-Astra/actions/runs/35816065044) passed all three jobs, including Windows/macOS source Electron launch and unsigned unpacked package builds. Subsequent checkpoints expanded native tests to include process restart and packaged launch. Final native results are identified in the PR checks and engineering handoff; signing/notarization and live production update delivery remain external prerequisites.

## New integration/security coverage

- IPC operation allowlist, strict input validation and trusted sender identity.
- OS-vault abstraction save/get/replace/delete/clear, fail-closed encryption, concurrent saves without lost entries; no stored-secret return operation.
- Atomic persistence, version-envelope migration, corrupt-file preservation, nested-state rejection and interrupted approval recovery.
- OpenAI SSE fragments, Anthropic text/tool streaming, Gemini native function calls/signatures, Generic REST mapping, cancellation, auth/rate/network/timeout errors, malformed/truncated responses.
- Real official SDK MCP server over loopback Streamable HTTP: bearer auth, default-disabled discovery, semantic risk, calls, reconnect and preserved permissions.
- OAuth state/CSRF and single-use loopback callback, encrypted token lifecycle abstraction.
- Autonomous cross-app reads, exact approval binding, rejection without writes, approved execution once, changed-schema/parameter rejection, hallucinated/invalid calls, partial retry without repeating successful reads, repeated-call and 12-round limits.
- Entitlement limits and non-destructive downgrade; attachment safeguards; payload-free local diagnostics.

The end-to-end test in `tests/e2e/desktop.spec.ts` drives the production React UI through a test-only bridge into the real `Runtime` with deterministic provider/MCP adapters. It creates/tests a provider, adds two manually authenticated endpoints, enables discovered tools, performs automatic cross-app reads, rejects and approves writes, recovers from expired auth via reconnect, retries only unfinished work and verifies durable preferences/history and secret masking. Update states are injected only in this test fixture. Production uses electron-updater events.

## Visual review

Inspected captured production-renderer screenshots in Orange Light, Orange Dark, Neutral Light and Neutral Dark at 1440, 768 and 390 pixels. Coverage: provider setup/list, OAuth/manual setup, tool permissions, execution, approval, partial failure, connected apps, Activity, settings and update/error states. Browser assertions check document overflow and chat-column bounds.

Review found and fixed:

1. Real Inventory MCP capabilities were being passed into the demo SKU view, causing a workspace crash. Real panes now render generic discovered tools.
2. Responsive hydration briefly squeezed/moved chat offscreen. Desktop columns are hidden by CSS before hydration, and layout movement avoids scaling text.
3. Demo credential/transport/message labels appeared in real mode. Runtime-specific copy now describes real requests and protected credentials.
4. Partial retry retained an obsolete error message. Successful retries now preserve useful prior content and replace the failed attempt's output.
5. Native update smoke selection collided with Next's hidden route announcer. The test identifies the specific user-visible update error.
6. Restart reopened the welcome screen despite an existing local profile. Desktop startup now restores the saved workspace.
7. Packaged runtime must not require a development TypeScript compiler merely to load Next configuration; configuration is plain ESM with type documentation.

Representative screenshots (synthetic fixture data only):

| View | Screenshot |
| --- | --- |
| Orange Light workspace | [Workspace](screenshots/phase2/orange-light-1440-workspace.webp) |
| Orange Dark workspace | [Workspace](screenshots/phase2/orange-dark-1440-workspace.webp) |
| Neutral Light tablet | [Workspace](screenshots/phase2/neutral-light-768-workspace.webp) |
| Neutral Dark narrow | [Workspace](screenshots/phase2/neutral-dark-390-workspace.webp) |
| Exact action approval | [Approval](screenshots/phase2/approval-light.webp) |
| OAuth setup, dark | [OAuth](screenshots/phase2/orange-dark-oauth-setup.webp) |
| Manual credential setup, narrow | [Manual auth](screenshots/phase2/neutral-dark-manual-setup.webp) |
| Update failure, narrow | [Update](screenshots/phase2/update-failed.webp) |

## Scope of evidence

No live paid-provider key, real production OAuth authorization, code-signing certificate, notarization account or publishing secret was supplied. Deterministic tests validate adapter contracts and policy, not every vendor deployment. The real SDK server test validates actual MCP networking. Native CI verifies real Electron execution; browser fixtures alone are not represented as proof of native security. Unsigned packages are engineering review builds, not publicly released installers.
