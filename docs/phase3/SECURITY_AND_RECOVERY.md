# Security boundaries and recovery

## Data boundaries

Desktop renderer has no Node access; narrow schema-validated IPC additionally verifies the main frame, origin and owning window. Separate Demo has no preload and no permission grants. AI/MCP credentials remain in OS-protected storage; renderer receives masked status. Production identity and direct provider/MCP requests run in the main process. Supabase receives identity/billing/device/license/catalog/audit metadata, not ordinary chat, attachments, credentials or business records.

Business snapshots call only enabled, classified read tools with validated bounded arguments. Ambiguous Custom tools fall back to connection overview. Reviewed mappings bind endpoint, tool and schema fingerprint; none is falsely advertised as live-tested. Permission changes clear cache; in-flight results recheck authorization. Selected context becomes a reviewable composer draft. Tool output and documents remain untrusted input; consequential calls retain the Phase 2 exact approval boundary.

Signed licenses bind account/device/environment/sequence/expiry and server plan caps. Cached access lasts at most seven days; offline revocation cannot be instantaneous. The OS administrator can modify binaries or memory; this is not a DRM guarantee against a hostile device owner. Catalogs maintain a sequence high-water mark; server publication rejects rollback. Signed emergency metadata can pause named catalog endpoints or updates only. It cannot execute code or bypass permissions.

## Local data

Workspace and preferences/drafts use AES-256-GCM, unique nonce, filename-bound authenticated data, and an OS-protected random key. Legacy migration authenticates the rewritten file before atomic replacement. Corruption preserves the file and fails closed. Atomic queued writes prevent torn state; large serialization/encryption still occurs in the main process and should be profiled with unusually large histories before release.

Retention is 0/30/90/180 days (0 means until manually deleted), applied at startup and when changed with confirmation. Conversation removal clears its transient attachment data; Activity has an independent clear action. Temporary extraction runs in a bounded worker without writing input files, has timeout/memory/text limits and retains at most 20 cached items. Context is explicitly excerpted at 192k characters. Scanned PDFs need a text layer; OCR is not implemented. Providers may impose lower input/image limits than the 50 MB attachment selection limit.

Portable backups use scrypt and authenticated encryption with a separate user password. Wrong password/tampering rejects restoration. Native confirmation precedes replacement. Restored account identity is not imported, pending actions are cancelled and connectors/providers require reconnection. JSON/Markdown exports omit credential stores but contain conversation content; user-authored secrets within messages cannot be reliably removed automatically.

## Cloud and administration

All metadata tables enable RLS. Users read only their own profile/billing/devices and can edit only their display name. Service-only transactional functions control entitlements/revocation and audit. Admin routes require backend role membership and verified AAL2, including refunds/reconciliation/revocation; no impersonation exists. Authenticated per-account rate limits complement Supabase's configured auth controls. Stripe signature checks use exact raw bytes, timestamp tolerance and environment binding; reconciliation uses current server state and transactional event idempotency.

Account deletion requires recent authentication plus exact typed confirmation, cancels paid subscriptions without automatic refund, removes cloud identity and revokes access. Financial records remain at Stripe under required retention; local erasure is separate. Notification outbox records contain only lifecycle kind/account ID; deletion receipts temporarily retain the destination address for delivery. Leased delivery retries are bounded; ambiguous remote delivery can still duplicate and must be monitored. No guarantee of exactly-once email delivery is claimed.

Public pages use nonce CSP, frame denial, nosniff, no-referrer and restricted browser permissions. Desktop CSP excludes direct external renderer connections. Native public configuration is packaged from an explicit allowlist; private service, billing and signing keys are excluded. Release owners must verify that the Supabase public anon key is actually the anon/publishable key, never service-role.

## Diagnostics and release

Sentry is opt-in and reconstructs allowlisted metadata before sending; no raw exception/request/breadcrumb content is forwarded. Local operational diagnostics retain 30 days; audit metadata 12 months. Maintenance must be scheduled by the owner; absent scheduling, cloud pruning is not automatic.

Update checks require a signed newer stable manifest with platform/architecture and installer SHA-256. Installation requires verification in the current process; stale persisted UI status is insufficient. Manual main-only candidate workflow has read-only repository permissions, protected signing prerequisites and artifact upload only. Publishing requires a separate human process.

## Recovery / rollback

Stop the application before restoring filesystem backups. Preserve the original encrypted files and matching OS-protected key store; copying only ciphertext to another account cannot unlock it. Use portable password-protected backups for cross-device restoration. Never silently replace damaged data with an empty workspace.

Phase 2 cannot read version 2 encrypted data. Roll back only with a verified pre-migration backup in a separate profile, or retain the Phase 3 binary and repair forward. Database migrations are additive; back up before applying and use forward corrective migrations after deployment. Restore hosted data only in an isolated environment with payments and notifications disabled, then verify RLS and reconcile trusted billing state. Follow the operations guide and external acceptance matrix before any production rollout.
