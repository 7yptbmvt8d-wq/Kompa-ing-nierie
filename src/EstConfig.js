/**
 * Module Estimation des travaux — configuration.
 *
 * Ce fichier et les autres src/Est*.js sont assemblés dans dist/Estimation.gs, distinct de
 * dist/Code.gs (suivi des affaires) : une erreur de collage dans l'un ne casse pas l'autre.
 * Le module a son propre classeur (« Kartes Estimation — données »), relié aux affaires par leur n° (KI-…, KA- avant le 22/11/2026).
 * Plan : PLAN_ESTIMATION.md. Aucune valeur métier en dur : tout est paramétrable dans les tables EST_*.
 *
 * Règle de chargement : aucune référence aux variables de Code.gs au niveau global de ce fichier
 * (l'ordre de chargement des fichiers dans Apps Script n'est pas garanti) ; seulement dans des fonctions.
 */

/** Doit être égale à APP.VERSION (Code.gs) : sinon l'accueil signale une mise à jour incomplète. */
var EST_VERSION = '1.7.6';

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
