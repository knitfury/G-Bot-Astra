# Color and appearance refinement

The workspace now keeps color identity (`orange`, `purple`, `blue`, `green`, `neutral`) independent of appearance (`light`, `dark`). Settings provides two labeled native radio groups, keyboard arrow navigation, visible selection checks and focus rings, and a live preview. Switching either preference keeps the other unchanged.

All four dark brand palettes use charcoal surfaces with individually tuned accents. Purple gains a light variant. Neutral preserves White and Dark Grey; White muted text is slightly darker to retain contrast on secondary surfaces. Shared status tokens continue to accompany explicit labels and icons.

## Persistence and integration

- `src/lib/theme.ts` normalizes saved preferences; `src/stores/workspace.ts` migrates version 0 to 1 under the existing `gbot-workspace-v1` key.
- Legacy Orange, Blue and Green become their Light variants. Legacy Purple remains Purple Dark. White becomes Neutral Light; Dark becomes Neutral Dark.
- Migration preserves pane configuration, drafts, model, conversation and motion preferences. The obsolete `theme` field is removed. Invalid theme data safely defaults to Orange Light.
- The root provider sets `data-color` and `data-appearance` on the document. Semantic CSS variables style the entire app, including Radix portals and authentication/onboarding. Native controls inherit `color-scheme`.
- Light palettes define brand-specific tokens; a shared dark foundation supplies statuses and elevation, with per-brand surface/accent overrides. Do not map colored dark preferences to Neutral.
- Existing service contracts, mock implementations and business workflows remain unchanged.

## Validation

Commands: `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`.

- TypeScript and production build pass.
- 19 unit/service tests pass: six existing service tests, three preference/migration tests, ten palette contrast tests. The contrast tests check 14 semantic pairs per palette, including muted text on four surfaces, status labels, accent labels and primary/hover button text. Minimum measured ratio: 4.62:1.
- 19 browser tests pass: nine existing acceptance scenarios expanded for ten themes, six browser migration cases, and four colored-dark workflow/surface scenarios.
- All ten combinations were visually inspected in the main workspace at 1440×1000, 768×1024 and 390×844, plus Appearance settings. No document-level horizontal overflow was detected.
- Each branded dark appearance was rendered and inspected across authentication, signup, onboarding, providers, provider forms/errors, all eight connection slots, connection details, account, settings, activity, approval/editing, messages, attachments, history, G-Bot-only layout and mobile context dialogs/loading.
- Browser checks reject accidentally bright backgrounds on visible panels, dialogs, connection cards and form controls. Dark workflow scenarios reported no browser runtime errors.
- Native radio arrow-key behavior, appearance preservation when color changes, visible focus, preference reload and reduced-motion behavior are covered. Status text remains explicit; selection uses checks and radio state in addition to color.

Playwright writes per-variant screenshots to its ignored output folder. Capture disables animations so theme-transition intermediate frames cannot be mistaken for final colors. Run the suite to regenerate the evidence. The Chromium fallback remains documented in the main engineering handoff.

This review covers Chromium and the stated viewport sizes; it is not a complete accessibility certification or cross-browser audit. Phase 1 integrations and credentials remain simulated.
