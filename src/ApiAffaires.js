/**
 * API du lot 2 (Affaires), appelée par l'interface via google.script.run.
 */

/** Schéma et listes utiles à l'interface (statuts, transitions, champs, listes de valeurs). */
function Affaires_meta_() {
  var listes = {};
  ['liste.types_acheteur', 'liste.procedures', 'liste.motifs_nogo', 'liste.pieces_types']
    .forEach(function (k) { listes[k] = Params_liste(k); });
  var champ = function (c) {
    var aide = AIDES_CHAMPS[c[0]] || [];
    return { nom: c[0], libelle: c[1], type: c[2], obligatoire: !!c[3], defaut: c[4] || '', aide: aide[0] || '', exemple: aide[1] || '' };
  };
  var passage = {};
  Object.keys(CHAMPS_PASSAGE).forEach(function (s) { passage[s] = CHAMPS_PASSAGE[s].map(champ); });
  return {
    statuts: ORDRE_STATUTS,
    actifs: STATUTS_ACTIFS,
    familles: FAMILLES_STATUT,
    transitions: TRANSITIONS,
    passage: passage,
    blocs: FICHE_BLOCS.map(function (b) { return { id: b.id, titre: b.titre, champs: b.champs.map(champ) }; }),
    creation: CHAMPS_CREATION,
    listes: listes
  };
}

function affaireClient_(a) {
  return versClient_(TABLES.AFFAIRES, a);
}

function ficheClient_(id) {
  var f = Affaires_fiche(id);
  return {
    affaire: affaireClient_(f.affaire),
    historique: f.historique.map(function (l) { return versClient_(TABLES.HISTORIQUE, l); }),
    criteres: f.criteres.map(function (l) { return versClient_(TABLES.CRITERES, l); }),
    factures: f.factures.map(function (l) { return versClient_(TABLES.FACTURES, l); }),
    relances: f.relances.map(function (l) { return versClient_(TABLES.RELANCES, l); }),
    totaux: f.totaux,
    transitions: f.transitions
  };
}

/** Liste des affaires (résumé) + méta. */
function apiAffaires() {
  return repondre_(function () {
    var resume = ['id', 'acheteur', 'departement', 'objet', 'statut', 'date_statut', 'date_limite_remise',
      'pre_score', 'score_final', 'montant_ht', 'montant_notifie', 'type_acheteur', 'procedure'];
    return {
      meta: Affaires_meta_(),
      affaires: Affaires_lister().map(function (a) {
        var c = affaireClient_(a);
        var r = {};
        resume.forEach(function (k) { r[k] = c[k] === undefined ? '' : c[k]; });
        return r;
      })
    };
  });
}

function apiAffaire(id) {
  return repondre_(function () {
    var f = ficheClient_(id);
    f.meta = Affaires_meta_();
    return f;
  });
}

function apiAffaireCreer(donnees) {
  return repondre_(function () { return affaireClient_(Affaires_creer(donnees)); });
}

function apiAffaireMaj(id, champs) {
  return repondre_(function () { Affaires_maj(id, champs); Relances_synchroniser(); return ficheClient_(id); });
}

function apiAffaireStatut(id, statut, champs, commentaire) {
  return repondre_(function () {
    Affaires_changerStatut(id, statut, champs, { commentaire: commentaire });
    Relances_synchroniser();
    return ficheClient_(id);
  });
}

function apiAffaireNote(id, texte) {
  return repondre_(function () { Affaires_ajouterNote(id, texte); return ficheClient_(id); });
}

function apiCriteres(id, lignes) {
  return repondre_(function () { Criteres_enregistrer(id, lignes); return ficheClient_(id); });
}

function apiFactureAjouter(id, facture) {
  return repondre_(function () { Factures_ajouter(id, facture); Relances_synchroniser(); return ficheClient_(id); });
}

function apiFactureMaj(idAffaire, idFacture, champs) {
  return repondre_(function () { Factures_maj(idFacture, champs); Relances_synchroniser(); return ficheClient_(idAffaire); });
}

/** Pièces du dossier Drive de l'affaire (lecture). */
function apiPieces(id) {
  return repondre_(function () { return Drive_pieces(id); });
}

/** Dépôt d'un fichier depuis la fiche : { nom, type, donnees (base64) } → liste des pièces à jour. */
function apiPieceDeposer(id, sousDossier, fichier) {
  return repondre_(function () {
    var r = Drive_deposer(id, sousDossier, fichier);
    var p = Drive_pieces(id);
    p.depose = r;
    return p;
  });
}
