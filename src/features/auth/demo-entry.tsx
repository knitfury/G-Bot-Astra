"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { services } from "@/services";
import { isDesktop } from "@/services/desktop/client";
import { Loading, ErrorState } from "@/components/common/ui";
export function DemoEntry() {
  const router = useRouter(),
    started = useRef(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (isDesktop()) {
      router.replace("/");
      return;
    }
    void services.auth
      .demo()
      .then(() => router.replace("/workspace"))
      .catch(() =>
        setError("Demo could not open. Return to Welcome and try again."),
      );
  }, [router]);
  return error ? (
    <ErrorState message={error} />
  ) : (
    <Loading label="Preparing your Demo workspace…" />
  );
}
