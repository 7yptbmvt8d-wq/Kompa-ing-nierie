/**
 * Affaire d'exercice : Mouthe (§ 11 et recette du lot 2).
 *
 * Données du DCE réel (SIVOM des Hauts du Doubs) ; offre, dates et résultat FICTIFS.
 * À lancer une fois depuis l'éditeur : creerAffaireExerciceMouthe.
 * Sans effet si l'affaire d'exercice existe déjà.
 */

var REF_EXERCICE_MOUTHE = 'EXERCICE-MOUTHE';

function creerAffaireExerciceMouthe() {
  var existante = Affaires_lister().filter(function (a) { return a.reference_acheteur === REF_EXERCICE_MOUTHE; })[0];
  if (existante) {
    console.log('Affaire d\'exercice déjà présente : ' + existante.id);
    return existante.id;
  }

  // 1. Création (veille) — 03/09/2026
  var a = Affaires_creer({
    acheteur: 'SIVOM des Hauts du Doubs',
    type_acheteur: 'EPCI',
    departement: '25',
    objet: '[EXERCICE] AMO — construction d\'un accueil périscolaire avec restauration à Mouthe : ' +
      'étude de faisabilité sur deux sites, programme, recrutement de la maîtrise d\'œuvre et vérification des études jusqu\'à l\'APD',
    reference_acheteur: REF_EXERCICE_MOUTHE,
    procedure: 'MAPA',
    plateforme: '[plateforme — exercice]',
    date_limite_remise: '2026-10-02',
    date_limite_questions: '2026-09-22',
    validite_offre_jours: 90,
    pre_score: 78, // France 10 + mission cœur 30 + délai ≥ 15 j 15 + EPCI 15 + montant inconnu 8
    tranches: 'TF : étude de faisabilité (4 mois)\n' +
      'Hypothèse a (site de l\'école du Bois Joli) : TO1a programme (2 mois) ; TO2a recrutement MOE, CT, CSPS et vérification jusqu\'à l\'APD (6 mois)\n' +
      'Hypothèse b (site « Colombo ») : TO1b montage avec un bailleur social (4 mois) ; TO2b vérification jusqu\'à l\'APD (4 mois)'
  }, { date: '2026-09-03', commentaire: 'Affaire d\'exercice : DCE réel, offre et résultat fictifs' });
  var id = a.id;

  Affaires_ajouterNote(id, 'Département 25 : au moins 3 réunions en tranche ferme, 1 en TO1a, 6 en TO2a. Présentiel à chiffrer (déplacements).', '2026-09-04');

  // 2. Go — 08/09/2026
  Affaires_changerStatut(id, STATUTS.GO, { score_final: 62 },
    { date: '2026-09-08', commentaire: 'Mission cœur (faisabilité, programmation) ; déplacements à intégrer au prix' });

  Affaires_maj(id, {
    groupement: 'Seul',
    jours_par_tranche: 'TF 14 j ; TO1a 6 j ; TO2a 16 j (hypothèse a, chiffrée dans le total)\nTO1b 10 j ; TO2b 8 j',
    prix_jour: 550
  });

  // 3. Déposée — 01/10/2026 : TF + TO1a + TO2a = 36 j × 550 € = 19 800 € HT
  Affaires_changerStatut(id, STATUTS.DEPOSEE, {
    montant_ht: 19800, montant_pondere: '', jours_reponse: 3, date_depot: '2026-10-01'
  }, { date: '2026-10-01', commentaire: 'Offre déposée (hypothèse a : TF + TO1a + TO2a)' });

  // 4. Perdue — 06/11/2026 (résultat fictif)
  Affaires_changerStatut(id, STATUTS.PERDUE, {
    date_resultat: '2026-11-06',
    attributaire: '[attributaire — fictif]',
    prix_attributaire: 17600,
    rang: 2
  }, { date: '2026-11-06', commentaire: 'Lettre de rejet reçue (fictive)' });

  // Motifs reçus : la relance créée au passage en Perdue est faite
  Db_lire(TABLES.RELANCES)
    .filter(function (r) { return r.id_affaire === id && r.type === 'Motifs du rejet'; })
    .forEach(function (r) { Db_maj(TABLES.RELANCES, r.id, { statut: 'faite', date_faite: date_('2026-11-10') }); });

  Affaires_maj(id, {
    motifs_rejet: 'Valeur technique : note méthodologique jugée moins précise sur la TO2a (analyse des offres de maîtrise d\'œuvre, vérification des études). ' +
      'Prix : offre supérieure de 12,5 % à celle de l\'attributaire.',
    points_faibles: 'Planning de la TO2a peu détaillé ; aucune référence de vérification d\'APD sur un équipement scolaire ou périscolaire ; ' +
      'frais de déplacement vers le Doubs intégrés au prix journalier.',
    action_corrective: 'Ajouter à la note méthodologique un planning par phase et un exemple de grille de vérification APS / APD ; ' +
      'chiffrer les déplacements à part ou proposer des réunions en visioconférence.',
    piece_type: 'note méthodologique'
  });

  Criteres_enregistrer(id, [
    { critere: 'Valeur technique', ponderation: 60, note_kompa: 44, note_attributaire: 50 },
    { critere: 'Prix', ponderation: 40, note_kompa: 35.6, note_attributaire: 40 }
  ]);

  Affaires_ajouterNote(id, 'Exercice terminé : rang 2, 79,6 / 100 contre 90 / 100 pour l\'attributaire (fictif).', '2026-11-10');
  console.log('Affaire d\'exercice créée : ' + id);
  return id;
}

/**
 * Recette du lot 5 : trois affaires fictives [TEST] dont les indicateurs se recalculent
 * à la main (docs/recette-lot-5.md). À lancer depuis l'éditeur : creerAffairesTestIndicateurs ;
 * puis supprimerAffairesTest pour tout effacer (affaires, historique, critères, factures, relances).
 */
var MARQUE_TEST = '[TEST]';

function creerAffairesTestIndicateurs() {
  if (Affaires_lister().some(function (a) { return String(a.acheteur).indexOf(MARQUE_TEST) === 0; })) {
    console.log('Affaires [TEST] déjà présentes.');
    return Affaires_lister().filter(function (a) { return String(a.acheteur).indexOf(MARQUE_TEST) === 0; }).map(function (a) { return a.id; });
  }
  // T1 — gagnée : Go, déposée 20 000 € (4 j), notifiée 20 000 €, rang 1 ; facture 10 000 € encaissée
  var t1 = Affaires_creer({ acheteur: MARQUE_TEST + ' Commune A', type_acheteur: 'Commune', departement: '83', objet: MARQUE_TEST + ' Faisabilité école', procedure: 'MAPA' }, { date: '2026-05-20' }).id;
  Affaires_changerStatut(t1, STATUTS.GO, {}, { date: '2026-06-02' });
  Affaires_changerStatut(t1, STATUTS.DEPOSEE, { montant_ht: 20000, jours_reponse: 4, date_depot: '2026-06-20' }, { date: '2026-06-20' });
  Affaires_changerStatut(t1, STATUTS.GAGNEE, { date_notification: '2026-07-15', montant_notifie: 20000, rang: 1 }, { date: '2026-07-15' });
  Affaires_maj(t1, { rang: 1 });
  Factures_ajouter(t1, { numero: 'TEST-01', date: '2026-08-31', montant: 10000, date_encaissement: '2026-09-30', montant_encaisse: 10000 });

  // T2 — perdue : Go, déposée 15 000 € (3 j), attributaire 12 000 €, rang 3 ; technique 40 / 48 ; pièce : prix
  var t2 = Affaires_creer({ acheteur: MARQUE_TEST + ' EPCI B', type_acheteur: 'EPCI', departement: '13', objet: MARQUE_TEST + ' Programmation gymnase', procedure: 'MAPA' }, { date: '2026-06-25' }).id;
  Affaires_changerStatut(t2, STATUTS.GO, {}, { date: '2026-07-01' });
  Affaires_changerStatut(t2, STATUTS.DEPOSEE, { montant_ht: 15000, jours_reponse: 3, date_depot: '2026-07-20' }, { date: '2026-07-20' });
  Affaires_changerStatut(t2, STATUTS.PERDUE, { date_resultat: '2026-09-10', attributaire: MARQUE_TEST + ' Concurrent', prix_attributaire: 12000, rang: 3 }, { date: '2026-09-10' });
  Affaires_maj(t2, { motifs_rejet: 'Prix', piece_type: 'prix' });
  Criteres_enregistrer(t2, [
    { critere: 'Valeur technique', ponderation: 60, note_kompa: 40, note_attributaire: 48 },
    { critere: 'Prix', ponderation: 40, note_kompa: 32, note_attributaire: 40 }
  ]);

  // T3 — No-go : motif « charge »
  var t3 = Affaires_creer({ acheteur: MARQUE_TEST + ' Commune C', type_acheteur: 'Commune', departement: '04', objet: MARQUE_TEST + ' Étude préalable', procedure: 'MAPA' }, { date: '2026-08-01' }).id;
  Affaires_changerStatut(t3, STATUTS.NOGO, { motif_decision: 'charge' }, { date: '2026-08-05' });

  console.log('Affaires [TEST] créées : ' + [t1, t2, t3].join(', '));
  return [t1, t2, t3];
}

function supprimerAffairesTest() {
  var ids = Affaires_lister().filter(function (a) { return String(a.acheteur).indexOf(MARQUE_TEST) === 0; }).map(function (a) { return String(a.id); });
  if (!ids.length) { console.log('Aucune affaire [TEST].'); return 0; }
  var lie = function (l) { return ids.indexOf(String(l.id_affaire)) >= 0; };
  [TABLES.HISTORIQUE, TABLES.CRITERES, TABLES.FACTURES, TABLES.RELANCES].forEach(function (t) { Db_supprimerSi(t, lie); });
  Db_supprimerSi(TABLES.AFFAIRES, function (a) { return ids.indexOf(String(a.id)) >= 0; });
  console.log('Affaires [TEST] supprimées : ' + ids.join(', '));
  return ids.length;
}
