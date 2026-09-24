import { z } from "zod";
export const noticeKind = z.enum([
  "welcome",
  "device_added",
  "device_revoked",
  "payment_grace",
  "account_deleted",
]);
export function notification(kind: z.infer<typeof noticeKind>, portal: string) {
  const messages = {
    welcome: [
      "Welcome to G-Bot",
      "Your verified account is ready. Free includes one connection and one device. Add your own AI key in the desktop application to start working.",
    ],
    device_added: [
      "A device was activated",
      "A device has been added to your G-Bot account. If this was not you, sign in to review your devices and secure your account.",
    ],
    device_revoked: [
      "A device was deactivated",
      "A device's G-Bot access has been deactivated. Its local data has not been erased. Offline access ends no later than its current license expiry.",
    ],
    payment_grace: [
      "Your G-Bot payment needs attention",
      "We could not confirm your subscription payment. Paid access continues for seven days from the start of the failed-payment state, then returns to Free. Review billing in your account. Saved configurations are retained.",
    ],
    account_deleted: [
      "Your G-Bot account was deleted",
      "Your cloud account has been deleted and device access revoked. Local history remains on your devices until you erase it. Required financial records remain with the payment processor.",
    ],
  } as const;
  const [subject, text] = messages[kind];
  return {
    subject: `G-Bot · ${subject}`,
    textContent: `${text}\n\nAccount: ${portal}/portal\nSupport: gbot@vidinex.ee\n\nVidinex E-Commerce OÜ · Registry 17603412 · Estonia\nNever send passwords, API keys or authenticator codes to support.`,
  };
}
