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
// The native process owns this mode. Demo never receives the live bridge, even after a reload.
if (ipcRenderer.sendSync("gbot:context") === true) {
  contextBridge.exposeInMainWorld("gbot", Object.freeze(api));
}
