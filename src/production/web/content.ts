export const pages: Record<
  string,
  { title: string; intro: string; sections: [string, string][] }
> = {
  privacy: {
    title: "Privacy Policy — draft for legal review",
    intro:
      "Vidinex E-Commerce OÜ, registry code 17603412, Estonia. Contact gbot@vidinex.ee. This candidate policy must be reviewed before public launch.",
    sections: [
      [
        "Direct business traffic",
        "Your device sends prompts, selected attachments and necessary tool results directly to your selected AI provider. MCP requests go directly to authorized MCP servers. Those providers process data under their own terms. G-Bot does not cloud-store ordinary conversations, attachments, BYOK/MCP credentials or business payloads.",
      ],
      [
        "Account services",
        "Supabase processes authentication, profile, subscription metadata, devices and licenses. Stripe processes payments and retains legally required financial records. Brevo delivers authentication and security emails through Supabase custom SMTP. EU/Frankfurt is the intended Supabase production region; deployment, processor agreements, transfer safeguards and legal bases require review.",
      ],
      [
        "Local storage",
        "Desktop history and workspace data are encrypted using an OS-protected key. Credentials and account sessions use OS credential protection. Optional portable backups use your separate backup password; we cannot recover it. Readable history exports are not encrypted.",
      ],
      [
        "Diagnostics",
        "Optional Sentry diagnostics must be sanitized before transmission. Only minimized version/platform/component/error metadata and anonymous identifiers are allowed. Conversations, attachments, MCP payloads, credentials and customer business content are excluded. Inspect a support export before emailing it.",
      ],
      [
        "Retention and rights",
        "Local history remains until deleted unless you choose 30, 90 or 180 day retention. Activity can be cleared separately. Sanitized operational logs target 30 days; security/admin audits 12 months. Account deletion revokes cloud access but does not erase devices remotely. Contact support for access, correction, deletion and privacy requests. Financial retention, rights handling and final statutory periods require legal review.",
      ],
    ],
  },
  terms: {
    title: "Terms of Service — draft for legal review",
    intro:
      "G-Bot is provided by Vidinex E-Commerce OÜ, registry 17603412, Estonia. These draft terms are not approved launch terms.",
    sections: [
      [
        "Service",
        "G-Bot is a single-user desktop business assistant with separate account services. You supply your own AI keys and authorized MCP access. Third-party charges and terms apply.",
      ],
      [
        "Your control",
        "You are responsible for permissions, reviewing consequential actions and verifying outputs. AI output may be incorrect. Approval records identify the requested action but do not guarantee third-party success.",
      ],
      [
        "Availability",
        "Third-party AI/MCP outages are distinct from G-Bot service availability. Offline licensing lasts at most seven days after issuance. No uptime or outcome guarantee is stated in this draft.",
      ],
      [
        "Before launch",
        "Counsel must finalize consumer rights, withdrawal rights, liability, acceptable use, governing law and dispute resolution. Nothing in this draft removes mandatory legal rights.",
      ],
    ],
  },
  subscriptions: {
    title: "Subscription & Cancellation — draft",
    intro:
      "Free: €0. Starter: €14/month or €140/year. Business: €29/month or €290/year. All plans are single-user BYOK.",
    sections: [
      [
        "Access",
        "Free allows one active MCP connection and one device. Starter allows five and two. Business allows eight and three. G-Bot imposes no message/token allowance; providers may impose their own.",
      ],
      [
        "Changes",
        "Upgrades take effect after trusted billing confirmation and appropriate proration. Downgrades and cancellation take effect at the current period end. Saved connection configuration is retained; excess connections become inactive.",
      ],
      [
        "Payment recovery",
        "Failed payment receives a seven-day G-Bot grace period. Unrecovered accounts return to Free. Manage payment methods, invoices and cancellation through the account portal and Stripe.",
      ],
      [
        "Review",
        "EUR is primary. Consumer tax-inclusive presentation, automatic tax, renewal notices, statutory withdrawal and local accounting treatment require legal/tax review before launch.",
      ],
    ],
  },
  refunds: {
    title: "Refund Policy — draft",
    intro:
      "Contact gbot@vidinex.ee for billing help. Refunds require authorized administrative review.",
    sections: [
      [
        "Requests",
        "Provide the billing reference and issue description. Never email card information, API keys or private business records.",
      ],
      [
        "Processing",
        "Full or partial refunds are issued by authorized administrators through Stripe and reconciled with account state. There is no automatic self-service refund.",
      ],
      [
        "Consumer rights",
        "Final eligibility, timing and statutory withdrawal rules must be reviewed before launch. This draft does not limit mandatory rights.",
      ],
    ],
  },
  cookies: {
    title: "Cookies & local storage — draft",
    intro:
      "No advertising trackers, Meta Pixel or behavioral analytics are included.",
    sections: [
      [
        "Essential storage",
        "The account portal uses essential authentication/session storage and security tokens. The desktop stores encrypted preferences and history locally. Demo Mode uses separate browser storage for fictional data.",
      ],
      [
        "Optional diagnostics",
        "Sanitized diagnostics are optional. Disabling them does not disable essential account security and billing records. No optional analytics is required for launch.",
      ],
    ],
  },
  support: {
    title: "How can we help?",
    intro:
      "Start with these checks, inspect sanitized diagnostics, then contact gbot@vidinex.ee.",
    sections: [
      [
        "AI connection",
        "Check your provider URL, model name, key permissions and provider balance. Test the connection in AI providers. Never send your key to support.",
      ],
      [
        "App connection",
        "Confirm the server supports remote Streamable HTTP, reconnect expired authorization, then review Tools & Permissions. New or changed tools start disabled. An unknown snapshot format does not mean the connection cannot be used by G-Bot.",
      ],
      [
        "History and backup",
        "If encrypted storage cannot be opened, unlock your OS keychain and restart. Do not delete recovery files. Restore only a verified password-encrypted backup. Support cannot decrypt your backup without your password and will never request it.",
      ],
      [
        "A failed action",
        "Read Execution Details. Do not repeat a consequential action marked uncertain until you verify the external app. Reads can be retried after reconnecting.",
      ],
      [
        "Contact support",
        "Use Advanced → Sanitized diagnostics to inspect and export a report, then email gbot@vidinex.ee. Remove any additional private content before sending. Support has no remote access to your workspace.",
      ],
    ],
  },
  connections: {
    title: "Connect your business",
    intro:
      "Use G-Bot Recommended entries when available, or add a Custom remote MCP connection.",
    sections: [
      [
        "Custom setup",
        "Enter the server’s HTTPS Streamable HTTP endpoint and its documented authentication method. Authorize discovery, then choose tools. Unknown consequential tools always require explicit approval. Local stdio and legacy SSE are not supported.",
      ],
      [
        "Useful snapshots",
        "Enabled, safely understood read tools can populate Mail, Inventory, CRM, Orders, Accounting or Shipping panes. G-Bot never guesses required identifiers or enables tools automatically. If a safe snapshot is unavailable, ask G-Bot and review connection details.",
      ],
      [
        "Recommended acceptance",
        "Zoho CRM, Books, Mail and Inventory, WooCommerce and shipping candidates are under review. Recommendation requires actual endpoint/auth/permissions/read/approval/recovery tests. No untested vendor is represented as verified.",
      ],
    ],
  },
  downloads: {
    title: "G-Bot for your desktop",
    intro: "Release candidate 1.0.0. Public installers are not yet available.",
    sections: [
      [
        "Windows",
        "Target: Windows 10 22H2 and Windows 11. Public direct-download installers require trusted signing, security validation and manual release approval.",
      ],
      [
        "macOS",
        "Target: macOS 13 Ventura or later. Apple Silicon first. Intel support is advertised only after real testing. Public builds require Developer ID signing and notarization. Never bypass Gatekeeper.",
      ],
      [
        "Download integrity",
        "Approved releases will list platform, architecture, version and SHA-256 checksum. Updates use the Stable channel and must be authenticated. No public release has been published by this implementation.",
      ],
      [
        "No account needed to download",
        "Operational use requires a G-Bot account. Demo Mode remains available without paid AI keys or live app connections.",
      ],
    ],
  },
  status: {
    title: "G-Bot service status",
    intro:
      "Pre-launch — production services have not been declared operational. Updated manually; this page is not an automated uptime monitor.",
    sections: [
      [
        "G-Bot controlled services",
        "Authentication/accounts, subscriptions/entitlements, licensing, account portal and downloads/updates: awaiting production activation and acceptance.",
      ],
      [
        "Third-party services",
        "AI provider and MCP service availability is controlled by those providers. A third-party failure does not necessarily indicate a G-Bot account outage.",
      ],
      [
        "Incident updates",
        "Operators publish dated, sanitized incident summaries here after review. Contact gbot@vidinex.ee for assistance.",
      ],
    ],
  },
  notices: {
    title: "Open-source notices",
    intro: "G-Bot builds on open-source software.",
    sections: [
      [
        "Core libraries",
        "Next.js, React, TypeScript, Tailwind CSS, Radix, Phosphor Icons, Framer Motion, Zustand, TanStack Query, React Hook Form, Zod, Electron and the Model Context Protocol SDK.",
      ],
      [
        "Production libraries",
        "Supabase JS, Stripe, Sentry, PDF.js, Mammoth and ExcelJS. Applicable license texts ship with their packages. See THIRD_PARTY_NOTICES.md in the source distribution.",
      ],
    ],
  },
};
