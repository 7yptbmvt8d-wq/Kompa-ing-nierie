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
