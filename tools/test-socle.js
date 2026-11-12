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
  const rapport = env.ctx.installer();
  const ss = Object.values(env.classeurs)[0];
  assert.strictEqual(ss.getName(), 'Kompa Affaires — données');
  const noms = ss.getSheets().map((f) => f.getName());
  assert.deepStrictEqual(noms, ['Avis', 'Affaires', 'Historique', 'Critères', 'Factures', 'Relances', 'Acheteurs', 'Paramètres', 'Journal moteur']);
  assert.ok(rapport.parametresAjoutes > 40);
  assert.deepStrictEqual(brut(rapport.declencheurs), ['sauvegardeHebdo']);
});

test('chaque onglet a id/clé en 1re colonne et cree_le, modifie_le en fin', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
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
  env.ctx.installer();
  const r2 = env.ctx.installer();
  assert.strictEqual(r2.parametresAjoutes, 0);
  assert.strictEqual(r2.colonnesAjoutees, 0);
  assert.strictEqual(env.declencheurs.length, 1);
  const params = env.ctx.Db_lire(env.ctx.TABLES.PARAMETRES);
  const cles = params.map((p) => p.cle);
  assert.strictEqual(new Set(cles).size, cles.length);
});

test('une colonne ajoutée au schéma est créée sans toucher aux données', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
  env.ctx.Params_enregistrer('capacite.montant_max_mission', '40000');
  env.ctx.TABLES.PARAMETRES.colonnes.push('nouvelle_colonne');
  const r = env.ctx.installer();
  assert.strictEqual(r.colonnesAjoutees, 1);
  assert.strictEqual(env.ctx.Params_texte('capacite.montant_max_mission'), '40000');
});

test('recette lot 1 : l\'app lit puis écrit un paramètre dans le classeur', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
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
  env.ctx.installer();
  assert.deepStrictEqual(brut(env.ctx.Params_liste('zone.departements_paca')), ['04', '05', '06', '13', '83', '84']);
  env.ctx.apiParametreEnregistrer('zone.departements_paca', '04 ; 05;06;;13');
  env.ctx.Params_cache_ = null;
  assert.strictEqual(env.ctx.Params_texte('zone.departements_paca'), '04;05;06;13');
});

test('un paramètre inconnu est refusé (pas de création depuis l\'app)', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
  const r = env.ctx.apiParametreEnregistrer('faute.de.frappe', 'x');
  assert.strictEqual(r.ok, false);
  assert.match(r.erreur, /inconnu/);
});

test('apiEtat renvoie l\'état du classeur, sérialisable', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
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
  env.ctx.installer();
  const r = env.ctx.apiParametres();
  assert.strictEqual(r.ok, false);
  assert.match(r.erreur, /réservé/);
});

test('sauvegarde hebdomadaire : copie datée et rotation des copies', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
  env.ctx.Params_enregistrer('sauvegarde.nb_copies', '2');
  for (let i = 0; i < 4; i++) env.ctx.sauvegardeHebdo();
  const actives = env.fichiersDrive.filter((f) => !f.corbeille);
  assert.strictEqual(actives.length, 2);
  assert.match(actives[0].nom, /^Kompa Affaires — données — \d{4}-\d{2}-\d{2}$/);
});

test('Db : insertion, recherche et mise à jour avec horodatage', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
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
  env.ctx.installer();
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
  env.ctx.installer();
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
  env.ctx.installer();
  assert.ok(env.ctx.apiParametreEnregistrer('seuil.plafond_vise', '75000').ok);
  assert.ok(env.ctx.apiCompteurCA().ok);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'dist', 'Index.html'), 'utf8'), /<\?/);
});

// ——— Lot 2 : Affaires ———

const nouvelleAffaire = (env, extra = {}) => env.ctx.Affaires_creer(Object.assign({ acheteur: 'Commune de Test', objet: 'AMO faisabilité' }, extra));

test('affaire : numérotation KA-AAAA-NNN, statut En étude et historique daté', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
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
  env.ctx.installer();
  assert.throws(() => env.ctx.Affaires_creer({ objet: 'x' }), /acheteur/);
  assert.throws(() => env.ctx.Affaires_creer({ acheteur: 'x' }), /objet/);
});

test('statuts : passages interdits refusés', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
  const a = nouvelleAffaire(env);
  assert.throws(() => env.ctx.Affaires_changerStatut(a.id, 'Déposée', { montant_ht: 1, jours_reponse: 1 }), /Passage impossible/);
  assert.throws(() => env.ctx.Affaires_changerStatut(a.id, 'Gagnée', {}), /Passage impossible/);
});

test('règles § 4.1 : No-go exige un motif de la liste', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
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
  env.ctx.installer();
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
  env.ctx.installer();
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
  env.ctx.installer();
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
  env.ctx.installer();
  const a = nouvelleAffaire(env);
  env.ctx.Affaires_ajouterNote(a.id, 'Premier appel', '2026-09-04');
  env.ctx.Affaires_ajouterNote(a.id, 'Visite faite', '2026-09-10');
  assert.match(env.ctx.Affaires_get_(a.id).notes, /^\[04\/09\/2026 00:00\] Premier appel\n\[10\/09\/2026 00:00\] Visite faite$/);
});

test('critères : enregistrement et remplacement', () => {
  const env = creerEnvironnement();
  env.ctx.installer();
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
  env.ctx.installer();
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
  env.ctx.installer();
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
