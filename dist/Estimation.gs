/* Kompa Affaires — module Estimation 1.3.0 — fichier généré par tools/build.js depuis src/Est*.js. Ne pas modifier ici. */

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
var EST_VERSION = '1.3.0';

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
  return { version: EST_VERSION, ajouts: Est_initialiserReferentiels_() };
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
  ['est.k_mode', 'produit', 'Combinaison des facteurs K : « produit » (K = k1 × k2 × …) ou « somme » (K = 1 + Σ (ki − 1))'],
  ['est.seuil_anonymat', '3', 'Nombre minimal de marchés pour afficher un ratio'],
  ['est.indice_neuf', 'BT01', 'Index par défaut d\'un lot de bâtiment sans index, en neuf'],
  ['est.indice_rehab', 'BT50', 'Index par défaut d\'un lot de bâtiment sans index, en réhabilitation'],
  ['est.indice_vrd', 'TP01', 'Index par défaut d\'un lot VRD sans index'],
  ['est.projection_taux', '0', 'Taux annuel de projection jusqu\'à la date des travaux (%), 0 = actualisation seule'],
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
    })
  };
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
    titre: 'Coefficient K', aide: 'Facteurs de localisation et de contexte. Combinaison selon le paramètre est.k_mode. Votre méthode sera paramétrée ici.',
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
      if (col === 'coefficient' && !(n > 0)) throw new Error('Coefficient : nombre supérieur à 0 attendu (ex. 1,05).');
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
