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
