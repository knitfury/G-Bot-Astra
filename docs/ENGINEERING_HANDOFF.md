# G-Bot Phase 1 — engineering handoff

## Delivered application

A desktop-first business workspace using Next.js 15, React 19, strict TypeScript, Tailwind CSS v4, locally owned shadcn-style Radix primitives, Phosphor Icons, Framer Motion, Zustand, TanStack Query, React Hook Form and Zod.

All account, AI, MCP, subscription, execution, approval, attachment, credential and update behavior is simulated in the frontend. No real keys are needed.

## Run

Use Node.js 20.9+; Node 22 LTS recommended.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. **Explore the demo** loads a fictional Business account, eight connected apps, a demo provider and three coherent customer datasets. **Create account** starts the onboarding journey with Free's one-active-app allowance.

```sh
npm run typecheck
npm test
npm run build
npm start
```

Development output uses `.next-dev`; production uses `.next` so a development watcher cannot interfere with production builds. A PWA manifest and scalable icon are included. The standard Vercel Next.js preset can build this frontend without environment variables. No service worker or native installer is implemented.

## Routes and features

| Route | Purpose |
| --- | --- |
| `/` | Welcome and populated demo launch |
| `/signup`, `/login` | Validated mock authentication, password visibility, reset and error states |
| `/onboarding` | Plan → AI provider → business app setup |
| `/workspace` | G-Bot chat, independent app panes, resizing, attachments, execution and approvals |
| `/connections` | Eight visible slots, plan gates, connection states and setup |
| `/connections/:id` | Overview, authentication, tools, permissions, activity and advanced details |
| `/providers` | Multiple providers, discovery, tests, custom OpenAI-compatible and Generic REST setup |
| `/activity` | Business audit events filtered by app, status, action, date and conversation |
| `/account` | Profile, mock upgrade/downgrade, entitlement and secure logout |
| `/settings` | General, five colors with independent light/dark appearance, privacy, diagnostics and desktop update simulation |

Tablet/mobile views expose app context through dialogs rather than squeezing three columns together. Conversation history and pane/theme/model preferences survive refresh. Text drafts survive management-route navigation.

## Demo walkthroughs

### Email and inventory

1. Explore the demo and choose **Turn an email into a done deal**.
2. Send the prompt. Email finds Maya Dawson of Dawson Studio, order DS-1042, requesting 12 Arc Desk Lamps.
3. Inventory finds 24 units of ARC-120-S in Chennai. The prepared draft does not promise an unverified delivery date.
4. Choose **Send this response**, then send that request.
5. Inspect or edit the approval card. Approve or reject explicitly.
6. Approval creates a simulated completion and audit event. No real email is delivered.

### Support

Ask “Summarize Leo at Northwind's issue and create a support ticket.” Email and CRM supply the customer/order context. A Helpdesk write is held for approval. Approval returns a simulated ticket identifier and audit event.

### Partial failure

In Settings → Advanced, enable **Inventory unavailable**. Ask about Maya's email and stock. Email succeeds; Inventory fails. The successful result remains visible and unfinished actions are explained. Turn off the failure, return to the conversation, and choose **Retry remaining steps**. Email is not rerun.

### Plan changes

Free = 1, Starter = 5, Business = 8. All eight slots remain visible. Business → Starter retains all configurations while pausing slots 6–8. Free pauses slots 2–8. Restoring a plan restores access. Expired entitlement pauses every app. Both tool execution and approval resolution recheck entitlement and permission.

## Service architecture

`src/services/index.ts` is the composition root. UI uses this root and query hooks instead of importing mock datasets. Contracts live in `src/services/contracts/index.ts`; mock implementations are in `src/services/mocks`; datasets are in `src/data/mocks`.

| Boundary | Phase 1 / Phase 2 replacement |
| --- | --- |
| AuthService | Mock account transitions / identity and sessions |
| AccountService | Local profile and preferences / account service |
| EntitlementService | Central plan simulation / cloud entitlement API |
| AIProviderService | Configuration and mock discovery / BYOK adapters |
| MCPConnectionService | OAuth, health and normalized context simulation / MCP runtime |
| MCPToolService | Discovered tools and permissions / trusted tool registry |
| ConversationService | Browser-local CRUD and feedback / desktop persistence |
| ToolExecutionService | Observable orchestration, stop and resumable failure / execution runtime |
| ApprovalService | Editable approval, rejection, idempotence and revalidation / transactional actions |
| ActivityService | Sanitized business audit events / durable audit stream |
| AttachmentService | Metadata, previews and validation / processing pipeline |
| SecureStorageService | Discarded keys and masked state / encrypted native keychain |
| UpdateService | Available/downloading/restart simulation / signed updater |

TanStack Query manages snapshots and context queries. Service mutations publish invalidations. Zustand owns client preferences, theme, pane widths, selected conversation/model and text drafts. React Hook Form + Zod validate authentication, provider and connection forms. Keys are discarded; advanced headers are test-only and discarded after saving. No full keys are included in activity.

The versioned mock database uses `gbot-demo-v1` in browser storage. Preferences use `gbot-workspace-v1`. In-progress requests/connections become interrupted states after reload. Storage failures leave the active session usable but do not guarantee durability.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright starts the production server on `127.0.0.1:3100`, captures screenshots, and retains traces on failure. Reports are ignored by git. The final results and reviewed viewports are recorded in [VALIDATION.md](VALIDATION.md).

If the Playwright browser CDN is inaccessible on Linux, an optional npm-distributed browser fallback is provided:

```sh
npm run test:prepare-browser
# Run the GBOT_BROWSER_EXECUTABLE command printed by that script.
```

The fallback affects only the test browser, not application behavior.

## Deliberate limits

- Responses are deterministic demo workflows, not general AI inference. The supported examples cover stock/draft replies, support tickets and invoice summaries. Maya, Leo and Amara are fictional linked customers.
- Arbitrary endpoints configure mock adapters; they do not fetch or embed real third-party apps. REST test requests are simulated.
- Files are not analyzed by AI. Metadata, image previews, type/size errors and URL validation are implemented: five attachments maximum, 10 MB each; embedded image previews only below 2 MB.
- Mock login is not authentication. There is no backend, production database, payment processing or real licensing.
- Client-side plan checks demonstrate behavior, not tamper-resistant enforcement. Phase 2 must enforce entitlements at trusted execution boundaries.
- Native encrypted credential storage is deferred. Logout clears credential state and disconnects integrations while preserving local configuration/history.
- Startup, notification and update preferences represent future desktop behavior. No OS notifications, native APIs, signed updates, Windows installer or macOS package are implemented.
- PWA-ready does not imply installable offline operation; no service worker or guaranteed offline reload is claimed.
- Validation uses Chromium. Firefox/Safari, assistive-technology certification and native desktop QA remain release follow-ups.

## Phase 2 priorities

1. Add identity/session and trusted cloud entitlement contracts.
2. Replace browser credential/conversation storage with versioned native adapters.
3. Add real BYOK inference and model-capability discovery.
4. Implement MCP transport, OAuth, discovery and normalized context.
5. Connect streamed execution and cancellation while retaining explicit approvals and fresh permission checks.
6. Make writes transactional/idempotent and durably audited.
7. Add actual attachment processing, notifications, packaging, signing and updates.

The private attached specification is intentionally excluded from the public repository.
