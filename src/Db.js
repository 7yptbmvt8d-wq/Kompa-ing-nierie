/**
 * Accès au classeur : une table = un onglet, une ligne = un objet.
 * Ligne 1 = noms de colonnes (identifiants techniques, ne pas renommer à la main).
 */

/**
 * Mémoire de l'exécution en cours : chaque onglet n'est lu qu'une fois par appel
 * (google.script.run, déclencheur). Toute écriture dans un onglet vide sa mémoire.
 */
var Db_cache_ = { classeurs: {}, lignes: {}, entetes: {}, versions: {}, ecrits: {} };

/**
 * Mémoire partagée entre les appels (accélération du 21/11/2026) : chaque onglet lu est gardé dans le cache
 * du script (CacheService, 6 h au plus), avec la date de dernière modification du classeur (Drive).
 * - Une écriture par l'app (Db_inserer, Db_maj, Db_supprimerSi…) efface aussitôt la mémoire de l'onglet ;
 * - une modification faite à la main dans le classeur change sa date : toute la mémoire du classeur est ignorée.
 * En cas de souci (cache indisponible, onglet trop gros), lecture directe du classeur, comme avant.
 */
var DB_MEMOIRE_TTL = 21600;
var DB_MEMOIRE_MORCEAU = 30000; // caractères par entrée (limite de 100 Ko par valeur)
var DB_MEMOIRE_MORCEAUX_MAX = 40;

function Db_memoire_() {
  try { return typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null; } catch (e) { return null; }
}

/** Date de dernière modification du classeur (une lecture Drive par appel et par classeur), ou null. */
function Db_versionClasseur_(cleClasseur) {
  var cle = cleClasseur || 'SUIVI';
  if (cle in Db_cache_.versions) return Db_cache_.versions[cle];
  var v = null;
  try {
    var id = PropertiesService.getScriptProperties().getProperty(CLASSEURS[cle].prop);
    if (id) v = String(DriveApp.getFileById(id).getLastUpdated().getTime());
  } catch (e) { v = null; }
  Db_cache_.versions[cle] = v;
  return v;
}

function Db_cleMemoire_(table) {
  return 'db|' + Db_cle_(table);
}

/** Lignes d'un onglet depuis la mémoire partagée, ou null (absente, périmée, illisible). */
function Db_lireMemoire_(table) {
  var c = Db_memoire_();
  var version = c && Db_versionClasseur_(table.classeur);
  if (!version) return null;
  try {
    var cle = Db_cleMemoire_(table);
    var tete = c.get(cle);
    if (!tete) return null;
    var t = JSON.parse(tete);
    if (t.v !== version || !(t.n >= 1)) return null;
    var cles = [];
    for (var i = 0; i < t.n; i++) cles.push(cle + '|' + i);
    var morceaux = c.getAll(cles);
    var texte = '';
    for (var j = 0; j < t.n; j++) {
      if (typeof morceaux[cles[j]] !== 'string') return null;
      texte += morceaux[cles[j]];
    }
    return JSON.parse(texte, function (k, val) {
      return val && typeof val === 'object' && typeof val.$d === 'number' ? new Date(val.$d) : val;
    });
  } catch (e) { return null; }
}

/** Garde les lignes d'un onglet dans la mémoire partagée (sauf si l'appel a déjà écrit dans ce classeur). */
function Db_ecrireMemoire_(table, lignes) {
  var c = Db_memoire_();
  if (!c || Db_cache_.ecrits[table.classeur || 'SUIVI']) return;
  var version = Db_versionClasseur_(table.classeur);
  if (!version) return;
  try {
    var texte = JSON.stringify(lignes, function (k, val) {
      var brut = this[k];
      return brut instanceof Date ? { $d: brut.getTime() } : val;
    });
    var n = Math.max(1, Math.ceil(texte.length / DB_MEMOIRE_MORCEAU));
    if (n > DB_MEMOIRE_MORCEAUX_MAX) return;
    var cle = Db_cleMemoire_(table), valeurs = {};
    for (var i = 0; i < n; i++) valeurs[cle + '|' + i] = texte.slice(i * DB_MEMOIRE_MORCEAU, (i + 1) * DB_MEMOIRE_MORCEAU);
    c.putAll(valeurs, DB_MEMOIRE_TTL);
    c.put(cle, JSON.stringify({ v: version, n: n }), DB_MEMOIRE_TTL);
  } catch (e) { /* mémoire non disponible : sans effet */ }
}

/** Oublie la mémoire partagée d'un onglet (après une écriture par l'app). */
function Db_oublierMemoire_(table) {
  Db_cache_.ecrits[table.classeur || 'SUIVI'] = true;
  var c = Db_memoire_();
  if (!c) return;
  try { c.remove(Db_cleMemoire_(table)); } catch (e) { /* sans effet */ }
}

/** Clé de mémoire d'une table : classeur + onglet (deux classeurs peuvent avoir un onglet de même nom). */
function Db_cle_(table) {
  return (table.classeur || 'SUIVI') + '|' + table.onglet;
}

function Db_viderCache_(table) {
  if (table) { delete Db_cache_.lignes[Db_cle_(table)]; delete Db_cache_.entetes[Db_cle_(table)]; }
  else { Db_cache_.lignes = {}; Db_cache_.entetes = {}; Db_cache_.versions = {}; Db_cache_.ecrits = {}; }
}

/** En-têtes d'une table (mémorisés pour l'exécution). */
function Db_entetesTable_(table, onglet) {
  var k = Db_cle_(table);
  if (!Db_cache_.entetes[k]) Db_cache_.entetes[k] = Db_entetes_(onglet || Db_onglet_(table));
  return Db_cache_.entetes[k];
}

/**
 * Classeur de données : « SUIVI » (par défaut, suivi des affaires) ou « EST » (module Estimation).
 * Lève une erreur claire si installer() n'a pas été lancé.
 */
function Db_classeur(cle) {
  cle = cle || 'SUIVI';
  if (Db_cache_.classeurs[cle]) return Db_cache_.classeurs[cle];
  var def = CLASSEURS[cle];
  if (!def) throw new Error('Classeur inconnu : ' + cle);
  var id = PropertiesService.getScriptProperties().getProperty(def.prop);
  if (!id) {
    throw new Error('Classeur « ' + def.nom + ' » introuvable : lancez la fonction installer() depuis l\'éditeur Apps Script.');
  }
  Db_cache_.classeurs[cle] = SpreadsheetApp.openById(id);
  return Db_cache_.classeurs[cle];
}

function Db_onglet_(table) {
  var onglet = Db_classeur(table.classeur).getSheetByName(table.onglet);
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
  var cle = Db_cle_(table);
  if (!Db_cache_.lignes[cle]) Db_cache_.lignes[cle] = Db_lireMemoire_(table);
  if (!Db_cache_.lignes[cle]) {
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
    Db_cache_.lignes[cle] = lignes;
    Db_ecrireMemoire_(table, lignes);
  }
  return Db_cache_.lignes[cle].map(function (o) { return Object.assign({}, o); });
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

/** Remplace une valeur dans toute une colonne (une seule écriture). Renvoie le nombre de cellules modifiées. */
function Db_remplacerValeur_(table, colonne, ancienne, nouvelle) {
  return Db_verrou_(function () {
    var onglet = Db_onglet_(table);
    var j = Db_entetesTable_(table, onglet).indexOf(colonne);
    var n = onglet.getLastRow() - 1;
    if (j < 0 || n < 1) return 0;
    var plage = onglet.getRange(2, j + 1, n, 1);
    var valeurs = plage.getValues();
    var modifiees = 0;
    valeurs.forEach(function (l) { if (String(l[0]) === String(ancienne)) { l[0] = nouvelle; modifiees++; } });
    if (modifiees) plage.setValues(valeurs);
    Db_viderCache_lignes_(table);
    return modifiees;
  });
}

function Db_viderCache_lignes_(table) {
  delete Db_cache_.lignes[Db_cle_(table)];
  Db_oublierMemoire_(table);
}
