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

## Universal context engine correction (supersedes the earlier Zoho-specific next step)

The prior code preserved read evidence but still gated usefulness on a short tool-name/category list,
required manual resource selection, and recognized only fixed response collection keys. Consequently,
a valid safe MCP could remain blank. Catalog metadata was not a sufficient solution to this product gap.

The existing Snapshots service is now the generic context engine. Its discovery model separately carries
safety/permission, usefulness score, presentation hint, schema, required parameters and bounded arguments.
Enabled connections authorize protocol resource reads; resource templates require their actual variables.
Only enabled tools with read evidence can be considered; metadata text never authorizes execution.
Resources rank before tools, ready sources before missing-argument sources, with structured collection
and overview/recency metadata improving usefulness. Selection is deterministic and user-switchable.
Tools no longer need a recognized operation name or business category. Signed grants remain optional.

All reads stay within the connected MCP client. Resource links, image URLs and embedded resource URIs
are displayed as inert content, never followed as local/network fetch instructions. Prompts do not execute.
Resource discovery is bounded to 20 pages/500 sources (an excess is rejected); tool discovery retains its
existing equivalent limit. Tool result cursors are not chased automatically: hydration reads one bounded
overview page, with pagination parameters available in configuration. At most three independently safe
sources are attempted if the preferred source fails; a selected source never silently switches contexts.
Responses are capped at 200,000 characters, collection output at 50 records, fields at 30 per record,
with bounded nested traversal and text previews. Permission/schema/source changes discard in-flight results.

Local schema/result inference recognizes semantic roles and normalizes arbitrary nested JSON, plain text,
embedded resources and resource links. Reusable views cover messages, lists, tables, cards, metrics,
timelines, detail, documents and key/value fallback. Generic data no longer requires a business-specific
response envelope. Empty, configuration, permission, disconnected and error states have separate messages.
Refresh re-discovers current resource authority and re-reads the selected safe source. Source switching is
scoped to the connection; changing pane connections resets transient source/search selection.

Required business IDs are never fabricated and third-party default IDs are not executed automatically.
Only bounded pagination controls are synthesized. Ordinary scalar/enum parameters get typed form fields;
complex JSON and mapping overrides remain under Advanced. Saved configurations continue using existing
encrypted persistence. The generic engine has no inference-provider dependency and never imports Demo data.

### Independent provider stream investigation

The OpenAI-compatible stream parser duplicated SSE parsing and dropped a trailing event without its final
newline. It also did not surface provider error frames explicitly. It now uses the shared bounded SSE parser,
which retains a final data event, ignores empty/comment/usage frames and always releases the reader. Tool-only
responses remain valid, including zero-argument calls. Reasoning is never rendered; a reasoning-only completed
response reports that no answer/tool call arrived. Error frames produce a sanitized provider error. Truncated
streams and timeouts still fail rather than execute incomplete actions. No automatic retry was added.
These are reproduced parser defects, not a claim to have captured the owner's intermittent provider response.

### Owner acceptance

Install the new configured unsigned Windows artifact without clearing saved data. Connect at least two
different MCP servers, with no AI provider. Enabled readable resources should populate immediately. For
annotated tools, retain the existing Tools & Permissions opt-in and enable the intended safe reads. Confirm
actual records, context switching, refresh and typed required parameters; verify no unread state or external
record changes. Unknown structured sources should show a table/detail rather than a blank pane. A server
exposing only unannotated/ambiguous tools must remain blocked: universal presentation cannot manufacture
execution authority. No vendor template or signed mapping is required for protocol-safe sources.

Automated fixtures exercise Mail, Inventory, CRM, Calendar resources, unknown nested data, dangerous/mixed
tools and missing arguments. Browser acceptance verifies two simultaneous distinct panes without an AI
provider, visible business records, live refresh, context switching, unknown tables, blocked dangerous
operations and a normal Project field. Preserve PR #9's earlier support/account/settings acceptance checks.
Do not merge, publish a release or change production secrets.


## Owner-test follow-up: automatic selection, API envelopes and disabled reads

Reviewed the owner's screenshot and attached discovery log before this change. The screenshot
shows Automatic overview replaced by the resolved personal-task source, with success/200
response fields rendered as business context. The supplied log contains tool names and risk
classifications, not raw tool responses or complete read-authority/schema metadata. It cannot
establish why that server returned no records or authorize a new provider-specific read grant.

The Context selector now tracks the user's automatic/explicit choice independently of the
resolved source. Refresh retains the choice; switching connections still resets transient state.
Generic normalization unwraps recognized API status/payload envelopes in MCP text and structured
results. It renders nested records, preserves real empty collections, business status fields,
documents and arbitrary metrics, and sanitizes error envelopes. A success-only envelope is not
a record: automatic discovery continues within its existing three-source read bound; explicit
selection stays scoped and shows source/parameter setup guidance. It never invents account IDs.

Disabled-tool recovery lists only tools backed by server-declared or exact signed-catalog read
authority, never ambiguous tools or mutation-vetoed operations. Navigation instructions name
Your Connections → the connection → Tools, with a direct link opening that tab. Permissions
remain opt-in; enable the reviewed tool, return and refresh, then supply required parameters in
Configure pane. No automatic enablement, Demo data fallback or changes to credential storage.

Regression coverage includes automatic selection after refresh and explicit switching, the
screenshot-shaped status-only response, actual records inside success envelopes, mixed MCP text
blocks, honest empty arrays, preserved custom metrics/business statuses, sanitized API failures,
bounded automatic fallback versus explicit selection, and safe permission guidance/deep-linking.

Owner acceptance: retain existing saved data, use this commit's configured unsigned installer,
check Automatic overview before/after refresh, select a real record source and supply its required
parameters, then disable its read tools and verify the guidance/link. Enable only the intended
verified reads, return to the pane and refresh. Recheck both panes and Demo isolation. No migrations,
production credential changes, release publication or merge are part of this follow-up.
