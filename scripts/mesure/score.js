/* Note chaque composant du programme sur 100, contre les étiquettes de John. Ne modifie rien.
   Usage : node scripts/mesure/score.js --etiquettes etiquettes.json --projet match.fsal [--controle controle.json] [--images images.json] [--sortie rapport.json]
   - etiquettes.json : fichier du menu Étiquetage (un par vidéo) ;
   - match.fsal : projet analysé (ai.frames) ; --images : tableau d'images compactes si elles sont dans un fichier à part ;
   - controle.json : verdicts du « Contrôle rapide » (ai.controleRapide du projet, ou fichier exporté).
   Définitions et seuils : docs/definition-mesure.md. Un composant non mesurable est rendu « non évalué » avec sa raison. */
"use strict";
const fs = require("fs");
const P = require("../../src/ai/pipeline");
const M = require("./lib");

const arg = (n) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : null; };
const lit = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

function noter(etiq, projet, images, ctrl) {
  const ai = projet.ai || {};
  const frames = P.expandFrames(images || ai.frames || []);
  const video = { vw: etiq.video.vw, vh: etiq.video.vh };
  if (!(video.vw > 0 && video.vh > 0)) throw new Error("taille de vidéo inconnue dans les étiquettes");
  const j = M.mesureJoueurs(etiq, frames, video);
  const res = [M.mesureBallon(etiq, frames, video, ai.calibrations, {}), j.detection, j.equipes, j.identites, M.mesureEntrees(etiq, frames, video)];
  const c = M.mesureControle(ctrl || ai.controleRapide || []);
  Object.keys(c).forEach((k) => res.push(c[k]));
  [["terrain", "tracé du terrain collé aux lignes", "pas mesuré ici : demande des repères de John sur des images (étape 3) ; l'accord automatique des lignes (lignes.js) n'est qu'un indice"],
   ["silhouettes", "silhouettes fidèles ou cercle au sol", "pas mesuré ici : verdicts « Contrôle rapide » à faire (étape 4)"],
   ["synchro", "vue du dessus et vidéo synchrones", "pas mesuré ici : mesuré par le test de bout en bout de l'étape 4"]].forEach(([id, nom, raison]) => {
    if (!res.some((r) => (r.composant || "").indexOf(id) >= 0)) res.push({ composant: nom, evalue: false, raison, score: null });
  });
  return { video: etiq.video, images: frames.length, imagesEtiquetees: Object.keys(etiq.frames || {}).length, composants: res };
}

function afficher(r) {
  console.log("Vidéo : " + r.video.name + " (" + r.video.vw + "×" + r.video.vh + "), images analysées : " + r.images + ", images étiquetées : " + r.imagesEtiquetees);
  r.composants.forEach((c) => {
    const s = c.score == null ? "non évalué" : c.score + " / 100";
    const iv = c.rappel ? " [" + c.rappel.bas + " – " + c.rappel.haut + "] sur " + c.rappel.n : c.justesParmiAffichees ? " [" + c.justesParmiAffichees.bas + " – " + c.justesParmiAffichees.haut + "] sur " + c.justesParmiAffichees.n : c.continuite ? " [" + c.continuite.bas + " – " + c.continuite.haut + "] sur " + c.continuite.n : c.justes ? " [" + c.justes.bas + " – " + c.justes.haut + "] sur " + c.justes.n : "";
    console.log("- " + c.composant + " : " + s + (c.score == null ? "" : iv) + (c.atteint ? "  ✔ 95 prouvé" : c.score == null ? "" : "  (95 non prouvé)") + (c.raison ? "  — " + c.raison : "") + (c.reserve ? "  — " + c.reserve : ""));
    if (c.composant === "ballon" && c.evalue) console.log("    faux ballons : " + c.fauxParmiAffiches.pct + " % des ballons affichés, " + c.fauxSurImagesSansBallon.pct + " % des images sans ballon (limite 3 %) ; tolérance " + c.tolerancePx + " px");
  });
}

if (require.main === module) {
  const e = arg("etiquettes"), p = arg("projet");
  if (!e || !p) { console.error("Indique --etiquettes et --projet (voir l'en-tête du script)."); process.exit(1); }
  const rapport = noter(lit(e), lit(p), arg("images") ? lit(arg("images")) : null, arg("controle") ? lit(arg("controle")) : null);
  afficher(rapport);
  if (arg("sortie")) fs.writeFileSync(arg("sortie"), JSON.stringify(rapport, null, 1));
}
module.exports = { noter, afficher };
