# Phase 3 baseline and boundaries

Base: merged Phase 2 main `95d5bf5c3206bcf1db34aea789cfff2fe72249cc`, tree `a3296067ca3af0ddecb9b4623374e873c26bee89`. Phase 1/2 source, contracts, fixtures, ten themes and acceptance tests retained. Private specifications are not repository artifacts.

| Existing boundary | Production change |
|---|---|
| Runtime local profile / development plan | Supabase identity, trusted billing, signed device entitlement |
| Atomic plaintext workspace | Versioned authenticated encryption, OS protected key, explicit failure recovery |
| SafeStorage credentials | Retained; dedicated protected identity/license state |
| Direct provider/MCP adapters | Retained, operational license checked before requests |
| Exact write approvals | Retained and revalidated immediately before execution |
| Static demo connection cards | Remote signed catalog; unverified vendors never Recommended |
| Limited attachment reader | Bounded local parsers; transient content, cleanup |
| Electron updater | Stable-only, manual release gates, signing prerequisites |
| Browser mock workspace | Clearly identified Demo; independent authenticated account portal |

Cloud tables contain identity, billing, device/license and sanitized administrative metadata only. Ordinary conversation/message/attachment/provider/MCP payloads never enter the control plane. Backend routes use Supabase service credentials only on the hosting server; user identity is independently verified. No cloud credentials belong in an installer.

Baseline validation is recorded in VALIDATION.md when completed. Live credentials, Supabase project, Stripe price IDs, OAuth apps, DNS, SMTP, signing and notarization are external prerequisites; fixture coverage is not live-service acceptance.
