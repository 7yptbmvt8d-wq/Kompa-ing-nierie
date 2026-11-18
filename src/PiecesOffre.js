/**
 * Pièces de l'offre (fiche › Appel d'offres › Offre) : liste des pièces exigées par le RC et leur état.
 * Sert au contrôle avant dépôt et à la synthèse de la fiche. Organisation validée le 18/11/2026.
 */

var ETATS_PIECE = ['à faire', 'en cours', 'prête', 'déposée'];
var CATEGORIES_PIECE = ['Candidature', 'Offre'];

function PiecesOffre_lister(idAffaire) {
  return Db_lire(TABLES.PIECES_OFFRE)
    .filter(function (p) { return String(p.id_affaire) === String(idAffaire); })
    .sort(function (x, y) {
      var c = CATEGORIES_PIECE.indexOf(x.categorie) - CATEGORIES_PIECE.indexOf(y.categorie);
      return c || (Number(x.ordre) || 0) - (Number(y.ordre) || 0);
    });
}

function PiecesOffre_valider_(champs, creation) {
  var out = {};
  if ('categorie' in champs || creation) {
    var c = String(champs.categorie || '').trim();
    if (CATEGORIES_PIECE.indexOf(c) < 0) throw new Error('Catégorie attendue : ' + CATEGORIES_PIECE.join(' ou ') + '.');
    out.categorie = c;
  }
  if ('libelle' in champs || creation) {
    var l = String(champs.libelle || '').trim();
    if (!l) throw new Error('Intitulé de la pièce obligatoire.');
    out.libelle = l.slice(0, 200);
  }
  if ('etat' in champs) {
    if (ETATS_PIECE.indexOf(champs.etat) < 0) throw new Error('État attendu : ' + ETATS_PIECE.join(', ') + '.');
    out.etat = champs.etat;
  }
  if ('commentaire' in champs) out.commentaire = String(champs.commentaire || '').trim();
  return out;
}

function PiecesOffre_ajouter(idAffaire, champs) {
  Affaires_get_(idAffaire);
  var p = PiecesOffre_valider_(champs, true);
  var existantes = PiecesOffre_lister(idAffaire);
  p.id_affaire = idAffaire;
  p.etat = p.etat || 'à faire';
  p.ordre = existantes.reduce(function (m, x) { return Math.max(m, Number(x.ordre) || 0); }, 0) + 10;
  return Db_inserer(TABLES.PIECES_OFFRE, p);
}

/** Ajoute la liste type (paramètre liste.pieces_offre), sans doublon d'intitulé. Renvoie le nombre ajouté. */
function PiecesOffre_ajouterListeType(idAffaire) {
  Affaires_get_(idAffaire);
  var deja = {};
  PiecesOffre_lister(idAffaire).forEach(function (p) { deja[String(p.libelle).toLowerCase()] = true; });
  var ordre = PiecesOffre_lister(idAffaire).reduce(function (m, x) { return Math.max(m, Number(x.ordre) || 0); }, 0);
  var lignes = Params_liste('liste.pieces_offre').map(function (item) {
    var i = item.indexOf(':');
    var cat = i > 0 ? item.slice(0, i).trim() : 'Offre';
    return { categorie: CATEGORIES_PIECE.indexOf(cat) >= 0 ? cat : 'Offre', libelle: (i > 0 ? item.slice(i + 1) : item).trim() };
  }).filter(function (l) { return l.libelle && !deja[l.libelle.toLowerCase()]; }).map(function (l) {
    ordre += 10;
    return { id_affaire: idAffaire, categorie: l.categorie, libelle: l.libelle, etat: 'à faire', ordre: ordre };
  });
  Db_insererPlusieurs(TABLES.PIECES_OFFRE, lignes);
  return lignes.length;
}

function PiecesOffre_maj(idAffaire, idPiece, champs) {
  var p = Db_trouver(TABLES.PIECES_OFFRE, idPiece);
  if (!p || String(p.id_affaire) !== String(idAffaire)) throw new Error('Pièce introuvable.');
  return Db_maj(TABLES.PIECES_OFFRE, idPiece, PiecesOffre_valider_(champs, false));
}

function PiecesOffre_supprimer(idAffaire, idPiece) {
  return Db_supprimerSi(TABLES.PIECES_OFFRE, function (p) { return String(p.id) === String(idPiece) && String(p.id_affaire) === String(idAffaire); });
}

/** Au passage en Déposée : les pièces prêtes ou en cours passent « déposée ». */
function PiecesOffre_marquerDeposees_(idAffaire) {
  var n = 0;
  PiecesOffre_lister(idAffaire).forEach(function (p) {
    if (p.etat !== 'déposée' && p.etat !== 'à faire') { Db_maj(TABLES.PIECES_OFFRE, p.id, { etat: 'déposée' }); n++; }
  });
  return n;
}

/** Résumé pour la synthèse et le contrôle avant dépôt. */
function PiecesOffre_resume_(pieces) {
  var n = function (e) { return pieces.filter(function (p) { return p.etat === e; }).length; };
  return { total: pieces.length, pretes: n('prête') + n('déposée'), deposees: n('déposée'), aFaire: n('à faire'), enCours: n('en cours') };
}
