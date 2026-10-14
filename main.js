"use strict";
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require("electron");
const updater = require("./updater");
const { Worker } = require("worker_threads");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { Readable } = require("stream");

const VIDEO_EXT = [".mp4", ".m4v", ".mov", ".webm", ".mkv", ".ogv"];
const PROJECT_EXT = "fsal";
const savedProjects = new Set(); // projets enregistrés automatiquement pendant cette session (seuls lisibles par project:read)
const allowedVideos = new Set(); // chemins validés par l'utilisateur (dialogue ou projet ouvert)
let mainWindow = null;

protocol.registerSchemesAsPrivileged([
  { scheme: "fsvideo", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: false } }
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function videoUrl(p) {
  return "fsvideo://local/" + encodeURIComponent(p);
}

function checkVideo(p) {
  if (typeof p !== "string" || !p) return { error: "Chemin vidéo invalide." };
  if (!VIDEO_EXT.includes(path.extname(p).toLowerCase())) return { error: "Format de fichier non pris en charge (MP4, M4V, MOV, WEBM, MKV, OGV)." };
  try {
    if (!fs.statSync(p).isFile()) return { error: "Le fichier vidéo est introuvable." };
  } catch (e) {
    return { error: "Le fichier vidéo est introuvable : " + p };
  }
  allowedVideos.add(path.resolve(p));
  return { path: p, name: path.basename(p), url: videoUrl(p) };
}


const MIME = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska", ".ogv": "video/ogg" };

// Sert un fichier vidéo local avec prise en charge des requêtes Range (indispensable pour se déplacer dans la vidéo).
function serveVideo(request) {
  try {
    const u = new URL(request.url);
    const p = path.resolve(decodeURIComponent(u.pathname.slice(1)));
    if (!allowedVideos.has(p)) return new Response("Accès refusé", { status: 403 });
    const size = fs.statSync(p).size;
    const base = {
      "Content-Type": MIME[path.extname(p).toLowerCase()] || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges"
    };
    const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
    let start = 0;
    let end = size - 1;
    let status = 200;
    if (m && (m[1] !== "" || m[2] !== "")) {
      if (m[1] === "") { start = Math.max(0, size - Number(m[2])); }
      else { start = Number(m[1]); if (m[2] !== "") end = Math.min(end, Number(m[2])); }
      if (start > end || start >= size) {
        return new Response(null, { status: 416, headers: Object.assign({ "Content-Range": "bytes */" + size }, base) });
      }
      status = 206;
    }
    const headers = Object.assign({ "Content-Length": String(end - start + 1) }, base);
    if (status === 206) headers["Content-Range"] = "bytes " + start + "-" + end + "/" + size;
    const stream = size === 0 ? null : Readable.toWeb(fs.createReadStream(p, { start, end }));
    return new Response(stream, { status, headers });
  } catch (_err) {
    return new Response("Introuvable", { status: 404 });
  }
}


/* ---------- Détection par IA (fil d'exécution dédié) ---------- */
function modelPath() {
  return app.isPackaged ? path.join(process.resourcesPath, "models", "yolox_s.onnx") : path.join(__dirname, "models", "yolox_s.onnx");
}

/* Modèle plus précis (YOLOX-m), utilisé seulement quand le calcul se fait sur la carte graphique. */
function gpuModelPath() {
  const p = app.isPackaged ? path.join(process.resourcesPath, "models", "yolox_m.onnx") : path.join(__dirname, "models", "yolox_m.onnx");
  return fs.existsSync(p) ? p : null;
}

function samPaths() {
  const dir = app.isPackaged ? path.join(process.resourcesPath, "models") : path.join(__dirname, "models");
  return { enc: path.join(dir, "mobile_sam_encoder.onnx"), dec: path.join(dir, "mobile_sam_decoder.onnx") };
}

const ai = { worker: null, ready: null, pending: new Map(), nextId: 1, error: null, backend: null };

/* Moteur de calcul : « auto » (carte graphique si elle est plus rapide) ou « cpu » (processeur uniquement). */
function aiPrefsFile() { return path.join(app.getPath("userData"), "ai-prefs.json"); }
function aiDevicePref() {
  try { return JSON.parse(fs.readFileSync(aiPrefsFile(), "utf8")).device === "cpu" ? "cpu" : "auto"; } catch (_e) { return "auto"; }
}

function aiStop() {
  if (ai.worker) { try { ai.worker.terminate(); } catch (_e) { /* déjà arrêté */ } }
  ai.pending.forEach((p) => p.reject(new Error("Détecteur arrêté")));
  ai.pending.clear();
  ai.worker = null; ai.ready = null; ai.backend = null;
}

function aiStart() {
  if (ai.ready) return ai.ready;
  const file = modelPath();
  if (!fs.existsSync(file)) {
    ai.ready = Promise.reject(new Error("Modèle de détection introuvable : " + file));
    ai.ready.catch(() => { ai.ready = null; });
    return ai.ready;
  }
  ai.ready = new Promise((resolve, reject) => {
    const workerFile = path.join(__dirname, "src", "ai", "worker.js").replace("app.asar" + path.sep, "app.asar.unpacked" + path.sep);
    // le choix de la carte graphique est refait quand l'application ou le modèle change
    let signature = app.getVersion();
    try { signature += ":" + fs.statSync(file).size; } catch (_e) { /* taille inconnue */ }
    const w = new Worker(workerFile, { workerData: {
      modelPath: file, gpuModelPath: gpuModelPath(), samEncPath: samPaths().enc, samDecPath: samPaths().dec, threads: Math.max(1, os.cpus().length - 1),
      prefer: aiDevicePref(), backendFile: path.join(app.getPath("userData"), "ai-backend.json"), signature
    } });
    ai.worker = w;
    w.on("message", (m) => {
      if (m.type === "ready") { ai.backend = m.backend || null; resolve(true); }
      else if (m.type === "backend") ai.backend = m.backend || null;
      else if (m.type === "fatal") { reject(new Error(m.error)); aiStop(); }
      else if (m.type === "result") {
        const p = ai.pending.get(m.id);
        if (!p) return;
        ai.pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error)); else p.resolve(m.masks !== undefined ? m.masks : m.dets);
      }
    });
    w.on("error", (e) => { reject(e); aiStop(); });
    w.on("exit", () => { if (ai.worker === w) aiStop(); });
  });
  ai.ready.catch(() => { ai.ready = null; });
  return ai.ready;
}

async function aiDetect(buffer, opts) {
  await aiStart();
  return new Promise((resolve, reject) => {
    const id = ai.nextId++;
    ai.pending.set(id, { resolve, reject });
    const ab = buffer instanceof ArrayBuffer ? buffer : (buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    ai.worker.postMessage({ type: "detect", id, buffer: ab, minPerson: opts && opts.minPerson, minBall: opts && opts.minBall }, [ab]);
  });
}

/* Découpe des silhouettes : { imgId, buffer (RGBA, optionnel si l'image est déjà encodée), width, height, boxes } -> masques. */
async function aiSegment(req) {
  const sp = samPaths();
  if (!fs.existsSync(sp.enc) || !fs.existsSync(sp.dec)) throw new Error("Modèle de découpe introuvable : réinstallez l'application.");
  await aiStart();
  return new Promise((resolve, reject) => {
    const id = ai.nextId++;
    ai.pending.set(id, { resolve, reject });
    const msg = { type: "segment", id, imgId: String(req.imgId), width: req.width, height: req.height, boxes: req.boxes || [] };
    const transfer = [];
    if (req.buffer) {
      const ab = req.buffer instanceof ArrayBuffer ? req.buffer : req.buffer.buffer.slice(req.buffer.byteOffset, req.buffer.byteOffset + req.buffer.byteLength);
      msg.buffer = ab; transfer.push(ab);
    }
    ai.worker.postMessage(msg, transfer);
  });
}

function atomicWrite(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, file);
}

function autosavePath() {
  return path.join(app.getPath("userData"), "autosave.json");
}

function validProject(p) {
  return p && typeof p === "object" && Array.isArray(p.events);
}

function buildMenu() {
  const send = (action) => () => mainWindow && mainWindow.webContents.send("menu", action);
  const template = [
    {
      label: "Fichier",
      submenu: [
        { label: "Nouveau projet", accelerator: "CmdOrCtrl+N", click: send("new") },
        { label: "Ouvrir un projet…", accelerator: "CmdOrCtrl+O", click: send("open") },
        { label: "Enregistrer", accelerator: "CmdOrCtrl+S", click: send("save") },
        { label: "Enregistrer sous…", accelerator: "CmdOrCtrl+Shift+S", click: send("saveAs") },
        { type: "separator" },
        { label: "Ouvrir une vidéo…", accelerator: "CmdOrCtrl+Shift+O", click: send("video") },
        { type: "separator" },
        { label: "Quitter", role: "quit" }
      ]
    },
    {
      label: "Affichage",
      submenu: [
        { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" },
        { type: "separator" }, { role: "togglefullscreen" }
      ]
    },
    {
      label: "Aide",
      submenu: [
        { label: "Guide d'utilisation", click: send("help") },
        { label: "Rechercher une mise à jour…", click: () => updater.check(true) },
        { label: "À propos", click: () => dialog.showMessageBox(mainWindow, { type: "info", title: "À propos", message: "Futsal Analyzer " + app.getVersion(), detail: "Analyse tactique vidéo du futsal : erreurs, solutions et base de connaissances." }) }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: "#0f172a", title: "Futsal Analyzer", show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (e) => e.preventDefault());
  mainWindow.loadFile(path.join(__dirname, "src", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

function registerIpc() {
  ipcMain.handle("video:pick", async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: "Choisir la vidéo du match",
      properties: ["openFile"],
      filters: [{ name: "Vidéos", extensions: VIDEO_EXT.map((e) => e.slice(1)) }]
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    return checkVideo(r.filePaths[0]);
  });
  ipcMain.handle("video:pickMany", async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: "Choisir une ou plusieurs vidéos à analyser",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Vidéos", extensions: VIDEO_EXT.map((e) => e.slice(1)) }]
    });
    if (r.canceled || !r.filePaths.length) return { canceled: true };
    return { videos: r.filePaths.slice(0, 20).map(checkVideo) };
  });
  ipcMain.handle("video:resolve", (_e, p) => checkVideo(p));

  ipcMain.handle("project:save", async (_e, project, existingPath, saveAs) => {
    if (!validProject(project)) return { error: "Projet invalide." };
    let target = existingPath;
    if (!target || saveAs) {
      const base = (project.name || "analyse").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "analyse";
      const r = await dialog.showSaveDialog(mainWindow, {
        title: "Enregistrer le projet",
        defaultPath: base + "." + PROJECT_EXT,
        filters: [{ name: "Projet Futsal Analyzer", extensions: [PROJECT_EXT] }]
      });
      if (r.canceled || !r.filePath) return { canceled: true };
      target = r.filePath;
    }
    try {
      atomicWrite(target, JSON.stringify(project));
      return { path: target };
    } catch (err) {
      return { error: "Écriture impossible : " + err.message };
    }
  });

  /* Enregistre automatiquement l'analyse d'une vidéo (à côté de la vidéo, sinon dans le dossier de l'application). */
  ipcMain.handle("project:autoSave", (_e, project) => {
    if (!validProject(project)) return { error: "Projet invalide." };
    const base = (path.basename(project.videoName || project.name || "analyse", path.extname(project.videoName || "")) || "analyse").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60);
    const dirs = [];
    if (project.videoPath) dirs.push(path.dirname(project.videoPath));
    dirs.push(path.join(app.getPath("userData"), "analyses"));
    for (const dir of dirs) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        const target = path.join(dir, base + "." + PROJECT_EXT);
        atomicWrite(target, JSON.stringify(project));
        savedProjects.add(path.resolve(target));
        return { path: target };
      } catch (_err) { /* dossier non inscriptible : on essaie le suivant */ }
    }
    return { error: "Enregistrement impossible." };
  });
  ipcMain.handle("project:read", (_e, p) => {
    try {
      if (typeof p !== "string" || !savedProjects.has(path.resolve(p))) return { error: "Projet non autorisé." };
      const project = JSON.parse(fs.readFileSync(p, "utf8"));
      if (!validProject(project)) return { error: "Fichier de projet invalide." };
      return { project, path: p };
    } catch (err) { return { error: "Lecture impossible : " + err.message }; }
  });
  ipcMain.handle("project:open", async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: "Ouvrir un projet",
      properties: ["openFile"],
      filters: [{ name: "Projet Futsal Analyzer", extensions: [PROJECT_EXT] }]
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    try {
      const project = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8"));
      if (!validProject(project)) return { error: "Ce fichier n'est pas un projet Futsal Analyzer valide." };
      return { project, path: r.filePaths[0] };
    } catch (err) {
      return { error: "Lecture impossible : " + err.message };
    }
  });


  ipcMain.handle("ai:status", async () => {
    const st = { samPresent: fs.existsSync(samPaths().enc) && fs.existsSync(samPaths().dec), modelPresent: fs.existsSync(modelPath()), cpus: os.cpus().length, engineError: null };
    if (!st.modelPresent) return st;
    st.device = aiDevicePref();
    try { await aiStart(); } catch (err) { st.engineError = String(err && err.message || err); }
    st.backend = ai.backend;
    return st;
  });
  ipcMain.handle("ai:setDevice", (_e, device) => {
    const d = device === "cpu" ? "cpu" : "auto";
    if (d === aiDevicePref()) return true;
    try { atomicWrite(aiPrefsFile(), JSON.stringify({ device: d })); } catch (err) { return { error: "Réglage non enregistré : " + err.message }; }
    aiStop();   // le détecteur redémarre sur le nouveau moteur à la prochaine demande
    return true;
  });
  ipcMain.handle("ai:detect", async (_e, buffer, opts) => {
    try { return { dets: await aiDetect(buffer, opts || {}) }; }
    catch (err) { return { error: String(err && err.message || err) }; }
  });
  ipcMain.handle("ai:segment", async (_e, req) => {
    try {
      if (!req || !Array.isArray(req.boxes) || !(req.width > 0) || !(req.height > 0)) throw new Error("Requête de découpe invalide");
      return { masks: await aiSegment(req) };
    } catch (err) { return { error: String(err && err.message || err) }; }
  });
  ipcMain.handle("ai:stop", () => { aiStop(); return true; });

  ipcMain.handle("animation:save", async (_e, buffer, defaultName, ext) => {
    const e = ext === "mp4" ? "mp4" : "webm";
    const r = await dialog.showSaveDialog(mainWindow, {
      title: "Enregistrer la vidéo de correction",
      defaultPath: (defaultName || "correction-futsal").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) + "." + e,
      filters: [{ name: e === "mp4" ? "Vidéo MP4" : "Vidéo WebM", extensions: [e] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    try { fs.writeFileSync(r.filePath, Buffer.from(buffer)); return { path: r.filePath }; }
    catch (err) { return { error: "Écriture impossible : " + err.message }; }
  });
  ipcMain.handle("shell:showItem", (_e, p) => { if (typeof p === "string" && fs.existsSync(p)) shell.showItemInFolder(p); return true; });

  /* La sauvegarde automatique garde les trajectoires IA (volumineuses) dans un fichier séparé, réécrit seulement quand elles changent. */
  ipcMain.handle("autosave:save", (_e, project, aiFrames) => {
    if (!validProject(project)) return { error: "Projet invalide." };
    try {
      if (aiFrames) atomicWrite(path.join(app.getPath("userData"), "autosave-ai.json"), JSON.stringify(aiFrames));
      atomicWrite(autosavePath(), JSON.stringify(project));
      return { ok: true };
    } catch (err) { return { error: err.message }; }
  });
  ipcMain.handle("autosave:load", () => {
    try {
      const project = JSON.parse(fs.readFileSync(autosavePath(), "utf8"));
      if (!validProject(project)) return { none: true };
      let frames = null;
      try { frames = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "autosave-ai.json"), "utf8")); } catch (_e) { frames = null; }
      return { project, aiFrames: Array.isArray(frames) ? frames : null };
    } catch (_err) {
      return { none: true };
    }
  });

  ipcMain.handle("report:exportHTML", async (_e, html, name) => {
    if (typeof html !== "string") return { error: "Rapport invalide." };
    const r = await dialog.showSaveDialog(mainWindow, {
      title: "Exporter le rapport (HTML)", defaultPath: (name || "rapport-futsal") + ".html",
      filters: [{ name: "Page web", extensions: ["html"] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    try { fs.writeFileSync(r.filePath, html, "utf8"); return { path: r.filePath }; }
    catch (err) { return { error: "Écriture impossible : " + err.message }; }
  });

  ipcMain.handle("report:exportPDF", async (_e, html, name) => {
    if (typeof html !== "string") return { error: "Rapport invalide." };
    const r = await dialog.showSaveDialog(mainWindow, {
      title: "Exporter le rapport (PDF)", defaultPath: (name || "rapport-futsal") + ".pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    const tmp = path.join(os.tmpdir(), "futsal-report-" + process.pid + "-" + Date.now() + ".html");
    let win = null;
    try {
      fs.writeFileSync(tmp, html, "utf8");
      win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
      await win.loadFile(tmp);
      const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: "A4", margins: { marginType: "default" } });
      fs.writeFileSync(r.filePath, pdf);
      return { path: r.filePath };
    } catch (err) {
      return { error: "Export PDF impossible : " + err.message };
    } finally {
      if (win) win.destroy();
      fs.rm(tmp, { force: true }, () => {});
    }
  });
}

app.whenReady().then(() => {
  protocol.handle("fsvideo", (request) => serveVideo(request));
  registerIpc();
  buildMenu();
  updater.init(() => mainWindow);
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
app.on("before-quit", () => aiStop());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
