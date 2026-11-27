/**
 * Tests du lot 1 (socle) sous Node : node tools/test-socle.js
 * Exécute le vrai code de src/ sur une simulation des services Google.
 */
'use strict';

const assert = require('assert');
const { creerEnvironnement } = require('./gas-mock');

const journal = console.log;
const tests = [];
const test = (nom, fn) => tests.push({ nom, fn });
// Les objets créés dans le contexte vm n'ont pas les mêmes prototypes : on compare des copies JSON.
const brut = (x) => JSON.parse(JSON.stringify(x));

test('installer() crée le classeur, les 11 onglets et supprime la feuille par défaut', () => {
  const env = creerEnvironnement();
  const rapport = env.ctx.installer({ exercice: false });
  const ss = Object.values(env.classeurs)[0];
  assert.strictEqual(ss.getName(), 'Kartes Affaires — données');
  const noms = ss.getSheets().map((f) => f.getName());
  assert.deepStrictEqual(noms, ['Avis', 'Affaires', 'Historique', 'Pièces de l\'offre', 'Livrables', 'BPU', 'Bons de commande', 'Critères', 'Factures', 'Relances', 'Acheteurs', 'Paramètres', 'Déclarations', 'Journal moteur', 'Avis archivés']);
  assert.ok(rapport.parametresAjoutes > 40);
  assert.deepStrictEqual(brut(rapport.declencheurs), ['sauvegardeHebdo', 'collecteQuotidienne', 'envoyerEmailMatin', 'estIndicesMensuel']);
});

test('mémoire partagée des onglets : relue sans le classeur, effacée par une écriture ou une modification manuelle', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  console.log = () => {};
  A.installer({ exercice: false });
  const id = A.Affaires_creer({ acheteur: 'Commune de Lurs', objet: 'Étude', date_limite_remise: '2026-12-04' }).id;
  A.Db_viderCache_();
  const lu = A.Db_lire(A.TABLES.AFFAIRES); // lecture du classeur, mise en mémoire
  assert.ok(Object.keys(env.cache._valeurs).some((k) => /Affaires/.test(k)));
  // Nouvel appel : la mémoire suffit, le classeur n'est pas ouvert ; les dates restent des dates
  A.Db_viderCache_();
  const ouvrir = A.SpreadsheetApp.openById;
  let ouvertures = 0;
  A.SpreadsheetApp.openById = (x) => { ouvertures++; return ouvrir(x); };
  A.Db_cache_.classeurs = {};
  const relu = A.Db_lire(A.TABLES.AFFAIRES);
  assert.strictEqual(ouvertures, 0);
  assert.strictEqual(Object.prototype.toString.call(relu[0].date_limite_remise), '[object Date]');
  assert.strictEqual(relu[0].date_limite_remise.getTime(), lu[0].date_limite_remise.getTime());
  A.SpreadsheetApp.openById = ouvrir;
  // Écriture par l'app : la mémoire de l'onglet est effacée, l'appel suivant relit la valeur à jour
  A.Affaires_maj(id, { objet: 'Étude modifiée' });
  A.Db_viderCache_();
  assert.strictEqual(A.Affaires_get_(id).objet, 'Étude modifiée');
  // Modification à la main dans le classeur : la date du classeur change, la mémoire est ignorée
  A.Db_viderCache_();
  const ss = Object.values(env.classeurs).find((x) => x.getSheetByName('Affaires'));
  const f = ss.getSheetByName('Affaires');
  const col = f.lignes[0].indexOf('objet');
  f.getRange(2, col + 1).setValues([['Saisie manuelle']]);
  A.Db_viderCache_();
  assert.strictEqual(A.Affaires_get_(id).objet, 'Saisie manuelle');
  // Appels simultanés, date Drive figée (mise à jour en retard) : un appel A lit l'affaire, un appel B la modifie,
  // puis A garde sa lecture en mémoire après coup → elle doit être ignorée (génération changée par B).
  A.DriveApp.getFileById = () => ({ getLastUpdated: () => new Date(1e12) });
  A.Db_viderCache_();
  const lectureA = A.Db_lire(A.TABLES.AFFAIRES); // A : lecture (ancienne valeur)
  const versionsA = Object.assign({}, A.Db_cache_.versions);
  A.Db_viderCache_();
  A.Affaires_maj(id, { objet: 'Changé par B' }); // B : écriture
  A.Db_viderCache_();
  Object.assign(A.Db_cache_.versions, versionsA); // A, toujours en cours, garde sa lecture
  A.Db_ecrireMemoire_(A.TABLES.AFFAIRES, lectureA);
  A.Db_viderCache_();
  assert.strictEqual(A.Affaires_get_(id).objet, 'Changé par B');
  A.Db_viderCache_();
  assert.strictEqual(A.Affaires_get_(id).objet, 'Changé par B'); // relu depuis la mémoire, à jour
  console.log = journal;
});

test('classeur pas à jour : alerte sur l\'accueil et erreur explicite au lieu d\'une saisie perdue', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  console.log = () => {};
  A.installer({ exercice: false });
  console.log = journal;
  const id = A.Affaires_creer({ acheteur: 'Ville de Marseille', objet: 'AMO' }).id;
  A.Affaires_maj(id, { jours_par_tranche: 'T1 : 20 j\nT2 : 30 j', prix_jour: 400 });
  assert.deepStrictEqual(brut(A.Etat_alertes_()), []);
  // Colonne « tranches_etat » absente (installer() pas relancé après la mise à jour)
  const ss = Object.values(env.classeurs).find((x) => x.getSheetByName('Affaires'));
  const f = ss.getSheetByName('Affaires');
  f.lignes[0][f.lignes[0].indexOf('tranches_etat')] = 'ancienne_colonne';
  A.Db_viderCache_();
  env.cache._valeurs = {};
  assert.throws(() => A.Planning_affermir(id, 'T2', 'optionnelle', ''), /tranches_etat.*installer\(\)/);
  const alertes = brut(A.Etat_alertes_());
  assert.strictEqual(alertes.length, 1);
  assert.match(alertes[0], /Affaires › tranches_etat.*installer/);
  // Après installer() : la colonne revient, la tranche T2 reste optionnelle
  console.log = () => {};
  A.installer({ exercice: false });
  console.log = journal;
  A.Db_viderCache_();
  A.Planning_affermir(id, 'T2', 'optionnelle', '');
  A.Db_viderCache_();
  const t2 = A.Planning_affaire(id).lignes.find((l) => l.tranche === 'T2');
  assert.deepStrictEqual([t2.optionnelle, t2.affermissement], [true, 'optionnelle']);
});

test('mise à jour automatique du classeur : ajouts seulement, une fois par version, signalée sur l\'accueil', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  console.log = () => {};
  A.installer({ exercice: false });
  console.log = journal;
  // Juste après installer() : rien à faire
  assert.strictEqual(A.MiseAJour_verifier_(), null);
  const id = A.Affaires_creer({ acheteur: 'Ville de Marseille', objet: 'AMO' }).id;
  A.Affaires_maj(id, { objet: 'Ne pas toucher', prix_jour: 400 });
  // Code mis à jour : colonne et paramètre ajoutés au schéma, déclencheur de la collecte supprimé à la main
  const ss = Object.values(env.classeurs).find((x) => x.getSheetByName('Affaires'));
  const f = ss.getSheetByName('Affaires');
  const avant = f.lignes.map((l) => l.slice());
  A.TABLES.AFFAIRES.colonnes.push('nouvelle_colonne');
  A.PARAMETRES_DEFAUT.push(['test.nouveau', '12', 'Paramètre ajouté par la nouvelle version']);
  A.Params_enregistrer('capacite.montant_max_mission', '55555'); // valeur saisie, à conserver
  const t = A.ScriptApp.getProjectTriggers().find((x) => x.getHandlerFunction() === 'collecteQuotidienne');
  A.ScriptApp.deleteTrigger(t);
  const nbDecl = A.ScriptApp.getProjectTriggers().length;
  const r = brut(A.MiseAJour_verifier_());
  assert.ok(r.changements.some((c) => /Affaires : colonne nouvelle_colonne ajoutée/.test(c)), r.changements.join(' | '));
  assert.ok(r.changements.some((c) => /1 paramètre ajouté/.test(c)));
  assert.ok(r.changements.some((c) => /collecteQuotidienne recréé/.test(c)));
  assert.strictEqual(A.ScriptApp.getProjectTriggers().length, nbDecl + 1); // les autres déclencheurs ne sont pas touchés
  // Aucune donnée déplacée ni modifiée : anciennes colonnes identiques, nouvelle colonne en fin
  avant.forEach((ligne, i) => ligne.forEach((v, j) => { if (j < avant[0].length) assert.deepStrictEqual(f.lignes[i][j], v); }));
  assert.strictEqual(f.lignes[0][avant[0].length], 'nouvelle_colonne');
  A.Db_viderCache_(); A.Params_cache_ = null;
  assert.strictEqual(A.Affaires_get_(id).objet, 'Ne pas toucher');
  assert.strictEqual(A.Params_texte('capacite.montant_max_mission'), '55555');
  assert.strictEqual(A.Params_texte('test.nouveau'), '12');
  // Une seule fois par version ; signalée sur l'accueil et notée au journal
  assert.strictEqual(A.MiseAJour_verifier_(), null);
  assert.match(A.MiseAJour_dernier_().changements.join(' '), /nouvelle_colonne/);
  assert.ok(A.Db_lire(A.TABLES.JOURNAL_MOTEUR).some((l) => l.source === 'Mise à jour automatique' && /nouvelle_colonne/.test(l.erreurs)));
  assert.ok(brut(A.Etat_leger_()).majAuto);
});

test('veille apprenante : avis ignorés et No-go font baisser, affaires étudiées font monter le pré-score', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  console.log = () => {};
  A.installer({ exercice: false });
  console.log = journal;
  const avis = (objet, statut, extra) => Object.assign({ source: 'BOAMP', acheteur: 'Commune X', objet, statut, departement: '04' }, extra || {});
  // Moins de 15 décisions : pas d'apprentissage
  A.Db_insererPlusieurs(A.TABLES.AVIS, [avis('Mission d\'AMO assurance flotte automobile', 'ignoré')]);
  assert.strictEqual(A.Veille_apprentissage_().actif, false);
  const ignores = [], etudies = [];
  for (let i = 0; i < 9; i++) ignores.push(avis('AMO assurance dommages ouvrage et flotte n°' + i, 'ignoré'));
  for (let i = 0; i < 6; i++) {
    const id = A.Affaires_creer({ acheteur: 'Commune ' + i, objet: 'Étude de faisabilité et programmation école ' + i }).id;
    if (i < 5) A.Affaires_changerStatut(id, 'Go', {});
    etudies.push(avis('Étude de faisabilité et programmation école ' + i, 'étudié', { id_affaire: id }));
  }
  A.Db_insererPlusieurs(A.TABLES.AVIS, ignores.concat(etudies));
  const app = A.Veille_apprentissage_();
  assert.strictEqual(app.actif, true);
  const moins = brut(A.Veille_ajustementHistorique_('Assistance assurance construction flotte véhicules', app));
  assert.ok(moins.points < 0, JSON.stringify(moins));
  assert.ok(moins.moins.includes('assurance'));
  const plus = brut(A.Veille_ajustementHistorique_('Faisabilité et programmation d\'une école maternelle', app));
  assert.ok(plus.points > 0 && plus.points <= 10, JSON.stringify(plus));
  assert.strictEqual(A.Veille_ajustementHistorique_('Réhabilitation du gymnase', app), null); // mots inconnus : pas d'ajustement
  // Le détail du pré-score l'explique ; désactivable par paramètre
  const ctx = A.Veille_contexte_();
  const a = A.Veille_scorer_({ objet: 'AMO assurance flotte de véhicules', departement: '04', type_acheteur: 'Commune', date_limite: new Date(Date.now() + 20 * 86400000) }, ctx);
  assert.match(a.score_detail, /Historique -\d+ \(proche d'avis écartés : .*assurance/);
  // Garde-fou : un avis « possible » par ses critères de base n'est jamais archivé par l'historique
  const limite = A.Veille_scorer_({ objet: 'AMO assurance flotte de véhicules', departement: '75', type_acheteur: 'Région', date_limite: new Date(Date.now() + 5 * 86400000) }, ctx);
  assert.strictEqual(limite.classement, 'possible', limite.score_detail);
  assert.strictEqual(limite.pre_score, 40);
  assert.match(limite.score_detail, /jamais archivé par l'historique/);
  A.Params_enregistrer('veille.apprentissage', 'non');
  A.Params_cache_ = null;
  assert.strictEqual(A.Veille_apprentissage_().actif, false);
});

test('Qonto : connexion testée, factures et paiements récupérés, rattachement par n° KA, rien de supprimé', () => {
  const inv = (o) => Object.assign({ status: 'unpaid', currency: 'EUR', vat_amount: { value: '0.00' }, items: [] }, o);
  const factures = [
    inv({ id: 'q1', number: 'F-2027-001', purchase_order: 'KI-2026-002 TF', issue_date: '2027-03-01', due_date: '2027-03-31', total_amount: { value: '8000.00' },
      status: 'paid', paid_at: '2027-03-25T10:00:00Z', amount_paid: { value: '8000.00' }, invoice_url: 'https://app.qonto.com/invoices/q1' }),
    inv({ id: 'q2', number: 'F-2027-002', issue_date: '2027-04-01', due_date: '2027-05-01', total_amount: { value: '1500.00' } }), // sans n° KA
    inv({ id: 'q3', number: 'F-2027-003', header: 'Mission KI-2026-002 — TO1', issue_date: '2027-06-01', due_date: '2027-07-01', total_amount: { value: '12000.00' } }),
    inv({ id: 'q4', number: 'F-2027-004', purchase_order: 'KI-2026-002', issue_date: '2027-06-02', due_date: '2027-07-02', total_amount: { value: '100.00' }, status: 'canceled' })
  ];
  const env = creerEnvironnement({ qonto: { cle: 'kompa-1234:secret', factures } });
  const A = env.ctx;
  console.log = () => {};
  A.installer({ exercice: false });
  console.log = journal;
  A.Affaires_creer({ acheteur: 'Commune de Lurs', objet: 'AMO' });
  const id = A.Affaires_creer({ acheteur: 'Ville de Marseille', objet: 'AMO programmation' }).id;
  assert.strictEqual(id, 'KI-2026-002');
  A.Affaires_maj(id, { jours_par_tranche: 'TF : 20 j\nTO1 : 30 j', prix_jour: 400 });
  // Facture déjà saisie à la main avec le même numéro : complétée, pas dupliquée
  A.Affaires_changerStatut(id, 'Go', {}); A.Affaires_changerStatut(id, 'Déposée', { montant_ht: 20000, date_depot: '2027-01-10', jours_reponse: 2 });
  A.Affaires_changerStatut(id, 'Gagnée', { date_notification: '2027-02-01', montant_notifie: 20000 });
  A.Factures_ajouter(id, { numero: 'F-2027-003', date: '2027-06-01', montant: 12000 });
  // Sans clé : message clair ; mauvaise clé refusée et non enregistrée
  assert.throws(() => A.Qonto_synchroniser(), /Qonto n'est pas connecté/);
  assert.throws(() => A.Qonto_connecter('kompa-1234', 'faux'), /refuse la clé/);
  assert.strictEqual(A.Qonto_etat().connecte, false);
  assert.strictEqual(A.Qonto_connecter('kompa-1234', 'secret').societe, 'KOMPA INGENIERIE');
  assert.ok(!A.Db_lire(A.TABLES.PARAMETRES).some((p) => /secret/.test(String(p.valeur)))); // clé hors du classeur
  const b = brut(A.Qonto_synchroniser());
  assert.deepStrictEqual([b.lues, b.creees, b.majs, b.aRattacher], [4, 2, 1, 1]);
  assert.deepStrictEqual(b.payees, ['F-2027-001']);
  const fa = A.Db_lire(A.TABLES.FACTURES);
  assert.strictEqual(fa.length, 3); // q4 annulée et jamais vue : ignorée ; F-2027-003 complétée
  const f1 = fa.find((f) => f.numero === 'F-2027-001');
  assert.deepStrictEqual([f1.id_affaire, f1.tranche, f1.montant, f1.montant_encaisse, f1.qonto_statut], [id, 'TF', 8000, 8000, 'payée']);
  assert.strictEqual(A.jourIso_(f1.date_encaissement), '2027-03-25');
  const f3 = fa.find((f) => f.numero === 'F-2027-003');
  assert.deepStrictEqual([f3.qonto_id, f3.tranche, f3.qonto_statut], ['q3', 'TO1', 'à payer']);
  // Planning de l'affaire : TF payée (encaissement Qonto), lien vers la facture
  const tf = A.Planning_affaire(id, new Date(2027, 4, 1)).lignes.find((l) => l.tranche === 'TF');
  assert.deepStrictEqual([tf.etat, tf.facture.lien], ['payée', 'https://app.qonto.com/invoices/q1']);
  // Facture sans n° KA : à rattacher, puis rattachée à la main
  const etat = brut(A.Qonto_etat());
  assert.deepStrictEqual(etat.aRattacher.map((f) => f.numero), ['F-2027-002']);
  A.Qonto_rattacher(etat.aRattacher[0].id, id, 'to1');
  assert.strictEqual(A.Db_lire(A.TABLES.FACTURES).find((f) => f.numero === 'F-2027-002').tranche, 'TO1');
  // Deuxième synchronisation : rien de neuf ; le rattachement manuel n'est pas écrasé
  const b2 = brut(A.Qonto_synchroniser());
  assert.deepStrictEqual([b2.creees, b2.majs], [0, 0]);
  // Annulation dans Qonto d'une facture connue : signalée, exclue du planning, jamais supprimée
  factures[0].status = 'canceled';
  A.Qonto_synchroniser();
  const f1b = A.Db_lire(A.TABLES.FACTURES).find((f) => f.numero === 'F-2027-001');
  assert.strictEqual(f1b.qonto_statut, 'annulée');
  assert.strictEqual(brut(A.Qonto_etat()).annulees.length, 1);
  assert.ok(A.Db_lire(A.TABLES.JOURNAL_MOTEUR).some((j) => j.source === 'Qonto'));
  A.Qonto_deconnecter();
  assert.strictEqual(A.Qonto_etat().connecte, false);
});

test('relance de paiement : intérêts moratoires chiffrés, mise en demeure au-delà de 30 jours de retard', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  console.log = () => {};
  A.installer({ exercice: false });
  console.log = journal;
  const id = A.Affaires_creer({ acheteur: 'Ville de Marseille', objet: 'AMO programmation' }).id;
  A.Affaires_changerStatut(id, 'Go', {}); A.Affaires_changerStatut(id, 'Déposée', { montant_ht: 20000, date_depot: '2026-01-10', jours_reponse: 2 });
  A.Affaires_changerStatut(id, 'Gagnée', { date_notification: '2026-02-01', montant_notifie: 20000 });
  const aujourd = new Date(); aujourd.setHours(12, 0, 0, 0);
  const il_y_a = (j) => { const d = new Date(aujourd); d.setDate(d.getDate() - j); return A.jourIso_(d); };
  A.Factures_ajouter(id, { numero: 'F-1', date: il_y_a(40), montant: 10000, date_echeance: il_y_a(10) });
  A.Factures_ajouter(id, { numero: 'F-2', date: il_y_a(90), montant: 10000, date_echeance: il_y_a(60) });
  A.Relances_synchroniser();
  const rel = A.Db_lire(A.TABLES.RELANCES).filter((r) => r.type === A.TYPES_RELANCE.ENCAISSEMENT);
  const c1 = A.Courriers_modele(rel.find((r) => A.Db_trouver(A.TABLES.FACTURES, r.id_facture).numero === 'F-1').id);
  assert.match(c1.objet, /Relance de paiement/);
  assert.match(c1.corps, /10 jours de retard, soit .* d'intérêts au taux de 10,15 %/);
  const c2 = A.Courriers_modele(rel.find((r) => A.Db_trouver(A.TABLES.FACTURES, r.id_facture).numero === 'F-2').id);
  assert.match(c2.objet, /Mise en demeure de payer/);
  assert.match(c2.corps, /indemnité forfaitaire pour frais de recouvrement de 40,00\s€/);
});

test('passage à l\'année suivante : numérotation, CA et déclarations URSSAF partent de la création de l\'entreprise', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  console.log = () => {};
  A.installer({ exercice: false });
  console.log = journal;
  A.Params_enregistrer('fiscal.debut_suivi', '2026-11-12'); // installation de l'app, avant la création
  A.Params_enregistrer('fiscal.date_creation', '2027-01-04');
  A.Params_enregistrer('fiscal.periodicite', 'trimestrielle');
  A.Params_cache_ = null;
  // En janvier 2027, le 4e trimestre 2026 (avant la création) n'est ni « à déclarer » ni « en retard »
  const d2026 = brut(A.Fiscal_declarations(2026, new Date(2027, 0, 20)));
  assert.ok(d2026.periodes.every((p) => p.etat === 'non suivie'), d2026.periodes.map((p) => p.libelle + ' ' + p.etat).join(' | '));
  const d2027 = brut(A.Fiscal_declarations(2027, new Date(2027, 0, 20)));
  // 1re déclaration : trimestre de création + trimestre suivant, à l'échéance de ce dernier
  assert.strictEqual(d2027.periodes[0].etat, 'regroupée');
  assert.strictEqual(d2027.periodes[0].regroupeAvec, '2027-T2');
  assert.ok(d2027.periodes[1].premiere);
  assert.deepStrictEqual([d2027.periodes[1].debut, d2027.periodes[1].fin, d2027.periodes[1].echeance], ['2027-01-04', '2027-06-30', '2027-07-31']);
  assert.match(d2027.periodes[1].libelle, /T1 2027 \+ T2 2027 — 1re déclaration/);
  // Déclaration de revenus : rien au printemps 2027 (pas de CA 2026 de micro-entreprise), rappel au printemps 2028 pour le CA 2027
  assert.strictEqual(A.Fiscal_declarationRevenus(2027, new Date(2027, 4, 1)).etat, 'non due');
  assert.ok(!brut(A.Echeances_calculer(new Date(2027, 3, 1), new Date(2027, 5, 30), new Date(2027, 4, 1))).some((e) => /Déclaration de revenus/.test(e.libelle)));
  const g = A.Affaires_creer({ acheteur: 'Commune C', objet: 'AMO' }, { date: '2027-01-06' }).id;
  A.Affaires_changerStatut(g, 'Go', {}); A.Affaires_changerStatut(g, 'Déposée', { montant_ht: 9000, jours_reponse: 2, date_depot: '2027-01-20' });
  A.Affaires_changerStatut(g, 'Gagnée', { date_notification: '2027-02-01', montant_notifie: 9000 });
  A.Factures_ajouter(g, { numero: 'F-1', date: '2027-05-01', montant: 9000, date_encaissement: '2027-06-01', montant_encaisse: 9000 });
  const ir = A.Fiscal_declarationRevenus(2028, new Date(2028, 4, 1));
  assert.deepStrictEqual([ir.etat, ir.anneeCa, ir.ca, ir.echeance], ['à faire', 2027, 9000, '2028-05-28']);
  const echIr = brut(A.Echeances_calculer(new Date(2028, 4, 1), new Date(2028, 4, 31), new Date(2028, 4, 1))).find((e) => /Déclaration de revenus/.test(e.libelle));
  assert.match(echIr.libelle, /CA 2027 : 9\s000,00\s€/);
  assert.ok(A.apiRevenusDeclares(2028, '2028-05-10').ok);
  assert.strictEqual(A.Fiscal_declarationRevenus(2028, new Date(2028, 4, 15)).etat, 'faite');
  // Numérotation : les affaires créées en 2027 repartent à KI-2027-001
  A.Affaires_creer({ acheteur: 'Commune A', objet: 'AMO' }, { date: '2026-12-20' });
  assert.strictEqual(g, 'KI-2027-001');
});

test('thème gardé sur le compte et appliqué dès l\'ouverture de la page', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  console.log = () => {};
  A.installer({ exercice: false });
  console.log = journal;
  assert.strictEqual(A.Theme_lire_(), '');
  assert.ok(A.apiTheme('neon').ok);
  assert.strictEqual(A.Theme_lire_(), 'neon');
  assert.strictEqual(A.apiTheme('autre').ok, false);
  const fs = require('fs');
  const index = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'Index.html'), 'utf8');
  assert.match(index, /var serveur = 'THEME_SERVEUR'/);
  // La page servie porte le thème du compte
  const o = { contenu: index, setTitle() { return o; }, addMetaTag() { return o; }, setFaviconUrl() { return o; },
    getContent: () => o.contenu, setContent: (c) => { o.contenu = c; return o; } };
  A.HtmlService.createTemplateFromFile = () => ({ evaluate: () => o });
  A.doGet();
  assert.match(o.contenu, /var serveur = 'neon'/);
});

test('renommage Kompa → Kartes : fichiers renommés et signature d\'origine mise à jour, valeurs modifiées respectées', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  console.log = () => {};
  A.installer({ exercice: false });
  console.log = journal;
  // Installation d'avant le renommage : noms et signature d'origine
  Object.values(env.classeurs).forEach((c) => { c.nom = c.nom.replace(/^Kartes/, 'Kompa'); });
  const ancienne = 'Sébastien De Raedt EI\nKompa Ingénierie — Assistance à maîtrise d\'ouvrage\n[téléphone] · kompa.ingenierie@gmail.com\nSIRET [n°] · TVA non applicable, art. 293 B du CGI';
  A.Params_enregistrer('courrier.signature', ancienne);
  A.Params_enregistrer('veille.heure_collecte', '5'); // valeur modifiée : jamais touchée
  A.Params_cache_ = null;
  env.proprietes.KA_SIGNATURE_SCHEMA = 'ancienne-version';
  const r = brut(A.MiseAJour_verifier_());
  assert.ok(r.changements.some((c) => /courrier\.signature/.test(c)), r.changements.join(' | '));
  assert.ok(r.changements.some((c) => /« Kompa Affaires — données » → « Kartes Affaires — données »/.test(c)), r.changements.join(' | '));
  assert.deepStrictEqual(Object.values(env.classeurs).map((c) => c.nom).sort(), ['Kartes Affaires — données', 'Kartes Estimation — données']);
  A.Db_viderCache_(); A.Params_cache_ = null;
  assert.match(A.Params_texte('courrier.signature'), /^Sébastien De Raedt EI\nKartes Ingénierie/);
  assert.match(A.Params_texte('courrier.signature'), /SIRET 493 567 796 00021/);
  assert.strictEqual(A.Params_texte('veille.heure_collecte'), '5');
  // Adresse publique : remplace [e-mail] dans la signature des courriers
  A.Params_enregistrer('courrier.email_public', 'contact@kartes-ingenierie.fr');
  A.Params_cache_ = null;
  const id = A.Affaires_creer({ acheteur: 'Commune', objet: 'AMO' }).id;
  A.Affaires_changerStatut(id, 'Go', {}); A.Affaires_changerStatut(id, 'Déposée', { montant_ht: 1000, jours_reponse: 1, date_depot: '2026-10-01' });
  A.Affaires_changerStatut(id, 'Perdue', { date_resultat: '2026-11-01', attributaire: 'X' });
  A.Relances_synchroniser();
  const rel = A.Db_lire(A.TABLES.RELANCES).find((x) => x.id_affaire === id);
  const c = A.Courriers_modele(rel.id);
  assert.match(c.corps, /remise par Kartes Ingénierie/);
  assert.match(c.corps, /contact@kartes-ingenierie\.fr/);
  assert.doesNotMatch(c.corps, /Kompa/);
  // Signature modifiée à la main : seul « SIRET [n°] » est complété, le reste est conservé
  A.Params_enregistrer('courrier.signature', 'S. De Raedt\n06 00 00 00 00\nSIRET [n°]');
  A.Params_cache_ = null;
  A.Params_migrer_();
  A.Db_viderCache_(); A.Params_cache_ = null;
  assert.strictEqual(A.Params_texte('courrier.signature'), 'S. De Raedt\n06 00 00 00 00\nSIRET 493 567 796 00021');
  assert.strictEqual(A.Params_texte('entreprise.ape'), '7112B');
});

test('bascule de compte : arrêt des déclencheurs de l\'ancien compte, sans toucher aux données', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  console.log = () => {};
  A.installer({ exercice: false });
  const n = A.Db_lire(A.TABLES.PARAMETRES).length;
  assert.ok(A.ScriptApp.getProjectTriggers().length >= 4);
  assert.match(A.arreterDeclencheursDeCeCompte(), /supprimé/);
  console.log = journal;
  assert.strictEqual(A.ScriptApp.getProjectTriggers().length, 0);
  assert.strictEqual(A.Db_lire(A.TABLES.PARAMETRES).length, n);
  assert.strictEqual(A.Params_texte('courrier.email_public'), 'kartes.ingenierie@gmail.com');
});

test('chaque onglet a id/clé en 1re colonne et cree_le, modifie_le en fin', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const ss = Object.values(env.classeurs)[0];
  ss.getSheets().forEach((f) => {
    const ent = f.lignes[0];
    assert.ok(['id', 'cle'].includes(ent[0]), f.nom);
    assert.deepStrictEqual(ent.slice(-2), ['cree_le', 'modifie_le'], f.nom);
  });
  // Affaires dépasse 26 colonnes : la grille doit avoir été élargie.
  assert.ok(ss.getSheetByName('Affaires').lignes[0].length > 26);
});

test('installer() est idempotent : pas de doublon de paramètres ni de déclencheurs', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const r2 = env.ctx.installer({ exercice: false });
  assert.strictEqual(r2.parametresAjoutes, 0);
  assert.strictEqual(r2.colonnesAjoutees, 0);
  assert.strictEqual(env.declencheurs.length, 4);
  const params = env.ctx.Db_lire(env.ctx.TABLES.PARAMETRES);
  const cles = params.map((p) => p.cle);
  assert.strictEqual(new Set(cles).size, cles.length);
});

test('une colonne ajoutée au schéma est créée sans toucher aux données', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  env.ctx.Params_enregistrer('capacite.montant_max_mission', '40000');
  env.ctx.TABLES.PARAMETRES.colonnes.push('nouvelle_colonne');
  const r = env.ctx.installer({ exercice: false });
  assert.strictEqual(r.colonnesAjoutees, 1);
  assert.strictEqual(env.ctx.Params_texte('capacite.montant_max_mission'), '40000');
});

test('recette lot 1 : l\'app lit puis écrit un paramètre dans le classeur', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const lecture = env.ctx.apiParametres();
  assert.ok(lecture.ok, lecture.erreur);
  const groupe = lecture.data.find((g) => g.prefixe === 'capacite');
  assert.ok(groupe);
  assert.strictEqual(groupe.parametres[0].valeur, '');

  const ecriture = env.ctx.apiParametreEnregistrer('capacite.montant_max_mission', ' 40000 ');
  assert.ok(ecriture.ok, ecriture.erreur);
  assert.strictEqual(ecriture.data.valeur, '40000');
  assert.strictEqual(typeof ecriture.data.modifie_le, 'string'); // Date sérialisée

  // Relecture depuis le classeur (nouvelle exécution : caches vidés)
  env.ctx.Params_cache_ = null;
  assert.strictEqual(env.ctx.Params_nombre('capacite.montant_max_mission'), 40000);
});

test('les départements gardent leur zéro initial (format texte)', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  assert.deepStrictEqual(brut(env.ctx.Params_liste('zone.departements_paca')), ['04', '05', '06', '13', '83', '84', '2A', '2B']);
  env.ctx.apiParametreEnregistrer('zone.departements_paca', '04 ; 05;06;;13');
  env.ctx.Params_cache_ = null;
  assert.strictEqual(env.ctx.Params_texte('zone.departements_paca'), '04;05;06;13');
});

test('un paramètre inconnu est refusé (pas de création depuis l\'app)', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const r = env.ctx.apiParametreEnregistrer('faute.de.frappe', 'x');
  assert.strictEqual(r.ok, false);
  assert.match(r.erreur, /inconnu/);
});

test('apiEtat renvoie l\'état du classeur, sérialisable', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const r = env.ctx.apiEtat();
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(r.data.onglets.length, 27); // 15 onglets du suivi + 12 du module Estimation
  assert.ok(r.data.onglets.every((o) => o.present));
  assert.strictEqual(r.data.onglets.find((o) => o.nom === 'Paramètres').lignes, env.ctx.PARAMETRES_DEFAUT.length);
});

test('sans installation, l\'API renvoie une erreur explicite', () => {
  const env = creerEnvironnement();
  const r = env.ctx.apiEtat();
  assert.strictEqual(r.ok, false);
  assert.match(r.erreur, /installer\(\)/);
});

test('accès refusé à un autre compte', () => {
  const env = creerEnvironnement({ visiteur: 'intrus@example.com' });
  env.ctx.installer({ exercice: false });
  const r = env.ctx.apiParametres();
  assert.strictEqual(r.ok, false);
  assert.match(r.erreur, /réservé/);
});

test('sauvegarde hebdomadaire : copie datée et rotation des copies', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  env.ctx.Params_enregistrer('sauvegarde.nb_copies', '2');
  for (let i = 0; i < 4; i++) env.ctx.sauvegardeHebdo();
  const actives = env.fichiersDrive.filter((f) => !f.corbeille);
  // 2 copies conservées par classeur (suivi + estimation)
  assert.strictEqual(actives.filter((f) => /^Kartes Affaires — données — \d{4}-\d{2}-\d{2}$/.test(f.nom)).length, 2);
  assert.strictEqual(actives.filter((f) => /^Kartes Estimation — données — \d{4}-\d{2}-\d{2}$/.test(f.nom)).length, 2);
  assert.strictEqual(actives.length, 4);
});

test('Db : insertion, recherche et mise à jour avec horodatage', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const T = env.ctx.TABLES.JOURNAL_MOTEUR;
  const l = env.ctx.Db_inserer(T, { source: 'test', avis_lus: 3 });
  assert.match(l.id, /^JM-\d{8}-[0-9A-F]{6}$/);
  assert.ok(l.cree_le instanceof Date || typeof l.cree_le === 'object');
  const m = env.ctx.Db_maj(T, l.id, { avis_retenus: 2, id: 'ne-doit-pas-changer' });
  assert.strictEqual(m.id, l.id);
  assert.strictEqual(m.avis_retenus, 2);
  assert.strictEqual(env.ctx.Db_trouver(T, l.id).avis_lus, 3);
});

test('compteur CA : encaissé, engagé, jalons et alertes', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const T = env.ctx.TABLES;
  env.ctx.Db_insererPlusieurs(T.FACTURES, [
    { id_affaire: 'KI-2026-001', numero: 'F1', date: '15/01/2026', montant: 20000, date_encaissement: '10/02/2026', montant_encaisse: 20000 },
    { id_affaire: 'KI-2026-001', numero: 'F2', date: new Date(2026, 4, 2), montant: '11 000,00 €', date_encaissement: new Date(2026, 5, 1), montant_encaisse: 11000 },
    { id_affaire: 'KI-2026-002', numero: 'F3', date: '01/10/2026', montant: 4000 }, // non payée
    { id_affaire: 'KI-2025-009', numero: 'F0', date: '01/12/2025', montant: 5000, date_encaissement: '05/01/2025', montant_encaisse: 5000 } // autre année
  ]);
  env.ctx.Db_insererPlusieurs(T.AFFAIRES, [
    { id: 'KI-2026-002', statut: 'Gagnée', montant_notifie: 12000, date_notification: '01/09/2026' },
    { id: 'KI-2026-003', statut: 'Perdue', montant_notifie: '' }
  ]);
  const ca = brut(env.ctx.Compteur_ca(2026));
  assert.strictEqual(ca.encaisse, 31000);
  assert.strictEqual(ca.aEncaisser, 4000);
  assert.strictEqual(ca.resteAFacturer, 8000);
  assert.strictEqual(ca.engage, 43000);
  assert.strictEqual(ca.facture, 35000);
  assert.strictEqual(ca.signe, 12000);
  const j = Object.fromEntries(ca.jalons.map((x) => [x.cle, x]));
  assert.deepStrictEqual(Object.keys(j), ['seuil.tva_franchise', 'seuil.tva_majore', 'seuil.plafond_vise', 'seuil.micro_plafond']);
  assert.strictEqual(j['seuil.tva_franchise'].etat, 'alerte'); // 31 000 ≥ 80 % de 37 500
  assert.strictEqual(j['seuil.tva_franchise'].reste, 6500);
  assert.strictEqual(j['seuil.tva_majore'].etatEngage, 'depasse'); // 43 000 > 41 250
  assert.strictEqual(j['seuil.plafond_vise'].seuil, 80000);
  assert.strictEqual(j['seuil.plafond_vise'].etat, 'ok');
  assert.strictEqual(ca.prochain, 'seuil.tva_franchise');
});

test('compteur CA : classeur vide, aucun seuil dépassé', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const r = env.ctx.apiCompteurCA();
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(r.data.encaisse, 0);
  assert.ok(r.data.jalons.every((x) => x.etat === 'ok'));
});

test('dist/ est à jour et le Code.gs assemblé fonctionne', () => {
  const fs = require('fs');
  const path = require('path');
  const lire = (n) => fs.readFileSync(path.join(__dirname, '..', 'dist', n), 'utf8');
  const avant = ['Code.gs', 'Estimation.gs', 'Index.html'].map(lire);
  require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]);
  const apres = ['Code.gs', 'Estimation.gs', 'Index.html'].map(lire);
  assert.deepStrictEqual(avant, apres, 'dist/ n\'était pas à jour : lancer npm run build et committer');
  assert.doesNotMatch(lire('Code.gs'), /════ Est[A-Z]/); // le module n'est que dans Estimation.gs
  const env = creerEnvironnement({ dist: true });
  env.ctx.installer({ exercice: false });
  assert.ok(env.ctx.apiParametreEnregistrer('seuil.plafond_vise', '75000').ok);
  assert.ok(env.ctx.apiCompteurCA().ok);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'dist', 'Index.html'), 'utf8'), /<\?/);
});

// ——— Fiche : pièces de l'offre ———

test('offre : montant HT = total des jours par tranche × prix par jour (montant vide), montant saisi conservé', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  assert.strictEqual(A.Affaires_joursTotal_('TF : 6 j\nTO1 : 8 j\nTO2 : 10 jours'), 24);
  assert.strictEqual(A.Affaires_joursTotal_('TF 60\nTO1 : 2,5 j\n\nTO2 : 47,5'), 110);
  assert.strictEqual(A.Affaires_joursTotal_('110'), 110);
  assert.strictEqual(A.Affaires_joursTotal_('à définir'), 0);
  const id = A.Affaires_creer({ acheteur: 'Ville de Marseille', objet: 'AMO programmation' }).id;
  const ok = (r) => { assert.ok(r.ok, r.erreur); return brut(r.data); };
  let f = ok(A.apiAffaireMaj(id, { jours_par_tranche: 'TF : 50 j\nTO1 : 60 j', prix_jour: '400', montant_ht: '' }));
  assert.strictEqual(f.affaire.montant_ht, 44000);
  // Montant saisi : conservé
  f = ok(A.apiAffaireMaj(id, { montant_ht: '43500' }));
  assert.strictEqual(f.affaire.montant_ht, 43500);
  // Prix modifié, montant vidé : recalculé avec les jours déjà enregistrés
  f = ok(A.apiAffaireMaj(id, { prix_jour: '450', montant_ht: '' }));
  assert.strictEqual(f.affaire.montant_ht, 49500);
});

test('CA prévisionnel : encaissé, prévu (gagnées, répartition par année, reste), potentiel (déposées), seuils', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const ok = (r) => { assert.ok(r.ok, r.erreur); return brut(r.data); };
  const quand = new Date(2026, 10, 21);
  // Lecture de la répartition
  assert.deepStrictEqual(brut(A.Previsionnel_lireRepartition_('2027 : 10 000 €\n2028 : reste')).lignes, [{ annee: 2027, montant: 10000 }, { annee: 2028, montant: null }]);
  assert.match(brut(A.Previsionnel_lireRepartition_('l\'an prochain')).erreurs[0], /illisible/);
  // Gagnée 44 000 € : 4 000 € encaissés en 2026, 10 000 € en 2027, reste en 2028
  const g = A.Affaires_creer({ acheteur: 'Ville de Marseille', objet: 'AMO programmation' }).id;
  A.Affaires_changerStatut(g, 'Go', {});
  A.Affaires_changerStatut(g, 'Déposée', { montant_ht: 44000, jours_reponse: 2, date_depot: '2026-06-01' });
  A.Affaires_changerStatut(g, 'Gagnée', { date_notification: '2026-07-01', montant_notifie: 44000 });
  A.Factures_ajouter(g, { numero: 'F1', date: '2026-09-30', montant: 4000, date_encaissement: '2026-10-30', montant_encaisse: 4000 });
  A.Affaires_maj(g, { repartition_ca: '2026 : 4000\n2027 : 10000\n2028 : reste' });
  // Gagnée sans répartition : reste sur 2026, signalé
  const g2 = A.Affaires_creer({ acheteur: 'Commune de Gap', objet: 'Faisabilité' }).id;
  A.Affaires_changerStatut(g2, 'Go', {});
  A.Affaires_changerStatut(g2, 'Déposée', { montant_ht: 12000, jours_reponse: 1, date_depot: '2026-06-01' });
  A.Affaires_changerStatut(g2, 'Gagnée', { date_notification: '2026-07-01', montant_notifie: 12000 });
  // Déposée : potentiel 2027
  const d = A.Affaires_creer({ acheteur: 'Commune de Digne', objet: 'Programmation' }).id;
  A.Affaires_changerStatut(d, 'Go', {});
  A.Affaires_changerStatut(d, 'Déposée', { montant_ht: 70000, jours_reponse: 3, date_depot: '2026-11-01' });
  A.Affaires_maj(d, { repartition_ca: '2027 : reste' });
  const p = brut(A.Previsionnel_ca(quand));
  const an = (y) => p.annees.find((x) => x.annee === y);
  assert.deepStrictEqual(p.annees.map((x) => x.annee), [2026, 2027, 2028, 2029]);
  assert.deepStrictEqual([an(2026).encaisse, an(2026).prevu, an(2026).certain], [4000, 12000, 16000]);
  assert.deepStrictEqual([an(2027).prevu, an(2027).potentiel, an(2027).total], [10000, 70000, 80000]);
  assert.strictEqual(an(2028).prevu, 30000);
  const af = (id) => p.affaires.find((x) => x.id === id);
  assert.deepStrictEqual(af(g).parAnnee, { 2027: 10000, 2028: 30000 });
  // Jours : 44 000 € sans jours saisis ni prix de journée → non calculables ; avec 110 j à 400 €/j → 25 j en 2027, 75 j en 2028
  assert.strictEqual(af(g).joursEstimes, 0);
  A.Affaires_maj(g, { jours_par_tranche: 'TF : 50 j\nTO1 : 60 j', prix_jour: 400 });
  const pj = brut(A.Previsionnel_ca(quand));
  const afj = pj.affaires.find((x) => x.id === g);
  assert.deepStrictEqual([afj.jours, afj.prixJour, afj.joursSource], [110, 400, 'jours par tranche']);
  // TO1 optionnelle (24 000 €) : hors CA certain tant qu'elle n'est pas affermie → 2028 = 6 000 € (15 j)
  assert.deepStrictEqual(afj.joursParAnnee, { 2027: 25, 2028: 15 });
  A.Planning_affermir(g, 'TO1', 'affermie', '2027-03-01');
  assert.deepStrictEqual(brut(A.Previsionnel_ca(quand)).affaires.find((x) => x.id === g).joursParAnnee, { 2027: 25, 2028: 75 });
  assert.strictEqual(pj.annees.find((x) => x.annee === 2027).joursPrevu, 25);
  assert.strictEqual(af(g2).aPreciser, true);
  assert.strictEqual(af(g).aPreciser, false);
  // Seuils : 2027 dépasse la franchise de TVA avec le potentiel, pas sans
  const tva = an(2027).seuils.find((s) => s.cle === 'seuil.tva_franchise');
  assert.deepStrictEqual([tva.etat, tva.etatTotal], ['ok', 'depasse']);
  assert.ok(A.Previsionnel_alertes_(quand).some((t) => /^2027 : .*si les offres déposées sont gagnées/.test(t)));
  // API et e-mail
  assert.strictEqual(ok(A.apiPrevisionnel()).affaires.length, 3);
  assert.match(A.Email_construire(quand).html, /CA prévisionnel : seuil dépassé/);
  // Répartition supérieure au restant : signalée
  A.Affaires_maj(g, { repartition_ca: '2027 : 50000' });
  assert.match(brut(A.Previsionnel_ca(quand)).affaires.find((x) => x.id === g).remarques.join(' '), /supérieure au montant restant/);
});

test('CFE : non due avant la création, exonérée l\'année de création, moitié la 2e année, échéance 15/12, payée', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const ok = (r) => { assert.ok(r.ok, r.erreur); return brut(r.data); };
  assert.strictEqual(A.Params_texte('fiscal.date_creation'), '2027-01-04');
  const cfe = (an, quand) => brut(A.Fiscal_cfe(an, quand));
  assert.deepStrictEqual([cfe(2026, new Date(2026, 10, 21)).etat, cfe(2027, new Date(2027, 5, 1)).etat], ['non due', 'exonérée']);
  // Montant estimé saisi depuis la carte : 400 € l'année pleine → 200 € en 2028 (2e année), 400 € en 2029
  const r = ok(A.apiCfeReglages('400', '2027-01-04'));
  assert.strictEqual(r.cfe.estimeAnnee, 400);
  const c28 = cfe(2028, new Date(2028, 10, 20));
  assert.deepStrictEqual([c28.montant, c28.reduction, c28.etat, c28.echeance], [200, true, 'à payer', '2028-12-15']);
  assert.deepStrictEqual([cfe(2029, new Date(2029, 5, 1)).montant, cfe(2029, new Date(2029, 5, 1)).etat], [400, 'à venir']);
  assert.strictEqual(cfe(2028, new Date(2028, 11, 20)).etat, 'en retard');
  // Échéancier : CFE 2028 dans les 7 jours avant le 15/12
  const ech = brut(A.Echeances_calculer(new Date(2028, 11, 10), new Date(2028, 11, 17), new Date(2028, 11, 10)));
  assert.ok(ech.some((e) => /^CFE 2028 à payer — estimée 200,00/.test(e.libelle)), JSON.stringify(ech.map((e) => e.libelle)));
  // Payée (montant de l'avis) puis annulée
  A.Fiscal_cfePayee(2028, '215,50', '2028-12-05');
  const p = cfe(2028, new Date(2028, 11, 20));
  assert.deepStrictEqual([p.etat, p.montant, p.estime], ['payée', 215.5, false]);
  assert.strictEqual(ok(A.apiAnnulerDeclaration('CFE-2028')).annee, 2028);
  assert.match(A.apiCfeReglages('abc', '').erreur, /nombre attendu/);
  // Carte URSSAF : la CFE de l'année est fournie
  assert.ok(ok(A.apiFiscal()).cfe);
});

test('planning de facturation : tranches au prorata des jours, facture au dernier livrable, paiement à 30 j, intérêts moratoires, CA prévisionnel', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const ok = (r) => { assert.ok(r.ok, r.erreur); return brut(r.data); };
  const quand = new Date(2027, 1, 1);
  assert.deepStrictEqual(brut(A.Planning_tranches_('TF : 50 j\nTO1 : 60 j')).map((t) => ({ tranche: t.tranche, jours: t.jours })), [{ tranche: 'TF', jours: 50 }, { tranche: 'TO1', jours: 60 }]);
  // Nature d'une tranche : mention « optionnelle » sur la ligne, ou choix enregistré (Mission › Marché)
  assert.strictEqual(A.Planning_estOptionnelle_('T2', 'T2 : 30 j (optionnelle)'), true);
  assert.strictEqual(A.Planning_estOptionnelle_('T2', 'T2 : 30 j'), false);
  assert.strictEqual(A.Planning_trancheOptionnelle_({ tranche: 'T2', texte: 'T2 : 30 j' }, { T2: { etat: 'optionnelle' } }), true);
  assert.strictEqual(A.Planning_trancheOptionnelle_({ tranche: 'TO1', texte: 'TO1 : 30 j' }, { TO1: { etat: 'ferme' } }), false);
  const g = A.Affaires_creer({ acheteur: 'Ville de Marseille', objet: 'AMO programmation' }).id;
  A.Affaires_maj(g, { jours_par_tranche: 'TF : 50 j\nTO1 : 60 j', prix_jour: '400', montant_ht: '' });
  A.Affaires_changerStatut(g, 'Go', {});
  A.Affaires_changerStatut(g, 'Déposée', { montant_ht: 44000, jours_reponse: 2, date_depot: '2026-06-01' });
  A.Affaires_changerStatut(g, 'Gagnée', { date_notification: '2026-12-01', montant_notifie: 44000 });
  // Sans livrable daté : à planifier, le CA prévisionnel reprend la répartition saisie (ou l'année en cours)
  let p = brut(A.Planning_affaire(g, quand));
  assert.deepStrictEqual(p.lignes.map((l) => [l.tranche, l.montant, l.etat]), [['TF', 20000, 'à planifier'], ['TO1', 24000, 'à planifier']]);
  assert.strictEqual(A.Planning_parAnnee_(g, quand), null);
  // Livrables : TF remis le 30/06/2027, TO1 en deux livrables (dernier le 15/12/2027)
  A.Livrables_ajouter(g, { tranche: 'TF', libelle: 'Rapport de faisabilité', date_echeance: '2027-06-30' });
  A.Livrables_ajouter(g, { tranche: 'TO1', libelle: 'Préprogramme', date_echeance: '2027-09-30' });
  A.Livrables_ajouter(g, { tranche: 'to1', libelle: 'Programme', date_echeance: '2027-12-15' });
  p = brut(A.Planning_affaire(g, quand));
  const tf = p.lignes[0], to1 = p.lignes[1];
  assert.deepStrictEqual([tf.etat, tf.dateFacture, tf.dateEcheance], ['prévue', '2027-06-30', '2027-07-30']);
  assert.deepStrictEqual([to1.dateFacture, to1.dateEcheance, to1.livrables.length], ['2027-12-15', '2028-01-14', 2]);
  // CA prévisionnel : 20 000 € en 2027, 24 000 € en 2028 (paiement à 30 jours), répartition saisie ignorée
  A.Affaires_maj(g, { repartition_ca: '2027 : reste' });
  const prev = brut(A.Previsionnel_ca(quand));
  // TO1 optionnelle : en potentiel (2028) tant qu'elle n'est pas affermie
  assert.deepStrictEqual(prev.affaires.find((x) => x.id === g).parAnnee, { 2027: 20000 });
  assert.strictEqual(prev.annees.find((x) => x.annee === 2028).potentiel, 24000);
  assert.deepStrictEqual(brut(A.Planning_affaire(g, quand)).lignes.map((l) => l.affermissement), ['ferme', 'optionnelle']);
  const fa = ok(A.apiTrancheAffermir(g, 'TO1', 'affermie', '2027-01-15'));
  assert.deepStrictEqual([fa.planning.lignes[1].affermissement, fa.planning.lignes[1].dateAffermissement], ['affermie', '2027-01-15']);
  assert.deepStrictEqual(brut(A.Previsionnel_ca(quand)).affaires.find((x) => x.id === g).parAnnee, { 2027: 20000, 2028: 24000 });
  // Non affermie : exclue du CA (ni certain ni potentiel)
  A.Planning_affermir(g, 'TO1', 'non affermie');
  const pna = brut(A.Previsionnel_ca(quand));
  assert.deepStrictEqual([pna.affaires.find((x) => x.id === g).parAnnee, pna.annees.find((x) => x.annee === 2028).potentiel], [{ 2027: 20000 }, 0]);
  A.Planning_affermir(g, 'TO1', 'affermie', '2027-01-15');
  assert.strictEqual(prev.affaires.find((x) => x.id === g).source, 'planning');
  // Facturer TF depuis le planning, puis paiement en retard : intérêts moratoires + 40 €
  const fiche = ok(A.apiPlanningFacturer(g, 'TF', { numero: 'F-2027-01', date: '2027-06-30', montant: '20000' }));
  const ltf = fiche.planning.lignes[0];
  assert.deepStrictEqual([ltf.etat, ltf.facture.numero, ltf.dateEcheance], ['facturée', 'F-2027-01', '2027-07-30']);
  assert.strictEqual(fiche.factures[0].tranche, 'TF');
  p = brut(A.Planning_affaire(g, new Date(2027, 8, 28))); // 28/09/2027 : 60 j de retard
  assert.strictEqual(p.lignes[0].etat, 'en retard');
  assert.deepStrictEqual([p.lignes[0].retard.jours, p.lignes[0].retard.indemnite], [60, 40]);
  assert.strictEqual(p.lignes[0].retard.interets, Math.round(20000 * 0.1015 * 60 / 365 * 100) / 100);
  A.Factures_maj(fiche.factures[0].id, { date_encaissement: '2027-08-09', montant_encaisse: '20000' });
  p = brut(A.Planning_affaire(g, new Date(2027, 8, 28)));
  assert.deepStrictEqual([p.lignes[0].etat, p.lignes[0].retard.jours], ['payée', 10]);
  const prev2 = brut(A.Previsionnel_ca(new Date(2027, 8, 28)));
  assert.deepStrictEqual(prev2.affaires.find((x) => x.id === g).parAnnee, { 2028: 24000 });
});

test('Finances : synthèse, encaissements toutes affaires sur une même ligne de temps, retards, facturation dans l\'échéancier', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const ok = (r) => { assert.ok(r.ok, r.erreur); return brut(r.data); };
  const g = A.Affaires_creer({ acheteur: 'Ville de Marseille', objet: 'AMO' }).id;
  A.Affaires_maj(g, { jours_par_tranche: 'TF : 50 j\nTO1 : 60 j', prix_jour: '400', montant_ht: '' });
  A.Affaires_changerStatut(g, 'Go', {});
  A.Affaires_changerStatut(g, 'Déposée', { montant_ht: 44000, jours_reponse: 2, date_depot: '2026-06-01' });
  A.Affaires_changerStatut(g, 'Gagnée', { date_notification: '2026-07-01', montant_notifie: 44000 });
  A.Livrables_ajouter(g, { tranche: 'TF', libelle: 'Rapport', date_echeance: '2026-09-01' });
  A.Livrables_ajouter(g, { tranche: 'TO1', libelle: 'Programme', date_echeance: '2027-03-01' });
  const quand = new Date(2026, 10, 21);
  // Facturation de TF à faire (livrable passé) : dans l'échéancier, pas TO1 (optionnelle)
  const ech = brut(A.Echeances_calculer(quand, new Date(2026, 10, 28), quand));
  assert.ok(ech.some((e) => e.type === 'Facturation' && /^Facturer la tranche TF/.test(e.libelle) && e.depassee));
  assert.ok(!ech.some((e) => /TO1/.test(e.libelle)));
  // Facture TF émise le 01/09, non payée → en retard
  A.Planning_facturer(g, 'TF', { numero: 'F1', date: '2026-09-01', montant: '20000' });
  const s = brut(A.Finances_synthese(quand));
  assert.deepStrictEqual([s.resume.enAttente, s.resume.enRetard, s.resume.nbRetard, s.resume.optionnel], [20000, 20000, 1, 24000]);
  assert.strictEqual(s.encaissements.lignes[0].etat, 'en retard');
  assert.ok(s.encaissements.debut <= '2026-09-01' && s.encaissements.fin >= '2027-03-31');
  assert.strictEqual(brut(A.Finances_retards_(quand))[0].numero, 'F1');
  // API : paiement depuis Finances
  const apres = ok(A.apiFinancesPaiement(s.encaissements.lignes[0].facture.id, { date_encaissement: '2026-11-20', montant_encaisse: '20000' }));
  assert.strictEqual(apres.resume.nbRetard, 0);
  assert.ok(ok(A.apiRecherche()).some((x) => x.id === g));
  // Factures sans tranche : couvrent la tranche ferme non facturée (pas de double compte)
  const h = A.Affaires_creer({ acheteur: 'Commune X', objet: 'Y' }).id;
  A.Affaires_changerStatut(h, 'Go', {});
  A.Affaires_changerStatut(h, 'Déposée', { montant_ht: 16000, jours_reponse: 1, date_depot: '2026-06-01' });
  A.Affaires_changerStatut(h, 'Gagnée', { date_notification: '2026-07-01', montant_notifie: 16000 });
  A.Livrables_ajouter(h, { libelle: 'Rapport', date_echeance: '2026-12-04' });
  A.Factures_ajouter(h, { numero: 'F-A', date: '2026-08-01', montant: 6000 });
  const ph = brut(A.Planning_affaire(h, quand));
  assert.deepStrictEqual([ph.lignes[0].montant, ph.lignes[0].dejaFacture], [10000, 6000]);
  assert.ok(ok(A.apiAccueil()).alertes);
});

test('pièces de l\'offre : liste collée depuis l\'analyse du DCE (titres, préfixes, puces, doublons)', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const id = A.Affaires_creer({ acheteur: 'Commune de Manosque', objet: 'AMO gymnase' }).id;
  const ok = (r) => { assert.ok(r.ok, r.erreur); return brut(r.data); };
  const texte = 'Pièces à remettre\nCandidature :\n☐ DC1 ou DUME\n- DC2\n• Attestation d\'assurance RC professionnelle\n\nPièces de l\'offre :\n1. Acte d\'engagement\n2) BPU\n[ ] Mémoire technique (cadre imposé)\nCandidature : Références de moins de 5 ans\nbpu\n';
  let f = ok(A.apiPiecesOffreColler(id, texte));
  assert.deepStrictEqual(f.collage, { ajoutees: 7, doublons: 1 });
  assert.deepStrictEqual(f.pieces.map((p) => p.categorie + ' | ' + p.libelle), [
    'Candidature | DC1 ou DUME', 'Candidature | DC2', 'Candidature | Attestation d\'assurance RC professionnelle', 'Candidature | Références de moins de 5 ans',
    'Offre | Acte d\'engagement', 'Offre | BPU', 'Offre | Mémoire technique (cadre imposé)']);
  // Deuxième collage : seules les nouvelles pièces sont ajoutées
  f = ok(A.apiPiecesOffreColler(id, 'Offre\nBPU\nPlanning'));
  assert.deepStrictEqual(f.collage, { ajoutees: 1, doublons: 1 });
  assert.strictEqual(f.pieces.length, 8);
  assert.match(A.apiPiecesOffreColler(id, '\n  \n- \n').erreur, /Aucune pièce reconnue/);
});

test('pièces de l\'offre : liste type, ajout, état, retrait, contrôle, passage en Déposée', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const id = A.Affaires_creer({ acheteur: 'Commune de Digne-les-Bains', objet: 'AMO programmation cantine', date_limite_remise: '2026-12-07' }).id;
  A.Affaires_changerStatut(id, 'Go', {});
  const ok = (r) => { assert.ok(r.ok, r.erreur); return brut(r.data); };
  let f = ok(A.apiAffaire(id));
  assert.deepStrictEqual(f.pieces, []);
  assert.deepStrictEqual(f.piecesResume, { total: 0, pretes: 0, deposees: 0, aFaire: 0, enCours: 0 });
  f = ok(A.apiPiecesOffreListeType(id));
  assert.strictEqual(f.pieces.length, 7);
  assert.deepStrictEqual(f.pieces.map((p) => p.categorie), ['Candidature', 'Candidature', 'Candidature', 'Offre', 'Offre', 'Offre', 'Offre']);
  assert.strictEqual(ok(A.apiPiecesOffreListeType(id)).pieces.length, 7); // pas de doublon
  f = ok(A.apiPieceOffreAjouter(id, { categorie: 'Offre', libelle: 'Mémoire environnemental (démarche RSE)' }));
  assert.strictEqual(f.pieces.length, 8);
  assert.strictEqual(f.pieces[7].libelle, 'Mémoire environnemental (démarche RSE)');
  assert.match(A.apiPieceOffreAjouter(id, { categorie: 'Annexe', libelle: 'x' }).erreur, /Catégorie attendue/);
  assert.match(A.apiPieceOffreAjouter(id, { categorie: 'Offre', libelle: ' ' }).erreur, /obligatoire/);
  const memoire = f.pieces.find((p) => p.libelle === 'Mémoire technique').id;
  const ae = f.pieces.find((p) => p.libelle === 'Acte d\'engagement').id;
  f = ok(A.apiPieceOffreMaj(id, memoire, { etat: 'prête' }));
  f = ok(A.apiPieceOffreMaj(id, ae, { etat: 'en cours' }));
  assert.match(A.apiPieceOffreMaj(id, ae, { etat: 'terminée' }).erreur, /État attendu/);
  assert.deepStrictEqual(f.piecesResume, { total: 8, pretes: 1, deposees: 0, aFaire: 6, enCours: 1 });
  f = ok(A.apiPieceOffreSupprimer(id, f.pieces.find((p) => p.libelle === 'CV de l\'équipe').id));
  assert.strictEqual(f.pieces.length, 7);
  // Pièce d'une autre affaire : refus
  const autre = A.Affaires_creer({ acheteur: 'X', objet: 'Y' }).id;
  assert.match(A.apiPieceOffreMaj(autre, memoire, { etat: 'prête' }).erreur, /introuvable/);
  // Passage en Déposée : pièces prêtes ou en cours → déposée ; à faire inchangées
  f = ok(A.apiAffaireStatut(id, 'Déposée', { montant_ht: 40800, jours_reponse: 4, date_depot: '2026-12-03' }, ''));
  assert.strictEqual(f.pieces.find((p) => p.id === memoire).etat, 'déposée');
  assert.strictEqual(f.pieces.find((p) => p.id === ae).etat, 'déposée');
  assert.strictEqual(f.piecesResume.deposees, 2);
  assert.strictEqual(f.piecesResume.aFaire, 5);
});

test('livrables de mission : ajout, contrôles, état, échéancier et e-mail, synthèse', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const id = A.Affaires_creer({ acheteur: 'Commune de Digne-les-Bains', objet: 'AMO programmation cantine' }).id;
  A.Affaires_changerStatut(id, 'Go', {});
  A.Affaires_changerStatut(id, 'Déposée', { montant_ht: 40800, jours_reponse: 4 });
  A.Affaires_changerStatut(id, 'Gagnée', { date_notification: '2026-11-10', montant_notifie: 40800 });
  const ok = (r) => { assert.ok(r.ok, r.erreur); return brut(r.data); };
  let f = ok(A.apiLivrableAjouter(id, { tranche: 'tf', libelle: 'Rapport de diagnostic', date_echeance: '2026-11-20' }));
  f = ok(A.apiLivrableAjouter(id, { tranche: 'TF', libelle: 'Plan de phasage détaillé', date_echeance: '2026-11-12' }));
  f = ok(A.apiLivrableAjouter(id, { tranche: 'TO1', libelle: 'Programme fonctionnel et technique' }));
  assert.deepStrictEqual(f.livrables.map((l) => l.libelle), ['Plan de phasage détaillé', 'Rapport de diagnostic', 'Programme fonctionnel et technique']); // par échéance, sans date à la fin
  assert.strictEqual(f.livrables[1].tranche, 'TF');
  assert.match(A.apiLivrableAjouter(id, { libelle: '' }).erreur, /obligatoire/);
  assert.match(A.apiLivrableMaj(id, f.livrables[0].id, { etat: 'perdu' }).erreur, /État attendu/);
  assert.match(A.apiLivrableMaj(id, f.livrables[0].id, { lien: 'ftp://x' }).erreur, /https:\/\//);
  assert.match(A.apiLivrableMaj(id, f.livrables[0].id, { date_echeance: 'demain' }).erreur, /date attendue/);
  // Synthèse : prochain livrable à remettre
  assert.deepStrictEqual(f.livrablesResume, { total: 3, valides: 0, remis: 0, prochain: { libelle: 'Plan de phasage détaillé', tranche: 'TF', date: '2026-11-12' } });
  // Échéancier : livrables à remettre (le plan de phasage est en retard au 18/11)
  const quand = new Date(2026, 10, 18, 7);
  let ech = brut(A.Echeances_calculer(new Date(2026, 10, 18), new Date(2026, 11, 31), quand)).filter((e) => e.type === 'Livrable');
  assert.deepStrictEqual(ech.map((e) => [e.libelle, e.jours, e.depassee]), [
    ['Livrable à remettre : Plan de phasage détaillé (TF)', -6, true],
    ['Livrable à remettre : Rapport de diagnostic (TF)', 2, false]]);
  assert.match(A.Email_construire(quand).html, /Livrable à remettre : Rapport de diagnostic \(TF\)/);
  // Remis, puis validé : plus d'échéance
  f = ok(A.apiLivrableMaj(id, f.livrables[0].id, { etat: 'remis', indice: 'a', lien: 'https://drive.google.com/file/d/x' }));
  f = ok(A.apiLivrableMaj(id, f.livrables.find((l) => l.libelle === 'Rapport de diagnostic').id, { etat: 'validé' }));
  assert.strictEqual(f.livrables[0].indice, 'A');
  assert.deepStrictEqual([f.livrablesResume.remis, f.livrablesResume.valides], [2, 1]);
  assert.strictEqual(f.livrablesResume.prochain.libelle, 'Programme fonctionnel et technique');
  ech = brut(A.Echeances_calculer(new Date(2026, 10, 18), new Date(2026, 11, 31), quand)).filter((e) => e.type === 'Livrable');
  assert.strictEqual(ech.length, 0);
  // Retrait
  f = ok(A.apiLivrableSupprimer(id, f.livrables[2].id));
  assert.strictEqual(f.livrables.length, 2);
});

// ——— Module Estimation, étape 0 : deux classeurs, deux fichiers ———

test('estimation (étape 0) : installer() crée aussi le classeur « Kartes Estimation — données »', () => {
  const env = creerEnvironnement();
  const r = env.ctx.installer({ exercice: false });
  const noms = Object.values(env.classeurs).map((c) => c.getName());
  assert.deepStrictEqual(noms, ['Kartes Affaires — données', 'Kartes Estimation — données']);
  assert.ok(env.proprietes.CLASSEUR_EST_ID);
  assert.match(r.classeurEstimation, /spreadsheets/);
  env.ctx.installer({ exercice: false }); // idempotent : pas de 3e classeur
  assert.strictEqual(Object.values(env.classeurs).length, 2);
});

test('estimation (étape 0) : une table EST s\'écrit dans son classeur, sans collision de nom d\'onglet', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  // Table de test du module, même nom d'onglet qu'une table du suivi
  A.EST_TABLES.TEST = { onglet: 'Paramètres', classeur: 'EST', cle: 'cle', colonnes: ['cle', 'valeur'] };
  A.installer({ exercice: false });
  A.Db_inserer(A.EST_TABLES.TEST, { cle: 'est.essai', valeur: 'oui' });
  const [suivi, est] = Object.values(env.classeurs);
  assert.ok(est.getSheetByName('Paramètres').lignes.some((l) => l[0] === 'est.essai'));
  assert.ok(!suivi.getSheetByName('Paramètres').lignes.some((l) => l[0] === 'est.essai'));
  assert.strictEqual(A.Db_trouver(A.EST_TABLES.TEST, 'est.essai').valeur, 'oui');
  assert.strictEqual(A.Db_trouver(A.TABLES.PARAMETRES, 'est.essai'), null);
  assert.ok(A.Params_texte('veille.cpv').length > 0); // le suivi lit toujours son propre onglet
});

test('estimation (étape 0) : contrôle des versions Code.gs / Estimation.gs', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  assert.deepStrictEqual(brut(env.ctx.Etat_alertes_()), []);
  assert.strictEqual(env.ctx.EST_VERSION, env.ctx.APP.VERSION);
  env.ctx.EST_VERSION = '1.2.9';
  assert.match(env.ctx.Etat_alertes_()[0], /Versions différentes : Code\.gs v[\d.]+, Estimation\.gs v1\.2\.9/);
  // Estimation.gs oublié lors du collage : le suivi fonctionne et l'accueil le signale
  const sans = creerEnvironnement({ dist: true, sansEstimation: true });
  sans.ctx.installer({ exercice: false });
  const etat = sans.ctx.apiEtat();
  assert.ok(etat.ok, etat.erreur);
  assert.match(etat.data.alertes[0], /Estimation\.gs est absent/);
  assert.ok(sans.ctx.apiCompteurCA().ok);
  // Estimation.gs chargé avant Code.gs dans l'éditeur : aucune erreur au chargement
  const inverse = creerEnvironnement({ dist: true, ordre: 'estimation-avant' });
  inverse.ctx.installer({ exercice: false });
  assert.deepStrictEqual(brut(inverse.ctx.Etat_alertes_()), []);
});

// ——— Module Estimation, étape 1 : référentiels ———

test('estimation (étape 1) : onglets du classeur EST et référentiels initiaux', () => {
  const env = creerEnvironnement();
  const r = env.ctx.installer({ exercice: false });
  const est = Object.values(env.classeurs)[1];
  assert.deepStrictEqual(est.getSheets().map((f) => f.getName()),
    ['Paramètres', 'Lots', 'Familles d\'ouvrage', 'Typologies', 'Coefficient K', 'Estimations', 'Index Insee', 'Valeurs des index', 'Journal du module', 'Lignes d\'estimation', 'Imports', 'Observations']);
  assert.deepStrictEqual(brut(r.estimation.ajouts), { parametres: 17, lots: 20, typologies: 10, k: 114, index: 66 });
  const A = env.ctx;
  assert.strictEqual(A.Db_trouver(A.EST_TABLES.LOTS, 'ELE').indice, 'BT47');
  assert.strictEqual(A.Db_trouver(A.EST_TABLES.LOTS, 'CHARP').indice, 'BT16b');
  assert.strictEqual(A.Est_param_('est.indice_rehab'), 'BT50');
  assert.strictEqual(A.Est_paramNombre_('est.tva_defaut', 0), 20);
  assert.deepStrictEqual(brut(A.Est_paramDico_('est.aleas')), { Programme: '15', APS: '10', APD: '7', DCE: '5' });
  // Relancer installer() n'écrase pas vos modifications et n'ajoute rien
  A.Est_refModifier_('LOTS', 'GO', { indice: 'BT03' });
  const r2 = A.installer({ exercice: false });
  assert.deepStrictEqual(brut(r2.estimation.ajouts), { parametres: 0, lots: 0, typologies: 0, k: 0, index: 0 });
  assert.strictEqual(A.Db_trouver(A.EST_TABLES.LOTS, 'GO').indice, 'BT03');
});

test('estimation (étape 1) : édition des référentiels contrôlée', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const ok = (r) => { assert.ok(r.ok, r.erreur); return r.data; };
  const ko = (r, motif) => { assert.strictEqual(r.ok, false); assert.match(r.erreur, motif); };
  // Coefficient K : nombre > 0, virgule acceptée
  const k = ok(A.apiEstRefAjouter('K', { facteur: 'Localisation', modalite: 'Zone de montagne', coefficient: '1,08', actif: 'oui' }));
  assert.match(k.id, /^KF-/);
  assert.strictEqual(k.coefficient, 1.08);
  ko(A.apiEstRefAjouter('K', { facteur: 'X', modalite: 'Y', coefficient: '9' }), /entre −1 et 3/);
  ok(A.apiEstRefAjouter('K', { facteur: 'klieu', modalite: 'Essai', coefficient: '-0,02' })); // ajouts négatifs admis
  ko(A.apiEstRefModifier('K', k.id, { coefficient: 'abc' }), /nombre attendu/);
  // Codes : majuscules, unicité
  const lot = ok(A.apiEstRefAjouter('LOTS', { code: 'desam', libelle: 'Désamiantage', famille: 'batiment', indice: 'bt50', ordre: '1' }));
  assert.strictEqual(lot.code, 'DESAM');
  assert.strictEqual(lot.indice, 'BT50');
  assert.strictEqual(lot.actif, 'oui');
  ko(A.apiEstRefAjouter('LOTS', { code: 'DEM', libelle: 'doublon' }), /existe déjà/); // lot par défaut
  ko(A.apiEstRefAjouter('LOTS', { code: 'X', famille: 'route' }), /parmi batiment, vrd/);
  // Famille d'ouvrage : lot existant obligatoire
  ko(A.apiEstRefAjouter('FAMILLES', { code: 'F1', lot: 'INCONNU', libelle: 'x' }), /Lot inconnu/);
  ok(A.apiEstRefAjouter('FAMILLES', { code: 'GO-FOND', lot: 'GO', libelle: 'Fondations', unite: 'm3', mots_cles: 'semelle;fondation;longrine' }));
  // Paramètres : modification seule, clé inchangée
  ko(A.apiEstRefAjouter('PARAMS', { cle: 'est.nouveau', valeur: '1' }), /Ajout impossible/);
  ok(A.apiEstRefModifier('PARAMS', 'est.seuil_anonymat', { valeur: '4', cle: 'pirate' }));
  assert.strictEqual(A.Est_paramNombre_('est.seuil_anonymat', 0), 4);
  ko(A.apiEstRefModifier('LOTS', 'NEXISTEPAS', { libelle: 'x' }), /introuvable/);
  // Lecture pour l'écran : ordre respecté, description des colonnes
  const refs = ok(A.apiEstReferentiels());
  assert.strictEqual(refs.LOTS.lignes[0].code, 'DESAM'); // ordre 1
  assert.ok(refs.K.colonnes.some((c) => c.nom === 'coefficient' && c.type === 'nombre'));
  assert.strictEqual(refs.PARAMS.sansAjout, true);
});

test('estimation (étape 1) : écran Estimation et onglet de la fiche affaire', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const id = A.Affaires_creer({ acheteur: 'Commune de Digne-les-Bains', objet: 'Programmation cantine' }).id;
  assert.deepStrictEqual(brut(A.apiEstAccueil().data.estimations), []);
  A.Db_inserer(A.EST_TABLES.ESTIMATIONS, { id_affaire: id, phase: 'Programme', indice: 'A', typologie: 'REST', statut: 'brouillon', total_ht: 1250000 });
  const acc = A.apiEstAccueil().data;
  assert.strictEqual(acc.estimations[0].acheteur, 'Commune de Digne-les-Bains');
  assert.strictEqual(A.apiEstAffaire(id).data.length, 1);
  assert.strictEqual(A.apiEstAffaire('KI-2099-999').data.length, 0);
  assert.strictEqual(A.apiEtat().data.onglets.length, 15 + 12);
});

// ——— Module Estimation, étapes 4 à 6 : bibliothèque, estimation au ratio, export ———

const POSTES_SCORPION = [
  '2\tDispositions générales\t66 261 €\t2,6 %\t84 €', '2\tDémolitions\t40 774 €', '2\tGros œuvre\t902 319 €', '2\tPlâtrerie\t36 962 €',
  '2\tRevêtements céramiques\t18 699,80 €', '2\tMenuiseries\t73 738 €', '2\tÉquipements (atelier)\t65 420 €', '2\tNettoyage\t1 980 €',
  '3\tDispositions générales\t847,08 €', '3\tÉlectricité\t262 714,34 €', '3\tCahier des charges DANZ\t22 294,59 €',
  '4\tDispositions générales\t19 372,50 €', '4\tPlomberie\t73 672,50 €', '4\tGénie climatique\t41 422,50 €',
  '5\tDispositions générales\t41 000 €', '5\tBardage - couverture (atelier)\t466 760 €', '5\tStructure métallique - couverture de l\'aire de lavage\t151 900 €',
  '5\tPortes de hangar\t248 860 €', '\tTotal lots 2 à 5\t2 534 997 €'
].join('\n');
const envEstimation = () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  env.ctx.Est_indicesMettreAJour();
  return env;
};
const okE = (r) => { assert.ok(r.ok, r.erreur); return brut(r.data); };

test('bibliothèque (étape 4) : postes collés, lots devinés, total écarté ; import anonyme par lot ; annulation', () => {
  const env = envEstimation();
  const A = env.ctx;
  const an = okE(A.apiEstAnalyserPostes(POSTES_SCORPION));
  assert.strictEqual(an.postes.length, 18);
  assert.deepStrictEqual(an.ecartees.map((e) => e.motif), ['ligne de total']);
  const lot = (lib) => an.postes.find((p) => p.libelle === lib);
  assert.deepStrictEqual([lot('Dispositions générales').montant, lot('Revêtements céramiques').montant], [66261, 18699.8]); // plus grand nombre, % ignorés
  assert.deepStrictEqual(['Démolitions', 'Gros œuvre', 'Plâtrerie', 'Revêtements céramiques', 'Menuiseries', 'Nettoyage', 'Génie climatique', 'Bardage - couverture (atelier)', 'Portes de hangar']
    .map((l) => lot(l).lot), ['DEM', 'GO', 'PLAT', 'REV-SOL', 'MEN-INT', 'DG', 'CVC', 'COUV', 'SERR']);
  assert.strictEqual(lot('Cahier des charges DANZ').lot, ''); // non reconnu : à choisir
  assert.strictEqual(lot("Structure métallique - couverture de l'aire de lavage").lot, 'CHARP'); // mot le plus long
  // Lot manquant : refus
  assert.match(A.apiEstImporter({ typologie: 'MIL', nature: 'Réhabilitation lourde', departement: '2B', m0: '05/2026', surface: '790', postes: an.postes }).erreur, /DANZ.*choisissez un lot/);
  assert.match(A.apiEstImporter({ typologie: 'MIL', nature: 'Réhabilitation lourde', departement: '2B', m0: '2026', surface: '790', postes: [] }).erreur, /Mois M0/);
  const postes = an.postes.map((p) => Object.assign(p, { lot: p.lot || 'ELE' }));
  const r = okE(A.apiEstImporter({ typologie: 'MIL', nature: 'Réhabilitation lourde', departement: '2b', m0: '05/2026', surface: '790', commentaire: 'atelier + aire de lavage', postes }));
  assert.match(r.id, /^IM-/);
  const imp = r.imports[0];
  assert.strictEqual(imp.total_ht, 2534997.31);
  assert.strictEqual(imp.departement, '2B');
  assert.strictEqual(imp.observations.length, 13); // un lot = une observation (4 lignes DG + nettoyage → DG)
  const dg = imp.observations.find((o) => o.lot === 'DG');
  assert.strictEqual(dg.montant_ht, 129460.58);
  assert.strictEqual(dg.ratio, 163.87);
  // Aucune donnée d'entreprise : seules les colonnes prévues
  assert.deepStrictEqual(Object.keys(A.Db_lire(A.EST_TABLES.OBSERVATIONS)[0]).filter((k) => !['cree_le', 'modifie_le'].includes(k)),
    ['id', 'id_import', 'typologie', 'nature', 'departement', 'm0', 'lot', 'postes', 'montant_ht', 'surface', 'ratio', 'statut']);
  // Ratios : actualisés (index du lot, 05/2026 → 09/2026), même famille de nature, fiabilité C, sous le seuil mais utilisables
  const ratios = okE(A.apiEstRatios('MIL', 'Réhabilitation légère'));
  const go = ratios.find((x) => x.lot === 'GO');
  assert.strictEqual(go.n, 1);
  assert.strictEqual(go.indice, 'BT06');
  assert.strictEqual(go.moisIndice, '2026-09');
  assert.ok(go.mediane > 1142.18 && go.mediane < 1160, 'médiane actualisée ' + go.mediane);
  assert.deepStrictEqual([go.fiabilite, go.sousSeuil, go.utilisable], ['C', true, true]);
  assert.strictEqual(ratios.find((x) => x.lot === 'DG').indice, 'BT50'); // lot sans index, réhabilitation
  assert.deepStrictEqual(okE(A.apiEstRatios('MIL', 'Neuf')), []);
  assert.deepStrictEqual(okE(A.apiEstRatios('ECOLE', 'Réhabilitation lourde')), []);
  A.Est_refModifier_('PARAMS', 'est.ratio_sous_seuil', { valeur: 'non' });
  assert.strictEqual(okE(A.apiEstRatios('MIL', 'Réhabilitation lourde'))[0].utilisable, false);
  // Annulation : observations écartées des ratios, conservées pour la trace
  const ann = okE(A.apiEstAnnulerImport(r.id));
  assert.strictEqual(ann.imports[0].statut, 'annulé');
  assert.ok(ann.imports[0].observations.every((o) => o.statut === 'annulé'));
  assert.deepStrictEqual(okE(A.apiEstRatios('MIL', 'Réhabilitation lourde')), []);
});

test('estimation au ratio (étape 5) : K, projection, aléas, TVA Corse ; lot sans ratio à saisir ; indice ; figée', () => {
  const env = envEstimation();
  const A = env.ctx;
  const postes = okE(A.apiEstAnalyserPostes(POSTES_SCORPION)).postes.map((p) => Object.assign(p, { lot: p.lot || 'ELE' }));
  okE(A.apiEstImporter({ typologie: 'MIL', nature: 'Réhabilitation lourde', departement: '2B', m0: '05/2026', surface: '790', postes }));
  const aff = A.Affaires_creer({ acheteur: 'Commune test', objet: 'Atelier', departement: '2A' }).id;
  const f = okE(A.apiEstFormulaire(aff));
  assert.strictEqual(f.choisie, aff);
  assert.deepStrictEqual(f.phases, ['Programme', 'APS', 'APD', 'DCE']);
  const kdep = f.k['kdép'].find((x) => x.modalite.startsWith('2A')).id; // 1,03
  const kalt = f.k.kalt.find((x) => x.coefficient === 0.05).id;
  const d = { id_affaire: aff, phase: 'APS', typologie: 'MIL', nature: 'Réhabilitation lourde', departement: '2A', surface: '500',
    k_ids: [kdep, kalt], date_travaux: '06/2027', lots: ['GO', 'ELE', 'ASC'] };
  assert.match(A.apiEstApercu(Object.assign({}, d, { k_ids: [kalt] })).erreur, /kdép/);
  assert.match(A.apiEstApercu(Object.assign({}, d, { lots: [] })).erreur, /au moins un lot/);
  const ap = okE(A.apiEstApercu(d));
  assert.strictEqual(ap.k.k, 1.08);
  const go = ap.lignes.find((l) => l.lot === 'GO');
  const ratioGo = okE(A.apiEstRatios('MIL', 'Réhabilitation lourde')).find((x) => x.lot === 'GO').mediane;
  assert.strictEqual(go.coef_actualisation, 1.0383); // 9 mois × 5,10 % / 12
  assert.strictEqual(go.pu_ht, Math.round(ratioGo * 1.03825 * 1.08 * 100) / 100);
  assert.strictEqual(go.total_ht, Math.round(go.pu_ht * 500 * 100) / 100);
  assert.match(go.commentaire, /Médiane de 1 marché\(s\).*BT06 09\/2026 ; projection 06\/2027/);
  const asc = ap.lignes.find((l) => l.lot === 'ASC');
  assert.deepStrictEqual([asc.pu_ht, asc.source, asc.fiabilite], [0, 'saisie', 'C']);
  assert.ok(ap.avertissements.some((a) => /^ASC : aucun marché importé/.test(a)));
  assert.strictEqual(ap.entete.tva, 10); // Corse
  assert.strictEqual(ap.entete.aleas_pct, 10); // APS
  assert.ok(Math.abs(ap.totaux.ttc - (go.total_ht + ap.lignes.find((l) => l.lot === 'ELE').total_ht) * 1.1 * 1.1) < 0.01);
  assert.strictEqual(A.Db_lire(A.EST_TABLES.ESTIMATIONS).length, 0); // aperçu : rien d'enregistré
  // Création : indice A puis B pour la même phase
  const c = okE(A.apiEstCreer(d));
  assert.deepStrictEqual([c.estimation.indice, c.estimation.statut, c.estimation.mode, c.lignes.length], ['A', 'brouillon', 'ratio', 3]);
  assert.deepStrictEqual(c.lignes.map((l) => l.num_article + ' ' + l.lot), ['01 GO', '02 ELE', '03 ASC']);
  assert.strictEqual(okE(A.apiEstCreer(d)).estimation.indice, 'B');
  assert.strictEqual(okE(A.apiEstAffaire(aff)).length, 2);
  // PU saisi sur le lot sans ratio : source « saisie », totaux recalculés et enregistrés
  const ligneAsc = c.lignes.find((l) => l.lot === 'ASC');
  const m = okE(A.apiEstLigneMaj(ligneAsc.id, { pu_ht: '120,50' }));
  assert.strictEqual(m.lignes.find((l) => l.lot === 'ASC').total_ht, 60250);
  assert.strictEqual(m.estimation.total_ht, Math.round(m.totaux.htAleas * 100) / 100);
  assert.match(A.apiEstLigneMaj(ligneAsc.id, { pu_ht: '-3' }).erreur, /positif/);
  // Figée : plus de modification ni de suppression
  okE(A.apiEstFiger(c.estimation.id));
  assert.match(A.apiEstLigneMaj(ligneAsc.id, { pu_ht: '1' }).erreur, /figée/);
  assert.match(A.apiEstSupprimer(c.estimation.id).erreur, /figée/);
  // Suppression d'un brouillon et de ses lignes
  const b = okE(A.apiEstAffaire(aff)).find((e) => e.indice === 'B');
  okE(A.apiEstSupprimer(b.id));
  assert.strictEqual(A.Db_lire(A.EST_TABLES.LIGNES).filter((l) => l.id_estimation === b.id).length, 0);
});

test('brouillon : les lots au ratio suivent la bibliothèque (import, annulation) ; PU saisi conservé ; figée inchangée', () => {
  const env = envEstimation();
  const A = env.ctx;
  const aff = A.Affaires_creer({ acheteur: 'Commune test', objet: 'Atelier', departement: '2B' }).id;
  const f = okE(A.apiEstFormulaire(aff));
  const d = { id_affaire: aff, phase: 'APS', typologie: 'MIL', nature: 'Réhabilitation lourde', departement: '2B', surface: '400',
    k_ids: [f.k['kdép'].find((x) => x.modalite.startsWith('2B')).id], lots: ['GO', 'ELE', 'ASC'] };
  // Estimation créée avant tout import : aucun ratio, PU à 0
  const avant = okE(A.apiEstCreer(d));
  assert.ok(avant.lignes.every((l) => l.pu_ht === 0 && l.id_source === 'sans ratio'));
  const fige = okE(A.apiEstCreer(d));
  okE(A.apiEstFiger(fige.estimation.id));
  // PU saisi à la main sur l'ascenseur : conservé
  okE(A.apiEstLigneMaj(avant.lignes.find((l) => l.lot === 'ASC').id, { pu_ht: '95' }));
  // Import : le brouillon est mis à jour, pas l'estimation figée
  const postes = okE(A.apiEstAnalyserPostes(POSTES_SCORPION)).postes.map((p) => Object.assign(p, { lot: p.lot || 'ELE' }));
  const imp = okE(A.apiEstImporter({ typologie: 'MIL', nature: 'Réhabilitation lourde', departement: '2B', m0: '05/2026', surface: '790', postes }));
  assert.strictEqual(imp.brouillonsActualises, 1);
  const apres = okE(A.apiEstEstimation(avant.estimation.id));
  assert.strictEqual(apres.lignesActualisees, 0); // déjà fait à l'import
  const go = apres.lignes.find((l) => l.lot === 'GO');
  assert.deepStrictEqual([go.source, go.id_source, go.fiabilite], ['ratio', '1 marché(s)', 'C']);
  assert.strictEqual(go.total_ht, Math.round(go.pu_ht * 400 * 100) / 100);
  assert.ok(go.pu_ht > 1100);
  assert.strictEqual(apres.lignes.find((l) => l.lot === 'ASC').pu_ht, 95);
  assert.strictEqual(apres.estimation.total_ht, Math.round(apres.totaux.htAleas * 100) / 100);
  assert.doesNotMatch(apres.estimation.commentaire, /GO : aucun marché/);
  assert.ok(okE(A.apiEstEstimation(fige.estimation.id)).lignes.every((l) => l.pu_ht === 0));
  // Ouverture d'un brouillon dont la bibliothèque a changé hors import (ex. nouvel index) : actualisé à l'ouverture
  A.Db_maj(A.EST_TABLES.LIGNES, go.id, { pu_ht: 1, total_ht: 400 });
  const rouvert = okE(A.apiEstEstimation(avant.estimation.id));
  assert.strictEqual(rouvert.lignesActualisees, 1);
  assert.strictEqual(rouvert.lignes.find((l) => l.lot === 'GO').pu_ht, go.pu_ht);
  // Annulation de l'import : le brouillon revient à « PU à saisir » pour les lots au ratio
  const ann = okE(A.apiEstAnnulerImport(imp.id));
  assert.strictEqual(ann.brouillonsActualises, 1);
  const sans = okE(A.apiEstEstimation(avant.estimation.id));
  assert.deepStrictEqual(sans.lignes.map((l) => l.lot + ' ' + l.pu_ht), ['GO 0', 'ELE 0', 'ASC 95']);
});

test('fiabilité des ratios : A à partir de 5 marchés récents de la même région (2A + 2B = Corse), B sinon', () => {
  const env = envEstimation();
  const A = env.ctx;
  assert.deepStrictEqual(['2B', '2a', '13', '4', '974', '69'].map((d) => A.Est_region_(d)), ['COR', 'COR', 'PAC', 'PAC', '974', 'ARA']);
  const importer = (dep, m0) => okE(A.apiEstImporter({ typologie: 'ECOLE', nature: 'Neuf', departement: dep, m0, surface: '1000',
    postes: [{ libelle: 'Gros œuvre', lot: 'GO', montant: '800000' }] }));
  const fiab = () => okE(A.apiEstRatios('ECOLE', 'Neuf'))[0].fiabilite;
  ['2B', '2B', '2A', '2A'].forEach((d) => importer(d, '05/2025'));
  assert.strictEqual(fiab(), 'C'); // 4 marchés
  const cinq = importer('2B', '05/2025');
  assert.strictEqual(fiab(), 'A'); // 5 marchés, tous en Corse, moins de 3 ans
  const pac = importer('13', '05/2025');
  assert.strictEqual(fiab(), 'B'); // autre région
  okE(A.apiEstAnnulerImport(pac.id));
  assert.strictEqual(fiab(), 'A');
  importer('2A', '01/2022'); // plus de 3 ans avant le dernier index (09/2026)
  assert.strictEqual(fiab(), 'B');
  assert.ok(cinq.id);
});

test('export .xlsx (étape 6) : formules, dépôt dans « 09 Estimations » sans écraser, classeur temporaire supprimé', () => {
  const env = envEstimation();
  const A = env.ctx;
  const postes = okE(A.apiEstAnalyserPostes(POSTES_SCORPION)).postes.map((p) => Object.assign(p, { lot: p.lot || 'ELE' }));
  okE(A.apiEstImporter({ typologie: 'MIL', nature: 'Réhabilitation lourde', departement: '2B', m0: '05/2026', surface: '790', postes }));
  const aff = A.Affaires_creer({ acheteur: 'Commune test', objet: 'Atelier', departement: '2B' }).id;
  const f = okE(A.apiEstFormulaire(aff));
  const c = okE(A.apiEstCreer({ id_affaire: aff, phase: 'APD', typologie: 'MIL', nature: 'Réhabilitation lourde', departement: '2B', surface: '600',
    k_ids: [f.k['kdép'].find((x) => x.modalite.startsWith('2B')).id], lots: ['DG', 'GO', 'ELE'] }));
  const ex = okE(A.apiEstExporter(c.estimation.id));
  assert.strictEqual(ex.nom, aff + ' — Estimation APD — ind A.xlsx');
  assert.strictEqual(ex.dossier, '09 Estimations');
  assert.ok(ex.estimation.estimation.export_url);
  const fichier = env.fichiersDrive.find((x) => x.nom === ex.nom);
  assert.strictEqual(fichier.dossier.getName(), '09 Estimations');
  assert.ok(A.UrlFetchApp.appels.some((u) => /export\?format=xlsx/.test(u)));
  assert.strictEqual(A.DriveApp.corbeille.length, 1); // classeur temporaire à la corbeille
  // Feuille temporaire : 3 lignes de lot (formules Quantité × PU) puis totaux en formules
  const temp = Object.values(env.classeurs).find((s) => /^Export temporaire/.test(s.getName()));
  const fl = temp.getSheets()[0];
  assert.strictEqual(fl.getName(), 'Estimation');
  assert.deepStrictEqual(fl.lignes[5].slice(0, 5), ['01', 'Dispositions générales, installations de chantier', 'm²', 600, ex.estimation.lignes[0].pu_ht]);
  assert.strictEqual(fl.formules['6,6'], '=D6*E6');
  assert.strictEqual(fl.formules['9,6'], '=SUM(F6:F8)');
  assert.strictEqual(fl.formules['10,6'], '=F9*0.07'); // aléas APD
  assert.strictEqual(fl.formules['12,6'], '=F11*0.1'); // TVA Corse
  assert.match(fl.lignes.map((l) => (l || [])[0]).join('\n'), /Coefficient de localisation K = 1/);
  // Second export : nouveau nom, aucun écrasement ; note au journal de l'affaire
  const ex2 = okE(A.apiEstExporter(c.estimation.id));
  assert.strictEqual(ex2.nom, aff + ' — Estimation APD — ind A (2).xlsx');
  assert.match(A.Affaires_get_(aff).notes, /Estimation exportée : 09 Estimations \/ .*ind A \(2\)\.xlsx/);
  // Export refusé par Google : erreur lisible, classeur temporaire tout de même supprimé
  const env2 = creerEnvironnement({ exportHttp: 403 });
  env2.ctx.installer({ exercice: false });
  env2.ctx.Est_indicesMettreAJour();
  const B = env2.ctx;
  const aff2 = B.Affaires_creer({ acheteur: 'X', objet: 'Y', departement: '04' }).id;
  const f2 = okE(B.apiEstFormulaire(aff2));
  const c2 = okE(B.apiEstCreer({ id_affaire: aff2, phase: 'APS', typologie: 'MIL', nature: 'Neuf', departement: '04', surface: '100',
    k_ids: [f2.k['kdép'].find((x) => x.modalite.startsWith('04')).id], lots: ['GO'] }));
  assert.match(B.apiEstExporter(c2.estimation.id).erreur, /HTTP 403/);
  assert.strictEqual(B.DriveApp.corbeille.length, 1);
});

// ——— Module Estimation, étape 2 : index Insee ———

test('index Insee : 66 séries chargées (idbank vérifiés), 4 arrêtées, déclencheur mensuel le 20', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const series = A.Db_lire(A.EST_TABLES.INDICES);
  assert.strictEqual(series.length, 66);
  assert.deepStrictEqual(series.filter((x) => x.arretee === 'oui').map((x) => x.code), ['BT12', 'TP10a', 'TP13', 'TP14']);
  const idb = (c) => A.Db_trouver(A.EST_TABLES.INDICES, c).idbank;
  assert.deepStrictEqual(['BT01', 'BT02', 'BT38', 'BT47', 'BT50', 'TP01', 'TP08', 'BT54', 'TP10d', 'TP13a', 'ING'].map(idb),
    ['001710986', '001710950', '001710972', '001710979', '001710982', '001711007', '001710996', '001711942', '010605983', '010777583', '001711010']);
  const t = env.declencheurs.find((x) => x.getHandlerFunction() === 'estIndicesMensuel');
  assert.ok(t);
  // chaque lot pointe vers un index connu
  // Lots sans index (DG, DEM, EQUIP) : index par défaut selon la nature (BT01 neuf, BT50 réhabilitation)
  assert.deepStrictEqual(A.Db_lire(A.EST_TABLES.LOTS).filter((l) => !l.indice).map((l) => l.code), ['DG', 'DEM', 'EQUIP']);
  A.Db_lire(A.EST_TABLES.LOTS).filter((l) => l.indice).forEach((l) => assert.ok(A.Db_trouver(A.EST_TABLES.INDICES, l.indice), l.code + ' → ' + l.indice));
});

test('index Insee : lecture d\'une vraie réponse SDMX de la BDM (BT01, BT50, TP01)', () => {
  const env = creerEnvironnement();
  const xml = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'insee-bt01-bt50-tp01.xml'), 'utf8');
  const obs = brut(env.ctx.Est_parserSdmx_(xml));
  const bt01 = obs.filter((o) => o.idbank === '001710986');
  assert.ok(bt01.length >= 20);
  assert.deepStrictEqual(bt01.find((o) => o.mois === '2026-09'), { idbank: '001710986', mois: '2026-09', valeur: 139.1, qualite: 'définitive', date_jo: '' });
  assert.strictEqual(bt01.find((o) => o.mois === '2026-08').date_jo, '2026-10-16');
  assert.ok(obs.some((o) => o.idbank === '001710982') && obs.some((o) => o.idbank === '001711007'));
  assert.throws(() => env.ctx.Est_parserSdmx_('<html>Maintenance</html>'), /illisible/);
});

test('index Insee : premier chargement depuis 2015, puis mises à jour mensuelles sans doublon', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  // 1) Premier chargement : historique depuis 2015-01, 3 requêtes groupées (30 + 30 + 6 séries)
  let b = brut(A.Est_indicesMettreAJour());
  assert.ok(b.ok, b.erreur);
  const appels = A.UrlFetchApp.appels.filter((u) => /insee/.test(u));
  assert.strictEqual(appels.length, 3);
  assert.ok(appels.every((u) => /startPeriod=2015-01/.test(u)));
  assert.strictEqual(b.ajoutees, 66 * 141); // 141 mois de 2015-01 à 2026-09
  assert.strictEqual(b.derniers.BT01, '2026-09');
  assert.strictEqual(A.Est_derniereValeur_('BT01').qualite, 'provisoire');
  assert.strictEqual(A.Est_valeurIndice_('BT47', '2020-01').mois, '2020-01');
  // 2) Mois suivant : 6 derniers mois seulement ; la valeur provisoire devient définitive
  A.UrlFetchApp.appels.length = 0;
  env.ctx.Db_viderCache_();
  const env2opts = { inseeToutDefinitif: true };
  A.UrlFetchApp.fetch = (url) => { A.UrlFetchApp.appels.push(url); return require('./gas-mock').inseeSimule(url, env2opts); };
  b = brut(A.Est_indicesMettreAJour());
  assert.ok(A.UrlFetchApp.appels.every((u) => /lastNObservations=6/.test(u)));
  assert.strictEqual(b.ajoutees, 0);
  assert.strictEqual(b.modifiees, 66);
  assert.strictEqual(A.Est_derniereValeur_('BT01').qualite, 'définitive');
  // 3) Parution d'un nouveau mois : une valeur par index, aucun doublon
  env2opts.inseeDernierMois = '2026-10';
  b = brut(A.Est_indicesMettreAJour());
  assert.strictEqual(b.ajoutees, 66);
  assert.strictEqual(A.Est_derniereValeur_('TP01').mois, '2026-10');
  const cles = A.Db_lire(A.EST_TABLES.INDICES_VALEURS).map((v) => v.cle);
  assert.strictEqual(new Set(cles).size, cles.length);
  // Dernière valeur au plus tard à un mois donné
  assert.strictEqual(A.Est_derniereValeur_('BT01', '2024-03').mois, '2024-03');
});

test('index Insee : panne de l\'API → valeurs conservées, incident signalé (écran et e-mail du matin)', () => {
  const opts = {};
  const env = creerEnvironnement(opts);
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  assert.ok(A.Est_indicesMettreAJour().ok);
  const avant = A.Db_lire(A.EST_TABLES.INDICES_VALEURS).length;
  // 2 échecs puis succès : les 3 essais suffisent
  opts.inseeEchecs = 2;
  assert.ok(A.Est_indicesMettreAJour().ok);
  // 3 échecs : panne
  opts.inseeEchecs = 3;
  const b = brut(A.apiEstIndicesMettreAJour().data);
  assert.strictEqual(b.ok, false);
  assert.match(b.erreur, /API Insee indisponible \(réponse HTTP 503/);
  assert.strictEqual(A.Db_lire(A.EST_TABLES.INDICES_VALEURS).length, avant);
  const etat = A.apiEstIndices().data.etat;
  assert.strictEqual(etat.enEchec, true);
  assert.match(A.Est_alerteEmail_(), /en échec le \d{2}\/\d{2}\/\d{4} .*dernières valeurs connues restent utilisées \(BT01 09\/2026\)/);
  const mail = A.Email_construire(new Date());
  assert.match(mail.html, /Module Estimation/);
  assert.match(mail.texte, /MODULE ESTIMATION/);
  // Retour à la normale : plus d'alerte
  assert.ok(A.Est_indicesMettreAJour().ok);
  assert.strictEqual(A.Est_alerteEmail_(), '');
  assert.doesNotMatch(A.Email_construire(new Date()).html, /Module Estimation/);
  // 404 (aucune observation sur la période) : pas une panne
  opts.insee = () => ({ code: 404, texte: 'NoRecordsFound' });
  assert.ok(A.Est_indicesMettreAJour().ok);
  delete opts.insee;
});

test('index Insee : écran — séries avec dernière valeur et historique', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  assert.strictEqual(A.apiEstIndices().data.etat, null);
  A.apiEstIndicesMettreAJour();
  const d = brut(A.apiEstIndices().data);
  const bt50 = d.series.find((x) => x.code === 'BT50');
  assert.strictEqual(bt50.dernier.mois, '2026-09');
  assert.strictEqual(bt50.dernier.qualite, 'provisoire');
  assert.strictEqual(d.etat.enEchec, false);
  const h = brut(A.apiEstIndiceHistorique('BT50').data);
  assert.strictEqual(h.length, 36);
  assert.strictEqual(h[35].mois, '2026-09');
});

// ——— Module Estimation, étape 3 : moteurs de calcul ———

/** Environnement avec quelques valeurs d'index connues (cas de référence calculés à la main). */
const envCalcul = () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const v = (code, mois, valeur, qualite) => ({ cle: code + '|' + mois, code, mois, valeur, qualite: qualite || 'définitive' });
  A.Db_insererPlusieurs(A.EST_TABLES.INDICES_VALEURS, [
    v('BT47', '2024-03', 129.8), v('BT47', '2026-08', 136.2), v('BT47', '2026-09', 136.4, 'provisoire'),
    v('BT01', '2023-06', 130.0), v('BT01', '2026-09', 139.1),
    v('BT50', '2023-06', 128.0), v('BT50', '2026-09', 141.3),
    v('TP01', '2022-01', 120.0), v('TP01', '2026-09', 142.0),
    v('TP08', '2022-01', 118.5), v('TP08', '2026-09', 141.5),
    v('BT12', '2023-06', 120.0), v('BT12', '2025-12', 142.9)
  ]);
  return A;
};

test('calcul : actualisation par l\'index du lot (BT47 électricité), mois et qualité restitués', () => {
  const A = envCalcul();
  const r = brut(A.Est_actualiser_(100, '03/2024', { lot: 'ELE', nature: 'Neuf' }));
  assert.strictEqual(r.statut, 'ok');
  assert.strictEqual(r.indice, 'BT47');
  assert.strictEqual(r.pu, 105.08); // 100 × 136,4 / 129,8 = 105,0847… → 2 décimales
  assert.strictEqual(Math.round(r.coef * 10000) / 10000, 1.0508);
  assert.deepStrictEqual(r.recent, { code: 'BT47', mois: '2026-09', valeur: 136.4, qualite: 'provisoire' });
  assert.match(r.message, /^BT47 09\/2026 = 136,4 \(provisoire\) ; M0 03\/2024 = 129,8 ; coef\. 1,0508$/);
  // Mois d'index choisi plus ancien que le dernier publié
  assert.strictEqual(A.Est_actualiser_(100, '2024-03', { lot: 'ELE', moisCible: '08/2026' }).pu, 104.93); // 136,2 / 129,8
});

test('calcul : index par défaut — BT01 (neuf), BT50 (réhabilitation), TP01 (VRD), série arrêtée écartée', () => {
  const A = envCalcul();
  // Lot sans index
  A.Est_refAjouter_('LOTS', { code: 'DIV', libelle: 'Divers', famille: 'batiment', indice: '' });
  assert.strictEqual(A.Est_actualiser_(1000, '06/2023', { lot: 'DIV', nature: 'Neuf' }).pu, 1070); // 139,1 / 130
  const rehab = brut(A.Est_actualiser_(1000, '06/2023', { lot: 'DIV', nature: 'Réhabilitation lourde' }));
  assert.strictEqual(rehab.indice, 'BT50');
  assert.strictEqual(rehab.pu, 1103.91); // 141,3 / 128 = 1,103906…
  assert.match(rehab.motif, /défaut \(lot sans index\)/);
  // Lot VRD dont l'index TP08 est désactivé → TP01 (un index inconnu est refusé à la saisie)
  assert.throws(() => A.Est_refModifier_('LOTS', 'VRD', { indice: 'TP99' }), /Index inconnu : TP99/);
  A.Db_maj(A.EST_TABLES.INDICES, 'TP08', { actif: 'non' });
  const vrd = brut(A.Est_actualiser_(50, '01/2022', { lot: 'VRD' }));
  assert.strictEqual(vrd.indice, 'TP01');
  assert.strictEqual(vrd.pu, 59.17); // 142 / 120
  // Index du lot sur une série arrêtée (BT12) → défaut
  A.Est_refModifier_('LOTS', 'REV-SOL', { indice: 'BT12' });
  assert.strictEqual(A.Est_actualiser_(10, '06/2023', { lot: 'REV-SOL', nature: 'Neuf' }).indice, 'BT01');
});

test('calcul : jamais d\'actualisation silencieuse', () => {
  const A = envCalcul();
  const absent = brut(A.Est_actualiser_(100, '01/2010', { lot: 'ELE' }));
  assert.strictEqual(absent.statut, 'non actualisable');
  assert.strictEqual(absent.pu, 100);
  assert.match(absent.message, /BT47 de 01\/2010 introuvable/);
  assert.strictEqual(A.Est_actualiser_(100, '', { lot: 'ELE' }).statut, 'non actualisable');
  // M0 postérieur au dernier index publié : coefficient 1, signalé
  const recent = brut(A.Est_actualiser_(100, '11/2026', { lot: 'ELE' }));
  assert.strictEqual(recent.statut, 'ok');
  assert.strictEqual(recent.coef, 1);
  assert.match(recent.message, /postérieur ou égal au dernier BT47 publié \(09\/2026\)/);
  // API de la calculette
  assert.strictEqual(A.apiEstActualiser('100,00', '03/2024', 'ELE', 'Neuf').data.pu, 105.08);
  assert.match(A.apiEstActualiser('abc', '03/2024', 'ELE').erreur, /nombre attendu/);
  assert.match(A.apiEstActualiser('100', '2024', 'ELE').erreur, /MM\/AAAA/);
});

test('calcul : kloc = kdép + kalt + kagg + klieu (méthode du 16/11/2026)', () => {
  const A = envCalcul();
  assert.strictEqual(A.Est_param_('est.k_mode'), 'kloc');
  const K = A.Db_lire(A.EST_TABLES.K);
  const id = (f, m) => K.find((l) => l.facteur === f && l.modalite.indexOf(m) === 0).id;
  // Tableau kdép (96 départements) : contrôles ponctuels
  assert.strictEqual(K.filter((l) => l.facteur === 'kdép').length, 96);
  assert.strictEqual(A.Est_kdepPour_('04').coefficient, 1.04);
  assert.strictEqual(A.Est_kdepPour_('4').coefficient, 1.04);
  assert.strictEqual(A.Est_kdepPour_('2a').coefficient, 1.03);
  assert.strictEqual(A.Est_kdepPour_('2B').coefficient, 1.00);
  assert.strictEqual(A.Est_kdepPour_('75').coefficient, 1.12);
  assert.strictEqual(A.Est_kdepPour_('13').coefficient, 1.06);
  assert.strictEqual(A.Est_kdepPour_('20'), null);
  const dep04 = A.Est_kdepPour_('04').id;
  const r = brut(A.Est_calculerK_([dep04, id('kalt', 'Altitude > 800'), id('kagg', '25 000 à 100 000 habitants (haut)'), id('klieu', 'Défavorables (+0,01)')]));
  assert.strictEqual(r.mode, 'kloc');
  assert.strictEqual(r.k, 1.12); // 1,04 + 0,05 + 0,02 + 0,01
  assert.strictEqual(A.Est_calculerK_([dep04, id('klieu', 'Très favorables (−0,05)')]).k, 0.99);
  assert.throws(() => A.Est_calculerK_([id('kalt', 'Altitude > 800')]), /choisissez le coefficient départemental \(kdép\)/);
  assert.throws(() => A.Est_calculerK_([dep04, id('klieu', 'Normales'), id('klieu', 'Favorables (−0,01)')]), /Une seule modalité par facteur/);
});

test('calcul : coefficient K (modes produit et somme, une modalité par facteur)', () => {
  const A = envCalcul();
  A.Est_refModifier_('PARAMS', 'est.k_mode', { valeur: 'produit' });
  const k1 = A.Est_refAjouter_('K', { facteur: 'Localisation', modalite: 'Montagne', coefficient: '1,08' }).id;
  const k1b = A.Est_refAjouter_('K', { facteur: 'Localisation', modalite: 'Urbain dense', coefficient: '1,04' }).id;
  const k2 = A.Est_refAjouter_('K', { facteur: 'Contexte', modalite: 'Site occupé', coefficient: '1,05' }).id;
  assert.strictEqual(A.Est_calculerK_([k1, k2]).k, 1.134);
  assert.strictEqual(A.Est_calculerK_([]).k, 1);
  A.Est_refModifier_('PARAMS', 'est.k_mode', { valeur: 'somme' });
  const s = brut(A.Est_calculerK_([k1, k2]));
  assert.strictEqual(s.k, 1.13);
  assert.strictEqual(s.mode, 'somme');
  assert.deepStrictEqual(s.detail.map((d) => d.modalite), ['Montagne', 'Site occupé']);
  assert.throws(() => A.Est_calculerK_([k1, k1b]), /Une seule modalité par facteur/);
  A.Est_refModifier_('K', k2, { actif: 'non' });
  assert.throws(() => A.Est_calculerK_([k2]), /inactif/);
});

test('calcul : médiane et fourchette, aléas, TVA par zone, totaux, projection', () => {
  const A = envCalcul();
  assert.deepStrictEqual(brut(A.Est_stats_([1500, 1200, 1800])), { n: 3, mediane: 1500, min: 1200, max: 1800, q1: 1350, q3: 1650 });
  assert.strictEqual(A.Est_stats_([10, 20, 30, 40]).mediane, 25);
  assert.strictEqual(A.Est_stats_([]).n, 0);
  assert.deepStrictEqual(['Programme', 'APS', 'APD', 'DCE', 'Autre'].map(A.Est_aleasPct_), [15, 10, 7, 5, 0]);
  assert.strictEqual(A.Est_tvaPour_('04'), 20);
  assert.strictEqual(A.Est_tvaPour_('2a'), 10);
  const t = brut(A.Est_totaux_([{ total_ht: 600000 }, { total_ht: 400000 }], 10, 20));
  assert.deepStrictEqual(t, { ht: 1000000, aleas: 100000, htAleas: 1100000, tva: 220000, ttc: 1320000 });
  // Projection (ta, note SID juin 2023) : taux mensuel = annuel / 12, par période
  assert.strictEqual(A.Est_tauxProjection_(2025), 2.7);
  assert.strictEqual(A.Est_tauxProjection_(2027), 5.1);
  assert.strictEqual(A.Est_tauxProjection_(2031), 5.1); // « suite »
  const p = brut(A.Est_projection_('2025-09', '2026-03'));
  assert.strictEqual(p.mois, 6);
  assert.deepStrictEqual(p.detail, [{ annee: 2025, taux: 2.7, mois: 3 }, { annee: 2026, taux: 5.1, mois: 3 }]);
  assert.strictEqual(Math.round(p.coef * 1e6) / 1e6, 1.0195); // méthode simple : 1 + 3 × 0,225 % + 3 × 0,425 %
  assert.strictEqual(Math.round(A.Est_projection_('2026-09', '2029-09').coef * 1e6) / 1e6, 1.153); // 36 mois × 0,425 %
  assert.strictEqual(A.Est_projection_('2026-09', '2028-03', 0).coef, 1);
  assert.strictEqual(A.Est_projection_('2026-09', '', 3).coef, 1);
  // Lecture des mois
  assert.deepStrictEqual(['03/2024', '2024-3', '15/03/2024', 'mars'].map(A.Est_mois_), ['2024-03', '2024-03', '2024-03', '']);
});

// ——— Lot 2 : Affaires ———

const nouvelleAffaire = (env, extra = {}) => env.ctx.Affaires_creer(Object.assign({ acheteur: 'Commune de Test', objet: 'AMO faisabilité' }, extra));

test('affaire : numérotation KI-AAAA-NNN (suite des anciens KA-), statut En étude et historique daté', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const a1 = nouvelleAffaire(env);
  const a2 = nouvelleAffaire(env);
  const an = new Date().getFullYear();
  assert.strictEqual(a1.id, `KI-${an}-001`);
  assert.strictEqual(a2.id, `KI-${an}-002`);
  // Affaire créée avant le renommage (KA-) : la numérotation de l'année continue à la suite, sans doublon
  env.ctx.Db_maj(env.ctx.TABLES.AFFAIRES, a2.id, { id: a2.id }); // (sans effet : la clé ne change pas)
  env.ctx.Db_inserer(env.ctx.TABLES.AFFAIRES, { id: `KA-${an}-007`, acheteur: 'Ancienne', objet: 'AMO', statut: 'No-go' });
  assert.strictEqual(nouvelleAffaire(env).id, `KI-${an}-008`);
  assert.strictEqual(a1.statut, 'En étude');
  const h = env.ctx.Affaires_fiche(a1.id).historique;
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].nouveau_statut, 'En étude');
  assert.ok(h[0].date instanceof Date || typeof h[0].date === 'object');
});

test('affaire : acheteur et objet obligatoires', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  assert.throws(() => env.ctx.Affaires_creer({ objet: 'x' }), /acheteur/);
  assert.throws(() => env.ctx.Affaires_creer({ acheteur: 'x' }), /objet/);
});

test('statuts : passages interdits refusés', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const a = nouvelleAffaire(env);
  assert.throws(() => env.ctx.Affaires_changerStatut(a.id, 'Déposée', { montant_ht: 1, jours_reponse: 1 }), /Passage impossible/);
  assert.throws(() => env.ctx.Affaires_changerStatut(a.id, 'Gagnée', {}), /Passage impossible/);
});

test('règles § 4.1 : No-go exige un motif de la liste', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const a = nouvelleAffaire(env);
  assert.throws(() => env.ctx.Affaires_changerStatut(a.id, 'No-go', {}), /Motif/);
  assert.throws(() => env.ctx.Affaires_changerStatut(a.id, 'No-go', { motif_decision: 'flemme' }), /inconnu/);
  const r = env.ctx.Affaires_changerStatut(a.id, 'No-go', { motif_decision: 'hors zone' });
  assert.strictEqual(r.statut, 'No-go');
  assert.strictEqual(r.decision, 'No-go');
  assert.ok(r.date_decision);
  // Reprise possible
  assert.strictEqual(env.ctx.Affaires_changerStatut(a.id, 'En étude', {}).statut, 'En étude');
});

test('règles § 4.1 : Déposée exige montant HT et jours passés ; Gagnée exige notification et montant', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const a = nouvelleAffaire(env);
  env.ctx.Affaires_changerStatut(a.id, 'Go', {});
  assert.throws(() => env.ctx.Affaires_changerStatut(a.id, 'Déposée', { montant_ht: '12 000' }), /Jours passés/);
  const d = env.ctx.Affaires_changerStatut(a.id, 'Déposée', { montant_ht: '12 000,00 €', jours_reponse: '2', date_depot: '2026-10-01' });
  assert.strictEqual(d.montant_ht, 12000);
  assert.strictEqual(d.jours_reponse, 2);
  assert.strictEqual(env.ctx.jourIso_(d.date_depot), '2026-10-01');
  assert.throws(() => env.ctx.Affaires_changerStatut(a.id, 'Gagnée', { date_notification: '' , montant_notifie: '' }), /notification/);
  const g = env.ctx.Affaires_changerStatut(a.id, 'Gagnée', { date_notification: '2026-11-02', montant_notifie: 12000 });
  assert.strictEqual(g.statut_final, 'Gagnée');
  assert.strictEqual(env.ctx.Affaires_fiche(a.id).historique.length, 4);
});

test('règles § 4.1 : Perdue crée la relance « motifs du rejet »', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const a = nouvelleAffaire(env);
  env.ctx.Affaires_changerStatut(a.id, 'Go', {});
  env.ctx.Affaires_changerStatut(a.id, 'Déposée', { montant_ht: 5000, jours_reponse: 1 });
  env.ctx.Affaires_changerStatut(a.id, 'Perdue', { date_resultat: '2026-11-06' });
  const rel = env.ctx.Affaires_fiche(a.id).relances;
  assert.strictEqual(rel.length, 1);
  assert.strictEqual(rel[0].type, 'Motifs du rejet');
  assert.strictEqual(rel[0].statut, 'à faire');
});

test('règles § 4.1 : Soldée automatiquement quand l\'encaissé atteint le notifié', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const a = nouvelleAffaire(env);
  env.ctx.Affaires_changerStatut(a.id, 'Go', {});
  env.ctx.Affaires_changerStatut(a.id, 'Déposée', { montant_ht: 10000, jours_reponse: 1 });
  env.ctx.Affaires_changerStatut(a.id, 'Gagnée', { date_notification: '2026-06-01', montant_notifie: 10000 });
  const f1 = env.ctx.Factures_ajouter(a.id, { numero: 'F1', date: '2026-07-01', montant: 6000 });
  assert.strictEqual(env.ctx.jourIso_(f1.date_echeance), '2026-07-31'); // délai public 30 j
  env.ctx.Factures_maj(f1.id, { date_encaissement: '2026-07-20', montant_encaisse: 6000 });
  assert.strictEqual(env.ctx.Affaires_get_(a.id).statut, 'Gagnée');
  const fiche = env.ctx.Affaires_fiche(a.id);
  assert.strictEqual(fiche.totaux.resteAFacturer, 4000);
  env.ctx.Factures_ajouter(a.id, { numero: 'F2', date: '2026-09-01', montant: 4000, date_encaissement: '2026-09-25', montant_encaisse: 4000 });
  assert.strictEqual(env.ctx.Affaires_get_(a.id).statut, 'Soldée');
});

test('journal : notes datées ajoutées à la suite', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const a = nouvelleAffaire(env);
  env.ctx.Affaires_ajouterNote(a.id, 'Premier appel', '2026-09-04');
  env.ctx.Affaires_ajouterNote(a.id, 'Visite faite', '2026-09-10');
  assert.match(env.ctx.Affaires_get_(a.id).notes, /^\[04\/09\/2026 00:00\] Premier appel\n\[10\/09\/2026 00:00\] Visite faite$/);
});

test('critères : enregistrement et remplacement', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const a = nouvelleAffaire(env);
  const b = nouvelleAffaire(env);
  env.ctx.Criteres_enregistrer(b.id, [{ critere: 'Prix', ponderation: 100 }]);
  env.ctx.Criteres_enregistrer(a.id, [{ critere: 'Technique', ponderation: '60', note_kompa: '44' }, { critere: 'Prix', ponderation: 40 }]);
  env.ctx.Criteres_enregistrer(a.id, [{ critere: 'Technique', ponderation: 70 }, { critere: '', ponderation: 1 }]);
  const c = env.ctx.Affaires_fiche(a.id).criteres;
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0].ponderation, 70);
  assert.strictEqual(env.ctx.Affaires_fiche(b.id).criteres.length, 1);
});

test('exercice Mouthe : saisie de bout en bout, historique daté, idempotent', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const id = env.ctx.creerAffaireExerciceMouthe();
  assert.strictEqual(id, 'KI-2026-001');
  assert.strictEqual(env.ctx.creerAffaireExerciceMouthe(), id);
  const f = brut(env.ctx.apiAffaire(id));
  assert.ok(f.ok, f.erreur);
  const a = f.data.affaire;
  assert.strictEqual(a.statut, 'Perdue');
  assert.strictEqual(a.date_limite_remise, '2026-10-02');
  assert.strictEqual(a.montant_ht, 19800);
  assert.strictEqual(a.rang, 2);
  assert.deepStrictEqual(f.data.historique.map((h) => h.nouveau_statut), ['En étude', 'Go', 'Déposée', 'Perdue']);
  assert.deepStrictEqual(f.data.historique.map((h) => h.date.slice(0, 10)), ['2026-09-03', '2026-09-08', '2026-10-01', '2026-11-06'].map((d) => new Date(d + 'T00:00:00').toISOString().slice(0, 10)));
  assert.strictEqual(f.data.relances[0].statut, 'faite');
  assert.strictEqual(f.data.criteres.length, 2);
  assert.strictEqual(f.data.criteres.reduce((s, c) => s + c.note_kompa, 0), 79.6);
  assert.deepStrictEqual(f.data.transitions, []);
});

test('API affaires : liste, création, mise à jour, statut et note', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const c = brut(env.ctx.apiAffaireCreer({ acheteur: 'Commune de Gap', objet: 'Programmation école', date_limite_remise: '2026-12-15', departement: '05' }));
  assert.ok(c.ok, c.erreur);
  assert.strictEqual(c.data.date_limite_remise, '2026-12-15');
  assert.strictEqual(c.data.departement, '05');
  const m = brut(env.ctx.apiAffaireMaj(c.data.id, { prix_jour: '600', statut: 'Soldée' }));
  assert.ok(m.ok, m.erreur);
  assert.strictEqual(m.data.affaire.prix_jour, 600);
  assert.strictEqual(m.data.affaire.statut, 'En étude'); // le statut ne change pas par une mise à jour
  const s = brut(env.ctx.apiAffaireStatut(c.data.id, 'No-go', { motif_decision: 'charge' }, 'Plan de charge plein'));
  assert.ok(s.ok, s.erreur);
  assert.strictEqual(s.data.historique[1].commentaire, 'Plan de charge plein');
  const ko = env.ctx.apiAffaireStatut(c.data.id, 'Gagnée', {}, '');
  assert.strictEqual(ko.ok, false);
  const l = brut(env.ctx.apiAffaires());
  assert.strictEqual(l.data.affaires.length, 1);
  assert.ok(l.data.meta.listes['liste.motifs_nogo'].includes('charge'));
  assert.ok(brut(env.ctx.apiAffaireNote(c.data.id, 'Relancer en janvier')).ok);
});

// ——— Lot 3 : Veille ———

const ECHANTILLON = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'boamp-echantillon.json'), 'utf8'));
// Tests historiques sur un échantillon national : zone élargie et domaine bâtiment non exigé
const veilleEnv = (opts = {}) => {
  const env = creerEnvironnement(Object.assign({ boamp: ECHANTILLON }, opts));
  env.ctx.installer({ exercice: false });
  env.ctx.Params_enregistrer('veille.hors_zone', 'oui');
  env.ctx.Params_enregistrer('veille.batiment_requis', 'non');
  env.ctx.Params_cache_ = null;
  return env;
};
const rec = (idweb) => ECHANTILLON.results.find((r) => r.idweb === idweb);

test('installer() crée l\'affaire d\'exercice Mouthe et le déclencheur de collecte', () => {
  const env = creerEnvironnement();
  const r = env.ctx.installer();
  assert.strictEqual(r.exerciceMouthe, 'KI-2026-001');
  assert.strictEqual(env.ctx.installer().exerciceMouthe, 'KI-2026-001');
  assert.strictEqual(env.ctx.Affaires_lister().length, 1);
  assert.ok(env.declencheurs.some((t) => t.getHandlerFunction() === 'collecteQuotidienne'));
});

test('veille : requête BOAMP (services, appels d\'offres, CPV, mots-clés)', () => {
  const env = veilleEnv();
  const ctx = env.ctx.Veille_contexte_();
  const w = env.ctx.Veille_requeteBoamp_(ctx, '2026-11-09');
  assert.match(w, /^dateparution>=date'2026-11-09' and nature='APPEL_OFFRE' and type_marche='SERVICES' and \(/); // hors zone = oui : pas de filtre départements
  assert.match(w, /donnees like '%71241000%'/);
  assert.match(w, /search\(objet,"assistance à maîtrise d'ouvrage"\)/);
  assert.match(w, /descripteur_libelle="Assistance à maîtrise d'ouvrage"/);
});

test('veille : extraction d\'un avis BOAMP (département 04, CPV, référence, lien)', () => {
  const env = veilleEnv();
  const ctx = env.ctx.Veille_contexte_();
  const a = env.ctx.Veille_depuisBoamp_(rec('26-106663'), ctx);
  assert.strictEqual(a.departement, '04');
  assert.strictEqual(a.type_acheteur, 'Commune');
  assert.strictEqual(a.reference_acheteur, '2026-CDLB-0010');
  assert.match(a.cpv, /^\d{8}/);
  assert.strictEqual(a.lien, 'https://www.boamp.fr/pages/avis/?q=idweb:26-106663');
  const b = env.ctx.Veille_depuisBoamp_(rec('26-106588'), ctx); // formulaire national : fourchette haute
  assert.strictEqual(b.montant_estime, 200000);
  assert.strictEqual(b.type_acheteur, 'EPCI');
  const c = env.ctx.Veille_depuisBoamp_(rec('26-106249'), ctx); // « 4 », « 5 », « 6 »… → PACA
  assert.strictEqual(c.departement, '04');
});

test('veille : filtres § 3.2 (maîtrise d\'œuvre exclue, AMO gardée)', () => {
  const env = veilleEnv();
  const ctx = env.ctx.Veille_contexte_();
  const f = (idweb) => brut(env.ctx.Veille_filtrer_(env.ctx.Veille_depuisBoamp_(rec(idweb), ctx), ctx));
  assert.strictEqual(f('26-106663').garde, true);   // AMO programmation cantine, Digne
  assert.strictEqual(f('26-106233').garde, false);  // maîtrise d'œuvre station d'épuration
  assert.strictEqual(f('26-107919').garde, false);  // MOE + « assistances techniques » sans AMO
  assert.strictEqual(f('26-107459').garde, true);   // AMO et conduite d'opération
  const g = env.ctx.Veille_filtrer_({ objet: 'AMO juridique pour un contrat de concession', cpv: '71241000' }, ctx);
  assert.strictEqual(g.garde, false);
});

test('veille : acheteurs du Ministère des Armées exclus (AO, MAPA), avis déjà collectés archivés', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const ctx = A.Veille_contexte_();
  const base = { objet: 'AMO programmation d\'une école', cpv: '71241000', departement: '13', departements: ['13'] };
  assert.strictEqual(A.Veille_filtrer_(Object.assign({ acheteur: 'Ville d\'Aix' }, base), ctx).garde, true);
  ['Ministère des Armées - ESID de Lyon', 'ESID Marseille', 'Etablissement du service d\'infrastructure de la défense de Toulon', 'USID Ajaccio',
    'GSBdD Marseille Aubagne', 'Direction générale de l\'armement', 'Ministère des armées et des anciens combattants', 'Marine nationale', 'SID Sud-Est'].forEach((ach) => {
    const f = A.Veille_filtrer_(Object.assign({ acheteur: ach }, base, { procedure: 'Procédure Adaptée' }), ctx);
    assert.strictEqual(f.garde, false, ach);
    assert.match(f.motif, /^acheteur exclu/, ach);
  });
  // Objet qui cite le ministère ; alerte e-mail sans acheteur
  assert.strictEqual(A.Veille_filtrer_(Object.assign({}, base, { acheteur: 'OPPIC', objet: 'AMO programmation de locaux pour le Ministère des Armées' }), ctx).garde, false);
  assert.strictEqual(A.Veille_filtrer_(Object.assign({}, base, { acheteur: '', texte: 'Acheteur : ESID de Lyon. Objet : AMO école' }), ctx).garde, false);
  // Pas de faux positif sur un mot proche
  assert.strictEqual(A.Veille_filtrer_(Object.assign({}, base, { acheteur: 'Commune de Sidiailles' }), ctx).garde, true);
  // Avis déjà collectés : seuls les « nouveaux » d'un acheteur exclu sont archivés
  const n = A.Db_inserer(A.TABLES.AVIS, { source: 'BOAMP', id_source: 'm1', acheteur: 'ESID de Lyon', objet: 'AMO caserne', statut: 'nouveau', classement: 'à étudier' });
  const e = A.Db_inserer(A.TABLES.AVIS, { source: 'BOAMP', id_source: 'm2', acheteur: 'ESID de Lyon', objet: 'AMO caserne 2', statut: 'étudié', classement: 'à étudier' });
  const v = A.Db_inserer(A.TABLES.AVIS, { source: 'BOAMP', id_source: 'v1', acheteur: 'Ville de Gap', objet: 'AMO école', statut: 'nouveau', classement: 'à étudier' });
  assert.strictEqual(A.Veille_archiverAcheteursExclus_(), 1);
  A.Db_viderCache_();
  assert.strictEqual(A.Db_trouver(A.TABLES.AVIS, n.id).statut, 'archivé');
  assert.strictEqual(A.Db_trouver(A.TABLES.AVIS, e.id).statut, 'étudié');
  assert.strictEqual(A.Db_trouver(A.TABLES.AVIS, v.id).statut, 'nouveau');
});

test('veille : AMO « bâtiment à vérifier » plafonnée à « possible », mention dans le détail ; paramètre à non → écartée', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const ctx = A.Veille_contexte_();
  ctx.aujourdhui = new Date(2026, 10, 12);
  const avis = { objet: 'Assistance technique à maîtrise d\'ouvrage pour les marchés de travaux', cpv: '71241000', departement: '13', departements: ['13'], type_acheteur: 'Commune', date_limite: new Date(2026, 11, 10) };
  const f = brut(A.Veille_filtrer_(Object.assign({}, avis), ctx));
  assert.deepStrictEqual(f, { garde: true, batimentAVerifier: true });
  const s = brut(A.Veille_scorer_(Object.assign({ batimentAVerifier: true }, avis), ctx));
  assert.ok(s.pre_score >= 60, 'score de « à étudier »');
  assert.strictEqual(s.classement, 'possible');
  assert.strictEqual(s.statut, 'nouveau');
  assert.match(s.score_detail, /Bâtiment à vérifier/);
  assert.strictEqual(s.batimentAVerifier, undefined);
  // Mention dans l'e-mail du matin
  A.Db_inserer(A.TABLES.AVIS, Object.assign({ source: 'BOAMP', id_source: 'g1', acheteur: 'Ville de Gardanne', lien: 'https://www.boamp.fr/g1', zone: 'PACA-Corse', cree_le: new Date() }, s));
  assert.match(A.Email_construire(new Date()).html, /bâtiment à vérifier/);
  // Paramètre veille.batiment_amo_souple = non : écartée comme avant
  A.Params_enregistrer('veille.batiment_amo_souple', 'non');
  A.Params_cache_ = null;
  const ctx2 = A.Veille_contexte_();
  assert.strictEqual(A.Veille_filtrer_(Object.assign({}, avis), ctx2).motif, 'hors domaine bâtiment');
});

test('veille : pré-score § 3.4 et classement', () => {
  const env = veilleEnv();
  const ctx = env.ctx.Veille_contexte_();
  ctx.aujourdhui = new Date(2026, 10, 12);
  ctx.montantMax = 50000;
  const loin = new Date(2026, 11, 10), proche = new Date(2026, 10, 18);
  const a = env.ctx.Veille_scorer_({ objet: 'AMO programmation d\'une école', departement: '04', departements: ['04'], type_acheteur: 'Commune', date_limite: loin }, ctx);
  assert.strictEqual(a.pre_score, 25 + 30 + 15 + 15 + 8);
  assert.strictEqual(a.classement, 'à étudier');
  assert.strictEqual(a.zone, 'PACA-Corse');
  assert.strictEqual(a.statut, 'nouveau');
  const b = env.ctx.Veille_scorer_({ objet: 'AMO exploitation maintenance', departement: '59', departements: ['59'], type_acheteur: 'Établissement public', date_limite: proche, montant_estime: 300000 }, ctx);
  assert.strictEqual(b.pre_score, 10 + 15 + 0 + 10 + 0);
  assert.strictEqual(b.classement, 'archivé');
  assert.strictEqual(b.statut, 'archivé');
  assert.strictEqual(b.alerte_delai, 'oui');
  const c = env.ctx.Veille_scorer_({ objet: 'Assistance technique', departement: '69', departements: ['69'], type_acheteur: 'Région', date_limite: new Date(2026, 10, 24), montant_estime: 30000 }, ctx);
  assert.strictEqual(c.pre_score, 10 + 15 + 8 + 10 + 15);
  assert.strictEqual(c.classement, 'possible');
});

test('veille : collecte complète, journal moteur, aucun doublon au 2e passage', () => {
  const env = veilleEnv();
  const b1 = brut(env.ctx.collecteQuotidienne());
  const boamp = b1.find((x) => x.source === 'BOAMP');
  assert.strictEqual(boamp.lus, 40);
  assert.strictEqual(boamp.erreurs, '');
  assert.strictEqual(boamp.retenus + boamp.exclus + boamp.doublons, 40);
  assert.ok(boamp.retenus >= 15, 'retenus : ' + boamp.retenus); // exclusions élargies (eau, déchets, mobilité…)
  assert.ok(boamp.exclus >= 4, 'exclus : ' + boamp.exclus);
  // Deux avis EHPAD Marguerite de Flandre (26-107459 et 26-107551) : même acheteur, même date, même objet → 1 seul
  const avis = env.ctx.Db_lire(env.ctx.TABLES.AVIS);
  assert.strictEqual(avis.length, boamp.retenus);
  const ehpad = avis.filter((a) => /MARGUERITE DE FLANDRE/i.test(a.acheteur));
  assert.strictEqual(ehpad.length, 1);
  assert.match(String(ehpad[0].liens_autres), /26-107/);
  assert.ok(avis.every((a) => a.pre_score > 0 && a.zone && a.classement && a.statut));
  assert.ok(avis.some((a) => a.zone === 'PACA-Corse'));
  const b2 = brut(env.ctx.collecteQuotidienne());
  assert.strictEqual(b2.find((x) => x.source === 'BOAMP').retenus, 0);
  assert.strictEqual(env.ctx.Db_lire(env.ctx.TABLES.AVIS).length, avis.length);
  const journal = env.ctx.Db_lire(env.ctx.TABLES.JOURNAL_MOTEUR);
  assert.strictEqual(journal.length, 4); // 2 sources × 2 passages
});

test('veille : alerte e-mail, dédoublonnée avec l\'avis BOAMP (liens fusionnés)', () => {
  const env = veilleEnv({ gmail: [
    { id: 'm1', sujet: 'Nouvelle consultation : Mission d\'assistance à maîtrise d\'ouvrage pour la programmation d\'une nouvelle cantine', de: 'Alerte <alerte@plateforme.fr>',
      corps: 'Acheteur : COMMUNE DE DIGNE-LES-BAINS\nLieu : 04000 Digne\nDate limite de remise des offres : 07/12/2026 12:00\nVoir : https://www.marches-publics.info/consultation/123\nSe désinscrire : https://x.fr/unsubscribe' },
    { id: 'm2', sujet: 'Alerte : Étude de faisabilité — salle des fêtes', de: '"Plateforme" <a@b.fr>',
      corps: 'Organisme : Commune de Lurs\nCode postal 04700\nDate limite : 20/12/2026\nhttps://www.achatpublic.com/sdm/ent/gen/ent_detail.do?PCSLID=1' }
  ] });
  env.ctx.collecteQuotidienne();
  const avis = env.ctx.Db_lire(env.ctx.TABLES.AVIS);
  const digne = avis.filter((a) => /DIGNE/i.test(a.acheteur));
  assert.strictEqual(digne.length, 1, 'doublon BOAMP / e-mail non fusionné');
  assert.match(String(digne[0].liens_autres), /marches-publics\.info\/consultation\/123/);
  const lurs = avis.find((a) => a.source === 'Alerte e-mail');
  assert.ok(lurs, 'alerte e-mail non retenue');
  assert.strictEqual(lurs.acheteur, 'Commune de Lurs');
  assert.strictEqual(lurs.departement, '04');
  assert.strictEqual(lurs.zone, 'PACA-Corse');
  assert.match(lurs.lien, /achatpublic\.com/);
  assert.strictEqual(env.ctx.jourIso_(lurs.date_limite), '2026-12-20');
  // Message déjà traité : ignoré au passage suivant
  const b2 = brut(env.ctx.collecteQuotidienne());
  assert.strictEqual(b2.find((x) => x.source === 'Alerte e-mail').lus, 0);
});

test('veille : coupures réseau (3 essais) et erreur journalisée sans bloquer Gmail', () => {
  const ok = veilleEnv({ echecsHttp: 2 });
  assert.strictEqual(brut(ok.ctx.collecteQuotidienne())[0].lus, 40);
  const ko = veilleEnv({ echecsHttp: 10, gmail: [{ id: 'x', sujet: 'AMO programmation', de: 'a', corps: 'Commune de Gap 05000' }] });
  const b = brut(ko.ctx.collecteQuotidienne());
  assert.match(b[0].erreurs, /Connection reset/);
  assert.strictEqual(b[1].retenus, 1);
});

test('veille : Étudier crée l\'affaire liée ; Ignorer ; étudié non modifiable', () => {
  const env = veilleEnv();
  env.ctx.collecteQuotidienne();
  const avis = env.ctx.Db_lire(env.ctx.TABLES.AVIS);
  const digne = avis.find((a) => /DIGNE/i.test(a.acheteur));
  const r = brut(env.ctx.apiAvisEtudier(digne.id));
  assert.ok(r.ok, r.erreur);
  assert.match(r.data.id, /^KI-\d{4}-001$/);
  assert.strictEqual(r.data.statut, 'En étude');
  assert.strictEqual(r.data.lien_avis, digne.lien);
  assert.strictEqual(r.data.id_avis, digne.id);
  assert.strictEqual(r.data.pre_score, digne.pre_score);
  assert.strictEqual(r.data.date_limite_remise, '2026-12-07');
  assert.strictEqual(r.data.procedure, 'AO');
  assert.strictEqual(env.ctx.Db_trouver(env.ctx.TABLES.AVIS, digne.id).statut, 'étudié');
  assert.strictEqual(brut(env.ctx.apiAvisEtudier(digne.id)).data.id, r.data.id); // pas de 2e affaire
  assert.strictEqual(env.ctx.apiAvisStatut(digne.id, 'ignoré').ok, false);
  const autre = avis.find((a) => a.id !== digne.id);
  assert.strictEqual(brut(env.ctx.apiAvisStatut(autre.id, 'ignoré')).data.statut, 'ignoré');
  const v = brut(env.ctx.apiVeille());
  assert.ok(v.ok, v.erreur);
  assert.strictEqual(v.data.avis.length, avis.length);
  assert.strictEqual(v.data.journal.length, 2);
});

// ——— Lot 4 : échéances, relances, courriers, e-mail ———

const J = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Jeu d'affaires couvrant tous les cas du § 5. */
const jeuEcheances = () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  A.Params_enregistrer('fiscal.cumul_avant', ''); A.Params_cache_ = null; // jeu relatif à aujourd'hui : pas de rappel de cumul (testé à part)
  const etude = A.Affaires_creer({ acheteur: 'Commune de Gap', objet: 'AMO programmation école', date_limite_remise: iso(J(3)), date_limite_questions: iso(J(3)), date_visite: iso(J(2)) }).id;
  const deposee = A.Affaires_creer({ acheteur: 'Commune de Digne', objet: 'Faisabilité gymnase', validite_offre_jours: 90 }, { date: iso(J(-120)) }).id;
  A.Affaires_changerStatut(deposee, 'Go', {}, { date: iso(J(-115)) });
  A.Affaires_changerStatut(deposee, 'Déposée', { montant_ht: 12000, jours_reponse: 2, date_depot: iso(J(-100)) }, { date: iso(J(-100)) });
  const perdue = A.Affaires_creer({ acheteur: 'CC Serre-Ponçon', objet: 'Programmation MSP', reference_acheteur: '2026-07' }, { date: iso(J(-60)) }).id;
  A.Affaires_changerStatut(perdue, 'Go', {}, { date: iso(J(-55)) });
  A.Affaires_changerStatut(perdue, 'Déposée', { montant_ht: 9000, jours_reponse: 2, date_depot: iso(J(-40)) }, { date: iso(J(-40)) });
  A.Affaires_changerStatut(perdue, 'Perdue', { date_resultat: iso(J(-12)) }, { date: iso(J(-12)) });
  const gagnee = A.Affaires_creer({ acheteur: 'Commune de Sisteron', objet: 'Faisabilité pôle culturel' }, { date: iso(J(-200)) }).id;
  A.Affaires_changerStatut(gagnee, 'Go', {}, { date: iso(J(-190)) });
  A.Affaires_changerStatut(gagnee, 'Déposée', { montant_ht: 16000, jours_reponse: 3, date_depot: iso(J(-180)) }, { date: iso(J(-180)) });
  A.Affaires_changerStatut(gagnee, 'Gagnée', { date_notification: iso(J(-150)), montant_notifie: 16000 }, { date: iso(J(-150)) });
  const f1 = A.Factures_ajouter(gagnee, { numero: 'F-2026-07', date: iso(J(-40)), montant: 8000 }); // échéance J-10, non payée
  const f2 = A.Factures_ajouter(gagnee, { numero: 'F-2026-09', date: iso(J(5)), montant: 4000 });  // prévue
  return { env, A, etude, deposee, perdue, gagnee, f1, f2 };
};

test('échéancier § 5 : remise, questions, visite, décision, facturation, encaissement', () => {
  const { A, etude, deposee, gagnee } = jeuEcheances();
  const e = brut(A.Echeances_calculer(J(0), J(30)));
  const de = (type, id) => e.filter((x) => x.type === type && x.id_affaire === id);
  assert.strictEqual(de('Remise', etude).length, 1);
  assert.strictEqual(de('Remise', etude)[0].jours, 3);
  assert.strictEqual(de('Remise', etude)[0].alerte, true);   // J-3
  assert.strictEqual(de('Questions', etude)[0].alerte, true); // J-3
  assert.strictEqual(de('Visite', etude)[0].alerte, true);    // J-2
  assert.strictEqual(de('Facturation', gagnee).length, 1);    // facture prévue à J+5
  assert.strictEqual(de('Encaissement', gagnee)[0].depassee, true); // échéance dépassée, non payée
  assert.strictEqual(de('Décision', deposee).length, 1);      // dépôt J-100 + 90 j = J-10 : dépassée
  assert.ok(e.every((x, i) => i === 0 || new Date(e[i - 1].date) <= new Date(x.date)));
});

test('relances § 5 : décision, motifs J+10, encaissement ; clôture automatique ; idempotent', () => {
  const { A, deposee, perdue, gagnee, f1 } = jeuEcheances();
  const s1 = brut(A.Relances_synchroniser());
  const rel = () => A.Db_lire(A.TABLES.RELANCES);
  const types = (id) => brut(rel().filter((x) => x.id_affaire === id).map((x) => x.type + ':' + x.statut).sort());
  assert.deepStrictEqual(types(deposee), ['Décision attendue:à faire']);
  assert.deepStrictEqual(types(perdue), ['Motifs du rejet — rappel:à faire', 'Motifs du rejet:à faire']);
  assert.deepStrictEqual(types(gagnee), ['Encaissement:à faire']);
  assert.strictEqual(s1.creees, 3);
  assert.strictEqual(brut(A.Relances_synchroniser()).creees, 0); // idempotent
  // Motifs reçus → relances motifs sans objet ; facture payée → encaissement sans objet ; résultat → décision sans objet
  A.Affaires_maj(perdue, { motifs_rejet: 'Prix supérieur de 8 %.' });
  A.Factures_maj(f1.id, { date_encaissement: iso(J(0)), montant_encaisse: 8000 });
  A.Affaires_changerStatut(deposee, 'Sans suite', { date_resultat: iso(J(0)) });
  const s2 = brut(A.Relances_synchroniser());
  assert.strictEqual(s2.closes, 4);
  assert.ok(rel().every((x) => x.statut !== 'à faire'));
  assert.strictEqual(A.Relances_aFaire().length, 0);
});

test('relances : facture prévue → relance « Facturation » le jour J', () => {
  const { A, gagnee } = jeuEcheances();
  A.Relances_synchroniser(J(5));
  const f = A.Db_lire(A.TABLES.RELANCES).filter((x) => x.id_affaire === gagnee && x.type === 'Facturation');
  assert.strictEqual(f.length, 1);
  assert.strictEqual(A.jourIso_(f[0].date_prevue), iso(J(5)));
});

test('relances : statut faite / sans objet / à faire', () => {
  const { A } = jeuEcheances();
  A.Relances_synchroniser();
  const r = A.Relances_aFaire()[0];
  const f = brut(A.apiRelanceStatut(r.id, 'faite'));
  assert.ok(f.ok, f.erreur);
  assert.strictEqual(f.data.statut, 'faite');
  assert.strictEqual(f.data.date_faite, iso(J(0)));
  assert.strictEqual(A.apiRelanceStatut(r.id, 'oubliée').ok, false);
});

test('modèles de courriers : motifs (CCP R. 2181), décision, relance de paiement (R. 2192-10, 40 €)', () => {
  const { A, perdue, deposee, gagnee } = jeuEcheances();
  A.Relances_synchroniser();
  const rel = (id, type) => A.Db_lire(A.TABLES.RELANCES).find((x) => x.id_affaire === id && x.type === type);
  const m = brut(A.Courriers_modele(rel(perdue, 'Motifs du rejet').id));
  assert.match(m.objet, /^2026-07 — Demande des motifs de rejet/);
  assert.match(m.corps, /R\. 2181-1 à R\. 2181-4/);
  assert.match(m.corps, /« Programmation MSP » \(référence 2026-07\)/);
  assert.match(m.corps, /Sébastien De Raedt EI/);
  const rappel = brut(A.Courriers_modele(rel(perdue, 'Motifs du rejet — rappel').id));
  assert.match(rappel.corps, /restée sans réponse/);
  const d = brut(A.Courriers_modele(rel(deposee, 'Décision attendue').id));
  assert.match(d.corps, /90 jours/);
  const p = brut(A.Courriers_modele(rel(gagnee, 'Encaissement').id));
  assert.match(p.objet, /F-2026-07/);
  assert.match(p.corps, /8 000,00 € HT/);
  assert.match(p.corps, /R\. 2192-10/);
  assert.match(p.corps, /40 €/);
  assert.match(p.corps, /293 B du CGI/);
});

test('e-mail du matin : rubriques, objet, pas d\'envoi le week-end, récap du lundi', () => {
  const { A, env } = jeuEcheances();
  A.Db_inserer(A.TABLES.AVIS, { source: 'BOAMP', id_source: 'x1', acheteur: 'Commune de Lurs', objet: 'Faisabilité salle', zone: 'PACA-Corse', departement: '04', pre_score: 88, classement: 'à étudier', statut: 'nouveau', lien: 'https://www.boamp.fr/x1', date_limite: J(20) });
  A.Db_inserer(A.TABLES.AVIS, { source: 'BOAMP', id_source: 'x2', acheteur: 'Ville de Lyon', objet: 'AMO', zone: 'France — présentiel à vérifier', departement: '69', pre_score: 62, classement: 'à étudier', statut: 'nouveau', lien: 'https://www.boamp.fr/x2' });
  A.Db_inserer(A.TABLES.AVIS, { source: 'BOAMP', id_source: 'x4', acheteur: 'Ville de Lille', objet: 'AMO', zone: 'France — présentiel à vérifier', departement: '59', pre_score: 50, classement: 'possible', statut: 'nouveau', lien: 'https://www.boamp.fr/x4' });
  A.Db_inserer(A.TABLES.AVIS, { source: 'BOAMP', id_source: 'x3', acheteur: 'Ignoré', objet: 'AMO', zone: 'PACA-Corse', pre_score: 70, statut: 'ignoré', lien: 'https://www.boamp.fr/x3' });
  const m = brut(A.Email_construire(new Date()));
  assert.deepStrictEqual(m.nombres, { remises: 1, avisPaca: 1, avisFrance: 2, echeances: 4, relances: 1 }); // relance « motifs » créée au passage en Perdue ; facture prévue à émettre (Facturation)
  assert.match(m.sujet, /^Kartes Affaires — \d{2}\/\d{2}\/\d{4} — ⚠ Remise J-3 · 3 nouveaux avis · 4 échéances$/);
  assert.match(m.html, /\+ 1 autre avis « possible » hors PACA-Corse/);
  assert.doesNotMatch(m.html, /Ville de Lille/);
  assert.match(m.html, /Nouveaux avis PACA-Corse/);
  assert.match(m.html, /présentiel à vérifier/);
  assert.match(m.html, /#veille/);
  assert.match(m.html, /Indicateurs/);
  assert.doesNotMatch(m.html, /Ignoré/);
  // Samedi 14/11/2026 : pas d'envoi
  assert.strictEqual(brut(A.Email_envoyer_(new Date(2026, 10, 14, 7), false)).envoye, false);
  // Jeudi 12/11/2026 : envoi vers le compte Kompa
  const ok = brut(A.Email_envoyer_(new Date(2026, 10, 12, 7), false));
  assert.strictEqual(ok.envoye, true);
  assert.strictEqual(env.ctx.MailApp.envois.length, 1);
  assert.strictEqual(env.ctx.MailApp.envois[0].to, 'kompa.affaires@example.com');
  assert.strictEqual(env.ctx.MailApp.envois[0].name, 'Kartes Affaires');
});

test('e-mail du matin : remise imminente J-3 à J0 en tête, avec l\'état des pièces et le conseil de dépôt', () => {
  const { A, etude } = jeuEcheances(); // remise de l'affaire « etude » à J+3
  let m = brut(A.Email_construire(new Date()));
  assert.match(m.html, /Remise imminente/);
  assert.ok(m.html.indexOf('Remise imminente') < m.html.indexOf('Échéances des 7 prochains jours'), 'encadré en tête');
  assert.match(m.html, /J-3 · /);
  assert.match(m.html, /liste des pièces non renseignée/);
  assert.match(m.html, /Visez un dépôt le \d{2}\/\d{2}\/\d{4}, 48 h avant la limite/);
  assert.match(m.html, new RegExp('#affaire/' + etude));
  assert.match(m.texte, /⚠ REMISE IMMINENTE/);
  // Pièces renseignées : 1 prête sur 3
  A.PiecesOffre_ajouter(etude, { categorie: 'Candidature', libelle: 'DC1' });
  A.PiecesOffre_ajouter(etude, { categorie: 'Offre', libelle: 'Mémoire' });
  const p = A.PiecesOffre_ajouter(etude, { categorie: 'Offre', libelle: 'BPU' });
  A.PiecesOffre_maj(etude, brut(p).id, { etat: 'prête' });
  // Remise demain
  A.Affaires_maj(etude, { date_limite_remise: iso(J(1)) });
  m = brut(A.Email_construire(new Date()));
  assert.match(m.sujet, /— ⚠ Remise J-1 · /);
  assert.match(m.html, /1 pièce prête sur 3 — 2 à finir/);
  assert.match(m.html, /Déposez aujourd'hui/);
  // Remise à J+5 : pas d'encadré, objet inchangé
  A.Affaires_maj(etude, { date_limite_remise: iso(J(5)) });
  m = brut(A.Email_construire(new Date()));
  assert.doesNotMatch(m.html, /Remise imminente/);
  assert.doesNotMatch(m.sujet, /Remise/);
  assert.strictEqual(m.nombres.remises, 0);
});

test('e-mail du matin : rien à signaler → « aucun nouvel avis » avec le bilan de la collecte ; email.si_rien = non → lundi seulement', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  // Mardi 17/11/2026 sans collecte enregistrée : envoi quand même, avec une alerte
  const sansCollecte = brut(A.Email_envoyer_(new Date(2026, 10, 17, 7), false));
  assert.strictEqual(sansCollecte.envoye, true);
  assert.match(sansCollecte.sujet, /— aucun nouvel avis · 0 échéance$/);
  assert.match(A.MailApp.envois[0].htmlBody, /Aucune collecte de la veille enregistrée aujourd'hui/);
  // Mercredi 18/11/2026 : collecte de 6 h 11 (32 lus, 24 écartés, 8 connus, 0 nouveau)
  A.Db_insererPlusieurs(A.TABLES.JOURNAL_MOTEUR, [
    { date: new Date(2026, 10, 18, 6, 11), source: 'BOAMP', avis_lus: 32, avis_retenus: 0, exclus: 24, doublons: 8, erreurs: '' },
    { date: new Date(2026, 10, 18, 6, 11), source: 'Alerte e-mail', avis_lus: 0, avis_retenus: 0, exclus: 0, doublons: 0, erreurs: '' }
  ]);
  assert.strictEqual(brut(A.Email_envoyer_(new Date(2026, 10, 18, 7), false)).envoye, true);
  assert.match(A.MailApp.envois[1].htmlBody, /Rien de nouveau/);
  assert.match(A.MailApp.envois[1].htmlBody, /Veille de ce matin \(06 h 11\) : 32 avis lus au BOAMP — 24 écartés par les filtres, 8 déjà connus, 0 nouveau ; 0 alerte e-mail de plateforme\./);
  assert.match(A.MailApp.envois[1].body, /Veille de ce matin/);
  // Ancien comportement sur demande : pas d'envoi un mardi vide, envoi le lundi
  A.Params_enregistrer('email.si_rien', 'non'); A.Params_cache_ = null;
  assert.strictEqual(brut(A.Email_envoyer_(new Date(2026, 10, 17, 7), false)).envoye, false); // mardi
  assert.strictEqual(brut(A.Email_envoyer_(new Date(2026, 10, 16, 7), false)).envoye, true);  // lundi
  assert.match(A.MailApp.envois[2].htmlBody, /Rien de nouveau/);
  A.MailApp.envois.splice(0, 2);
  A.Params_enregistrer('email.destinataire', 'autre@example.com');
  A.Params_cache_ = null;
  A.Email_envoyerTest();
  assert.strictEqual(A.MailApp.envois[1].to, 'autre@example.com');
});

test('API échéancier : grille du mois, prochaines échéances, relances', () => {
  const { A } = jeuEcheances();
  A.Relances_synchroniser(); // fait par les déclencheurs et après chaque modification, plus à l'ouverture
  const r = brut(A.apiEcheancier('2026-11'));
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(r.data.mois, '2026-11');
  assert.strictEqual(r.data.grille.debut, '2026-10-26'); // lundi
  assert.strictEqual(r.data.grille.fin, '2026-12-06');   // dimanche
  assert.ok(r.data.prochaines.length >= 4);
  assert.strictEqual(r.data.relances.length, 4); // motifs J+0, rappel J+10, décision, encaissement
  const s = brut(A.apiSuivi());
  assert.ok(s.ok, s.erreur);
  assert.ok(s.data.echeances.every((e) => e.jours <= 7));
  const ap = brut(A.apiEmailApercu());
  assert.ok(ap.ok && /<html/.test(ap.data.html));
});

// ——— Lot 5 : tableau de bord et enseignements ———

const jeuIndicateurs = () => {
  const env = creerEnvironnement();
  const L = console.log; console.log = () => {};
  env.ctx.installer(); // avec l'exercice Mouthe
  env.ctx.creerAffairesTestIndicateurs();
  console.log = L;
  return env;
};
const proche = (x, y, msg) => assert.ok(Math.abs(x - y) < 1e-9, (msg || '') + ' : ' + x + ' ≠ ' + y);

test('recette lot 5 : indicateurs = calcul à la main (3 affaires [TEST], Mouthe exclue, au 20/11/2026)', () => {
  const env = jeuIndicateurs();
  const t = brut(env.ctx.Indicateurs_tableau(new Date(2026, 10, 20)));
  assert.strictEqual(t.go.go, 2);
  assert.strictEqual(t.go.nogo, 1);
  proche(t.go.taux, 2 / 3, 'taux de Go');
  assert.strictEqual(t.attribution.gagnees, 1);
  assert.strictEqual(t.attribution.perdues, 1);
  proche(t.attribution.taux, 0.5, 'attribution nombre');
  assert.strictEqual(t.attribution.montantGagne, 20000);
  assert.strictEqual(t.attribution.montantJuge, 35000);
  proche(t.attribution.tauxMontant, 20000 / 35000, 'attribution montant');
  proche(t.rangMoyen, 2, 'rang moyen');
  proche(t.ecartPrixMoyen, 0.25, 'écart de prix moyen');
  proche(t.ecartNoteMoyen, -8, 'écart de note technique');
  assert.strictEqual(t.cout.jours, 7);
  assert.strictEqual(t.cout.montantNotifie, 20000);
  proche(t.cout.joursPour10k, 3.5, 'coût de la réponse');
  assert.strictEqual(t.ca.signe, 20000);
  assert.strictEqual(t.ca.facture, 10000);
  assert.strictEqual(t.ca.encaisse, 10000);
  assert.strictEqual(t.enCours, 1);
  assert.deepStrictEqual(t.motifsNogo, [{ motif: 'charge', nombre: 1 }]);
  assert.deepStrictEqual(t.motifsRejet, [{ motif: 'prix', nombre: 1 }]);
});

test('indicateurs : l\'exercice Mouthe seul ne compte pas, mais reste consultable', () => {
  const env = creerEnvironnement();
  const L = console.log; console.log = () => {}; env.ctx.installer(); console.log = L;
  const t = brut(env.ctx.Indicateurs_tableau(new Date(2026, 10, 20)));
  assert.strictEqual(t.go.taux, null);
  assert.strictEqual(t.attribution.taux, null);
  assert.strictEqual(t.ecartPrixMoyen, null);
  const e = brut(env.ctx.Indicateurs_enseignements());
  assert.strictEqual(e.length, 1);
  assert.strictEqual(e[0].exercice, true);
});

test('indicateurs : fenêtre de 12 mois glissants (au 20/11/2027, plus rien)', () => {
  const env = jeuIndicateurs();
  const t = brut(env.ctx.Indicateurs_tableau(new Date(2027, 10, 20)));
  assert.strictEqual(t.go.taux, null);
  assert.strictEqual(t.attribution.taux, null);
  assert.strictEqual(t.rangMoyen, null);
  assert.strictEqual(t.cout.joursPour10k, null);
});

test('enseignements : affaires perdues avec écarts, les plus récentes d\'abord', () => {
  const env = jeuIndicateurs();
  const e = brut(env.ctx.Indicateurs_enseignements());
  assert.deepStrictEqual(e.map((x) => x.id), ['KI-2026-001', 'KI-2026-003']);
  assert.deepStrictEqual(e.map((x) => x.exercice), [true, false]);
  proche(e[0].ecartPrix, 0.125, 'Mouthe');
  assert.strictEqual(e[0].ecartNote, -6);
  assert.strictEqual(e[0].noteKompa, 44);
  proche(e[1].ecartPrix, 0.25, 'T2');
  assert.strictEqual(e[1].ecartNote, -8);
  const api = brut(env.ctx.apiEnseignements());
  assert.ok(api.ok, api.erreur);
  assert.strictEqual(api.data.lignes.length, 2);
  assert.ok(brut(env.ctx.apiTableau()).ok);
});

test('affaires [TEST] : création idempotente puis suppression complète', () => {
  const env = jeuIndicateurs();
  assert.strictEqual(env.ctx.creerAffairesTestIndicateurs().length, 3);
  assert.strictEqual(env.ctx.Affaires_lister().length, 4);
  assert.strictEqual(env.ctx.supprimerAffairesTest(), 3);
  assert.strictEqual(env.ctx.Affaires_lister().length, 1); // Mouthe reste
  const T = env.ctx.TABLES;
  assert.ok(env.ctx.Db_lire(T.HISTORIQUE).every((h) => h.id_affaire === 'KI-2026-001'));
  assert.strictEqual(env.ctx.Db_lire(T.FACTURES).length, 0);
  assert.strictEqual(env.ctx.Db_lire(T.CRITERES).filter((c) => c.id_affaire !== 'KI-2026-001').length, 0);
  assert.strictEqual(brut(env.ctx.Compteur_ca(2026)).encaisse, 0);
});

// ——— Déclarations URSSAF (CA au rythme des déclarations) ———

const jeuFiscal = () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  A.installer({ exercice: false });
  A.Params_enregistrer('fiscal.debut_suivi', '2026-01-01');
  A.Params_enregistrer('fiscal.date_creation', '2026-01-01'); // entreprise créée au début du suivi (CFE 2026 exonérée)
  A.Params_enregistrer('fiscal.taux_cotisations', '23,2');
  A.Params_cache_ = null;
  const g = A.Affaires_creer({ acheteur: 'Commune de Gap', objet: 'AMO' }, { date: '2026-01-10' }).id;
  A.Affaires_changerStatut(g, 'Go', {}, { date: '2026-01-12' });
  A.Affaires_changerStatut(g, 'Déposée', { montant_ht: 30000, jours_reponse: 3, date_depot: '2026-01-20' }, { date: '2026-01-20' });
  A.Affaires_changerStatut(g, 'Gagnée', { date_notification: '2026-02-01', montant_notifie: 30000 }, { date: '2026-02-01' });
  A.Factures_ajouter(g, { numero: 'F1', date: '2026-02-15', montant: 10000, date_encaissement: '2026-03-20', montant_encaisse: 10000 }); // T1
  A.Factures_ajouter(g, { numero: 'F2', date: '2026-06-15', montant: 8000, date_encaissement: '2026-07-10', montant_encaisse: 8000 });   // T3
  A.Factures_ajouter(g, { numero: 'F3', date: '2026-09-15', montant: 5000, date_encaissement: '2026-09-30', montant_encaisse: 5000 });   // T3
  A.Factures_ajouter(g, { numero: 'F4', date: '2026-10-15', montant: 7000 });                                                          // non encaissée
  return { env, A };
};

test('URSSAF trimestriel : CA encaissé par trimestre, échéances, estimation, états', () => {
  const { A } = jeuFiscal();
  const d = brut(A.Fiscal_declarations(2026, new Date(2026, 10, 12)));
  assert.deepStrictEqual(d.periodes.map((p) => p.id), ['2026-T1', '2026-T2', '2026-T3', '2026-T4']);
  // 1re déclaration (création le 01/01/2026) : T1 + T2, avant le 31/07 ; T1 affiche son CA, sans somme à payer
  assert.deepStrictEqual(d.periodes.map((p) => p.ca), [10000, 10000, 13000, 0]);
  assert.deepStrictEqual(d.periodes.map((p) => p.echeance), ['2026-04-30', '2026-07-31', '2026-10-31', '2027-01-31']);
  assert.deepStrictEqual(d.periodes.map((p) => p.etat), ['regroupée', 'en retard', 'en retard', 'en cours']);
  assert.strictEqual(d.periodes[0].total, 0);
  assert.strictEqual(d.periodes[1].cotisations, 2320); // 10 000 × 23,2 %
  const t3 = d.periodes[2];
  assert.strictEqual(t3.cotisations, 3016);   // 13 000 × 23,2 %
  assert.strictEqual(t3.cfp, 26);             // 13 000 × 0,2 %
  assert.strictEqual(t3.impot, 286);          // 13 000 × 2,2 % (versement libératoire)
  assert.strictEqual(t3.total, 3328);
  assert.strictEqual(d.totaux.ca, 23000);
  assert.strictEqual(d.tauxManquants, false);
});

test('livre des recettes : encaissements de l\'année par date, mode de règlement, export Google Sheets', () => {
  const { A, env } = jeuFiscal();
  // F4 non encaissée : absente ; une facture annulée dans Qonto : absente
  const id = A.Affaires_lister()[0].id;
  A.Factures_ajouter(id, { numero: 'F5', date: '2026-10-20', montant: 1000, date_encaissement: '2026-10-25', montant_encaisse: 1000, qonto_statut: 'annulée' });
  let l = brut(A.Livre_recettes(2026, new Date(2026, 10, 12)));
  assert.deepStrictEqual(l.lignes.map((x) => x.numero), ['F1', 'F2', 'F3']);
  assert.deepStrictEqual(l.lignes.map((x) => x.date), ['2026-03-20', '2026-07-10', '2026-09-30']);
  assert.deepStrictEqual(l.lignes.map((x) => x.cumul), [10000, 18000, 23000]);
  assert.strictEqual(l.total, 23000);
  assert.strictEqual(l.lignes[0].client, 'Commune de Gap');
  assert.match(l.lignes[0].nature, /^Assistance à maîtrise d'ouvrage/);
  assert.ok(l.lignes.every((x) => x.mode === 'virement' && !x.modeSaisi));
  assert.deepStrictEqual(l.annees, [2026]);
  // Mode de règlement modifié ; valeur inconnue refusée
  const r = brut(A.apiLivreMode(l.lignes[1].id, 'chèque', 2026));
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(r.data.lignes[1].mode, 'chèque');
  assert.match(brut(A.apiLivreMode(l.lignes[1].id, 'bitcoin', 2026)).erreur, /inconnu/);
  // Autre année : vide
  assert.strictEqual(brut(A.Livre_recettes(2025, new Date(2026, 10, 12))).lignes.length, 0);
  // Export : nouveau classeur, rangé dans sauvegardes › Livre des recettes
  const x = brut(A.apiLivreExporter(2026));
  assert.ok(x.ok, x.erreur);
  assert.match(x.data.nom, /^Livre des recettes 2026 — Kartes Ingénierie — export du \d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(x.data.lignes, 3);
  assert.strictEqual(x.data.total, 23000);
  assert.ok((env.gas.DriveApp.deplaces || []).some((d) => d.dossier === 'Livre des recettes'));
});

test('URSSAF : réglages depuis l\'onglet (versement libératoire, taux)', () => {
  const { A } = jeuFiscal();
  A.Params_enregistrer('fiscal.versement_liberatoire', 'non'); A.Params_cache_ = null;
  let d = brut(A.Fiscal_declarations(2026, new Date(2026, 10, 12)));
  assert.strictEqual(d.taux.versementLiberatoire, false);
  assert.strictEqual(d.periodes[2].impot, 0);
  const r = brut(A.apiFiscalReglages('oui', '24,2', '2,2', 2026));
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(r.data.taux.versementLiberatoire, true);
  assert.strictEqual(r.data.taux.tauxVl, 2.2);
  assert.strictEqual(r.data.periodes[2].impot, 286);      // 13 000 × 2,2 %
  assert.strictEqual(r.data.periodes[2].cotisations, 3146); // 13 000 × 24,2 %
  assert.strictEqual(A.Params_texte('fiscal.taux_cotisations'), '24.2');
  // Taux vide : inchangé ; valeur absurde : refusée
  assert.ok(brut(A.apiFiscalReglages('oui', '', '', 2026)).ok);
  assert.strictEqual(A.Params_texte('fiscal.taux_cotisations'), '24.2');
  assert.match(brut(A.apiFiscalReglages('oui', 'abc', '', 2026)).erreur, /pourcentage attendu/);
});

test('URSSAF : taux de cotisations non renseigné → estimation absente, CA présent', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const d = brut(env.ctx.Fiscal_declarations(2026));
  assert.strictEqual(d.tauxManquants, true);
  assert.strictEqual(d.periodes[0].total, null);
  assert.strictEqual(d.periodes[0].ca, 0);
});

test('veille Gmail : libellé « Veille » ou expéditeur d\'une plateforme (pas de filtre Gmail à créer)', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const q = env.ctx.Veille_requeteGmail_({ jours: 3 });
  assert.match(q, /^\(label:"Veille" OR from:\(marches-publics\.gouv\.fr OR /);
  assert.match(q, / OR achatpublic\.com /);
  assert.match(q, /\) newer_than:3d$/);
});

test('autorisation de cumul : rappel 7 jours avant, en retard ensuite, plus rien une fois faite', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  A.installer({ exercice: false });
  const cumul = (q) => brut(A.Echeances_calculer(q, A.ajouterJours_(q, 7), q)).filter((e) => e.acheteur === 'Employeur (cumul d\'activités)');
  assert.strictEqual(brut(A.Fiscal_cumul(new Date(2026, 10, 10))).etat, 'à faire');
  assert.strictEqual(cumul(new Date(2026, 10, 10)).length, 0);           // 1er décembre hors de la semaine
  assert.strictEqual(cumul(new Date(2026, 10, 26)).length, 1);           // dans la semaine
  const retard = cumul(new Date(2026, 11, 5));
  assert.strictEqual(retard.length, 1);
  assert.ok(retard[0].depassee);
  assert.match(A.Email_construire(new Date(2026, 10, 26)).html, /autorisation de cumul/);
  assert.ok(A.apiCumulFait('2026-11-28').ok);
  assert.strictEqual(brut(A.Fiscal_cumul(new Date(2026, 11, 5))).etat, 'faite');
  assert.strictEqual(cumul(new Date(2026, 11, 5)).length, 0);
  assert.strictEqual(brut(A.Fiscal_declarations(2026, new Date(2026, 11, 5))).cumul.afficher, true);
  // Entreprise en activité depuis plus de 3 mois : aucun rappel
  A.apiAnnulerDeclaration('CUMUL');
  A.Params_enregistrer('fiscal.date_creation', '2026-01-01');
  A.Params_cache_ = null;
  assert.strictEqual(brut(A.Fiscal_cumul(new Date(2026, 11, 5))).etat, 'non due');
});

test('URSSAF : relance et échéance tant que non déclaré ; déclaration → sans objet', () => {
  const { A } = jeuFiscal();
  const quand = new Date(2026, 10, 12);
  A.Relances_synchroniser(quand);
  const urssaf = () => A.Db_lire(A.TABLES.RELANCES).filter((x) => x.type === 'Déclaration URSSAF');
  assert.strictEqual(urssaf().length, 2); // 1re déclaration (T1 + T2) et T3 en retard
  assert.match(urssaf().find((x) => x.cle === 'urssaf:2026-T3').commentaire, /13 000,00 €, avant le 31\/10\/2026/);
  const ech = brut(A.Echeances_calculer(new Date(2026, 10, 12), new Date(2026, 11, 31), quand)).filter((e) => e.type === 'Déclaration');
  assert.strictEqual(ech.length, 2);
  assert.ok(ech.every((e) => e.depassee && e.acheteur === 'URSSAF'));
  ['2026-T2', '2026-T3'].forEach((id) => assert.ok(A.apiDeclarer(id, '', '2026-11-12').ok));
  A.Relances_synchroniser(quand);
  assert.ok(urssaf().every((x) => x.statut === 'sans objet'));
  const d = brut(A.Fiscal_declarations(2026, quand));
  assert.deepStrictEqual(d.periodes.map((p) => p.etat), ['regroupée', 'déclarée', 'déclarée', 'en cours']);
  assert.ok(A.apiAnnulerDeclaration('2026-T3').ok);
  assert.strictEqual(brut(A.Fiscal_declarations(2026, quand)).periodes[2].etat, 'en retard');
  assert.strictEqual(A.apiDeclarer('2026-T9', 1, '').ok, false);
});

test('URSSAF : 1re déclaration pour un début d\'activité le 01/12/2026 (du 01/12/2026 au 31/03/2027, avant le 30/04/2027)', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  A.installer({ exercice: false });
  A.Params_enregistrer('fiscal.debut_suivi', '2026-11-12');
  A.Params_enregistrer('fiscal.date_creation', '2026-12-01');
  A.Params_enregistrer('fiscal.taux_cotisations', '25,6');
  A.Params_cache_ = null;
  const g = A.Affaires_creer({ acheteur: 'Commune de Gap', objet: 'AMO' }, { date: '2026-11-20' }).id;
  A.Affaires_changerStatut(g, 'Go', {}); A.Affaires_changerStatut(g, 'Déposée', { montant_ht: 3000, jours_reponse: 1, date_depot: '2026-11-25' });
  A.Affaires_changerStatut(g, 'Gagnée', { date_notification: '2026-12-02', montant_notifie: 3000 });
  A.Factures_ajouter(g, { numero: 'F1', date: '2026-12-10', montant: 1000, date_encaissement: '2026-12-20', montant_encaisse: 1000 });
  A.Factures_ajouter(g, { numero: 'F2', date: '2027-02-10', montant: 2000, date_encaissement: '2027-03-05', montant_encaisse: 2000 });
  // Fin janvier 2027 : rien à déclarer (pas de T4 2026 seul)
  const fevrier = new Date(2027, 1, 2);
  const d26 = brut(A.Fiscal_declarations(2026, fevrier));
  assert.deepStrictEqual(d26.periodes.map((p) => p.etat), ['non suivie', 'non suivie', 'non suivie', 'regroupée']);
  assert.strictEqual(d26.periodes[3].debut, '2026-12-01');
  assert.strictEqual(d26.totaux.ca, 1000);
  A.Relances_synchroniser(fevrier);
  assert.strictEqual(A.Db_lire(A.TABLES.RELANCES).filter((x) => x.type === 'Déclaration URSSAF').length, 0);
  // Avril 2027 : 1re déclaration de 3 000 € (décembre + T1), avant le 30/04/2027
  const avril = new Date(2027, 3, 10);
  const t1 = brut(A.Fiscal_declarations(2027, avril)).periodes[0];
  assert.deepStrictEqual([t1.debut, t1.fin, t1.echeance, t1.ca, t1.etat, t1.premiere], ['2026-12-01', '2027-03-31', '2027-04-30', 3000, 'à déclarer', true]);
  assert.strictEqual(t1.cotisations, 768); // 3 000 × 25,6 %
  assert.strictEqual(brut(A.Fiscal_declarations(2027, avril)).totaux.ca, 2000); // CA de l'année 2027 seule
  A.Relances_synchroniser(avril);
  const r = A.Db_lire(A.TABLES.RELANCES).filter((x) => x.type === 'Déclaration URSSAF');
  assert.strictEqual(r.length, 1);
  assert.match(r[0].commentaire, /3\s000,00\s€, avant le 30\/04\/2027/);
});

test('accord-cadre : BPU collé depuis Excel, DQE = offre, bons de commande au planning, facturation, Qonto, reconduction, CA', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  A.installer({ exercice: false });
  const id = A.Affaires_creer({ acheteur: 'Commune de Gap', objet: 'AC AMO équipements' }, { date: '2027-01-05' }).id;
  A.Affaires_maj(id, { type_marche: 'Accord-cadre à bons de commande', prix_jour: 550 });
  // BPU collé depuis Excel (n° en tête, titre ignoré, nombres à la française)
  const texte = 'N°\tDésignation\tUnité\tPrix unitaire HT\tQuantité\n1\tÉtude de faisabilité / programme\tforfait\t6 600,00\t2\n2\tRéunion\tréunion\t330\t12\n3\tAnalyse des offres de MOE\tconsultation\t2 200 €\t2\n4\tJournée d\'assistance\tjour\t550\t10';
  let r = brut(A.apiBpuColler(id, texte));
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(r.data.ajoutees, 4);
  assert.deepStrictEqual(r.data.bpu.map((l) => l.montant), [13200, 3960, 4400, 5500]);
  assert.strictEqual(A.Affaires_get_(id).montant_ht, 27060);
  assert.match(brut(A.apiBpuColler(id, 'rien d\'utile')).erreur, /Aucune ligne reconnue/);
  // Modification ligne par ligne
  const bpu = r.data.bpu.map((l) => ({ designation: l.designation, unite: l.unite, prix_unitaire: l.prix_unitaire, quantite_dqe: l.quantite_dqe }));
  bpu[1].quantite_dqe = 10;
  r = brut(A.apiBpuEnregistrer(id, bpu));
  assert.strictEqual(r.data.affaire.montant_ht, 26400);
  assert.strictEqual(r.data.accordCadre.dqe, 26400);
  // Gagnée : période de 12 mois, 3 reconductions, max 40 000 €
  A.Affaires_changerStatut(id, 'Go', {}, { date: '2027-01-10' });
  A.Affaires_changerStatut(id, 'Déposée', { montant_ht: 26400, jours_reponse: 2, date_depot: '2027-01-20' }, { date: '2027-01-20' });
  A.Affaires_changerStatut(id, 'Gagnée', { date_notification: '2027-03-01', montant_notifie: 26400 }, { date: '2027-03-01' });
  A.Affaires_maj(id, { ac_duree_mois: 12, ac_reconductions: 3, ac_minimum: 5000, ac_maximum: 40000 });
  const quand = new Date(2027, 3, 1);
  let s = brut(A.AC_synthese(id, quand));
  assert.strictEqual(s.periodes.length, 4);
  assert.deepStrictEqual([s.periodes[0].debut, s.periodes[0].fin, s.fin], ['2027-03-01', '2028-02-29', '2031-02-28']);
  assert.strictEqual(s.prochainNumero, 'BC-01');
  // Bon de commande à partir des quantités du BPU
  const ids = s.bpu.map((l) => l.id);
  const q = {}; q[ids[0]] = 1; q[ids[1]] = 2;
  r = brut(A.apiBonAjouter(id, { date: '2027-03-15', date_delai: '2027-05-31', objet: 'Programme école', quantites: q }));
  assert.ok(r.ok, r.erreur);
  const bc = r.data.accordCadre.bons[0];
  assert.deepStrictEqual([bc.numero, bc.montant, bc.lignes.length], ['BC-01', 7260, 2]);
  assert.match(brut(A.apiBonAjouter(id, { numero: 'bc-01', montant: 100 })).erreur, /existe déjà/);
  assert.match(brut(A.apiBonAjouter(id, { numero: 'BC-09' })).erreur, /quantités du BPU, ou le montant/);
  // Planning : une ligne par bon, facture au délai d'exécution sans livrable
  let p = r.data.planning;
  assert.strictEqual(p.accordCadre, true);
  assert.deepStrictEqual(p.lignes.map((l) => [l.tranche, l.montant, l.etat, l.dateFacture]), [['BC-01', 7260, 'prévue', '2027-05-31']]);
  assert.strictEqual(p.lignes[0].bc.objet, 'Programme école');
  // Second bon (montant libre), au-delà du maximum : signalé
  r = brut(A.apiBonAjouter(id, { numero: 'BC-02', date: '2027-09-02', montant: 35000, objet: 'Recrutement MOE gymnase' }));
  assert.ok(r.data.accordCadre.depasse);
  assert.match(A.Affaires_get_(id).notes, /BC-02.*maximum de la période dépassé/);
  // Facturation du bon 1, rattachement Qonto par « KI-… BC-01 »
  A.Planning_facturer(id, 'BC-01', { numero: 'F-2027-03', date: '2027-05-31', montant: 7260 });
  p = A.Planning_affaire(id, quand);
  assert.strictEqual(p.lignes.find((l) => l.tranche === 'BC-01').etat, 'facturée');
  const ref = A.Qonto_reference_({ purchase_order: id + ' BC-02' }, (() => { const o = {}; A.Affaires_lister().forEach((a) => { o[a.id] = a; }); return o; })());
  assert.deepStrictEqual(brut(ref), { id_affaire: id, tranche: 'BC-02' });
  // Bon facturé : suppression refusée ; bon non facturé : supprimé
  const b1 = A.AC_bons(id).find((b) => b.numero === 'BC-01').id;
  assert.match(brut(A.apiBonSupprimer(id, b1)).erreur, /déjà facturé/);
  const b2 = A.AC_bons(id).find((b) => b.numero === 'BC-02').id;
  assert.ok(brut(A.apiBonSupprimer(id, b2)).ok);
  // Pas de solde automatique même si tout est encaissé
  A.Factures_maj(A.Db_lire(A.TABLES.FACTURES).find((f) => f.numero === 'F-2027-03').id, { date_encaissement: '2027-06-20', montant_encaisse: 26400 });
  assert.strictEqual(A.Affaires_get_(id).statut, 'Gagnée');
  // Échéancier : reconduction 2 mois avant la fin de la période
  const ech = brut(A.Echeances_calculer(new Date(2027, 11, 1), new Date(2028, 0, 31), new Date(2027, 11, 1))).filter((e) => e.type === 'Reconduction');
  assert.strictEqual(ech.length, 1);
  assert.match(String(ech[0].date), /^2027-12-29/); // 2 mois avant la fin de la période (29/02/2028)
  assert.match(ech[0].libelle, /Reconduction de l'accord-cadre au 01\/03\/2028/);
  // CA prévisionnel : potentiel = reste du DQE par période
  const pot = brut(A.AC_potentiel_(A.Affaires_get_(id), quand));
  assert.strictEqual(pot[2027], 26400 - 7260);
  assert.strictEqual(pot[2028], 26400);
  assert.strictEqual(pot[2030], 26400);
});

test('accord-cadre : BPU vierge du DCE (sans prix, n° de l\'acheteur, titres de chapitre), import du fichier déposé par le skill', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  A.installer({ exercice: false });
  const id = A.Affaires_creer({ acheteur: 'Commune de Gap', objet: 'AC AMO' }).id;
  A.Affaires_maj(id, { type_marche: 'Accord-cadre à bons de commande' });
  // Copie depuis Google Sheets : en-tête, chapitres, colonne prix vide, colonne montant vide
  const texte = 'N°\tDésignation des prestations\tUnité\tPrix unitaire HT\tQuantité\tMontant HT\n' +
    '1\tPHASE 1 — ÉTUDES\t\t\t\t\n1.1\tÉtude de faisabilité\tforfait\t\t2\t\n1.2\tRéunion de travail\tréunion\t\t12\t\n' +
    '2\tASSISTANCE\t\t\t\t\n2.1\tJournée d\'assistance\tjour\t\t10\t\n\tTOTAL DQE\t\t\t\t';
  let r = brut(A.apiBpuColler(id, texte));
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(r.data.ajoutees, 3);
  assert.strictEqual(r.data.sansPrix, 3);
  assert.deepStrictEqual(r.data.bpu.map((l) => [l.numero, l.designation, l.unite, l.prix_unitaire, l.quantite_dqe]),
    [['1.1', 'Étude de faisabilité', 'forfait', 0, 2], ['1.2', 'Réunion de travail', 'réunion', 0, 12], ['2.1', 'Journée d\'assistance', 'jour', 0, 10]]);
  // N° conservés à l'enregistrement après saisie des prix
  const lignes = r.data.bpu.map((l, i) => ({ numero: l.numero, designation: l.designation, unite: l.unite, prix_unitaire: [6600, 330, 550][i], quantite_dqe: l.quantite_dqe }));
  r = brut(A.apiBpuEnregistrer(id, lignes));
  assert.deepStrictEqual(r.data.bpu.map((l) => l.numero), ['1.1', '1.2', '2.1']);
  assert.strictEqual(r.data.affaire.montant_ht, 13200 + 3960 + 5500);
  // Fichier du skill dans 04 Offre : proposé, puis importé (remplace le BPU)
  A.Affaires_changerStatut(id, 'Go', {});
  assert.strictEqual(brut(A.apiAffaire(id)).data.bpuFichier, null);
  const tsv = '1.1\tÉtude de faisabilité\tforfait\t6875\t2\n1.2\tRéunion de travail\tréunion\t343,75\t12\n2.1\tJournée d\'assistance\tjour\t550\t10\n';
  A.Drive_deposer(id, '04 Offre', { nom: 'BPU-' + id + '.tsv', type: 'text/tab-separated-values', donnees: Buffer.from(tsv).toString('base64') });
  const fiche = brut(A.apiAffaire(id)).data;
  assert.strictEqual(fiche.bpuFichier.nom, 'BPU-' + id + '.tsv');
  r = brut(A.apiBpuImporterSkill(id));
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(r.data.importe.lignes, 3);
  assert.deepStrictEqual(r.data.bpu.map((l) => [l.numero, l.prix_unitaire]), [['1.1', 6875], ['1.2', 343.75], ['2.1', 550]]);
  assert.strictEqual(r.data.affaire.montant_ht, 13750 + 4125 + 5500);
  assert.match(A.Affaires_get_(id).notes, /BPU importé depuis BPU-/);
});

test('accord-cadre : cellules sur plusieurs lignes (copie Google Sheets), collage qui remplace le BPU', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  A.installer({ exercice: false });
  const id = A.Affaires_creer({ acheteur: 'Commune de Gap', objet: 'AC AMO' }).id;
  A.Affaires_maj(id, { type_marche: 'Accord-cadre à bons de commande' });
  // 5 prestations, dont 3 désignations sur plusieurs lignes dans leur cellule (entre guillemets à la copie)
  const q = '"';
  const texte = '1.1\t' + q + 'Étude de faisabilité\nd\'un équipement\n< 1 000 m²' + q + '\tforfait\t\t2\n' +
    '1.2\tRéunion de travail\tréunion\t\t12\n' +
    '1.3\t' + q + 'Analyse des offres de MOE\n(candidatures et offres)' + q + '\tconsultation\t\t2\n' +
    '2.1\t' + q + 'Journée d\'assistance\n' + q + q + 'vacation' + q + q + q + '\tjour\t\t10\n' +
    '2.2\tVisite de site\tvisite\t\t4';
  let r = brut(A.apiBpuColler(id, texte));
  assert.ok(r.ok, r.erreur);
  assert.strictEqual(r.data.bpu.length, 5);
  assert.deepStrictEqual(r.data.bpu.map((l) => l.numero), ['1.1', '1.2', '1.3', '2.1', '2.2']);
  assert.strictEqual(r.data.bpu[0].designation, 'Étude de faisabilité d\'un équipement < 1 000 m²');
  assert.strictEqual(r.data.bpu[3].designation, 'Journée d\'assistance "vacation"');
  assert.deepStrictEqual(r.data.bpu.map((l) => l.unite), ['forfait', 'réunion', 'consultation', 'jour', 'visite']);
  // Coller une 2e fois : remplace (toujours 5 lignes) ; avec « ajouter » : 10
  assert.strictEqual(brut(A.apiBpuColler(id, texte)).data.bpu.length, 5);
  assert.strictEqual(brut(A.apiBpuColler(id, texte, true)).data.bpu.length, 10);
});

test('accord-cadre : fichier Excel du BPU de l\'acheteur (colonnes par titre, « Tranche quantitative », cellules fusionnées, DQE séparé)', () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  A.installer({ exercice: false });
  const id = A.Affaires_creer({ acheteur: 'Ville X', objet: 'AC AMO économie de la construction' }).id;
  A.Affaires_maj(id, { type_marche: 'Accord-cadre à bons de commande' });
  // Feuille telle que lue par le navigateur (fusions verticales recopiées vers le bas, sauf la dernière)
  const bpu = [
    ['ACCORD-CADRE A BONS DE COMMANDE AMO économie de la construction', '', '', '', ''],
    ['Bordereau des prix unitaires (BPU)', '', '', '', ''],
    ['N° prix', 'Désignation', 'Unité', 'Tranche quantitative', 'Prix unitaire \n€ HT'],
    [1, 'MISSION 1 - ANALYSES TECHNICO-ECONOMIQUES TRANSVERSALES', '', '', ''],
    ['1.1', 'Etablissement d’une grille-type d’analyse comparative', 'Par typologie de travaux', '', 2400],
    ['1.5', 'Note d\'expertise thématique', 'Jour', '', 400],
    [2, 'MISSION 2 - ANALYSES D\'UNE OPERATION', '', '', ''],
    ['2A', 'Analyse technico-économique sans DPGF', '', '', ''],
    ['2A.1', 'Analyse des pièces écrites et graphiques', 'Par opération', 'Travaux analysés < 1,2M€HT', 800],
    ['2A.2', 'Analyse des pièces écrites et graphiques', 'Par opération', '1,2M€HT ≤ travaux analysés <2M€HT', 1000],
    ['2A.3', '', '', '2M€HT ≤ travaux analysés', 1200],
    ['2B.6', 'Plus-value pour vérification sur plan des quantités', 'Tranche de 500k€ HT de travaux analysés', '', 600],
    ['', 'TOTAL', '', '', '']
  ];
  const dqe = [['N°', 'Désignation', 'Quantité'], ['1.1', 'Grille-type', 2], ['2A.1', 'Analyse', 5], ['2B.6', 'Plus-value', 3]];
  const r = brut(A.apiBpuImporterTableau(id, [{ nom: 'BPU', lignes: bpu }, { nom: 'DQE', lignes: dqe }], false, 'KI-2026-011 - BPU - ind B.xlsx'));
  assert.ok(r.ok, r.erreur);
  const l = r.data.bpu;
  assert.deepStrictEqual(l.map((x) => x.numero), ['1.1', '1.5', '2A.1', '2A.2', '2A.3', '2B.6']);
  assert.deepStrictEqual(l.map((x) => x.prix_unitaire), [2400, 400, 800, 1000, 1200, 600]);
  assert.strictEqual(l[2].designation, 'Analyse des pièces écrites et graphiques — Travaux analysés < 1,2M€HT');
  assert.strictEqual(l[4].designation, 'Analyse des pièces écrites et graphiques — 2M€HT ≤ travaux analysés');
  assert.strictEqual(l[4].unite, 'Par opération');
  assert.strictEqual(l[5].unite, 'Tranche de 500k€ HT de travaux analysés');
  assert.deepStrictEqual(l.map((x) => x.quantite_dqe), [2, 0, 5, 0, 0, 3]);
  assert.strictEqual(r.data.affaire.montant_ht, 2400 * 2 + 800 * 5 + 600 * 3);
  assert.match(A.Affaires_get_(id).notes, /BPU importé depuis KI-2026-011 - BPU - ind B\.xlsx : 6 lignes/);
  // Fichier sans en-tête reconnu : message clair
  assert.match(brut(A.apiBpuImporterTableau(id, [{ nom: 'X', lignes: [['a', 'b'], ['c', 'd']] }])).erreur, /BPU non reconnu/);
  // Supprimer le BPU (erreur d'import) : plus aucune ligne, montant de l'offre à 0
  const sup = brut(A.apiBpuSupprimer(id));
  assert.ok(sup.ok, sup.erreur);
  assert.strictEqual(sup.data.supprimees, 6);
  assert.strictEqual(sup.data.bpu.length, 0);
  assert.strictEqual(sup.data.affaire.montant_ht, 0);
  assert.match(A.Affaires_get_(id).notes, /BPU supprimé \(6 lignes\)/);
});

test('URSSAF : périodes antérieures au début du suivi non relancées', () => {
  const { A } = jeuFiscal();
  A.Params_enregistrer('fiscal.debut_suivi', '2026-11-01');
  A.Params_cache_ = null;
  const d = brut(A.Fiscal_declarations(2026, new Date(2026, 10, 12)));
  assert.deepStrictEqual(d.periodes.map((p) => p.etat), ['non suivie', 'non suivie', 'non suivie', 'en cours']);
  A.Relances_synchroniser(new Date(2026, 10, 12));
  assert.strictEqual(A.Db_lire(A.TABLES.RELANCES).filter((x) => x.type === 'Déclaration URSSAF').length, 0);
});

test('URSSAF mensuel : 12 périodes, échéance fin du mois suivant', () => {
  const { A } = jeuFiscal();
  A.Params_enregistrer('fiscal.periodicite', 'mensuelle');
  A.Params_cache_ = null;
  const d = brut(A.Fiscal_declarations(2026, new Date(2026, 10, 12)));
  assert.strictEqual(d.periodes.length, 12);
  assert.strictEqual(d.periodes[2].id, '2026-M03');
  assert.strictEqual(d.periodes[2].ca, 10000);
  assert.strictEqual(d.periodes[2].echeance, '2026-04-30');
  assert.strictEqual(d.periodes[11].echeance, '2027-01-31');
});

test('installer() : début du suivi URSSAF = date d\'installation', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  assert.match(env.ctx.Params_texte('fiscal.debut_suivi'), /^\d{4}-\d{2}-\d{2}$/);
});

// ——— Fluidité et dossiers Drive ———

test('fluidité : un onglet n\'est lu qu\'une fois par appel, la mémoire suit les écritures', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  A.Db_viderCache_();
  const onglet = Object.values(env.classeurs)[0].getSheetByName('Paramètres');
  let lectures = 0;
  const getRange = onglet.getRange;
  onglet.getRange = function () { lectures++; return getRange.apply(onglet, arguments); };
  A.Db_lire(A.TABLES.PARAMETRES); A.Db_lire(A.TABLES.PARAMETRES); A.Db_trouver(A.TABLES.PARAMETRES, 'email.heure');
  const apres3 = lectures;
  assert.ok(apres3 <= 2, 'lectures : ' + apres3); // en-têtes + données, une seule fois
  const copie = A.Db_lire(A.TABLES.PARAMETRES)[0];
  copie.valeur = 'modifiée localement';
  assert.notStrictEqual(A.Db_lire(A.TABLES.PARAMETRES)[0].valeur, 'modifiée localement'); // copies
  A.Params_enregistrer('email.heure', '8');
  A.Params_cache_ = null;
  assert.strictEqual(A.Params_texte('email.heure'), '8'); // écriture → mémoire vidée
});

test('fluidité : l\'accueil en un seul appel', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
  const r = brut(env.ctx.apiAccueil());
  assert.ok(r.ok, r.erreur);
  assert.deepStrictEqual(Object.keys(r.data).sort(), ['alertes', 'ca', 'etat', 'fiscal', 'previsionnel', 'suivi', 'tableau']);
  assert.strictEqual(r.data.etat.onglets, undefined); // accueil : état léger, les onglets ne sont pas relus
  assert.strictEqual(brut(env.ctx.apiEtat()).data.onglets.length, 27); // 15 onglets du suivi + 12 du module Estimation
});

test('fluidité : relances recalculées après un changement de statut, pas à la lecture', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const a = A.Affaires_creer({ acheteur: 'Commune', objet: 'AMO' }).id;
  A.Affaires_changerStatut(a, 'Go', {});
  A.Affaires_changerStatut(a, 'Déposée', { montant_ht: 1000, jours_reponse: 1, date_depot: '2026-01-05', validite_offre_jours: 30 });
  A.apiEcheancier(); A.apiSuivi();
  assert.strictEqual(A.Db_lire(A.TABLES.RELANCES).length, 0); // lecture : aucune écriture
  A.apiAffaireMaj(a, { notes_libres: 'x' });
  assert.strictEqual(A.Db_lire(A.TABLES.RELANCES).filter((x) => x.type === 'Décision attendue').length, 1);
});

test('archivage : avis échus depuis plus de 60 jours déplacés dans « Avis archivés »', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  A.Db_insererPlusieurs(A.TABLES.AVIS, [
    { source: 'BOAMP', id_source: 'v1', acheteur: 'A', objet: 'vieux', date_limite: J(-61), statut: 'ignoré' },
    { source: 'BOAMP', id_source: 'v2', acheteur: 'B', objet: 'récent', date_limite: J(-10), statut: 'nouveau' },
    { source: 'BOAMP', id_source: 'v3', acheteur: 'C', objet: 'sans date ancien', date_parution: J(-130), statut: 'nouveau' },
    { source: 'BOAMP', id_source: 'v4', acheteur: 'D', objet: 'sans date récent', date_parution: J(-20), statut: 'nouveau' }
  ]);
  assert.strictEqual(A.Veille_archiver_(), 2);
  assert.deepStrictEqual(brut(A.Db_lire(A.TABLES.AVIS).map((x) => x.id_source)).sort(), ['v2', 'v4']);
  assert.deepStrictEqual(brut(A.Db_lire(A.TABLES.AVIS_ARCHIVES).map((x) => x.id_source)).sort(), ['v1', 'v3']);
  assert.strictEqual(A.Veille_archiver_(), 0);
});

test('Drive : dossier racine / année / affaire, sous-dossiers selon l\'étape, lien dans la fiche', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const dossiers = () => Object.values(A.DriveApp._dossiers).filter((d) => !d.corbeille);
  const enfants = (d) => dossiers().filter((x) => x.parent === d).map((x) => x.nom).sort();
  const id = A.Affaires_creer({ acheteur: 'Commune de Digne-les-Bains', objet: 'Programmation d\'une cantine / école' }, { date: '2026-11-12' }).id;
  const a = A.Affaires_get_(id);
  assert.match(a.lien_dce, /^https:\/\/drive\.google\.com\/drive\/folders\//);
  const racine = dossiers().find((d) => d.nom === 'Kartes Affaires — Dossiers');
  assert.ok(racine);
  assert.match(A.Params_texte('drive.dossier_racine'), /folders/);
  assert.deepStrictEqual(enfants(racine), ['2026']);
  const annee = dossiers().find((d) => d.nom === '2026');
  const nomAffaire = 'KI-2026-001 — Commune de Digne-les-Bains — Programmation d\'une cantine école';
  assert.deepStrictEqual(enfants(annee), [nomAffaire]);
  const dossier = dossiers().find((d) => d.nom === nomAffaire);
  assert.deepStrictEqual(enfants(dossier), ['01 DCE', '02 Questions et visite']);
  A.Affaires_changerStatut(id, 'Go', {});
  assert.deepStrictEqual(enfants(dossier), ['01 DCE', '02 Questions et visite', '03 Candidature', '04 Offre', '05 Dépôt']);
  A.Affaires_changerStatut(id, 'Déposée', { montant_ht: 1000, jours_reponse: 1 });
  A.Affaires_changerStatut(id, 'Gagnée', { date_notification: '2026-12-01', montant_notifie: 1000 });
  assert.deepStrictEqual(enfants(dossier), ['01 DCE', '02 Questions et visite', '03 Candidature', '04 Offre', '05 Dépôt', '06 Résultat', '07 Exécution', '08 Facturation', '09 Estimations']);
  // Chaque dossier connaît son étape (rangement dans les sous-onglets de la fiche)
  const p = brut(A.apiPieces(id).data);
  const et = (n) => p.dossiers.find((d) => d.nom === n);
  assert.deepStrictEqual([et('01 DCE').etape, et('04 Offre').etape, et('06 Résultat').etape, et('09 Estimations').etape], ['etude', 'go', 'resultat', 'gagnee']);
  assert.deepStrictEqual([et('07 Exécution').rang, et('08 Facturation').rang, et('09 Estimations').rang], [0, 1, 2]);
  // Deuxième affaire : même racine, même dossier d'année
  A.Affaires_creer({ acheteur: 'EPCI', objet: 'AMO' }, { date: '2026-11-13' });
  assert.strictEqual(dossiers().filter((d) => d.nom === 'Kartes Affaires — Dossiers').length, 1);
  assert.strictEqual(enfants(annee).length, 2);
});

test('Drive : désactivable ; une erreur Drive ne bloque pas l\'affaire et est notée', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  A.Params_enregistrer('drive.actif', 'non'); A.Params_cache_ = null;
  assert.strictEqual(A.Affaires_creer({ acheteur: 'X', objet: 'Y' }).lien_dce, '');
  A.Params_enregistrer('drive.actif', 'oui'); A.Params_cache_ = null;
  const createFolder = A.DriveApp.createFolder;
  A.DriveApp.createFolder = () => { throw new Error('Quota Drive dépassé'); };
  const b = A.Affaires_creer({ acheteur: 'Z', objet: 'W' });
  assert.strictEqual(b.statut, 'En étude');
  assert.match(b.notes, /Dossier Drive non créé : Quota Drive dépassé/);
  A.DriveApp.createFolder = createFolder;
  assert.strictEqual(A.creerDossiersManquants(), 2); // rattrapage des deux affaires sans dossier
});

test('Drive : installer() crée le dossier de l\'exercice Mouthe', () => {
  const env = creerEnvironnement();
  const L = console.log; console.log = () => {}; const r = env.ctx.installer(); console.log = L;
  assert.strictEqual(r.dossiersDrive, 0); // créé dès la création de l'affaire
  assert.match(env.ctx.Affaires_get_('KI-2026-001').lien_dce, /folders/);
});

test('Pièces : dépôt depuis la fiche, rangement dans le sous-dossier, nom non écrasé, liste et journal', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const id = A.Affaires_creer({ acheteur: 'Commune de Gap', objet: 'AMO programmation école' }).id;
  const b64 = (t) => Buffer.from(t).toString('base64');
  // En étude : 01 DCE proposé par défaut
  let p = brut(A.apiPieces(id));
  assert.ok(p.ok);
  assert.strictEqual(p.data.parDefaut, '01 DCE');
  assert.deepStrictEqual(p.data.dossiers.map((d) => d.nom), ['01 DCE', '02 Questions et visite']);
  // Dépôt de deux fichiers de même nom : le second est renommé
  let r = brut(A.apiPieceDeposer(id, '01 DCE', { nom: 'RC.pdf', type: 'application/pdf', donnees: b64('règlement') }));
  assert.ok(r.ok, r.erreur);
  r = brut(A.apiPieceDeposer(id, '01 DCE', { nom: 'RC.pdf', type: 'application/pdf', donnees: b64('règlement v2') }));
  assert.strictEqual(r.data.depose.nom, 'RC (2).pdf');
  const dce = r.data.dossiers.find((d) => d.nom === '01 DCE');
  assert.deepStrictEqual(dce.fichiers.map((f) => f.nom), ['RC (2).pdf', 'RC.pdf']); // plus récent en tête
  assert.strictEqual(dce.fichiers[1].taille, Buffer.from('règlement').length);
  assert.match(dce.fichiers[0].url, /drive\.google\.com\/file/);
  assert.match(A.Affaires_get_(id).notes, /Pièce déposée : 01 DCE \/ RC\.pdf/);
  // Go : 04 Offre par défaut ; Déposée : 05 Dépôt
  A.Affaires_changerStatut(id, 'Go', {});
  assert.strictEqual(brut(A.apiPieces(id)).data.parDefaut, '04 Offre');
  A.Affaires_changerStatut(id, 'Déposée', { montant_ht: 1000, jours_reponse: 1 });
  assert.strictEqual(brut(A.apiPieces(id)).data.parDefaut, '05 Dépôt');
});

test('Pièces : suppression d\'un fichier (corbeille Drive), seulement dans le dossier de l\'affaire', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  const b64 = (t) => Buffer.from(t).toString('base64');
  const id = A.Affaires_creer({ acheteur: 'Commune de Gap', objet: 'AMO programmation école' }).id;
  const autre = A.Affaires_creer({ acheteur: 'Commune de Digne', objet: 'AMO cantine' }).id;
  A.apiPieceDeposer(id, '01 DCE', { nom: 'RC.pdf', donnees: b64('rc') });
  let r = brut(A.apiPieceDeposer(id, '01 DCE', { nom: 'CCTP.pdf', donnees: b64('cctp') }));
  const fichier = r.data.dossiers.find((d) => d.nom === '01 DCE').fichiers.find((f) => f.nom === 'RC.pdf');
  assert.ok(fichier.id);
  // Depuis une autre affaire : refusé
  assert.match(brut(A.apiPieceSupprimer(autre, fichier.id)).erreur, /introuvable/);
  // Depuis la bonne affaire : à la corbeille, liste à jour, note au journal
  r = brut(A.apiPieceSupprimer(id, fichier.id));
  assert.ok(r.ok, r.erreur);
  assert.deepStrictEqual(r.data.dossiers.find((d) => d.nom === '01 DCE').fichiers.map((f) => f.nom), ['CCTP.pdf']);
  assert.match(A.Affaires_get_(id).notes, /Pièce supprimée \(corbeille Drive\) : 01 DCE \/ RC\.pdf/);
  // Déjà supprimé
  assert.match(brut(A.apiPieceSupprimer(id, fichier.id)).erreur, /introuvable/);
});

test('Pièces : fichier trop lourd refusé ; dossier créé au premier dépôt s\'il manque', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  A.Params_enregistrer('drive.actif', 'non'); A.Params_cache_ = null;
  const id = A.Affaires_creer({ acheteur: 'X', objet: 'Y' }).id;
  assert.strictEqual(brut(A.apiPieces(id)).data.url, '');
  assert.match(brut(A.apiPieceDeposer(id, '01 DCE', { nom: 'a.txt', donnees: 'YQ==' })).erreur, /désactivés/);
  A.Params_enregistrer('drive.actif', 'oui'); A.Params_cache_ = null;
  assert.ok(brut(A.apiPieceDeposer(id, '01 DCE', { nom: 'a.txt', donnees: 'YQ==' })).ok);
  assert.match(A.Affaires_get_(id).lien_dce, /folders/);
  A.PIECE_TAILLE_MAX = 2;
  assert.match(brut(A.apiPieceDeposer(id, '01 DCE', { nom: 'gros.zip', donnees: Buffer.from('abc').toString('base64') })).erreur, /dépasse .* Mo/);
});

test('plateformes : nouveaux domaines ajoutés à une liste existante, même modifiée ; lien reconnu dans l\'alerte', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  A.Db_maj(A.TABLES.PARAMETRES, 'veille.plateformes_domaines', { valeur: 'achatpublic.com;mon-site.fr' });
  A.Params_cache_ = null;
  const r = brut(A.installer({ exercice: false }));
  assert.ok(r.parametresMisAJour.indexOf('veille.plateformes_domaines') >= 0);
  assert.deepStrictEqual(brut(A.Params_liste('veille.plateformes_domaines')),
    ['achatpublic.com', 'mon-site.fr', 'ampmetropole.fr', 'safetender.com', 'ville-gap.fr', 'maregionsud.fr', 'departement13.fr', 'laprovencemarchespublics.com']);
  assert.deepStrictEqual(brut(A.installer({ exercice: false })).parametresMisAJour, []); // rien de plus au 2e passage
  const ctx = A.Veille_contexte_();
  const a = A.Veille_depuisEmail_('m1', 'Nouvelle consultation', 'Métropole <alerte@x.fr>',
    'Voir https://www.exemple.fr/pub puis https://marchespublics.ampmetropole.fr/entreprise/consultation/123 — 13001 Marseille', new Date(), ctx);
  assert.strictEqual(a.lien, 'https://marchespublics.ampmetropole.fr/entreprise/consultation/123');
});

test('fiche : chaque champ saisissable a une aide ; exemples transmis à l\'interface', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const meta = brut(env.ctx.Affaires_meta_());
  const sansAide = [];
  meta.blocs.forEach((b) => b.champs.forEach((c) => { if (!c.aide) sansAide.push(c.nom); }));
  Object.values(meta.passage).forEach((l) => l.forEach((c) => { if (!c.aide) sansAide.push(c.nom); }));
  assert.deepStrictEqual(sansAide, []);
  const tranches = meta.blocs.find((b) => b.id === 'offre').champs.find((c) => c.nom === 'tranches');
  assert.match(tranches.aide, /tranche ferme/);
  assert.match(tranches.exemple, /^TF : /);
});

test('page : titre « Kartes Affaires » et icône Kompa dans l\'onglet', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const o = env.ctx.doGet();
  assert.strictEqual(o.titre, 'Kartes Affaires');
  assert.match(o.favicon, /kartes-icone-192\.png$/);
  env.ctx.Params_enregistrer('app.favicon_url', 'https://exemple.fr/icone.png'); env.ctx.Params_cache_ = null;
  assert.strictEqual(env.ctx.doGet().favicon, 'https://exemple.fr/icone.png');
});

// ——— Filtres PACA-Corse et domaine bâtiment (échantillon réel de 137 avis, juil.-nov. 2026) ———

const PACA = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'boamp-paca-corse.json'), 'utf8'));

test('filtres PACA-Corse : 39 avis gardés sur 137 (dont 10 AMO « bâtiment à vérifier »), Ministère des Armées exclu', () => {
  const env = creerEnvironnement({ boamp: PACA });
  env.ctx.installer({ exercice: false });
  const ctx = env.ctx.Veille_contexte_();
  const garde = (idObjet) => {
    const r = PACA.results.find((x) => x.objet.indexOf(idObjet) >= 0);
    return env.ctx.Veille_filtrer_(env.ctx.Veille_depuisBoamp_(r, ctx), ctx).garde;
  };
  const filtre = (r) => env.ctx.Veille_filtrer_(env.ctx.Veille_depuisBoamp_(r, ctx), ctx);
  const gardes = PACA.results.filter((r) => filtre(r).garde);
  assert.strictEqual(gardes.length, 39); // 40 avant l'exclusion des acheteurs du Ministère des Armées (AMO de la BAN de Hyères, SID-MED)
  assert.strictEqual(gardes.filter((r) => filtre(r).batimentAVerifier).length, 10); // 11 avant (l'AMO de la BAN en était)
  assert.ok(!garde('AMO environnemental pour l’accueil des HIL sur la BAN de Hyères'), 'SID-MED exclu');
  // Assouplissement : AMO explicite sans mot du bâtiment → gardée, bâtiment à vérifier
  ['Assistance technique à maîtrise d\'ouvrage pour les marchés de travaux - 13120 - Gardanne', 'compétences "Cadre de Vie" de la CASA',
    'lancement des consultations de la maitrise d\'oeuvre', 'Programmation De La Construction D\'Une Nouvelle'].forEach((o) => assert.ok(garde(o), 'devrait être gardé (à vérifier) : ' + o));
  // … sauf domaines hors sujet (débroussaillement, enfance, Jeux olympiques)
  ['PMPFCI DES ALPILLES', 'PIDAF DE LA CASSB', 'politique enfance-famill', 'Jeux Olympiques 2030'].forEach((o) => assert.ok(!garde(o), 'devrait être exclu : ' + o));
  // Gardés : AMO bâtiment des communes et collectivités
  ['programmation d\'une nouvelle cantine', 'groupe scolaire et la cuisine centrale', 'RÉNOVATION DE LA PISCINE JEAN MARET',
    'réalisation d\'une cuisine centrale', 'accompagnement foncier pour un projet de collège', 'MUSEE D’ART ET D’HISTOIRE',
    'PLAN DE RENOVATION DES BÂTIMENTS DÉPARTEMENTAUX'].forEach((o) => assert.ok(garde(o), 'devrait être gardé : ' + o));
  // Exclus : eau, DSP, amiante, jeux d'enfants, PLU, programmation culturelle, maîtrise d'œuvre
  ['SCHEMA DIRECTEUR D\'ALIMENTATION EN EAU POTABLE', 'contrats de DSP eau potable', 'diagnostics amiante et plomb',
    'jeux d\'enfants', 'révision du Plan Local d’Urbanisme', 'PRESTATIONS ARTISTIQUES CULTURELLES', 'Maitrise d\'oeuvre pour le projet de rénovation énergétique',
    'lutte contre les termites'].forEach((o) => assert.ok(!garde(o), 'devrait être exclu : ' + o));
});

test('filtres : hors zone exclu ; Corse (2A, 2B, code postal 20) gardée', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const ctx = env.ctx.Veille_contexte_();
  const f = (deps) => env.ctx.Veille_filtrer_({ objet: 'AMO programmation d\'une école', departement: deps[0], departements: deps }, ctx);
  assert.strictEqual(f(['59']).garde, false);
  assert.strictEqual(f(['59']).motif, 'hors zone');
  assert.strictEqual(f(['2A']).garde, true);
  assert.strictEqual(f(['2B']).garde, true);
  assert.strictEqual(f(['75', '13']).garde, true);
  assert.strictEqual(env.ctx.Veille_depuisBoamp_({ idweb: 'x', objet: 'AMO', nomacheteur: 'Commune d\'Ajaccio', code_departement: ['2a'] }, ctx).departement, '2A');
  assert.match(env.ctx.Veille_requeteBoamp_(ctx, '2026-11-10'), /code_departement in \('04','4',.*'2A','20','2B'\)/);
});

test('filtres : mot entier et début de mot (graphique ≠ muséographique, plu ≠ plus)', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const m = env.ctx.Veille_contientMot_;
  assert.strictEqual(m('etude museographique', ['graphique']), '');
  assert.strictEqual(m('services graphiques', ['graphique']), 'graphique');
  assert.strictEqual(m('revision du plu', ['plu ']), 'plu');
  assert.strictEqual(m('plus de surfaces', ['plu ']), '');
  // Via les paramètres : l'espace finale de « plu », « dsp », « opc » est conservée (mot entier)
  const ctx = env.ctx.Veille_contexte_();
  const f = (objet) => env.ctx.Veille_filtrer_({ objet: objet, cpv: '71241000', departement: '13', departements: ['13'] }, ctx);
  assert.strictEqual(f('AMO pour plusieurs bâtiments scolaires').garde, true);
  assert.strictEqual(f('AMO pour la révision du PLU de la commune').garde, false);
  assert.strictEqual(f('AMO OPC pour la construction d\'une école').garde, false);
  assert.strictEqual(f('AMO école, opcvm').garde, true);
});

test('migration : anciennes valeurs par défaut mises à jour, valeurs modifiées respectées ; avis re-filtrés', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  A.Db_maj(A.TABLES.PARAMETRES, 'zone.departements_paca', { valeur: '04;05;06;13;83;84' });
  A.Db_maj(A.TABLES.PARAMETRES, 'zone.libelle_paca', { valeur: 'PACA' });
  A.Db_maj(A.TABLES.PARAMETRES, 'veille.exclusions', { valeur: 'mes exclusions à moi' });
  A.Db_insererPlusieurs(A.TABLES.AVIS, [
    { source: 'BOAMP', id_source: 'm1', acheteur: 'Commune', objet: 'AMO programmation d\'une école', zone: 'PACA', departement: '13', statut: 'nouveau', classement: 'à étudier' },
    { source: 'BOAMP', id_source: 'm2', acheteur: 'Syndicat', objet: 'Assistance technique schéma directeur eau potable', zone: 'PACA', departement: '83', statut: 'nouveau', classement: 'à étudier' }
  ]);
  A.Params_cache_ = null;
  const r = brut(A.installer({ exercice: false }));
  assert.deepStrictEqual(r.parametresMisAJour, ['zone.departements_paca', 'zone.libelle_paca']);
  assert.strictEqual(A.Params_texte('veille.exclusions'), 'mes exclusions à moi');
  const avis = A.Db_lire(A.TABLES.AVIS);
  assert.ok(avis.every((a) => a.zone === 'PACA-Corse'));
  assert.strictEqual(avis.find((a) => a.id_source === 'm1').statut, 'nouveau');
  const m2 = avis.find((a) => a.id_source === 'm2');
  assert.strictEqual(m2.statut, 'archivé'); // re-filtré : hors domaine bâtiment
  assert.match(m2.score_detail, /Exclu par les nouveaux filtres : hors domaine bâtiment/);
});

let echecs = 0;
tests.forEach(({ nom, fn }) => {
  try {
    const { log, error } = console; console.log = console.error = () => {};
    try { fn(); } finally { console.log = log; console.error = error; }
    console.log('  ok   ' + nom);
  } catch (e) {
    echecs++;
    console.log('  ÉCHEC ' + nom + '\n        ' + (e.stack || e).toString().split('\n').slice(0, 8).join('\n        '));
  }
});
console.log(`\n${tests.length - echecs}/${tests.length} tests réussis`);
process.exit(echecs ? 1 : 0);
