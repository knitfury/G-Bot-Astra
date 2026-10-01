# G-Bot Astra

**Ask once. Work across your business.**

A local-first Electron AI business workspace with real BYOK providers and remote MCP integrations, plus the preserved deterministic Phase 1 browser demo. G-Bot stays in the center; business apps sit in optional, resizable side panes. Includes onboarding, multiple BYOK providers, dynamic saved MCP connections, chat and attachments, cross-app execution, approvals, activity, plan simulation, and five colors with independent light/dark appearance.

![G-Bot desktop workspace](docs/screenshots/phase2/orange-light-1440-workspace.webp)

## Phase 3 production candidate

Use Node 22 LTS on Windows or macOS:

```sh
npm ci
npm run desktop:build
npm run desktop:start
```

Configure the public account endpoints and verification keys before building, then sign in through the production account flow. Add/test your AI provider and model, connect a remote MCP URL, and explicitly enable discovered tools. Authorized reads populate business snapshots; consequential actions require exact approval. Credentials, history and drafts are encrypted on the device. Demo runs locally in the same window with the live bridge disabled.

This branch is a release candidate, not a published release. Hosted auth/billing, real-service acceptance and production signing remain external gates. See [Phase 3 operations](docs/phase3/OPERATIONS.md), [UX remediation](docs/phase3/UX_REMEDIATION.md), [security and recovery](docs/phase3/SECURITY_AND_RECOVERY.md), and [external acceptance](docs/phase3/EXTERNAL_ACCEPTANCE.md).

`npm run desktop:package` creates an unpacked build; `npm run desktop:dist` creates installers for your OS. Signing, notarization and public update hosting require owner configuration. See the [Phase 2 handoff](docs/PHASE2_HANDOFF.md).

## Browser demo

Requires Node.js 20.9+; Node 22 LTS recommended.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. Choose **Explore the demo** for the populated Business workspace, or **Create account** for the complete onboarding journey. Use fictional details and demo keys only.

## Verify and run production

```sh
npm run typecheck
npm test
npm run build
npm start
```

Browser acceptance checks:

```sh
npx playwright install chromium
npm run test:e2e
```

## Engineering documentation

- [Phase 2 handoff](docs/PHASE2_HANDOFF.md) — desktop setup, architecture, credentials, providers, MCP, approval, privacy, release prerequisites and limitations
- [Phase 2 validation](docs/PHASE2_VALIDATION.md) — integration/security tests, desktop CI and visual review
- [Engineering handoff](docs/ENGINEERING_HANDOFF.md) — preserved Phase 1 behavior and contracts
- [Validation record](docs/VALIDATION.md) — build, service tests, browser journeys and visual review
- [Third-party notices](THIRD_PARTY_NOTICES.md)

Stack: Next.js 15 · React 19 · TypeScript · Tailwind CSS v4 · Radix/shadcn primitives · Phosphor Icons · Framer Motion · Zustand · TanStack Query · React Hook Form · Zod.

**Browser and `desktop:demo` mode are simulated.** Real integrations run only through the isolated Electron runtime. Never enter real credentials into the browser demo.

Additional checks: `npm run test:desktop` and, after a desktop build, `npm run test:electron`. CI runs all unit/theme/browser tests and Windows/macOS native launch/package checks without paid integration credentials.
