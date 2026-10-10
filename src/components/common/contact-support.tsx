"use client";
import { desktopCall, isDesktop } from "@/services/desktop/client";
export function ContactSupport() {
  return (
    <a
      className="text-link"
      href="mailto:gbot@vidinex.ee?subject=G-Bot%20Support%20%E2%80%94%20Desktop"
      onClick={(e) => {
        if (isDesktop()) {
          e.preventDefault();
          void desktopCall("desktop.support").catch(() => {});
        }
      }}
    >
      Contact G-Bot Support
    </a>
  );
}
