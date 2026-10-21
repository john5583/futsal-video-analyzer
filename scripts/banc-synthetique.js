/* Banc synthétique : des matchs fabriqués où l'on connaît l'identité réelle de chaque joueur. Compte, pour chaque suivi et chaque cadence,
   les échanges de joueurs (confusions), les pistes recréées et la part de détections rattachées à la mauvaise piste (impureté).
   Usage : node scripts/banc-synthetique.js [--scenes realiste,tenuesProches] [--cadences 3,10,30] [--matchs 6] [--secondes 120] [--graine 101]
   Les matchs de graines différentes sont indépendants : changer --graine pour juger sur des matchs jamais utilisés pour choisir un réglage. */
"use strict";
const S = require("../tests/bench/synthetic");
const T = require("../src/ai/tracker");

const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i >= 0 ? process.argv[i + 1] : d; };
const scenes = arg("scenes", "realiste,tenuesProches").split(",");
const cadences = arg("cadences", "3,10,30").split(",").map(Number);
const matchs = Number(arg("matchs", 6)), seconds = Number(arg("secondes", 120)), graine = Number(arg("graine", 101));
if (!(matchs > 0) || !(seconds > 0) || cadences.some((c) => !(c > 0))) { console.error("ÉCHEC : valeurs invalides"); process.exit(1); }
scenes.forEach((s) => { if (!S.SCENES[s]) { console.error("ÉCHEC : scène inconnue « " + s + " » (choix : " + Object.keys(S.SCENES).join(", ") + ")"); process.exit(1); } });

/* Suivis comparés. Pour en ajouter un : { nom, opts (options du suivi), ev (options de l'évaluation, ex. trackerFactory) }. */
const suivis = (soft) => [
  { nom: "ancien suivi", opts: { method: "greedy", soft } },
  { nom: "association globale", opts: { method: "optimal", soft } }
];

console.log("Matchs fabriqués : " + matchs + " matchs de " + seconds + " s par case, graines " + graine + " à " + (graine + matchs - 1) + ". Chaque case : échanges / pistes recréées / impureté.\n");
scenes.forEach((scene) => {
  const soft = scene === "tenuesProches" ? 2 : 0;
  console.log("== scène « " + scene + " »" + (soft ? " (mode tenues proches)" : ""));
  suivis(soft).forEach((v) => {
    const row = [v.nom.padEnd(20)];
    cadences.forEach((fps) => {
      let sw = 0, fr = 0, im = 0;
      for (let k = 0; k < matchs; k++) {
        const r = S.evaluate(S.makeMatch({ seed: graine + k, scene, fps, seconds }), v.opts, v.ev);
        sw += r.swaps; fr += r.fragments; im += r.impurity;
      }
      row.push(String(fps).padStart(2) + " im/s : " + (sw / matchs).toFixed(0).padStart(5) + " / " + (fr / matchs).toFixed(0).padStart(4) + " / " + ((im / matchs) * 100).toFixed(1).padStart(4) + " %");
    });
    console.log(row.join(" | "));
  });
  console.log("");
});
console.log("Repères : un échange = une piste qui passe d'un joueur réel à un autre (compté à chaque image : il augmente avec la cadence) ; l'impureté, elle, ne dépend pas de la cadence.");
void T;
