/* Bout en bout : dans l'assistant, quand le détecteur à bandes ne voit aucun but, le détecteur ENTRAÎNÉ en propose un, entouré en orange,
   et il n'est retenu qu'après « Oui, c'est le but ». Le dessin du but à la souris (deux clics) donne aussi un but.
   Usage : node tests/e2e/wizard-buts-ia.js <video.mp4> [debut_s=150]   (ffmpeg et models/but.onnx requis ; la vidéo doit montrer un but éloigné) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { _electron: electron } = require("playwright-core");
const APP = path.join(__dirname, "..", "..");
const SP = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-butsia-"));
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
  const src = process.argv[2], t0 = process.argv[3] || "150";
  if (!src) { out("Usage : node tests/e2e/wizard-buts-ia.js <video.mp4> [debut_s]"); process.exit(2); }
  const video = path.join(SP, "extrait.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", t0, "-t", "14", "-i", src, "-vf", "scale=1280:720", "-an", "-c:v", "libx264", "-crf", "23", video]);
  const ud = fs.mkdtempSync(SP + "/ud-");
  const app = await electron.launch({ executablePath: APP + "/node_modules/electron/dist/electron", args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow(); const logs = [];
  win.on("pageerror", (e) => logs.push("pageerror: " + e.message)); win.on("console", (m) => m.type() === "error" && logs.push(m.text()));
  await win.waitForLoadState("load"); await win.waitForTimeout(1200);
  await win.setViewportSize({ width: 1500, height: 950 });
  await app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p }); }, [video]);
  must(await win.evaluate(() => typeof window.FutsalButIA === "object" && typeof window.fsal.aiGoals === "function"), "le module du détecteur de buts est chargé dans la fenêtre");
  await win.click(".wiz-start");
  must(await waitFor(win, () => FSWiz.state.step === "terrain" && FSWiz.state.T && (FSWiz.state.T.phase === "confirmGoal" || FSWiz.state.T.phase === "clicks" || FSWiz.state.T.phase === "color" || FSWiz.state.T.phase === "nogoal"), null, 120000), "l'assistant a cherché un but");
  const ph = await win.evaluate(() => ({ phase: FSWiz.state.T.phase, ia: !!(FSWiz.state.T.cand && FSWiz.state.T.cand.ia), cand: !!FSWiz.state.T.cand }));
  out("  phase :", JSON.stringify(ph));
  must(ph.phase === "confirmGoal" && ph.ia, "le détecteur entraîné propose un but et demande confirmation (rien n'est retenu seul)");
  must(await win.evaluate(() => !FSWiz.state.T.goal), "aucun but n'est encore retenu avant la réponse");
  await win.click("button[data-act=confirmGoal]");
  must(await waitFor(win, () => FSWiz.state.T.goal && (FSWiz.state.T.phase === "clicks" || FSWiz.state.T.phase === "color"), null, 20000), "après « Oui, c'est le but » le but est retenu et l'assistant passe aux repères");
  must(await win.evaluate(() => (FSAI.memory().butsConfirmes || []).length === 1), "le but confirmé est gardé dans la mémoire du projet");
  // le coach préfère dessiner le but : deux clics (coins haut-gauche et bas-droit) sur l'image arrêtée, puis « Confirmer ce but »
  await app.close();
  const app2 = await electron.launch({ executablePath: APP + "/node_modules/electron/dist/electron", args: [APP, "--no-sandbox", "--user-data-dir=" + fs.mkdtempSync(SP + "/ud2-")] });
  const w2 = await app2.firstWindow(); w2.on("pageerror", (e) => logs.push("pageerror: " + e.message)); w2.on("console", (m) => m.type() === "error" && logs.push(m.text()));
  await w2.waitForLoadState("load"); await w2.waitForTimeout(1200); await w2.setViewportSize({ width: 1500, height: 950 });
  await app2.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p }); }, [video]);
  await w2.click(".wiz-start");
  must(await waitFor(w2, () => FSWiz.state.step === "terrain" && FSWiz.state.T && FSWiz.state.T.phase === "confirmGoal", null, 120000), "(2e essai) proposition du détecteur");
  await w2.click("button[data-act=drawGoal]");
  must(await waitFor(w2, () => FSWiz.state.T.phase === "dgoal", null, 10000), "« Non, je dessine le but à la souris » ouvre le mode dessin");
  const box = await w2.evaluate(() => { const r = document.getElementById("overlay").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await w2.mouse.click(box.x + box.w * 0.30, box.y + box.h * 0.20); await w2.waitForTimeout(300);
  await w2.mouse.click(box.x + box.w * 0.45, box.y + box.h * 0.45); await w2.waitForTimeout(300);
  must(await w2.evaluate(() => FSWiz.state.T.dg && FSWiz.state.T.dg.length === 2), "deux clics donnent un cadre");
  await w2.click("button[data-act=confirmDraw]");
  must(await waitFor(w2, () => FSWiz.state.T.goal && FSWiz.state.T.goal.palette === "dessiné" && (FSWiz.state.T.phase === "clicks" || FSWiz.state.T.phase === "color"), null, 20000), "« Confirmer ce but » retient le cadre dessiné et passe aux repères");
  await app2.close();
  must(!logs.length, "pas d'erreur : " + logs.join(" | "));
  fs.rmSync(SP, { recursive: true, force: true });
})().catch((e) => { out("FAIL", e.stack); process.exit(1); });
