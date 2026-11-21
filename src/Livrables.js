/**
 * Livrables de la mission (fiche › Mission › Planning) : une ligne par livrable du CCTP.
 * Les échéances des livrables non remis alimentent l'Échéancier et l'e-mail du matin.
 * Organisation validée le 18/11/2026.
 */

var ETATS_LIVRABLE = ['à faire', 'en cours', 'remis', 'validé'];

function Livrables_lister(idAffaire) {
  return Db_lire(TABLES.LIVRABLES)
    .filter(function (l) { return String(l.id_affaire) === String(idAffaire); })
    .sort(function (x, y) {
      var dx = date_(x.date_echeance), dy = date_(y.date_echeance);
      if (dx && dy && dx - dy) return dx - dy;
      if (dx && !dy) return -1;
      if (!dx && dy) return 1;
      return (Number(x.ordre) || 0) - (Number(y.ordre) || 0);
    });
}

function Livrables_valider_(champs, creation) {
  var out = {};
  if ('libelle' in champs || creation) {
    var l = String(champs.libelle || '').trim();
    if (!l) throw new Error('Intitulé du livrable obligatoire.');
    out.libelle = l.slice(0, 200);
  }
  if ('tranche' in champs) out.tranche = String(champs.tranche || '').trim().toUpperCase().slice(0, 12);
  if ('date_echeance' in champs) {
    var v = String(champs.date_echeance || '').trim();
    out.date_echeance = v ? (date_(v) || (function () { throw new Error('Échéance : date attendue.'); })()) : '';
  }
  if ('etat' in champs) {
    if (ETATS_LIVRABLE.indexOf(champs.etat) < 0) throw new Error('État attendu : ' + ETATS_LIVRABLE.join(', ') + '.');
    out.etat = champs.etat;
  }
  if ('indice' in champs) out.indice = String(champs.indice || '').trim().toUpperCase().slice(0, 4);
  if ('lien' in champs) {
    var u = String(champs.lien || '').trim();
    if (u && !/^https?:\/\//.test(u)) throw new Error('Lien : adresse commençant par https:// attendue (fichier Drive).');
    out.lien = u;
  }
  if ('commentaire' in champs) out.commentaire = String(champs.commentaire || '').trim();
  return out;
}

function Livrables_ajouter(idAffaire, champs) {
  Affaires_get_(idAffaire);
  var l = Livrables_valider_(champs, true);
  l.id_affaire = idAffaire;
  l.etat = l.etat || 'à faire';
  l.ordre = Livrables_lister(idAffaire).reduce(function (m, x) { return Math.max(m, Number(x.ordre) || 0); }, 0) + 10;
  return Db_inserer(TABLES.LIVRABLES, l);
}

function Livrables_maj(idAffaire, idLivrable, champs) {
  var l = Db_trouver(TABLES.LIVRABLES, idLivrable);
  if (!l || String(l.id_affaire) !== String(idAffaire)) throw new Error('Livrable introuvable.');
  return Db_maj(TABLES.LIVRABLES, idLivrable, Livrables_valider_(champs, false));
}

function Livrables_supprimer(idAffaire, idLivrable) {
  return Db_supprimerSi(TABLES.LIVRABLES, function (l) { return String(l.id) === String(idLivrable) && String(l.id_affaire) === String(idAffaire); });
}

/** Résumé pour la synthèse : total, remis, validés, prochain livrable à remettre. */
function Livrables_resume_(livrables) {
  var aRemettre = livrables.filter(function (l) { return l.etat === 'à faire' || l.etat === 'en cours'; });
  var prochain = aRemettre.filter(function (l) { return date_(l.date_echeance); })[0] || aRemettre[0] || null;
  return {
    total: livrables.length,
    valides: livrables.filter(function (l) { return l.etat === 'validé'; }).length,
    remis: livrables.filter(function (l) { return l.etat === 'remis' || l.etat === 'validé'; }).length,
    prochain: prochain ? { libelle: String(prochain.libelle), tranche: String(prochain.tranche || ''), date: date_(prochain.date_echeance) ? jourIso_(date_(prochain.date_echeance)) : '' } : null
  };
}
