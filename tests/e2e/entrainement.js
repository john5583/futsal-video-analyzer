/* Test de bout en bout : onglet « Entraînement » (séance, séances prêtes, tous les exercices) et animation en vue 3D ou de dessus.
   Usage : xvfb-run -a node tests/e2e/entrainement.js   (npm i --no-save playwright-core) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { _electron: electron } = require("playwright-core");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(win, fn, ms, arg) { const end = Date.now() + ms; while (Date.now() < end) { if (await win.evaluate(fn, arg)) return true; await sleep(200); } return false; }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-train-")), ud = path.join(dir, "ud"); fs.mkdirSync(ud);
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + ud] });
  const win = await app.firstWindow();
  const errors = [];
  win.on("pageerror", (e) => errors.push(e.message));
  win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
  win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
  await win.waitForLoadState("load");
  must(await waitFor(win, () => !!window.FSApp && !!window.FSTraining && !!window.FSPlan, 20000), "application prête");
  // empreinte du canvas (somme de pixels échantillonnés) pour voir que l'image change
  const hash = () => win.evaluate(() => { const c = document.getElementById("train-canvas"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let h = 0, nonNoir = 0; for (let i = 0; i < d.length; i += 97) { h = (h * 31 + d[i]) % 1000003; if (d[i] > 40) nonNoir++; } return { h, nonNoir }; });

  // 1. l'onglet existe et contient les questions, la séance, les séances prêtes, les exercices
  must(await win.evaluate(() => !!document.querySelector("#tabs button[data-tab=entrainement]")), "onglet « Entraînement » présent");
  await win.evaluate(() => document.querySelector("#tabs button[data-tab=entrainement]").click());
  must(await waitFor(win, () => document.getElementById("tab-entrainement").classList.contains("active") && document.querySelectorAll("#plan-train-q fieldset").length >= 13, 8000), "l'onglet s'ouvre avec toutes les questions d'entraînement");
  must(await win.evaluate(() => !document.getElementById("tab-plan").querySelector("#plan-train-q")), "les questions d'entraînement ne sont plus dans « Mon plan tactique »");

  // 2. séance proposée : chaque exercice a son bouton d'animation ; la vue 3D est la vue par défaut
  await win.evaluate(() => document.getElementById("plan-train-go").click());
  must(await waitFor(win, () => document.querySelectorAll("#plan-train-res .btn-anim").length >= 3, 8000), "chaque exercice de la séance a un bouton « Voir l'animation »");
  await win.evaluate(() => document.querySelector("#plan-train-res .btn-anim").click());
  must(await waitFor(win, () => !!window.FSTraining.player() && !!window.FSTraining.player().seq && !document.getElementById("train-info").textContent === false, 8000), "l'animation de l'exercice s'ouvre");
  must(await win.evaluate(() => window.FSTraining.view().mode === "3d" && window.FSTraining.player().mode === "3d"), "vue 3D par défaut");
  await sleep(1200);
  const h3 = await hash();
  must(h3.nonNoir > 500, "l'image 3D n'est pas vide (" + h3.nonNoir + " points clairs)");
  must(await win.evaluate(() => window.FSTraining.player().T > 0.3), "l'animation joue (le temps avance)");

  // 3. boutons : vue de dessus / 3D, ballon, caméras, souris
  await win.evaluate(() => window.FSTraining.player().pause());
  await win.evaluate(() => window.FSTraining.player().seek(2.4));
  const a3 = await hash();
  await win.evaluate(() => document.getElementById("tr-mode").click());
  must(await win.evaluate(() => window.FSTraining.player().mode === "2d" && /dessus/i.test(document.getElementById("tr-mode").textContent)), "bouton : vue de dessus");
  const a2 = await hash(); must(a2.h !== a3.h, "la vue de dessus est dessinée autrement que la vue 3D");
  await win.evaluate(() => document.getElementById("tr-mode").click());
  must(await win.evaluate(() => window.FSTraining.player().mode === "3d"), "bouton : retour à la vue 3D");
  await win.evaluate(() => document.querySelector("#tr-cams button[data-cam=haut]").click());
  const ah = await hash(); must(ah.h !== a3.h, "caméra « Haut » : l'image change");
  await win.evaluate(() => document.querySelector("#tr-cams button[data-cam=cote]").click());
  const avant = await win.evaluate(() => window.FSTraining.player().cam.yaw);
  const drag = (button, dx, dy) => win.evaluate(([b, x, y]) => { const c = document.getElementById("train-canvas"), o = { bubbles: true, pointerId: 1, button: b, buttons: b === 2 ? 2 : 1, clientX: 300, clientY: 300 }; c.dispatchEvent(new PointerEvent("pointerdown", o)); c.dispatchEvent(new PointerEvent("pointermove", Object.assign({}, o, { clientX: 300 + x, clientY: 300 + y }))); c.dispatchEvent(new PointerEvent("pointerup", Object.assign({}, o, { clientX: 300 + x, clientY: 300 + y }))); }, [button, dx, dy]);
  await drag(2, 80, 40);
  must(await win.evaluate((y) => { const c = window.FSTraining.player().cam; return c.yaw !== y && c.pitch !== 33 && c.tx === 0; }, avant), "clic droit maintenu : la caméra tourne (cap et hauteur), sans déplacer la vue");
  await drag(2, -2000, 600); await drag(2, 3000, -900);
  must(await win.evaluate(() => { const c = window.FSTraining.player().cam; return c.pitch >= 6 && c.pitch <= 88 && c.yaw >= 0 && c.yaw < 360; }), "la rotation reste dans les limites (jamais sous le sol)");
  await win.evaluate(() => window.FSTraining.player().setPreset("cote"));
  await drag(0, 120, 30);
  must(await win.evaluate(() => { const c = window.FSTraining.player().cam; return c.tx !== 0 && c.yaw === 0; }), "clic gauche maintenu : la vue se déplace, sans tourner");
  await win.evaluate(() => document.getElementById("train-canvas").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  must(await win.evaluate(() => { const c = window.FSTraining.player().cam; return c.tx === 0 && c.ty === 0 && c.yaw === 0; }), "double clic : retour à la vue de départ");
  must(await win.evaluate(() => { const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true }); document.getElementById("train-canvas").dispatchEvent(e); return e.defaultPrevented; }), "pas de menu du clic droit sur l'animation");
  const bAvec = await hash();
  await win.evaluate(() => document.getElementById("tr-ball").click());
  must(await win.evaluate(() => window.FSTraining.view().ball === false && /non/.test(document.getElementById("tr-ball").textContent)), "bouton : ballon masqué");
  const bSans = await hash(); must(bSans.h !== bAvec.h, "sans ballon, l'image change");
  await win.evaluate(() => document.getElementById("tr-ball").click());

  // 4. séances prêtes
  await win.evaluate(() => window.FSTraining.pane("pretes"));
  await win.evaluate(() => document.getElementById("plan-pretes-go").click());
  must(await waitFor(win, () => document.querySelectorAll("#plan-pretes-res details").length >= 12, 8000), "au moins douze séances prêtes dans l'onglet");
  await win.evaluate(() => { const d = document.querySelector("#plan-pretes-res details"); d.open = true; d.querySelector(".btn-anim").click(); });
  must(await waitFor(win, () => !!document.querySelector("#train-info h3"), 5000), "une séance prête ouvre l'animation d'un exercice");

  // 5. tous les exercices : liste par thèmes, recherche, ouverture
  await win.evaluate(() => window.FSTraining.pane("exos"));
  must(await win.evaluate(() => document.querySelectorAll("#train-list button.item").length >= 100 && document.querySelectorAll("#train-list h3").length >= 6), "la liste des exercices (plus de cent, rangés par thème)");
  await win.evaluate(() => { const s = document.getElementById("train-search"); s.value = "corner"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  must(await win.evaluate(() => { const n = document.querySelectorAll("#train-list button.item").length; return n >= 8 && n < 60; }), "la recherche « corner » filtre la liste");
  await win.evaluate(() => document.querySelector("#train-list button.item").click());
  must(await waitFor(win, () => /corner/i.test(document.getElementById("train-info").textContent) && window.FSTraining.player().playing, 5000), "cliquer un exercice lance son animation");

  // 6. tous les exercices se dessinent en 3D (trois instants, trois caméras), sans erreur
  const r = await win.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1280; c.height = 800; const ctx = c.getContext("2d"); let n = 0, bad = [];
    window.FutsalKB.DRILLS.forEach((d) => { const s = window.FutsalScenes.forDrill(d.id); ["cote", "but", "haut"].forEach((cam) => [0.3, s.duration / 2, s.duration - 0.2].forEach((t) => { try { window.FutsalView3D.render(ctx, s, t, window.FutsalView3D.newCamera(cam), 1280, 800, { ball: true }); n++; } catch (e) { bad.push(d.id + " " + cam + " " + e.message); } })); });
    return { n, bad: bad.slice(0, 5) };
  });
  must(r.bad.length === 0 && r.n >= 900, "tous les exercices se dessinent en 3D (" + r.n + " images) " + JSON.stringify(r.bad));

  // 7. l'ancien onglet « Corrections animées » fonctionne toujours
  await win.evaluate(() => window.FSApp.showTab("corrections"));
  must(await win.evaluate(() => document.getElementById("tab-corrections").classList.contains("active") && !!document.getElementById("corr-canvas")), "l'onglet « Corrections animées » s'ouvre toujours");

  must(errors.length === 0, "aucune erreur dans l'interface " + JSON.stringify(errors));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + (e.stack || e.message)); process.exit(1); });
