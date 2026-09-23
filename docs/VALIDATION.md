> Current Phase 2 validation is recorded in [PHASE2_VALIDATION.md](PHASE2_VALIDATION.md). This file preserves the Phase 1 baseline.

# Phase 1 validation record

Validation date: 2026-09-22. Runtime: Next.js 15.5.25, React 19, strict TypeScript. Browser: headless Chromium 153 against the production Next.js server.

## Results

| Gate | Result |
| --- | --- |
| Application startup | Passed in development and production |
| Production build | Passed: compilation, TypeScript validation and route generation |
| Service and theme tests | 19 passed, 0 failed |
| Browser acceptance tests | 19 passed, 0 failed; full suite completed in approximately 2.6 minutes |
| Primary routes | Welcome, signup/login, onboarding, workspace, apps/detail, providers, activity, account and settings rendered |
| Signature workflow | Email → Inventory → grounded draft → edited approval → simulated send → audit event |
| Support workflow | Email → CRM → Helpdesk approval, rejection and service-level approved completion |
| Partial failure | Successful Email result retained; failed Inventory retried without repeating Email |
| Entitlements | Business → Starter → Free → Business retains eight configurations with 8/5/1 active allowance |
| Provider management | Onboarding, Generic REST errors and recovery, provider coexistence, model selection and removal |
| Attachments | File, image preview, URL, unsupported-file state and removal exercised |
| Pane layouts | Independent switching/removal, keyboard resizing, persistence, G-Bot-only, mobile context dialog |
| Ten theme combinations | Five independent colors × Light/Dark; desktop, tablet and mobile screenshots inspected |
| Responsive checks | 1440×1000 desktop, 768×1024 tablet, 390×844 mobile; no document-level horizontal overflow on checked routes |
| Credential handling | Saved provider state excludes test keys and advanced headers; logout disconnects integrations |
| Keyboard/focus | Labeled controls, Radix dialogs with Escape/focus handling, keyboard pane resizing and composer Enter/Shift+Enter behavior |
| Text-token contrast | 140 semantic foreground/background pairs checked; minimum 4.62:1; automatic regression test |

## Issues found and corrected

- Initial chat auto-scroll clipped the welcome mark before the first conversation. Auto-scroll now starts only after messages exist. Starting a new chat also resets the scroll position, verified in the final mobile capture.
- Delayed controlled-checkbox updates caused tool permission changes to read a reverted checkbox value. Values are now captured immediately; local feedback is optimistic with rollback on failure.
- Provider decorative glyphs were included in accessible names. They are now hidden from assistive naming.
- Approved cards could retain editable fields. Resolved approval cards now display read-only details.
- Development and production output shared a directory. Separate output directories prevent watcher/build interference.
- Reused production webpack caches produced restoration warnings in the ephemeral runner. Production cache is disabled for deterministic builds; development caching remains enabled.
- Light-theme muted colors fell below 4.5:1 on some neutral surfaces. Orange, blue and green muted tokens were darkened; placeholder opacity was corrected.
- Browser tests now wait for committed async plan/permission transitions before performing full-page navigations.

## Visual evidence

- [Desktop workspace](screenshots/workspace.png)
- [Approval experience](screenshots/approval.png)
- [Mobile workspace](screenshots/mobile.png)

The broader test run also inspected theme previews, the purple workspace, G-Bot-only layout, app context dialogs, attachments, partial failure and mobile management screens. Generated Playwright reports/traces are excluded from the repository and can be regenerated with `npm run test:e2e`.

The initial Playwright CDN download was unavailable in this execution environment. An npm-distributed Chromium binary was used instead; the application was still tested as a production Next.js build. The fallback setup is documented in the engineering handoff.

This is not a claim of complete WCAG certification or cross-browser/native testing. The checks above are specific evidence; live integration, desktop packaging and real authentication/billing remain Phase 2 work.

## Colored dark appearance refinement

See [theme engineering notes](THEME_DARK_VARIANTS.md) for persistence migration, token architecture, and the expanded browser/visual review. Existing Phase 1 mock service behavior is unchanged.
