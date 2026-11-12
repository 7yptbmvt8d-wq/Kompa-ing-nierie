/**
 * Kompa Affaires — configuration générale et schéma du classeur (§ 9).
 *
 * Toute colonne ajoutée ici est créée au prochain lancement de installer(),
 * à la fin de l'onglet, sans toucher aux données existantes.
 */

var APP = {
  NOM: 'Kompa Affaires',
  VERSION: '1.0.0-lot1',
  CLASSEUR: 'Kompa Affaires — données',
  DOSSIER_SAUVEGARDES: 'Kompa Affaires — sauvegardes',
  PROP_CLASSEUR_ID: 'CLASSEUR_ID',
  PROP_DOSSIER_SAUVEGARDES_ID: 'DOSSIER_SAUVEGARDES_ID',
  FUSEAU: 'Europe/Paris'
};

/** Couleurs de mise en forme du classeur (reprises des tokens de l'app). */
var THEME_CLASSEUR = {
  ENTETE_FOND: '#EEF1F4', // brume
  ENTETE_TEXTE: '#2E3A44', // ardoise
  POLICE: 'IBM Plex Sans'
};

var COLONNES_DATES = ['cree_le', 'modifie_le'];

/**
 * Tables : nom d'onglet, colonne clé, colonnes métier.
 * Les colonnes cree_le et modifie_le sont ajoutées automatiquement en fin de ligne.
 */
var TABLES = {
  AVIS: {
    onglet: 'Avis',
    cle: 'id',
    prefixe: 'AV',
    colonnes: [
      'id', 'source', 'date_parution', 'acheteur', 'type_acheteur', 'departement',
      'objet', 'cpv', 'reference_acheteur', 'montant_estime', 'date_limite',
      'lien', 'liens_autres', 'pre_score', 'zone', 'classement', 'alerte_delai',
      'statut', 'id_affaire'
    ]
  },
  AFFAIRES: {
    onglet: 'Affaires',
    cle: 'id',
    prefixe: 'KA',
    colonnes: [
      // Identification
      'id', 'acheteur', 'type_acheteur', 'departement', 'objet', 'reference_acheteur',
      'procedure', 'plateforme', 'lien_avis', 'lien_dce', 'id_avis',
      // Statut courant
      'statut', 'date_statut',
      // Échéances
      'date_limite_remise', 'date_limite_questions', 'date_visite', 'validite_offre_jours',
      // Décision
      'pre_score', 'score_final', 'decision', 'motif_decision', 'date_decision',
      // Offre
      'groupement', 'cotraitant', 'tranches', 'jours_par_tranche', 'prix_jour',
      'montant_ht', 'montant_pondere', 'jours_reponse', 'date_depot',
      // Résultat
      'statut_final', 'date_resultat', 'attributaire', 'prix_attributaire', 'rang',
      'motifs_rejet',
      // Enseignements
      'points_faibles', 'action_corrective', 'piece_type',
      // Exécution
      'date_notification', 'montant_notifie',
      // Journal
      'notes'
    ]
  },
  HISTORIQUE: {
    onglet: 'Historique',
    cle: 'id',
    prefixe: 'HI',
    colonnes: ['id', 'id_affaire', 'ancien_statut', 'nouveau_statut', 'date', 'commentaire']
  },
  CRITERES: {
    onglet: 'Critères',
    cle: 'id',
    prefixe: 'CR',
    colonnes: ['id', 'id_affaire', 'critere', 'ponderation', 'note_kompa', 'note_attributaire']
  },
  FACTURES: {
    onglet: 'Factures',
    cle: 'id',
    prefixe: 'FA',
    colonnes: [
      'id', 'id_affaire', 'numero', 'date', 'montant', 'date_echeance',
      'date_encaissement', 'montant_encaisse'
    ]
  },
  RELANCES: {
    onglet: 'Relances',
    cle: 'id',
    prefixe: 'RE',
    colonnes: ['id', 'id_affaire', 'type', 'date_prevue', 'statut', 'date_faite', 'commentaire']
  },
  ACHETEURS: {
    onglet: 'Acheteurs',
    cle: 'id',
    prefixe: 'AC',
    colonnes: [
      'id', 'nom', 'type', 'departement', 'plateforme', 'contact',
      'nb_affaires', 'resultats'
    ]
  },
  PARAMETRES: {
    onglet: 'Paramètres',
    cle: 'cle',
    colonnes: ['cle', 'valeur', 'commentaire'],
    texteBrut: ['valeur'] // évite que Sheets convertisse « 04 » en 4
  },
  JOURNAL_MOTEUR: {
    onglet: 'Journal moteur',
    cle: 'id',
    prefixe: 'JM',
    colonnes: ['id', 'date', 'source', 'avis_lus', 'avis_retenus', 'erreurs', 'duree_s']
  }
};

/** Colonnes complètes d'une table (métier + dates système). */
function colonnesTable_(table) {
  return table.colonnes.concat(COLONNES_DATES);
}
