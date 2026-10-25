/* Génère une vidéo d'essai : la photo « bus » (des personnes réelles, de la texture) posée sur un sol bleu avec lignes noires et but rayé,
   vue depuis une caméra connue. Usage : node tests/helpers/make-video.js sortie.mp4 [pose JSON] [options de la scène JSON, ex. {"lineHalf":0.04} : lignes de 8 cm]
   [panoramique JSON, ex. {"yaw1":196,"secondes":6,"fps":10} : la caméra tourne de la pose au cap yaw1 (sans la photo « bus » : décor fixe) ; {"saut":[3,3.5,25]} : image grise entre 3 et 3,5 s puis +25° de cap] */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const jpeg = require("jpeg-js");
const { render } = require("./scene");

const POSE = [24, 13, 5.5, 188, 24, 70];
const L = 40, W = 20, w = 960, h = 540;

/* Pose de la caméra à l'instant t d'un panoramique pan = { yaw1, secondes, saut: [de, a, degrés] } (cap qui varie linéairement ; saut brusque après la coupure). */
function poseAt(pose, pan, t) {
  const p = pose.slice(), k = Math.min(1, t / pan.secondes);
  p[3] = pose[3] + (pan.yaw1 - pose[3]) * k;
  if (pan.saut && t >= pan.saut[1]) p[3] += pan.saut[2];
  return p;
}

function makeFrame(pose, opts) {
  const scene = render(pose || POSE, w, h, L, W, opts);
  if (opts && opts.bus === false) return scene;
  const bus = jpeg.decode(fs.readFileSync(path.join(__dirname, "..", "fixtures", "bus.jpg")), { useTArray: true });
  // photo ramenée à la hauteur de l'image, posée au centre (sans toucher aux lignes déjà dessinées hors de la photo)
  const bh = h, bw = Math.round((bus.width * bh) / bus.height), x0 = w - bw;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const sx = Math.min(bus.width - 1, Math.floor((x * bus.height) / bh)), sy = Math.min(bus.height - 1, Math.floor((y * bus.height) / bh));
    const i = (sy * bus.width + sx) * 4, j = (y * w + x0 + x) * 4;
    if (x0 + x < 0 || x0 + x >= w) continue;
    scene.data[j] = bus.data[i]; scene.data[j + 1] = bus.data[i + 1]; scene.data[j + 2] = bus.data[i + 2];
  }
  return scene;
}

if (require.main === module) {
  const out = process.argv[2] || "essai-but.mp4";
  const pose = process.argv[3] ? JSON.parse(process.argv[3]) : POSE;
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "fsal-vid-"));
  const sceneOpts = process.argv[4] ? JSON.parse(process.argv[4]) : undefined;
  const pan = process.argv[5] ? JSON.parse(process.argv[5]) : null;
  const enc = (frame, name) => fs.writeFileSync(path.join(dir, name), jpeg.encode({ data: Buffer.from(frame.data), width: w, height: h }, 92).data);
  if (pan) {
    const fps = pan.fps || 10, n = Math.round(pan.secondes * fps), gris = { data: new Uint8ClampedArray(w * h * 4).fill(120), width: w, height: h };
    for (let i = 0; i < n; i++) {
      const t = i / fps, coupure = pan.saut && t >= pan.saut[0] && t < pan.saut[1];
      enc(coupure ? gris : makeFrame(poseAt(pose, pan, t), Object.assign({}, sceneOpts, { bus: false })), "f" + String(i).padStart(4, "0") + ".jpg");
    }
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", path.join(dir, "f%04d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
  } else {
    enc(makeFrame(pose, sceneOpts), "f.jpg");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-framerate", "10", "-t", "6", "-i", path.join(dir, "f.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
  }
  fs.writeFileSync(out + ".pose.json", JSON.stringify(pose));
  console.log("ok", out);
}

module.exports = { makeFrame, poseAt, POSE };
