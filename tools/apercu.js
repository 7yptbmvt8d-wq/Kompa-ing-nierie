/**
 * Aperçu local de la web app : node tools/apercu.js [dossier-captures]
 * Assemble Index.html comme Apps Script (includes), branche google.script.run
 * sur la simulation de tools/gas-mock.js, et contrôle les écrans dans Chromium
 * (PC et téléphone) : lecture et écriture d'un paramètre.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');
const { creerEnvironnement } = require('./gas-mock');

const SRC = path.join(__dirname, '..', 'src');
const sortie = process.argv[2] || path.join(__dirname, '..', 'apercu');

function assembler() {
  let html = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  html = html.replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (_, nom) => fs.readFileSync(path.join(SRC, nom + '.html'), 'utf8'));
  const pont = `<script>
  window.google = { script: { run: new Proxy({}, { get: function (_, m) {
    var ok = function () {}, ko = function () {};
    var r = new Proxy({}, { get: function (_, n) {
      if (n === 'withSuccessHandler') return function (f) { ok = f; return r; };
      if (n === 'withFailureHandler') return function (f) { ko = f; return r; };
      return function () { window.__gas(n, Array.prototype.slice.call(arguments)).then(ok, ko); };
    } });
    return r[m];
  } }) } };
  </script>`;
  // En production, la balise viewport est ajoutée par doGet() (addMetaTag).
  html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
  return html.replace('<script>', pont + '\n<script>');
}

(async () => {
  fs.mkdirSync(sortie, { recursive: true });
  const env = creerEnvironnement();
  const log = console.log; console.log = () => {};
  env.ctx.installer();
  console.log = log;
  const html = assembler();
  fs.writeFileSync(path.join(sortie, 'index.html'), html);

  const navigateur = await chromium.launch();
  const ouvrir = async (options) => {
    const ctx = await navigateur.newContext(options);
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.exposeFunction('__gas', (nom, args) => env.ctx[nom].apply(null, args));
    await page.goto('file://' + path.join(sortie, 'index.html'));
    return { page, erreurs };
  };

  // PC
  const pc = await ouvrir({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 });
  await pc.page.waitForSelector('#carte-etat dl');
  await pc.page.screenshot({ path: path.join(sortie, 'pc-accueil.png') });

  await pc.page.click('nav a[href="#parametres"]');
  await pc.page.waitForSelector('tr[data-cle]');
  const ligne = pc.page.locator('tr[data-cle="capacite.montant_max_mission"]');
  await ligne.locator('.champ').fill('40000');
  await ligne.locator('button').click();
  await pc.page.waitForSelector('#toast:not([hidden])');
  await pc.page.waitForFunction(() => document.querySelector('tr[data-cle="capacite.montant_max_mission"] button').textContent === 'Enregistrer');
  env.ctx.Params_cache_ = null;
  assert.strictEqual(env.ctx.Params_texte('capacite.montant_max_mission'), '40000', 'écriture non répercutée dans le classeur');
  await ligne.scrollIntoViewIfNeeded();
  await pc.page.screenshot({ path: path.join(sortie, 'pc-parametres.png') });

  // Téléphone
  const tel = await ouvrir({ ...devices['iPhone 13'] });
  await tel.page.waitForSelector('#carte-etat dl');
  await tel.page.screenshot({ path: path.join(sortie, 'mobile-accueil.png'), fullPage: true });
  await tel.page.click('nav a[href="#parametres"]');
  await tel.page.waitForSelector('.param-carte');
  const lu = await tel.page.locator('.param-carte', { hasText: 'capacite.montant_max_mission' }).locator('.param-val').textContent();
  assert.strictEqual(lu.trim(), '40000', 'lecture mobile incorrecte');
  await tel.page.screenshot({ path: path.join(sortie, 'mobile-parametres.png') });

  // Débordement horizontal sur téléphone
  const deborde = await tel.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.ok(!deborde, 'débordement horizontal sur mobile');

  await navigateur.close();
  const erreurs = pc.erreurs.concat(tel.erreurs);
  assert.deepStrictEqual(erreurs, [], 'erreurs JavaScript : ' + erreurs.join(' | '));
  console.log('Aperçu OK — captures dans ' + sortie);
})().catch((e) => { console.error(e); process.exit(1); });
