/* Mise à jour automatique (GitHub Releases) : vérification au démarrage et depuis « Aide ». Version installée : téléchargement puis
   installation au redémarrage. Version portable (sans installeur) : on propose d'ouvrir la page de téléchargement. */
"use strict";
const { app, dialog, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { spawn } = require("child_process");

const RELEASES = "https://github.com/john5583/futsal-video-analyzer/releases/latest";
let updater = null, manual = false, applyNow = false, getWindow = () => null, busy = false;

const win = () => { const w = getWindow(); return w && !w.isDestroyed() ? w : undefined; };
const isInstalled = () => fs.existsSync(path.join(path.dirname(process.execPath), "Uninstall Futsal Analyzer.exe"));

/* ---------- version portable : on télécharge l'archive de la nouvelle version, puis un petit script remplace les fichiers et relance ---------- */
function download(url, dest, onProgress, redirects) {
  return new Promise((resolve, reject) => {
    if ((redirects || 0) > 6) return reject(new Error("Trop de redirections"));
    https.get(url, { headers: { "User-Agent": "futsal-analyzer-updater" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(download(new URL(res.headers.location, url).toString(), dest, onProgress, (redirects || 0) + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const total = Number(res.headers["content-length"]) || 0;
      let got = 0;
      const out = fs.createWriteStream(dest);
      res.on("data", (c) => { got += c.length; if (total && onProgress) onProgress(got / total); });
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve(got)));
      out.on("error", reject);
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function portableUpdate(version) {
  const w = win();
  const appDir = path.dirname(process.execPath), exe = process.execPath;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-maj-"));
  const zip = path.join(tmp, "portable.zip");
  const url = "https://github.com/john5583/futsal-video-analyzer/releases/download/v" + version + "/Futsal-Analyzer-Portable.zip";
  try {
    fs.accessSync(appDir, fs.constants.W_OK);
    if (w) w.setTitle("Futsal Analyzer — téléchargement de la version " + version + "…");
    const size = await download(url, zip, (f) => { const ww = win(); if (ww) ww.setProgressBar(Math.max(0, Math.min(1, f))); });
    const head = Buffer.alloc(2); const fd = fs.openSync(zip, "r"); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd);
    if (size < 100 * 1024 * 1024 || head.toString() !== "PK") throw new Error("archive téléchargée incomplète");
    const script = path.join(tmp, "maj.ps1");
    const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
    fs.writeFileSync(script, [
      "$ErrorActionPreference = 'Stop'",
      "try { Wait-Process -Id " + process.pid + " -Timeout 60 -ErrorAction SilentlyContinue } catch {}",
      "Start-Sleep -Seconds 2",
      "$x = Join-Path " + q(tmp) + " 'extrait'",
      "Expand-Archive -LiteralPath " + q(zip) + " -DestinationPath $x -Force",
      "robocopy $x " + q(appDir) + " /E /IS /IT /R:5 /W:2 /NFL /NDL /NJH /NJS | Out-Null",
      "if ($LASTEXITCODE -ge 8) { exit 1 }",
      "Start-Process -FilePath " + q(exe),
      "Remove-Item -LiteralPath " + q(tmp) + " -Recurse -Force -ErrorAction SilentlyContinue"
    ].join("\r\n"), "utf8");
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    if (w) { w.setProgressBar(-1); w.setTitle("Futsal Analyzer"); }
    setTimeout(() => app.quit(), 300);
  } catch (e) {
    const ww = win(); if (ww) { ww.setProgressBar(-1); ww.setTitle("Futsal Analyzer"); }
    busy = false;
    dialog.showMessageBox(ww, { type: "warning", buttons: ["OK"], title: "Mise à jour", message: "La mise à jour de la version portable a échoué.", detail: "Votre version actuelle reste utilisable. (" + String((e && e.message) || e).slice(0, 200) + ") Si le dossier du programme n'est pas modifiable ou si l'antivirus bloque la copie, installez la version avec installeur." });
  }
}

function setup() {
  if (updater) return updater;
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", async (info) => {
    busy = false;
    if (!isInstalled()) {
      if (manual) {
        busy = true;
        dialog.showMessageBox(win(), { type: "info", buttons: ["OK"], title: "Mise à jour", message: "La version " + info.version + " est disponible : téléchargement en cours.", detail: "L'application redémarrera toute seule quand ce sera prêt (environ une minute). Votre travail est sauvegardé automatiquement." });
        portableUpdate(info.version);
        return;
      }
      const r = await dialog.showMessageBox(win(), { type: "info", buttons: ["Mettre à jour maintenant", "Plus tard"], defaultId: 0, cancelId: 1, title: "Mise à jour disponible", message: "La version " + info.version + " est disponible (vous avez la " + app.getVersion() + ").", detail: "Le programme se mettra à jour tout seul et redémarrera." });
      if (r.response === 0) { busy = true; portableUpdate(info.version); }
      return;
    }
    if (manual) {
      // demandé par l'utilisateur : on télécharge puis on installe et on relance sans autre question
      busy = true; applyNow = true;
      const w = win(); if (w) w.setTitle("Futsal Analyzer — téléchargement de la version " + info.version + "…");
      dialog.showMessageBox(w, { type: "info", buttons: ["OK"], title: "Mise à jour", message: "La version " + info.version + " est disponible : téléchargement en cours.", detail: "L'application redémarrera toute seule quand ce sera prêt. Votre travail est sauvegardé automatiquement." });
      autoUpdater.downloadUpdate().catch((e) => fail(e));
      return;
    }
    const r = await dialog.showMessageBox(win(), { type: "info", buttons: ["Télécharger maintenant", "Plus tard"], defaultId: 0, cancelId: 1, title: "Mise à jour disponible", message: "La version " + info.version + " est disponible (vous avez la " + app.getVersion() + ").", detail: "Le téléchargement se fait en arrière-plan ; votre travail en cours n'est pas interrompu." });
    if (r.response === 0) { busy = true; autoUpdater.downloadUpdate().catch((e) => fail(e)); }
  });
  autoUpdater.on("update-not-available", () => {
    busy = false;
    if (manual) dialog.showMessageBox(win(), { type: "info", buttons: ["OK"], title: "Mise à jour", message: "Vous avez déjà la dernière version (" + app.getVersion() + ")." });
  });
  autoUpdater.on("download-progress", (p) => { const w = win(); if (w) w.setProgressBar(Math.max(0, Math.min(1, p.percent / 100))); });
  autoUpdater.on("update-downloaded", async (info) => {
    busy = false;
    const w = win(); if (w) { w.setProgressBar(-1); w.setTitle("Futsal Analyzer"); }
    if (applyNow) { applyNow = false; setImmediate(() => autoUpdater.quitAndInstall(true, true)); return; }
    const r = await dialog.showMessageBox(w, { type: "info", buttons: ["Redémarrer maintenant", "Plus tard"], defaultId: 0, cancelId: 1, title: "Mise à jour prête", message: "La version " + info.version + " est téléchargée.", detail: "Elle s'installera au redémarrage de l'application (votre travail est sauvegardé automatiquement)." });
    if (r.response === 0) setImmediate(() => autoUpdater.quitAndInstall());
  });
  autoUpdater.on("error", (e) => fail(e));
  updater = autoUpdater;
  return updater;
}

function fail(e) {
  busy = false; applyNow = false;
  const w = win(); if (w) w.setProgressBar(-1);
  if (manual) dialog.showMessageBox(w, { type: "warning", buttons: ["OK"], title: "Mise à jour", message: "La vérification des mises à jour a échoué.", detail: "Vérifiez votre connexion Internet puis réessayez. (" + String((e && e.message) || e).slice(0, 200) + ")" });
}

/* isManual : demandé par l'utilisateur (messages affichés même s'il n'y a rien de neuf ou en cas d'erreur). */
async function check(isManual) {
  manual = !!isManual;
  if (!app.isPackaged) {
    if (manual) dialog.showMessageBox(win(), { type: "info", buttons: ["OK"], title: "Mise à jour", message: "Les mises à jour automatiques fonctionnent dans l'application installée." });
    return;
  }
  if (busy) { if (manual) dialog.showMessageBox(win(), { type: "info", buttons: ["OK"], title: "Mise à jour", message: "Une mise à jour est déjà en cours." }); return; }
  try { busy = true; await setup().checkForUpdates(); } catch (e) { fail(e); }
}

function init(windowGetter) {
  getWindow = windowGetter;
  if (app.isPackaged) setTimeout(() => check(false), 20000);
}

module.exports = { init, check };
