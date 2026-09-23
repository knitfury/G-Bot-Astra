import type { Services } from "./contracts";
import { mockServices } from "./mocks";
import { desktopServices, isDesktop } from "./desktop/client";
// Resolve at invocation time so SSR never chooses a privileged desktop implementation.
const desktop = desktopServices();
export const services: Services = new Proxy(mockServices, {
  get(_target, property: keyof Services) {
    return (isDesktop() ? desktop : mockServices)[property];
  },
});
