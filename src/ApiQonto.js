/** API de l'interface : connexion à Qonto, synchronisation des factures, rattachement. */

function apiQontoEtat() {
  return repondre_(function () { return Qonto_etat(); });
}

/** Teste puis enregistre la clé API (propriétés du script, jamais le classeur). */
function apiQontoConnecter(login, secret) {
  return repondre_(function () { var r = Qonto_connecter(login, secret); r.etat = Qonto_etat(); return r; });
}

function apiQontoDeconnecter() {
  return repondre_(function () { Qonto_deconnecter(); return Qonto_etat(); });
}

/** Synchronise puis renvoie le bilan, l'état Qonto et la synthèse Finances à jour. */
function apiQontoSynchroniser() {
  return repondre_(function () {
    var bilan = Qonto_synchroniser();
    return { bilan: bilan, etat: Qonto_etat(), finances: Finances_synthese() };
  });
}

function apiQontoRattacher(idFacture, idAffaire, tranche) {
  return repondre_(function () {
    Qonto_rattacher(idFacture, idAffaire, tranche);
    return { etat: Qonto_etat(), finances: Finances_synthese() };
  });
}
