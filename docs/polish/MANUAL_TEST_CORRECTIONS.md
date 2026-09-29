# PR #6 owner-test corrections

## Saved connections and Demo examples

The Demo entry path populated `Database.connections` with eight fictional integrations. The Your Connections UI correctly rendered that array, so sample configurations appeared as user configurations (including after access was paused). The plan capacity was not the intended source of cards.

Demo examples now live in a separate `demoConnections` collection used only by simulated context, tools and approvals. `connections` and its list service contain only saved configurations. Your Connections, its active count and plan allowance use that saved collection. Fictional context remains usable in Demo without creating configuration cards. Explicitly saving an example creates a user configuration; saving multiple connections in the same category remains supported.

An additive schema-1 migration recognizes the old fixture IDs together with their exact legacy names, endpoint, seed timestamp and placeholder credential markers. It preserves edited, explicitly configured and independently saved connections regardless of inactive/disconnected status. Native runtime never exposes Demo samples. No SQL migration or data reset is required.

## Settings persistence audit

Three failure mechanisms were found:

- Entering Demo recreated the entire database, resetting simulation controls and general settings.
- Packaged Demo relied on localStorage under a randomly assigned loopback HTTP port. A new process used a different origin and could not read the previous origin's preferences.
- Controlled dropdowns deferred reading the event target into an asynchronous mutation; React could restore the previous value before the mutation read it. History retention, Activity retention and the Demo sign-in simulation now capture their selected values synchronously.

Demo reentry now resumes existing data. Packaged Demo uses a separate encrypted local store, backed by the existing `EncryptedStore` and OS-protected vault. A restricted preload API supports only the two Demo storage keys and verifies the active top-level Demo frame. It grants no live-account, provider, credential or arbitrary filesystem access. Any accessible pre-upgrade browser data is imported; data under unreachable previous random origins cannot reliably be recovered. Browser Demo continues using browser storage.

Native settings already used encrypted runtime/preferences stores; this architecture is retained. Preference fields are normalized independently so missing/invalid values fall back without resetting valid unrelated settings. Encrypted data authentication failures remain fail-closed, preserving the original file. Workspace rehydration validates theme, motion, pane and draft values rather than blindly merging stored properties.

| Section | Durable choices | Storage |
| --- | --- | --- |
| General | Startup preference, notifications | Existing account preferences; isolated Demo database |
| Appearance | Color, light/dark, reduced motion | Existing workspace preferences; isolated Demo preferences |
| Security / Advanced | Activity visibility, diagnostics consent | Existing encrypted account preferences |
| Advanced storage | History retention | Existing encrypted account preferences; selected value captured before mutation |
| Demo Advanced | Failure-simulation toggles, next sign-in failure, simulated entitlement state | Isolated Demo database; reentry no longer resets |
| AI / Connected apps | Provider/model configurations, saved MCP configurations and permissions | Existing configuration and credential paths |
| Business Activity | Activity-retention preference | Existing encrypted account preferences |

Local snapshot reads and service mutations are no longer paused by browser offline detection. Services still enforce their own network failures and authorization. Local preferences therefore save while offline. Backup passwords, displayed support reports, storage-usage messages, dialog state and in-flight operations remain ephemeral. Provider/API secrets continue through the existing secure credential mechanism.

## Typography

The reusable `context-content` semantic role adds exactly 1px to the existing responsive base size for Mail sender/description and Inventory product-name/description fields in both Demo records and native snapshots. Mail subject headings, counts, badges, timestamps, stock quantities, controls and other categories retain their original sizes. Existing wrapping/truncation rules remain.

## Validation coverage

Added regressions cover empty saved collections and plan capacity, inactive duplicate-provider configurations, legacy fixture migration, Demo reentry and offline settings, native state rehydration, corrupt preference fields, unchanged unrelated settings, and computed font deltas at both desktop typography breakpoints. The Electron smoke runs in source and packaged modes and now restarts both real preferences and isolated Demo settings across process lifetimes, checks encrypted Demo storage and rejects writes outside its two-key scope. Existing graceful shutdown, repeated restart, navigation cancellation, security, approval and snapshot checks remain enabled.

The owner must manually accept the final Windows candidate. PR #6 stays unmerged; no G-Bot 1.0.0 release is authorized.
