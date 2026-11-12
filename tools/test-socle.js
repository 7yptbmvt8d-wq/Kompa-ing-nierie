/**
 * Tests du lot 1 (socle) sous Node : node tools/test-socle.js
 * Exécute le vrai code de src/ sur une simulation des services Google.
 */
'use strict';

const assert = require('assert');
const { creerEnvironnement } = require('./gas-mock');

const tests = [];
const test = (nom, fn) => tests.push({ nom, fn });
// Les objets créés dans le contexte vm n'ont pas les mêmes prototypes : on compare des copies JSON.
const brut = (x) => JSON.parse(JSON.stringify(x));

test('installer() crée le classeur, les 9 onglets et supprime la feuille par défaut', () => {
  const env = creerEnvironnement();
  const rapport = env.ctx.installer({ exercice: false });
  const ss = Object.values(env.classeurs)[0];
  assert.strictEqual(ss.getName(), 'Kompa Affaires — données');
  const noms = ss.getSheets().map((f) => f.getName());
  assert.deepStrictEqual(noms, ['Avis', 'Affaires', 'Historique', 'Critères', 'Factures', 'Relances', 'Acheteurs', 'Paramètres', 'Journal moteur']);
  assert.ok(rapport.parametresAjoutes > 40);
  assert.deepStrictEqual(brut(rapport.declencheurs), ['sauvegardeHebdo', 'collecteQuotidienne']);
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
  assert.strictEqual(env.declencheurs.length, 2);
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
  assert.deepStrictEqual(brut(env.ctx.Params_liste('zone.departements_paca')), ['04', '05', '06', '13', '83', '84']);
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
  assert.strictEqual(r.data.onglets.length, 9);
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
  assert.strictEqual(actives.length, 2);
  assert.match(actives[0].nom, /^Kompa Affaires — données — \d{4}-\d{2}-\d{2}$/);
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
    { id_affaire: 'KA-2026-001', numero: 'F1', date: '15/01/2026', montant: 20000, date_encaissement: '10/02/2026', montant_encaisse: 20000 },
    { id_affaire: 'KA-2026-001', numero: 'F2', date: new Date(2026, 4, 2), montant: '11 000,00 €', date_encaissement: new Date(2026, 5, 1), montant_encaisse: 11000 },
    { id_affaire: 'KA-2026-002', numero: 'F3', date: '01/10/2026', montant: 4000 }, // non payée
    { id_affaire: 'KA-2025-009', numero: 'F0', date: '01/12/2025', montant: 5000, date_encaissement: '05/01/2025', montant_encaisse: 5000 } // autre année
  ]);
  env.ctx.Db_insererPlusieurs(T.AFFAIRES, [
    { id: 'KA-2026-002', statut: 'Gagnée', montant_notifie: 12000, date_notification: '01/09/2026' },
    { id: 'KA-2026-003', statut: 'Perdue', montant_notifie: '' }
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
  const avant = fs.readFileSync(path.join(__dirname, '..', 'dist', 'Code.gs'), 'utf8');
  require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'build.js')]);
  const apres = fs.readFileSync(path.join(__dirname, '..', 'dist', 'Code.gs'), 'utf8');
  assert.strictEqual(avant, apres, 'dist/ n\'était pas à jour : lancer npm run build et committer');
  const env = creerEnvironnement({ dist: true });
  env.ctx.installer({ exercice: false });
  assert.ok(env.ctx.apiParametreEnregistrer('seuil.plafond_vise', '75000').ok);
  assert.ok(env.ctx.apiCompteurCA().ok);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'dist', 'Index.html'), 'utf8'), /<\?/);
});

// ——— Lot 2 : Affaires ———

const nouvelleAffaire = (env, extra = {}) => env.ctx.Affaires_creer(Object.assign({ acheteur: 'Commune de Test', objet: 'AMO faisabilité' }, extra));

test('affaire : numérotation KA-AAAA-NNN, statut En étude et historique daté', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const a1 = nouvelleAffaire(env);
  const a2 = nouvelleAffaire(env);
  const an = new Date().getFullYear();
  assert.strictEqual(a1.id, `KA-${an}-001`);
  assert.strictEqual(a2.id, `KA-${an}-002`);
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
  assert.strictEqual(id, 'KA-2026-001');
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
const veilleEnv = (opts = {}) => {
  const env = creerEnvironnement(Object.assign({ boamp: ECHANTILLON }, opts));
  env.ctx.installer({ exercice: false });
  return env;
};
const rec = (idweb) => ECHANTILLON.results.find((r) => r.idweb === idweb);

test('installer() crée l\'affaire d\'exercice Mouthe et le déclencheur de collecte', () => {
  const env = creerEnvironnement();
  const r = env.ctx.installer();
  assert.strictEqual(r.exerciceMouthe, 'KA-2026-001');
  assert.strictEqual(env.ctx.installer().exerciceMouthe, 'KA-2026-001');
  assert.strictEqual(env.ctx.Affaires_lister().length, 1);
  assert.ok(env.declencheurs.some((t) => t.getHandlerFunction() === 'collecteQuotidienne'));
});

test('veille : requête BOAMP (services, appels d\'offres, CPV, mots-clés)', () => {
  const env = veilleEnv();
  const ctx = env.ctx.Veille_contexte_();
  const w = env.ctx.Veille_requeteBoamp_(ctx, '2026-11-09');
  assert.match(w, /^dateparution>=date'2026-11-09' and nature='APPEL_OFFRE' and type_marche='SERVICES' and \(/);
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

test('veille : pré-score § 3.4 et classement', () => {
  const env = veilleEnv();
  const ctx = env.ctx.Veille_contexte_();
  ctx.aujourdhui = new Date(2026, 10, 12);
  ctx.montantMax = 50000;
  const loin = new Date(2026, 11, 10), proche = new Date(2026, 10, 18);
  const a = env.ctx.Veille_scorer_({ objet: 'AMO programmation d\'une école', departement: '04', departements: ['04'], type_acheteur: 'Commune', date_limite: loin }, ctx);
  assert.strictEqual(a.pre_score, 25 + 30 + 15 + 15 + 8);
  assert.strictEqual(a.classement, 'à étudier');
  assert.strictEqual(a.zone, 'PACA');
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
  assert.ok(boamp.retenus >= 25, 'retenus : ' + boamp.retenus);
  assert.ok(boamp.exclus >= 4, 'exclus : ' + boamp.exclus);
  // Deux avis EHPAD Marguerite de Flandre (26-107459 et 26-107551) : même acheteur, même date, même objet → 1 seul
  const avis = env.ctx.Db_lire(env.ctx.TABLES.AVIS);
  assert.strictEqual(avis.length, boamp.retenus);
  const ehpad = avis.filter((a) => /MARGUERITE DE FLANDRE/i.test(a.acheteur));
  assert.strictEqual(ehpad.length, 1);
  assert.match(String(ehpad[0].liens_autres), /26-107/);
  assert.ok(avis.every((a) => a.pre_score > 0 && a.zone && a.classement && a.statut));
  assert.ok(avis.some((a) => a.zone === 'PACA'));
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
  assert.strictEqual(lurs.zone, 'PACA');
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
  assert.match(r.data.id, /^KA-\d{4}-001$/);
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

let echecs = 0;
tests.forEach(({ nom, fn }) => {
  try {
    const { log, error } = console; console.log = console.error = () => {};
    try { fn(); } finally { console.log = log; console.error = error; }
    console.log('  ok   ' + nom);
  } catch (e) {
    echecs++;
    console.log('  ÉCHEC ' + nom + '\n        ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n        '));
  }
});
console.log(`\n${tests.length - echecs}/${tests.length} tests réussis`);
process.exit(echecs ? 1 : 0);
