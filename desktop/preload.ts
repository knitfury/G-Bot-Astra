import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../src/services/desktop/protocol";
const api: DesktopBridge = {
  call: (operation, args) =>
    ipcRenderer.invoke("gbot:request", operation, args),
  subscribe: (listener) => {
    const handler = () => listener();
    ipcRenderer.on("gbot:changed", handler);
    return () => ipcRenderer.removeListener("gbot:changed", handler);
  },
};
contextBridge.exposeInMainWorld("gbot", Object.freeze(api));
