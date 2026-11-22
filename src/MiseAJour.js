/** Déployé automatiquement depuis GitHub (workflow « Déployer dans Apps Script »).
 * Mise à jour automatique du classeur (décision du 21/11/2026) : après le collage d'une nouvelle version du code,
 * le premier appel (ouverture de l'app ou déclencheur du matin) complète le classeur, sans relancer installer().
 *
 * Seulement des AJOUTS, jamais de suppression, de déplacement ni de modification d'une valeur saisie :
 * - onglets absents créés, colonnes absentes ajoutées en fin de ligne d'en-tête ;
 * - paramètres absents ajoutés avec leur valeur par défaut ; valeur d'origine jamais modifiée → nouvelle valeur par défaut ;
 * - référentiels du module Estimation : lignes absentes ajoutées ;
 * - déclencheurs absents recréés (ceux qui existent ne sont pas touchés).
 * installer() reste disponible pour une remise à plat complète (migrations de valeurs, avis re-filtrés…).
 * Le résultat est noté dans le Journal moteur et signalé une fois sur l'accueil.
 */

var MAJ_PROP_SIGNATURE = 'KA_SIGNATURE_SCHEMA';
var MAJ_PROP_RAPPORT = 'KA_DERNIERE_MAJ_AUTO';

/** Empreinte de ce que le code attend du classeur : colonnes, paramètres, référentiels, déclencheurs. */
function MiseAJour_signature_() {
  var tables = Tables_toutes_();
  var morceaux = [APP.VERSION, typeof EST_VERSION !== 'undefined' ? EST_VERSION : '-'];
  Object.keys(tables).sort().forEach(function (k) { morceaux.push(tables[k].onglet + ':' + colonnesTable_(tables[k]).join(',')); });
  morceaux.push(PARAMETRES_DEFAUT.map(function (p) { return p[0]; }).join(','));
  if (typeof EST_PARAMS_DEFAUT !== 'undefined') {
    morceaux.push(EST_PARAMS_DEFAUT.map(function (p) { return p[0]; }).join(','));
    morceaux.push(EST_LOTS_DEFAUT.map(function (p) { return p[0]; }).join(','));
    morceaux.push(EST_TYPOLOGIES_DEFAUT.map(function (p) { return p[0]; }).join(','));
  }
  morceaux.push(MiseAJour_declencheursVoulus_().join(','));
  var texte = morceaux.join('|'), h = 5381;
  for (var i = 0; i < texte.length; i++) h = ((h * 33) ^ texte.charCodeAt(i)) >>> 0;
  return APP.VERSION + '-' + h.toString(36) + '-' + texte.length;
}

function MiseAJour_declencheursVoulus_() {
  var noms = ['sauvegardeHebdo', 'collecteQuotidienne', 'envoyerEmailMatin'];
  if (typeof Est_declencheurs_ === 'function') noms = noms.concat(Est_declencheurs_().map(function (d) { return d.fonction; }));
  return noms;
}

/**
 * Vérifie, très vite, si le classeur correspond à la version du code ; sinon le complète.
 * Renvoie null (rien à faire) ou le rapport de mise à jour. Ne lève jamais d'erreur.
 */
function MiseAJour_verifier_() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (!props.getProperty(CLASSEURS.SUIVI.prop)) return null; // pas encore installé : installer() d'abord
    var signature = MiseAJour_signature_();
    if (props.getProperty(MAJ_PROP_SIGNATURE) === signature) return null;
    var verrou = LockService.getScriptLock();
    if (!verrou.tryLock(15000)) return null; // un autre appel s'en charge
    try {
      if (props.getProperty(MAJ_PROP_SIGNATURE) === signature) return null;
      var rapport = MiseAJour_appliquer_();
      props.setProperty(MAJ_PROP_SIGNATURE, signature);
      if (rapport.changements.length) props.setProperty(MAJ_PROP_RAPPORT, JSON.stringify({ date: new Date().toISOString(), version: APP.VERSION, changements: rapport.changements }));
      return rapport;
    } finally {
      verrou.releaseLock();
    }
  } catch (e) {
    console.error('Mise à jour automatique du classeur : ' + e.message);
    try { Db_inserer(TABLES.JOURNAL_MOTEUR, { date: new Date(), source: 'Mise à jour automatique', avis_lus: 0, avis_retenus: 0, erreurs: String(e.message).slice(0, 300) }); } catch (e2) { /* sans effet */ }
    return null;
  }
}

/** Ajouts seulement (voir l'en-tête du fichier). Renvoie { changements: [libellés] }. */
function MiseAJour_appliquer_() {
  Db_viderCache_();
  var changements = [];
  var classeurs = { SUIVI: Db_classeur('SUIVI') };
  var tables = Tables_toutes_();
  Object.keys(tables).forEach(function (k) {
    var t = tables[k], cle = t.classeur || 'SUIVI';
    if (!classeurs[cle]) {
      if (!PropertiesService.getScriptProperties().getProperty(CLASSEURS[cle].prop)) { classeurs[cle] = Setup_classeur_(cle); changements.push('classeur « ' + CLASSEURS[cle].nom + ' » créé'); }
      else classeurs[cle] = Db_classeur(cle);
    }
    var onglet = classeurs[cle].getSheetByName(t.onglet);
    var presentes = onglet ? Db_entetes_(onglet).filter(String) : [];
    var manquantes = colonnesTable_(t).filter(function (c) { return presentes.indexOf(c) < 0; });
    if (onglet && !manquantes.length) return; // rien à faire : l'onglet n'est pas retouché
    Setup_onglet_(classeurs[cle], t);
    changements.push(onglet ? t.onglet + ' : colonne' + (manquantes.length > 1 ? 's' : '') + ' ' + manquantes.join(', ') + ' ajoutée' + (manquantes.length > 1 ? 's' : '') : 'onglet « ' + t.onglet + ' » créé');
  });
  Db_viderCache_();
  var p = Params_initialiser_();
  if (p) changements.push(p + ' paramètre' + (p > 1 ? 's' : '') + ' ajouté' + (p > 1 ? 's' : ''));
  // Valeurs par défaut d'origine remplacées par les nouvelles (une valeur que vous avez modifiée n'est jamais touchée)
  var migres = Params_migrer_();
  if (migres && migres.length) changements.push('paramètre' + (migres.length > 1 ? 's' : '') + ' mis à jour (valeur d\'origine) : ' + migres.join(', '));
  if (typeof Est_initialiserReferentiels_ === 'function') {
    var r = Est_initialiserReferentiels_();
    var nb = (r.parametres || 0) + (r.lots || 0) + (r.typologies || 0) + (Number(r.k) || 0);
    if (nb) changements.push('Estimation : ' + nb + ' ligne' + (nb > 1 ? 's' : '') + ' de référentiel ajoutée' + (nb > 1 ? 's' : ''));
  }
  var renommes = MiseAJour_renommer_();
  if (renommes.length) changements.push('renommé' + (renommes.length > 1 ? 's' : '') + ' : ' + renommes.join(', '));
  var existants = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var absents = MiseAJour_declencheursVoulus_().filter(function (n) { return existants.indexOf(n) < 0; });
  if (absents.length && existants.length) {
    // Seulement si l'installation a déjà des déclencheurs : on recrée ceux qui manquent, sans toucher aux autres.
    Setup_declencheurs_(absents);
    changements.push('déclencheur' + (absents.length > 1 ? 's' : '') + ' ' + absents.join(', ') + ' recréé' + (absents.length > 1 ? 's' : ''));
  }
  if (changements.length) Db_inserer(TABLES.JOURNAL_MOTEUR, {
    date: new Date(), source: 'Mise à jour automatique', avis_lus: 0, avis_retenus: 0,
    erreurs: changements.length ? ('v' + APP.VERSION + ' : ' + changements.join(' ; ')).slice(0, 500) : ''
  });
  return { changements: changements };
}

/**
 * Renommage Kompa → Kartes (22/11/2026) : classeurs, dossier racine des affaires et dossier des sauvegardes,
 * seulement s'ils portent encore le nom d'origine « Kompa … ». L'app les retrouve par leur identifiant :
 * le renommage ne change ni leur contenu ni leurs liens.
 */
function MiseAJour_renommer_() {
  var faits = [];
  var renommer = function (element, nouveau) {
    if (!element) return;
    var nom = String(element.getName());
    if (nom.indexOf(APP.ANCIEN_NOM + ' ') !== 0 || nom === nouveau) return;
    element.setName(nouveau);
    faits.push('« ' + nom + ' » → « ' + nouveau + ' »');
  };
  var props = PropertiesService.getScriptProperties();
  Object.keys(CLASSEURS).forEach(function (cle) {
    var id = props.getProperty(CLASSEURS[cle].prop);
    if (!id) return;
    try { renommer(DriveApp.getFileById(id), CLASSEURS[cle].nom); } catch (e) { /* fichier inaccessible : laissé tel quel */ }
  });
  try {
    var racine = Drive_id_(Params_texte('drive.dossier_racine', ''));
    if (racine) renommer(DriveApp.getFolderById(racine), Params_texte('drive.nom_racine', 'Kartes Affaires — Dossiers'));
  } catch (e) { /* sans effet */ }
  try {
    var sauv = props.getProperty(APP.PROP_DOSSIER_SAUVEGARDES_ID);
    if (sauv) renommer(DriveApp.getFolderById(sauv), APP.DOSSIER_SAUVEGARDES);
  } catch (e) { /* sans effet */ }
  return faits;
}

/** Dernière mise à jour automatique (affichée sur l'accueil pendant 3 jours), ou null. */
function MiseAJour_dernier_() {
  try {
    var r = JSON.parse(PropertiesService.getScriptProperties().getProperty(MAJ_PROP_RAPPORT) || 'null');
    if (!r || (new Date() - new Date(r.date)) > 3 * 86400000) return null;
    return r;
  } catch (e) { return null; }
}
