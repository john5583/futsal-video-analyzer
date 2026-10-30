/* Test de bout en bout : le but et les repères montrés par le coach restent accrochés au terrain quand la caméra bouge (vidéo qui tourne de 8°).
   Le but déplacé par le suivi doit retomber sur le vrai but détecté de nouveau à cet instant (écart en pixels de la vidéo).
   Usage : xvfb-run -a node tests/e2e/wizard-suivi.js   (nécessite ffmpeg) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
let electronLib;
try { electronLib = require("playwright-core"); } catch (_e) { electronLib = require("/opt/node-tools/node_modules/playwright"); }
const { _electron: electron } = electronLib;
const APP = path.join(__dirname, "..", "..");
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-suivi-"));
const out = (...a) => console.log(...a);
const must = (c, m) => { if (!c) { out("FAIL", m); process.exitCode = 1; } else out("ok  ", m); };
async function waitFor(win, fn, arg, timeout) {
  const t0 = Date.now();
  for (;;) {
    if (await win.evaluate(fn, arg)) return true;
    if (Date.now() - t0 > (timeout || 30000)) return false;
    await new Promise((r) => setTimeout(r, 250));
  }
}
(async () => {
  const video = path.join(SP, "pan.mp4");
  execFileSync("node", [path.join(APP, "tests", "helpers", "make-video.js"), video, "[24,13,5.5,188,24,70]", "{}", JSON.stringify({ yaw1: 196, secondes: 6, fps: 10 })]);
  const ud = fs.mkdtempSync(SP + "/ud-");
  const app = await electron.launch({ executablePath: APP + "/node_modules/electron/dist/electron", args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow(); const logs = [];
  win.on("pageerror", (e) => logs.push("pageerror: " + e.message)); win.on("console", (m) => m.type() === "error" && logs.push(m.text()));
  await win.waitForLoadState("load"); await win.waitForTimeout(1200);
  await win.setViewportSize({ width: 1500, height: 950 });
  await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p }); }, [video]);
  await win.click(".wiz-start");
  must(await waitFor(win, () => FSWiz.state.step === "terrain" && FSWiz.state.T && (FSWiz.state.T.phase === "clicks" || FSWiz.state.T.phase === "color") && FSWiz.state.T.goal, null, 90000), "but repéré automatiquement");
  const t0 = await win.evaluate(() => FSWiz.state.T.frame.t);
  const res = [];
  for (const dt of [1.5, 3, 4.5]) {
    await win.evaluate((t) => { const v = document.querySelector("video"); v.currentTime = t; }, t0 + dt);
    must(await waitFor(win, (t) => Math.abs(document.querySelector("video").currentTime - t) < 0.05 && FSWiz.follow.tc != null && Math.abs(FSWiz.follow.tc - t) < 0.06, t0 + dt, 20000), "suivi calculé à +" + dt + " s");
    const r = await win.evaluate(() => {
      const T = FSWiz.state.T, F = FSWiz.follow, HG = FutsalHomography, vw = document.querySelector("video").videoWidth, kk = vw / T.work.w;
      const g = FSAI.grabSam(), wk = FutsalCourtFit.prepare(g.img, 640), goal = FutsalGoal.detect(wk, {}).goals[0];
      const k2 = vw / wk.w, pred = HG.apply(F.H, T.goal.left.u * kk, T.goal.left.v1 * kk);
      return { ok: F.ok, vrai: goal ? [goal.left.u * k2, goal.left.v1 * k2] : null, pred, bougeX: pred[0] - T.goal.left.u * kk };
    });
    out("  +" + dt + " s : déplacement du but " + r.bougeX.toFixed(1) + " px, prédit " + r.pred.map((x) => x.toFixed(1)).join(",") + ", vrai " + (r.vrai ? r.vrai.map((x) => x.toFixed(1)).join(",") : "non détecté"));
    must(r.ok, "suivi sûr à +" + dt + " s");
    // la caméra tourne : c'est l'écart horizontal qui mesure le suivi ; le pied du but détecté varie de quelques pixels en hauteur d'une image à l'autre (couleurs de la vidéo), tolérance plus large
    if (r.vrai) must(Math.abs(r.pred[0] - r.vrai[0]) <= 15 && Math.abs(r.pred[1] - r.vrai[1]) <= 30, "le but suivi retombe sur le vrai but (écart horizontal ≤ 15 px, vertical ≤ 30 px) à +" + dt + " s : " + Math.abs(r.pred[0] - r.vrai[0]).toFixed(1) + " / " + Math.abs(r.pred[1] - r.vrai[1]).toFixed(1));
    res.push(Math.abs(r.bougeX));
  }
  must(res.some((x) => x > 20), "la caméra a vraiment bougé (le test n'est pas trivial) : " + res.map((x) => x.toFixed(0)).join(" / ") + " px");
  must(!logs.length, "pas d'erreur : " + logs.join(" | "));
  await app.close();
  fs.rmSync(SP, { recursive: true, force: true });
})().catch((e) => { out("FAIL", e.stack); process.exit(1); });
