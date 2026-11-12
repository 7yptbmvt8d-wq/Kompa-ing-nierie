/**
 * API du lot 5 (tableau de bord, enseignements).
 */

function apiTableau() {
  return repondre_(function () { return Indicateurs_tableau(); });
}

function apiEnseignements() {
  return repondre_(function () {
    var t = Indicateurs_tableau();
    return {
      lignes: Indicateurs_enseignements(),
      moyennes: { ecartPrix: t.ecartPrixMoyen, ecartNote: t.ecartNoteMoyen, rang: t.rangMoyen },
      motifsRejet: t.motifsRejet,
      motifsNogo: t.motifsNogo,
      fenetre: t.fenetre
    };
  });
}
