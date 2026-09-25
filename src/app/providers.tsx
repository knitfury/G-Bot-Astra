"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { services } from "@/services";
import { useWorkspace } from "@/stores/workspace";
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  const color = useWorkspace((s) => s.color),
    appearance = useWorkspace((s) => s.appearance),
    reduced = useWorkspace((s) => s.reducedMotion);
  useEffect(() => {
    services.hydrate();
    document.documentElement.dataset.appReady = "true";
    return services.subscribe(() => {
      void client.invalidateQueries({ queryKey: ["snapshot"] });
    });
  }, [client]);
  useLayoutEffect(() => {
    // Hydration initially renders the server defaults. Apply the actual persisted
    // store snapshot before paint, not that stale render snapshot.
    const {
      color,
      appearance,
      reducedMotion: reduced,
    } = useWorkspace.getState();
    document.documentElement.dataset.color = color;
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.dataset.motion = reduced ? "reduced" : "full";
  }, [color, appearance, reduced]);
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion={reduced ? "always" : "user"}>
        {children}
      </MotionConfig>
    </QueryClientProvider>
  );
}
