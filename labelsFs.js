"use strict";
/* Dossier des étiquettes (menu « Étiquetage ») : un sous-dossier par vidéo, dans « Documents\Futsal Analyzer\etiquettes ».
   Chaque sous-dossier contient etiquettes.json (progression) et images\<ms>.jpg (l'image exacte vue par le coach).
   Écriture sûre : fichier temporaire puis renommage, et copie de secours de la version précédente. */
const fs = require("fs");
const path = require("path");
const LS = require("./src/ai/labelStore");

const MAX_JSON = 20 * 1024 * 1024, MAX_JPEG = 8 * 1024 * 1024;

function baseDir(documents) { return path.join(documents, "Futsal Analyzer", "etiquettes"); }
/* Nom de dossier sûr dérivé du nom et de la taille de la vidéo (deux vidéos de même nom mais de taille différente restent séparées). */
function videoKey(name, size) {
  const n = String(name || "video").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "").slice(0, 60) || "video";
  return n + "-" + (Math.max(0, Math.floor(Number(size) || 0)));
}
const okKey = (k) => typeof k === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(k) && !k.includes("..");
function dirFor(documents, key) { if (!okKey(key)) throw new Error("clé invalide"); return path.join(baseDir(documents), key); }

function load(documents, key) {
  const f = path.join(dirFor(documents, key), "etiquettes.json");
  for (const p of [f, f + ".bak"]) {
    try {
      if (!fs.existsSync(p) || fs.statSync(p).size > MAX_JSON) continue;
      const d = LS.normalize(JSON.parse(fs.readFileSync(p, "utf8")));
      if (d) return { data: d, fromBackup: p !== f };
    } catch (_e) { /* fichier abîmé : on essaie la copie de secours */ }
  }
  return { data: null };
}
function save(documents, key, data) {
  const d = LS.normalize(data);
  if (!d) return { error: "Données d'étiquettes invalides." };
  const dir = dirFor(documents, key), f = path.join(dir, "etiquettes.json"), tmp = f + ".tmp";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(d));
  if (fs.existsSync(f)) { try { fs.copyFileSync(f, f + ".bak"); } catch (_e) { /* copie de secours facultative */ } }
  fs.renameSync(tmp, f);
  return { ok: true, dir };
}
/* Image d'une étiquette : écrite une seule fois (la première réponse sur cette image). */
function saveImage(documents, key, ms, buf) {
  if (!Number.isInteger(ms) || ms < 0 || ms > 999999999) return { error: "Instant invalide." };
  if (!buf || !buf.length || buf.length > MAX_JPEG) return { error: "Image invalide." };
  const dir = path.join(dirFor(documents, key), "images"), f = path.join(dir, String(ms).padStart(9, "0") + ".jpg");
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(f)) return { ok: true, existed: true };
  fs.writeFileSync(f + ".tmp", buf); fs.renameSync(f + ".tmp", f);
  return { ok: true };
}
module.exports = { baseDir, videoKey, okKey, dirFor, load, save, saveImage };
