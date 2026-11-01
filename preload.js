"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fsal", {
  pickVideo: () => ipcRenderer.invoke("video:pick"),
  pickVideos: () => ipcRenderer.invoke("video:pickMany"),
  resolveVideo: (p) => ipcRenderer.invoke("video:resolve", p),
  saveProject: (project, existingPath, saveAs) => ipcRenderer.invoke("project:save", project, existingPath, !!saveAs),
  autoSaveProject: (project) => ipcRenderer.invoke("project:autoSave", project),
  readProject: (p) => ipcRenderer.invoke("project:read", p),
  openProject: () => ipcRenderer.invoke("project:open"),
  autosave: (project, aiFrames) => ipcRenderer.invoke("autosave:save", project, aiFrames || null),
  aiStatus: () => ipcRenderer.invoke("ai:status"),
  aiDetect: (buffer, opts) => ipcRenderer.invoke("ai:detect", buffer, opts || {}),
  aiSegment: (req) => ipcRenderer.invoke("ai:segment", req),
  aiStop: () => ipcRenderer.invoke("ai:stop"),
  aiGoals: (req) => ipcRenderer.invoke("ai:goals", req),
  aiGoalsDispo: () => ipcRenderer.invoke("ai:goalsDispo"),
  solGlobalBegin: (n) => ipcRenderer.invoke("solglobal:begin", n),
  solGlobalFrame: (id, k, buf) => ipcRenderer.invoke("solglobal:frame", id, k, buf),
  solGlobalRun: (id, extra) => ipcRenderer.invoke("solglobal:run", id, extra),
  solGlobalCancel: (id) => ipcRenderer.invoke("solglobal:cancel", id),
  onSolGlobalProgress: (cb) => {
    const handler = (_e, id, p) => cb(id, p);
    ipcRenderer.on("solglobal:progress", handler);
    return () => ipcRenderer.removeListener("solglobal:progress", handler);
  },
  aiSetDevice: (device) => ipcRenderer.invoke("ai:setDevice", device),
  labelsKey: (name, size) => ipcRenderer.invoke("labels:key", name, size),
  journalAppend: (entry) => ipcRenderer.invoke("journal:append", entry),
  journalLoad: () => ipcRenderer.invoke("journal:load"),
  labelsLoad: (key) => ipcRenderer.invoke("labels:load", key),
  labelsSave: (key, data) => ipcRenderer.invoke("labels:save", key, data),
  labelsSaveImage: (key, ms, jpeg) => ipcRenderer.invoke("labels:saveImage", key, ms, jpeg),
  exportBallDataset: (items) => ipcRenderer.invoke("dataset:exportBall", items),
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
