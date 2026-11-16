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
