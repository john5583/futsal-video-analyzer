/* Test de bout en bout : calibrage guidé. Avec le centre du rond central et les bouts de la ligne médiane, la profondeur du terrain est juste (le programme n'a plus à deviner).
   Scène d'essai avec rond central tracé ; clics imprécis (3 px) ; le calibrage enregistré doit renvoyer le centre du rond à (20, 10) m et les bouts de la médiane à leur place.
   Usage : xvfb-run -a node tests/e2e/wizard-rond.js   (nécessite ffmpeg) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
let electronLib;
try { electronLib = require("playwright-core"); } catch (_e) { electronLib = require("/opt/node-tools/node_modules/playwright"); }
const { _electron: electron } = electronLib;
const APP = path.join(__dirname, "..", "..");
const CF = require(APP + "/src/ai/court-fit");
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-rond-"));
const POSE = [22, -6, 8, 150, 28, 100];
execFileSync("node", [path.join(APP, "tests", "helpers", "make-video.js"), path.join(SP, "rond.mp4"), JSON.stringify(POSE), JSON.stringify({ circle: true })]);
const out = (...a) => console.log(...a);
async function waitFor(win, fn, arg, opts) {
  const t0 = Date.now(), limit = (opts && opts.timeout) || 30000;
  for (;;) {
    if (await win.evaluate(fn, arg)) return;
    if (Date.now() - t0 > limit) throw new Error("Délai dépassé en attendant : " + String(fn).slice(0, 120));
    await new Promise((r) => setTimeout(r, 250));
  }
}
const must = (c, m) => { if (!c) { out("FAIL", m); process.exitCode = 1; } else out("ok  ", m); };
(async () => {
  const pose = JSON.parse(fs.readFileSync(path.join(SP, "rond.mp4.pose.json")));
  const ud = fs.mkdtempSync(SP + "/ud-");
  const app = await electron.launch({ executablePath: APP + "/node_modules/electron/dist/electron", args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow(); const logs = [];
  win.on("pageerror", (e) => logs.push("pageerror: " + e.message)); win.on("console", (m) => m.type() === "error" && logs.push(m.text()));
  await win.waitForLoadState("load"); await win.waitForTimeout(1200);
  await win.setViewportSize({ width: 1500, height: 950 });
  await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p }); }, [path.join(SP, "rond.mp4")]);
  await win.click(".wiz-start");
  await waitFor(win, () => FSWiz.state.step === "terrain" && FSWiz.state.T && FSWiz.state.T.phase !== "scan", null, { timeout: 90000 });
  const geo = await win.evaluate(() => { const b = document.getElementById("overlay").getBoundingClientRect(); const v = document.getElementById("video"); const s = Math.min(b.width / v.videoWidth, b.height / v.videoHeight); return { l: b.left, t: b.top, s, ox: (b.width - v.videoWidth * s) / 2, oy: (b.height - v.videoHeight * s) / 2 }; });
  const at = (ix, iy) => [geo.l + geo.ox + ix * geo.s, geo.t + geo.oy + iy * geo.s];
  const B = CF.cameraBasis(pose), f = CF.focalPx(640, pose[5]);
  const vid = (x, y, z) => { const q = CF.project(B, f, 640, 360, x, y, z || 0); return q ? [q.u * 1.5, q.v * 1.5] : null; };
  // le but de la scène est petit et vu de biais (comme dans une vraie salle) : on le montre nous-mêmes (pieds des deux poteaux, puis haut d'un poteau)
  const ph = await win.evaluate(() => FSWiz.state.T.phase);
  if (ph !== "clicks" && ph !== "color") {
    await win.click("[data-act=showGoal]");
    for (const g of [vid(0, 8.5, 0), vid(0, 11.5, 0), vid(0, 8.5, 2)]) { const a = at(g[0], g[1]); await win.mouse.click(a[0], a[1]); await win.waitForTimeout(250); }
  }
  if ((await win.evaluate(() => FSWiz.state.T.phase)) === "color") await win.click("[data-act=pickColor][data-key=black]");
  must((await win.evaluate(() => FSWiz.state.T.phase)) === "clicks", "but repéré, phase clics");
  const clic = async (x, y, dx, dy) => { const v = vid(x, y); const [px, py] = at(v[0] + (dx || 0), v[1] + (dy || 0)); await win.mouse.click(px, py); await win.waitForTimeout(250); };
  await clic(6, 10, 3, 2);
  const err6 = await win.evaluate(() => FSWiz.state.T.pose);
  must(!!err6, "6 m cliqué, pose calculée");
  const ask = await win.evaluate(() => document.getElementById("wiz").textContent);
  must(/CENTRE du rond central/.test(ask), "l'assistant demande ensuite le centre du rond central");
  await clic(20, 10, 3, -2);
  must(await win.evaluate(() => FSWiz.state.T.clicks.map((c) => c.key).join(",")) === "six,center", "le centre du rond est enregistré");
  const mA = vid(20, 0), mB = vid(20, 20);
  out("  bouts de la médiane dans l'image :", JSON.stringify(mA), JSON.stringify(mB));
  if (mA && mA[0] > 0 && mA[1] > 0 && mA[0] < 960 && mA[1] < 540) await clic(20, 0, 2, 2); else await win.click("[data-act=skipTarget]");
  if (mB && mB[0] > 0 && mB[1] > 0 && mB[0] < 960 && mB[1] < 540) await clic(20, 20, 2, -2); else await win.click("[data-act=skipTarget]");
  must(!(await win.evaluate(() => FSWiz.state.T.msg)), "pas de message d'erreur : " + (await win.evaluate(() => FSWiz.state.T.msg)));
  out("  erreur de reprojection :", await win.evaluate(() => FSWiz.state.T.err.toFixed(2)), "px");
  await win.click("[data-act=validateTerrain][data-side=def]");
  await waitFor(win, () => FSWiz.state.step === "players", null, { timeout: 15000 });
  const chk = await win.evaluate((pts) => { const c = FSApp.state.project.ai.calibrations[0]; const HG = FutsalHomography; return { m: pts.map((p) => HG.apply(c.H, p[0], p[1])), ch: c.choisis }; }, [vid(20, 10), vid(6, 10), vid(9, 10)].filter(Boolean));
  out("  calibrage :", JSON.stringify(chk));
  must(Math.hypot(chk.m[0][0] - 20, chk.m[0][1] - 10) < 0.6, "le calibrage renvoie le centre du rond à (20 ; 10) m, écart " + Math.hypot(chk.m[0][0] - 20, chk.m[0][1] - 10).toFixed(2) + " m");
  must(chk.ch.indexOf("center") >= 0, "le rond est noté parmi les éléments choisis (priorité au rond pendant le suivi)");
  must(!logs.length, "aucune erreur : " + logs.join(" | "));
  await app.close();
  fs.rmSync(SP, { recursive: true, force: true });
})().catch((e) => { out("FAIL", e.stack); process.exit(1); });
