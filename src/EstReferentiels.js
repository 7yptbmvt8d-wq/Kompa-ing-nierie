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
