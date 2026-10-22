/* Test de bout en bout : écran « Étiquetage » (ballon et joueurs), enregistrement immédiat, image gardée, reprise après redémarrage.
   Usage : xvfb-run -a node tests/e2e/etiquetage.js   (nécessite ffmpeg, npm i --no-save playwright-core) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { _electron: electron } = require("playwright-core");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(win, fn, ms, arg) { const end = Date.now() + ms; while (Date.now() < end) { if (await win.evaluate(fn, arg)) return true; await sleep(200); } return false; }
async function waitDisk(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(200); } return false; }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-lab-e2e-"));
  let video = path.join(dir, "essai.mp4");
  const ud = path.join(dir, "ud"), docs = path.join(dir, "docs");
  fs.mkdirSync(ud); fs.mkdirSync(docs);
  if (process.env.FSAL_E2E_VIDEO) video = process.env.FSAL_E2E_VIDEO;      // essai local sur une vraie vidéo (lecture seule)
  else execFileSync(process.execPath, [path.join(__dirname, "..", "helpers", "make-video.js"), video], { stdio: "ignore" });
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const errors = [];
  const launch = async () => {
    const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud], env: Object.assign({}, process.env, { FSAL_DOCUMENTS: docs }) });
    const win = await app.firstWindow();
    win.on("pageerror", (e) => errors.push(e.message));
    win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
    win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
    await win.waitForLoadState("load");
    return { app, win };
  };
  const st = (win) => win.evaluate(() => { const s = window.FSLabel.state(); return { ms: s.ms, key: s.key, frames: s.data ? s.data.frames : null, persons: s.data ? s.data.persons : null }; });
  const stagePoint = (win, fx, fy) => win.evaluate(([x, y]) => { const r = document.getElementById("lab-zoom").getBoundingClientRect(); return { x: r.left + r.width * x, y: r.top + r.height * y }; }, [fx, fy]);

  let { app, win } = await launch();
  // 1. ouverture de l'écran et de la vidéo
  await win.evaluate(() => window.FSLabel.open());
  must(await win.evaluate(() => !document.getElementById("lab-screen").hidden), "écran d'étiquetage ouvert");
  await win.evaluate(async (p) => { const v = await window.fsal.resolveVideo(p); await window.FSLabel.loadVideo(v); }, video);
  must(await waitFor(win, () => window.FSLabel.state().data && window.FSLabel.state().key, 20000), "vidéo chargée, fichier d'étiquettes ouvert");
  const key = (await st(win)).key;
  must(key === (await win.evaluate(async (p) => { const v = await window.fsal.resolveVideo(p); return window.fsal.labelsKey(v.name, v.size); }, video)), "clé du dossier = nom + taille (" + key + ")");

  // 2. ballon : un clic = ballon désigné, enregistré tout de suite avec l'image
  const p = await stagePoint(win, 0.5, 0.5);
  await win.mouse.click(p.x, p.y);
  must(await waitFor(win, () => window.FSLabel.state().ms === 333, 8000), "après le clic, l'image suivante s'affiche");
  must(await waitFor(win, () => Object.values(window.FSLabel.state().data.frames).some((o) => o.ball && o.ball.state === "vu"), 5000), "clic = ballon désigné");
  const folder = path.join(docs, "Futsal Analyzer", "etiquettes", key);
  must(await waitDisk(() => fs.existsSync(path.join(folder, "etiquettes.json")) && fs.existsSync(path.join(folder, "images", "000000000.jpg")), 10000), "fichier d'étiquettes ET image enregistrés dans le dossier connu");
  const saved = JSON.parse(fs.readFileSync(path.join(folder, "etiquettes.json"), "utf8"));
  const b0 = saved.frames["0"] && saved.frames["0"].ball;
  must(b0 && b0.state === "vu" && Math.abs(b0.u - saved.video.vw / 2) < saved.video.vw * 0.03 && Math.abs(b0.v - saved.video.vh / 2) < saved.video.vh * 0.03, "le point enregistré est celui cliqué (pixels de la vidéo)");
  must(fs.statSync(path.join(folder, "images", "000000000.jpg")).size > 500, "l'image est un vrai JPEG");

  // 3. « N » = aucun ballon visible puis image suivante ; « ? » = incertain
  await win.keyboard.press("n");
  must(await waitFor(win, () => window.FSLabel.state().ms === 667, 8000), "après « aucun ballon », image suivante (0,67 s)");
  await win.keyboard.press("?");
  must(await waitFor(win, () => window.FSLabel.state().ms === 1000, 8000), "après « incertain », image suivante (1 s)");
  const s1 = await st(win);
  must(s1.frames["0"].ball.state === "vu" && s1.frames["333"].ball.state === "aucun" && s1.frames["667"].ball.state === "incertain", "ballon / aucun ballon / incertain enregistrés sur les bonnes images");
  must(await waitDisk(() => fs.existsSync(path.join(folder, "images", "000000333.jpg")) && fs.existsSync(path.join(folder, "images", "000000667.jpg")), 8000), "une image gardée par réponse, sous le bon instant");

  // 4. joueurs : tracer un cadre, choisir le type, image terminée
  await win.evaluate(() => document.querySelector('#lab-screen [data-mode="joueurs"]').click());
  await win.evaluate(() => { const s = document.getElementById("lab-step"); s.value = "3"; s.dispatchEvent(new Event("change")); });      // 1 image par seconde (la vidéo d'essai est courte)
  await win.keyboard.press("2");
  const a = await stagePoint(win, 0.3, 0.3), c = await stagePoint(win, 0.4, 0.6);
  const ms = (await st(win)).ms;
  await win.mouse.move(a.x, a.y); await win.mouse.down(); await win.mouse.move((a.x + c.x) / 2, (a.y + c.y) / 2); await win.mouse.move(c.x, c.y); await win.mouse.up();
  must(await waitFor(win, (m) => { const f = window.FSLabel.state().data.frames[String(m)]; return f && f.boxes && f.boxes.length === 1 && f.boxes[0].team === "B"; }, 5000, ms), "cadre tracé, type « Adversaire » (touche 2)");
  await win.evaluate(() => { document.getElementById("lab-pers-nom").value = "Karim 7"; document.getElementById("lab-pers-add").click(); });
  must(await waitFor(win, () => window.FSLabel.state().data.persons.length === 1, 3000), "fiche de personne ajoutée");
  await win.evaluate(() => { const s = document.getElementById("lab-sel-who"); s.value = s.options[1].value; s.dispatchEvent(new Event("change")); });
  must(await waitFor(win, (m) => { const f = window.FSLabel.state().data.frames[String(m)]; return f.boxes[0].who === "p1"; }, 3000, ms), "identité rattachée au cadre");
  await win.keyboard.press("Enter");
  must(await waitFor(win, (m) => window.FSLabel.state().data.frames[String(m)].playersDone === true, 3000, ms), "« image terminée » enregistrée");
  const ms2 = (await st(win)).ms;
  must(ms2 > ms, "après « image terminée », passage à l'image suivante à faire (pas de 1 s : " + ms2 + " ms)");

  // 5. rien n'a été perdu sur le disque, aucun fichier temporaire
  must(await waitDisk(() => { try { const d = JSON.parse(fs.readFileSync(path.join(folder, "etiquettes.json"), "utf8")); return d.frames[String(ms)] && d.frames[String(ms)].playersDone; } catch (_e) { return false; } }, 8000), "le disque contient l'image terminée");
  const disk = JSON.parse(fs.readFileSync(path.join(folder, "etiquettes.json"), "utf8"));
  must(disk.frames[String(ms)].boxes[0].who === "p1" && disk.persons[0].nom === "Karim 7", "le disque contient cadre, identité et fiche");
  must(await waitDisk(() => { try { return JSON.parse(fs.readFileSync(path.join(folder, "etiquettes.json"), "utf8")).pos === ms2; } catch (_e) { return false; } }, 8000), "la position de la dernière image est écrite sur le disque");
  must(!fs.existsSync(path.join(folder, "etiquettes.json.tmp")), "aucun fichier temporaire oublié");
  await app.close();

  // 6. redémarrage : la progression et la position sont reprises
  ({ app, win } = await launch());
  await win.evaluate(() => window.FSLabel.open());
  must(await waitFor(win, () => !document.getElementById("lab-resume").hidden, 5000), "bouton « Reprendre » proposé");
  await win.evaluate(() => document.getElementById("lab-resume").click());
  must(await waitFor(win, () => window.FSLabel.state().data && window.FSLabel.state().data.persons.length === 1, 20000), "fiches relues après redémarrage");
  const s2 = await st(win);
  must(s2.frames["0"].ball.state === "vu" && s2.ms === ms2, "ballon relu et position reprise (" + s2.ms + " ms)");
  await app.close();

  must(errors.length === 0, "aucune erreur dans la console ni boîte de dialogue" + (errors.length ? " : " + errors.join(" | ") : ""));
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
