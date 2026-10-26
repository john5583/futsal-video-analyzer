/* Audit « zéro défaut » : parcourt tous les onglets, clique chaque bouton / case / curseur / liste / lien, et vérifie
   - un effet visible ou un état attendu (pas de bouton mort),
   - aucune erreur console, aucune exception, aucun message d'erreur (dialogue, texte rouge),
   - aucun bouton grisé sans explication (title ou texte voisin),
   - le menu Fichier / Affichage / Aide (actions envoyées par le menu).
   Usage : xvfb-run -a node tests/e2e/audit-zero-defaut.js [--rapport fichier.json]   (nécessite ffmpeg) */
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const { _electron: electron } = require("playwright-core");
const { build } = require("../helpers/audit-fixture");
const APP = path.join(__dirname, "..", "..");
const must = (c, m) => { if (!c) { console.error("ÉCHEC : " + m); process.exitCode = 1; } else console.log("ok   " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rapportIdx = process.argv.indexOf("--rapport");
const RAPPORT = rapportIdx > 0 ? process.argv[rapportIdx + 1] : null;
const TABS = ["analyse", "rapport", "plan", "corrections", "kb", "aide"];

/* Éléments qu'on ne clique pas : ils quittent l'application ou ouvrent un sélecteur de fichier natif (remplacé par une annulation) */
const SELECTEUR = "button, input, select, textarea, summary, a[href], [role=button], [role=tab], [contenteditable=true]";

async function lance(dir, kind, extra) {
  const f = build(dir, kind, extra && extra.video);
  const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  const app = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + f.ud] });
  const proc = app.process(); const log = (d) => { if (process.env.FSAL_AUDIT_VERBOSE) console.log("  [processus]", String(d).trim().slice(0, 300)); };
  proc.stderr && proc.stderr.on("data", log); proc.stdout && proc.stdout.on("data", log); proc.on("exit", (c, sg) => console.log("  [processus principal terminé]", c, sg));
  /* dialogues natifs : annulation ; IPC : compteur ; ouverture externe : neutralisée */
  await app.evaluate(({ dialog, ipcMain, shell }) => {
    globalThis.__ipc = 0; globalThis.__dlg = [];
    const ann = (n) => (...a) => { globalThis.__dlg.push(n); if (n === "showOpenDialog" && globalThis.__open) return Promise.resolve({ canceled: false, filePaths: globalThis.__open }); return Promise.resolve(n === "showMessageBox" ? { response: 0, checkboxChecked: false } : { canceled: true, filePaths: [], filePath: undefined }); };
    dialog.showOpenDialog = ann("showOpenDialog"); dialog.showSaveDialog = ann("showSaveDialog"); dialog.showMessageBox = ann("showMessageBox");
    dialog.showErrorBox = (...a) => { globalThis.__dlg.push("showErrorBox:" + a.join("|")); };
    shell.openExternal = () => { globalThis.__dlg.push("openExternal"); return Promise.resolve(); };
    shell.showItemInFolder = () => { globalThis.__dlg.push("showItemInFolder"); };
    const m = ipcMain._invokeHandlers;
    if (m && m.forEach) m.forEach((fn, k) => m.set(k, async (...a) => { globalThis.__ipc++; return fn(...a); }));
  });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1500, height: 950 });
  const errors = [], dialogs = [];
  win.on("pageerror", (e) => errors.push("exception : " + e.message));
  win.on("console", (m) => { if (m.type() === "error") errors.push("console : " + m.text()); });
  win.on("dialog", (d) => { dialogs.push(d.type() + " : " + d.message()); d.accept().catch(() => {}); });
  await win.waitForLoadState("load");
  await sleep(1500);
  return { app, win, errors, dialogs, f };
}

/* Empreinte de l'état visible et interne : si rien ne change après un clic, le bouton est « mort » */
const EMPREINTE = () => {
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
  const parts = [];
  if (!window.__toastObs && document.getElementById("toast")) { window.__toastN = 0; window.__toastObs = new MutationObserver(() => { window.__toastN++; }); window.__toastObs.observe(document.getElementById("toast"), { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class"] }); }
  parts.push("t" + (window.__toastN || 0));   // un message affiché de nouveau compte comme un effet
  parts.push(document.body.innerText.length + ":" + hash(document.body.innerText));
  parts.push(document.querySelectorAll("*").length);
  const st = [];
  document.querySelectorAll("input, select, textarea").forEach((e) => st.push((e.id || "") + "=" + (e.type === "checkbox" || e.type === "radio" ? e.checked : e.value)));
  document.querySelectorAll("[class], [hidden], [disabled]").forEach((e) => st.push(e.className + "|" + e.hidden + "|" + e.disabled));
  parts.push(hash(st.join(";")));
  const v = document.querySelector("video");
  if (v) parts.push([v.currentTime.toFixed(2), v.paused, v.playbackRate, v.style.transform, v.muted, v.volume].join(","));
  const cv = [];   // pas de lecture des canvas : elle a fait planter le rendu (mémoire carte graphique) pendant l'audit
  document.querySelectorAll("canvas").forEach((c) => cv.push(c.width + "x" + c.height + (c.hidden ? "h" : "") + (c.style.cssText || "")));
  parts.push(cv.join(","));
  try { parts.push(hash(JSON.stringify(window.FSAI.ai()).slice(0, 2e6))); } catch (_e) { parts.push("a"); }
  try { parts.push(hash(JSON.stringify(window.FSApp.project ? window.FSApp.project() : null))); } catch (_e) { parts.push("p"); }
  return parts.join("|");
};

/* Liste des éléments interactifs de la zone, avec une clé stable */
const LISTE = (arg) => {
  const [zone, sel] = arg;
  const root = zone ? document.querySelector(zone) : document.body;
  const out = [], vus = {};
  root.querySelectorAll(sel).forEach((e) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    const visible = !!(r.width || r.height) && cs.visibility !== "hidden" && cs.display !== "none" && !e.closest("[hidden]");
    const champ = /^(input|select|textarea)$/i.test(e.tagName); const txt = (champ ? (e.getAttribute("aria-label") || e.title || e.placeholder || (e.labels && e.labels[0] && e.labels[0].textContent) || "") : (e.textContent || e.getAttribute("aria-label") || e.title || "")).trim().replace(/\s+/g, " ").slice(0, 40);
    let base = e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.dataset && e.dataset.tab ? "[tab=" + e.dataset.tab + "]" : "") + (e.type ? ":" + e.type : "") + "«" + txt + "»";
    vus[base] = (vus[base] || 0) + 1; if (vus[base] > 1) base += "#" + vus[base];
    out.push({ idx: out.length, cle: base, visible, disabled: !!e.disabled || e.getAttribute("aria-disabled") === "true", type: e.type || "", tag: e.tagName.toLowerCase(), explic: !!((e.title || "").trim() || e.getAttribute("aria-describedby") || e.getAttribute("data-why")), txt });
  });
  return out;
};
const CIBLE = (arg) => {
  const [zone, sel, idx] = arg;
  const root = zone ? document.querySelector(zone) : document.body;
  const e = root.querySelectorAll(sel)[idx];
  if (!e) return false;
  e.setAttribute("data-audit", "1");
  return true;
};

/* Texte d'erreur affiché à l'écran (messages rouges, « Erreur », « undefined », « NaN », « [object ») */
const TEXTE_ERREUR = () => {
  const bad = [];
  const re = /(\bundefined\b|\bNaN\b|\[object |Traceback|TypeError|ReferenceError|Cannot read|is not a function|\bnull\b)/;
  document.querySelectorAll("body *").forEach((e) => {
    if (e.children.length || !e.offsetParent || /^(SCRIPT|STYLE|OPTION)$/.test(e.tagName)) return;
    const t = (e.textContent || "").trim();
    if (t && re.test(t)) bad.push(t.slice(0, 80));
    const c = getComputedStyle(e).color;
    if (t && /^rgb\((2[0-9]{2}|1[7-9][0-9]), ?([0-9]{1,2}|1[0-3][0-9]), ?([0-9]{1,2}|1[0-3][0-9])\)$/.test(c) && /(erreur|échec|impossible|invalide)/i.test(t)) bad.push("rouge : " + t.slice(0, 80));
  });
  return bad;
};

async function clique(S, item, zone) {
  const { win } = S;
  const trouve = await win.evaluate(CIBLE, [zone, SELECTEUR, item.idx]);
  if (!trouve) return { statut: "introuvable" };
  const h = await win.$("[data-audit=\"1\"]");
  if (!h) return { statut: "introuvable" };
  const nbErr = S.errors.length, nbDlg = S.dialogs.length;
  const avant = await win.evaluate(EMPREINTE);
  const ipc0 = await S.app.evaluate(() => globalThis.__ipc + globalThis.__dlg.length);
  let action = "clic";
  try {
    if (item.type === "range") { action = "curseur"; await h.evaluate((e) => { const mid = (Number(e.min || 0) + Number(e.max || 100)) / 2; e.value = Math.abs(Number(e.value) - mid) < 1e-9 ? e.min : mid; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }); }
    else if (item.tag === "select") { action = "liste"; await h.evaluate((e) => { if (e.options.length > 1) { e.selectedIndex = (e.selectedIndex + 1) % e.options.length; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } }); }
    else if (item.type === "text" || item.type === "number" || item.type === "search" || item.tag === "textarea") { action = "saisie"; await h.evaluate((e) => { e.focus(); e.value = e.type === "number" ? String(Number(e.min || 1) + 1) : "essai"; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }); }
    else if (item.type === "file") { action = "fichier (ignoré)"; }
    else if (item.type === "color") { action = "couleur"; await h.evaluate((e) => { e.value = "#336699"; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }); }
    else await h.click({ timeout: 3000, trial: false });
  } catch (e) {
    await win.evaluate(() => document.querySelectorAll("[data-audit]").forEach((x) => x.removeAttribute("data-audit")));
    return { statut: "non cliquable", detail: String(e.message).split("\n").filter((l) => /intercepts|not visible|outside|not stable|disabled|detached|not attached/i.test(l)).slice(0, 2).join(" / ").trim().slice(0, 220) || String(e.message).split("\n")[0].slice(0, 160) };
  }
  await sleep(350);
  await win.evaluate(() => document.querySelectorAll("[data-audit]").forEach((x) => x.removeAttribute("data-audit")));
  const apres = await win.evaluate(EMPREINTE);
  const ipc1 = await S.app.evaluate(() => globalThis.__ipc + globalThis.__dlg.length);
  const effet = avant !== apres || ipc1 !== ipc0 || S.dialogs.length !== nbDlg;
  return { statut: effet ? "effet" : "mort", action, erreurs: S.errors.slice(nbErr), dialogues: S.dialogs.slice(nbDlg), texte: await win.evaluate(TEXTE_ERREUR) };
}

/* Remet l'écran dans un état neutre entre deux clics (boîtes ouvertes, onglet) */
async function neutre(S, tab) {
  await S.win.evaluate((tab) => {
    document.querySelectorAll("details").forEach((d) => { d.open = true; });   // un clic sur un résumé referme la zone : on la rouvre pour atteindre ce qu'elle contient
    document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (_e) { d.removeAttribute("open"); } });
    const b = document.querySelector("#tabs button[data-tab=\"" + tab + "\"]"); if (b && !b.classList.contains("active")) b.click();
  }, tab);
}

async function parcourtOnglet(S, tab, rapport, nomScenario, max, opts) {
  opts = Object.assign({}, opts || {});
  if (!opts.eviter && tab === "analyse" && !opts.zone && nomScenario !== "manuel") opts.eviter = /«Marquage manuel»/;   // couvert par le scénario « manuel »
  if (tab) { await S.win.evaluate((tab) => document.querySelector("#tabs button[data-tab=\"" + tab + "\"]").click(), tab); await sleep(500); }
  const zone = opts.zone || (tab ? "#tab-" + tab : null), vues = {};
  const faits = {}, vusInvisibles = {}, famille = {};
  const norm = (c) => c.replace(/#\d+$/, "").replace(/\d+/g, "0");   // « événement n° 12 » et « n° 13 » = même famille : 2 clics suffisent
  for (let n = 0; n < (max || 400); n++) {
    const liste = await S.win.evaluate(LISTE, [zone, SELECTEUR]);
    if (opts.attend) await opts.attend(S);
    const dispo = liste.filter((x) => !faits[x.cle] && x.visible && (famille[norm(x.cle)] || 0) < 2 && !(opts.eviter && opts.eviter.test(x.cle)));   // « eviter » : repoussé à un autre scénario (il cache le panneau en cours)
    const it = dispo.find((x) => n > 0 && !vues[x.cle]) || dispo[0];   // ce qui vient d'apparaître passe en premier (fenêtre ouverte par le clic précédent)
    liste.forEach((x) => { if (x.visible) vues[x.cle] = true; });
    liste.forEach((x) => { if (!x.visible && !faits[x.cle]) vusInvisibles[x.cle] = x; });
    if (!it) break;
    faits[it.cle] = true; famille[norm(it.cle)] = (famille[norm(it.cle)] || 0) + 1;
    if (process.env.FSAL_AUDIT_VERBOSE) console.log("  >", nomScenario, tab, it.cle);
    const ligne = { scenario: nomScenario, onglet: tab || "(page)", element: it.cle };
    if (it.disabled) ligne.statut = it.explic ? "grisé, expliqué" : "grisé SANS explication";
    else {
      if (tab) await neutre(S, tab);
      const r = await clique(S, it, zone);
      if (r.statut === "non cliquable" && /not visible|detached|not attached/.test(r.detail || "")) { ligne.statut = "plus affiché après un clic précédent (non compté)"; }
      else if (r.statut === "mort") {   // deuxième chance : état où l'action a un sens (vidéo avancée, zoom, valeur différente)
        await S.win.evaluate(() => { const v = document.querySelector("video"); if (v && v.readyState >= 1) { v.pause(); v.currentTime = Math.min(3, (v.duration || 3) - 0.5); } const z = document.getElementById("zm-reset"); if (z) z.click(); const zi = document.getElementById("zm-in"); if (zi) zi.click(); document.querySelectorAll("input[type=search], input[type=text]").forEach((e) => { if (e.id !== "p-name" && !e.id.startsWith("p-")) { e.value = ""; } }); });
        await sleep(400);
        const r2 = await clique(S, it, zone);
        Object.assign(ligne, r2.statut === "effet" ? Object.assign(r2, { statut: "effet" }) : r);
      } else Object.assign(ligne, r);
      if (tab) await neutre(S, tab);
      await sleep(100);
    }
    rapport.push(ligne);
  }
  Object.keys(vusInvisibles).forEach((k) => { if (!faits[k]) rapport.push({ scenario: nomScenario, onglet: tab || "(page)", element: k, statut: "non affiché dans cet état" }); });
}

const AUTORISE_SANS_EFFET = [   // [motif de l'élément, raison] : clics sans effet voulu (déjà dans l'état demandé)
  [/«Relance risquée sous pression/, "première animation déjà affichée à l'ouverture de l'onglet"],
  [/«1 · Mon équipe»/, "type déjà choisi à l'ouverture"], [/#lab-zoom-reset/, "zoom déjà à 1×"], [/#lab-sub-who/, "liste sans choix tant qu'aucune fiche n'existe"],
  [/«Ballon»/, "mode d'étiquetage déjà actif à l'ouverture"], [/«Analyse IA»/, "onglet déjà actif"], [/«Marquage manuel»/, "onglet déjà actif"],
  [/Voir sur la vidéo/, "même écart déjà affiché par le bouton de l'heure cliqué juste avant"],
  [/input:radio/, "choix déjà coché"], [/\d+ f/, "animation déjà choisie dans la liste"], [/«Maillot»|«Short»|«Chaussettes»|«Manches/, "partie de la pipette déjà sélectionnée"]
];
const ENTETE = (S, nom, rapport) => S.win.evaluate(LISTE, ["header", SELECTEUR]).then(async (liste) => {
  for (const it of liste) { if (!it.visible || /\[tab=/.test(it.cle)) continue; rapport.push(Object.assign({ scenario: nom, onglet: "(en-tête)", element: it.cle }, await clique(S, it, "header"))); }
});
const attendChargement = async (S) => { const end = Date.now() + 40000; while (Date.now() < end) { if (await S.win.evaluate(() => window.FSAI && window.FSApp && document.querySelector("video").readyState >= 1).catch(() => false)) return true; await sleep(250); } return false; };
const ffmpegOk = () => { try { require("child_process").execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch (_e) { return false; } };
function derive(dir, base, nom, filtre, duree) {
  const envv = process.env["FSAL_AUDIT_" + nom.toUpperCase()];
  if (envv && fs.existsSync(envv)) return envv;
  if (!ffmpegOk()) return null;
  const out = path.join(dir, nom + ".mp4");
  const a = ["-y", "-loglevel", "error", "-i", base]; if (filtre) a.push("-vf", filtre); if (duree) a.push("-t", String(duree));
  require("child_process").execFileSync("ffmpeg", a.concat(["-c:v", "libx264", "-pix_fmt", "yuv420p", out]), { stdio: "ignore" });
  return out;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fsal-audit-"));
  const rapport = [], erreursGlobales = [], nonEvalue = [];
  const garde = (S, nom) => { S.errors.forEach((e) => erreursGlobales.push(nom + " : " + e)); };
  const only = process.env.FSAL_AUDIT_SCENARIOS ? process.env.FSAL_AUDIT_SCENARIOS.split(",") : null;
  const veut = (n) => !only || only.includes(n);

  /* 1. projet complet : chaque onglet + en-tête */
  if (veut("complet")) {
    const S = await lance(dir, "complet");
    must(await attendChargement(S), "projet complet chargé");
    for (const tab of TABS) await parcourtOnglet(S, tab, rapport, "complet");
    await ENTETE(S, "complet", rapport);
    garde(S, "complet"); await S.app.close();
  }

  /* 2. démarrage à froid : aucun projet, aucune vidéo */
  if (veut("froid")) {
    const S = await lance(dir, "vide");
    must(await S.win.evaluate(() => !!window.FSApp && !!window.FSAI), "démarrage à froid : l'application est prête sans projet");
    for (const tab of TABS) await parcourtOnglet(S, tab, rapport, "froid");
    await ENTETE(S, "froid", rapport);
    garde(S, "froid"); await S.app.close();
  }

  /* 3. projet ancien (sans champ « ai » récent) */
  if (veut("ancien")) {
    const S = await lance(dir, "ancien");
    must(await attendChargement(S), "projet ancien chargé (migration)");
    must(await S.win.evaluate(() => document.getElementById("p-team").value === "Les Lions"), "projet ancien : le nom d'équipe est conservé");
    for (const tab of TABS) await parcourtOnglet(S, tab, rapport, "ancien");
    garde(S, "ancien"); await S.app.close();
  }

  /* 4. vidéo verticale, vidéo très courte */
  const base = process.env.FSAL_E2E_VIDEO || path.join(dir, "essai.mp4");
  for (const [nom, filtre, duree] of [["vertical", "scale=540:960:force_original_aspect_ratio=increase,crop=540:960", 0], ["court", null, 1]]) {
    if (!veut(nom)) continue;
    const v = derive(dir, base, nom, filtre, duree);
    if (!v) { nonEvalue.push("vidéo " + nom + " : ffmpeg absent, non évalué"); continue; }
    const S = await lance(dir, "complet", { video: v });
    must(await attendChargement(S), "vidéo " + nom + " : projet chargé");
    for (const tab of ["analyse", "plan", "corrections"]) await parcourtOnglet(S, tab, rapport, nom, 150);
    garde(S, nom); await S.app.close();
  }

  /* 4 bis. zones qui demandent un état particulier : marquage manuel, questions, bancs, assistant de départ, étiquetage */
  const ouvreVideo = (S, chemins) => S.app.evaluate((_m, p) => { globalThis.__open = p; }, chemins);
  const attendAssistant = async (S) => { const end = Date.now() + 120000; while (Date.now() < end) { if (!(await S.win.evaluate(() => !!document.querySelector("#wiz .wiz-busy, #wiz .wiz-busy-bar")))) return; await sleep(1000); } };

  if (veut("manuel")) {
    const S = await lance(dir, "complet");
    must(await attendChargement(S), "marquage manuel : projet chargé");
    await S.win.evaluate(() => { document.querySelector("#seg button[data-pane=manual]").click(); });
    await parcourtOnglet(S, "analyse", rapport, "manuel", 150, { eviter: /«Analyse IA»/ });
    garde(S, "manuel"); await S.app.close();
  }

  if (veut("questions")) {
    const S = await lance(dir, "questions");
    must(await attendChargement(S), "questions : projet chargé");
    const n0 = await S.win.evaluate(() => window.FutsalDoubt.openQuestions({ doubts: window.FSAI.ai().doubts, subs: window.FSAI.ai().subs || [], uncertain: window.FSAI.ai().uncertain || [], memory: window.FSAI.memory() }).length);
    must(n0 === 1, "questions : une question « Qui est-ce ? » est posée pour la personne douteuse (" + n0 + ")");
    must(await S.win.evaluate(() => document.querySelectorAll("#ai-q .item, #ai-q > *").length > 0), "questions : la question est affichée dans le panneau");
    const OUV = () => S.win.evaluate(() => ({ n: window.FutsalDoubt.openQuestions({ doubts: window.FSAI.ai().doubts, subs: window.FSAI.ai().subs || [], uncertain: window.FSAI.ai().uncertain || [], memory: window.FSAI.memory() }).length, rep: document.getElementById("ai-ans-count").textContent }));
    await S.win.evaluate(() => { const b = [...document.querySelectorAll("#ai-q button")].find((x) => x.textContent.trim() === "Mon équipe"); if (b) b.click(); });
    await sleep(800);
    const apres = await OUV();
    must(apres.n === 0 && apres.rep === "(1)", "questions : la réponse « Mon équipe » est appliquée (plus de question) et gardée dans « Mes réponses » " + apres.rep);
    await sleep(4000);
    await S.app.close();
    const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
    const app2 = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + S.f.ud] });
    const w2 = await app2.firstWindow(); await w2.waitForLoadState("load"); await sleep(3500);
    const r2 = await w2.evaluate(() => ({ n: window.FutsalDoubt.openQuestions({ doubts: window.FSAI.ai().doubts, subs: window.FSAI.ai().subs || [], uncertain: window.FSAI.ai().uncertain || [], memory: window.FSAI.memory() }).length, rep: document.getElementById("ai-ans-count").textContent }));
    must(r2.n === 0 && r2.rep === "(1)", "questions : après fermeture et réouverture, la réponse est conservée et la question n'est pas reposée " + JSON.stringify(r2));
    await app2.close();
    const S2 = await lance(dir, "questions");
    must(await attendChargement(S2), "questions (parcours complet) : projet chargé");
    await parcourtOnglet(S2, "analyse", rapport, "questions", 450);
    S.errors.push(...S2.errors);
    garde(S, "questions"); await S2.app.close();
  }

  if (veut("bancs")) {
    const S = await lance(dir, "complet");
    must(await attendChargement(S), "bancs : projet chargé");
    await S.win.evaluate(() => { document.getElementById("ai-advanced").open = true; document.getElementById("ai-bench-mark").click(); });
    await sleep(500);
    const box = await S.win.evaluate(() => { const r = document.querySelector("video").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await S.win.mouse.click(box.x + box.w * 0.05, box.y + box.h * 0.3); await sleep(300);
    await S.win.mouse.click(box.x + box.w * 0.2, box.y + box.h * 0.8); await sleep(800);
    const zones = await S.win.evaluate(() => (window.FSAI.ai().benches || window.FSAI.ai().bancs || []).length + "|" + document.getElementById("ai-bench-zones").textContent);
    must(/^[1-9]/.test(zones) || /1/.test(zones.split("|")[1] || ""), "bancs : deux clics marquent un banc (" + zones + ")");
    await S.win.evaluate(() => document.getElementById("ai-bench-clear").click()); await sleep(500);
    must(await S.win.evaluate(() => (window.FSAI.ai().benches || window.FSAI.ai().bancs || []).length === 0), "bancs : « Effacer les bancs » les efface");
    must(S.errors.length === 0, "bancs : aucune erreur" + (S.errors.length ? " : " + S.errors.join(" | ") : ""));
    garde(S, "bancs"); await S.app.close();
  }

  if (veut("assistant")) {
    const S = await lance(dir, "vide");
    await ouvreVideo(S, [path.resolve(process.env.FSAL_E2E_VIDEO || path.join(dir, "essai.mp4"))]);
    must(await S.win.evaluate(() => !!window.FSWiz), "assistant : prêt");
    await parcourtOnglet(S, "analyse", rapport, "assistant", 80, { attend: attendAssistant, zone: "#wiz" });
    const etat = await S.win.evaluate(() => window.FSWiz.state.step);
    console.log("assistant : étape atteinte à la fin du parcours =", etat);
    garde(S, "assistant"); await S.app.close();
  }

  if (veut("etiquetage")) {
    const S = await lance(dir, "complet");
    must(await attendChargement(S), "étiquetage : projet chargé");
    await ouvreVideo(S, [path.resolve(process.env.FSAL_E2E_VIDEO || path.join(dir, "essai.mp4"))]);
    await S.win.evaluate(() => window.FSLabel.open()); await sleep(600);
    must(await S.win.evaluate(() => !document.getElementById("lab-screen").hidden), "étiquetage : l'écran s'ouvre");
    await parcourtOnglet(S, null, rapport, "etiquetage", 120, { zone: "#lab-screen", eviter: /#lab-close/ });
    garde(S, "etiquetage"); await S.app.close();
  }

  /* 5. menus Fichier / Affichage / Aide */
  if (veut("menus")) {
    const S = await lance(dir, "complet");
    must(await attendChargement(S), "menus : projet chargé");
    const items = await S.app.evaluate(({ Menu }) => { const o = []; Menu.getApplicationMenu().items.forEach((m, i) => m.submenu.items.forEach((s, j) => { if (s.type !== "separator") o.push({ i, j, menu: m.label, label: s.label, role: s.role || "" }); })); return o; });
    for (const it of items) {
      const nom = it.menu + " > " + it.label;
      if (/Quitter/.test(it.label) || it.role === "quit") { rapport.push({ scenario: "menus", onglet: "(menu)", element: nom, statut: "non testé : ferme l'application" }); continue; }
      if (/mise à jour/.test(it.label)) { rapport.push({ scenario: "menus", onglet: "(menu)", element: nom, statut: "non testé : contacte GitHub (aucune donnée ne doit sortir en test)" }); continue; }
      const nbErr = S.errors.length, avant = await S.win.evaluate(EMPREINTE), ipc0 = await S.app.evaluate(() => globalThis.__ipc + globalThis.__dlg.length), d0 = S.dialogs.length;
      await S.app.evaluate(({ Menu, BrowserWindow }, [i, j]) => { const s = Menu.getApplicationMenu().items[i].submenu.items[j]; s.click(undefined, BrowserWindow.getAllWindows()[0], undefined); }, [it.i, it.j]);
      await sleep(600);
      const apres = await S.win.evaluate(EMPREINTE), ipc1 = await S.app.evaluate(() => globalThis.__ipc + globalThis.__dlg.length);
      const effet = avant !== apres || ipc0 !== ipc1 || S.dialogs.length !== d0 || it.role;
      rapport.push({ scenario: "menus", onglet: "(menu)", element: nom, statut: effet ? "effet" : "mort", erreurs: S.errors.slice(nbErr), texte: await S.win.evaluate(TEXTE_ERREUR) });
      await neutre(S, "analyse");
    }
    garde(S, "menus"); await S.app.close();
  }

  /* 6. fermeture / réouverture + sauvegarde automatique */
  if (veut("reouverture")) {
    const S = await lance(dir, "complet");
    must(await attendChargement(S), "réouverture : projet chargé");
    await S.win.evaluate(() => { const e = document.getElementById("p-name"); e.value = "Match de contrôle"; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); });
    await sleep(4000);
    await S.app.close();
    const exe = path.join(APP, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
    const app2 = await electron.launch({ executablePath: exe, args: [APP, "--no-sandbox", "--user-data-dir=" + S.f.ud] });
    const w2 = await app2.firstWindow(); const e2 = [];
    w2.on("pageerror", (e) => e2.push(e.message)); w2.on("console", (m) => { if (m.type() === "error") e2.push(m.text()); });
    await w2.waitForLoadState("load"); await sleep(3000);
    must(await w2.evaluate(() => document.getElementById("p-name").value === "Match de contrôle"), "fermeture puis réouverture : la sauvegarde automatique a gardé le nom du projet");
    must(await w2.evaluate(() => !!(window.FSAI.ai().frames && window.FSAI.ai().frames.length > 10)), "fermeture puis réouverture : l'analyse est conservée");
    must(e2.length === 0, "réouverture : aucune erreur" + (e2.length ? " : " + e2.join(" | ") : ""));
    await app2.close();
  }

  /* 7. annulation d'une action longue (analyse) */
  if (veut("annulation")) {
    const S = await lance(dir, "complet");
    must(await attendChargement(S), "annulation : projet chargé");
    await S.win.evaluate(() => { document.querySelector("#tabs button[data-tab=analyse]").click(); const d = document.getElementById("ai-advanced"); if (d) d.open = true; });
    const lance2 = await S.win.evaluate(() => { const b = document.getElementById("ai-run"); if (!b || b.disabled) return false; b.click(); return true; });
    let visible = false;
    for (let k = 0; k < 60 && !visible; k++) { await sleep(100); visible = await S.win.evaluate(() => { const c = document.getElementById("ai-cancel"); return !!c && !c.hidden && c.offsetParent !== null; }); }
    if (lance2 && visible) {
      await S.win.evaluate(() => document.getElementById("ai-cancel").click());
      await sleep(3000);
      must(await S.win.evaluate(() => { const r = document.getElementById("ai-run"), c = document.getElementById("ai-cancel"); return !r.disabled && (c.hidden || c.offsetParent === null); }), "annulation de l'analyse : « Lancer l'analyse » revient, « Annuler » disparaît");
    } else nonEvalue.push("annulation d'une analyse : analyse terminée avant d'avoir pu annuler ou bouton absent, non évalué (lancée=" + lance2 + ", annuler visible=" + visible + ")");
    must(S.errors.length === 0, "annulation : aucune erreur" + (S.errors.length ? " : " + S.errors.join(" | ") : ""));
    garde(S, "annulation"); await S.app.close();
  }

  /* ---- bilan ---- */
  const ok = (r) => r.statut === "effet" || /^grisé, expliqué|^non affiché|^non testé|plus affiché/.test(r.statut || "");
  const sansEffetAutorise = (r) => r.statut === "mort" && AUTORISE_SANS_EFFET.find(([re]) => re.test(r.element));
  const comptes = {}; rapport.forEach((r) => { comptes[r.statut] = (comptes[r.statut] || 0) + 1; });
  const cliques = rapport.filter((r) => /^(effet|mort|non cliquable)$/.test(r.statut)).length;
  console.log("éléments cliqués :", cliques, "/ lignes du rapport :", rapport.length, JSON.stringify(comptes));
  const defauts = rapport.filter((r) => (!ok(r) && !sansEffetAutorise(r)) || (r.erreurs && r.erreurs.length) || (r.dialogues && r.dialogues.some((d) => !/^confirm/.test(d))) || (r.texte && r.texte.length));
  defauts.forEach((r) => console.log("DÉFAUT :", r.scenario, r.onglet, r.element, "=>", r.statut, r.detail || "", (r.erreurs || []).join(" ; "), (r.dialogues || []).join(" ; "), (r.texte || []).join(" ; ")));
  must(defauts.length === 0, "aucun bouton mort, grisé sans explication, ni message d'erreur (" + defauts.length + " défaut(s))");
  must(erreursGlobales.length === 0, "aucune erreur console / exception pendant tout le parcours" + (erreursGlobales.length ? " : " + erreursGlobales.slice(0, 5).join(" | ") : ""));
  nonEvalue.forEach((n) => console.log("non évalué :", n));
  if (RAPPORT) fs.writeFileSync(RAPPORT, JSON.stringify({ cliques, comptes, rapport, erreursGlobales, nonEvalue }, null, 1));
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((e) => { console.error("ÉCHEC : " + e.stack); process.exit(1); });
