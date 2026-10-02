# Configured unsigned owner-test installers

The ordinary CI source and packaged Electron smoke tests use an unconfigured account fixture. They deliberately assert the unavailable-OAuth behavior and must not connect to live accounts. The fixture in `release/` is never uploaded as `G-Bot-Windows-owner-test`.

A separate, opt-in step in `.github/workflows/ci.yml` rebuilds the app with public account configuration after those tests pass. It validates inputs, runs `desktop:build`, compares the generated `desktop-dist/public-config.json` against the validated inputs, then packages into `release-owner-test/` with `--publish never` and `CSC_IDENTITY_AUTO_DISCOVERY=false`. Windows and macOS artifacts are named `G-Bot-Windows-owner-test` and `G-Bot-macOS-owner-test`. These are unsigned acceptance installers, not a release. The existing signed release-candidate workflow is unchanged.

## Repository Actions variables

Set these under **Repository → Settings → Secrets and variables → Actions → Variables → Repository variables**. Public variables scoped only to the protected `release-signing` environment are not available to ordinary CI. Copy only the public values needed for this owner-test target into repository variables; do not attach the CI job to `release-signing`, copy its secrets, or relax its protections.

| Variable | Requirement |
| --- | --- |
| `GBOT_OWNER_TEST_ENABLED` | Set exactly `true` to request configured owner-test artifacts. Otherwise CI emits an explicit notice and produces no owner-test installer. |
| `NEXT_PUBLIC_SUPABASE_URL` | Required HTTPS project URL for the target account system. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required public `sb_publishable_…` key or legacy JWT with role `anon`. Never a service-role or secret key. |
| `NEXT_PUBLIC_GBOT_ENVIRONMENT` | Required explicit `development`, `staging`, or `production`, exactly matching the target control plane and its signed licenses. |
| `GBOT_CONTROL_PLANE_URL` | Required HTTPS origin of that control plane. |
| `GBOT_LICENSE_PUBLIC_KEYS` | Required nonempty JSON object mapping key IDs to Ed25519 public PEMs trusted for that environment. |
| `GBOT_CATALOG_PUBLIC_KEYS` | Optional nonempty public-key map when testing signed Recommended catalog delivery. Omission leaves catalog verification unavailable; it does not bypass verification. |
| `GBOT_UPDATE_PUBLIC_KEYS` | Optional public-key map; supply together with the release manifest URL. |
| `GBOT_RELEASE_MANIFEST_URL` | Optional HTTPS signed-manifest URL; omit with update keys when no update channel is under test. Do not point a staging test at a production channel inadvertently. |
| `GBOT_SENTRY_DSN` | Optional public diagnostics DSN, with no private password. |

For the current Sandbox, use `staging` if that is the deployed control plane's environment. If the validated Sandbox explicitly uses `development`, use that exact value instead. Stripe test mode alone does not establish the license environment. There is no production fallback or automatic environment inference. All URLs and public verification keys must belong to the selected target. Production owner testing requires explicitly selecting production and its matching public configuration; it still does not sign or publish anything.

## Fail-closed checks

`scripts/validate-owner-test-config.ts` rejects missing account fields, unsupported environments, unsafe endpoint URLs, non-public Supabase keys, malformed/empty public-key maps, private PEMs and server-secret patterns. Server and code-signing credential environment variables are forbidden. It reuses the runtime public-config allowlist and checks the emitted file contains exactly the expected public values, without printing them. The packaging step uses GitHub's fail-fast Bash shell on both operating systems so a validation error stops before the builder. Uploads run only on success and read only `release-owner-test/`, never the unconfigured smoke fixture.

The CI job receives only explicit `vars.*` public configuration; there are no `secrets.*` references or protected environment. `SUPABASE_SERVICE_ROLE_KEY`, Stripe secrets, license/catalog/update private keys and code-signing credentials must remain server/release-only. Repository variables are not a place to hide secrets.

## Acceptance

After setting the variables, rerun CI on the reviewed commit. Confirm the configured packaging step and owner-test upload actually ran, download that commit's owner artifact, and test real login, license refresh, Demo separation and account/Stripe transitions against the intended Sandbox. Automated fixture smoke tests establish native behavior; they do not establish live Supabase/Stripe acceptance or prove that the operator selected matching remote endpoints. No release is published and no production credentials are changed by this workflow.
