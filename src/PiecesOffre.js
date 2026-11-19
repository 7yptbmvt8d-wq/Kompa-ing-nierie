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
  var items = Params_liste('liste.pieces_offre').map(function (item) {
    var i = item.indexOf(':');
    var cat = i > 0 ? item.slice(0, i).trim() : 'Offre';
    return { categorie: CATEGORIES_PIECE.indexOf(cat) >= 0 ? cat : 'Offre', libelle: (i > 0 ? item.slice(i + 1) : item).trim() };
  });
  return PiecesOffre_insererItems_(idAffaire, items).ajoutees;
}

/**
 * Liste collée (rubrique « Pièces à remettre » de l'analyse du DCE, ou du RC) : une pièce par ligne.
 * Catégorie : ligne « Candidature » ou « Offre » seule (titre qui vaut pour les lignes suivantes),
 * ou préfixe « Candidature : DC1 ». Les autres titres (ligne finie par « : », « Pièces à remettre ») sont ignorés. Par défaut : Offre. Puces, cases et numéros en début de ligne sont ignorés.
 * Renvoie { ajoutees, doublons }.
 */
function PiecesOffre_collerListe(idAffaire, texte) {
  var items = PiecesOffre_analyserListe_(texte);
  if (!items.length) throw new Error('Aucune pièce reconnue : collez une pièce par ligne.');
  return PiecesOffre_insererItems_(idAffaire, items);
}

function PiecesOffre_analyserListe_(texte) {
  var cat = 'Offre', items = [];
  var categorie = function (s) {
    var c = String(s || '').trim().toLowerCase();
    return c === 'candidature' ? 'Candidature' : c === 'offre' ? 'Offre' : '';
  };
  String(texte || '').split(/\r?\n/).forEach(function (ligne) {
    var l = ligne.replace(/^\s*(?:[-–—•*·▪◦☐☑✓✔□■]|\[\s?[xX ]?\s?\]|\(?\d{1,2}[.)]|[a-z][.)])\s+/, '').trim();
    if (!l) return;
    var titre = categorie(l.replace(/\s*:\s*$/, ''));
    if (titre) { cat = titre; return; }
    // Autres titres : ligne terminée par « : » (« Pièces de la candidature : ») ou « Pièces à remettre »
    if (/:\s*$/.test(l) || /^pi[eè]ces?\s+(?:à|a)\s+(?:remettre|fournir|produire)\b/i.test(l)) {
      if (/candidature/i.test(l)) cat = 'Candidature';
      else if (/offre/i.test(l)) cat = 'Offre';
      return;
    }
    var m = l.match(/^(candidature|offre)\s*[:–—-]\s*(.+)$/i);
    if (m) items.push({ categorie: categorie(m[1]), libelle: m[2].trim() });
    else items.push({ categorie: cat, libelle: l });
  });
  return items;
}

/** Ajoute des pièces { categorie, libelle } à la suite, sans doublon d'intitulé (casse ignorée). */
function PiecesOffre_insererItems_(idAffaire, items) {
  Affaires_get_(idAffaire);
  var existantes = PiecesOffre_lister(idAffaire), deja = {};
  existantes.forEach(function (p) { deja[String(p.libelle).toLowerCase()] = true; });
  var ordre = existantes.reduce(function (m, x) { return Math.max(m, Number(x.ordre) || 0); }, 0);
  var doublons = 0, lignes = [];
  items.forEach(function (it) {
    var lib = String(it.libelle || '').trim().slice(0, 200);
    if (!lib) return;
    if (deja[lib.toLowerCase()]) { doublons++; return; }
    deja[lib.toLowerCase()] = true;
    ordre += 10;
    lignes.push({ id_affaire: idAffaire, categorie: CATEGORIES_PIECE.indexOf(it.categorie) >= 0 ? it.categorie : 'Offre', libelle: lib, etat: 'à faire', ordre: ordre });
  });
  if (lignes.length) Db_insererPlusieurs(TABLES.PIECES_OFFRE, lignes);
  return { ajoutees: lignes.length, doublons: doublons };
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
