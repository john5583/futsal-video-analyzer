/* Génère une vidéo d'essai : la photo « bus » (des personnes réelles, de la texture) posée sur un sol bleu avec lignes noires et but rayé,
   vue depuis une caméra connue. Usage : node tests/helpers/make-video.js sortie.mp4 [pose JSON] */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const jpeg = require("jpeg-js");
const { render } = require("./scene");

const POSE = [24, 13, 5.5, 188, 24, 70];
const L = 40, W = 20, w = 960, h = 540;

function makeFrame(pose) {
  const scene = render(pose || POSE, w, h, L, W);
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
  const frame = makeFrame(pose);
  fs.writeFileSync(path.join(dir, "f.jpg"), jpeg.encode({ data: Buffer.from(frame.data), width: w, height: h }, 92).data);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-framerate", "10", "-t", "6", "-i", path.join(dir, "f.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
  fs.writeFileSync(out + ".pose.json", JSON.stringify(pose));
  console.log("ok", out);
}

module.exports = { makeFrame, POSE };
