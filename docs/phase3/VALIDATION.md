# Phase 3 validation record

Validated 2026-09-24/25 UTC. This records actual automated runs; external acceptance remains blocked as listed separately.

| Check | Result / scope |
|---|---|
| TypeScript | PASS, `npm run typecheck` |
| Formatting | PASS, `npm run lint` for production modules and designated security runtime modules |
| Core | PASS, 20 tests: retained orchestration/entitlements, ten-theme contrast, theme migration and achromatic Neutral Dark |
| Desktop runtime | PASS, 35 tests: isolated IPC, schemas, protected credentials, provider adapters/streaming, MCP permissions, approvals/retry/cancel, restart handling and snapshot authorization/cache/error states |
| Production | PASS, 16 tests: license signing/bindings/replay/time, seven-day grace, encrypted migration/corruption, portable backup, telemetry, signed updates, actual extraction workers, raw Stripe webhook security, unauthenticated route rejection, scheduler auth, public configuration, notice templates, catalog rollback controls and persisted logout cleanup |
| Browser | PASS, 22 tests: retained workflows/themes/responsiveness, real-runtime MCP fixture snapshots, long identifiers, bulk permissions, restored settings, product/account/admin routes and CSP. No real accounts or payments used. |
| Next production build | PASS, `npm run desktop:build` includes Next build and main/preload/extraction-worker compilation |
| Credential pattern scan | PASS, `npm run security:scan`; this is a tracked-source pattern scan, not proof that every possible secret format is detectable |
| Dependency audit | PASS, zero reported vulnerabilities on checked lockfile; `npm audit --audit-level=high` |
| PostgreSQL 16 | PASS in CI: actual migrations, two-user RLS/privileged-write denial, Free device limit, billing idempotency/grace, session revocation, metadata retention, notification leases/deletion and catalog publication rollback |
| Windows native + unpacked package | PASS in CI: real Electron isolation, production entitlement/demo bypass denial, OS-encrypted workspace/preferences, separate Demo, business panes and restart persistence |
| macOS native + unpacked package | PASS in CI with the same native checks |
| Public signed installers / live services | **BLOCKED — external prerequisite**; unpacked CI builds do not establish signing, notarization, fresh OS install/update or live provider acceptance |

CI evidence for integrated milestone: https://github.com/knitfury/G-Bot-Astra/actions/runs/36069063121 (all four jobs passed). Final branch checks are visible on the PR and must be green before review approval.

## Issues found and corrected

- Bulk-permission summary initially exposed a misleading extra checkbox; now reports a partial/count status while individual controls retain checkbox semantics.
- Native CI initially waited for a hidden desktop pane on narrow displays; tests now open the responsive drawer. Windows also exposed a page-hydration timing issue; native tests wait for application readiness and retain screenshots on failure.
- MFA account loading previously requested protected account data before obtaining the factor list. Verified factors are now loaded first so a required challenge is usable.
- Signed catalog sequence is persisted independently of cache freshness, and publication serializes/rejects older sequences.
- Update installation now requires current-process verification, and failed hash verification clears install eligibility.
- Closing a restored/pre-initialized session clears protected identity state without removing the data-encryption key or stable device identity.
- Actual PDF/DOCX/XLSX parsers now run in fixture tests, not only a legacy text reader; invalid/oversized documents and context cleanup are covered.

## Visual inspection

Inspected business snapshots and Advanced/Neutral Dark, plus public product at 390 and 1440 pixels. Existing browser acceptance covers the ten color/appearance combinations and 390/768/1440 layouts. Screenshots in `docs/screenshots/phase3/` contain synthetic fixture data only. Long values remain within pane boundaries; normal record summaries and administration details have distinct views. CI native screenshots are retained as workflow artifacts.

## Important limits

The browser runtime fixture crosses the real runtime/services/snapshot boundary but uses a deterministic MCP server substitute; it is not a live vendor acceptance claim. The Recommended registry intentionally has no untested vendor entries. OAuth-provider callbacks, Stripe lifecycle/tax configuration, operational email deliverability, hosted restore, real-device offline enforcement, code signing/notarization and clean installer/update journeys still require the external evidence listed in EXTERNAL_ACCEPTANCE.md. No live 1.0.0 release was published.
