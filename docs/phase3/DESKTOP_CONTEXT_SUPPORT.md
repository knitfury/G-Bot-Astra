# Desktop context and support correction

## Confirmed causes

The native pane selector recognized only specific read tools whose arguments it
could construct automatically. Required account/mailbox identifiers, arbitrary
response shapes and resource-only servers therefore had no usable source, even
when chat could supply parameters through an AI model. Demo panes read separate
fictional records and did not prove real MCP hydration.

The production Account screen returned before the existing premium plan-card
markup. Durable native settings already used encrypted preferences, but startup
and OS notifications had no corresponding native implementation. There was no
shared Back control or native maintenance/Help menu.

## Behavior

- Configure pane selects an explicitly permitted read-only tool or MCP resource,
  validates required parameters and optionally maps record fields. Mail,
  Calendar, Inventory, CRM, Orders, Accounting, Shipping and Generic views work
  without an AI provider. No automatic writes or approval bypasses are allowed.
- Configuration is encrypted in the existing workspace. Endpoint and schema
  bindings invalidate changed sources. Permissions and entitlement are checked;
  revocation discards in-flight results. Resource URIs are sent only to the MCP
  server, never opened as local files or fetched directly.
- Unannotated or ambiguous tools still require improved server metadata or a
  reviewed adapter. This change does not claim every connector is verified.
- Real Account cards use server entitlement and open the existing billing portal.
  Demo selection remains simulated. EUR prices and Supabase/Stripe are unchanged.
- Existing durable settings remain encrypted. Simulation controls stay Demo-only.
  Unsupported native startup/notification switches are disabled without erasing
  their saved values.
- Back history lives in the root provider because the catch-all route remounts
  the app shell. Only internal entries observed in the current account/Demo
  session are followed. Direct entry falls back to Workspace or Connections.
  Native Back uses Alt+Left / Command+[ outside text controls and dialogs.
- Clear Cache & Cookies confirms and clears HTTP cache and cookies only. Native
  tokens, vault, encrypted preferences/workspace, localStorage, IndexedDB and user
  files remain intact. External browser cookies are unaffected.
- Restart drains work, cancels pending approvals, saves encrypted data and invokes
  Electron relaunch. Failure to drain/save leaves the application open. Submitted
  external writes can still complete; inspect activity before repeating them.
- Help provides troubleshooting, the actual Electron logs folder, copied sanitized
  diagnostics, Contact Support and About. Support opens the OS mail application
  for gbot@vidinex.ee with subject “G-Bot Support — Desktop”; nothing is sent.
- Logs contain allowlisted event/error codes and version/OS/time metadata, never
  raw exceptions, prompts, headers, credentials or MCP payloads. Rotation retains
  approximately 1 MB each for current/previous logs and prunes after 30 days.
  A bounded synchronous fatal record survives process failure. Remote telemetry
  remains consent-gated; Demo diagnostic copies omit real account information.

## Validation and acceptance

Regression tests cover required read arguments, resources/templates, resource-only
servers, no-AI hydration, write rejection, schema/permission changes, persisted
configuration, cache scope, shutdown draining, diagnostics and internal Back.
Browser coverage verifies real cards never select a local entitlement. Native
smoke tests retain existing launch/isolation/persistence checks and add menus,
cache preservation, native Back and actual process relaunch.

The packaging-only @electron/get override uses 5.1.0, already required by Electron,
removing the vulnerable legacy got/http-cache-semantics dependency chain. Desktop
tooling uses Node 22.12+. No signing policy or production secrets are changed.

Before approval, test the configured unsigned Windows artifact with the real MCP:
configure a read source without AI, refresh/revoke/reconnect, confirm live account
cards and durable Settings, clear cache while preserving login/configuration,
restart, inspect logs/diagnostics and open the support email application.

No database migration, release or merge is part of this change.

## Owner-test follow-up: pane trust and Zoho discovery

The desktop now retains all four boolean MCP annotations. Old saved tool records
without annotation evidence must be reconnected; an internal `risk: read` value
alone no longer grants automatic pane execution. Names and descriptions cannot
grant authority. State-changing identifiers and explicit contradictory hints veto
pane use even if a server claims read-only. Tool enablement, connection entitlement,
argument validation and in-flight revocation checks remain mandatory. A positive
server declaration is a claim, not proof: enable automatic access only for a server
you trust. There is no user override for an unverified operation.

Signed catalog v2 optionally carries `paneReads`: exact credential-free HTTPS
endpoint, tool, discovery schema hash, reviewed fixed arguments, presentation kind,
human label, field paths and review evidence. Only fresh verified recommended
entries grant reads; disabled/revoked/expired/mismatched grants fail closed. These
grants are pane-specific and do not remove AI action approvals. User configuration
cannot change a catalog-only grant's reviewed argument set. V1 catalogs still work
without grants. Existing v1-only clients reject v2 safely; do not publish v2 to a
mixed client fleet without a coordinated catalog delivery/client rollout. No catalog
or signing keys are published or changed by this PR.

Configure Pane lists usable sources first. Blocked operations remain inspectable
under a searchable Advanced/security disclosure. Connections → Technical connection
details → Sanitized MCP discovery exposes a copyable schema-shape report with tool
names, required parameter names, four annotations and schema hashes. It excludes
URLs, credentials, descriptions, schema literal values and business responses.
Review identifiers before sharing. This diagnostic shape is not a replacement for
reviewing the complete operation contract before signing a read grant.

No Zoho read grant has been invented or published. The owner's actual tools/list
payload is not available in the development environment. Automatic account/folder
resolution and a production Zoho template remain blocked on that evidence and a
reviewed connector identity. A name such as listEmails alone is insufficient.

Owner acceptance:
1. Install the new unsigned owner build; retain existing data and use no AI provider.
2. Reconnect Zoho so annotations refresh. Inspect enabled retrieval tools and the
   new Configure Pane source/blocked sections.
3. Copy the sanitized discovery report from Technical connection details. Share
   only the reviewed report, never the endpoint token, headers, vault or mail data.
4. If a declared read source is available, explicitly trust it, provide its required
   parameters, and check displayed sender/subject/preview with unread state unchanged.
5. Confirm mutation tools remain blocked even when enabled for AI use; disabling a
   read permission removes its pane data. Restart and check saved configuration.
6. Recheck account plan cards, settings, Back, Help/logs/support, safe cache clearing,
   Restart, real auth/billing and Demo isolation. Do not merge or release yet.
