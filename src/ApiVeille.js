/**
 * API du lot 3 (Veille), appelée par l'interface via google.script.run.
 */

/** Avis (les plus récents d'abord) + derniers passages du moteur. */
function apiVeille() {
  return repondre_(function () {
    var avis = Db_lire(TABLES.AVIS).map(function (a) { return versClient_(TABLES.AVIS, a); })
      .sort(function (x, y) {
        return String(y.date_parution).localeCompare(String(x.date_parution)) || (Number(y.pre_score) || 0) - (Number(x.pre_score) || 0);
      });
    var journal = Db_lire(TABLES.JOURNAL_MOTEUR).map(function (j) { return versClient_(TABLES.JOURNAL_MOTEUR, j); })
      .sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); }).slice(0, 6);
    return {
      avis: avis,
      journal: journal,
      paca: Params_texte('zone.libelle_paca', 'PACA'),
      seuils: { etudier: Params_nombre('score.seuil_etudier', 60), possible: Params_nombre('score.seuil_possible', 40) },
      heure: Params_nombre('veille.heure_collecte', 6)
    };
  });
}

/** Lance la collecte immédiatement (bouton « Collecter maintenant »). */
function apiCollecter() {
  return repondre_(function () {
    var bilan = collecteQuotidienne();
    if (!bilan) throw new Error('Une collecte est déjà en cours, réessayez dans une minute.');
    return bilan;
  });
}

function apiAvisEtudier(idAvis) {
  return repondre_(function () { return versClient_(TABLES.AFFAIRES, Avis_etudier(idAvis)); });
}

function apiAvisStatut(idAvis, statut) {
  return repondre_(function () { return versClient_(TABLES.AVIS, Avis_changerStatut(idAvis, statut)); });
}
