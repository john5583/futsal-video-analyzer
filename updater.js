/* Mise à jour automatique (GitHub Releases) : vérification au démarrage et depuis « Aide ». Version installée : téléchargement puis
   installation au redémarrage. Version portable (sans installeur) : on propose d'ouvrir la page de téléchargement. */
"use strict";
const { app, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const RELEASES = "https://github.com/john5583/futsal-video-analyzer/releases/latest";
let updater = null, manual = false, applyNow = false, getWindow = () => null, busy = false;

const win = () => { const w = getWindow(); return w && !w.isDestroyed() ? w : undefined; };
const isInstalled = () => fs.existsSync(path.join(path.dirname(process.execPath), "Uninstall Futsal Analyzer.exe"));

function setup() {
  if (updater) return updater;
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", async (info) => {
    busy = false;
    if (!isInstalled()) {
      const r = await dialog.showMessageBox(win(), { type: "info", buttons: ["Ouvrir la page de téléchargement", "Plus tard"], defaultId: 0, cancelId: 1, title: "Mise à jour disponible", message: "La version " + info.version + " est disponible (vous avez la " + app.getVersion() + ").", detail: "Vous utilisez la version portable : téléchargez la nouvelle version depuis la page des versions." });
      if (r.response === 0) shell.openExternal(RELEASES);
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
