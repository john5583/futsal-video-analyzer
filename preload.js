"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fsal", {
  pickVideo: () => ipcRenderer.invoke("video:pick"),
  resolveVideo: (p) => ipcRenderer.invoke("video:resolve", p),
  saveProject: (project, existingPath, saveAs) => ipcRenderer.invoke("project:save", project, existingPath, !!saveAs),
  openProject: () => ipcRenderer.invoke("project:open"),
  autosave: (project, aiFrames) => ipcRenderer.invoke("autosave:save", project, aiFrames || null),
  aiStatus: () => ipcRenderer.invoke("ai:status"),
  aiDetect: (buffer, opts) => ipcRenderer.invoke("ai:detect", buffer, opts || {}),
  aiSegment: (req) => ipcRenderer.invoke("ai:segment", req),
  aiStop: () => ipcRenderer.invoke("ai:stop"),
  saveAnimation: (buffer, name, ext) => ipcRenderer.invoke("animation:save", buffer, name, ext),
  showItem: (p) => ipcRenderer.invoke("shell:showItem", p),
  loadAutosave: () => ipcRenderer.invoke("autosave:load"),
  exportHTML: (html, name) => ipcRenderer.invoke("report:exportHTML", html, name),
  exportPDF: (html, name) => ipcRenderer.invoke("report:exportPDF", html, name),
  onMenu: (cb) => {
    const handler = (_e, action) => cb(action);
    ipcRenderer.on("menu", handler);
    return () => ipcRenderer.removeListener("menu", handler);
  }
});
