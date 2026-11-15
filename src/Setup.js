/**
 * Installation et maintenance du socle (lot 1).
 *
 * installer() est idempotent : on peut le relancer à chaque mise à jour du code.
 * Il crée le classeur s'il n'existe pas, crée les onglets et colonnes manquants,
 * ajoute les paramètres manquants et (ré)installe les déclencheurs.
 */

function installer(options) {
  var debut = Date.now();
  Db_viderCache_();
  var classeur = Setup_classeur_('SUIVI');
  var classeurEst = Setup_classeur_('EST');
  var rapport = { classeur: classeur.getUrl(), classeurEstimation: classeurEst.getUrl(), onglets: [], colonnesAjoutees: 0 };

  var tables = Tables_toutes_();
  Object.keys(tables).forEach(function (k) {
    var t = tables[k];
    var r = Setup_onglet_(t.classeur === 'EST' ? classeurEst : classeur, t);
    rapport.onglets.push(t.onglet + (r.cree ? ' (créé)' : ''));
    rapport.colonnesAjoutees += r.colonnesAjoutees;
  });
  Setup_supprimerFeuilleVide_(classeur, 'SUIVI');
  Setup_supprimerFeuilleVide_(classeurEst, 'EST');
  if (typeof Est_installer_ === 'function') {
    try { rapport.estimation = Est_installer_(); } catch (e) { rapport.estimation = 'erreur : ' + e.message; }
  }

  rapport.parametresAjoutes = Params_initialiser_();
  rapport.parametresMisAJour = Params_migrer_();
  try { rapport.avisRefiltres = Veille_refiltrer_(); } catch (e) { rapport.avisRefiltres = 'erreur : ' + e.message; }
  // Affaire d'exercice Mouthe (§ 11) : créée si absente
  if (!(options && options.exercice === false)) {
    try { rapport.exerciceMouthe = creerAffaireExerciceMouthe(); } catch (e) { rapport.exerciceMouthe = 'erreur : ' + e.message; }
  }
  // Dossiers Drive des affaires existantes
  try { rapport.dossiersDrive = creerDossiersManquants(); } catch (e) { rapport.dossiersDrive = 'erreur : ' + e.message; }
  rapport.declencheurs = Setup_declencheurs_();
  rapport.duree_s = Math.round((Date.now() - debut) / 100) / 10;

  console.log(JSON.stringify(rapport, null, 2));
  return rapport;
}

/** Ouvre le classeur enregistré (SUIVI ou EST) ou en crée un nouveau. */
function Setup_classeur_(cle) {
  var def = CLASSEURS[cle || 'SUIVI'];
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(def.prop);
  if (id) {
    try {
      var existant = SpreadsheetApp.openById(id);
      Db_cache_.classeurs[cle || 'SUIVI'] = existant;
      return existant;
    } catch (e) {
      throw new Error('Le classeur ' + id + ' est inaccessible (supprimé ?). ' +
        'Restaurez-le depuis la corbeille Drive, ou supprimez la propriété ' +
        def.prop + ' du script pour en créer un nouveau.');
    }
  }
  var classeur = SpreadsheetApp.create(def.nom);
  classeur.setSpreadsheetTimeZone(APP.FUSEAU);
  classeur.setSpreadsheetLocale('fr_FR');
  props.setProperty(def.prop, classeur.getId());
  Db_cache_.classeurs[cle || 'SUIVI'] = classeur;
  return classeur;
}

/** Crée l'onglet et ajoute les colonnes manquantes en fin de ligne d'en-tête. */
function Setup_onglet_(classeur, table) {
  var onglet = classeur.getSheetByName(table.onglet);
  var cree = false;
  if (!onglet) {
    onglet = classeur.insertSheet(table.onglet);
    cree = true;
  }

  var attendues = colonnesTable_(table);
  var presentes = Db_entetes_(onglet).filter(String);
  var manquantes = attendues.filter(function (c) { return presentes.indexOf(c) < 0; });

  if (manquantes.length) {
    var depart = presentes.length + 1;
    var besoin = depart + manquantes.length - 1;
    if (onglet.getMaxColumns() < besoin) {
      onglet.insertColumnsAfter(onglet.getMaxColumns(), besoin - onglet.getMaxColumns());
    }
    onglet.getRange(1, depart, 1, manquantes.length).setValues([manquantes]);
  }

  var nbCol = presentes.length + manquantes.length;
  onglet.getRange(1, 1, 1, nbCol)
    .setFontWeight('bold')
    .setBackground(THEME_CLASSEUR.ENTETE_FOND)
    .setFontColor(THEME_CLASSEUR.ENTETE_TEXTE)
    .setFontFamily(THEME_CLASSEUR.POLICE);
  onglet.setFrozenRows(1);

  (table.texteBrut || []).forEach(function (nom) {
    var j = presentes.concat(manquantes).indexOf(nom);
    if (j >= 0) onglet.getRange(2, j + 1, onglet.getMaxRows() - 1, 1).setNumberFormat('@');
  });

  return { cree: cree, colonnesAjoutees: cree ? 0 : manquantes.length };
}

/** Supprime la feuille par défaut (« Feuille 1 » / « Sheet1 ») si elle est vide. */
function Setup_supprimerFeuilleVide_(classeur, cle) {
  var tables = Tables_toutes_();
  var noms = Object.keys(tables)
    .filter(function (k) { return (tables[k].classeur || 'SUIVI') === cle; })
    .map(function (k) { return tables[k].onglet; });
  classeur.getSheets().forEach(function (f) {
    if (noms.indexOf(f.getName()) < 0 && f.getLastRow() === 0 && classeur.getSheets().length > 1) {
      classeur.deleteSheet(f);
    }
  });
}

/**
 * Déclencheurs : sauvegarde hebdomadaire (lundi, 5 h), collecte de la veille (6 h, paramètre).
 * et e-mail du matin (7 h, paramètre ; l'envoi vérifie le jour de la semaine).
 */
function Setup_declencheurs_() {
  var voulus = [
    {
      fonction: 'sauvegardeHebdo',
      creer: function () {
        return ScriptApp.newTrigger('sauvegardeHebdo').timeBased()
          .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).inTimezone(APP.FUSEAU).create();
      }
    }
    ,
    {
      fonction: 'collecteQuotidienne',
      creer: function () {
        return ScriptApp.newTrigger('collecteQuotidienne').timeBased()
          .everyDays(1).atHour(Params_nombre('veille.heure_collecte', 6)).inTimezone(APP.FUSEAU).create();
      }
    },
    {
      fonction: 'envoyerEmailMatin',
      creer: function () {
        return ScriptApp.newTrigger('envoyerEmailMatin').timeBased()
          .everyDays(1).atHour(Params_nombre('email.heure', 7)).inTimezone(APP.FUSEAU).create();
      }
    }
  ];
  // Module Estimation (Estimation.gs) : mise à jour mensuelle des index Insee
  if (typeof Est_declencheurs_ === 'function') voulus = voulus.concat(Est_declencheurs_());
  var existants = ScriptApp.getProjectTriggers();
  return voulus.map(function (v) {
    existants
      .filter(function (t) { return t.getHandlerFunction() === v.fonction; })
      .forEach(function (t) { ScriptApp.deleteTrigger(t); });
    v.creer();
    return v.fonction;
  });
}

/**
 * Copie datée de chaque classeur (suivi et estimation) dans le dossier Drive des sauvegardes ;
 * conserve les N dernières copies de chacun.
 */
function sauvegardeHebdo() {
  var dossier = Setup_dossierSauvegardes_();
  var horodatage = Utilities.formatDate(new Date(), APP.FUSEAU, 'yyyy-MM-dd');
  var aGarder = Params_nombre('sauvegarde.nb_copies', 8);
  var props = PropertiesService.getScriptProperties();
  Object.keys(CLASSEURS).forEach(function (cle) {
    var def = CLASSEURS[cle];
    if (!props.getProperty(def.prop)) return; // classeur pas encore créé
    DriveApp.getFileById(Db_classeur(cle).getId()).makeCopy(def.nom + ' — ' + horodatage, dossier);
    var copies = [];
    var it = dossier.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (String(f.getName()).indexOf(def.nom + ' — ') === 0) copies.push(f);
    }
    copies.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
    copies.slice(aGarder).forEach(function (f) { f.setTrashed(true); });
    console.log('Sauvegarde ' + def.nom + ' ' + horodatage + ' : ' + Math.min(copies.length, aGarder) + ' copie(s) conservée(s).');
  });
}

function Setup_dossierSauvegardes_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(APP.PROP_DOSSIER_SAUVEGARDES_ID);
  if (id) {
    try {
      var d = DriveApp.getFolderById(id);
      if (!d.isTrashed()) return d;
    } catch (e) { /* recréé ci-dessous */ }
  }
  var dossier = DriveApp.createFolder(APP.DOSSIER_SAUVEGARDES);
  props.setProperty(APP.PROP_DOSSIER_SAUVEGARDES_ID, dossier.getId());
  return dossier;
}
