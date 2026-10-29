/* Test de bout en bout : étiquetage assisté du ballon sur des images CONSÉCUTIVES (Fichier > Étiquetage > « Suivi assisté »).
   John clique le ballon une fois ; le programme le suit image après image, s'arrête quand le ballon disparaît (il n'invente rien), et la séquence
   est enregistrée (positions, confiance, « clic » / « suivi », temps passé). Source d'images de test : un ballon synthétique qui bouge de ~1 % de la largeur par image.
   Usage : xvfb-run -a node tests/e2e/etiquetage-suivi.js   (nécessite ffmpeg ou FSAL_E2E_VIDEO) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { _electron: electron } = require("playwright-core");
const { build } = require("../helpers/audit-fixture");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(win, fn, ms, arg) { const end = Date.now() + ms; while (Date.now() < end) { if (await win.evaluate(fn, arg).catch(() => false)) return true; await sleep(200); } return false; }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-suivi-"));
  const docs = path.join(dir, "docs"); fs.mkdirSync(docs);
  const f = build(dir, "complet");
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + f.ud], env: Object.assign({}, process.env, { FSAL_DOCUMENTS: docs }) });
  await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [p] }); }, path.resolve(f.video));
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1500, height: 950 });
  const errors = [];
  win.on("pageerror", (e) => errors.push("exception : " + e.message));
  win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
  win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
  await win.waitForLoadState("load");
  must(await waitFor(win, () => window.FSLabel && document.querySelector("video").readyState >= 1, 40000), "programme prêt");

  await win.evaluate(() => window.FSLabel.open());
  await win.click("#lab-pick2");
  must(await waitFor(win, () => !!window.FSLabel.state().data, 20000), "vidéo ouverte dans l'écran d'étiquetage");
  await win.click("#lab-screen [data-mode=suivi]");
  must(await win.evaluate(() => !document.getElementById("lab-suivi-tools").hidden && document.getElementById("lab-ball-tools").hidden), "le mode « Suivi assisté » s'affiche (et cache l'étiquetage image par image)");

  // source d'images de test : ballon qui bouge de 1 % de la largeur par image, présent des images 10 à 50 puis disparu
  const vid = await win.evaluate(() => ({ w: document.getElementById("lab-video").videoWidth, h: document.getElementById("lab-video").videoHeight }));
  await win.evaluate(({ w, h }) => {
    const pas = w * 0.01, x0 = w * 0.2, y0 = h * 0.3, R = Math.max(4, Math.round(w * 0.006));
    const rnd = (n) => { let a = (n * 2654435761) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    window.__vrai = (n) => [x0 + pas * (n - 10), y0 + 0.4 * pas * (n - 10)];
    window.FSLabel.source = { fps: 30, count: 200, start: 10, grab(n) {
      const img = new ImageData(w, h), d = img.data, r = rnd(n + 7);
      for (let i = 0; i < d.length; i += 4) { const v = 90 + Math.floor(r() * 25); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
      if (n >= 10 && n <= 50) {
        const [bx, by] = window.__vrai(n);
        for (let y = Math.floor(by) - R - 3; y <= Math.ceil(by) + R + 3; y++) for (let x = Math.floor(bx) - R - 3; x <= Math.ceil(bx) + R + 3; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const dd = Math.hypot(x - bx, y - by), v = dd <= R ? 235 : dd <= R + 1.5 ? 40 : -1;
          if (v >= 0) { const k = (y * w + x) * 4; d[k] = d[k + 1] = d[k + 2] = v; }
        }
      }
      return img;
    } };
  }, vid);

  // clic sur le ballon de l'image 10
  const [bx, by] = await win.evaluate(() => window.__vrai(10));
  const pos = await win.evaluate(({ bx, by, w, h }) => { const r = document.getElementById("lab-zoom").getBoundingClientRect(); return { x: r.left + (bx / w) * r.width, y: r.top + (by / h) * r.height }; }, { bx, by, w: vid.w, h: vid.h });
  await win.mouse.click(pos.x, pos.y);
  must(await waitFor(win, () => /ne retrouve plus le ballon/.test(document.getElementById("lab-sv-info").textContent), 60000), "le suivi s'arrête de lui-même quand le ballon disparaît (image 51)");
  must(await win.evaluate(() => !window.FSLabel.state().sv.run), "le suivi est arrêté");
  await win.keyboard.press("n");      // « plus de ballon » : la séquence est enregistrée
  must(await waitFor(win, () => (window.FSLabel.state().data.seqs || []).length === 1, 10000), "la séquence est enregistrée");
  const seq = await win.evaluate(() => window.FSLabel.state().data.seqs[0]);
  must(seq.pts.length >= 40 && seq.pts.length <= 42, "environ 41 images consécutives (images 10 à 50) : " + seq.pts.length);
  must(seq.pts[0][4] === "clic" && seq.pts.slice(1).every((p) => p[4] === "suivi"), "un seul clic de John, le reste est du suivi");
  must(seq.pts.every((p, i) => i === 0 || p[0] > seq.pts[i - 1][0]), "les images sont dans l'ordre");
  const ecarts = await win.evaluate((pts) => pts.map((p) => { const n = Math.round(p[0] * 30 / 1000), v = window.__vrai(n); return Math.hypot(p[1] - v[0], p[2] - v[1]); }), seq.pts);
  console.log("écarts (px) :", ecarts.map((x) => x.toFixed(1)).join(" "));
  must(Math.max(...ecarts) < 2, "position suivie à moins de 2 px du vrai ballon sur toutes les images (pire écart " + Math.max(...ecarts).toFixed(2) + " px)");
  must(seq.pts.slice(1).every((p) => p[3] >= 0.6), "chaque image suivie garde sa confiance (≥ 0,6)");
  must(seq.fps === 30 && seq.secondes >= 0, "images par seconde et temps passé gardés (" + seq.secondes + " s)");
  must(await win.evaluate(() => /Séquences enregistrées : 1 \(\d+ images consécutives, dont 1 clics/.test(document.getElementById("lab-sv-info").textContent)), "le résumé annonce les images consécutives, les clics et le temps passé");

  // le fichier d'étiquettes sur le disque contient la séquence
  await sleep(1500);
  const fichiers = []; (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === "etiquettes.json") fichiers.push(p); }); })(docs);
  must(fichiers.length === 1, "un fichier d'étiquettes est écrit sur le disque");
  const disque = JSON.parse(fs.readFileSync(fichiers[0], "utf8"));
  must(Array.isArray(disque.seqs) && disque.seqs.length === 1 && disque.seqs[0].pts.length === seq.pts.length, "le fichier contient la séquence (" + (disque.seqs && disque.seqs.length) + ")");

  // quitter le mode ne perd rien ; aucune erreur
  await win.click("#lab-screen [data-mode=ballon]");
  must(await win.evaluate(() => window.FSLabel.state().data.seqs.length === 1), "changer de mode ne perd rien");
  must(errors.length === 0, "aucune erreur" + (errors.length ? " : " + errors.join(" | ") : ""));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
