/**
 * Web app : point d'entrée HTTP et fonctions appelées par l'interface (google.script.run).
 *
 * Accès : le manifeste limite la web app au seul compte propriétaire
 * (access MYSELF, executeAs USER_DEPLOYING). verifierAcces_() double ce contrôle.
 */

function doGet() {
  verifierAcces_();
  // Application pour ordinateur (Windows, macOS, ChromeOS) : pas de version mobile (décision du 12/11/2026).
  var sortie = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP.NOM);
  try {
    var favicon = Params_texte('app.favicon_url', '');
    if (favicon) sortie.setFaviconUrl(favicon);
  } catch (e) {
    // Classeur pas encore installé : la page s'affiche quand même et signale l'erreur.
  }
  return sortie;
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

/** État du socle : compte, classeur, onglets, quotas. */
function apiEtat() {
  return repondre_(function () {
    var classeur = Db_classeur();
    var onglets = Object.keys(TABLES).map(function (k) {
      var f = classeur.getSheetByName(TABLES[k].onglet);
      return { nom: TABLES[k].onglet, present: !!f, lignes: f ? Math.max(f.getLastRow() - 1, 0) : 0 };
    });
    return {
      app: APP.NOM,
      version: APP.VERSION,
      compte: Session.getEffectiveUser().getEmail(),
      classeur: { nom: classeur.getName(), url: classeur.getUrl() },
      onglets: onglets,
      quotaEmailRestant: MailApp.getRemainingDailyQuota(),
      declencheurs: ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }),
      maintenant: new Date()
    };
  });
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
