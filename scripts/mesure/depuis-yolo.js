/* Convertit un ancien dossier d'étiquettes du ballon (images/*.jpg + labels/*.txt au format YOLO, exporté par l'application) en fichier d'étiquettes
   du menu Étiquetage, pour pouvoir le noter avec scripts/mesure/score.js. Étiquette vide = « aucun ballon visible ». Ne modifie rien.
   Usage : node scripts/mesure/depuis-yolo.js --dossier <etiquettes-ballon-...> --nom <video.mp4> --sortie etiquettes.json [--duree s] */
"use strict";
const fs = require("fs"), path = require("path");
const arg = (n) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : null; };

/* Taille d'une image JPEG (lecture de l'en-tête SOF). */
function tailleJpeg(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}
function convertir(dossier, nom, duree) {
  const imgs = fs.readdirSync(path.join(dossier, "images")).filter((f) => /^balle_\d+\.jpg$/i.test(f)).sort();
  if (!imgs.length) throw new Error("aucune image dans " + dossier);
  const t = tailleJpeg(fs.readFileSync(path.join(dossier, "images", imgs[0])));
  if (!t) throw new Error("taille d'image illisible");
  const frames = {};
  let derniere = 0;
  imgs.forEach((f) => {
    const ms = Number(f.match(/\d+/)[0]), lab = path.join(dossier, "labels", f.replace(/\.jpg$/i, ".txt"));
    const txt = fs.existsSync(lab) ? fs.readFileSync(lab, "utf8").trim() : "";
    const p = txt.split(/\s+/).map(Number);
    frames[String(ms)] = { ball: txt && p.length >= 3 && isFinite(p[1]) && isFinite(p[2]) ? { state: "vu", u: Math.round(p[1] * t.w), v: Math.round(p[2] * t.h) } : { state: "aucun" } };
    derniere = Math.max(derniere, ms);
  });
  return { version: 1, video: { name: nom, size: 0, duration: duree || Math.ceil(derniere / 1000) + 1, vw: t.w, vh: t.h }, persons: [], subs: [], frames, seqs: [] };
}
if (require.main === module) {
  const d = arg("dossier"), n = arg("nom"), s = arg("sortie");
  if (!d || !n || !s) { console.error("Indique --dossier, --nom et --sortie."); process.exit(1); }
  const e = convertir(d, n, arg("duree") ? Number(arg("duree")) : null);
  fs.writeFileSync(s, JSON.stringify(e));
  const vus = Object.values(e.frames).filter((f) => f.ball.state === "vu").length;
  console.log(n + " : " + Object.keys(e.frames).length + " images, " + vus + " avec ballon, " + (Object.keys(e.frames).length - vus) + " sans, " + e.video.vw + "x" + e.video.vh);
}
module.exports = { convertir, tailleJpeg };
