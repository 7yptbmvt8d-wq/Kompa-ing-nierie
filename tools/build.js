/**
 * Assemble la version « copier-coller » de l'app dans dist/ : node tools/build.js
 *   dist/Code.gs          code serveur du suivi des affaires (src/*.js hors Est*.js)
 *   dist/Estimation.gs    code serveur du module Estimation (src/Est*.js)
 *   dist/Index.html       la page complète (Tokens, Styles et App intégrés)
 *   dist/appsscript.json  le manifeste
 * Quatre fichiers à coller dans l'éditeur Apps Script, sans outil à installer.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const DIST = path.join(__dirname, '..', 'dist');
fs.mkdirSync(DIST, { recursive: true });

const version = (fs.readFileSync(path.join(SRC, 'Config.js'), 'utf8').match(/VERSION: '([^']+)'/) || [])[1];
const entete = `Kartes Affaires ${version} — fichier généré par tools/build.js depuis src/. Ne pas modifier ici.`;

// Setup.js en tête : « installer » est ainsi la fonction sélectionnée par défaut
// dans la liste « Exécuter » de l'éditeur Apps Script.
// Module Estimation (src/Est*.js) dans un fichier séparé : dist/Estimation.gs.
const estModule = (f) => /^Est[A-Z]/.test(f);
const assembler = (fichiers) => fichiers
  .map((f) => `// ════════ ${f} ════════\n\n` + fs.readFileSync(path.join(SRC, f), 'utf8').trim())
  .join('\n\n\n');
const sources = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
const code = assembler(sources.filter((f) => !estModule(f))
  .sort((a, b) => (a === 'Setup.js' ? -1 : b === 'Setup.js' ? 1 : a.localeCompare(b))));
fs.writeFileSync(path.join(DIST, 'Code.gs'), `/* ${entete} */\n\n${code}\n`);
const versionEst = (fs.readFileSync(path.join(SRC, 'EstConfig.js'), 'utf8').match(/EST_VERSION = '([^']+)'/) || [])[1];
const est = assembler(sources.filter(estModule).sort((a, b) => (a === 'EstConfig.js' ? -1 : b === 'EstConfig.js' ? 1 : a.localeCompare(b))));
fs.writeFileSync(path.join(DIST, 'Estimation.gs'),
  `/* Kartes Affaires — module Estimation ${versionEst} — fichier généré par tools/build.js depuis src/Est*.js. Ne pas modifier ici. */\n\n${est}\n`);

let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
html = html.replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (_, nom) => fs.readFileSync(path.join(SRC, nom + '.html'), 'utf8').trim());
html = html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n<!-- ${entete} -->`);
fs.writeFileSync(path.join(DIST, 'Index.html'), html);

fs.copyFileSync(path.join(SRC, 'appsscript.json'), path.join(DIST, 'appsscript.json'));
console.log('dist/ à jour : Code.gs, Estimation.gs, Index.html, appsscript.json');
