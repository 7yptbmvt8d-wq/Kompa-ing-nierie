/**
 * Module Estimation — fonctions appelées par l'interface (google.script.run).
 * Même enveloppe que le suivi (repondre_ : contrôle d'accès, erreurs, sérialisation).
 */

function Est_versClient_(nom, ligne) {
  return versClient_(EST_TABLES[nom], ligne);
}

/** Référentiels et leur description pour l'écran. */
function apiEstReferentiels() {
  return repondre_(function () {
    var out = {};
    Object.keys(EST_REFERENTIELS).forEach(function (nom) {
      var def = EST_REFERENTIELS[nom];
      out[nom] = {
        titre: def.titre, aide: def.aide, sansAjout: !!def.sansAjout, cle: EST_TABLES[nom].cle,
        colonnes: def.colonnes.map(function (c) { return { nom: c[0], libelle: c[1], type: c[2] }; }),
        lignes: Est_refLister_(nom).map(function (l) { return Est_versClient_(nom, l); })
      };
    });
    return out;
  });
}

function apiEstRefAjouter(nom, champs) {
  return repondre_(function () { return Est_versClient_(nom, Est_refAjouter_(nom, champs)); });
}

function apiEstRefModifier(nom, cle, champs) {
  return repondre_(function () { return Est_versClient_(nom, Est_refModifier_(nom, cle, champs)); });
}

/** Écran Estimation : liste des estimations, avec l'affaire rattachée. */
function apiEstAccueil() {
  return repondre_(function () {
    var affaires = {};
    Db_lire(TABLES.AFFAIRES).forEach(function (a) { affaires[a.id] = a; });
    var ests = Db_lire(EST_TABLES.ESTIMATIONS).map(function (e) {
      var a = affaires[e.id_affaire] || {};
      var c = Est_versClient_('ESTIMATIONS', e);
      c.acheteur = a.acheteur || '';
      c.objet = a.objet || '';
      return c;
    });
    ests.sort(function (x, y) { return String(y.modifie_le).localeCompare(String(x.modifie_le)); });
    return { version: EST_VERSION, estimations: ests };
  });
}

/** Estimations d'une affaire (onglet « Estimations » de la fiche). */
function apiEstAffaire(idAffaire) {
  return repondre_(function () {
    return Db_lire(EST_TABLES.ESTIMATIONS)
      .filter(function (e) { return String(e.id_affaire) === String(idAffaire); })
      .map(function (e) { return Est_versClient_('ESTIMATIONS', e); });
  });
}
