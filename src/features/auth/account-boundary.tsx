"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isDesktop } from "@/services/desktop/client";
import { useSnapshot } from "@/hooks/use-services";
import { Loading } from "@/components/common/ui";

/** Native Demo has a restricted storage bridge, but deliberately no live bridge. */
export function useAccountLinks() {
  const [native, setNative] = useState<boolean | null>(null);
  useEffect(() => setNative(isDesktop() || !!window.gbotDemo), []);
  return {
    ready: native !== null,
    signin: native ? "/login?returnToApp=1" : "/portal",
    signup: native ? "/signup?returnToApp=1" : "/portal",
    exit: native ? "/?returnToApp=1" : "/",
  };
}

/** No credential form is rendered while the native bridge is being detected. */
export function WebAccountRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!isDesktop()) router.replace("/portal");
  }, [router]);
  return <Loading label="Opening your G-Bot account…" />;
}

export function WorkspaceBoundary({ children }: { children: React.ReactNode }) {
  const { data } = useSnapshot();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const wasDemo = useRef(false);
  useEffect(() => setReady(true), []);
  const allowed = ready && (isDesktop() || data?.user?.id === "demo-user");
  useEffect(() => {
    if (allowed && data?.user?.id === "demo-user") wasDemo.current = true;
    // A Demo sign-out returns to Welcome; unauthenticated direct entry goes to real auth.
    if (ready && data && !allowed)
      router.replace(wasDemo.current ? "/" : "/portal");
  }, [ready, data, allowed, router]);
  return allowed ? children : <Loading label="Opening your workspace…" />;
}
