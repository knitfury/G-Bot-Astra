# Transactional email setup

Draft templates for owner review. Install verification and recovery in the matching Supabase Auth custom email templates, using Brevo SMTP. Enable the relevant password/MFA security notification templates and adapt the security heading to the specific event. Use provider-generated confirmation URLs; never manually concatenate tokens or unvalidated redirects. Verify sender no-reply@vidinex.ee and support gbot@vidinex.ee, mobile rendering, expiry, link reuse, SPF/DKIM/DMARC and test inbox delivery before launch.

Welcome, device activation/deactivation, seven-day payment grace and account-deletion content lives in `src/production/server/notifications.ts`; the service-only outbox delivers through Brevo's transactional API. Stripe supplies billing receipts. These templates were not sent to real recipients during development.
