"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { InternalNavigation, internalRoute } from "@/lib/internal-navigation";
type NavigationState = { session: string; stack: InternalNavigation };
const NavigationContext =
  createContext<MutableRefObject<NavigationState> | null>(null);
export function NavigationProvider({ children }: { children: ReactNode }) {
  const path = usePathname();
  const tracked = useRef({ session: "", stack: new InternalNavigation() });
  if (!internalRoute(path))
    tracked.current = { session: "", stack: new InternalNavigation() };
  return (
    <NavigationContext.Provider value={tracked}>
      {children}
    </NavigationContext.Provider>
  );
}
export function AppBack({ session }: { session: string }) {
  const path = usePathname(),
    query = useSearchParams().toString(),
    router = useRouter();
  const tracked = useContext(NavigationContext);
  if (!tracked) throw new Error("NavigationProvider is required");
  if (tracked.current.session !== session)
    tracked.current = { session, stack: new InternalNavigation() };
  const route = path + (query ? `?${query}` : "");
  useEffect(() => {
    const id = tracked.current.stack.observe(
      route,
      window.history.state?.gbotNavigation,
      () => crypto.randomUUID(),
    );
    if (id)
      window.history.replaceState(
        { ...window.history.state, gbotNavigation: id },
        "",
      );
  }, [route, session, tracked]);
  const back = () => {
    const history = tracked.current.stack;
    if (history.canBack(route, window.history.state?.gbotNavigation))
      router.back();
    else router.push(history.fallback(route));
  };
  useEffect(() => {
    // Native accelerators avoid a second Back from Chromium's browser shortcut.
    const handler = () => {
      if (
        document.querySelector('[role="dialog"]') ||
        document.activeElement?.closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      back();
    };
    return (window.gbot ?? window.gbotDemo)?.onBack?.(handler);
  });
  return path === "/workspace" ? null : (
    <Button
      variant="ghost"
      size="sm"
      onClick={back}
      aria-label="Back to previous screen"
    >
      <ArrowLeft size={18} />
      Back
    </Button>
  );
}
