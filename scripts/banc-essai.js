/* Banc d'essai : lance l'application réelle sur des vidéos déjà analysées, relance l'analyse avec leurs réglages et écrit des mesures
   (couverture, pistes, déplacements, ballon) pour comparer avant / après un changement. Ne modifie jamais les projets : travail sur des copies.
   Usage (voir docs/banc-essai.md) :
     node scripts/banc-essai.js --dossier "C:\...\LCN" [--rapide | --complet] [--continu] [--tiles 1|2|3] [--duree 180] [--sortie C:\...\futsal-bancs]
                                [--video nom] [--etiquettes nom=dossier] [--repeter]
     node scripts/banc-essai.js --comparer avant.json apres.json */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { _electron: electron } = require("playwright-core");
const P = require("../src/ai/pipeline");
const B = require("../tests/bench/mesures");
const APP = path.join(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const o = { dossiers: [], videos: [], etiquettes: {}, mode: "rapide", duree: 180, sortie: path.join(os.homedir(), "futsal-bancs"), repeter: false, comparer: null, continu: false, tiles: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--dossier") o.dossiers.push(next());
    else if (a === "--video") o.videos.push(next());
    else if (a === "--rapide") o.mode = "rapide";
    else if (a === "--complet") o.mode = "complet";
    else if (a === "--continu") o.continu = true;
    else if (a === "--tiles") o.tiles = Number(next());
    else if (a === "--duree") o.duree = Number(next());
    else if (a === "--sortie") o.sortie = next();
    else if (a === "--repeter") o.repeter = true;
    else if (a === "--etiquettes") { const [n, d] = String(next()).split("="); if (n && d) o.etiquettes[n] = d; }
    else if (a === "--comparer") o.comparer = [next(), next()];
    else throw new Error("Option inconnue : " + a);
  }
  if (!(o.duree > 0)) throw new Error("--duree doit être un nombre de secondes positif");
  return o;
}

/* Vidéos d'un dossier qui ont un projet du même nom (même nom de base, extension .fsal). */
function findVideos(dossiers, only) {
  const out = [];
  dossiers.forEach((d) => {
    fs.readdirSync(d).filter((f) => /\.mp4$/i.test(f)).forEach((f) => {
      const base = f.replace(/\.mp4$/i, ""), fsal = path.join(d, base + ".fsal");
      if (!fs.existsSync(fsal)) return;
      if (only.length && !only.includes(base) && !only.includes(f)) return;
      out.push({ nom: base, video: path.join(d, f), projet: fsal });
    });
  });
  return out;
}

function readLabels(dir) {
  const lab = path.join(dir, "labels");
  if (!fs.existsSync(lab)) throw new Error("Dossier d'étiquettes sans sous-dossier « labels » : " + dir);
  return B.parseYoloLabels(fs.readdirSync(lab).filter((f) => /\.txt$/i.test(f)).map((f) => ({ name: f, text: fs.readFileSync(path.join(lab, f), "utf8") })));
}

async function measureOne(item, o, ud) {
  const proj = JSON.parse(fs.readFileSync(item.projet, "utf8"));
  proj.videoPath = item.video;                      // la vidéo est celle du dossier, quel que soit l'ancien chemin enregistré
  if (!proj.ai || !Array.isArray(proj.ai.calibrations) || !proj.ai.calibrations.length) throw new Error("Projet sans calibrage : rien à analyser");
  const first = Math.min(...proj.ai.calibrations.map((c) => c.t));
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "autosave.json"), JSON.stringify(proj));
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--user-data-dir=" + ud] });
  const errors = [];
  try {
    const win = await app.firstWindow();
    win.on("pageerror", (e) => errors.push(e.message));
    win.on("dialog", (d) => { errors.push("dialogue : " + d.message()); d.dismiss().catch(() => {}); });
    await win.waitForLoadState("load");
    const end = Date.now() + 120000;
    let ready = false;
    while (Date.now() < end && !ready) { ready = await win.evaluate(() => !!(window.FSAI && window.FSAI.ai() && window.FSApp.getVideoUrl() && document.querySelector("video") && document.querySelector("video").readyState >= 1)); if (!ready) await sleep(500); }
    if (!ready) throw new Error("Projet non chargé dans l'application");
    const duration = await win.evaluate(() => document.querySelector("video").duration);
    const t0 = Math.round(first * 10) / 10, t1 = o.mode === "complet" ? Math.floor(duration) : Math.min(Math.floor(duration), t0 + o.duree);
    if (o.tiles) await win.evaluate((n) => window.FSAI.setPrecision(3, n), o.tiles);       // précision imposée (comparaison à précision égale)
    const started = Date.now();
    const timer = setInterval(() => { win.evaluate(() => document.getElementById("ai-run-msg").textContent).then((m) => console.log("   " + String(m).slice(0, 110))).catch(() => {}); }, 30000);
    let ok;
    try { ok = await win.evaluate(([a, b, c]) => { window.FSAI.setRange(a, b); return window.FSAI.runAnalysis({ noConfirm: true, continuous: c }); }, [t0, t1, o.continu]); }
    finally { clearInterval(timer); }
    const seconds = (Date.now() - started) / 1000;
    if (!ok) throw new Error("L'analyse n'a pas abouti : " + (await win.evaluate(() => document.getElementById("ai-run-msg").textContent)));
    const ai = await win.evaluate(() => JSON.parse(JSON.stringify(window.FSAI.ai())));
    // analyse continue : les mesures portent sur la trace continue (~10 images/s) ; sinon sur les images historiques
    const useTrace = o.continu && Array.isArray(ai.trace) && ai.trace.length > 0;
    return { ai: useTrace ? Object.assign({}, ai, { settings: Object.assign({}, ai.settings, { fps: 10 }) }) : ai, rawAi: ai, frames: P.expandFrames(useTrace ? ai.trace : ai.frames), range: [t0, t1], seconds, errors };
  } finally { await app.close().catch(() => {}); }
}

const stable = (s) => JSON.stringify(s);

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.comparer) {
    const [a, b] = o.comparer.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
    console.log(B.compareTable(a.mesures, b.mesures));
    return;
  }
  if (!o.dossiers.length) throw new Error("Indique au moins un dossier avec --dossier (voir docs/banc-essai.md)");
  const items = findVideos(o.dossiers, o.videos);
  if (!items.length) throw new Error("Aucune vidéo avec un projet du même nom trouvée");
  let version = "inconnue";
  try { version = require("child_process").execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: APP }).toString().trim(); } catch (_e) { /* pas de git : version inconnue */ }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const out = path.join(o.sortie, stamp);
  fs.mkdirSync(out, { recursive: true });
  const resume = [];
  console.log("Banc d'essai (commit " + version + ") — " + items.length + " vidéo(s), mode " + o.mode + (o.mode === "rapide" ? " (" + o.duree + " s)" : "") + " — résultats dans " + out);
  for (const item of items) {
    console.log("\nMesure de " + item.nom + "…");
    try {
      const labels = o.etiquettes[item.nom] ? readLabels(o.etiquettes[item.nom]) : null;
      const ud = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-banc-"));
      const run1 = await measureOne(item, o, ud);
      const s1 = B.summarize(run1.ai, run1.frames, { labels });
      let repetable = null;
      if (o.repeter) {
        const run2 = await measureOne(item, o, fs.mkdtempSync(path.join(os.tmpdir(), "fsal-banc-")));
        repetable = stable(B.summarize(run2.ai, run2.frames, { labels })) === stable(s1);
      }
      const rec = { video: item.nom, version, date: new Date().toISOString(), mode: o.mode, plage: run1.range, secondesDeCalcul: Math.round(run1.seconds), repetable, erreursInterface: run1.errors, qualite: run1.ai.quality ? { niveau: run1.ai.quality.level, constats: run1.ai.quality.items.map((i) => i.title) } : null, recalage: run1.ai.recalage || [], continu: run1.rawAi.continuous || null, mesures: s1, mesuresHistoriques: o.continu ? B.summarize(run1.rawAi, P.expandFrames(run1.rawAi.frames), { labels }) : null };
      fs.writeFileSync(path.join(out, item.nom + ".json"), JSON.stringify(rec, null, 1));
      const lecture = rec.continu ? "\n" + "Lecture (mode continu) : " + rec.continu.images + " images lues, " + rec.continu.analysed + " analysées, " + rec.continu.duplicated + " dupliquée(s), " + rec.continu.skipped + " sautée(s), " + rec.continu.bridged + " enjambée(s), cadence réelle " + rec.continu.videoFps + " images/s" : "";
      const hist = rec.mesuresHistoriques ? "\n-- Images historiques de la même analyse (~3,3 images/s) --\n" + B.table(item.nom, rec.mesuresHistoriques).split("\n").slice(1).join("\n") : "";
      const t = B.table(item.nom, s1) + lecture + hist + "\nCalcul : " + rec.secondesDeCalcul + " s pour " + Math.round(run1.range[1] - run1.range[0]) + " s de vidéo" + (repetable == null ? "" : " ; répétable : " + (repetable ? "oui" : "NON (deux passages donnent des mesures différentes)")) + (run1.errors.length ? "\nErreurs d'interface : " + run1.errors.join(" | ") : "");
      console.log(t); resume.push(t);
    } catch (e) {
      const t = "== " + item.nom + "\nÉCHEC : " + e.message; console.log(t); resume.push(t);
    }
  }
  fs.writeFileSync(path.join(out, "resume.txt"), "Banc d'essai (commit " + version + ") — " + new Date().toLocaleString("fr-BE") + "\n\n" + resume.join("\n\n") + "\n");
  console.log("\nTerminé. Résumé : " + path.join(out, "resume.txt"));
}

main().catch((e) => { console.error("ÉCHEC : " + e.message); process.exit(1); });
