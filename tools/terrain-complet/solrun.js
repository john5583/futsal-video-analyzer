/* Bout en bout du suivi global du sol : une vraie vidéo → images 480×270 (ffmpeg) → fichier temporaire → fil de calcul → positions + verdicts.
   Usage : node tests/e2e/sol-global.js <video.mp4> [debut_s=60] [duree_s=60]   (besoin de ffmpeg dans le PATH) */
"use strict";
const cp = require("child_process");
const path = require("path");
const SOL = require("C:/Users/xboxl/Desktop/futsal-trace/solGlobalFs");

const video = process.argv[2], t0 = +(process.argv[3] || 60), dur = +(process.argv[4] || 60);
if (!video) { console.log("Usage : node tests/e2e/sol-global.js <video.mp4> [debut_s] [duree_s]"); process.exit(2); }
const FS = SOL.FS, n = Math.floor(dur * 4);
const ff = cp.spawnSync("ffmpeg", ["-v", "error", "-ss", String(t0), "-t", String(dur), "-i", video, "-vf", "fps=4,scale=480:270", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: n * FS + 1e7 });
if (ff.status !== 0) { console.log("ffmpeg a échoué", String(ff.stderr)); process.exit(1); }
const nb = Math.floor(ff.stdout.length / FS);
if (nb < 20) { console.log("trop peu d'images :", nb); process.exit(1); }
const id = SOL.begin(nb);
for (let k = 0; k < nb; k++) SOL.frame(id, k, ff.stdout.subarray(k * FS, (k + 1) * FS));
const t = Date.now();
SOL.run(id, "C:/Users/xboxl/Desktop/futsal-trace/src/ai/sol-global-worker.js", (p) => { if (Math.random() < 0.02) console.log(p.etape, Math.round(100 * p.f) + " %"); }).then((r) => {
  SOL.close(id);
  const ok = r.verdict.filter((v) => v === "ok").length;
  console.log("images", nb, "verdict ok", ok, "(" + Math.round((1000 * ok) / nb) / 10 + " %)", "durée", Math.round((Date.now() - t) / 1000) + " s", JSON.stringify(r.stats));
  const bon = r.G.every((g) => g.length === 9 && g.every(Number.isFinite));
  if (!bon) { console.log("ÉCHEC : positions non finies"); process.exit(1); }
  require("fs").writeFileSync(process.argv[5],JSON.stringify({G:r.G,verdict:r.verdict,stats:r.stats})); console.log("OK");
}).catch((e) => { SOL.close(id); console.log("ÉCHEC", e.message); process.exit(1); });
