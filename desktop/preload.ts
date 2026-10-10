import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../src/services/desktop/protocol";
const onBack = (listener: () => void) => {
  const handler = () => listener();
  ipcRenderer.on("gbot:back", handler);
  return () => ipcRenderer.removeListener("gbot:back", handler);
};
const api: DesktopBridge = {
  onBack,
  call: (operation, args) =>
    ipcRenderer.invoke("gbot:request", operation, args),
  subscribe: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("gbot:changed", handler);
    return () => ipcRenderer.removeListener("gbot:changed", handler);
  },
};
// The native process owns this mode. Demo never receives the live bridge, even after a reload.
if (ipcRenderer.sendSync("gbot:context") === true) {
  contextBridge.exposeInMainWorld("gbot", Object.freeze(api));
  // Never forward event.message, stacks, request URLs, prompts or rejection values.
  let lastError = 0;
  const report = (kind: "error" | "rejection") => {
    if (Date.now() - lastError < 1000) return;
    lastError = Date.now();
    void ipcRenderer
      .invoke("gbot:request", "desktop.rendererError", [kind])
      .catch(() => {});
  };
  window.addEventListener("error", () => report("error"));
  window.addEventListener("unhandledrejection", () => report("rejection"));
} else {
  contextBridge.exposeInMainWorld(
    "gbotDemo",
    Object.freeze({
      onBack,
      getItem: (name: string) => ipcRenderer.sendSync("gbot:demo-read", name),
      setItem: (name: string, value: string | null) =>
        ipcRenderer.invoke("gbot:demo-write", name, value),
    }),
  );
}
