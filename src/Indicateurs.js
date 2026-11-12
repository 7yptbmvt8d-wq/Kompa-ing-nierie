/**
 * Indicateurs (§ 7). Lot 4 : résumé pour l'e-mail du matin. Le lot 5 complète le tableau de bord.
 */

function Indicateurs_resume(quand) {
  var auj = aujourdhui_(quand);
  var il_y_a_un_an = ajouterJours_(auj, -365);
  var affaires = Affaires_lister();
  var enCours = {};
  STATUTS_ACTIFS.forEach(function (s) {
    var n = affaires.filter(function (a) { return a.statut === s; }).length;
    if (n) enCours[s] = n;
  });
  var resultats = affaires.filter(function (a) {
    var d = date_(a.date_resultat);
    return d && d >= il_y_a_un_an && d <= ajouterJours_(auj, 1);
  });
  var gagnees = resultats.filter(function (a) { return a.statut_final === 'Gagnée'; }).length;
  var perdues = resultats.filter(function (a) { return a.statut_final === 'Perdue'; }).length;
  return {
    enCours: enCours,
    attribution: { gagnees: gagnees, perdues: perdues, taux: gagnees + perdues ? gagnees / (gagnees + perdues) : 0 },
    ca: Compteur_ca(Number(Utilities.formatDate(auj, APP.FUSEAU, 'yyyy')))
  };
}
