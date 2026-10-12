/* Charge toute la base de connaissances (Node) — dans le navigateur, les fichiers
   sont chargés séparément via des balises script et partagent window.FutsalKB. */
module.exports = Object.assign({},
  require("./rules.js"), require("./systems.js"), require("./roles.js"), require("./tactics.js"),
  require("./glossary.js"), require("./drills.js"), require("./errors.js"));
