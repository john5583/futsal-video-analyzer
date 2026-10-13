/* Test de bout en bout (Linux, xvfb) : vidéo d'essai avec but + lignes -> repérage automatique du but, clics sur les lignes, silhouettes, analyse.
   Usage : xvfb-run -a node tests/e2e/wizard-goal.js   (FAKE_SEG=1 : faux découpeur, pour les machines sans le modèle de découpe) */
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
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-wiz-"));
execFileSync("node", [path.join(APP, "tests", "helpers", "make-video.js"), path.join(SP, "goalvid.mp4")]);
const out = (...a) => console.log(...a);
/* Attente par interrogation régulière (waitForFunction exige « unsafe-eval », interdit par la politique de sécurité de l'application). */
async function waitFor(win, fn, arg, opts) {
  const t0 = Date.now(), limit = (opts && opts.timeout) || 30000;
  for (;;) {
    if (await win.evaluate(fn, arg)) return;
    if (Date.now() - t0 > limit) throw new Error("Délai dépassé en attendant : " + String(fn).slice(0, 120));
    await new Promise((r) => setTimeout(r, 250));
  }
}
const must = (c, m) => { if (!c) { out("FAIL", m); process.exitCode = 1; } else out("ok  ", m); };
const FAKE = () => { FSAI.segmentImpl = async (req) => ({ masks: req.boxes.map((b) => { const x0 = Math.floor(b[0]), y0 = Math.floor(b[1]), w = Math.ceil(b[2] - b[0]), h = Math.ceil(b[3] - b[1]); const data = new Uint8Array(w * h); let area = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2); if (dx * dx + dy * dy <= 1) { data[y * w + x] = 1; area++; } } return { x0, y0, w, h, area, data }; }) }); };
(async () => {
  const pose = JSON.parse(fs.readFileSync(path.join(SP, "goalvid.mp4.pose.json")));
  const ud = fs.mkdtempSync(SP + "/ud-");
  const app = await electron.launch({ executablePath: APP + "/node_modules/electron/dist/electron", args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow(); const logs = [];
  win.on("pageerror", (e) => logs.push("pageerror: " + e.message)); win.on("console", (m) => m.type() === "error" && logs.push(m.text()));
  await win.waitForLoadState("load"); await win.waitForTimeout(1200);
  await win.setViewportSize({ width: 1500, height: 950 });
  await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p }); }, [path.join(SP, "goalvid.mp4")]);
  const st = () => win.evaluate(() => FSWiz.state.step + "/" + (FSWiz.state.T ? FSWiz.state.T.phase : "-"));
  await win.click(".wiz-start");
  await waitFor(win, () => FSWiz.state.step === "terrain" && FSWiz.state.T && FSWiz.state.T.phase !== "scan", null, { timeout: 90000 });
  out("état:", await st());
  must((await st()).endsWith("clicks") || (await st()).endsWith("color"), "but repéré automatiquement");
  if ((await st()).endsWith("color")) {
    out("couleurs proposées:", await win.evaluate(() => FSWiz.state.T.colors.map((c) => c.key).join(",")));
    await win.click("[data-act=pickColor][data-key=black]");
  }
  must((await st()).endsWith("clicks"), "phase clics");
  const geo = await win.evaluate(() => { const b = document.getElementById("overlay").getBoundingClientRect(); const v = document.getElementById("video"); const s = Math.min(b.width / v.videoWidth, b.height / v.videoHeight); return { l: b.left, t: b.top, s, ox: (b.width - v.videoWidth * s) / 2, oy: (b.height - v.videoHeight * s) / 2 }; });
  const at = (ix, iy) => [geo.l + geo.ox + ix * geo.s, geo.t + geo.oy + iy * geo.s];
  const B = CF.cameraBasis(pose), f = CF.focalPx(640, pose[5]);
  const vid = (x, y) => { const q = CF.project(B, f, 640, 360, x, y, 0); return [q.u * 1.5, q.v * 1.5]; };
  // clic imprécis (3 px) sur la ligne des 6 m : doit être calé sur le trait
  let [ix, iy] = vid(6, 10); let [x, y] = at(ix + 3, iy + 2);
  await win.mouse.click(x, y); await win.waitForTimeout(200);
  must(await win.evaluate(() => FSWiz.state.T.clicks.length) === 1, "1er clic enregistré");
  must(await win.evaluate(() => !!FSWiz.state.T.pose), "pose calculée après un clic");
  [ix, iy] = vid(9, 10); [x, y] = at(ix, iy); await win.mouse.click(x, y); await win.waitForTimeout(200);
  must(await win.evaluate(() => FSWiz.state.T.clicks.length) === 2, "2e clic (9 m)");
  out("erreur de reprojection:", await win.evaluate(() => FSWiz.state.T.err.toFixed(2)), "px");
  await win.click("[data-act=undoClick]"); must(await win.evaluate(() => FSWiz.state.T.clicks.length) === 1, "annuler le dernier clic");
  [ix, iy] = vid(9, 10); [x, y] = at(ix, iy); await win.mouse.click(x, y); await win.waitForTimeout(200);
  await win.click("[data-act=skipTarget]"); await win.click("[data-act=skipTarget]");
  must(!(await win.evaluate(() => FSWiz.state.T.msg)), "pas de message d'erreur : " + (await win.evaluate(() => FSWiz.state.T.msg)));
  await win.click("[data-act=validateTerrain][data-side=def]");
  await waitFor(win, () => FSWiz.state.step === "players", null, { timeout: 10000 });
  must(true, "terrain validé -> joueurs");
  // le calibrage enregistré redonne le bon point du terrain
  const chk = await win.evaluate((pts) => { const c = FSApp.state.project.ai.calibrations[0]; const HG = FutsalHomography; return { n: c.points.length, err: c.err, m: pts.map((p) => HG.apply(c.H, p[0], p[1])) }; }, [vid(6, 10), vid(9, 10)]);
  out("calibrage:", JSON.stringify(chk));
  must(Math.hypot(chk.m[0][0] - 6, chk.m[0][1] - 10) < 0.8 && Math.hypot(chk.m[1][0] - 9, chk.m[1][1] - 10) < 0.8, "H renvoie les points 6 m et 9 m (but défendu : x = 6 et 9)");
  if (process.env.FAKE_SEG) await win.evaluate(FAKE);
  await win.click("[data-act=detect]");
  await waitFor(win, () => FSWiz.state.det && FSWiz.state.det.players.length > 0, null, { timeout: 90000 });
  const n = await win.evaluate(() => FSWiz.state.det.players.length);
  must(n >= 1, "silhouettes : " + n);
  const centre = (i) => win.evaluate((i) => { const d = FSWiz.state.det, p = d.players[i], k = d.frame.k; return [((p.box[0] + p.box[2]) / 2) / k, ((p.box[1] + p.box[3]) / 2) / k]; }, i);
  let [cx, cy] = await centre(0); [x, y] = at(cx, cy); await win.mouse.click(x, y); await win.waitForTimeout(150);
  await win.click("[data-act=validateCat]"); await win.waitForTimeout(200);
  if (n > 1) { [cx, cy] = await centre(1); [x, y] = at(cx, cy); await win.mouse.click(x, y); await win.waitForTimeout(150); await win.click("[data-act=validateCat]"); await win.waitForTimeout(200); }
  else { await win.evaluate(() => { const a = FSAI.ai(); a.kits.B = a.kits.A.slice(); }); }
  await win.evaluate(() => { const a = FSAI.ai(); if (!a.kits.B) a.kits.B = a.kits.A.slice(); });
  for (let i = 0; i < 6 && (await win.evaluate(() => FSWiz.state.step)) === "players"; i++) { const sk = await win.$("[data-act=skipCat]"); if (!sk) break; await sk.click(); await win.waitForTimeout(100); }
  must(await win.evaluate(() => FSWiz.state.step) === "run", "étape analyse atteinte");
  out("plage proposée:", await win.inputValue("[data-set=t0]"), "→", await win.inputValue("[data-set=t1]"));
  await win.fill("[data-set=t1]", "00:04"); await win.dispatchEvent("[data-set=t1]", "change");
  await win.selectOption("[data-set=fps]", "2");
  await win.click("[data-act=run]");
  await waitFor(win, () => FSWiz.state.step === "done" || /arrêtée|aucun/.test(FSWiz.state.msg), null, { timeout: 180000 });
  must(await win.evaluate(() => FSWiz.state.step) === "done", "analyse terminée : " + (await win.evaluate(() => FSWiz.state.msg)).slice(0, 110));
  // erreurs suggérées (simulées) : le bouton d'acceptation les fait entrer dans le diagnostic
  await win.evaluate(() => { const a = FSAI.ai(); a.suggestedEvents = [{ sid: "s1", t: 2, type: "repli_tardif", note: "essai" }, { sid: "s2", t: 3, type: "perte_zone_def", note: "essai" }]; a.suggested = 2; FSAI.renderStats(); FSWiz.render(); });
  must(await win.isVisible("[data-act=acceptAll]"), "bouton « Accepter les erreurs suggérées » affiché");
  await win.click("[data-act=acceptAll]"); await new Promise((r) => setTimeout(r, 2500));
  must(await win.evaluate(() => FSApp.state.project.events.length) === 2, "les erreurs sont entrées dans le projet");
  must(/2 erreur\(s\) ajoutée/.test(await win.textContent("#wiz")), "confirmation affichée");
  out("LOGS:", JSON.stringify(logs)); if (logs.length) process.exitCode = 1;
  await app.close();
})().catch((e) => { console.log("FAIL", e.stack || e.message); process.exit(1); });
