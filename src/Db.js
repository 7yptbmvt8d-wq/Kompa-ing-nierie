/**
 * Accès au classeur : une table = un onglet, une ligne = un objet.
 * Ligne 1 = noms de colonnes (identifiants techniques, ne pas renommer à la main).
 */

/**
 * Mémoire de l'exécution en cours : chaque onglet n'est lu qu'une fois par appel
 * (google.script.run, déclencheur). Toute écriture dans un onglet vide sa mémoire.
 */
var Db_cache_ = { classeur: null, lignes: {}, entetes: {} };

function Db_viderCache_(table) {
  if (table) { delete Db_cache_.lignes[table.onglet]; delete Db_cache_.entetes[table.onglet]; }
  else { Db_cache_.lignes = {}; Db_cache_.entetes = {}; }
}

/** En-têtes d'une table (mémorisés pour l'exécution). */
function Db_entetesTable_(table, onglet) {
  if (!Db_cache_.entetes[table.onglet]) Db_cache_.entetes[table.onglet] = Db_entetes_(onglet || Db_onglet_(table));
  return Db_cache_.entetes[table.onglet];
}

/** Classeur de données. Lève une erreur claire si installer() n'a pas été lancé. */
function Db_classeur() {
  if (Db_cache_.classeur) return Db_cache_.classeur;
  var id = PropertiesService.getScriptProperties().getProperty(APP.PROP_CLASSEUR_ID);
  if (!id) {
    throw new Error('Classeur introuvable : lancez la fonction installer() depuis l\'éditeur Apps Script.');
  }
  Db_cache_.classeur = SpreadsheetApp.openById(id);
  return Db_cache_.classeur;
}

function Db_onglet_(table) {
  var onglet = Db_classeur().getSheetByName(table.onglet);
  if (!onglet) {
    throw new Error('Onglet « ' + table.onglet + ' » absent : relancez installer().');
  }
  return onglet;
}

/** En-têtes réels de l'onglet (ordre du classeur, pas celui du code). */
function Db_entetes_(onglet) {
  var nb = onglet.getLastColumn();
  if (nb === 0) return [];
  return onglet.getRange(1, 1, 1, nb).getValues()[0].map(function (v) { return String(v).trim(); });
}

/** Toutes les lignes d'une table, en objets (copies : modifiables sans effet sur la mémoire). */
function Db_lire(table) {
  if (!Db_cache_.lignes[table.onglet]) {
    var onglet = Db_onglet_(table);
    var entetes = Db_entetesTable_(table, onglet);
    var nbLignes = onglet.getLastRow() - 1;
    var lignes = [];
    if (nbLignes >= 1 && entetes.length) {
      lignes = onglet.getRange(2, 1, nbLignes, entetes.length).getValues()
        .filter(function (ligne) { return ligne.some(function (v) { return v !== '' && v !== null; }); })
        .map(function (ligne) {
          var obj = {};
          entetes.forEach(function (nom, i) { if (nom) obj[nom] = ligne[i]; });
          return obj;
        });
    }
    Db_cache_.lignes[table.onglet] = lignes;
  }
  return Db_cache_.lignes[table.onglet].map(function (o) { return Object.assign({}, o); });
}

/** Ligne dont la clé vaut `valeur`, ou null. */
function Db_trouver(table, valeur) {
  var lignes = Db_lire(table);
  for (var i = 0; i < lignes.length; i++) {
    if (String(lignes[i][table.cle]) === String(valeur)) return lignes[i];
  }
  return null;
}

/** Identifiant unique : PRÉFIXE-aaaammjj-xxxxxx. */
function Db_nouvelId(table) {
  var date = Utilities.formatDate(new Date(), APP.FUSEAU, 'yyyyMMdd');
  var alea = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  return (table.prefixe || 'ID') + '-' + date + '-' + alea;
}

/** Ajoute une ligne. Renseigne la clé (si absente), cree_le et modifie_le. */
function Db_inserer(table, obj) {
  return Db_insererPlusieurs(table, [obj])[0];
}

/** Ajoute plusieurs lignes en une seule écriture. */
function Db_insererPlusieurs(table, objets) {
  if (!objets.length) return [];
  return Db_verrou_(function () {
    var onglet = Db_onglet_(table);
    var entetes = Db_entetesTable_(table, onglet);
    Db_viderCache_lignes_(table);
    var maintenant = new Date();
    var lignes = objets.map(function (obj) {
      var ligne = Object.assign({}, obj);
      if (!ligne[table.cle]) ligne[table.cle] = Db_nouvelId(table);
      ligne.cree_le = maintenant;
      ligne.modifie_le = maintenant;
      return ligne;
    });
    var valeurs = lignes.map(function (ligne) {
      return entetes.map(function (nom) {
        return ligne[nom] === undefined || ligne[nom] === null ? '' : ligne[nom];
      });
    });
    onglet.getRange(onglet.getLastRow() + 1, 1, valeurs.length, entetes.length).setValues(valeurs);
    return lignes;
  });
}

/** Met à jour les champs fournis de la ligne de clé `valeurCle`. Renvoie la ligne complète. */
function Db_maj(table, valeurCle, champs) {
  return Db_verrou_(function () {
    var onglet = Db_onglet_(table);
    var entetes = Db_entetesTable_(table, onglet);
    Db_viderCache_lignes_(table);
    var iCle = entetes.indexOf(table.cle);
    var nbLignes = onglet.getLastRow() - 1;
    if (iCle < 0 || nbLignes < 1) throw new Error('Ligne introuvable : ' + valeurCle);
    var cles = onglet.getRange(2, iCle + 1, nbLignes, 1).getValues();
    var rang = -1;
    for (var i = 0; i < cles.length; i++) {
      if (String(cles[i][0]) === String(valeurCle)) { rang = i + 2; break; }
    }
    if (rang < 0) throw new Error('Ligne introuvable : ' + valeurCle);

    var plage = onglet.getRange(rang, 1, 1, entetes.length);
    var valeurs = plage.getValues()[0];
    var maj = Object.assign({}, champs, { modifie_le: new Date() });
    delete maj[table.cle];
    delete maj.cree_le;
    Object.keys(maj).forEach(function (nom) {
      var j = entetes.indexOf(nom);
      if (j >= 0) valeurs[j] = maj[nom] === undefined || maj[nom] === null ? '' : maj[nom];
    });
    plage.setValues([valeurs]);

    var obj = {};
    entetes.forEach(function (nom, j) { if (nom) obj[nom] = valeurs[j]; });
    return obj;
  });
}

/** Exécute `fn` sous verrou de script (écritures concurrentes moteur / app). */
function Db_verrou_(fn) {
  var verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    verrou.releaseLock();
  }
}

/** Supprime les lignes pour lesquelles garder(ligne) est vrai. Renvoie le nombre supprimé. */
function Db_supprimerSi(table, critere) {
  return Db_verrou_(function () {
    var onglet = Db_onglet_(table);
    var entetes = Db_entetesTable_(table, onglet);
    Db_viderCache_lignes_(table);
    var n = onglet.getLastRow() - 1;
    if (n < 1) return 0;
    var valeurs = onglet.getRange(2, 1, n, entetes.length).getValues();
    var supprimees = 0;
    for (var i = valeurs.length - 1; i >= 0; i--) {
      var obj = {};
      entetes.forEach(function (nom, j) { if (nom) obj[nom] = valeurs[i][j]; });
      if (critere(obj)) { onglet.deleteRow(i + 2); supprimees++; }
    }
    return supprimees;
  });
}

function Db_viderCache_lignes_(table) {
  delete Db_cache_.lignes[table.onglet];
}
