/* Kompa Affaires — module Estimation 1.5.0 — fichier généré par tools/build.js depuis src/Est*.js. Ne pas modifier ici. */

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
var EST_VERSION = '1.5.0';

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
      'tva', 'aleas_pct', 'total_ht', 'total_ttc', 'statut', 'commentaire', 'departement', 'export_url'],
    nombres: ['surface_sdp', 'surface_vrd', 'k', 'projection_taux', 'tva', 'aleas_pct', 'total_ht', 'total_ttc'],
    texteBrut: ['id_affaire', 'indice', 'mois_indice_bt', 'mois_indice_tp', 'departement', 'date_travaux']
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
  },
  // Bibliothèque (étape 4) : un import = les postes d'un marché attribué, sans entreprise, site ni opération.
  IMPORTS: {
    onglet: 'Imports', classeur: 'EST', cle: 'id', prefixe: 'IM',
    colonnes: ['id', 'date', 'typologie', 'nature', 'departement', 'm0', 'surface', 'nb_postes', 'total_ht', 'commentaire', 'statut'],
    nombres: ['surface', 'nb_postes', 'total_ht'], texteBrut: ['departement', 'm0'], horodatages: ['date']
  },
  // Une observation par lot et par import : montant HT du lot, ratio en € HT par m² de référence.
  OBSERVATIONS: {
    onglet: 'Observations', classeur: 'EST', cle: 'id', prefixe: 'OB',
    colonnes: ['id', 'id_import', 'typologie', 'nature', 'departement', 'm0', 'lot', 'postes', 'montant_ht', 'surface', 'ratio', 'statut'],
    nombres: ['montant_ht', 'surface', 'ratio'], texteBrut: ['departement', 'm0', 'lot']
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

// ——— Bibliothèque de ratios (étape 4) ———

/** Imports, listes du formulaire d'import. */
function apiEstBibliotheque() {
  return repondre_(function () {
    var f = Est_formulaire_('');
    return { imports: Est_imports_(), typologies: f.typologies, natures: f.natures, lots: f.lots };
  });
}

/** Analyse des lignes collées : postes reconnus (lot deviné) et lignes écartées. Rien n'est enregistré. */
function apiEstAnalyserPostes(texte) {
  return repondre_(function () { return Est_analyserPostes_(texte); });
}

function apiEstImporter(donnees) {
  return repondre_(function () {
    var imp = Est_importer_(donnees);
    return { id: imp.id, imports: Est_imports_(), brouillonsActualises: Est_actualiserBrouillons_() };
  });
}

function apiEstAnnulerImport(id) {
  return repondre_(function () { Est_annulerImport_(id); return { imports: Est_imports_(), brouillonsActualises: Est_actualiserBrouillons_() }; });
}

/** Ratios d'une typologie et d'une nature, actualisés au dernier index. */
function apiEstRatios(typologie, nature) {
  return repondre_(function () { return Est_ratios_(typologie, nature, null); });
}

// ——— Estimation au ratio (étape 5) ———

function apiEstFormulaire(idAffaire) {
  return repondre_(function () { return Est_formulaire_(idAffaire); });
}

/** Aperçu sans enregistrement. */
function apiEstApercu(d) {
  return repondre_(function () { return Est_calculer_(d); });
}

function apiEstCreer(d) {
  return repondre_(function () { return Est_creerEstimation_(d); });
}

/** Ouverture d'une estimation : un brouillon reprend d'abord les ratios à jour de la bibliothèque. */
function apiEstEstimation(id) {
  return repondre_(function () {
    var n = Est_actualiserBrouillon_(id);
    var c = Est_estimationComplete_(id);
    c.lignesActualisees = n;
    return c;
  });
}

function apiEstSurfaceMaj(id, surface) {
  return repondre_(function () { return Est_modifierSurface_(id, surface); });
}

function apiEstLigneMaj(idLigne, champs) {
  return repondre_(function () { return Est_ligneMaj_(idLigne, champs); });
}

function apiEstFiger(id) {
  return repondre_(function () { return Est_figer_(id); });
}

function apiEstSupprimer(id) {
  return repondre_(function () { return Est_supprimerEstimation_(id); });
}

// ——— Export .xlsx (étape 6) ———

function apiEstExporter(id) {
  return repondre_(function () { var r = Est_exporter_(id); r.estimation = Est_estimationComplete_(id); return r; });
}


// ════════ EstBibliotheque.js ════════

/**
 * Module Estimation — bibliothèque de ratios (étape 4, version simplifiée décidée le 19/11/2026).
 *
 * Les DPGF reçues ne donnent qu'un montant par article (pas de quantités) : on importe les postes
 * (macro-lots) d'un marché attribué, chacun rattaché à un lot, avec la surface de référence de l'opération.
 * Chaque lot donne une observation : ratio = montant HT / surface (€ HT/m²).
 * Aucune donnée d'entreprise, de site ni d'opération n'est saisie ni conservée.
 */

/** Régions administratives (découpage 2016) : département → code de région. Départements d'outre-mer : une région chacun. */
var EST_REGIONS = {
  ARA: '01;03;07;15;26;38;42;43;63;69;73;74', BFC: '21;25;39;58;70;71;89;90', BRE: '22;29;35;56', CVL: '18;28;36;37;41;45',
  COR: '2A;2B', GES: '08;10;51;52;54;55;57;67;68;88', HDF: '02;59;60;62;80', IDF: '75;77;78;91;92;93;94;95',
  NOR: '14;27;50;61;76', NAQ: '16;17;19;23;24;33;40;47;64;79;86;87', OCC: '09;11;12;30;31;32;34;46;48;65;66;81;82',
  PDL: '44;49;53;72;85', PAC: '04;05;06;13;83;84'
};

/** Code de région d'un département (« 2B » → « COR ») ; département inconnu ou d'outre-mer : le département lui-même. */
function Est_region_(departement) {
  var dep = String(departement || '').trim().toUpperCase();
  if (/^\d$/.test(dep)) dep = '0' + dep;
  for (var r in EST_REGIONS) { if ((';' + EST_REGIONS[r] + ';').indexOf(';' + dep + ';') >= 0) return r; }
  return dep;
}

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
    var regions = {};
    obs.forEach(function (o) { imports[o.id_import] = true; deps[o.departement] = true; regions[Est_region_(o.departement)] = true; });
    var n = Object.keys(imports).length;
    var memeZone = Object.keys(regions).length === 1; // même région (décision du 19/11/2026)
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


// ════════ EstEstimation.js ════════

/**
 * Module Estimation — estimation au ratio (étape 5, mode ratio ; le mode détaillé viendra avec les prix unitaires).
 *
 * Montant d'un lot = médiane du ratio (€ HT/m², actualisée au dernier index du lot) × surface × projection × K.
 * Puis aléas de la phase et TVA du département. Une estimation est un brouillon tant qu'elle n'est pas figée ;
 * figée, elle n'est plus modifiable (l'export reste identique).
 */

/** Lettre d'indice suivante pour une affaire et une phase (A, B… Z, puis AA). */
function Est_indiceSuivant_(idAffaire, phase) {
  var lettres = Db_lire(EST_TABLES.ESTIMATIONS).filter(function (e) {
    return String(e.id_affaire) === String(idAffaire) && String(e.phase) === String(phase);
  }).map(function (e) { return String(e.indice || ''); });
  if (!lettres.length) return 'A';
  var max = lettres.sort(function (a, b) { return a.length - b.length || a.localeCompare(b); }).pop();
  return max === 'Z' ? 'AA' : (max.length === 1 ? String.fromCharCode(max.charCodeAt(0) + 1) : max + 'A');
}

/** Ligne sans ratio : PU à saisir. Repérée par id_source « sans ratio » pour être reprise quand un ratio arrive. */
var EST_SANS_RATIO = 'sans ratio';

/**
 * Valeurs d'une ligne au ratio : PU = médiane × projection × K ; total = PU × quantité.
 * Sans ratio utilisable : PU 0, source « saisie », id_source « sans ratio ». Renvoie { champs, avertissements }.
 */
function Est_valeursLigne_(code, r, quantite, k, travaux) {
  var seuil = Est_param_('est.seuil_anonymat', '3');
  if (!r || !r.utilisable || !(r.mediane > 0)) {
    return {
      champs: {
        pu_m0: 0, m0: '', indice: '', indice_mois: '', indice_valeur: '', coef_actualisation: 1, pu_ht: 0, total_ht: 0,
        source: 'saisie', id_source: EST_SANS_RATIO, fiabilite: 'C', commentaire: 'Pas de ratio : PU à saisir.'
      },
      avertissements: [code + ' : ' + (!r ? 'aucun marché importé pour cette typologie et cette nature' : 'ratio masqué (moins de ' + seuil + ' marchés)') + ', PU à saisir.']
    };
  }
  var avert = [];
  var proj = travaux && r.moisIndice ? Est_projection_(r.moisIndice, travaux) : { coef: 1, mois: 0 };
  var valeur = r.moisIndice ? Est_valeurIndice_(r.indice, r.moisIndice) : null;
  var pu = Est_arrondi_(r.mediane * proj.coef * k);
  if (r.sousSeuil) avert.push(code + ' : ratio fondé sur ' + r.n + ' marché(s), sous le seuil de ' + seuil + ' : à confirmer.');
  if (r.nonActualisees) avert.push(code + ' : ' + r.nonActualisees + ' observation(s) non actualisée(s) (index du mois M0 absent).');
  return {
    champs: {
      pu_m0: r.mediane, m0: r.moisIndice, indice: r.indice, indice_mois: r.moisIndice, indice_valeur: valeur ? valeur.valeur : '',
      coef_actualisation: Est_arrondi_(proj.coef, 4), pu_ht: pu, total_ht: Est_arrondi_(pu * Number(quantite)),
      source: 'ratio', id_source: r.n + ' marché(s)', fiabilite: r.fiabilite,
      commentaire: 'Médiane de ' + r.n + ' marché(s) (' + Est_fr_(r.min) + ' à ' + Est_fr_(r.max) + ' €/m²), actualisée ' + r.indice + ' ' +
        Est_moisLisible_(r.moisIndice) + (proj.mois ? ' ; projection ' + Est_moisLisible_(travaux) + ' × ' + Est_fr_(proj.coef, 4) : '') +
        ' ; K ' + Est_fr_(k, 4)
    },
    avertissements: avert
  };
}

/** Ligne qui suit la bibliothèque : au ratio, ou sans ratio et PU encore à 0. Un PU saisi à la main est conservé. */
function Est_ligneSuitRatio_(l) {
  return l.source === 'ratio' || (l.source === 'saisie' && !(Number(l.pu_ht) > 0) &&
    (l.id_source === EST_SANS_RATIO || /^Pas de ratio/.test(String(l.commentaire || ''))));
}

/**
 * Brouillon : reprend les ratios actuels de la bibliothèque (imports, annulations, nouveaux index) pour les lignes
 * qui les suivent, puis recalcule les totaux. Sans effet sur une estimation figée. Renvoie le nombre de lignes modifiées.
 */
function Est_actualiserBrouillon_(id) {
  var e = Db_trouver(EST_TABLES.ESTIMATIONS, id);
  if (!e || e.statut === 'figée') return 0;
  var ratios = {};
  Est_ratios_(e.typologie, e.nature, null).forEach(function (r) { ratios[r.lot] = r; });
  var lignes = Db_lire(EST_TABLES.LIGNES).filter(function (l) { return String(l.id_estimation) === String(id); });
  var champsSuivis = ['pu_m0', 'm0', 'indice', 'indice_mois', 'indice_valeur', 'coef_actualisation', 'pu_ht', 'total_ht', 'source', 'id_source', 'fiabilite', 'commentaire'];
  var n = 0, avert = [];
  lignes.forEach(function (l) {
    if (!Est_ligneSuitRatio_(l)) return;
    var v = Est_valeursLigne_(l.lot, ratios[l.lot], l.quantite, Number(e.k) || 1, e.date_travaux ? Est_mois_(e.date_travaux) : '');
    avert = avert.concat(v.avertissements);
    var maj = {};
    champsSuivis.forEach(function (c) { if (String(v.champs[c]) !== String(l[c] === undefined ? '' : l[c])) maj[c] = v.champs[c]; });
    if (Object.keys(maj).length) { Db_maj(EST_TABLES.LIGNES, l.id, maj); n++; }
  });
  if (n) {
    var c = Est_estimationComplete_(id);
    var mois = c.lignes.filter(function (l) { return l.indice_mois; }).map(function (l) { return l.indice_mois; }).sort().pop() || '';
    Db_maj(EST_TABLES.ESTIMATIONS, id, {
      total_ht: Est_arrondi_(c.totaux.htAleas), total_ttc: Est_arrondi_(c.totaux.ttc), mois_indice_bt: mois, commentaire: avert.join(' ').slice(0, 500)
    });
    Est_journal_('estimation', 'ratios actualisés', id + ' : ' + n + ' ligne(s)');
  }
  return n;
}

/** Actualise toutes les estimations en brouillon (après un import ou une annulation). Renvoie le nombre d'estimations modifiées. */
function Est_actualiserBrouillons_() {
  return Db_lire(EST_TABLES.ESTIMATIONS).filter(function (e) { return e.statut !== 'figée'; })
    .reduce(function (s, e) { return s + (Est_actualiserBrouillon_(e.id) ? 1 : 0); }, 0);
}

/**
 * Calcule une estimation sans l'enregistrer (aperçu) : renvoie { entete, lignes, totaux, k, avertissements }.
 * d : { id_affaire, phase, typologie, nature, departement, surface, k_ids: [...], mois_indice (AAAA-MM ou ''),
 *       date_travaux (MM/AAAA ou ''), lots: [codes], tva (facultatif) }.
 */
function Est_calculer_(d) {
  // Chiffrage rapide (accueil Estimation) : sans affaire, phase par défaut, kdép déduit du département.
  var a = d.id_affaire ? Affaires_get_(d.id_affaire) : { id: '' };
  var phases = Est_paramListe_('est.phases');
  if (!d.phase && !d.id_affaire) d.phase = phases[1] || phases[0];
  if (phases.indexOf(d.phase) < 0) throw new Error('Phase attendue parmi : ' + phases.join(', ') + '.');
  var m = Est_validerMarche_({ typologie: d.typologie, nature: d.nature, departement: d.departement, m0: '01/2000', surface: d.surface });
  var lotsChoisis = (d.lots || []).map(function (x) { return String(x).toUpperCase(); });
  if (!lotsChoisis.length && !d.id_affaire) {
    lotsChoisis = Est_ratios_(m.typologie, m.nature, null).filter(function (r) { return r.utilisable; }).map(function (r) { return r.lot; });
    if (!lotsChoisis.length) throw new Error('Aucun ratio pour cette typologie et cette nature : importez des marchés dans la bibliothèque.');
  }
  if (!lotsChoisis.length) throw new Error('Choisissez au moins un lot.');
  var kIds = (d.k_ids || []).slice();
  if (!kIds.length) { var kd = Est_kdepPour_(m.departement); if (kd) kIds.push(String(kd.id)); }
  var k = Est_calculerK_(kIds);
  var moisIndice = d.mois_indice ? Est_mois_(d.mois_indice) : '';
  var travaux = d.date_travaux ? Est_mois_(d.date_travaux) : '';
  if (d.date_travaux && !travaux) throw new Error('Date des travaux : format MM/AAAA attendu.');
  var ratios = {};
  Est_ratios_(m.typologie, m.nature, moisIndice || null).forEach(function (r) { ratios[r.lot] = r; });
  var lots = {};
  Db_lire(EST_TABLES.LOTS).forEach(function (l) { lots[l.code] = l; });
  var avert = [];
  lotsChoisis.sort(function (x, y) { return ((lots[x] || {}).ordre || 999) - ((lots[y] || {}).ordre || 999); });
  var lignes = lotsChoisis.map(function (code, i) {
    var lot = lots[code];
    if (!lot) throw new Error('Lot inconnu : ' + code);
    var v = Est_valeursLigne_(code, ratios[code], m.surface, k.k, travaux);
    avert = avert.concat(v.avertissements);
    return Object.assign({
      lot: code, num_article: ('0' + (i + 1)).slice(-2), designation: lot.libelle, unite: 'm²', quantite: m.surface, coef_k: k.k
    }, v.champs);
  });
  var tva = d.tva !== undefined && d.tva !== '' && d.tva !== null ? Number(String(d.tva).replace(',', '.')) : Est_tvaPour_(m.departement);
  var aleas = Est_aleasPct_(d.phase);
  return {
    entete: {
      id_affaire: a.id, phase: d.phase, typologie: m.typologie, nature: m.nature, departement: m.departement, surface_sdp: m.surface,
      k: k.k, k_detail: k.detail.map(function (x) { return x.facteur + ' ' + x.modalite + ' (' + Est_fr_(x.coefficient) + ')'; }).join(' + '),
      mode: 'ratio', mois_indice_bt: lignes.filter(function (l) { return l.indice_mois; }).map(function (l) { return l.indice_mois; }).sort().pop() || '',
      date_travaux: travaux, tva: tva, aleas_pct: aleas
    },
    lignes: lignes, totaux: Est_totaux_(lignes, aleas, tva), k: k, avertissements: avert
  };
}

/** Crée l'estimation (brouillon) et ses lignes. Renvoie l'estimation complète. */
function Est_creerEstimation_(d) {
  var c = Est_calculer_(d);
  var e = Db_inserer(EST_TABLES.ESTIMATIONS, Object.assign({}, c.entete, {
    indice: Est_indiceSuivant_(c.entete.id_affaire, c.entete.phase), statut: 'brouillon',
    total_ht: Est_arrondi_(c.totaux.htAleas), total_ttc: Est_arrondi_(c.totaux.ttc),
    commentaire: c.avertissements.join(' ').slice(0, 500)
  }));
  Db_insererPlusieurs(EST_TABLES.LIGNES, c.lignes.map(function (l) { return Object.assign({ id_estimation: e.id }, l); }));
  Est_journal_('estimation', 'créée', e.id + ' (' + e.id_affaire + ', ' + e.phase + ' ind ' + e.indice + ')');
  return Est_estimationComplete_(e.id);
}

/** Estimation, lignes (ordre des lots), totaux et affaire. */
function Est_estimationComplete_(id) {
  var e = Db_trouver(EST_TABLES.ESTIMATIONS, id);
  if (!e) throw new Error('Estimation introuvable : ' + id);
  var lignes = Db_lire(EST_TABLES.LIGNES).filter(function (l) { return String(l.id_estimation) === String(id); })
    .sort(function (x, y) { return String(x.num_article).localeCompare(String(y.num_article), 'fr', { numeric: true }); });
  var a = Db_trouver(TABLES.AFFAIRES, e.id_affaire) || {};
  var typo = Db_trouver(EST_TABLES.TYPOLOGIES, e.typologie) || {};
  return {
    estimation: Est_versClient_('ESTIMATIONS', e),
    lignes: lignes.map(function (l) { return Est_versClient_('LIGNES', l); }),
    totaux: Est_totaux_(lignes, e.aleas_pct, e.tva),
    affaire: { id: a.id || e.id_affaire, acheteur: a.acheteur || '', objet: a.objet || '' },
    typologie: typo.libelle || e.typologie
  };
}

function Est_estimationModifiable_(id) {
  var e = Db_trouver(EST_TABLES.ESTIMATIONS, id);
  if (!e) throw new Error('Estimation introuvable : ' + id);
  if (e.statut === 'figée') throw new Error('Estimation figée : créez un nouvel indice pour la modifier.');
  return e;
}

/** Met à jour les totaux enregistrés d'une estimation après une modification de ligne. */
function Est_recalculerTotaux_(id) {
  var c = Est_estimationComplete_(id);
  Db_maj(EST_TABLES.ESTIMATIONS, id, { total_ht: Est_arrondi_(c.totaux.htAleas), total_ttc: Est_arrondi_(c.totaux.ttc) });
  return Est_estimationComplete_(id);
}

/** Modifie une ligne : PU HT, quantité ou désignation. Un PU saisi remplace le ratio (source « saisie », fiabilité C). */
function Est_ligneMaj_(idLigne, champs) {
  var l = Db_trouver(EST_TABLES.LIGNES, idLigne);
  if (!l) throw new Error('Ligne introuvable : ' + idLigne);
  Est_estimationModifiable_(l.id_estimation);
  var maj = {};
  var nombre = function (v, nom) {
    var n = Number(String(v).replace(/[\s €]/g, '').replace(',', '.'));
    if (!isFinite(n) || n < 0) throw new Error(nom + ' : nombre positif attendu.');
    return n;
  };
  if ('designation' in champs) {
    var t = String(champs.designation || '').trim();
    if (!t) throw new Error('Désignation obligatoire.');
    maj.designation = t.slice(0, 200);
  }
  var pu = 'pu_ht' in champs ? Est_arrondi_(nombre(champs.pu_ht, 'PU HT')) : Number(l.pu_ht);
  var q = 'quantite' in champs ? nombre(champs.quantite, 'Quantité') : Number(l.quantite);
  if ('pu_ht' in champs && pu !== Number(l.pu_ht)) {
    maj.source = 'saisie';
    maj.fiabilite = 'C';
    maj.commentaire = ('PU saisi' + (l.source === 'ratio' ? ' (ratio : ' + Est_fr_(l.pu_ht) + ' €/m²)' : '') + '. ' + String(l.commentaire || '')).slice(0, 300);
  }
  maj.pu_ht = pu;
  maj.quantite = q;
  maj.total_ht = Est_arrondi_(pu * q);
  Db_maj(EST_TABLES.LIGNES, idLigne, maj);
  return Est_recalculerTotaux_(l.id_estimation);
}

/**
 * Change la surface de référence d'un brouillon : les lignes au m² qui portaient l'ancienne surface la reprennent,
 * les totaux sont recalculés. Les autres quantités (saisies à la main) ne bougent pas.
 */
function Est_modifierSurface_(id, surface) {
  var e = Est_estimationModifiable_(id);
  var s = Number(String(surface).replace(/[\s m²]/g, '').replace(',', '.'));
  if (!(s > 0)) throw new Error('Surface de référence : nombre de m² supérieur à 0 attendu.');
  var ancienne = Number(e.surface_sdp);
  Db_lire(EST_TABLES.LIGNES).forEach(function (l) {
    if (String(l.id_estimation) !== String(id) || String(l.unite) !== 'm²' || Number(l.quantite) !== ancienne) return;
    Db_maj(EST_TABLES.LIGNES, l.id, { quantite: s, total_ht: Est_arrondi_(Number(l.pu_ht) * s) });
  });
  Db_maj(EST_TABLES.ESTIMATIONS, id, { surface_sdp: s });
  Est_journal_('estimation', 'surface modifiée', id + ' : ' + Est_fr_(ancienne) + ' → ' + Est_fr_(s) + ' m²');
  return Est_recalculerTotaux_(id);
}

function Est_figer_(id) {
  Est_estimationModifiable_(id);
  Db_maj(EST_TABLES.ESTIMATIONS, id, { statut: 'figée' });
  return Est_estimationComplete_(id);
}

/** Supprime une estimation en brouillon et ses lignes. */
function Est_supprimerEstimation_(id) {
  Est_estimationModifiable_(id);
  Db_supprimerSi(EST_TABLES.LIGNES, function (l) { return String(l.id_estimation) === String(id); });
  Db_supprimerSi(EST_TABLES.ESTIMATIONS, function (e) { return String(e.id) === String(id); });
  Est_journal_('estimation', 'supprimée', String(id));
  return true;
}

/** Données du formulaire « Nouvelle estimation » : listes et valeurs proposées. */
function Est_formulaire_(idAffaire) {
  var actifs = function (t) { return Db_lire(t).filter(function (l) { return l.actif === 'oui'; }); };
  var ordre = function (x, y) { return (Number(x.ordre) || 0) - (Number(y.ordre) || 0); };
  var k = {};
  actifs(EST_TABLES.K).forEach(function (l) {
    var f = Est_estKdep_(l.facteur) ? 'kdép' : String(l.facteur);
    (k[f] = k[f] || []).push({ id: String(l.id), modalite: String(l.modalite), coefficient: Number(l.coefficient) });
  });
  var affaires = Db_lire(TABLES.AFFAIRES).map(function (a) {
    return { id: a.id, acheteur: a.acheteur, objet: a.objet, departement: String(a.departement || ''), statut: a.statut };
  }).sort(function (x, y) { return String(y.id).localeCompare(String(x.id), 'fr', { numeric: true }); });
  var etat = Est_etatIndices_();
  return {
    affaires: affaires, choisie: idAffaire || '',
    phases: Est_paramListe_('est.phases'), natures: Est_paramListe_('est.natures'),
    typologies: actifs(EST_TABLES.TYPOLOGIES).sort(ordre).map(function (t) { return { code: t.code, libelle: t.libelle }; }),
    lots: actifs(EST_TABLES.LOTS).sort(ordre).map(function (l) { return { code: l.code, libelle: l.libelle }; }),
    k: k, kMode: Est_param_('est.k_mode', 'kloc'), tvaZones: Est_paramDico_('est.tva_zones'), tvaDefaut: Est_paramNombre_('est.tva_defaut', 20),
    aleas: Est_paramDico_('est.aleas'), dernierIndex: etat && etat.bt01 ? etat.bt01.mois : ''
  };
}


// ════════ EstExport.js ════════

/**
 * Module Estimation — export .xlsx au format DPGF (étape 6).
 *
 * Le classeur est construit dans un Google Sheets temporaire (formules et mise en forme Kompa),
 * exporté en .xlsx, déposé dans le sous-dossier « 09 Estimations » de l'affaire (paramètre est.dossier_export),
 * puis le classeur temporaire est mis à la corbeille. Aucun fichier existant n'est écrasé.
 */

var EST_EXPORT_COULEURS = { ardoise: '#1B263B', brume: '#EEF1F6', filet: '#D5DBE5', rouille: '#B4460E', gris: '#4A5568', blanc: '#FFFFFF' };

/** Nom du fichier : « KA-2026-004 — Estimation APS — ind A.xlsx ». */
function Est_nomExport_(e) {
  return e.id_affaire + ' — Estimation ' + e.phase + ' — ind ' + e.indice + '.xlsx';
}

/** Remplit la feuille : en-tête, lignes par lot, totaux en formules, mentions d'index et de K. */
function Est_remplirExport_(feuille, c) {
  var C = EST_EXPORT_COULEURS;
  var e = c.estimation;
  var lignes = c.lignes;
  var fr = function (x, d) { return Est_fr_(x, d === undefined ? 2 : d); };
  feuille.setName('Estimation');
  var entete = [
    ['KOMPA INGÉNIERIE — ESTIMATION ' + String(e.phase).toUpperCase() + ' — IND ' + e.indice],
    [c.affaire.id + (c.affaire.acheteur ? ' — ' + c.affaire.acheteur : '') + (c.affaire.objet ? ' — ' + c.affaire.objet : '')],
    ['Typologie : ' + c.typologie + ' · ' + e.nature + ' · département ' + e.departement + ' · surface de référence ' + fr(e.surface_sdp, 0) + ' m² · estimation au ratio']
  ];
  feuille.getRange(1, 1, 3, 1).setValues(entete);
  feuille.getRange(1, 1).setFontSize(14).setFontWeight('bold').setFontColor(C.ardoise);
  feuille.getRange(2, 1, 2, 1).setFontColor(C.gris);
  var R0 = 5;
  feuille.getRange(R0, 1, 1, 6).setValues([['N°', 'Désignation', 'Unité', 'Quantité', 'PU HT (€)', 'Total HT (€)']])
    .setFontWeight('bold').setFontColor(C.blanc).setBackground(C.ardoise).setHorizontalAlignment('center');
  var r = R0 + 1;
  var premiere = r;
  if (lignes.length) {
    feuille.getRange(r, 1, lignes.length, 1).setNumberFormat('@'); // n° d'article « 01 » conservé en texte
    feuille.getRange(r, 1, lignes.length, 5).setValues(lignes.map(function (l) {
      return [String(l.num_article), String(l.designation), String(l.unite), Number(l.quantite) || 0, Number(l.pu_ht) || 0];
    }));
    feuille.getRange(r, 6, lignes.length, 1).setFormulas(lignes.map(function (_, i) { return ['=D' + (r + i) + '*E' + (r + i)]; }));
    r += lignes.length;
  }
  var derniere = r - 1;
  var totaux = [
    ['Total HT des lots', '=SUM(F' + premiere + ':F' + Math.max(derniere, premiere) + ')'],
    ['Aléas et imprévus (' + fr(e.aleas_pct, 1) + ' %)', '=F' + r + '*' + (Number(e.aleas_pct) || 0) / 100],
    ['TOTAL HT', '=F' + r + '+F' + (r + 1)],
    ['TVA (' + fr(e.tva, 1) + ' %)', '=F' + (r + 2) + '*' + (Number(e.tva) || 0) / 100],
    ['TOTAL TTC', '=F' + (r + 2) + '+F' + (r + 3)]
  ];
  feuille.getRange(r, 5, totaux.length, 1).setValues(totaux.map(function (t) { return [t[0]]; }));
  feuille.getRange(r, 6, totaux.length, 1).setFormulas(totaux.map(function (t) { return [t[1]]; }));
  feuille.getRange(r, 5, totaux.length, 2).setFontWeight('bold').setBackground(C.brume);
  feuille.getRange(r + 2, 5, 1, 2).setBackground(C.filet);
  feuille.getRange(r + 4, 5, 1, 2).setBackground(C.ardoise).setFontColor(C.blanc);
  feuille.getRange(premiere, 4, Math.max(derniere - premiere + 1, 1), 3).setNumberFormat('#,##0.00');
  feuille.getRange(r, 6, totaux.length, 1).setNumberFormat('#,##0.00');
  // Mentions : index, K, sources et fiabilités
  var n = r + totaux.length + 1;
  var mentions = [['Méthode et sources']].concat([
    ['Montant d\'un lot = médiane du ratio (€ HT/m², marchés importés de même typologie et même nature) actualisée au dernier index du lot × surface × projection × K.'],
    ['Coefficient de localisation K = ' + fr(e.k, 4) + ' : ' + (e.k_detail || '—')],
    [e.date_travaux ? 'Projection jusqu\'à la date des travaux ' + Est_moisLisible_(e.date_travaux) + ' (paramètre est.projection_taux).' : 'Pas de projection à la date des travaux.']
  ]).concat(lignes.map(function (l) {
    return [l.num_article + ' ' + l.designation + ' — ' + (l.source === 'ratio' ? 'ratio, ' : 'PU saisi, ') + 'fiabilité ' + l.fiabilite +
      (l.indice ? ' — ' + l.indice + ' ' + Est_moisLisible_(l.indice_mois) + (l.indice_valeur !== '' ? ' = ' + fr(l.indice_valeur, 1) : '') : '') +
      (l.commentaire ? ' — ' + l.commentaire : '')];
  })).concat([['Fiabilité : A = au moins 5 marchés de moins de 3 ans, même région ; B = plus ancien ou autre région ; C = moins de 5 marchés ou saisie libre.'],
    ['Estimation établie le ' + Utilities.formatDate(new Date(), APP.FUSEAU, 'dd/MM/yyyy') + ' — statut : ' + e.statut + ' — ' + e.id + '.']]);
  feuille.getRange(n, 1, mentions.length, 1).setValues(mentions);
  feuille.getRange(n, 1).setFontWeight('bold').setFontColor(C.ardoise);
  feuille.getRange(n + 1, 1, mentions.length - 1, 1).setFontColor(C.gris).setFontSize(9);
  feuille.getRange(1, 1, n + mentions.length, 6).setFontFamily('Arial');
  feuille.setColumnWidth(1, 60);
  feuille.setColumnWidth(2, 360);
  feuille.setColumnWidth(3, 60);
  feuille.setColumnWidth(4, 90);
  feuille.setColumnWidth(5, 170);
  feuille.setColumnWidth(6, 120);
  feuille.setFrozenRows(R0);
  return { premiere: premiere, derniere: derniere, totaux: r };
}

/** Exporte l'estimation en .xlsx dans le dossier Drive de l'affaire. Renvoie { nom, url, dossier }. */
function Est_exporter_(id) {
  var c = Est_estimationComplete_(id);
  var e = c.estimation;
  var a = Affaires_get_(e.id_affaire);
  var dossier = Drive_dossierAffaireOuCreer_(a);
  var nomDossier = Est_param_('est.dossier_export', '09 Estimations');
  var cible = Drive_sousDossier_(dossier, nomDossier);
  var temp = SpreadsheetApp.create('Export temporaire ' + e.id);
  try {
    Est_remplirExport_(temp.getSheets()[0], c);
    SpreadsheetApp.flush();
    var rep = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + temp.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (rep.getResponseCode() !== 200) throw new Error('Export .xlsx refusé par Google (HTTP ' + rep.getResponseCode() + ').');
    var nom = Drive_nomLibre_(cible, Est_nomExport_(e));
    var fichier = cible.createFile(rep.getBlob().setName(nom));
    Db_maj(EST_TABLES.ESTIMATIONS, id, { export_url: fichier.getUrl() });
    Affaires_ajouterNote(a.id, 'Estimation exportée : ' + nomDossier + ' / ' + nom);
    Est_journal_('export', 'ok', id + ' → ' + nom);
    return { nom: nom, url: fichier.getUrl(), dossier: nomDossier };
  } finally {
    try { DriveApp.getFileById(temp.getId()).setTrashed(true); } catch (err) { /* déjà supprimé */ }
  }
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
  ['est.ratio_sous_seuil', 'oui', 'Utiliser un ratio fondé sur moins de marchés que est.seuil_anonymat : oui (signalé, fiabilité C) ou non (ratio masqué)'],
  ['est.dossier_export', '09 Estimations', 'Sous-dossier Drive de l\'affaire où l\'export .xlsx est déposé'],
  ['est.classement_lots', 'DG:dispositions générales,installation de chantier,nettoyage,propreté,prorata;DEM:démolition,désamiantage,dépollution,curage;TER:terrassement;GO:gros œuvre,gros-œuvre,maçonnerie,béton,fondation;CHARP:charpente,structure métallique,ossature;COUV:couverture,bardage,toiture;ETAN:étanchéité;FAC:façade,ravalement;MEN-EXT:menuiseries extérieures,menuiserie extérieure;SERR:serrurerie,métallerie,porte de hangar,portes de hangar,portail;PLAT:plâtrerie,cloison,doublage,faux plafond,plafonds;MEN-INT:menuiseries intérieures,menuiserie intérieure,menuiseries;REV-SOL:revêtements de sols,revêtement de sol,carrelage,céramique,sols souples;PEINT:peinture,revêtements muraux;PLB:plomberie,sanitaire;CVC:génie climatique,chauffage,ventilation,climatisation,cvc;ELE:électricité,électrique,courants;ASC:ascenseur;VRD:vrd,voirie,réseaux divers;EQUIP:équipements,équipement', 'Classement des postes collés à l\'import : lot:mot,mot;… (premier mot reconnu, le plus long l\'emporte)'],
  ['est.fiabilite', 'A:Prix de marché de moins de 3 ans, même région;B:Prix de marché plus ancien ou d\'une autre région;C:Ratio sur moins de 5 marchés ou saisie libre', 'Échelle de fiabilité des prix']
];

/** Lots et index associés (validés le 15/11/2026, § 5.3 Q4 bis). [code, libellé, famille, index, ordre] */
var EST_LOTS_DEFAUT = [
  ['DG', 'Dispositions générales, installations de chantier', 'batiment', '', 5],
  ['DEM', 'Démolitions, curage, dépollution', 'batiment', '', 8],
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
  ['VRD', 'Voirie et réseaux divers', 'vrd', 'TP08', 170],
  ['EQUIP', 'Équipements spécifiques', 'batiment', '', 180]
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
