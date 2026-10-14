/* Télécharge les modèles de détection (YOLOX-s et YOLOX-m, Apache-2.0) et, pour les tests, une photo d'essai.
   Usage : node scripts/get-assets.js [--model-only]   — vérifie l'empreinte SHA-256 des fichiers. */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const ASSETS = [
  { file: "models/yolox_s.onnx", url: "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_s.onnx", sha256: "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063", model: true },
  // modèle plus précis (ballon), utilisé seulement sur carte graphique
  { file: "models/yolox_m.onnx", url: "https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_m.onnx", sha256: "21ff6cfdeb53b013bac2249599e55f00bff3cfdfdab37ed7a4620818c1d15b3f", model: true },
  { file: "models/mobile_sam_encoder.onnx", url: "https://huggingface.co/Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx", sha256: "580f5fb648ea1062c0aabc26217aed56921985f03f0cbbd852bba81d760cc749", model: true },
  { file: "models/mobile_sam_decoder.onnx", url: "https://huggingface.co/Acly/MobileSAM/resolve/main/sam_mask_decoder_single.onnx", sha256: "93915fc7c993ab9d59ab8c9ccd3bce37f7509c81ab4150a74abd4d2abbd8570d", model: true },
  { file: "tests/fixtures/bus.jpg", url: "https://raw.githubusercontent.com/ultralytics/yolov5/master/data/images/bus.jpg", sha256: "33b198a1d2839bb9ac4c65d61f9e852196793cae9a0781360859425f6022b69c", model: false }
];

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function download(url, dest, redirects) {
  return new Promise((resolve, reject) => {
    if ((redirects || 0) > 6) return reject(new Error("Trop de redirections"));
    https.get(url, { headers: { "User-Agent": "futsal-video-analyzer" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).toString(), dest, (redirects || 0) + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode + " pour " + url)); }
      const tmp = dest + ".part";
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on("finish", () => out.close(() => { fs.renameSync(tmp, dest); resolve(); }));
      out.on("error", reject);
    }).on("error", reject);
  });
}

(async () => {
  const modelOnly = process.argv.includes("--model-only");
  for (const a of ASSETS) {
    if (modelOnly && !a.model) continue;
    const dest = path.join(ROOT, a.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest) && sha256(dest) === a.sha256) { console.log("OK  " + a.file); continue; }
    console.log("Téléchargement de " + a.file + " …");
    // le site des modèles limite parfois le débit (HTTP 429) ou coupe la connexion : on réessaie avec une pause croissante
    let lastErr = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try { await download(a.url, dest); lastErr = null; break; }
      catch (e) { lastErr = e; const wait = [4, 10, 20, 40, 60, 90][attempt] * 1000; console.log("  échec (" + e.message + "), nouvel essai dans " + wait / 1000 + " s"); await new Promise((r) => setTimeout(r, wait)); }
    }
    if (lastErr) throw lastErr;
    const got = sha256(dest);
    if (got !== a.sha256) { fs.rmSync(dest, { force: true }); throw new Error("Empreinte inattendue pour " + a.file + " : " + got); }
    console.log("OK  " + a.file);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
