/**
 * Module Estimation — bibliothèque de ratios (étape 4, version simplifiée décidée le 19/11/2026).
 *
 * Les DPGF reçues ne donnent qu'un montant par article (pas de quantités) : on importe les postes
 * (macro-lots) d'un marché attribué, chacun rattaché à un lot, avec la surface de référence de l'opération.
 * Chaque lot donne une observation : ratio = montant HT / surface (€ HT/m²).
 * Aucune donnée d'entreprise, de site ni d'opération n'est saisie ni conservée.
 */

/** Texte comparable : minuscules, sans accents ni ligatures. */
function Est_norm_(s) {
  return String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Mots-clés de classement par lot (paramètre est.classement_lots) : [{ lot, mot }]. */
function Est_motsLots_() {
  var out = [];
  Est_paramListe_('est.classement_lots').forEach(function (paire) {
    var i = paire.indexOf(':');
    if (i <= 0) return;
    var lot = paire.slice(0, i).trim().toUpperCase();
    paire.slice(i + 1).split(',').forEach(function (m) { if (m.trim()) out.push({ lot: lot, mot: Est_norm_(m) }); });
  });
  return out;
}

/** Lot le plus probable pour un libellé de poste : mot-clé le plus long trouvé en début de mot ; '' sinon. */
function Est_devinerLot_(libelle, mots, lotsActifs) {
  var t = ' ' + Est_norm_(libelle) + ' ';
  var meilleur = null;
  (mots || Est_motsLots_()).forEach(function (m) {
    if (lotsActifs && !lotsActifs[m.lot]) return;
    if (t.indexOf(' ' + m.mot) >= 0 && (!meilleur || m.mot.length > meilleur.mot.length)) meilleur = m;
  });
  return meilleur ? meilleur.lot : '';
}

/** Montant lu dans une cellule (« 66 261,00 € », « 1 206 153.80 ») ; null si ce n'en est pas un. */
function Est_montant_(cellule) {
  var s = String(cellule || '').replace(/[\s  €]/g, '');
  if (!s || /%/.test(s) || !/^-?[\d.,]+$/.test(s)) return null;
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  var n = Number(s);
  return isFinite(n) ? n : null;
}

/**
 * Lignes collées (copie d'un tableur ou texte « poste ; montant ») → postes { libelle, montant, lot }.
 * Une cellule égale à un code de lot fixe le lot ; sinon il est deviné par mots-clés.
 * Montant = plus grand nombre de la ligne (les n° de lot, % et ratios sont plus petits).
 * Les lignes de total, de TVA et sans montant sont écartées et comptées.
 */
function Est_analyserPostes_(texte) {
  var lots = {};
  Db_lire(EST_TABLES.LOTS).forEach(function (l) { if (l.actif === 'oui') lots[String(l.code).toUpperCase()] = l; });
  var mots = Est_motsLots_();
  var postes = [], ecartees = [];
  String(texte || '').split(/\r?\n/).forEach(function (ligne, i) {
    if (!ligne.trim()) return;
    var cellules = ligne.split(/\t|;/).map(function (c) { return c.trim(); }).filter(String);
    var montants = [], textes = [], lotFixe = '';
    cellules.forEach(function (c) {
      var n = Est_montant_(c);
      if (n !== null) { montants.push(n); return; }
      if (lots[c.toUpperCase()]) { lotFixe = c.toUpperCase(); return; }
      if (/[a-zà-ÿ]/i.test(c) && !/%/.test(c)) textes.push(c);
    });
    var libelle = textes[0] || '';
    if (/^(sous[- ]?)?total|^tva\b|^montant total|\bttc\b/i.test(Est_norm_(libelle))) { ecartees.push({ ligne: i + 1, texte: ligne, motif: 'ligne de total' }); return; }
    var montant = montants.length ? Math.max.apply(null, montants) : null;
    if (!libelle || !(montant > 0)) { ecartees.push({ ligne: i + 1, texte: ligne, motif: libelle ? 'pas de montant' : 'pas de libellé' }); return; }
    postes.push({ libelle: libelle.slice(0, 120), montant: Est_arrondi_(montant), lot: lotFixe || Est_devinerLot_(libelle, mots, lots) });
  });
  return { postes: postes, ecartees: ecartees };
}

/** Contrôle les données d'un marché (import) ; lève une erreur lisible. */
function Est_validerMarche_(d) {
  var typo = Db_trouver(EST_TABLES.TYPOLOGIES, d.typologie);
  if (!typo || typo.actif !== 'oui') throw new Error('Typologie inconnue ou inactive.');
  if (Est_paramListe_('est.natures').indexOf(d.nature) < 0) throw new Error('Nature attendue parmi : ' + Est_paramListe_('est.natures').join(', ') + '.');
  var dep = String(d.departement || '').trim().toUpperCase();
  if (/^\d$/.test(dep)) dep = '0' + dep;
  if (!/^(\d{2,3}|2A|2B)$/.test(dep)) throw new Error('Département : 2 ou 3 caractères attendus (ex. 04, 2B, 974).');
  var m0 = Est_mois_(d.m0);
  if (!m0) throw new Error('Mois M0 : format MM/AAAA attendu (mois de remise des offres).');
  var surface = Number(String(d.surface).replace(/\s/g, '').replace(',', '.'));
  if (!(surface > 0)) throw new Error('Surface de référence : nombre de m² supérieur à 0 attendu.');
  return { typologie: typo.code, nature: d.nature, departement: dep, m0: m0, surface: surface };
}

/**
 * Enregistre un import : les postes sont additionnés par lot (une observation par lot).
 * donnees : { typologie, nature, departement, m0, surface, commentaire, postes: [{ libelle, montant, lot }] }.
 */
function Est_importer_(donnees) {
  var m = Est_validerMarche_(donnees);
  var postes = (donnees.postes || []).filter(function (p) { return p && String(p.libelle || '').trim(); });
  if (!postes.length) throw new Error('Aucun poste à enregistrer.');
  var parLot = {}, ordre = [];
  postes.forEach(function (p, i) {
    var lot = String(p.lot || '').toUpperCase();
    var l = Db_trouver(EST_TABLES.LOTS, lot);
    if (!l || l.actif !== 'oui') throw new Error('Poste « ' + p.libelle + ' » : choisissez un lot.');
    var montant = Number(String(p.montant).replace(/\s/g, '').replace(',', '.'));
    if (!(montant > 0)) throw new Error('Poste « ' + p.libelle + ' » : montant supérieur à 0 attendu.');
    if (!parLot[lot]) { parLot[lot] = { montant: 0, postes: [] }; ordre.push(lot); }
    parLot[lot].montant += montant;
    parLot[lot].postes.push(String(p.libelle).trim().slice(0, 60));
  });
  var total = ordre.reduce(function (s, lot) { return s + parLot[lot].montant; }, 0);
  var imp = Db_inserer(EST_TABLES.IMPORTS, {
    date: new Date(), typologie: m.typologie, nature: m.nature, departement: m.departement, m0: m.m0, surface: m.surface,
    nb_postes: postes.length, total_ht: Est_arrondi_(total), commentaire: String(donnees.commentaire || '').trim().slice(0, 200), statut: 'actif'
  });
  Db_insererPlusieurs(EST_TABLES.OBSERVATIONS, ordre.map(function (lot) {
    return {
      id_import: imp.id, typologie: m.typologie, nature: m.nature, departement: m.departement, m0: m.m0, lot: lot,
      postes: parLot[lot].postes.join(' ; ').slice(0, 300), montant_ht: Est_arrondi_(parLot[lot].montant), surface: m.surface,
      ratio: Est_arrondi_(parLot[lot].montant / m.surface), statut: 'actif'
    };
  }));
  Est_journal_('import', 'ok', imp.id + ' : ' + postes.length + ' postes, ' + ordre.length + ' lots, ' + Est_fr_(Est_arrondi_(total)) + ' € HT');
  return imp;
}

/** Annule un import : ses observations ne servent plus aux ratios (conservées pour la trace). */
function Est_annulerImport_(id) {
  var imp = Db_trouver(EST_TABLES.IMPORTS, id);
  if (!imp) throw new Error('Import introuvable : ' + id);
  if (imp.statut === 'annulé') return imp;
  Db_lire(EST_TABLES.OBSERVATIONS).filter(function (o) { return String(o.id_import) === String(id); })
    .forEach(function (o) { Db_maj(EST_TABLES.OBSERVATIONS, o.id, { statut: 'annulé' }); });
  Est_journal_('import', 'annulé', String(id));
  return Db_maj(EST_TABLES.IMPORTS, id, { statut: 'annulé' });
}

/** Imports (les plus récents d'abord) avec leurs observations. */
function Est_imports_() {
  var obs = Db_lire(EST_TABLES.OBSERVATIONS);
  return Db_lire(EST_TABLES.IMPORTS).map(function (i) {
    var c = Est_versClient_('IMPORTS', i);
    c.observations = obs.filter(function (o) { return String(o.id_import) === String(i.id); }).map(function (o) { return Est_versClient_('OBSERVATIONS', o); });
    return c;
  }).sort(function (a, b) { return String(b.id).localeCompare(String(a.id), 'fr', { numeric: true }); });
}

/**
 * Ratios par lot pour une typologie et une nature (neuf ou réhabilitation, toutes intensités confondues).
 * Chaque observation est actualisée au même mois (index du lot) avant le calcul de la médiane.
 * Renvoie [{ lot, libelle, n, mediane, min, max, indice, moisIndice, nonActualisees, fiabilite, sousSeuil, utilisable, departements }].
 */
function Est_ratios_(typologie, nature, moisCible) {
  var rehab = Est_estRehab_(nature);
  var seuil = Est_paramNombre_('est.seuil_anonymat', 3);
  var sousSeuilOk = String(Est_param_('est.ratio_sous_seuil', 'oui')).toLowerCase() === 'oui';
  var lots = {};
  Db_lire(EST_TABLES.LOTS).forEach(function (l) { lots[l.code] = l; });
  var groupes = {};
  Db_lire(EST_TABLES.OBSERVATIONS).forEach(function (o) {
    if (o.statut !== 'actif' || String(o.typologie) !== String(typologie) || Est_estRehab_(o.nature) !== rehab) return;
    (groupes[o.lot] = groupes[o.lot] || []).push(o);
  });
  return Object.keys(groupes).map(function (lot) {
    var obs = groupes[lot];
    var indice = '', moisIndice = '', nonAct = 0, recents = true;
    var valeurs = obs.map(function (o) {
      var a = Est_actualiser_(Number(o.ratio), o.m0, { lot: lot, nature: nature, moisCible: moisCible || null });
      indice = a.indice;
      if (a.recent) moisIndice = a.recent.mois;
      if (a.statut !== 'ok') nonAct++;
      if (a.recent && Est_ecartMois_(Est_mois_(o.m0), a.recent.mois) > 36) recents = false;
      return a.statut === 'ok' ? Number(o.ratio) * a.coef : Number(o.ratio);
    });
    var st = Est_stats_(valeurs);
    var imports = {}, deps = {};
    obs.forEach(function (o) { imports[o.id_import] = true; deps[o.departement] = true; });
    var n = Object.keys(imports).length;
    var memeZone = Object.keys(deps).length === 1;
    var sousSeuil = n < seuil;
    return {
      lot: lot, libelle: lots[lot] ? lots[lot].libelle : lot, ordre: lots[lot] ? Number(lots[lot].ordre) || 0 : 999,
      n: n, mediane: Est_arrondi_(st.mediane), min: Est_arrondi_(st.min), max: Est_arrondi_(st.max),
      indice: indice, moisIndice: moisIndice, nonActualisees: nonAct,
      fiabilite: n < 5 ? 'C' : (recents && memeZone ? 'A' : 'B'),
      sousSeuil: sousSeuil, utilisable: !sousSeuil || sousSeuilOk, departements: Object.keys(deps).sort()
    };
  }).sort(function (a, b) { return a.ordre - b.ordre; });
}
