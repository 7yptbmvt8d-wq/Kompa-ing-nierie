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

test('installer() crée le classeur, les 11 onglets et supprime la feuille par défaut', () => {
  const env = creerEnvironnement();
  const rapport = env.ctx.installer({ exercice: false });
  const ss = Object.values(env.classeurs)[0];
  assert.strictEqual(ss.getName(), 'Kompa Affaires — données');
  const noms = ss.getSheets().map((f) => f.getName());
  assert.deepStrictEqual(noms, ['Avis', 'Affaires', 'Historique', 'Critères', 'Factures', 'Relances', 'Acheteurs', 'Paramètres', 'Déclarations', 'Journal moteur', 'Avis archivés']);
  assert.ok(rapport.parametresAjoutes > 40);
  assert.deepStrictEqual(brut(rapport.declencheurs), ['sauvegardeHebdo', 'collecteQuotidienne', 'envoyerEmailMatin']);
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
  assert.strictEqual(env.declencheurs.length, 3);
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
  assert.strictEqual(r.data.onglets.length, 11);
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
  assert.strictEqual(r.exerciceMouthe, 'KA-2026-001');
  assert.strictEqual(env.ctx.installer().exerciceMouthe, 'KA-2026-001');
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

// ——— Lot 4 : échéances, relances, courriers, e-mail ———

const J = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Jeu d'affaires couvrant tous les cas du § 5. */
const jeuEcheances = () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
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
  assert.deepStrictEqual(m.nombres, { avisPaca: 1, avisFrance: 2, echeances: 3, relances: 1 }); // relance « motifs » créée au passage en Perdue
  assert.match(m.sujet, /^Kompa Affaires — \d{2}\/\d{2}\/\d{4} — 3 nouveaux avis · 3 échéances$/);
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
  assert.strictEqual(env.ctx.MailApp.envois[0].name, 'Kompa Affaires');
});

test('e-mail du matin : rien à signaler → pas d\'envoi, sauf le lundi', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const A = env.ctx;
  assert.strictEqual(brut(A.Email_envoyer_(new Date(2026, 10, 17, 7), false)).envoye, false); // mardi
  assert.strictEqual(brut(A.Email_envoyer_(new Date(2026, 10, 16, 7), false)).envoye, true);  // lundi
  assert.match(A.MailApp.envois[0].htmlBody, /Rien de nouveau/);
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
  assert.deepStrictEqual(e.map((x) => x.id), ['KA-2026-001', 'KA-2026-003']);
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
  assert.ok(env.ctx.Db_lire(T.HISTORIQUE).every((h) => h.id_affaire === 'KA-2026-001'));
  assert.strictEqual(env.ctx.Db_lire(T.FACTURES).length, 0);
  assert.strictEqual(env.ctx.Db_lire(T.CRITERES).filter((c) => c.id_affaire !== 'KA-2026-001').length, 0);
  assert.strictEqual(brut(env.ctx.Compteur_ca(2026)).encaisse, 0);
});

// ——— Déclarations URSSAF (CA au rythme des déclarations) ———

const jeuFiscal = () => {
  const env = creerEnvironnement();
  const A = env.ctx;
  A.installer({ exercice: false });
  A.Params_enregistrer('fiscal.debut_suivi', '2026-01-01');
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
  assert.deepStrictEqual(d.periodes.map((p) => p.ca), [10000, 0, 13000, 0]);
  assert.deepStrictEqual(d.periodes.map((p) => p.echeance), ['2026-04-30', '2026-07-31', '2026-10-31', '2027-01-31']);
  assert.deepStrictEqual(d.periodes.map((p) => p.etat), ['en retard', 'en retard', 'en retard', 'en cours']);
  const t3 = d.periodes[2];
  assert.strictEqual(t3.cotisations, 3016);   // 13 000 × 23,2 %
  assert.strictEqual(t3.cfp, 26);             // 13 000 × 0,2 %
  assert.strictEqual(t3.impot, 286);          // 13 000 × 2,2 % (versement libératoire)
  assert.strictEqual(t3.total, 3328);
  assert.strictEqual(d.totaux.ca, 23000);
  assert.strictEqual(d.tauxManquants, false);
});

test('URSSAF : taux de cotisations non renseigné → estimation absente, CA présent', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const d = brut(env.ctx.Fiscal_declarations(2026));
  assert.strictEqual(d.tauxManquants, true);
  assert.strictEqual(d.periodes[0].total, null);
  assert.strictEqual(d.periodes[0].ca, 0);
});

test('URSSAF : relance et échéance tant que non déclaré ; déclaration → sans objet', () => {
  const { A } = jeuFiscal();
  const quand = new Date(2026, 10, 12);
  A.Relances_synchroniser(quand);
  const urssaf = () => A.Db_lire(A.TABLES.RELANCES).filter((x) => x.type === 'Déclaration URSSAF');
  assert.strictEqual(urssaf().length, 3); // T1, T2, T3 en retard
  assert.match(urssaf().find((x) => x.cle === 'urssaf:2026-T3').commentaire, /13 000,00 €, avant le 31\/10\/2026/);
  const ech = brut(A.Echeances_calculer(new Date(2026, 10, 12), new Date(2026, 11, 31), quand)).filter((e) => e.type === 'Déclaration');
  assert.strictEqual(ech.length, 3);
  assert.ok(ech.every((e) => e.depassee && e.acheteur === 'URSSAF'));
  ['2026-T1', '2026-T2', '2026-T3'].forEach((id) => assert.ok(A.apiDeclarer(id, '', '2026-11-12').ok));
  A.Relances_synchroniser(quand);
  assert.ok(urssaf().every((x) => x.statut === 'sans objet'));
  const d = brut(A.Fiscal_declarations(2026, quand));
  assert.deepStrictEqual(d.periodes.map((p) => p.etat), ['déclarée', 'déclarée', 'déclarée', 'en cours']);
  assert.ok(A.apiAnnulerDeclaration('2026-T3').ok);
  assert.strictEqual(brut(A.Fiscal_declarations(2026, quand)).periodes[2].etat, 'en retard');
  assert.strictEqual(A.apiDeclarer('2026-T9', 1, '').ok, false);
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
  assert.deepStrictEqual(Object.keys(r.data).sort(), ['ca', 'etat', 'fiscal', 'suivi', 'tableau']);
  assert.strictEqual(r.data.etat.onglets.length, 11);
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
  const racine = dossiers().find((d) => d.nom === 'Kompa Affaires — Dossiers');
  assert.ok(racine);
  assert.match(A.Params_texte('drive.dossier_racine'), /folders/);
  assert.deepStrictEqual(enfants(racine), ['2026']);
  const annee = dossiers().find((d) => d.nom === '2026');
  const nomAffaire = 'KA-2026-001 — Commune de Digne-les-Bains — Programmation d\'une cantine école';
  assert.deepStrictEqual(enfants(annee), [nomAffaire]);
  const dossier = dossiers().find((d) => d.nom === nomAffaire);
  assert.deepStrictEqual(enfants(dossier), ['01 DCE', '02 Questions et visite']);
  A.Affaires_changerStatut(id, 'Go', {});
  assert.deepStrictEqual(enfants(dossier), ['01 DCE', '02 Questions et visite', '03 Candidature', '04 Offre', '05 Dépôt']);
  A.Affaires_changerStatut(id, 'Déposée', { montant_ht: 1000, jours_reponse: 1 });
  A.Affaires_changerStatut(id, 'Gagnée', { date_notification: '2026-12-01', montant_notifie: 1000 });
  assert.deepStrictEqual(enfants(dossier), ['01 DCE', '02 Questions et visite', '03 Candidature', '04 Offre', '05 Dépôt', '06 Résultat', '07 Exécution', '08 Facturation']);
  // Deuxième affaire : même racine, même dossier d'année
  A.Affaires_creer({ acheteur: 'EPCI', objet: 'AMO' }, { date: '2026-11-13' });
  assert.strictEqual(dossiers().filter((d) => d.nom === 'Kompa Affaires — Dossiers').length, 1);
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
  assert.match(env.ctx.Affaires_get_('KA-2026-001').lien_dce, /folders/);
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

test('page : titre « Kompa Affaires » et icône Kompa dans l\'onglet', () => {
  const env = creerEnvironnement();
  env.ctx.installer({ exercice: false });
  const o = env.ctx.doGet();
  assert.strictEqual(o.titre, 'Kompa Affaires');
  assert.match(o.favicon, /kompa-icone-192\.png$/);
  env.ctx.Params_enregistrer('app.favicon_url', 'https://exemple.fr/icone.png'); env.ctx.Params_cache_ = null;
  assert.strictEqual(env.ctx.doGet().favicon, 'https://exemple.fr/icone.png');
});

// ——— Filtres PACA-Corse et domaine bâtiment (échantillon réel de 137 avis, juil.-nov. 2026) ———

const PACA = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'boamp-paca-corse.json'), 'utf8'));

test('filtres PACA-Corse : 29 avis du domaine bâtiment gardés sur 137', () => {
  const env = creerEnvironnement({ boamp: PACA });
  env.ctx.installer({ exercice: false });
  const ctx = env.ctx.Veille_contexte_();
  const garde = (idObjet) => {
    const r = PACA.results.find((x) => x.objet.indexOf(idObjet) >= 0);
    return env.ctx.Veille_filtrer_(env.ctx.Veille_depuisBoamp_(r, ctx), ctx).garde;
  };
  const gardes = PACA.results.filter((r) => env.ctx.Veille_filtrer_(env.ctx.Veille_depuisBoamp_(r, ctx), ctx).garde);
  assert.strictEqual(gardes.length, 29);
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
    { source: 'BOAMP', id_source: 'm2', acheteur: 'Syndicat', objet: 'AMO schéma directeur eau potable', zone: 'PACA', departement: '83', statut: 'nouveau', classement: 'à étudier' }
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
