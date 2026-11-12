/**
 * Indicateurs (§ 7) et enseignements.
 *
 * Définitions retenues (recalculables à la main, voir docs/recette-lot-5.md) :
 * - Fenêtre « 12 mois glissants » : du jour J-365 au jour J inclus.
 * - Taux de Go : décisions Go / (Go + No-go), sur la date de décision.
 * - Taux d'attribution (nombre) : gagnées / (gagnées + perdues), sur la date du résultat.
 * - Taux d'attribution (montant) : Σ montant HT des offres gagnées / Σ montant HT des offres
 *   gagnées et perdues (même fenêtre). Les affaires « sans suite » sont exclues.
 * - Rang moyen : moyenne des rangs renseignés (résultats de la fenêtre).
 * - Écart de prix (affaire perdue) : (votre prix − prix attributaire) / prix attributaire.
 * - Écart de note technique (affaire perdue) : Σ notes Kompa − Σ notes attributaire sur les
 *   critères dont le nom contient « techni » (ex. « Valeur technique »).
 * - Coût de la réponse (année civile) : Σ jours passés à répondre (offres déposées dans l'année)
 *   / Σ montants notifiés (marchés notifiés dans l'année), affiché en jours pour 10 000 €.
 * - CA signé / facturé / encaissé : compteur de CA de l'année civile.
 * - Motifs de No-go : motif de la décision ; motifs de rejet : pièce-type à améliorer.
 * - L'affaire d'exercice Mouthe est exclue de tous les indicateurs (décision du 12/11/2026).
 */

function Indicateurs_tableau(quand) {
  var auj = aujourdhui_(quand);
  var debut = ajouterJours_(auj, -365);
  var dans = function (v) { var d = date_(v); return d && aujourdhui_(d) >= debut && aujourdhui_(d) <= auj; };
  var annee = auj.getFullYear();
  var deLAnnee = function (v) { var d = date_(v); return d && d.getFullYear() === annee; };
  var affaires = Indicateurs_affaires_();
  var criteres = Db_lire(TABLES.CRITERES);

  // Affaires par statut (en cours) et clôturées sur 12 mois
  var parStatut = ORDRE_STATUTS.map(function (s) {
    var liste = affaires.filter(function (a) { return a.statut === s; });
    var actif = STATUTS_ACTIFS.indexOf(s) >= 0;
    return { statut: s, actif: actif, nombre: actif ? liste.length : liste.filter(function (a) { return dans(a.date_statut); }).length };
  });

  // Taux de Go
  var go = affaires.filter(function (a) { return a.decision === 'Go' && dans(a.date_decision); }).length;
  var nogo = affaires.filter(function (a) { return a.decision === 'No-go' && dans(a.date_decision); });

  // Résultats de la fenêtre
  var resultats = affaires.filter(function (a) { return dans(a.date_resultat); });
  var gagnees = resultats.filter(function (a) { return a.statut_final === 'Gagnée'; });
  var perdues = resultats.filter(function (a) { return a.statut_final === 'Perdue'; });
  var somme = function (l, k) { return l.reduce(function (s, a) { return s + montant_(a[k]); }, 0); };
  var montantGagne = somme(gagnees, 'montant_ht');
  var montantJuge = montantGagne + somme(perdues, 'montant_ht');
  var rangs = resultats.map(function (a) { return montant_(a.rang); }).filter(function (n) { return n > 0; });

  // Écarts sur les affaires perdues
  var ecarts = perdues.map(function (a) { return Indicateurs_ecarts_(a, criteres); });
  var moyenne = function (l) { return l.length ? l.reduce(function (s, x) { return s + x; }, 0) / l.length : null; };
  var ecartsPrix = ecarts.map(function (e) { return e.ecartPrix; }).filter(function (x) { return x !== null; });
  var ecartsNote = ecarts.map(function (e) { return e.ecartNote; }).filter(function (x) { return x !== null; });

  // Coût de la réponse (année civile)
  var joursAnnee = somme(affaires.filter(function (a) { return deLAnnee(a.date_depot); }), 'jours_reponse');
  var notifieAnnee = somme(affaires.filter(function (a) { return deLAnnee(a.date_notification); }), 'montant_notifie');

  // Répartition des motifs
  var compter = function (liste, cle, defaut) {
    var c = {};
    liste.forEach(function (a) { var k = String(a[cle] || '').trim() || defaut; c[k] = (c[k] || 0) + 1; });
    return Object.keys(c).map(function (k) { return { motif: k, nombre: c[k] }; })
      .sort(function (x, y) { return y.nombre - x.nombre || x.motif.localeCompare(y.motif); });
  };

  return {
    aujourdhui: jourIso_(auj),
    fenetre: { debut: jourIso_(debut), fin: jourIso_(auj) },
    annee: annee,
    parStatut: parStatut,
    enCours: parStatut.filter(function (s) { return s.actif; }).reduce(function (t, s) { return t + s.nombre; }, 0),
    go: { go: go, nogo: nogo.length, taux: go + nogo.length ? go / (go + nogo.length) : null },
    attribution: {
      gagnees: gagnees.length, perdues: perdues.length,
      taux: gagnees.length + perdues.length ? gagnees.length / (gagnees.length + perdues.length) : null,
      montantGagne: arrondi_(montantGagne), montantJuge: arrondi_(montantJuge),
      tauxMontant: montantJuge ? montantGagne / montantJuge : null
    },
    rangMoyen: rangs.length ? moyenne(rangs) : null,
    rangsConnus: rangs.length,
    ecartPrixMoyen: moyenne(ecartsPrix),
    ecartNoteMoyen: moyenne(ecartsNote),
    perduesAnalysees: ecarts.length,
    cout: {
      jours: joursAnnee, montantNotifie: arrondi_(notifieAnnee),
      joursPour10k: notifieAnnee ? joursAnnee / notifieAnnee * 10000 : null
    },
    ca: Compteur_ca(annee),
    motifsNogo: compter(nogo, 'motif_decision', 'non renseigné'),
    motifsRejet: compter(perdues, 'piece_type', 'non renseigné')
  };
}

/** Affaires prises en compte : toutes sauf l'exercice Mouthe (consultable, hors indicateurs). */
function Indicateurs_affaires_() {
  return Affaires_lister().filter(function (a) { return !Indicateurs_estExercice_(a); });
}

function Indicateurs_estExercice_(a) {
  return a.reference_acheteur === REF_EXERCICE_MOUTHE || /^\[EXERCICE\]/.test(String(a.objet || ''));
}

/** Écarts de prix et de note technique d'une affaire perdue. */
function Indicateurs_ecarts_(a, criteres) {
  var prix = montant_(a.montant_ht), attrib = montant_(a.prix_attributaire);
  var tech = criteres.filter(function (c) {
    return String(c.id_affaire) === String(a.id) && /techni/.test(Veille_norm_(c.critere));
  });
  var noteK = tech.reduce(function (s, c) { return s + montant_(c.note_kompa); }, 0);
  var noteA = tech.reduce(function (s, c) { return s + montant_(c.note_attributaire); }, 0);
  var aNotes = tech.some(function (c) { return c.note_kompa !== '' && c.note_attributaire !== ''; });
  return {
    ecartPrix: prix && attrib ? (prix - attrib) / attrib : null,
    noteKompa: aNotes ? arrondi_(noteK) : null,
    noteAttributaire: aNotes ? arrondi_(noteA) : null,
    ecartNote: aNotes ? arrondi_(noteK - noteA) : null
  };
}

/** Toutes les affaires perdues, avec écarts et enseignements (écran Enseignements). */
function Indicateurs_enseignements() {
  var criteres = Db_lire(TABLES.CRITERES);
  return Affaires_lister()
    .filter(function (a) { return a.statut_final === 'Perdue'; })
    .sort(function (x, y) { return (date_(y.date_resultat) || 0) - (date_(x.date_resultat) || 0); })
    .map(function (a) {
      var e = Indicateurs_ecarts_(a, criteres);
      return {
        id: a.id, acheteur: a.acheteur, objet: a.objet, exercice: Indicateurs_estExercice_(a), date_resultat: date_(a.date_resultat) ? jourIso_(date_(a.date_resultat)) : '',
        montant_ht: montant_(a.montant_ht) || null, prix_attributaire: montant_(a.prix_attributaire) || null,
        attributaire: a.attributaire || '', rang: montant_(a.rang) || null,
        ecartPrix: e.ecartPrix, noteKompa: e.noteKompa, noteAttributaire: e.noteAttributaire, ecartNote: e.ecartNote,
        motifs_rejet: a.motifs_rejet || '', points_faibles: a.points_faibles || '',
        action_corrective: a.action_corrective || '', piece_type: a.piece_type || ''
      };
    });
}

/** Résumé pour l'e-mail du matin. */
function Indicateurs_resume(quand) {
  var t = Indicateurs_tableau(quand);
  var enCours = {};
  t.parStatut.forEach(function (s) { if (s.actif && s.nombre) enCours[s.statut] = s.nombre; });
  return {
    enCours: enCours,
    attribution: { gagnees: t.attribution.gagnees, perdues: t.attribution.perdues, taux: t.attribution.taux || 0 },
    ca: t.ca
  };
}
