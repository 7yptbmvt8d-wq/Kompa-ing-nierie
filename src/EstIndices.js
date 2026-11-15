/**
 * Module Estimation — index Insee BT et TP (étape 2).
 *
 * Source : API BDM de l'Insee (SDMX, libre d'accès, sans clé)
 *   https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/{idbank}+{idbank}…?startPeriod=AAAA-MM | ?lastNObservations=N
 * Historique stocké dans l'onglet « Valeurs des index » (une ligne par index et par mois).
 * Mise à jour : déclencheur mensuel (jour paramétrable) + bouton de l'écran Estimation.
 * Panne de l'API : rien n'est effacé, les dernières valeurs connues restent utilisées et l'incident est signalé.
 * Les index paraissent environ 2 à 3 mois après le mois concerné : le mois de l'index est toujours affiché.
 */

var EST_INSEE_URL = 'https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/';
var EST_INSEE_LOT = 30; // séries par requête (longueur d'URL raisonnable)

/** Ajoute les séries absentes de l'onglet « Index Insee » (actives sauf séries arrêtées). */
function Est_initialiserIndices_() {
  var existants = {};
  Db_lire(EST_TABLES.INDICES).forEach(function (l) { existants[String(l.code)] = true; });
  var nouveaux = EST_SERIES_INSEE.filter(function (s) { return !existants[s[0]]; }).map(function (s) {
    return { code: s[0], idbank: s[1], libelle: s[2], famille: s[3], base: '2010', coef_raccordement: 1, arretee: s[4], actif: 'oui' };
  });
  Db_insererPlusieurs(EST_TABLES.INDICES, nouveaux);
  return nouveaux.length;
}

/** Fonction appelée par le déclencheur mensuel. */
function estIndicesMensuel() {
  return Est_indicesMettreAJour({ source: 'automatique' });
}

/** Déclencheur mensuel, ajouté par installer() (Setup_declencheurs_). */
function Est_declencheurs_() {
  return [{
    fonction: 'estIndicesMensuel',
    creer: function () {
      var jour = Math.min(28, Math.max(1, Math.round(Est_paramNombre_('est.indices_jour', 20))));
      return ScriptApp.newTrigger('estIndicesMensuel').timeBased().onMonthDay(jour).atHour(5).inTimezone(APP.FUSEAU).create();
    }
  }];
}

/**
 * Récupère les valeurs des index actifs. Index sans historique : depuis est.indices_depuis ;
 * index déjà chargés : les 6 derniers mois (prise en compte des valeurs provisoires devenues définitives).
 * Renvoie un bilan ; en cas d'échec, aucune valeur n'est modifiée.
 */
function Est_indicesMettreAJour(options) {
  options = options || {};
  var series = Db_lire(EST_TABLES.INDICES).filter(function (s) { return s.actif === 'oui' && s.idbank; });
  var parIdbank = {};
  series.forEach(function (s) { parIdbank[String(s.idbank)] = String(s.code); });
  var valeurs = {};
  var avecHistorique = {};
  Db_lire(EST_TABLES.INDICES_VALEURS).forEach(function (v) { valeurs[String(v.cle)] = v; avecHistorique[String(v.code)] = true; });

  var nouvelles = series.filter(function (s) { return !avecHistorique[String(s.code)]; });
  var connues = series.filter(function (s) { return avecHistorique[String(s.code)]; });
  var depuis = Est_param_('est.indices_depuis', '2015-01');
  var requetes = [];
  var decouper = function (liste, suffixe) {
    for (var i = 0; i < liste.length; i += EST_INSEE_LOT) {
      requetes.push(EST_INSEE_URL + liste.slice(i, i + EST_INSEE_LOT).map(function (s) { return s.idbank; }).join('+') + suffixe);
    }
  };
  decouper(nouvelles, '?startPeriod=' + depuis);
  decouper(connues, '?lastNObservations=6');

  var bilan = { ok: true, series: series.length, ajoutees: 0, modifiees: 0, derniers: {}, erreur: '', source: options.source || 'manuelle' };
  var observations = [];
  try {
    requetes.forEach(function (url) { observations = observations.concat(Est_inseeLire_(url)); });
  } catch (e) {
    bilan.ok = false;
    bilan.erreur = e.message;
    Est_journal_('index Insee', 'erreur', bilan.source + ' — ' + e.message + ' — dernières valeurs conservées');
    return bilan;
  }

  var maintenant = new Date();
  var aInserer = [];
  observations.forEach(function (o) {
    var code = parIdbank[o.idbank];
    if (!code || !o.mois || !isFinite(o.valeur)) return;
    var cle = code + '|' + o.mois;
    var ex = valeurs[cle];
    if (!ex) {
      aInserer.push({ cle: cle, code: code, mois: o.mois, valeur: o.valeur, qualite: o.qualite, date_jo: o.date_jo, recupere_le: maintenant });
      valeurs[cle] = aInserer[aInserer.length - 1];
    } else if (Number(ex.valeur) !== o.valeur || String(ex.qualite) !== o.qualite || (o.date_jo && String(ex.date_jo) !== o.date_jo)) {
      Db_maj(EST_TABLES.INDICES_VALEURS, cle, { valeur: o.valeur, qualite: o.qualite, date_jo: o.date_jo || ex.date_jo, recupere_le: maintenant });
      bilan.modifiees++;
    }
    if (!bilan.derniers[code] || o.mois > bilan.derniers[code]) bilan.derniers[code] = o.mois;
  });
  Db_insererPlusieurs(EST_TABLES.INDICES_VALEURS, aInserer);
  bilan.ajoutees = aInserer.length;
  Est_journal_('index Insee', 'ok', bilan.source + ' — ' + series.length + ' index, ' + bilan.ajoutees + ' valeur(s) ajoutée(s), ' +
    bilan.modifiees + ' modifiée(s)' + (bilan.derniers.BT01 ? ' — BT01 ' + Est_moisLisible_(bilan.derniers.BT01) : ''));
  return bilan;
}

/** Une requête à l'API (3 essais) → liste d'observations { idbank, mois, valeur, qualite, date_jo }. */
function Est_inseeLire_(url) {
  var derniere;
  for (var essai = 1; essai <= 3; essai++) {
    try {
      var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/xml' } });
      var code = r.getResponseCode();
      // 404 : aucune observation sur la période demandée (index récent ou arrêté) — pas une panne.
      if (code === 404) return [];
      if (code !== 200) throw new Error('réponse HTTP ' + code + ' de l\'Insee');
      return Est_parserSdmx_(r.getContentText());
    } catch (e) {
      derniere = e;
      if (essai < 3) Utilities.sleep(1500 * essai);
    }
  }
  throw new Error('API Insee indisponible (' + (derniere && derniere.message) + ')');
}

/** Lecture du XML SDMX « StructureSpecificData » de la BDM. Lève une erreur si la réponse est illisible. */
function Est_parserSdmx_(xml) {
  xml = String(xml || '');
  if (xml.indexOf('StructureSpecificData') < 0) throw new Error('réponse de l\'Insee illisible');
  var attributs = function (txt) {
    var o = {}, re = /([A-Za-z_]+)="([^"]*)"/g, m;
    while ((m = re.exec(txt))) o[m[1]] = m[2];
    return o;
  };
  var out = [];
  var reSerie = /<Series\b([^>]*)>([\s\S]*?)<\/Series>/g, s;
  while ((s = reSerie.exec(xml))) {
    var idbank = attributs(s[1]).IDBANK;
    var reObs = /<Obs\b([^>]*?)\/?>/g, o;
    while ((o = reObs.exec(s[2]))) {
      var a = attributs(o[1]);
      out.push({
        idbank: idbank, mois: a.TIME_PERIOD, valeur: Number(a.OBS_VALUE),
        qualite: a.OBS_QUAL === 'DEF' ? 'définitive' : 'provisoire', date_jo: a.DATE_JO || ''
      });
    }
  }
  return out;
}

// ——— Lecture des valeurs ———

/** Valeurs d'un index triées par mois croissant. */
function Est_valeursIndice_(code) {
  return Db_lire(EST_TABLES.INDICES_VALEURS)
    .filter(function (v) { return String(v.code) === String(code); })
    .sort(function (a, b) { return String(a.mois) < String(b.mois) ? -1 : 1; });
}

/** Valeur d'un index pour un mois AAAA-MM, ou null. */
function Est_valeurIndice_(code, mois) {
  var v = Db_trouver(EST_TABLES.INDICES_VALEURS, code + '|' + mois);
  return v ? { code: String(code), mois: String(v.mois), valeur: Number(v.valeur), qualite: String(v.qualite) } : null;
}

/** Dernière valeur publiée d'un index (au plus tard au mois `auPlusTard` s'il est donné), ou null. */
function Est_derniereValeur_(code, auPlusTard) {
  var liste = Est_valeursIndice_(code).filter(function (v) { return !auPlusTard || String(v.mois) <= auPlusTard; });
  var v = liste[liste.length - 1];
  return v ? { code: String(code), mois: String(v.mois), valeur: Number(v.valeur), qualite: String(v.qualite) } : null;
}

function Est_moisLisible_(mois) {
  var m = String(mois || '').match(/^(\d{4})-(\d{2})$/);
  return m ? m[2] + '/' + m[1] : String(mois || '');
}

// ——— Journal et alertes ———

function Est_journal_(operation, resultat, detail) {
  Db_inserer(EST_TABLES.JOURNAL, { date: new Date(), operation: operation, resultat: resultat, detail: String(detail).slice(0, 500) });
}

/** État de la dernière mise à jour des index : { date, resultat, detail, enEchec } ou null. */
function Est_etatIndices_() {
  var j = Db_lire(EST_TABLES.JOURNAL).filter(function (l) { return l.operation === 'index Insee'; });
  if (!j.length) return null;
  var d = j[j.length - 1];
  var bt01 = Est_derniereValeur_('BT01');
  var tp01 = Est_derniereValeur_('TP01');
  return {
    date: d.date, resultat: String(d.resultat), detail: String(d.detail), enEchec: d.resultat !== 'ok',
    bt01: bt01, tp01: tp01
  };
}

/** Ligne d'alerte pour l'e-mail du matin, ou '' si tout va bien. */
function Est_alerteEmail_() {
  var e = Est_etatIndices_();
  if (!e || !e.enEchec) return '';
  var date = Utilities.formatDate(date_(e.date) || new Date(e.date), APP.FUSEAU, 'dd/MM/yyyy');
  return 'Mise à jour des index Insee en échec le ' + date + ' (' + e.detail.split(' — ')[1] + '). ' +
    'Les dernières valeurs connues restent utilisées' + (e.bt01 ? ' (BT01 ' + Est_moisLisible_(e.bt01.mois) + ')' : '') + '.';
}
