/* Mesure de la lecture image par image dans l'application réelle : quelle façon de lire la vidéo ne perd aucune image, à quelle vitesse,
   et combien coûtent la détection (carte graphique) et le suivi de la caméra par image. Ne modifie rien (travail sur une copie du projet).
   Usage : node scripts/mesure-lecture.js --projet "C:...ideo.fsal" --video "C:...ideo.mp4" [--debut 20] [--secondes 10]
   Nécessite playwright-core (npm install --no-save playwright-core). */
const path = require("path"), fs = require("fs"), os = require("os");
const APP = path.join(__dirname, "..");
const { _electron: electron } = require("playwright-core");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };
const projetFsal = arg("projet"), videoMp4 = arg("video"), T0 = Number(arg("debut", 20)), SEC = Number(arg("secondes", 10));
if (!projetFsal || !videoMp4) { console.error("ÉCHEC : indique --projet et --video (voir l'en-tête du script)"); process.exit(1); }

(async () => {
  const proj = JSON.parse(fs.readFileSync(projetFsal, "utf8"));
  proj.videoPath = videoMp4;
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-proto-"));
  fs.writeFileSync(path.join(ud, "autosave.json"), JSON.stringify(proj));
  const app = await electron.launch({ executablePath: path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron"), args: [APP, "--user-data-dir=" + ud] });
  const win = await app.firstWindow();
  await win.waitForLoadState("load");
  for (let i = 0; i < 240; i++) { if (await win.evaluate(() => !!(window.FSAI && window.FSApp.getVideoUrl() && document.querySelector("video") && document.querySelector("video").readyState >= 1))) break; await new Promise((r) => setTimeout(r, 500)); }
  const res = await win.evaluate(async ({ T0, SEC }) => {
    const out = {};
    const url = window.FSApp.getVideoUrl();
    const mk = () => new Promise((ok, ko) => { const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.src = url; v.onloadedmetadata = () => ok(v); v.onerror = () => ko(new Error("vidéo illisible")); });
    const probe = await mk();
    out.video = { w: probe.videoWidth, h: probe.videoHeight, duree: probe.duration };
    const FPS = 30, N = Math.round(SEC * FPS);
    const cw = Math.min(1280, probe.videoWidth), ch = Math.round(probe.videoHeight * cw / probe.videoWidth);
    const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    const cx = cv.getContext("2d", { willReadFrequently: true });
    const small = document.createElement("canvas"); small.width = 32; small.height = 18; const sx = small.getContext("2d", { willReadFrequently: true });
    const sig = (v) => { sx.drawImage(v, 0, 0, 32, 18); const d = sx.getImageData(0, 0, 32, 18).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + 7 * d[i + 1] + 13 * d[i + 2]) | 0; return h; };
    const stat = (a) => { const s = a.slice().sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]; return { moy: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
    const seek = (v, t) => new Promise((ok) => { const d = () => { v.removeEventListener("seeked", d); ok(); }; v.addEventListener("seeked", d); v.currentTime = t; });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // A. « sauts » image par image (méthode actuelle, à 1/30 s d'écart), en lisant l'image complète
    {
      const v = await mk(); const ms = [], sigs = [];
      for (let i = 0; i < N; i++) {
        const t = performance.now();
        await seek(v, T0 + (i + 0.5) / FPS);
        cx.drawImage(v, 0, 0, cw, ch); cx.getImageData(0, 0, cw, ch);
        ms.push(performance.now() - t); sigs.push(sig(v));
      }
      let dup = 0; for (let i = 1; i < sigs.length; i++) if (sigs[i] === sigs[i - 1]) dup++;
      out.A_sauts = { images: N, msParImage: stat(ms), imagesIdentiquesConsecutives: dup, tempsTotalS: +(ms.reduce((x, y) => x + y, 0) / 1000).toFixed(1) };
    }
    // B. lecture continue avec rappel à chaque image affichée, plus ou moins vite, traitement léger (copie de l'image)
    for (const rate of [1, 2, 4]) {
      const v = await mk(); v.playbackRate = rate; await seek(v, T0);
      const got = [], work = [];
      await new Promise((ok) => {
        const cb = (now, md) => {
          const t = performance.now(); cx.drawImage(v, 0, 0, cw, ch); cx.getImageData(0, 0, cw, ch); work.push(performance.now() - t);
          got.push(md.mediaTime);
          if (md.mediaTime >= T0 + SEC) { v.pause(); ok(); } else v.requestVideoFrameCallback(cb);
        };
        v.requestVideoFrameCallback(cb); v.play();
      });
      const exp = Math.round(SEC * FPS); let gaps = 0, lost = 0;
      for (let i = 1; i < got.length; i++) { const d = got[i] - got[i - 1]; if (d > 1.5 / FPS) { gaps++; lost += Math.round(d * FPS) - 1; } }
      out["B_lecture_x" + rate] = { imagesRecues: got.length, imagesAttendues: exp, imagesPerduesEstimees: lost, trous: gaps, msTraitementParImage: stat(work) };
    }
    // C. lecture à vitesse normale mais avec un calcul lent par image (100 ms) : combien d'images perdues ?
    {
      const v = await mk(); v.playbackRate = 1; await seek(v, T0);
      const got = [];
      await new Promise((ok) => {
        const cb = (now, md) => {
          const t = performance.now(); while (performance.now() - t < 100) { /* calcul simulé */ }
          got.push(md.mediaTime);
          if (md.mediaTime >= T0 + Math.min(SEC, 6)) { v.pause(); ok(); } else v.requestVideoFrameCallback(cb);
        };
        v.requestVideoFrameCallback(cb); v.play();
      });
      const exp = Math.round(Math.min(SEC, 6) * FPS); let lost = 0;
      for (let i = 1; i < got.length; i++) { const d = got[i] - got[i - 1]; if (d > 1.5 / FPS) lost += Math.round(d * FPS) - 1; }
      out.C_lecture_avec_calcul_lent_100ms = { imagesRecues: got.length, imagesAttendues: exp, imagesPerduesEstimees: lost };
    }
    // D. détection sur la carte graphique, image par image (modèle et réglages par défaut : une seule vue, pas de découpage)
    {
      const P = window.FutsalPipeline, api = window.fsal, v = await mk();
      const st = await api.aiStatus(); out.D_detecteur = st && typeof st === "object" ? { prete: st.ready, appareil: st.device || st.provider || null } : String(st);
      const ms = [], nPers = [];
      for (let i = 0; i < 40; i++) {
        await seek(v, T0 + i / FPS); cx.drawImage(v, 0, 0, cw, ch);
        const t = performance.now();
        const dets = await P.detectCanvas(cv, 1, api, { minPerson: 0.35, minBall: 0.05 });
        const dt = performance.now() - t;
        if (i >= 5) { ms.push(dt); nPers.push(dets.filter((d) => d.cls === 0).length); }
      }
      out.D_detection_1_vue = { msParImage: stat(ms), personnesParImage: +(nPers.reduce((x, y) => x + y, 0) / nPers.length).toFixed(1) };
      // E. suivi de la caméra : coût par image à 30 images/s (images réduites à 480 px, comme l'analyse)
      const Cam = window.FutsalCamera, gw = 480, gh = Math.round(ch * gw / cw);
      const g = document.createElement("canvas"); g.width = gw; g.height = gh; const gx = g.getContext("2d", { willReadFrequently: true });
      let prev = null; const cms = [], oks = [];
      for (let i = 0; i < 90; i++) {
        await seek(v, T0 + i / FPS); gx.drawImage(v, 0, 0, gw, gh);
        const t = performance.now(); const cur = Cam.prepare(gx.getImageData(0, 0, gw, gh).data, gw, gh, [], 4);
        if (prev) { const r = Cam.estimateMotion(prev, cur, prev.mask, cur.mask, { maxCorners: 320 }); oks.push(r.ok); }
        cms.push(performance.now() - t); prev = cur;
      }
      out.E_suivi_camera = { msParImage: stat(cms.slice(1)), reussites: oks.filter(Boolean).length + " / " + oks.length };
    }
    return out;
  }, { T0, SEC });
  const f = (o) => o.moy + " ms en moyenne (p95 " + o.p95 + " ms, max " + o.max + " ms)";
  console.log("Vidéo : " + res.video.w + "x" + res.video.h + ", " + Math.round(res.video.duree) + " s ; mesure sur " + SEC + " s à partir de " + T0 + " s (" + Math.round(SEC * 30) + " images attendues à 30 images/s)\n");
  console.log("A. Lecture par « sauts » exacts de 1/30 s : " + f(res.A_sauts.msParImage) + " ; " + res.A_sauts.imagesIdentiquesConsecutives + " image(s) identique(s) de suite ; " + res.A_sauts.tempsTotalS + " s pour lire " + SEC + " s");
  [1, 2, 4].forEach((r) => { const b = res["B_lecture_x" + r]; console.log("B. Lecture continue x" + r + " : " + b.imagesRecues + " images reçues sur " + b.imagesAttendues + " (≈ " + b.imagesPerduesEstimees + " perdues), traitement léger " + f(b.msTraitementParImage)); });
  const c = res.C_lecture_avec_calcul_lent_100ms; console.log("C. Lecture continue avec un calcul de 100 ms par image : " + c.imagesRecues + " images reçues sur " + c.imagesAttendues + " (≈ " + c.imagesPerduesEstimees + " perdues)");
  console.log("D. Détection (carte graphique, une vue) : " + f(res.D_detection_1_vue.msParImage) + " ; " + res.D_detection_1_vue.personnesParImage + " personnes par image en moyenne");
  console.log("E. Suivi de la caméra : " + f(res.E_suivi_camera.msParImage) + " ; réussites " + res.E_suivi_camera.reussites);
  console.log("\n(Lecture : une méthode qui perd des images ne convient pas à une analyse continue.)");
  await app.close().catch(() => {});
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
