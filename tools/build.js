/**
 * Assemble la version « copier-coller » de l'app dans dist/ : node tools/build.js
 *   dist/Code.gs          tout le code serveur (src/*.js) en un fichier
 *   dist/Index.html       la page complète (Tokens, Styles et App intégrés)
 *   dist/appsscript.json  le manifeste
 * Trois fichiers à coller dans l'éditeur Apps Script, sans outil à installer.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const DIST = path.join(__dirname, '..', 'dist');
fs.mkdirSync(DIST, { recursive: true });

const version = (fs.readFileSync(path.join(SRC, 'Config.js'), 'utf8').match(/VERSION: '([^']+)'/) || [])[1];
const entete = `Kompa Affaires ${version} — fichier généré par tools/build.js depuis src/. Ne pas modifier ici.`;

// Setup.js en tête : « installer » est ainsi la fonction sélectionnée par défaut
// dans la liste « Exécuter » de l'éditeur Apps Script.
const code = fs.readdirSync(SRC)
  .filter((f) => f.endsWith('.js'))
  .sort((a, b) => (a === 'Setup.js' ? -1 : b === 'Setup.js' ? 1 : a.localeCompare(b)))
  .map((f) => `// ════════ ${f} ════════\n\n` + fs.readFileSync(path.join(SRC, f), 'utf8').trim())
  .join('\n\n\n');
fs.writeFileSync(path.join(DIST, 'Code.gs'), `/* ${entete} */\n\n${code}\n`);

let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
html = html.replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (_, nom) => fs.readFileSync(path.join(SRC, nom + '.html'), 'utf8').trim());
html = html.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n<!-- ${entete} -->`);
fs.writeFileSync(path.join(DIST, 'Index.html'), html);

fs.copyFileSync(path.join(SRC, 'appsscript.json'), path.join(DIST, 'appsscript.json'));
console.log('dist/ à jour : Code.gs, Index.html, appsscript.json');
