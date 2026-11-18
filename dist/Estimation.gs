/* Kompa Affaires — module Estimation 1.3.1 — fichier généré par tools/build.js depuis src/Est*.js. Ne pas modifier ici. */

// ════════ EstConfig.js ════════

/**
 * Module Estimation des travaux — configuration.
 *
 * Ce fichier et les autres src/Est*.js sont assemblés dans dist/Estimation.gs, distinct de
 * dist/Code.gs (suivi des affaires) : une erreur de collage dans l'un ne casse pas l'autre.
 * Le module a son propre classeur (« Kompa Estimation — données »), relié aux affaires par le n° KA.
 * Plan : PLAN_ESTIMATION.md. Aucune valeur métier en dur : tout est paramétrable dans les tables EST_*.
 *
 * Règle de chargement : aucune référence aux variables de Code.gs au niveau global de ce fichier
 * (l'ordre de chargement des fichiers dans Apps Script n'est pas garanti) ; seulement dans des fonctions.
 */

/** Doit être égale à APP.VERSION (Code.gs) : sinon l'accueil signale une mise à jour incomplète. */
var EST_VERSION = '1.3.1';

/**
 * Tables du module, toutes dans le classeur EST. Mêmes conventions que le suivi :
 * ligne 1 = noms de colonnes, cree_le et modifie_le ajoutées automatiquement.
 * Mois (M0, mois d'indice) en texte AAAA-MM, jamais en date (décalages de fuseau).
 */
var EST_TABLES = {
  PARAMS: {
    onglet: 'Paramètres', classeur: 'EST', cle: 'cle',
    colonnes: ['cle', 'valeur', 'commentaire'], texteBrut: ['valeur']
  },
  LOTS: {
    onglet: 'Lots', classeur: 'EST', cle: 'code',
    colonnes: ['code', 'libelle', 'famille', 'indice', 'ordre', 'actif'], nombres: ['ordre'], texteBrut: ['code', 'indice']
  },
  FAMILLES: {
    onglet: 'Familles d\'ouvrage', classeur: 'EST', cle: 'code',
    colonnes: ['code', 'lot', 'libelle', 'unite', 'mots_cles', 'actif'], texteBrut: ['code', 'lot']
  },
  TYPOLOGIES: {
    onglet: 'Typologies', classeur: 'EST', cle: 'code',
    colonnes: ['code', 'libelle', 'unite_ref', 'ordre', 'actif'], nombres: ['ordre'], texteBrut: ['code']
  },
  K: {
    onglet: 'Coefficient K', classeur: 'EST', cle: 'id', prefixe: 'KF',
    colonnes: ['id', 'facteur', 'modalite', 'coefficient', 'actif', 'commentaire'], nombres: ['coefficient']
  },
  ESTIMATIONS: {
    onglet: 'Estimations', classeur: 'EST', cle: 'id', prefixe: 'ES',
    colonnes: ['id', 'id_affaire', 'phase', 'indice', 'typologie', 'nature', 'surface_sdp', 'surface_vrd', 'surfaces_autres',
      'k', 'k_detail', 'mode', 'mois_indice_bt', 'mois_indice_tp', 'projection_taux', 'date_travaux',
      'tva', 'aleas_pct', 'total_ht', 'total_ttc', 'statut', 'commentaire'],
    nombres: ['surface_sdp', 'surface_vrd', 'k', 'projection_taux', 'tva', 'aleas_pct', 'total_ht', 'total_ttc'],
    texteBrut: ['id_affaire', 'indice', 'mois_indice_bt', 'mois_indice_tp']
  },
  INDICES: {
    onglet: 'Index Insee', classeur: 'EST', cle: 'code',
    colonnes: ['code', 'idbank', 'libelle', 'famille', 'base', 'coef_raccordement', 'arretee', 'actif'],
    nombres: ['coef_raccordement'], texteBrut: ['code', 'idbank', 'base']
  },
  INDICES_VALEURS: {
    onglet: 'Valeurs des index', classeur: 'EST', cle: 'cle',
    colonnes: ['cle', 'code', 'mois', 'valeur', 'qualite', 'date_jo', 'recupere_le'],
    nombres: ['valeur'], texteBrut: ['cle', 'code', 'mois', 'date_jo']
  },
  JOURNAL: {
    onglet: 'Journal du module', classeur: 'EST', cle: 'id', prefixe: 'EJ',
    colonnes: ['id', 'date', 'operation', 'resultat', 'detail'], horodatages: ['date']
  },
  LIGNES: {
    onglet: 'Lignes d\'estimation', classeur: 'EST', cle: 'id', prefixe: 'EL',
    colonnes: ['id', 'id_estimation', 'lot', 'num_article', 'designation', 'unite', 'quantite', 'pu_m0', 'm0',
      'indice', 'indice_m0', 'indice_mois', 'indice_valeur', 'coef_actualisation', 'coef_k', 'pu_ht', 'total_ht',
      'source', 'id_source', 'fiabilite', 'commentaire'],
    nombres: ['quantite', 'pu_m0', 'indice_m0', 'indice_valeur', 'coef_actualisation', 'coef_k', 'pu_ht', 'total_ht'],
    texteBrut: ['num_article', 'm0', 'indice_mois']
  }
};

/** Initialisation du module, appelée par installer() après la création des onglets. */
function Est_installer_() {
  var ajouts = Est_initialiserReferentiels_();
  ajouts.index = Est_initialiserIndices_();
  return { version: EST_VERSION, ajouts: ajouts };
}


// ════════ EstApi.js ════════

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

/** Index Insee : séries, dernière valeur, état de la dernière mise à jour. */
function apiEstIndices() {
  return repondre_(function () {
    var derniers = {};
    Db_lire(EST_TABLES.INDICES_VALEURS).forEach(function (v) {
      var c = String(v.code);
      if (!derniers[c] || String(v.mois) > derniers[c].mois) derniers[c] = { mois: String(v.mois), valeur: Number(v.valeur), qualite: String(v.qualite) };
    });
    var etat = Est_etatIndices_();
    return {
      series: Db_lire(EST_TABLES.INDICES).map(function (s) {
        var c = Est_versClient_('INDICES', s);
        c.dernier = derniers[String(s.code)] || null;
        return c;
      }),
      etat: etat ? { date: etat.date instanceof Date ? etat.date.toISOString() : etat.date, resultat: etat.resultat, detail: etat.detail, enEchec: etat.enEchec } : null
    };
  });
}

/** Bouton « Mettre à jour les index ». */
function apiEstIndicesMettreAJour() {
  return repondre_(function () { return Est_indicesMettreAJour({ source: 'manuelle' }); });
}

/** Historique d'un index (36 derniers mois). */
function apiEstIndiceHistorique(code) {
  return repondre_(function () {
    return Est_valeursIndice_(code).slice(-36).map(function (v) {
      return { mois: String(v.mois), valeur: Number(v.valeur), qualite: String(v.qualite), date_jo: String(v.date_jo || '') };
    });
  });
}

/** Calculette d'actualisation (onglet Index Insee) : vérification des formules sur un prix. */
function apiEstActualiser(pu, m0, lot, nature, moisCible) {
  return repondre_(function () {
    var n = Number(String(pu).replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(n)) throw new Error('Prix unitaire : nombre attendu.');
    if (!Est_mois_(m0)) throw new Error('Mois M0 : format MM/AAAA attendu (ex. 03/2024).');
    return Est_actualiser_(n, m0, { lot: lot, nature: nature, moisCible: moisCible || null });
  });
}


// ════════ EstCalcul.js ════════

/**
 * Module Estimation — moteurs de calcul (étape 3). Fonctions sans effet de bord, testées.
 *
 * Actualisation (validée le 15/11/2026) :
 *   PU actualisé = PU M0 × (index du mois récent / index du mois M0)
 *   Index : celui du lot ; à défaut BT01 (neuf), BT50 (réhabilitation) ou TP01 (VRD), selon les paramètres.
 *   Le mois de l'index utilisé est toujours restitué (affichage et export).
 * Arrondis (Q8) : PU à 2 décimales, totaux non arrondis.
 */

/** Mois AAAA-MM depuis 'AAAA-MM', 'MM/AAAA', 'JJ/MM/AAAA' ou une date. '' si illisible. */
function Est_mois_(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, APP.FUSEAU, 'yyyy-MM');
  var s = String(v).trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})(-\d{1,2})?$/))) return m[1] + '-' + ('0' + m[2]).slice(-2);
  if ((m = s.match(/^(?:\d{1,2}\/)?(\d{1,2})\/(\d{4})$/))) return m[2] + '-' + ('0' + m[1]).slice(-2);
  return '';
}

/** Nombre de mois de a vers b (AAAA-MM). */
function Est_ecartMois_(a, b) {
  var pa = String(a).split('-'), pb = String(b).split('-');
  return (Number(pb[0]) - Number(pa[0])) * 12 + (Number(pb[1]) - Number(pa[1]));
}

/** Nombre en notation française (virgule décimale). */
function Est_fr_(x, decimales) {
  var v = decimales === undefined ? Number(x) : Est_arrondi_(x, decimales);
  return String(v).replace('.', ',');
}

function Est_arrondi_(x, decimales) {
  var f = Math.pow(10, decimales === undefined ? 2 : decimales);
  return Math.round((Number(x) + Number.EPSILON) * f) / f;
}

/** Nature de travaux de réhabilitation ? (« Réhabilitation lourde », « Réhabilitation légère »…) */
function Est_estRehab_(nature) {
  return /^r[ée]hab/i.test(String(nature || ''));
}

/**
 * Index à utiliser pour un lot : celui du lot s'il est connu, actif et non arrêté ;
 * sinon l'index par défaut (VRD, réhabilitation ou neuf). Renvoie { code, motif }.
 */
function Est_indicePour_(codeLot, nature) {
  var lot = codeLot ? Db_trouver(EST_TABLES.LOTS, codeLot) : null;
  var utilisable = function (code) {
    var s = code ? Db_trouver(EST_TABLES.INDICES, code) : null;
    return s && s.actif === 'oui' && s.arretee !== 'oui';
  };
  if (lot && utilisable(String(lot.indice))) return { code: String(lot.indice), motif: 'index du lot ' + lot.code };
  var vrd = lot && lot.famille === 'vrd';
  var cle = vrd ? 'est.indice_vrd' : (Est_estRehab_(nature) ? 'est.indice_rehab' : 'est.indice_neuf');
  var code = Est_param_(cle, vrd ? 'TP01' : (Est_estRehab_(nature) ? 'BT50' : 'BT01'));
  var pourquoi = !lot ? 'lot inconnu' : (lot.indice ? 'index du lot ' + lot.indice + ' indisponible' : 'lot sans index');
  return { code: code, motif: 'index par défaut (' + pourquoi + ')' };
}

/**
 * Actualise un prix. options : { lot, nature, indice (force un index), moisCible (AAAA-MM, défaut : dernier publié) }.
 * Renvoie { statut: 'ok' | 'non actualisable', pu, coef, indice, motif, m0: {mois, valeur, qualite}, recent: {...}, message }.
 * Jamais d'actualisation silencieuse : si l'index du mois M0 manque, statut « non actualisable » et PU inchangé.
 */
function Est_actualiser_(puM0, m0, options) {
  options = options || {};
  var choix = options.indice ? { code: options.indice, motif: 'index choisi' } : Est_indicePour_(options.lot, options.nature);
  var mois0 = Est_mois_(m0);
  var res = { statut: 'non actualisable', pu: Est_arrondi_(puM0), coef: 1, indice: choix.code, motif: choix.motif, m0: null, recent: null, message: '' };
  if (!mois0) { res.message = 'Mois M0 manquant ou illisible.'; return res; }
  var recent = Est_derniereValeur_(choix.code, options.moisCible ? Est_mois_(options.moisCible) : null);
  if (!recent) { res.message = 'Aucune valeur de ' + choix.code + ' : mettez à jour les index.'; return res; }
  res.recent = recent;
  if (mois0 >= recent.mois) {
    // Prix plus récent que le dernier index publié : pas d'actualisation possible ni nécessaire.
    res.statut = 'ok';
    res.m0 = { mois: mois0, valeur: null, qualite: '' };
    res.message = 'M0 (' + Est_moisLisible_(mois0) + ') postérieur ou égal au dernier ' + choix.code + ' publié (' + Est_moisLisible_(recent.mois) + ') : coefficient 1.';
    return res;
  }
  var v0 = Est_valeurIndice_(choix.code, mois0);
  if (!v0) { res.message = choix.code + ' de ' + Est_moisLisible_(mois0) + ' introuvable (antérieur à l\'historique chargé ?).'; return res; }
  res.m0 = v0;
  res.coef = recent.valeur / v0.valeur;
  res.pu = Est_arrondi_(Number(puM0) * res.coef);
  res.statut = 'ok';
  res.message = choix.code + ' ' + Est_moisLisible_(recent.mois) + ' = ' + Est_fr_(recent.valeur) + (recent.qualite === 'provisoire' ? ' (provisoire)' : '') +
    ' ; M0 ' + Est_moisLisible_(mois0) + ' = ' + Est_fr_(v0.valeur) + ' ; coef. ' + Est_fr_(res.coef, 4);
  return res;
}

/**
 * Taux annuels de projection par période (paramètre est.projection_taux, note SID « taux prévisionnels
 * d'évolution du coût des facteurs du bâtiment : projection du BT01 ») : « 2023-2025:2,70;2026-2028:5,10;suite:5,10 ».
 * Renvoie le taux annuel (%) applicable à une année.
 */
function Est_tauxProjection_(annee, spec) {
  var d = {};
  String(spec === undefined ? Est_param_('est.projection_taux', '0') : spec).split(';').forEach(function (p) {
    var i = p.indexOf(':');
    if (i > 0) d[p.slice(0, i).trim()] = Number(p.slice(i + 1).trim().replace(',', '.')) || 0;
    else if (p.trim()) d.suite = Number(p.trim().replace(',', '.')) || 0;
  });
  var taux = null;
  Object.keys(d).forEach(function (k) {
    var m = k.match(/^(\d{4})(?:-(\d{4}))?$/);
    if (m && annee >= Number(m[1]) && annee <= Number(m[2] || m[1])) taux = d[k];
  });
  return taux !== null ? taux : (d.suite || 0);
}

/**
 * Projection facultative jusqu'à la date prévisionnelle des travaux (Q7), distincte de l'actualisation.
 * Méthode simple (non composée, validée le 16/11/2026) : du mois suivant celui de l'index utilisé jusqu'au mois
 * des travaux, on additionne le taux mensuel de chaque mois (taux annuel de l'année / 12, cf. note SID :
 * 2,70 %/an = 0,225 %/mois) : coef = 1 + Σ taux mensuels.
 * `taux` : nombre (% annuel constant) ou chaîne de périodes ; par défaut le paramètre est.projection_taux.
 */
function Est_projection_(moisIndice, moisTravaux, taux) {
  var a = Est_mois_(moisIndice), b = Est_mois_(moisTravaux);
  if (!a || !b) return { coef: 1, mois: 0, detail: [] };
  var n = Math.max(0, Est_ecartMois_(a, b));
  var coef = 1, annee = Number(a.slice(0, 4)), mois = Number(a.slice(5, 7)), detail = {};
  for (var i = 0; i < n; i++) {
    mois++; if (mois > 12) { mois = 1; annee++; }
    var t = typeof taux === 'number' ? taux : Est_tauxProjection_(annee, taux);
    coef += t / 12 / 100;
    detail[annee] = detail[annee] || { annee: annee, taux: t, mois: 0 };
    detail[annee].mois++;
  }
  return { coef: coef, mois: n, detail: Object.keys(detail).map(function (k) { return detail[k]; }) };
}

/** Facteur départemental de la méthode kloc ? (« kdép », « kdep »…) */
function Est_estKdep_(facteur) {
  return /^k\s*d[ée]p/i.test(String(facteur || ''));
}

/** Ligne kdép d'un département (« 04 — Alpes-de-Haute-Provence »), ou null. */
function Est_kdepPour_(departement) {
  var dep = String(departement || '').trim().toUpperCase();
  if (/^\d$/.test(dep)) dep = '0' + dep;
  return Db_lire(EST_TABLES.K).filter(function (l) {
    return Est_estKdep_(l.facteur) && l.actif === 'oui' && String(l.modalite).split(' ')[0].toUpperCase() === dep;
  })[0] || null;
}

/**
 * Coefficient de localisation à partir des lignes choisies dans la table « Coefficient K » (une modalité par facteur).
 * Mode « kloc » (méthode validée le 16/11/2026) : kloc = kdép + kalt + kagg + klieu — kdép obligatoire
 *   (coefficient départemental « Métropole »), les autres facteurs sont des ajouts (+0,05, −0,02…).
 * Mode « produit » : K = Π ki ; mode « somme » : K = 1 + Σ (ki − 1). Renvoie { k, mode, detail }.
 */
function Est_calculerK_(idsChoisis) {
  var p = Est_param_('est.k_mode', 'kloc');
  var mode = ['kloc', 'produit', 'somme'].indexOf(p) >= 0 ? p : 'kloc';
  var lignes = Db_lire(EST_TABLES.K);
  var vus = {};
  var detail = (idsChoisis || []).map(function (id) {
    var l = lignes.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!l) throw new Error('Facteur K introuvable : ' + id);
    if (l.actif !== 'oui') throw new Error('Facteur K inactif : ' + l.facteur + ' — ' + l.modalite);
    if (vus[l.facteur]) throw new Error('Une seule modalité par facteur : « ' + l.facteur + ' » choisi deux fois.');
    vus[l.facteur] = true;
    return { id: String(l.id), facteur: String(l.facteur), modalite: String(l.modalite), coefficient: Number(l.coefficient) };
  });
  var k;
  if (mode === 'kloc') {
    var dep = detail.filter(function (d) { return Est_estKdep_(d.facteur); });
    if (!dep.length) throw new Error('kloc : choisissez le coefficient départemental (kdép).');
    k = detail.reduce(function (s, d) { return s + d.coefficient; }, 0);
  } else if (mode === 'produit') {
    if (detail.some(function (d) { return !(d.coefficient > 0); })) throw new Error('Mode produit : coefficients supérieurs à 0 attendus.');
    k = detail.reduce(function (p, d) { return p * d.coefficient; }, 1);
  } else {
    k = 1 + detail.reduce(function (s, d) { return s + (d.coefficient - 1); }, 0);
  }
  if (!(k > 0)) throw new Error('Coefficient de localisation nul ou négatif (' + Est_fr_(k, 4) + ') : vérifiez les valeurs.');
  return { k: Est_arrondi_(k, 4), mode: mode, detail: detail };
}

/** Statistiques d'une série de valeurs : n, médiane, min, max, quartiles (interpolation linéaire). */
function Est_stats_(valeurs) {
  var v = (valeurs || []).map(Number).filter(function (x) { return isFinite(x); }).sort(function (a, b) { return a - b; });
  if (!v.length) return { n: 0, mediane: null, min: null, max: null, q1: null, q3: null };
  var quantile = function (p) {
    var pos = (v.length - 1) * p, b = Math.floor(pos), r = pos - b;
    return v[b + 1] !== undefined ? v[b] + r * (v[b + 1] - v[b]) : v[b];
  };
  return { n: v.length, mediane: quantile(0.5), min: v[0], max: v[v.length - 1], q1: quantile(0.25), q3: quantile(0.75) };
}

/** Pourcentage d'aléas et imprévus d'une phase (paramètre est.aleas), 0 si la phase n'y figure pas. */
function Est_aleasPct_(phase) {
  var d = Est_paramDico_('est.aleas');
  var v = Number(String(d[phase] || '0').replace(',', '.'));
  return isFinite(v) ? v : 0;
}

/** Taux de TVA d'un département (paramètre est.tva_zones), sinon taux par défaut. */
function Est_tvaPour_(departement) {
  var zones = Est_paramDico_('est.tva_zones');
  var dep = String(departement || '').toUpperCase();
  var v = zones[dep];
  return v !== undefined ? Number(String(v).replace(',', '.')) : Est_paramNombre_('est.tva_defaut', 20);
}

/** Totaux d'une estimation : HT des lignes, aléas, HT avec aléas, TVA, TTC (non arrondis, Q8). */
function Est_totaux_(lignes, aleasPct, tvaPct) {
  var ht = (lignes || []).reduce(function (s, l) { return s + (Number(l.total_ht) || 0); }, 0);
  var aleas = ht * (Number(aleasPct) || 0) / 100;
  var htAleas = ht + aleas;
  var tva = htAleas * (Number(tvaPct) || 0) / 100;
  return { ht: ht, aleas: aleas, htAleas: htAleas, tva: tva, ttc: htAleas + tva };
}


// ════════ EstIndices.js ════════

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


// ════════ EstReferentiels.js ════════

/**
 * Module Estimation — référentiels modifiables à l'écran (étape 1).
 *
 * Valeurs initiales validées le 15/11/2026 (PLAN_ESTIMATION.md § 5.3), ajoutées par installer()
 * seulement si le code est absent : vos modifications ne sont jamais écrasées.
 */

var EST_PARAMS_DEFAUT = [
  ['est.phases', 'Programme;APS;APD;DCE', 'Phases d\'une estimation, dans l\'ordre'],
  ['est.natures', 'Neuf;Réhabilitation lourde;Réhabilitation légère', 'Natures de travaux'],
  ['est.aleas', 'Programme:15;APS:10;APD:7;DCE:5', 'Aléas et imprévus par phase, en % du total HT (ligne séparée dans l\'estimation)'],
  ['est.tva_defaut', '20', 'Taux de TVA par défaut (%), modifiable par estimation'],
  ['est.tva_zones', '2A:10;2B:10', 'Taux de TVA par département (département:taux). Corse : taux propre aux travaux immobiliers, à confirmer'],
  ['est.k_mode', 'kloc', 'Calcul du coefficient de localisation : « kloc » = kdép + kalt + kagg + klieu (méthode validée) ; autres : « produit » (Π ki), « somme » (1 + Σ (ki − 1))'],
  ['est.seuil_anonymat', '3', 'Nombre minimal de marchés pour afficher un ratio'],
  ['est.indice_neuf', 'BT01', 'Index par défaut d\'un lot de bâtiment sans index, en neuf'],
  ['est.indice_rehab', 'BT50', 'Index par défaut d\'un lot de bâtiment sans index, en réhabilitation'],
  ['est.indice_vrd', 'TP01', 'Index par défaut d\'un lot VRD sans index'],
  ['est.projection_taux', '2023-2025:2,70;2026-2028:5,10;suite:5,10', 'Taux prévisionnels d\'évolution du BT01 (% par an, par période) pour la projection jusqu\'à la date des travaux — note SID « projection du BT01 », édition juin 2023 ; « suite » = au-delà'],
  ['est.indices_jour', '20', 'Jour du mois de la mise à jour automatique des index Insee (parution au JO vers le 15)'],
  ['est.indices_depuis', '2015-01', 'Premier mois chargé lors de la première récupération d\'un index'],
  ['est.fiabilite', 'A:Prix de marché de moins de 3 ans, même région;B:Prix de marché plus ancien ou d\'une autre région;C:Ratio sur moins de 5 marchés ou saisie libre', 'Échelle de fiabilité des prix']
];

/** Lots et index associés (validés le 15/11/2026, § 5.3 Q4 bis). [code, libellé, famille, index, ordre] */
var EST_LOTS_DEFAUT = [
  ['TER', 'Terrassements', 'batiment', 'BT02', 10],
  ['GO', 'Gros œuvre', 'batiment', 'BT06', 20],
  ['CHARP', 'Charpente', 'batiment', 'BT16b', 30],
  ['COUV', 'Couverture', 'batiment', 'BT32', 40],
  ['ETAN', 'Étanchéité', 'batiment', 'BT53', 50],
  ['FAC', 'Façades, ravalement', 'batiment', 'BT52', 60],
  ['MEN-EXT', 'Menuiseries extérieures', 'batiment', 'BT43', 70],
  ['SERR', 'Serrurerie, métallerie', 'batiment', 'BT42', 80],
  ['PLAT', 'Plâtrerie, cloisons, faux plafonds', 'batiment', 'BT08', 90],
  ['MEN-INT', 'Menuiseries intérieures', 'batiment', 'BT18a', 100],
  ['REV-SOL', 'Revêtements de sols', 'batiment', 'BT09', 110],
  ['PEINT', 'Peinture, revêtements muraux', 'batiment', 'BT46', 120],
  ['PLB', 'Plomberie sanitaire', 'batiment', 'BT38', 130],
  ['CVC', 'Chauffage, ventilation, climatisation', 'batiment', 'BT40', 140],
  ['ELE', 'Électricité', 'batiment', 'BT47', 150],
  ['ASC', 'Ascenseurs', 'batiment', 'BT48', 160],
  ['VRD', 'Voirie et réseaux divers', 'vrd', 'TP08', 170]
];

/**
 * Coefficient de localisation kloc = kdép + kalt + kagg + klieu (méthode fournie le 16/11/2026).
 * kdép (« Métropole », par département) : tableau en annexe de la méthode, fourni le 16/11/2026 (96 départements).
 * [facteur, modalité, valeur]
 */
var EST_K_DEFAUT = [
  // kdép « Métropole » par département (tableau fourni le 16/11/2026)
  ['kdép', '01 — Ain', 1.06],
  ['kdép', '02 — Aisne', 1.03],
  ['kdép', '03 — Allier', 1.01],
  ['kdép', '04 — Alpes-de-Haute-Provence', 1.04],
  ['kdép', '05 — Hautes-Alpes', 1.03],
  ['kdép', '06 — Alpes-Maritimes', 1.04],
  ['kdép', '07 — Ardèche', 1.04],
  ['kdép', '08 — Ardennes', 1.04],
  ['kdép', '09 — Ariège', 1.01],
  ['kdép', '10 — Aube', 1.03],
  ['kdép', '11 — Aude', 1.01],
  ['kdép', '12 — Aveyron', 1.03],
  ['kdép', '13 — Bouches-du-Rhône', 1.06],
  ['kdép', '14 — Calvados', 1.04],
  ['kdép', '15 — Cantal', 1.00],
  ['kdép', '16 — Charente', 1.01],
  ['kdép', '17 — Charente-Maritime', 1.02],
  ['kdép', '18 — Cher', 1.00],
  ['kdép', '19 — Corrèze', 1.03],
  ['kdép', '2A — Corse-du-Sud', 1.03],
  ['kdép', '2B — Haute-Corse', 1.00],
  ['kdép', '21 — Côte-d\'Or', 1.00],
  ['kdép', '22 — Côtes-d\'Armor', 1.00],
  ['kdép', '23 — Creuse', 1.04],
  ['kdép', '24 — Dordogne', 1.04],
  ['kdép', '25 — Doubs', 1.04],
  ['kdép', '26 — Drôme', 1.05],
  ['kdép', '27 — Eure', 1.06],
  ['kdép', '28 — Eure-et-Loir', 1.08],
  ['kdép', '29 — Finistère', 1.08],
  ['kdép', '30 — Gard', 1.04],
  ['kdép', '31 — Haute-Garonne', 1.04],
  ['kdép', '32 — Gers', 1.00],
  ['kdép', '33 — Gironde', 1.04],
  ['kdép', '34 — Hérault', 1.03],
  ['kdép', '35 — Ille-et-Vilaine', 1.04],
  ['kdép', '36 — Indre', 1.02],
  ['kdép', '37 — Indre-et-Loire', 1.04],
  ['kdép', '38 — Isère', 1.06],
  ['kdép', '39 — Jura', 1.02],
  ['kdép', '40 — Landes', 1.01],
  ['kdép', '41 — Loir-et-Cher', 1.03],
  ['kdép', '42 — Loire', 1.06],
  ['kdép', '43 — Haute-Loire', 1.01],
  ['kdép', '44 — Loire-Atlantique', 1.04],
  ['kdép', '45 — Loiret', 1.04],
  ['kdép', '46 — Lot', 1.01],
  ['kdép', '47 — Lot-et-Garonne', 1.01],
  ['kdép', '48 — Lozère', 1.00],
  ['kdép', '49 — Maine-et-Loire', 1.03],
  ['kdép', '50 — Manche', 1.01],
  ['kdép', '51 — Marne', 1.03],
  ['kdép', '52 — Haute-Marne', 1.02],
  ['kdép', '53 — Mayenne', 1.03],
  ['kdép', '54 — Meurthe-et-Moselle', 1.07],
  ['kdép', '55 — Meuse', 1.04],
  ['kdép', '56 — Morbihan', 1.04],
  ['kdép', '57 — Moselle', 1.06],
  ['kdép', '58 — Nièvre', 1.00],
  ['kdép', '59 — Nord', 1.07],
  ['kdép', '60 — Oise', 1.07],
  ['kdép', '61 — Orne', 1.02],
  ['kdép', '62 — Pas-de-Calais', 1.06],
  ['kdép', '63 — Puy-de-Dôme', 1.02],
  ['kdép', '64 — Pyrénées-Atlantiques', 1.02],
  ['kdép', '65 — Hautes-Pyrénées', 1.01],
  ['kdép', '66 — Pyrénées-Orientales', 1.01],
  ['kdép', '67 — Bas-Rhin', 1.02],
  ['kdép', '68 — Haut-Rhin', 1.03],
  ['kdép', '69 — Rhône', 1.04],
  ['kdép', '70 — Haute-Saône', 1.01],
  ['kdép', '71 — Saône-et-Loire', 1.04],
  ['kdép', '72 — Sarthe', 1.04],
  ['kdép', '73 — Savoie', 1.06],
  ['kdép', '74 — Haute-Savoie', 1.04],
  ['kdép', '75 — Paris', 1.12],
  ['kdép', '76 — Seine-Maritime', 1.04],
  ['kdép', '77 — Seine-et-Marne', 1.08],
  ['kdép', '78 — Yvelines', 1.08],
  ['kdép', '79 — Deux-Sèvres', 1.01],
  ['kdép', '80 — Somme', 1.05],
  ['kdép', '81 — Tarn', 1.02],
  ['kdép', '82 — Tarn-et-Garonne', 1.01],
  ['kdép', '83 — Var', 1.04],
  ['kdép', '84 — Vaucluse', 1.03],
  ['kdép', '85 — Vendée', 1.01],
  ['kdép', '86 — Vienne', 1.02],
  ['kdép', '87 — Haute-Vienne', 1.04],
  ['kdép', '88 — Vosges', 1.05],
  ['kdép', '89 — Yonne', 1.05],
  ['kdép', '90 — Territoire de Belfort', 1.02],
  ['kdép', '91 — Essonne', 1.08],
  ['kdép', '92 — Hauts-de-Seine', 1.12],
  ['kdép', '93 — Seine-Saint-Denis', 1.12],
  ['kdép', '94 — Val-de-Marne', 1.12],
  ['kdép', '95 — Val-d\'Oise', 1.08],
  ['kalt', 'Altitude ≤ 800 m NGF', 0],
  ['kalt', 'Altitude > 800 m NGF', 0.05],
  ['kagg', 'Moins de 25 000 habitants', 0],
  ['kagg', '25 000 à 100 000 habitants (bas)', 0.01],
  ['kagg', '25 000 à 100 000 habitants (haut)', 0.02],
  ['kagg', '100 000 habitants et plus', 0.03],
  ['kagg', 'Plus de 500 000 habitants, Paris et sa région', 0.04],
  ['klieu', 'Très favorables (−0,05)', -0.05],
  ['klieu', 'Très favorables (−0,04)', -0.04],
  ['klieu', 'Très favorables (−0,03)', -0.03],
  ['klieu', 'Favorables (−0,02)', -0.02],
  ['klieu', 'Favorables (−0,01)', -0.01],
  ['klieu', 'Normales', 0],
  ['klieu', 'Défavorables (+0,01)', 0.01],
  ['klieu', 'Défavorables (+0,02)', 0.02],
  ['klieu', 'Très défavorables (+0,03)', 0.03],
  ['klieu', 'Très défavorables (+0,04)', 0.04],
  ['klieu', 'Très défavorables (+0,05)', 0.05]
];

/** Typologies (§ 5.3 Q2). [code, libellé, unité de référence, ordre] */
var EST_TYPOLOGIES_DEFAUT = [
  ['ECOLE', 'École, groupe scolaire', 'm2_sdp', 10],
  ['REST', 'Restauration scolaire, cuisine centrale', 'm2_sdp', 20],
  ['CRECHE', 'Crèche', 'm2_sdp', 30],
  ['SPORT', 'Gymnase, équipement sportif', 'm2_sdp', 40],
  ['BUREAU', 'Bureaux, bâtiment administratif', 'm2_sdp', 50],
  ['LOGT', 'Logements', 'm2_sdp', 60],
  ['CULT', 'Équipement culturel', 'm2_sdp', 70],
  ['ATELIER', 'Atelier, local technique', 'm2_sdp', 80],
  ['MIL', 'Bâtiment militaire (hébergement, ateliers)', 'm2_sdp', 90],
  ['AMEN', 'Aménagements extérieurs, VRD', 'm2_amenage', 100]
];

/** Ajoute les paramètres, lots et typologies absents. Renvoie le nombre de lignes ajoutées par table. */
function Est_initialiserReferentiels_() {
  var ajouter = function (table, defauts, enLigne) {
    var existants = {};
    Db_lire(table).forEach(function (l) { existants[String(l[table.cle])] = true; });
    var nouveaux = defauts.filter(function (d) { return !existants[d[0]]; }).map(enLigne);
    Db_insererPlusieurs(table, nouveaux);
    return nouveaux.length;
  };
  return {
    parametres: ajouter(EST_TABLES.PARAMS, EST_PARAMS_DEFAUT, function (d) { return { cle: d[0], valeur: d[1], commentaire: d[2] }; }),
    lots: ajouter(EST_TABLES.LOTS, EST_LOTS_DEFAUT, function (d) {
      return { code: d[0], libelle: d[1], famille: d[2], indice: d[3], ordre: d[4], actif: 'oui' };
    }),
    typologies: ajouter(EST_TABLES.TYPOLOGIES, EST_TYPOLOGIES_DEFAUT, function (d) {
      return { code: d[0], libelle: d[1], unite_ref: d[2], ordre: d[3], actif: 'oui' };
    }),
    k: Est_initialiserK_()
  };
}

/**
 * Valeurs kalt, kagg, klieu de la méthode kloc, ajoutées si la modalité est absente (comparaison facteur + modalité).
 * Migration : installation antérieure restée sur les réglages d'origine (mode « produit », projection « 0 ») → méthode validée.
 */
function Est_initialiserK_() {
  var existants = {};
  var lignes = Db_lire(EST_TABLES.K);
  lignes.forEach(function (l) { existants[l.facteur + '|' + l.modalite] = true; });
  var nouveaux = EST_K_DEFAUT.filter(function (d) { return !existants[d[0] + '|' + d[1]]; }).map(function (d) {
    return { facteur: d[0], modalite: d[1], coefficient: d[2], actif: 'oui', commentaire: 'Méthode kloc' };
  });
  if (String(Est_param_('est.k_mode', '')) === 'produit' && !lignes.length) Db_maj(EST_TABLES.PARAMS, 'est.k_mode', { valeur: 'kloc' });
  if (String(Est_param_('est.projection_taux', '')) === '0') Db_maj(EST_TABLES.PARAMS, 'est.projection_taux', { valeur: EST_PARAMS_DEFAUT.filter(function (p) { return p[0] === 'est.projection_taux'; })[0][1] });
  Db_insererPlusieurs(EST_TABLES.K, nouveaux);
  return nouveaux.length;
}

// ——— Paramètres du module ———

function Est_param_(cle, defaut) {
  var l = Db_trouver(EST_TABLES.PARAMS, cle);
  var v = l ? String(l.valeur).trim() : '';
  return v === '' ? (defaut === undefined ? '' : defaut) : v;
}

function Est_paramNombre_(cle, defaut) {
  var n = Number(String(Est_param_(cle, '')).replace(',', '.'));
  return isFinite(n) && String(Est_param_(cle, '')) !== '' ? n : defaut;
}

function Est_paramListe_(cle) {
  return String(Est_param_(cle, '')).split(';').map(function (x) { return x.trim(); }).filter(String);
}

/** « clé:valeur;clé:valeur » → { clé: valeur } */
function Est_paramDico_(cle) {
  var d = {};
  Est_paramListe_(cle).forEach(function (paire) {
    var i = paire.indexOf(':');
    if (i > 0) d[paire.slice(0, i).trim()] = paire.slice(i + 1).trim();
  });
  return d;
}

// ——— Édition des référentiels depuis l'écran ———

/**
 * Description des référentiels pour l'écran : titre, aide, colonnes modifiables.
 * Types : texte, nombre, code (majuscules), oui_non, choix:a|b, liste:<clé de paramètre>.
 */
var EST_REFERENTIELS = {
  LOTS: {
    titre: 'Lots et index', aide: 'L\'index du lot sert à l\'actualisation ; à défaut, BT01 (neuf), BT50 (réhabilitation) ou TP01 (VRD), selon les paramètres.',
    colonnes: [['code', 'Code', 'code'], ['libelle', 'Libellé', 'texte'], ['famille', 'Famille', 'choix:batiment|vrd'],
      ['indice', 'Index Insee', 'code'], ['ordre', 'Ordre', 'nombre'], ['actif', 'Actif', 'oui_non']]
  },
  TYPOLOGIES: {
    titre: 'Typologies de bâtiment', aide: 'Unité de référence des ratios : m² de surface de plancher (SDP) ou m² aménagés (VRD).',
    colonnes: [['code', 'Code', 'code'], ['libelle', 'Libellé', 'texte'], ['unite_ref', 'Unité de référence', 'choix:m2_sdp|m2_amenage'],
      ['ordre', 'Ordre', 'nombre'], ['actif', 'Active', 'oui_non']]
  },
  FAMILLES: {
    titre: 'Familles d\'ouvrage', aide: 'Servent au classement des lignes de DPGF importées (étape 4). Mots-clés séparés par « ; ».',
    colonnes: [['code', 'Code', 'code'], ['lot', 'Lot', 'code'], ['libelle', 'Libellé', 'texte'], ['unite', 'Unité', 'texte'],
      ['mots_cles', 'Mots-clés', 'texte'], ['actif', 'Active', 'oui_non']]
  },
  K: {
    titre: 'Coefficient de localisation (kloc)', aide: 'kloc = kdép + kalt + kagg + klieu. Une modalité par facteur ; kdép (coefficient départemental « Métropole ») est obligatoire : saisir une ligne par département avec le facteur « kdép ». kalt, kagg et klieu sont des ajouts (0,05 = +0,05).',
    colonnes: [['facteur', 'Facteur', 'texte'], ['modalite', 'Modalité', 'texte'], ['coefficient', 'Coefficient', 'nombre'],
      ['actif', 'Actif', 'oui_non'], ['commentaire', 'Commentaire', 'texte']]
  },
  PARAMS: {
    titre: 'Paramètres du module', aide: 'Listes : valeurs séparées par « ; ». Les clés ne se créent pas à l\'écran.',
    colonnes: [['cle', 'Clé', 'lecture'], ['valeur', 'Valeur', 'texte'], ['commentaire', 'Commentaire', 'lecture']],
    sansAjout: true
  }
};

function Est_referentiel_(nom) {
  var def = EST_REFERENTIELS[nom];
  if (!def || !EST_TABLES[nom]) throw new Error('Référentiel inconnu : ' + nom);
  return def;
}

/** Contrôle et normalise une saisie de référentiel. Lève une erreur lisible. */
function Est_validerRef_(nom, champs, creation) {
  var def = Est_referentiel_(nom);
  var table = EST_TABLES[nom];
  var out = {};
  def.colonnes.forEach(function (c) {
    var col = c[0], type = c[2];
    if (!(col in champs) || type === 'lecture') return;
    var v = champs[col] === null || champs[col] === undefined ? '' : String(champs[col]).trim();
    if (type === 'code') {
      v = v.toUpperCase().replace(/\s+/g, '');
      if (col === 'indice') v = v.replace(/B$/, 'b').replace(/A$/, 'a'); // BT16b, BT18a : casse de l'Insee
      if (v && !/^[A-Z0-9][A-Za-z0-9-]{0,19}$/.test(v)) throw new Error(c[1] + ' : lettres, chiffres et tirets seulement.');
    } else if (type === 'nombre') {
      if (v === '') { out[col] = ''; return; }
      var n = Number(v.replace(/\s/g, '').replace(',', '.'));
      if (!isFinite(n)) throw new Error(c[1] + ' : nombre attendu.');
      if (col === 'coefficient' && !(n > -1 && n <= 3)) throw new Error('Coefficient : valeur entre −1 et 3 attendue (ex. 0,98 pour kdép, +0,05 pour kalt).');
      out[col] = n; return;
    } else if (type === 'oui_non') {
      v = /^(non|n|0|false)$/i.test(v) ? 'non' : 'oui';
    } else if (type.indexOf('choix:') === 0) {
      var choix = type.slice(6).split('|');
      if (v && choix.indexOf(v) < 0) throw new Error(c[1] + ' : valeur attendue parmi ' + choix.join(', ') + '.');
    }
    out[col] = v;
  });
  if (creation && table.cle !== 'id' && !out[table.cle]) throw new Error('Le code est obligatoire.');
  if (nom === 'FAMILLES' && out.lot && !Db_trouver(EST_TABLES.LOTS, out.lot)) throw new Error('Lot inconnu : ' + out.lot + '.');
  if (nom === 'LOTS' && out.indice && !Db_trouver(EST_TABLES.INDICES, out.indice)) {
    throw new Error('Index inconnu : ' + out.indice + ' (liste dans l\'onglet Index Insee).');
  }
  return out;
}

function Est_refLister_(nom) {
  Est_referentiel_(nom);
  var lignes = Db_lire(EST_TABLES[nom]);
  if (lignes.length && 'ordre' in lignes[0]) lignes.sort(function (a, b) { return (Number(a.ordre) || 0) - (Number(b.ordre) || 0); });
  return lignes;
}

function Est_refAjouter_(nom, champs) {
  var def = Est_referentiel_(nom);
  if (def.sansAjout) throw new Error('Ajout impossible dans ce référentiel.');
  var table = EST_TABLES[nom];
  var ligne = Est_validerRef_(nom, champs, true);
  if (table.cle !== 'id' && Db_trouver(table, ligne[table.cle])) throw new Error('Le code ' + ligne[table.cle] + ' existe déjà.');
  if (!ligne.actif && def.colonnes.some(function (c) { return c[0] === 'actif'; })) ligne.actif = 'oui';
  return Db_inserer(table, ligne);
}

function Est_refModifier_(nom, cle, champs) {
  var table = EST_TABLES[nom];
  Est_referentiel_(nom);
  if (!Db_trouver(table, cle)) throw new Error('Ligne introuvable : ' + cle);
  var maj = Est_validerRef_(nom, champs, false);
  delete maj[table.cle]; // la clé ne change pas : désactiver et recréer
  return Db_maj(table, cle, maj);
}


// ════════ EstSeries.js ════════

/**
 * Module Estimation — séries Insee des index BT (bâtiment) et TP (travaux publics), base 2010.
 * Identifiants (idbank) relevés les 15 et 16/11/2026 sur l'API BDM de l'Insee (liste du SID fournie le 16/11) :
 *   https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/{idbank}
 * Chargées dans l'onglet « Index Insee » par installer() ; ajout d'un autre index : une ligne dans cet onglet.
 * [code, idbank, libellé, famille, série arrêtée]
 */
var EST_SERIES_INSEE = [
  ["BT01", "001710986", "Tous corps d'état", "BT", "non"],
  ["BT02", "001710950", "Terrassements", "BT", "non"],
  ["BT03", "001710951", "Maçonnerie et canalisations en béton (sauf ossature, béton armé, carrelage, revêtements et plâtrerie)", "BT", "non"],
  ["BT06", "001710952", "Ossature, ouvrages en béton armé", "BT", "non"],
  ["BT07", "001710953", "Ossature et charpentes métalliques", "BT", "non"],
  ["BT08", "001710954", "Plâtre et préfabriqués", "BT", "non"],
  ["BT09", "001710955", "Carrelage et revêtement céramique", "BT", "non"],
  ["BT10", "001710956", "Revêtements en plastiques", "BT", "non"],
  ["BT11", "001710957", "Revêtements en textiles", "BT", "non"],
  ["BT12", "001710958", "Revêtements en textiles naturels", "BT", "oui"],
  ["BT14", "001710959", "Revêtements en plaque de pierre naturelle sciée et produits assimilés", "BT", "non"],
  ["BT16b", "001710960", "Charpente bois", "BT", "non"],
  ["BT18a", "001710962", "Menuiserie intérieure en bois", "BT", "non"],
  ["BT19b", "001710963", "Menuiserie extérieure en bois", "BT", "non"],
  ["BT26", "001710965", "Fermeture de baies en plastique y compris fenêtre PVC", "BT", "non"],
  ["BT27", "001710966", "Fermeture de baies en aluminium", "BT", "non"],
  ["BT28", "001710967", "Fermeture de baies en métal ferreux", "BT", "non"],
  ["BT30", "001710968", "Couverture en ardoises de schiste", "BT", "non"],
  ["BT32", "001710969", "Couverture en tuiles en terre cuite", "BT", "non"],
  ["BT33", "001710970", "Couverture en tuiles en béton", "BT", "non"],
  ["BT34", "001710971", "Couverture en zinc et en métal (sauf cuivre)", "BT", "non"],
  ["BT35", "001710940", "Couverture en bardeaux bitumés", "BT", "non"],
  ["BT38", "001710972", "Plomberie sanitaire (y compris appareils)", "BT", "non"],
  ["BT40", "001710973", "Chauffage central (à l'exclusion du chauffage électrique)", "BT", "non"],
  ["BT41", "001710974", "Ventilation et conditionnement d'air", "BT", "non"],
  ["BT42", "001710975", "Menuiserie en acier et serrurerie", "BT", "non"],
  ["BT43", "001710976", "Menuiserie en alliage d'aluminium", "BT", "non"],
  ["BT45", "001710977", "Vitrerie - Miroiterie", "BT", "non"],
  ["BT46", "001710978", "Peinture, tenture, revêtements muraux", "BT", "non"],
  ["BT47", "001710979", "Électricité", "BT", "non"],
  ["BT48", "001710980", "Ascenseurs", "BT", "non"],
  ["BT49", "001710981", "Couverture et bardage en tôles d'acier nervurés avec revêtement étanchéité", "BT", "non"],
  ["BT50", "001710982", "Rénovation - Entretien tous corps d'état", "BT", "non"],
  ["BT51", "001710983", "Menuiseries PVC", "BT", "non"],
  ["BT52", "001710984", "Imperméabilité de façades", "BT", "non"],
  ["BT53", "001710985", "Étanchéité", "BT", "non"],
  ["BT54", "001711942", "Ossature bois", "BT", "non"],
  ["BT55", "011818304", "Isolation thermique par l'extérieur - Enduit sur isolant", "BT", "non"],
  ["TP01", "001711007", "Index général tous travaux", "TP", "non"],
  ["TP02", "001710987", "Travaux de génie civil et d'ouvrages d'art neufs ou rénovation", "TP", "non"],
  ["TP03a", "001710988", "Grands terrassements", "TP", "non"],
  ["TP03b", "001710989", "Travaux à l'explosif", "TP", "non"],
  ["TP04", "001710990", "Fondations et travaux géotechniques", "TP", "non"],
  ["TP05a", "001710991", "Travaux en souterrains traditionnels", "TP", "non"],
  ["TP05b", "001710992", "Travaux en souterrains avec tunnelier", "TP", "non"],
  ["TP06a", "001710993", "Grands dragages maritimes", "TP", "non"],
  ["TP06b", "001710994", "Dragages fluviaux et petits dragages maritimes", "TP", "non"],
  ["TP07b", "001710995", "Travaux de génie civil, béton et acier pour ouvrages maritimes et fluviaux", "TP", "non"],
  ["TP08", "001710996", "Travaux d'aménagement et entretien de voirie en zones rurale et urbaine", "TP", "non"],
  ["TP09", "001710997", "Fabrication et mise en œuvre d'enrobés", "TP", "non"],
  ["TP10a", "001710998", "Canalisations, assainissement et adduction d'eau avec fourniture de tuyaux", "TP", "oui"],
  ["TP10b", "001710999", "Canalisations sans fourniture de tuyaux", "TP", "non"],
  ["TP10c", "001711000", "Réhabilitation de canalisations non visitables", "TP", "non"],
  ["TP10d", "010605983", "Réseaux de chauffage et de froid avec fourniture de tuyaux", "TP", "non"],
  ["TP10e", "010777525", "Canalisations, assainissement et adduction d'eau avec fourniture de tuyaux en fonte majoritaire", "TP", "non"],
  ["TP10f", "010777582", "Canalisations, assainissement et adduction d'eau avec fourniture de tuyaux multi-matériaux", "TP", "non"],
  ["TP11", "001711001", "Canalisations grandes distances de transport / transfert avec fourniture de tuyaux", "TP", "non"],
  ["TP12a", "001711002", "Réseaux d'énergie et de communication hors fibre optique", "TP", "non"],
  ["TP12b", "001711003", "Éclairage public - Travaux d'installation", "TP", "non"],
  ["TP12c", "001711004", "Éclairage public - Travaux de maintenance", "TP", "non"],
  ["TP12d", "001796841", "Réseaux de communication en fibre optique", "TP", "non"],
  ["TP13", "001711005", "Charpentes et ouvrages d'art métalliques", "TP", "oui"],
  ["TP13a", "010777583", "Charpentes et ouvrages d'art métalliques", "TP", "non"],
  ["TP13b", "010777526", "Charpentes et ouvrages d'art métalliques hors fourniture des aciers", "TP", "non"],
  ["TP14", "001711006", "Travaux immergés par scaphandriers", "TP", "oui"],
  ["ING", "001711010", "Ingénierie (index divers de la construction)", "DIV", "non"]
];
