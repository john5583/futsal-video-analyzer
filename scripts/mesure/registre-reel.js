/* Regarde ce que le registre des personnes fait sur une vraie analyse (lecture seule). Aucune vérité de terrain : ce sont des INDICES, pas une mesure de justesse.
   Usage : node scripts/mesure/registre-reel.js --projet match.fsal */
"use strict";
const fs = require("fs");
const P = require("../../src/ai/pipeline"), R = require("../../src/ai/registre");
const i = process.argv.indexOf("--projet");
if (i < 0) { console.error("Indique --projet."); process.exit(1); }
const proj = JSON.parse(fs.readFileSync(process.argv[i + 1], "utf8")), ai = proj.ai || {};
const frames = P.expandFrames(ai.frames || []);
if (!frames.length) { console.log("Pas d'analyse dans ce projet."); process.exit(0); }
const pistes = new Set(); frames.forEach((f) => f.players.forEach((p) => pistes.add(p.id)));
const r = R.construire(frames, { L: ai.L || 40, W: ai.W || 20 });
// fusions : une personne ne doit jamais avoir deux pistes simultanées (garanti par construction, vérifié ici)
const parPiste = new Map(); r.personnes.forEach((p) => p.pistes.forEach((id) => parPiste.set(id, p.id)));
let chevauche = 0; frames.forEach((f) => { const vu = new Set(); f.players.forEach((p) => { const q = parPiste.get(p.id); if (q == null) return; if (vu.has(q)) chevauche++; vu.add(q); }); });
// personnes de champ présentes en même temps (une équipe de futsal : 5 au plus, gardien compris)
let maxA = 0, maxB = 0; frames.forEach((f) => { const a = new Set(), b = new Set(); f.players.forEach((p) => { const q = parPiste.get(p.id); if (q == null) return; if (p.team === "A" || p.team === "GKA") a.add(q); if (p.team === "B" || p.team === "GKB") b.add(q); }); maxA = Math.max(maxA, a.size); maxB = Math.max(maxB, b.size); });
console.log(proj.name || process.argv[i + 1], "— durée analysée", Math.round(frames[frames.length - 1].t - frames[0].t), "s");
console.log("pistes dans l'analyse :", pistes.size, "| pistes gardées (≥ " + R.MIN_DET + " détections) :", r.personnes.reduce((a, p) => a + p.pistes.length, 0), "| personnes :", r.resume.total, JSON.stringify(r.resume));
console.log("rattachements sans ambiguïté :", r.liens.length, "| rattachements refusés pour ambiguïté :", r.ambigus.length);
console.log("images où une même personne a deux pistes en même temps :", chevauche, "(doit être 0)");
console.log("personnes de la même équipe visibles en même temps, au maximum : mon équipe", maxA, "| adversaire", maxB, "(5 attendu au plus ; plus = morceaux non recollés ou personnes en trop)");
