# Product configuration polish candidate

Base: merged main `4b5af2718e53e87a4a203082b84a016ee27aba25`. No interrupted remote polish branch or PR existed. This continues Phase 3 and Launch UX; it does not publish or merge 1.0.0.

## Product changes

- Free $0 / 1 active MCP; Starter $6 monthly or $60 annually / 5; Business $9 monthly or $90 annually / 8. USD comparison tables appear in desktop account, demo, product and account portal. Device limits and signed seven-day offline licensing remain unchanged.
- Direct OpenAI, Anthropic and Gemini retain model identifiers; Custom OpenAI-Compatible and existing Generic REST remain under Advanced. Experimental OpenRouter and OmniRoute expose only `openrouter/auto` and `auto`. Router tests/configuration/inference are gated for paid plans, including a refreshed-license check immediately before production inference. Known legacy OpenRouter endpoints cannot evade the gate by selecting the custom type. Arbitrary custom endpoints remain BYOK; G-Bot cannot identify a router hidden behind an owner's custom proxy.
- Neutral provider glyphs avoid uncertain trademark permissions. OmniRoute needs the owner's compatible API base URL. No model catalogs or failover claims. Provider-returned model IDs appear in execution details; absent/Auto IDs display "Routed automatically". Per-tool permissions and exact consequential-action approval remain authoritative.
- Connections represent saved configurations, with Add Connection, Recommended and Custom MCP, actual statuses and authorized tool counts. The persisted `slot` field is retained only as legacy ordering metadata; it no longer grants access or limits saved configurations. Connecting/authenticating requests reserve capacity before asynchronous work. Multiple connections in any category are supported.
- Downgrade retains active connections in saved order up to the new limit, disconnects excess transports and marks them inactive. URLs, credentials, tool permissions and history survive. Upgrade does not silently reactivate transports. Manual disconnect now retains credentials; explicit Remove / clear credentials still erases them. Restart follows the existing reconnect behavior.
- All five Dark palettes inherit one neutral semantic surface foundation: canvas #202020, card #2b2b2b, side surface #262626, input/soft #363636, border #454545. Orange #f0a17b and Purple #c7b0f4 accents are retained; Blue #82afff and Green #76cf82 strengthen their distinct hue; Neutral keeps grey accents. Light palette definitions are unchanged.
- Business Advanced Activity adds text search, decision/approval history, local JSON audit export and independent 30/90/180-day Activity retention with native confirmation. Normal filters and Execution Details remain available to all plans. Export excludes approval arguments and hidden reasoning; retained metadata can still be private. Retention defaults to disabled and pauses on downgrade. Conversation retention, encrypted storage and backups retain their existing boundaries.

## Data and external configuration

No SQL migration, data reset or credential rotation. Existing schema-1 documents remain readable; metadata fields are optional. The validator now accepts legacy ordering numbers beyond seven. Old events without new metadata remain readable without invented provider/model information.

Before commercial billing, the operator must configure the four existing Stripe price environment variables with USD $6/$60 and $9/$90 prices. No live Stripe prices or production credentials were changed. Existing Supabase/OAuth/device/catalog/signing/SMTP deployment prerequisites still apply. Recommended integrations remain empty until acceptance evidence is published. Actual provider/router compatibility and tool-capable Auto routing need owner BYOK acceptance; fixture tests do not establish vendor availability.

CI uses `npm run desktop:dist -- --publish never` on Windows/macOS. The Windows `G-Bot-Windows-owner-test` workflow artifact contains the installer and blockmap. It is an unsigned owner-test candidate, not a public release. Native local Linux smoke launch is blocked by the execution environment's denial of Electron's singleton socket; CI must establish Windows/macOS native behavior.

## Validation

Initial integrated local results: typecheck, production web/Electron compilation, 21 core/theme tests, 40 desktop tests, 18 production/security tests, credential scan and dependency audit (zero vulnerabilities) passed. Browser and native packaging results are recorded in the final validation report after completion.

Owner must install the Windows artifact, inspect all five polish areas plus preserved Welcome, same-window navigation, sessions, snapshots, approvals, theme persistence and existing encrypted data, before approving a merge. Do not merge or release from this task.
