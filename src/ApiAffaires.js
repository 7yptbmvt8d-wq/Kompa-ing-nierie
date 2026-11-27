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
    pieces: f.pieces.map(function (l) { return versClient_(TABLES.PIECES_OFFRE, l); }),
    piecesResume: PiecesOffre_resume_(f.pieces),
    livrables: f.livrables.map(function (l) { return versClient_(TABLES.LIVRABLES, l); }),
    livrablesResume: Livrables_resume_(f.livrables),
    totaux: f.totaux,
    transitions: f.transitions,
    planning: Planning_affaire(id),
    accordCadre: AC_synthese(id),
    bpu: AC_bpu(id),
    bpuFichier: AC_est_(f.affaire) && ['En étude', 'Go'].indexOf(String(f.affaire.statut)) >= 0 ? AC_fichierSkill_(f.affaire) : null
  };
}

/** Fichier Excel du BPU lu par le navigateur : feuilles = [{ nom, lignes }]. */
function apiBpuImporterTableau(id, feuilles, ajouter, nomFichier) {
  return repondre_(function () {
    var r = AC_bpuImporterTableau(id, feuilles, ajouter === true, nomFichier);
    var f = ficheClient_(id); f.ajoutees = r.ajoutees; f.sansPrix = r.sansPrix; return f;
  });
}

function apiBpuSupprimer(id) {
  return repondre_(function () { var n = AC_bpuSupprimer(id); var f = ficheClient_(id); f.supprimees = n; return f; });
}

function apiBpuImporterSkill(id) {
  return repondre_(function () { var r = AC_bpuImporterSkill(id); var f = ficheClient_(id); f.importe = { lignes: r.lignes, fichier: r.fichier.nom }; return f; });
}

// ——— Accord-cadre : BPU et bons de commande ———

function apiBpuEnregistrer(id, lignes) {
  return repondre_(function () { AC_bpuEnregistrer(id, lignes); return ficheClient_(id); });
}

function apiBpuColler(id, texte, ajouter) {
  return repondre_(function () { var r = AC_bpuColler(id, texte, ajouter === true || ajouter === 'oui'); var f = ficheClient_(id); f.ajoutees = r.ajoutees; f.sansPrix = r.sansPrix; return f; });
}

function apiBonAjouter(id, champs) {
  return repondre_(function () { AC_bonAjouter(id, champs); Relances_synchroniser(); return ficheClient_(id); });
}

function apiBonMaj(id, idBon, champs) {
  return repondre_(function () { AC_bonMaj(id, idBon, champs); Relances_synchroniser(); return ficheClient_(id); });
}

function apiBonSupprimer(id, idBon) {
  return repondre_(function () { AC_bonSupprimer(id, idBon); Relances_synchroniser(); return ficheClient_(id); });
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
    if (statut === STATUTS.DEPOSEE) PiecesOffre_marquerDeposees_(id);
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

/** Tranche optionnelle : affermie, non affermie ou remise optionnelle. */
function apiTrancheAffermir(id, tranche, etat, date) {
  return repondre_(function () { Planning_affermir(id, tranche, etat, date); return ficheClient_(id); });
}

/** Facture d'une tranche, depuis la barre de planning. */
function apiPlanningFacturer(id, tranche, facture) {
  return repondre_(function () { Planning_facturer(id, tranche, facture); Relances_synchroniser(); return ficheClient_(id); });
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

/** Fichier du dossier Drive de l'affaire mis à la corbeille Drive (30 jours) → liste des pièces à jour. */
function apiPieceSupprimer(id, idFichier) {
  return repondre_(function () {
    var r = Drive_supprimer(id, idFichier);
    var p = Drive_pieces(id);
    p.supprime = r;
    return p;
  });
}

// ——— Pièces de l'offre ———

function apiPieceOffreAjouter(id, champs) {
  return repondre_(function () { PiecesOffre_ajouter(id, champs); return ficheClient_(id); });
}

function apiPiecesOffreListeType(id) {
  return repondre_(function () { PiecesOffre_ajouterListeType(id); return ficheClient_(id); });
}

/** Liste collée (une pièce par ligne) : renvoie la fiche et le nombre de pièces ajoutées / déjà présentes. */
function apiPiecesOffreColler(id, texte) {
  return repondre_(function () { var r = PiecesOffre_collerListe(id, texte); return Object.assign(ficheClient_(id), { collage: r }); });
}

function apiPieceOffreMaj(id, idPiece, champs) {
  return repondre_(function () { PiecesOffre_maj(id, idPiece, champs); return ficheClient_(id); });
}

function apiPieceOffreSupprimer(id, idPiece) {
  return repondre_(function () { PiecesOffre_supprimer(id, idPiece); return ficheClient_(id); });
}

// ——— Livrables de la mission ———

function apiLivrableAjouter(id, champs) {
  return repondre_(function () { Livrables_ajouter(id, champs); return ficheClient_(id); });
}

function apiLivrableMaj(id, idLivrable, champs) {
  return repondre_(function () { Livrables_maj(id, idLivrable, champs); return ficheClient_(id); });
}

function apiLivrableSupprimer(id, idLivrable) {
  return repondre_(function () { Livrables_supprimer(id, idLivrable); return ficheClient_(id); });
}
