# Phase 3 engineering handoff

Continue/review branch `phase-3/production` into `main`. Do not merge or publish as part of this handoff. Phase 1/2 work was preserved, and the UX regression checkpoint was implemented before the remaining production work.

## What changed

The desktop workspace now uses authorized MCP business snapshots instead of capability cards. Search, selection, freshness/refresh, context drafting, safe Custom fallback, resizable panes, bulk permissions, generic connection positions, Advanced/Security/About and neutral gray Dark surfaces restore the original product intent with the real Phase 2 runtime.

Supabase identity/control-plane routes, Stripe reconciliation, device revocation and signed seven-day offline licenses are integrated with production Electron. History/preferences are encrypted; retention, independent Activity cleanup, readable export and password-protected backup/restore are available. Local attachment workers support the required document/image formats up to the 50 MB selection limit with bounded extraction.

Product/account/admin/support/legal/status/download surfaces, signed catalog metadata, narrow emergency controls, privacy-safe diagnostics, leased transactional notifications and manual signed-candidate tooling are included. Stable version is 1.0.0 candidate only; no public download or untested Recommended integration is fabricated.

## Run and configure

Use Node 22: `npm ci`, `npm run desktop:build`, `npm run desktop:start`. Without external account configuration, production sign-in reports unavailable and the separate Demo remains usable. For the browser demo/product/portal: `npm run dev` or `npm run build && npm start`. Root is the preserved Demo experience; `/g-bot`, `/portal` and `/admin` are production web surfaces.

Follow OPERATIONS.md for public desktop configuration, server-only secrets, migrations, Supabase/OAuth/Brevo/Stripe, Hostinger and release preparation. Apply migrations in filename order. Never run `supabase/tests/bootstrap.sql` against hosted Supabase. Configure trusted scheduled maintenance; notification delivery is explicitly disabled until enabled by the operator.

## Review priorities

1. Review IPC/identity/licensing/approval boundaries and encrypted migration/restore before rollout.
2. Review RLS, billing/device lifecycle, service-only admin/refund/catalog and notification jobs.
3. Review the product experience against UX_REMEDIATION.md and the synthetic screenshots.
4. Complete every external gate in EXTERNAL_ACCEPTANCE.md; store evidence, not credentials, in the acceptance record.
5. Use SECURITY_AND_RECOVERY.md for migration/rollback/restore. Phase 2 cannot read migrated encrypted files.
6. Keep release-signing protected by required human reviewers. Candidate artifacts, checksums and signed manifests are not public publication approval.

## Known limitations

No production Supabase/Stripe/OAuth/SMTP/DNS/signing configuration was available for live acceptance. No vendor has completed the required Recommended integration evidence. Scanned documents require an existing text layer; provider limits may be lower than the attachment limit. Very large history serialization still merits profiling. Email delivery uses bounded retries and may duplicate after ambiguous transport failures; monitor provider events. Tax/legal text remains draft. Refund/catalog administration has protected server endpoints; advanced operators should use reviewed administrative requests, while the portal supplies account inspection, reconciliation and device revocation. See VALIDATION.md for passing evidence and the precise distinction between fixtures and external verification.

No merge, public release, paid-service purchase, live business mutation, customer message or refund was performed.
