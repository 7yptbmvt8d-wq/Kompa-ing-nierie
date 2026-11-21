/**
 * Web app : point d'entrée HTTP et fonctions appelées par l'interface (google.script.run).
 *
 * Accès : le manifeste limite la web app au seul compte propriétaire
 * (access MYSELF, executeAs USER_DEPLOYING). verifierAcces_() double ce contrôle.
 */

function doGet() {
  verifierAcces_();
  MiseAJour_verifier_(); // classeur complété si le code vient d'être mis à jour (ajouts seulement)
  // Application pour ordinateur (Windows, macOS, ChromeOS). Sur téléphone, seul l'Accueil (tableau de bord)
  // est adapté à l'écran (décision du 18/11/2026) ; les autres écrans gardent la mise en page ordinateur.
  var sortie = HtmlService.createTemplateFromFile('Index').evaluate();
  // Thème du compte, appliqué avant l'affichage (repère THEME_SERVEUR de Index.html)
  try { sortie.setContent(sortie.getContent().replace("'THEME_SERVEUR'", "'" + Theme_lire_() + "'")); } catch (e) { /* thème du navigateur */ }
  sortie.setTitle(APP.NOM).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  try {
    sortie.setFaviconUrl(Params_texte('app.favicon_url', '') || APP.FAVICON);
  } catch (e) {
    // Classeur pas encore installé : la page s'affiche quand même et signale l'erreur.
  }
  return sortie;
}

/**
 * Thème de l'interface (Paramètres › Apparence) : gardé sur le compte, pas seulement dans le navigateur
 * (la mémoire du navigateur repart à zéro à chaque nouvelle version de l'app). « kompa » ou « neon ».
 */
function Theme_lire_() {
  try {
    var t = PropertiesService.getUserProperties().getProperty('KA_THEME');
    return t === 'neon' || t === 'kompa' ? t : '';
  } catch (e) { return ''; }
}

function apiTheme(theme) {
  return repondre_(function () {
    if (theme !== 'neon' && theme !== 'kompa') throw new Error('Thème inconnu : ' + theme);
    PropertiesService.getUserProperties().setProperty('KA_THEME', theme);
    return theme;
  });
}

/** Inclusion d'un fichier HTML dans le gabarit : <?!= include('Styles'); ?> */
function include(nom) {
  return HtmlService.createHtmlOutputFromFile(nom).getContent();
}

function verifierAcces_() {
  var proprietaire = Session.getEffectiveUser().getEmail();
  var visiteur = Session.getActiveUser().getEmail();
  if (proprietaire && visiteur && proprietaire !== visiteur) {
    throw new Error('Accès réservé au compte Kompa.');
  }
}

/**
 * Enveloppe commune des appels : contrôle d'accès, gestion d'erreur,
 * sérialisation (google.script.run ne transmet pas les objets Date).
 */
function repondre_(fn) {
  try {
    verifierAcces_();
    return JSON.parse(JSON.stringify({ ok: true, data: fn() }));
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, erreur: String(e && e.message ? e.message : e) };
  }
}

// ——— API du lot 1 ———

/** Accueil en un seul échange : tableau de bord, CA, déclarations, échéances, relances, état. */
function apiAccueil() {
  return repondre_(function () {
    return {
      tableau: Indicateurs_tableau(),
      ca: Compteur_ca(),
      fiscal: Fiscal_declarations(),
      suivi: Suivi_accueil_(),
      etat: Etat_leger_(),
      previsionnel: Previsionnel_ca(),
      alertes: { retards: Finances_retards_(), seuils: Previsionnel_alertes_() }
    };
  });
}

/** Écran Finances : vue d'ensemble, prévisionnel, encaissements (toutes affaires), URSSAF et CFE. */
function apiFinances() {
  return repondre_(function () { return Finances_synthese(); });
}

/** Recherche rapide d'une affaire (Ctrl+K). */
function apiRecherche() {
  return repondre_(Finances_listeRecherche_);
}

/** Facturer ou confirmer un paiement depuis l'écran Finances : renvoie la synthèse à jour. */
function apiFinancesFacturer(idAffaire, tranche, facture) {
  return repondre_(function () { Planning_facturer(idAffaire, tranche, facture); Relances_synchroniser(); return Finances_synthese(); });
}

function apiFinancesPaiement(idFacture, champs) {
  return repondre_(function () { Factures_maj(idFacture, champs); Relances_synchroniser(); return Finances_synthese(); });
}

/** CA prévisionnel par année d'encaissement (écran « CA prévisionnel »). */
function apiPrevisionnel() {
  return repondre_(function () { return Previsionnel_ca(); });
}

/** État du socle : compte, classeur, onglets, quotas. */
function apiEtat() {
  return repondre_(Etat_socle_);
}

/** État pour l'accueil : version, alertes de déploiement, dernière mise à jour automatique (sans relire les onglets). */
function Etat_leger_() {
  return { app: APP.NOM, version: APP.VERSION, alertes: Etat_alertes_(), majAuto: MiseAJour_dernier_() };
}

function Etat_socle_() {
  return (function () {
    var classeur = Db_classeur();
    var tables = Tables_toutes_();
    var onglets = Object.keys(tables).map(function (k) {
      var f = null;
      try { f = Db_classeur(tables[k].classeur).getSheetByName(tables[k].onglet); } catch (e) { /* classeur absent */ }
      return { nom: tables[k].onglet, present: !!f, lignes: f ? Math.max(f.getLastRow() - 1, 0) : 0 };
    });
    return {
      app: APP.NOM,
      version: APP.VERSION,
      alertes: Etat_alertes_(),
      majAuto: MiseAJour_dernier_(),
      compte: Session.getEffectiveUser().getEmail(),
      classeur: { nom: classeur.getName(), url: classeur.getUrl() },
      onglets: onglets,
      quotaEmailRestant: MailApp.getRemainingDailyQuota(),
      declencheurs: ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }),
      maintenant: new Date()
    };
  })();
}

/**
 * Contrôle du déploiement : Code.gs et Estimation.gs doivent être de la même version
 * (un des deux fichiers oublié lors du copier-coller).
 */
function Etat_alertes_() {
  if (typeof EST_VERSION === 'undefined') {
    return ['Le fichier Estimation.gs est absent du projet Apps Script : collez-le depuis dist/ (module Estimation indisponible).'];
  }
  if (EST_VERSION !== APP.VERSION) {
    return ['Versions différentes : Code.gs v' + APP.VERSION + ', Estimation.gs v' + EST_VERSION +
      '. Recollez les deux fichiers depuis dist/, puis relancez installer().'];
  }
  return Etat_colonnesManquantes_();
}

/**
 * Colonnes prévues par le code mais absentes du classeur (installer() pas relancé après une mise à jour).
 * Contrôle mémorisé 6 h une fois réussi, pour ne pas relire les en-têtes à chaque ouverture.
 */
function Etat_colonnesManquantes_() {
  var c = Db_memoire_(), cle = 'schema|' + APP.VERSION;
  try { if (c && c.get(cle) === 'ok') return []; } catch (e) { /* contrôle complet */ }
  var manquantes = [];
  Object.keys(TABLES).forEach(function (k) {
    var t = TABLES[k];
    try {
      var presentes = Db_entetesTable_(t);
      colonnesTable_(t).forEach(function (col) { if (presentes.indexOf(col) < 0) manquantes.push(t.onglet + ' › ' + col); });
    } catch (e) { manquantes.push(t.onglet); }
  });
  if (!manquantes.length) {
    try { if (c) c.put(cle, 'ok', DB_MEMOIRE_TTL); } catch (e) { /* sans effet */ }
    return [];
  }
  return ['Classeur pas à jour (' + manquantes.slice(0, 6).join(', ') + (manquantes.length > 6 ? '…' : '') +
    ') : ouvrez l\'éditeur Apps Script, choisissez la fonction installer et cliquez sur Exécuter. Sans cela, certaines saisies ne sont pas enregistrées.'];
}

/** Liste des paramètres, groupés pour l'écran Paramètres. */
function apiParametres() {
  return repondre_(function () {
    var lignes = Db_lire(TABLES.PARAMETRES).map(function (l) {
      return {
        cle: String(l.cle),
        valeur: l.valeur === null ? '' : String(l.valeur),
        commentaire: String(l.commentaire || ''),
        modifie_le: l.modifie_le
      };
    });
    var groupes = GROUPES_PARAMETRES.map(function (g) {
      return { prefixe: g[0], titre: g[1], parametres: [] };
    });
    var autres = { prefixe: '', titre: 'Autres', parametres: [] };
    lignes.forEach(function (p) {
      var prefixe = p.cle.split('.')[0];
      var groupe = groupes.filter(function (g) { return g.prefixe === prefixe; })[0] || autres;
      groupe.parametres.push(p);
    });
    if (autres.parametres.length) groupes.push(autres);
    return groupes.filter(function (g) { return g.parametres.length; });
  });
}

/** Enregistre la valeur d'un paramètre existant. */
function apiParametreEnregistrer(cle, valeur) {
  return repondre_(function () {
    var l = Params_enregistrer(cle, valeur);
    return { cle: String(l.cle), valeur: String(l.valeur), commentaire: String(l.commentaire || ''), modifie_le: l.modifie_le };
  });
}

/** Compteur de CA de l'année civile face aux seuils. */
function apiCompteurCA() {
  return repondre_(function () { return Compteur_ca(); });
}
