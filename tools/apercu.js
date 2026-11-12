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
  // Données FICTIVES (aperçu uniquement) : exercice Mouthe + affaires de démonstration.
  console.log = () => {};
  env.ctx.creerAffaireExerciceMouthe();
  const A = env.ctx;
  const cree = (d, quand) => A.Affaires_creer(d, { date: quand }).id;
  const e1 = cree({ acheteur: 'Commune de Digne-les-Bains', type_acheteur: 'Commune', departement: '04', objet: 'Étude de faisabilité — réhabilitation du gymnase municipal', procedure: 'MAPA', date_limite_remise: '2026-11-14', pre_score: 85 }, '2026-11-02');
  cree({ acheteur: 'Communauté de communes Serre-Ponçon', type_acheteur: 'EPCI', departement: '05', objet: 'Programmation d\'une maison de santé pluriprofessionnelle', procedure: 'MAPA', date_limite_remise: '2026-12-04', pre_score: 72 }, '2026-11-05');
  const g1 = cree({ acheteur: 'Commune de Manosque', type_acheteur: 'Commune', departement: '04', objet: 'AMO conduite d\'opération — extension du groupe scolaire', procedure: 'MAPA', date_limite_remise: '2026-11-27', pre_score: 80 }, '2026-10-20');
  A.Affaires_changerStatut(g1, 'Go', { score_final: 74 }, { date: '2026-10-25' });
  const d1 = cree({ acheteur: 'Département des Hautes-Alpes', type_acheteur: 'Département', departement: '05', objet: 'Assistance technique — programme de rénovation des collèges', procedure: 'AO', date_limite_remise: '2026-10-30', pre_score: 66 }, '2026-10-01');
  A.Affaires_changerStatut(d1, 'Go', {}, { date: '2026-10-05' });
  A.Affaires_changerStatut(d1, 'Déposée', { montant_ht: 24500, jours_reponse: 4, date_depot: '2026-10-29' }, { date: '2026-10-29' });
  const w1 = cree({ acheteur: 'Commune de Sisteron', type_acheteur: 'Commune', departement: '04', objet: 'Faisabilité — pôle culturel en centre ancien', procedure: 'MAPA', date_limite_remise: '2026-05-15' }, '2026-04-20');
  A.Affaires_changerStatut(w1, 'Go', {}, { date: '2026-04-22' });
  A.Affaires_changerStatut(w1, 'Déposée', { montant_ht: 16000, jours_reponse: 3, date_depot: '2026-05-14' }, { date: '2026-05-14' });
  A.Affaires_changerStatut(w1, 'Gagnée', { date_notification: '2026-06-10', montant_notifie: 16000 }, { date: '2026-06-10' });
  A.Factures_ajouter(w1, { numero: 'F-2026-01', date: '2026-07-31', montant: 8000, date_encaissement: '2026-08-28', montant_encaisse: 8000 });
  A.Factures_ajouter(w1, { numero: 'F-2026-02', date: '2026-10-30', montant: 4000 });
  console.log = log;
  const html = assembler();
  fs.writeFileSync(path.join(sortie, 'index.html'), html);

  const navigateur = await chromium.launch();
  const ouvrir = async (options) => {
    const ctx = await navigateur.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris', ...options });
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
  await pc.page.waitForSelector('#carte-ca table');
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

  // ——— Lot 2 : Affaires (PC) ———
  const p = pc.page;
  await p.click('nav a[href="#affaires"]');
  await p.waitForSelector('.colonne .carte-affaire');
  await p.screenshot({ path: path.join(sortie, 'pc-affaires-colonnes.png') });
  // Glisser-déposer : En étude → Go (colonne autorisée) ouvre la boîte de passage
  await p.locator(`.carte-affaire[data-id="${e1}"]`).dragTo(p.locator('.colonne[data-statut="Go"]'));
  await p.waitForSelector('dialog.dialogue[open]');
  await p.screenshot({ path: path.join(sortie, 'pc-passage.png') });
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('dialog.dialogue', { state: 'detached' });
  await p.waitForSelector(`.colonne[data-statut="Go"] .carte-affaire[data-id="${e1}"]`);
  assert.strictEqual(A.Affaires_get_(e1).statut, 'Go', 'glisser-déposer sans effet');
  // Vue liste avec affaires clôturées
  await p.click('[data-vue="liste"]');
  await p.check('[data-action="clotures"]');
  await p.waitForSelector('.table-affaires');
  await p.screenshot({ path: path.join(sortie, 'pc-affaires-liste.png') });
  // Fiche Mouthe, onglet Résultat
  await p.click('tr[data-ouvrir="KA-2026-001"]');
  await p.waitForSelector('.fiche-tete');
  await p.click('[data-onglet="resultat"]');
  await p.screenshot({ path: path.join(sortie, 'pc-fiche-mouthe-resultat.png'), fullPage: true });
  await p.click('[data-onglet="journal"]');
  await p.screenshot({ path: path.join(sortie, 'pc-fiche-mouthe-journal.png'), fullPage: true });
  // Nouvelle affaire → fiche → No-go avec motif obligatoire
  await p.click('a[href="#affaires"]');
  await p.click('[data-action="nouvelle"]');
  await p.fill('#n-acheteur', 'Commune de Briançon');
  await p.fill('#n-objet', 'Étude préalable — patinoire');
  await p.fill('#n-departement', '05');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('.fiche-tete h1:has-text("Commune de Briançon")');
  await p.click('[data-passer="No-go"]');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('.dialogue__erreur:not([hidden])'); // motif manquant
  await p.selectOption('#p-motif_decision', 'charge');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('.fiche-tete .statut:has-text("No-go")');
  // Bloc Offre : enregistrement
  await p.click('[data-onglet="offre"]');
  await p.fill('#offre-prix_jour', '600');
  await p.click('#p-offre button[type=submit]');
  await p.waitForFunction(() => document.querySelector('#offre-prix_jour') && document.querySelector('#offre-prix_jour').value === '600' && document.querySelector('#p-offre button[type=submit]').disabled);
  const nouvelle = A.Affaires_lister().filter((x) => x.acheteur === 'Commune de Briançon')[0];
  assert.strictEqual(nouvelle.prix_jour, 600);
  assert.strictEqual(nouvelle.departement, '05');

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

  // ——— Lot 2 : Affaires (téléphone) ———
  await tel.page.click('nav a[href="#affaires"]');
  await tel.page.waitForSelector('.groupe-statut .carte-affaire');
  await tel.page.screenshot({ path: path.join(sortie, 'mobile-affaires.png'), fullPage: true });
  await tel.page.click(`.carte-affaire[data-id="${g1}"]`);
  await tel.page.waitForSelector('.bloc-lecture');
  await tel.page.screenshot({ path: path.join(sortie, 'mobile-fiche.png'), fullPage: true });
  await tel.page.click('[data-passer="Déposée"]');
  await tel.page.fill('#p-montant_ht', '21000');
  await tel.page.fill('#p-jours_reponse', '3');
  await tel.page.screenshot({ path: path.join(sortie, 'mobile-passage.png') });
  await tel.page.click('dialog.dialogue button[type=submit]');
  await tel.page.waitForSelector('.fiche-tete .statut:has-text("Déposée")');
  await tel.page.fill('#note-texte', 'Offre déposée sur la plateforme.');
  await tel.page.click('form[data-note] button[type=submit]');
  await tel.page.waitForSelector('.notes:has-text("Offre déposée sur la plateforme.")');
  const debordeFiche = await tel.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.ok(!debordeFiche, 'débordement horizontal sur la fiche mobile');

  await navigateur.close();
  const erreurs = pc.erreurs.concat(tel.erreurs);
  assert.deepStrictEqual(erreurs, [], 'erreurs JavaScript : ' + erreurs.join(' | '));
  console.log('Aperçu OK — captures dans ' + sortie);
})().catch((e) => { console.error(e); process.exit(1); });
