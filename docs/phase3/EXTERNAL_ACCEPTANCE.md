# Phase 3 external acceptance gates

These are **BLOCKED — external prerequisite**. Automated fixtures do not establish live-provider, hosted-service, installer-signing or production readiness. Supply credentials through deployment/CI/OS secure stores only. Do not paste secrets into chat. No real orders, customer emails, refunds, stock mutations, purchases, release publication or live WordPress edits were performed.

| Gate | Owner completion and evidence required |
|---|---|
| Supabase environments | Create separate development/staging/production EU Frankfurt projects; apply every migration in filename order; configure HTTPS origins, Auth settings and RLS; repeat cross-user access tests against staging. Record project/region and redacted results. |
| Email identity and recovery | Configure Brevo Free SMTP and verified sender; sign up with a safe test inbox, verify, log in/out, recover/change password and reauthenticate. Confirm expired/reused links fail and revoked sessions cannot license. |
| Google and Microsoft | Configure provider applications, consent and exact redirect allowlists. Test desktop PKCE loopback, cancel/deny, malformed/duplicate/expired state, portal return and Microsoft account policy on Windows/macOS. |
| MFA | Enable optional user TOTP and mandatory administrator MFA. Test enroll/challenge/recovery/removal; ensure ordinary users and AAL1 admins cannot call privileged routes. Configure Supabase security-notification templates for password/MFA changes. |
| Transactional email | Configure SPF/DKIM/DMARC without disrupting existing mail, Brevo API key and trusted maintenance schedule; enable notifications only in a reviewed environment. Trigger safe fixture welcome/device/revocation/grace/deletion notices; inspect inbox/spam, sender, links and no sensitive content. Record quota/failure behavior. Stripe owns payment receipts. |
| Stripe | Configure test prices €14/€140 Starter and €29/€290 Business, portal policies, raw webhook endpoint and test secrets. Exercise checkout, duplicate/reordered webhooks, upgrade proration, period-end downgrade/cancel, seven-day grace, recovery and test-only refunds. Production payout/bank, tax and legal settings remain owner gates. |
| Device/offline licenses | Register separate real Windows/macOS devices; test Free 1, Starter 2, Business 3; revoke online and revalidate, disconnect network for valid/expired license, clock rollback, old sequence, key rotation and plan reduction. Never claim remote erase. |
| Real AI providers | Owner-funded test credentials for OpenAI, Anthropic and Gemini: model discovery, streaming, cancel, timeout/rate limits, cross-app reads and exact consequential approval. Use synthetic business records only. |
| Real MCP integrations | At least two actual remote MCPs; target 5–10 only after evidence. Zoho CRM/Books/Mail/Inventory require suitable accounts/scopes; WooCommerce operational MCP requires a staging plugin/site; shipping requires a test account. Verify transport, auth, tools, paging, expiry/reconnect, reads, schema mappings and approved safe writes. Until then no vendor is advertised as Recommended. |
| Hosting/DNS | Verify this Hostinger Business plan supports managed Node 22/Next, environment variables and HTTPS; deploy account.vidinex.ee and reviewed `/g-bot/` integration without replacing WordPress/WooCommerce. Apply homepage CTA only after owner review. |
| Telemetry | Configure optional Sentry DSN and account; prove consent-off sends nothing and inspect consent-on envelopes for absence of conversations, tools, URLs, credentials and personal identifiers. |
| Disaster recovery | Obtain suitable Supabase backup/PITR and restricted dump access. Restore to isolated staging with mail/webhooks disabled; run RLS, device/licensing and reconciliation checks; record actual recovery point/time. CI PostgreSQL tests are not a hosted restore drill. |
| Windows signing | Organization enrollment/certificate or trusted signing service and secure CI configuration. Produce signed installer; clean Windows 10 22H2/11 install/upgrade/uninstall, SmartScreen/signature, OS vault and retained history. Unsigned CI packaging is not signing evidence. |
| macOS signing | Apple organization enrollment, Developer ID, notarization and secure CI credentials. Clean macOS 13+ Apple Silicon install/update, Gatekeeper, keychain and data persistence. Intel remains unadvertised until tested. |
| Stable update | Configure public verification keys/feed and private manifest key in protected stores. Prepare candidate only; verify checksum/signature, tamper/downgrade rejection and clean previous-version migration on both OSs. No public 1.0.0 release. |
| Legal/accounting | Review Vidinex E-Commerce OÜ (17603412), privacy, terms, refund/cancellation, DPA/subprocessors, EU consumer/tax wording, retention and support policy. Repository legal text is a draft. |

## Completion record

For each gate retain date, environment, tester, versions, redacted evidence, actual result and issue reference. Failed or unavailable gates remain blocked. A signed artifact or production claim must not be inferred from passing fixtures. The PR must stay unmerged for human review.
