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
const { chromium } = require('playwright');
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
  return html.replace('<script>', pont + '\n<script>');
}

(async () => {
  fs.mkdirSync(sortie, { recursive: true });
  const echantillon = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'boamp-echantillon.json'), 'utf8'));
  const env = creerEnvironnement({ boamp: echantillon, gmail: [{ id: 'g1', sujet: 'Alerte : étude de faisabilité — salle des fêtes', de: 'Plateforme <a@b.fr>',
    corps: 'Organisme : Commune de Lurs\nCode postal 04700\nDate limite : 20/12/2026\nhttps://www.achatpublic.com/sdm/ent/gen/ent_detail.do?PCSLID=1' }] });
  const log = console.log; console.log = () => {};
  env.ctx.installer();
  console.log = log;
  // Données FICTIVES (aperçu uniquement) : exercice Mouthe + affaires de démonstration.
  console.log = () => {};
  env.ctx.creerAffaireExerciceMouthe();
  env.ctx.creerAffairesTestIndicateurs();
  env.ctx.Params_enregistrer('fiscal.debut_suivi', '2026-01-01');
  env.ctx.Params_enregistrer('fiscal.taux_cotisations', '23,2');
  env.ctx.Params_cache_ = null;
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
  A.Factures_ajouter(w1, { numero: 'F-2026-01b', date: '2026-09-25', montant: 2000 }); // échéance dépassée, non payée
  A.Affaires_maj(e1, { date_limite_questions: '2026-11-13', date_visite: '2026-11-13' });
  const p1 = cree({ acheteur: 'Commune de Forcalquier', type_acheteur: 'Commune', departement: '04', objet: 'Programmation d\'une médiathèque', procedure: 'MAPA' }, '2026-08-20');
  A.Affaires_changerStatut(p1, 'Go', {}, { date: '2026-08-25' });
  A.Affaires_changerStatut(p1, 'Déposée', { montant_ht: 11500, jours_reponse: 2, date_depot: '2026-09-15' }, { date: '2026-09-15' });
  A.Affaires_changerStatut(p1, 'Perdue', { date_resultat: '2026-10-28', attributaire: '[attributaire]' }, { date: '2026-10-28' });
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
  // Colonne « Clôturées » : l'exercice Mouthe y est visible ; Déposée → Clôturées propose Perdue / Sans suite
  await p.waitForSelector('.colonne[data-statut="Clôturées"] .carte-affaire[data-id="KA-2026-001"]');
  await p.locator(`.carte-affaire[data-id="${d1}"]`).dragTo(p.locator('.colonne[data-statut="Clôturées"]'));
  await p.waitForSelector('dialog.dialogue[open] input[name=cloture]');
  await p.screenshot({ path: path.join(sortie, 'pc-choix-cloture.png') });
  await p.check('input[name=cloture][value="Sans suite"]');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('dialog.dialogue[open] #p-date_resultat');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector(`.colonne[data-statut="Clôturées"] .carte-affaire[data-id="${d1}"]`);
  assert.strictEqual(A.Affaires_get_(d1).statut, 'Sans suite', 'clôture par glisser-déposer sans effet');
  await p.screenshot({ path: path.join(sortie, 'pc-affaires-colonnes-clotures.png') });
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

  // Go → Déposée depuis la fiche, puis note au journal
  await p.click('a[href="#affaires"]');
  await p.click(`[data-ouvrir="${g1}"]`);
  await p.waitForSelector('.fiche-tete');
  await p.click('[data-passer="Déposée"]');
  await p.fill('#p-montant_ht', '21000');
  await p.fill('#p-jours_reponse', '3');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('.fiche-tete .statut:has-text("Déposée")');
  await p.click('[data-onglet="journal"]');
  await p.fill('#note-texte', 'Offre déposée sur la plateforme.');
  await p.click('form[data-note] button[type=submit]');
  await p.waitForSelector('.notes:has-text("Offre déposée sur la plateforme.")');

  // ——— Lot 3 : Veille ———
  await p.click('nav a[href="#veille"]');
  await p.waitForSelector('[data-action="collecter"]');
  await p.click('[data-action="collecter"]');
  await p.waitForSelector('.table-veille tbody tr');
  await p.screenshot({ path: path.join(sortie, 'pc-veille.png'), fullPage: true });
  const digne = A.Db_lire(A.TABLES.AVIS).find((x) => /DIGNE/i.test(x.acheteur));
  await p.click(`[data-etudier="${digne.id}"]`);
  await p.waitForSelector('.fiche-tete h1:has-text("DIGNE")');
  assert.strictEqual(A.Db_trouver(A.TABLES.AVIS, digne.id).statut, 'étudié');
  await p.click('nav a[href="#veille"]');
  await p.waitForSelector('[data-ignorer]');
  const premier = await p.getAttribute('[data-ignorer]', 'data-ignorer');
  await p.click(`[data-ignorer="${premier}"]`);
  await p.waitForSelector(`[data-ignorer="${premier}"]`, { state: 'detached' });
  assert.strictEqual(A.Db_trouver(A.TABLES.AVIS, premier).statut, 'ignoré');
  await p.selectOption('[data-filtre="zone"]', 'paca');
  await p.selectOption('[data-filtre="statut"]', 'tous');
  await p.screenshot({ path: path.join(sortie, 'pc-veille-paca.png'), fullPage: true });

  // ——— Lot 4 : Échéancier ———
  await p.click('nav a[href="#accueil"]');
  await p.waitForSelector('#carte-relances .liste-suivi');
  await p.screenshot({ path: path.join(sortie, 'pc-accueil-suivi.png'), fullPage: true });
  await p.click('nav a[href="#echeancier"]');
  await p.waitForSelector('.cal-grille');
  await p.screenshot({ path: path.join(sortie, 'pc-echeancier.png'), fullPage: true });
  await p.locator('tr', { hasText: 'Motifs du rejet' }).first().locator('[data-courrier]').click();
  await p.waitForSelector('dialog.dialogue--large textarea.courrier');
  const texte = await p.inputValue('textarea.courrier');
  assert.match(texte, /code de la commande publique/);
  await p.screenshot({ path: path.join(sortie, 'pc-courrier.png') });
  await p.click('dialog.dialogue--large [data-fermer]');
  const nbAvant = await p.locator('[data-relance][data-statut="faite"]').count();
  await p.click('[data-relance][data-statut="faite"]');
  await p.waitForFunction((n) => document.querySelectorAll('[data-relance][data-statut="faite"]').length === n - 1, nbAvant);
  await p.click('[data-mois="1"]');
  await p.waitForSelector('.cal-tete h2:has-text("décembre")');
  await p.click('[data-action="apercu"]');
  await p.waitForSelector('dialog iframe.apercu-email');
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(sortie, 'pc-apercu-email.png') });
  await p.click('dialog.dialogue--large [data-fermer]');
  await p.click('[data-action="envoyer"]');
  await p.waitForFunction(() => /E-mail envoyé|Pas d'envoi/.test(document.querySelector('#toast').textContent));
  assert.strictEqual(A.MailApp.envois.length, 1, 'e-mail non envoyé');
  fs.writeFileSync(path.join(sortie, 'email-matin.html'), A.MailApp.envois[0].htmlBody);

  // ——— Lot 5 : tableau de bord et enseignements ———
  await p.click('nav a[href="#accueil"]');
  await p.waitForSelector('#tableau-de-bord .tuile');
  await p.waitForSelector('#carte-ca table');
  await p.screenshot({ path: path.join(sortie, 'pc-tableau-de-bord.png'), fullPage: true });
  const tauxGo = await p.locator('.tuile', { hasText: 'Taux de Go' }).locator('.tuile__valeur').textContent();
  assert.match(tauxGo, /%$/);
  await p.click('nav a[href="#enseignements"]');
  await p.waitForSelector('.table-enseignements tbody tr');
  await p.screenshot({ path: path.join(sortie, 'pc-enseignements.png'), fullPage: true });

  // ——— Déclarations URSSAF ———
  await p.click('nav a[href="#accueil"]');
  await p.waitForSelector('#carte-urssaf table');
  const nbDeclarer = await p.locator('[data-declarer]').count();
  assert.ok(nbDeclarer >= 1, 'aucune période à déclarer');
  await p.locator('#carte-urssaf').screenshot({ path: path.join(sortie, 'pc-urssaf.png') });
  await p.click('[data-declarer]');
  await p.waitForSelector('dialog #d-ca');
  await p.click('dialog button[type=submit]');
  await p.waitForFunction((n) => document.querySelectorAll('[data-declarer]').length === n - 1, nbDeclarer);
  assert.strictEqual(A.Db_lire(A.TABLES.DECLARATIONS).length, 1);

  // Petit portable (1280 px) : pas de débordement de la page
  await p.setViewportSize({ width: 1280, height: 800 });
  for (const ecran of ['#accueil', '#veille', '#affaires', '#echeancier', '#enseignements', '#parametres']) {
    await p.click(`nav a[href="${ecran}"]`);
    await p.waitForTimeout(300);
    const deborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.ok(!deborde, 'débordement horizontal à 1280 px : ' + ecran);
  }

  await navigateur.close();
  const erreurs = pc.erreurs;
  assert.deepStrictEqual(erreurs, [], 'erreurs JavaScript : ' + erreurs.join(' | '));
  console.log('Aperçu OK — captures dans ' + sortie);
})().catch((e) => { console.error(e); process.exit(1); });
