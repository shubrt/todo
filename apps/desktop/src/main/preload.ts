import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, DesktopView, PublicDesktopState } from "../shared/contracts";

const bridge: DesktopBridge = {
  getState: () => ipcRenderer.invoke("desktop:state"),
  login: () => ipcRenderer.invoke("desktop:login"),
  cancelLogin: () => ipcRenderer.invoke("desktop:cancel-login"),
  createIntegrationKey: (name) => ipcRenderer.invoke("desktop:create-key", name),
  copyText: (text) => ipcRenderer.invoke("desktop:copy", text),
  disconnect: () => ipcRenderer.invoke("desktop:disconnect"),
  fetchAccessToken: (options) => ipcRenderer.invoke("desktop:token", options),
  setPreferences: (patch) => ipcRenderer.invoke("desktop:preferences", patch),
  hide: () => ipcRenderer.invoke("desktop:hide"),
  onState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PublicDesktopState) =>
      callback(state);
    ipcRenderer.on("desktop:state-changed", listener);
    return () => ipcRenderer.removeListener("desktop:state-changed", listener);
  },
  onNavigate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, view: DesktopView) => callback(view);
    ipcRenderer.on("desktop:navigate", listener);
    return () => ipcRenderer.removeListener("desktop:navigate", listener);
  },
};

contextBridge.exposeInMainWorld("desktop", Object.freeze(bridge));
