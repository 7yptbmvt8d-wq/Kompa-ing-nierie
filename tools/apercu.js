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
  // doGet() ajoute la balise viewport (addMetaTag) : on la reproduit pour l'aperçu téléphone.
  html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">');
  return html.replace('<script>', pont + '\n<script>');
}

(async () => {
  fs.mkdirSync(sortie, { recursive: true });
  const echantillon = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'boamp-echantillon.json'), 'utf8'));
  const qontoFactures = []; // API Qonto simulée (factures complétées après la création des affaires)
  const env = creerEnvironnement({ qonto: { cle: 'kompa-demo:secret', factures: qontoFactures }, boamp: echantillon, gmail: [{ id: 'g1', sujet: 'Alerte : étude de faisabilité — salle des fêtes', de: 'Plateforme <a@b.fr>',
    corps: 'Organisme : Commune de Lurs\nCode postal 04700\nDate limite : 20/12/2026\nhttps://www.achatpublic.com/sdm/ent/gen/ent_detail.do?PCSLID=1' }] });
  const log = console.log; console.log = () => {};
  env.ctx.installer();
  console.log = log;
  // Données FICTIVES (aperçu uniquement) : exercice Mouthe + affaires de démonstration.
  console.log = () => {};
  env.ctx.creerAffaireExerciceMouthe();
  env.ctx.creerAffairesTestIndicateurs();
  env.ctx.Params_enregistrer('fiscal.debut_suivi', '2026-01-01');
  env.ctx.Params_enregistrer('fiscal.date_creation', '2026-01-01'); // démonstration : entreprise déjà en activité
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
  await pc.page.waitForSelector('#tuiles-accueil .tuile');
  await pc.page.waitForSelector('#carte-echeances li');
  assert.ok(!(await pc.page.$('#carte-ca')), 'CA déplacé dans Finances');
  await pc.page.screenshot({ path: path.join(sortie, 'pc-accueil.png'), fullPage: true });

  await pc.page.click('a.lien-parametres');
  await pc.page.waitForSelector('.sous-nav a[href="#parametres/socle"]');
  await pc.page.click('.sous-nav a[href="#parametres/socle"]');
  await pc.page.waitForSelector('#carte-etat dl');
  await pc.page.click('.sous-nav a[href="#parametres/affaires"]');
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
  await p.waitForSelector('.colonne[data-statut="Clôturées"] .carte-affaire[data-id="KI-2026-001"]');
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
  await p.click('tr[data-ouvrir="KI-2026-001"]');
  await p.waitForSelector('.fiche-tete');
  // Affaire perdue : la fiche s'ouvre sur Appel d'offres › Résultat
  await p.waitForSelector('[data-sous="resultat"][aria-selected="true"]');
  await p.screenshot({ path: path.join(sortie, 'pc-fiche-mouthe-resultat.png'), fullPage: true });
  // Étapes de l'appel d'offres : Consultation et Offre faites, Résultat sélectionné ; blocs en lecture
  assert.strictEqual(await p.locator('.etape-ao--faite').count(), 3);
  assert.ok(await p.$('[data-bloc-lect="resultat"] dl.lect'));
  assert.ok(await p.$('form[data-bloc="resultat"][hidden]'));
  await p.click('[data-tiroir="journal"]');
  await p.waitForSelector('#tiroir-journal:not([hidden])');
  await p.screenshot({ path: path.join(sortie, 'pc-fiche-mouthe-journal.png') });
  await p.click('#tiroir-journal [data-fermer-tiroir]');
  // Étape Offre : Chiffrage et Dépôt en lecture, « Modifier » ouvre le formulaire avec ses aides
  await p.click('[data-sous="offre"]');
  await p.waitForSelector('[data-sous="offre"][aria-selected="true"]');
  await p.click('[data-modifier="offre"]');
  await p.waitForSelector('form[data-bloc="offre"]:not([hidden])');
  await p.screenshot({ path: path.join(sortie, 'pc-fiche-aides-offre.png'), fullPage: true });
  await p.click('form[data-bloc="offre"] [data-annuler-bloc]');
  await p.waitForSelector('form[data-bloc="offre"][hidden]', { state: 'attached' });
  // Volet Mission en aperçu (affaire non gagnée)
  await p.click('[data-volet="mission"]');
  await p.waitForSelector('[data-sous="marche"][aria-selected="true"]');
  await p.click('[data-volet="ao"]');
  await p.waitForSelector('[data-sous="resultat"][aria-selected="true"]');
  // Documents : panneau latéral, dépôt de deux fichiers dans le dossier proposé (« 06 Résultat » sur l'étape Résultat)
  await p.click('[data-tiroir="docs"]');
  await p.waitForSelector('#tiroir-docs:not([hidden]) [data-depot]');
  assert.strictEqual(await p.inputValue('#tiroir-docs [data-dossier]'), '06 Résultat');
  await p.setInputFiles('#piece-fichiers-tous', [
    { name: 'Rapport de programmation.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(184000, 1) },
    { name: 'Notes de visite.docx', mimeType: 'application/octet-stream', buffer: Buffer.alloc(23000, 1) }
  ]);
  await p.waitForSelector('#tiroir-docs .pieces__liste li >> text=Notes de visite.docx');
  await p.screenshot({ path: path.join(sortie, 'pc-fiche-pieces.png') });
  await p.click('#tiroir-docs [data-fermer-tiroir]');
  // Nouvelle affaire → fiche → No-go avec motif obligatoire
  await p.click('a[href="#affaires"]');
  await p.click('[data-action="nouvelle"]');
  await p.fill('#n-acheteur', 'Commune de Briançon');
  await p.fill('#n-objet', 'Étude préalable — patinoire');
  await p.fill('#n-departement', '05');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('.fiche-tete h1:has-text("Commune de Briançon")');
  await p.click('.menu-statut > summary');
  await p.click('[data-passer="No-go"]');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('.dialogue__erreur:not([hidden])'); // motif manquant
  await p.selectOption('#p-motif_decision', 'charge');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('.fiche-tete .statut:has-text("No-go")');
  // Bloc Offre : enregistrement
  await p.click('[data-sous="offre"]');
  await p.click('[data-modifier="offre"]');
  await p.fill('#offre-prix_jour', '600');
  await p.click('form[data-bloc="offre"] button[type=submit]');
  await p.waitForSelector('[data-bloc-lect="offre"] dd:has-text("600")');
  const nouvelle = A.Affaires_lister().filter((x) => x.acheteur === 'Commune de Briançon')[0];
  assert.strictEqual(nouvelle.prix_jour, 600);
  assert.strictEqual(nouvelle.departement, '05');

  // Go → Déposée depuis la fiche, puis note au journal
  await p.click('a[href="#affaires"]');
  await p.click(`[data-ouvrir="${g1}"]`);
  await p.waitForSelector('.fiche-tete');
  // Affaire en Go : la fiche s'ouvre sur Appel d'offres › Offre ; liste type des pièces, une pièce prête
  await p.waitForSelector('[data-sous="offre"][aria-selected="true"]');
  await p.click('[data-liste-type]');
  await p.waitForSelector('#pieces-offre tr[data-piece]');
  assert.strictEqual(await p.locator('#pieces-offre tr[data-piece]').count(), 7);
  // Collage de la liste du DCE : seules les pièces absentes sont ajoutées
  await p.click('[data-coller-liste]');
  await p.fill('#coller-liste', 'Offre :\n- Mémoire technique\n- Planning prévisionnel\nCandidature : Certificat de visite');
  await p.screenshot({ path: path.join(sortie, 'pc-fiche-coller-liste.png') });
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('#toast:has-text("2 pièces ajoutées (1 déjà listée)")');
  assert.strictEqual(await p.locator('#pieces-offre tr[data-piece]').count(), 9);
  await p.locator('#pieces-offre tr[data-piece]').nth(5).locator('select').selectOption('prête');
  await p.waitForSelector('.synthese:has-text("1 sur 9 prêtes")');
  // Montant HT calculé : jours par tranche × prix par jour
  await p.click('[data-modifier="offre"]');
  await p.fill('form[data-bloc="offre"] [data-champ="jours_par_tranche"]', 'TF : 50 j\nTO1 : 60 j');
  await p.fill('form[data-bloc="offre"] [data-champ="prix_jour"]', '400');
  assert.strictEqual(await p.inputValue('form[data-bloc="offre"] [data-champ="montant_ht"]'), '44000');
  assert.match(await p.textContent('.calcul-offre'), /110 j × 400\s€ HT = 44\s000\s€ HT/);
  await p.locator('form[data-bloc="offre"]').screenshot({ path: path.join(sortie, 'pc-offre-montant.png') });
  await p.click('form[data-bloc="offre"] button[type=submit]');
  await p.waitForSelector('#toast:has-text("enregistré")');
  assert.strictEqual(A.Affaires_get_(g1).montant_ht, 44000);
  await p.waitForSelector('[data-bloc-lect="offre"] .calcul-lecture');
  await p.screenshot({ path: path.join(sortie, 'pc-fiche-offre-pieces.png'), fullPage: true });
  // Bloc Dépôt séparé du Chiffrage ; plus de champ « Encaissements prévus par année »
  assert.ok(await p.$('form[data-bloc="depot"] [data-champ="date_depot"]'));
  assert.ok(!(await p.$('[data-champ="repartition_ca"]')));
  assert.match(await p.textContent('.calcul-lecture'), /TF 20\s000\s€ · TO1 24\s000\s€ \(optionnelle\)/);
  // Recherche rapide (Ctrl+K)
  await p.keyboard.press('Control+k');
  await p.keyboard.type('manosque');
  await p.waitForSelector('#recherche-liste li[data-id]');
  await p.screenshot({ path: path.join(sortie, 'pc-recherche.png') });
  await p.keyboard.press('Escape');
  // Finances › Prévisionnel (l'ancienne adresse #previsionnel y mène)
  await p.evaluate(() => window.KA.afficher('previsionnel', true));
  await p.waitForSelector('.table-previsionnel');
  assert.match(await p.textContent('.table-previsionnel'), /CA certain/);
  await p.screenshot({ path: path.join(sortie, 'pc-previsionnel.png'), fullPage: true });
  await p.evaluate((id) => window.KA.afficher('affaire/' + id, true), g1);
  await p.waitForSelector('[data-passer="Déposée"]');
  assert.match(await p.textContent('[data-passer="Déposée"]'), /Déposer l'offre/);
  await p.click('[data-passer="Déposée"]');
  await p.fill('#p-montant_ht', '21000');
  await p.fill('#p-jours_reponse', '3');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('.fiche-tete .statut:has-text("Déposée")');
  await p.click('[data-tiroir="journal"]');
  await p.fill('#note-texte', 'Offre déposée sur la plateforme.');
  await p.click('form[data-note] button[type=submit]');
  await p.waitForSelector('.notes:has-text("Offre déposée sur la plateforme.")');

  // Affaire déposée : « Saisir le résultat » propose Gagnée, Perdue ou Sans suite
  await p.click('#tiroir-journal [data-fermer-tiroir]');
  await p.click('[data-resultat]');
  await p.waitForSelector('dialog.dialogue[open] input[name=cloture][value="Gagnée"]');
  await p.click('dialog.dialogue [data-annuler]');

  // Affaire gagnée : la fiche s'ouvre sur Mission › Planning
  await p.click('a[href="#affaires"]');
  await p.click('[data-vue="liste"]');
  await p.click(`[data-ouvrir="${w1}"]`);
  await p.waitForSelector('[data-sous="planning"][aria-selected="true"]');
  await p.click('.tranche-carte [data-ajout-livrable]');
  await p.fill('#al-libelle', 'Rapport de faisabilité');
  await p.fill('#al-date_echeance', '2026-12-04');
  await p.fill('#al-tranche', 'TF');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('#planning-mission li[data-livrable]');
  await p.click('.tranche-carte [data-ajout-livrable]');
  await p.fill('#al-libelle', 'Note de présentation aux élus');
  await p.fill('#al-tranche', 'TF');
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForFunction(() => document.querySelectorAll('#planning-mission li[data-livrable]').length === 2);
  await p.waitForSelector('.synthese:has-text("Remettre : Rapport de faisabilité")');
  await p.waitForSelector('#planning-mission .frise-piste');
  await p.screenshot({ path: path.join(sortie, 'pc-fiche-mission-planning.png'), fullPage: true });
  // Tranches : T2 déclarée optionnelle depuis Mission › Marché, TO1 affermie ; une seule frise pour toutes les tranches
  A.Affaires_maj(w1, { jours_par_tranche: 'TF : 10 j\nTO1 : 30 j\nT2 : 10 j' });
  A.Livrables_ajouter(w1, { tranche: 'TO1', libelle: 'Programme', date_echeance: '2027-04-15' });
  await p.evaluate((id) => { window.KA.viderMemoire(); window.KA.afficher('affaire/' + id, true); }, w1);
  await p.waitForSelector('.fiche-tete');
  await p.click('[data-sous="marche"]');
  await p.waitForSelector('#tranches [data-nature]');
  await p.locator('#tranches tr', { hasText: 'T2' }).locator('[data-nature]').selectOption('optionnelle');
  await p.waitForSelector('#toast:has-text("T2 : optionnelle")');
  assert.match(A.Affaires_get_(w1).tranches_etat, /T2:optionnelle/);
  await p.screenshot({ path: path.join(sortie, 'pc-fiche-mission-marche.png'), fullPage: true });
  await p.locator('#tranches tr', { hasText: 'TO1' }).locator('[data-plan-affermir]').click();
  await p.click('dialog.dialogue button[type=submit]');
  await p.waitForSelector('#toast:has-text("affermie")');
  assert.match(A.Affaires_get_(w1).tranches_etat, /TO1:affermie:/);
  await p.click('[data-sous="planning"]');
  await p.waitForSelector('#planning-mission .tranche-carte');
  assert.strictEqual(await p.locator('#planning-mission .frise-piste').count(), 1, 'une seule frise pour toutes les tranches');
  assert.strictEqual(await p.locator('#planning-mission .tranche-carte[data-tranche]').count(), 3);
  await p.screenshot({ path: path.join(sortie, 'pc-planning-options.png'), fullPage: true });

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

  // ——— Bilan : tableau de bord complet et enseignements ———
  await p.click('nav a[href="#bilan"]');
  await p.waitForSelector('#tableau-de-bord .tuile');
  const tauxGo = await p.locator('.tuile', { hasText: 'Taux de Go' }).locator('.tuile__valeur').textContent();
  assert.match(tauxGo, /%$/);
  await p.waitForSelector('.table-enseignements tbody tr');
  await p.screenshot({ path: path.join(sortie, 'pc-bilan.png'), fullPage: true });

  // ——— Finances : vue d'ensemble, encaissements (une ligne de temps), URSSAF et CFE ———
  await p.click('nav a[href="#finances"]');
  await p.waitForSelector('#carte-ca table');
  await p.screenshot({ path: path.join(sortie, 'pc-finances.png'), fullPage: true });
  await p.click('.sous-nav a[href="#finances/encaissements"]');
  await p.waitForSelector('.frise .frise-piste');
  await p.screenshot({ path: path.join(sortie, 'pc-finances-encaissements.png'), fullPage: true });
  // ——— Livre des recettes ———
  await p.click('.sous-nav a[href="#finances/livre"]');
  await p.waitForSelector('#livre-annee');
  await p.screenshot({ path: path.join(sortie, 'pc-livre-recettes.png'), fullPage: true });
  await p.click('.sous-nav a[href="#finances/encaissements"]');
  await p.waitForSelector('.frise .frise-piste');
  // ——— Qonto : connexion (Paramètres › Finances), synchronisation et rattachement (Finances › Encaissements) ———
  qontoFactures.push(
    { id: 'q1', number: 'F-2026-10', purchase_order: w1 + ' TO1', status: 'paid', issue_date: '2026-11-02', due_date: '2026-12-02', paid_at: '2026-11-18T09:00:00Z',
      total_amount: { value: '9600.00' }, vat_amount: { value: '0.00' }, amount_paid: { value: '9600.00' }, invoice_url: 'https://app.qonto.com/invoices/q1' },
    { id: 'q2', number: 'F-2026-11', status: 'unpaid', issue_date: '2026-11-15', due_date: '2026-12-15', total_amount: { value: '1200.00' }, vat_amount: { value: '0.00' } });
  await p.evaluate(() => window.KA.afficher('parametres/finances', true));
  await p.waitForSelector('#bloc-qonto [data-qonto-form]');
  await p.fill('#q-login', 'kompa-demo');
  await p.fill('#q-secret', 'faux');
  await p.click('#bloc-qonto button[type=submit]');
  await p.waitForSelector('#toast:has-text("refuse la clé")');
  await p.fill('#q-secret', 'secret');
  await p.click('#bloc-qonto button[type=submit]');
  await p.waitForSelector('#bloc-qonto .statut--ok');
  await p.locator('#bloc-qonto').screenshot({ path: path.join(sortie, 'pc-parametres-qonto.png') });
  await p.evaluate(() => window.KA.afficher('finances/encaissements', true));
  await p.waitForSelector('[data-qonto-synchro]');
  await p.click('[data-qonto-synchro]');
  await p.waitForSelector('#toast:has-text("facture(s) lue(s) dans Qonto")');
  await p.waitForSelector('[data-rattacher]');
  assert.strictEqual(A.Db_lire(A.TABLES.FACTURES).find((f) => f.numero === 'F-2026-10').tranche, 'TO1');
  await p.screenshot({ path: path.join(sortie, 'pc-finances-qonto.png'), fullPage: true });
  await p.selectOption('[data-rattacher] [data-ratt-affaire]', w1);
  await p.click('[data-rattacher] [data-ratt-ok]');
  await p.waitForSelector('#toast:has-text("Facture rattachée")');
  assert.strictEqual(A.Db_lire(A.TABLES.FACTURES).find((f) => f.numero === 'F-2026-11').id_affaire, w1);
  await p.click('.sous-nav a[href="#finances/urssaf"]');
  await p.waitForSelector('#carte-urssaf table');
  const nbDeclarer = await p.locator('[data-declarer]').count();
  assert.ok(nbDeclarer >= 1, 'aucune période à déclarer');
  await p.locator('#carte-urssaf').screenshot({ path: path.join(sortie, 'pc-urssaf.png') });
  await p.click('[data-declarer]');
  await p.waitForSelector('dialog #d-ca');
  await p.click('dialog button[type=submit]');
  await p.waitForFunction((n) => document.querySelectorAll('[data-declarer]').length === n - 1, nbDeclarer);
  assert.strictEqual(A.Db_lire(A.TABLES.DECLARATIONS).length, 1);
  // CFE : réglages depuis la carte URSSAF
  await p.fill('#cfe-montant', '400');
  await p.click('[data-cfe-reglages] button[type=submit]');
  await p.waitForSelector('#toast:has-text("CFE enregistrée")');
  assert.strictEqual(A.Params_texte('fiscal.cfe_montant'), '400');
  await p.locator('#carte-urssaf').screenshot({ path: path.join(sortie, 'pc-urssaf-cfe.png') });

  // ——— Module Estimation (étape 1) : référentiels modifiables ———
  await p.click('nav a[href="#estimation"]');
  await p.waitForSelector('.vide-etat');
  await p.click('.sous-nav a[href="#estimation/referentiels"]');
  await p.waitForSelector('#ref-LOTS tr[data-cle="ELE"]');
  await p.fill('#ref-K tr[data-ajout] [data-col="facteur"]', 'Localisation');
  await p.fill('#ref-K tr[data-ajout] [data-col="modalite"]', 'Zone de montagne');
  await p.fill('#ref-K tr[data-ajout] [data-col="coefficient"]', '1,08');
  await p.click('#ref-K tr[data-ajout] [data-ajouter]');
  await p.waitForSelector('#ref-K tr[data-cle]');
  assert.strictEqual(A.Db_lire(A.EST_TABLES.K).find((l) => l.modalite === 'Zone de montagne').coefficient, 1.08);
  await p.screenshot({ path: path.join(sortie, 'pc-estimation-referentiels.png'), fullPage: true });

  // ——— Module Estimation (étape 2) : index Insee ———
  await p.click('.sous-nav a[href="#estimation/indices"]');
  await p.waitForSelector('[data-maj-indices]');
  await p.click('[data-maj-indices]');
  await p.waitForSelector('[data-historique="BT50"]');
  await p.click('[data-historique="BT50"]');
  await p.waitForSelector('.historique-index');
  await p.screenshot({ path: path.join(sortie, 'pc-estimation-indices.png'), fullPage: true });
  // Calculette d'actualisation (étape 3)
  await p.fill('#c-pu', '100');
  await p.fill('#c-m0', '03/2024');
  await p.fill('#c-lot', 'ELE');
  await p.click('[data-calculette] button[type=submit]');
  await p.waitForSelector('[data-resultat-calcul] .bandeau');
  assert.match(await p.textContent('[data-resultat-calcul]'), /BT47 09\/2026/);
  await p.locator('#calculette').screenshot({ path: path.join(sortie, 'pc-estimation-calculette.png') });

  // ——— Module Estimation (étape 4) : bibliothèque — import des postes d'un marché attribué ———
  await p.click('.sous-nav a[href="#estimation/bibliotheque"]');
  await p.waitForSelector('#i-texte');
  await p.selectOption('#i-typo', 'MIL');
  await p.selectOption('#i-nature', 'Réhabilitation lourde');
  await p.fill('#i-dep', '2B');
  await p.fill('#i-m0', '05/2026');
  await p.fill('#i-surface', '790');
  await p.fill('#i-texte', ['Dispositions générales\t66 261 €', 'Gros œuvre\t902 319 €', 'Plâtrerie\t36 962 €', 'Électricité\t262 714,34 €',
    'Cahier des charges DANZ\t22 294,59 €', 'Plomberie\t73 672,50 €', 'Génie climatique\t41 422,50 €', 'Bardage - couverture (atelier)\t466 760 €',
    'Portes de hangar\t248 860 €', 'Total\t2 121 266 €'].join('\n'));
  await p.click('[data-import] button[type=submit]');
  await p.waitForSelector('tr[data-poste]');
  assert.strictEqual(await p.locator('tr[data-poste]').count(), 9);
  await p.locator('tr[data-poste]').nth(4).locator('[data-p="lot"]').selectOption('ELE'); // DANZ : lot non reconnu
  await p.screenshot({ path: path.join(sortie, 'pc-estimation-import.png'), fullPage: true });
  await p.click('[data-enregistrer-import]');
  await p.waitForSelector('[data-imports] tr[data-import]');
  await p.waitForSelector('[data-ratios] .table-ratios');
  assert.match(await p.textContent('[data-ratios]'), /Gros œuvre/);
  assert.strictEqual(A.Db_lire(A.EST_TABLES.OBSERVATIONS).length, 8);
  await p.screenshot({ path: path.join(sortie, 'pc-estimation-bibliotheque.png'), fullPage: true });

  // ——— Chiffrage rapide : la surface suffit pour avoir le montant de chaque lot ———
  await p.click('.sous-nav a[href="#estimation"]');
  await p.waitForSelector('[data-rapide-form] #r-surface');
  await p.selectOption('#r-typo', 'MIL');
  await p.selectOption('#r-nature', 'Réhabilitation lourde');
  await p.fill('#r-dep', '04');
  await p.fill('#r-surface', '500');
  await p.waitForSelector('[data-rapide-resultat] .table-est');
  assert.match(await p.textContent('[data-rapide-resultat]'), /Gros œuvre/);
  await p.locator('[data-rapide]').screenshot({ path: path.join(sortie, 'pc-estimation-rapide.png') });
  await p.click('[data-rapide-garder]');
  await p.waitForSelector('[data-assistant]');
  assert.strictEqual(await p.inputValue('#e-surface'), '500');
  await p.waitForSelector('.lot-est__montant:not(:empty)');
  assert.match(await p.textContent('[data-total-lots]'), /Total des lots cochés/);

  // ——— Étape 5 : nouvelle estimation au ratio ———
  await p.click('.sous-nav a[href="#estimation"]');
  await p.click('a[href="#estimation/nouvelle"]');
  await p.waitForSelector('[data-assistant]');
  await p.selectOption('#e-affaire', w1);
  await p.selectOption('#e-typo', 'MIL');
  await p.selectOption('#e-nature', 'Réhabilitation lourde');
  await p.waitForSelector('.lots-est input[value="GO"]:checked');
  assert.strictEqual(await p.inputValue('#e-dep'), '04');
  await p.fill('#e-surface', '500');
  await p.fill('#e-travaux', '06/2027');
  await p.click('[data-apercu]');
  await p.waitForSelector('[data-resultat-apercu] .table-est');
  await p.screenshot({ path: path.join(sortie, 'pc-estimation-assistant.png'), fullPage: true });
  await p.click('[data-assistant] button[type=submit]');
  await p.waitForSelector('.tete-est');
  const est = A.Db_lire(A.EST_TABLES.ESTIMATIONS)[0];
  assert.deepStrictEqual([est.id_affaire, est.indice, est.statut, est.departement], [w1, 'A', 'brouillon', '04']);
  await p.fill('tr[data-ligne] [data-pu] >> nth=0', '180');
  await p.press('tr[data-ligne] [data-pu] >> nth=0', 'Tab');
  await p.waitForSelector('#toast:has-text("PU enregistré")');
  // Surface modifiable sur un brouillon : quantités au m² et totaux recalculés
  await p.fill('[data-surface-est]', '600');
  await p.press('[data-surface-est]', 'Tab');
  await p.waitForSelector('#toast:has-text("Surface enregistrée")');
  assert.strictEqual(A.Db_lire(A.EST_TABLES.ESTIMATIONS)[0].surface_sdp, 600);
  assert.strictEqual(A.Db_lire(A.EST_TABLES.LIGNES).find((l) => l.num_article === '01').total_ht, 108000);
  assert.strictEqual(A.Db_lire(A.EST_TABLES.LIGNES).find((l) => l.num_article === '01').pu_ht, 180);
  // ——— Étape 6 : export .xlsx vers « 09 Estimations » ———
  await p.click('[data-exporter]');
  await p.waitForSelector('#toast:has-text("Fichier déposé")');
  assert.ok(env.fichiersDrive.some((x) => x.nom === w1 + ' — Estimation APS — ind A.xlsx' && x.dossier.getName() === '09 Estimations'));
  await p.screenshot({ path: path.join(sortie, 'pc-estimation-resultat.png'), fullPage: true });

  // Petit portable (1280 px) : pas de débordement de la page
  await p.setViewportSize({ width: 1280, height: 800 });
  for (const ecran of ['#accueil', '#veille', '#affaires', '#echeancier', '#finances', '#bilan']) {
    await p.click(`nav a[href="${ecran}"]`);
    await p.waitForTimeout(300);
    const deborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.ok(!deborde, 'débordement horizontal à 1280 px : ' + ecran);
  }

  // Smartphone : vue dédiée (tableau de bord seul), sans défilement horizontal, à 360, 390 et 430 px
  for (const largeur of [360, 390, 430]) {
    const tel = await ouvrir({ viewport: { width: largeur, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const tp = tel.page;
    await tp.waitForSelector('.mob-tuiles');
    await tp.waitForSelector('#mob-ca .mob-liste li');
    assert.ok(await tp.evaluate(() => document.body.classList.contains('mode-mobile')), 'vue smartphone activée');
    assert.ok(await tp.locator('.nav').isHidden(), 'menu masqué en vue smartphone');
    assert.strictEqual(await tp.locator('#ecran table').count(), 0, 'aucun tableau en vue smartphone');
    const deborde = await tp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(deborde <= 0, `vue smartphone ${largeur} px : débordement horizontal de ${deborde} px`);
    const horsCadre = await tp.evaluate(() => Array.from(document.querySelectorAll('.mob *')).filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5).map((e) => e.className || e.tagName).slice(0, 5));
    assert.deepStrictEqual(horsCadre, [], `éléments hors écran à ${largeur} px`);
    if (largeur === 390) {
      await tp.screenshot({ path: path.join(sortie, 'tel-accueil.png'), fullPage: true });
      await tp.click('.mob-plus summary >> nth=0');
      assert.ok(await tp.locator('.mob-plus[open]').count() === 1);
      // Version ordinateur, puis retour à la vue smartphone
      await tp.click('[data-vue-ordinateur]');
      await tp.waitForSelector('#tuiles-accueil .tuile');
      assert.ok(await tp.evaluate(() => document.body.scrollWidth >= 1024), 'version ordinateur : mise en page 1024 px');
      await tp.locator('[data-vue-mobile]').dispatchEvent('click'); // page dézoomée : clic direct
      await tp.waitForSelector('.mob-tuiles');
      assert.ok(await tp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'retour à la vue smartphone');
    }
    assert.deepStrictEqual(tel.erreurs, [], 'erreurs JavaScript au téléphone : ' + tel.erreurs.join(' | '));
  }

  // ——— Thème « Néon Sunset » : choix dans Paramètres › Apparence, mémorisé, appliqué à tous les écrans ———
  {
    const n = await ouvrir({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
    const np = n.page;
    await np.waitForSelector('#tuiles-accueil .tuile');
    await np.click('a.lien-parametres');
    await np.click('.sous-nav a[href="#parametres/apparence"]');
    await np.waitForSelector('#apparence [data-theme-choix][value="neon"]');
    await np.check('#apparence [data-theme-choix][value="neon"]');
    assert.strictEqual(await np.evaluate(() => document.documentElement.getAttribute('data-theme')), 'neon');
    assert.strictEqual(await np.evaluate(() => localStorage.getItem('ka.theme')), 'neon');
    for (const [ecran, attente] of [['#accueil', '#tuiles-accueil .tuile'], ['#finances', '#carte-ca table'], ['#veille', 'table'], ['#affaires', '.fiche-tete, table, .kanban, [data-ouvrir]'], ['#echeancier', 'table, .calendrier, .cal'], ['#estimation', '.sous-nav']]) {
      await np.click(`nav a[href="${ecran}"]`);
      await np.waitForSelector(attente);
      await np.waitForTimeout(300);
      await np.screenshot({ path: path.join(sortie, 'neon-' + ecran.slice(1) + '.png'), fullPage: ecran === '#accueil' });
    }
    await np.click('nav a[href="#affaires"]');
    await np.click('[data-vue="liste"]');
    await np.click(`[data-ouvrir="${w1}"]`);
    await np.waitForSelector('.fiche-tete');
    await np.screenshot({ path: path.join(sortie, 'neon-fiche.png') });
    // Retour à la charte Kompa
    await np.evaluate(() => window.KA.afficher('parametres/apparence', true));
    await np.waitForSelector('#apparence [data-theme-choix][value="kompa"]');
    await np.check('#apparence [data-theme-choix][value="kompa"]');
    assert.strictEqual(await np.evaluate(() => document.documentElement.getAttribute('data-theme')), null);
    assert.deepStrictEqual(n.erreurs, [], 'erreurs JavaScript (thème) : ' + n.erreurs.join(' | '));
    // Téléphone : thème mémorisé, bascule depuis le pied de la vue smartphone
    const t = await ouvrir({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await t.page.waitForSelector('.mob-tuiles');
    await t.page.click('[data-theme-mobile]');
    assert.strictEqual(await t.page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'neon');
    await t.page.screenshot({ path: path.join(sortie, 'neon-tel.png'), fullPage: true });
    assert.ok(await t.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'thème néon : pas de débordement au téléphone');
  }

  await navigateur.close();
  const erreurs = pc.erreurs;
  assert.deepStrictEqual(erreurs, [], 'erreurs JavaScript : ' + erreurs.join(' | '));
  console.log('Aperçu OK — captures dans ' + sortie);
})().catch((e) => { console.error(e); process.exit(1); });
