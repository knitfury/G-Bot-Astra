import type { Metadata } from "next";
import { Providers } from "./providers";
import "@/styles/globals.css";
import "@/styles/product.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "G-Bot — Your business, working together",
  description:
    "A configurable AI business workspace. Phase 1 interactive frontend simulation.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
