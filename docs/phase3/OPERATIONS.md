# Phase 3 deployment and operations

## Data boundaries

AI and MCP requests go directly from the device to the selected services. The account control plane receives identity, billing, device/license and catalog metadata only. It has no conversation, attachment, provider-key, MCP-credential or business-record tables. Desktop history and preferences/drafts are encrypted; OS-protected keys remain separate from ciphertext. Portable backups use an independent password and exclude credentials. Readable exports contain conversation content and must be shared carefully.

## Environments and Supabase

Provision separate Development, Staging and Production Supabase projects, Stripe configuration, OAuth applications and signing keys. Initial production target: EU/Frankfurt. Never share production secrets or customer data with staging. `.env.example` distinguishes public desktop configuration from server-only secrets. Service-role, Stripe, SMTP and private signing keys never belong in installers.

Apply `supabase/migrations/202609240001_control_plane.sql` with trusted migration tooling. RLS permits only own-row profile/billing/device reads and display-name updates. Clients cannot write billing, licenses, devices, admin roles or audit events. Use `supabase/tests` only in an isolated test database, never a hosted production project. Configure a daily trusted scheduler for `prune_metadata()`: operational logs 30 days, security/admin metadata 12 months. Grant administrators through a reviewed server-side role insertion; admin endpoints require allowlist membership plus AAL2. Enrolled MFA is enforced for control-plane access.

## Google, Microsoft, email and Brevo

Create independent Google and Microsoft OAuth apps for each environment. Register the exact Supabase provider callback and configure email scopes/account-tenant policy. Allow HTTPS portal `/portal` redirects and desktop `http://127.0.0.1:43828/account/callback` with the state query supported by Supabase redirect matching. Avoid wildcard domains. Desktop uses PKCE, random state, a one-shot loopback callback and a two-minute timeout. Tokens/PKCE values stay in OS storage. Test cancellation, malformed/duplicate/expired callbacks and offline recovery with staging.

Enable email verification and secure password changes; set password minimum 12 and appropriate Supabase auth rate limits/CAPTCHA. Configure Brevo Free custom SMTP in Supabase Auth using secure settings. Intended sender: no-reply@vidinex.ee. Support: gbot@vidinex.ee. Publish provider-issued DKIM and SPF records; consolidate existing SPF rather than creating duplicate records. Configure and monitor DMARC before enforcement. Supabase sends verification/recovery, Stripe sends billing receipts. Device/payment/deletion operational notifications use the service-only notification outbox and `/api/maintenance` delivery job; real delivery acceptance is still required. Never ask customers to send secrets to support.

## Stripe and entitlements

Create configuration-driven EUR prices: Starter €14/month, €140/year; Business €29/month, €290/year. Configure quantity one and no seats. Free needs no card. Configure the Billing Portal to permit only approved prices, immediate paid upgrades with proration, downgrades at period end and cancellation at period end. Final tax-inclusive consumer presentation and Stripe Tax registrations require accounting/legal review.

Webhook route `/api/stripe/webhook`: subscription created/updated/deleted, invoice paid/payment_failed, checkout completed, charge refunded. Configure the exact endpoint secret. Requests use raw-body signature verification, five-minute tolerance, environment matching and transactional event idempotency. Reconciliation retrieves current Stripe state; unknown prices or multiple live subscriptions require review. Checkout return alone never grants access. Configure payment retries to align with seven-day grace and test the boundary. Refunds require an allowlisted MFA administrator, matching payment ownership, exact amount and idempotency ID; no refund was executed during development.

## Licensing and key rotation

Server issues Ed25519 licenses bound to account, device, environment, plan/limits, sequence and seven-day expiry. Clients ship public keys only. Online revocation removes the device session/license; offline revocation becomes effective on the next online validation, bounded by expiry. No remote erase occurs. Preserve configs on plan/device reductions.

Generate keys in a trusted administrative environment. Deploy new public keys before switching server key IDs, retaining old public keys for outstanding valid licenses. License overlap: at least seven days. Catalog/update overlap: their configured validity. On compromise: stop compromised issuance, revoke affected devices, rotate server/release secrets, publish verified public-key updates and require revalidation. OS administrators can modify local binaries; signed entitlements do not make a hostile OS tamper-proof.

## Hostinger and WordPress

Official Hostinger documentation checked 2026-09-24 says current Business/Cloud plans support managed Node.js applications. Confirm this actual plan exposes Node.js Web Apps, Node 22, HTTPS/custom domains, build/runtime environment variables and an always-available Next server. Build: `npm ci && npm run build`. Start: `npm run start -- --port $PORT` using the platform-provided port. If this legacy plan lacks Node support, use a separate supported Node app/VPS for account.vidinex.ee; no Vercel dependency is needed.

Deploy account.vidinex.ee using the same G-Bot Supabase identity. Repository routes: `/g-bot`, `/portal`, `/admin`, support/legal/status/download pages and account API. Preserve the existing WordPress/WooCommerce store. Publish the product implementation as a reviewed WordPress template/page or an approved path proxy; never replace the WordPress installation with this Next app. Product source: `src/app/g-bot`; styles: `src/styles/production.css`. Only after `/g-bot/` is deployed and verified: retain “Enter the Shop” and replace “See the Process” with “Explore G-Bot” → `/g-bot/`. No live WordPress page or CTA has been changed. Shop and G-Bot identities remain separate.

## Release

Stable 1.0.0 candidate only. PR → review → merge → CI/security → manual candidate workflow → protected signing environment → fresh installer/update acceptance → separate human public-release approval. Neither merge nor CI publishes a release. `release-candidate.yml` is manual, main-only, requires signing material, has contents-read permission and uploads artifacts only. Configure required human reviewers on `release-signing` before use.

Windows public downloads require trusted signing enrollment/certificate (Windows 10 22H2/11 targets). macOS 13+ Apple Silicon requires Developer ID and notarization; Intel is advertised only after real testing. No Gatekeeper bypass. Owner currently lacks paid signing prerequisites. Installers require SHA-256 checksums and a signed stable update manifest; keys/feed must be configured. Runtime verifies manifest/version/platform/architecture and installer hash before allowing installation; silent downgrade and prerelease updates are disabled.

## Backup / disaster recovery

Use managed Supabase backups/PITR appropriate to the selected plan; do not purchase services automatically. Keep restricted encrypted logical dumps and separate key/secret recovery inventory. Quarterly restore: isolated non-production project, outbound mail/webhooks disabled, restore schema/data, run RLS with two users, verify admin MFA/device/license/audit rows, reconcile Stripe test state, record recovery point/time/counts and discrepancies. Never replay production charges or mail. Hosted restore drill is BLOCKED — external prerequisite; database unit/integration tests are not a restore drill.

Local migration authenticates ciphertext before atomic replacement; failures preserve original data. Phase 2 cannot read version 2 encrypted files: do not downgrade over a migrated directory. Keep the newer binary or restore a pre-upgrade backup into an isolated directory. Never convert encrypted history to plaintext automatically.

Sources: https://supabase.com/docs/guides/auth/sessions/pkce-flow ; https://supabase.com/docs/guides/auth/auth-mfa ; https://docs.stripe.com/webhooks ; https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/ . Recheck vendor configuration at deployment.

## Notification and maintenance deployment

Apply both numbered migrations in order. Schedule authenticated POST `/api/maintenance` every five minutes with a random `GBOT_MAINTENANCE_SECRET` of at least 32 bytes stored only in the scheduler/server. Never expose it in browser JavaScript or URLs. Each run prunes metadata. Delivery is disabled unless `GBOT_NOTIFICATIONS_ENABLED=true`; set `BREVO_API_KEY` separately from the Supabase SMTP credential. Send only to safe test inboxes in staging. The job claims at most 20 lifecycle messages with leases and at most three attempts. Monitor failed counts and Brevo delivery events; after ambiguous delivery, inspect before requeueing. Brevo quotas apply. Outbox rows expire after 30 days, delivered deletion destinations are cleared. Do not schedule production sends until reviewed.

Supabase owns verification, recovery and security-change mail through configured Brevo SMTP. Enable password/MFA security notifications in Auth settings. Use the reviewed auth templates in `docs/phase3/email/`; confirm generated redirect URLs and never insert keys or business context. Stripe owns receipts.

Before desktop compilation, provide the allowed public variables listed in `desktop/runtime/public-config.ts`. The build writes `desktop-dist/public-config.json`, so packaged clients do not depend on customers setting environment variables. Never put service-role keys in the public anon-key field. Release workflow public variables belong to the protected environment. `scripts/sign-release-manifest.mjs` signs the single platform updater artifact with the private release key; outputs stay candidate artifacts, never automatically published.

Brevo API reference: https://developers.brevo.com/reference/send-transac-email .
