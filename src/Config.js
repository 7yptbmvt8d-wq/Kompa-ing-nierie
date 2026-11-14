/**
 * Kompa Affaires — configuration générale et schéma du classeur (§ 9).
 *
 * Toute colonne ajoutée ici est créée au prochain lancement de installer(),
 * à la fin de l'onglet, sans toucher aux données existantes.
 */

var APP = {
  NOM: 'Kompa Affaires',
  VERSION: '1.2.2',
  CLASSEUR: 'Kompa Affaires — données',
  DOSSIER_SAUVEGARDES: 'Kompa Affaires — sauvegardes',
  PROP_CLASSEUR_ID: 'CLASSEUR_ID',
  PROP_DOSSIER_SAUVEGARDES_ID: 'DOSSIER_SAUVEGARDES_ID',
  FUSEAU: 'Europe/Paris',
  // Icône de l'onglet du navigateur : icône Kompa du kit, servie par le dépôt GitHub public
  // (l'adresse doit se terminer par .png). Remplaçable par le paramètre app.favicon_url.
  FAVICON: 'https://raw.githubusercontent.com/7yptbmvt8d-wq/Kompa-ing-nierie/claude/amazing-cray-l4l2w9/charte/kompa-kit/logos/png/kompa-icone-192.png'
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
      'statut', 'id_affaire', 'id_source', 'procedure', 'score_detail'
    ],
    nombres: ['montant_estime', 'pre_score'],
    texteBrut: ['departement', 'cpv', 'reference_acheteur', 'id_source'],
    horodatages: ['date_limite']
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
    ],
    nombres: [
      'pre_score', 'score_final', 'validite_offre_jours', 'prix_jour', 'montant_ht',
      'montant_pondere', 'jours_reponse', 'prix_attributaire', 'rang', 'montant_notifie'
    ],
    horodatages: ['date_statut'],
    texteBrut: ['departement', 'reference_acheteur']
  },
  HISTORIQUE: {
    onglet: 'Historique',
    cle: 'id',
    prefixe: 'HI',
    colonnes: ['id', 'id_affaire', 'ancien_statut', 'nouveau_statut', 'date', 'commentaire'],
    horodatages: ['date']
  },
  CRITERES: {
    onglet: 'Critères',
    cle: 'id',
    prefixe: 'CR',
    colonnes: ['id', 'id_affaire', 'critere', 'ponderation', 'note_kompa', 'note_attributaire'],
    nombres: ['ponderation', 'note_kompa', 'note_attributaire']
  },
  FACTURES: {
    onglet: 'Factures',
    cle: 'id',
    prefixe: 'FA',
    colonnes: [
      'id', 'id_affaire', 'numero', 'date', 'montant', 'date_echeance',
      'date_encaissement', 'montant_encaisse'
    ],
    nombres: ['montant', 'montant_encaisse']
  },
  RELANCES: {
    onglet: 'Relances',
    cle: 'id',
    prefixe: 'RE',
    colonnes: ['id', 'id_affaire', 'type', 'date_prevue', 'statut', 'date_faite', 'commentaire', 'cle', 'id_facture']
  },
  ACHETEURS: {
    onglet: 'Acheteurs',
    cle: 'id',
    prefixe: 'AC',
    colonnes: [
      'id', 'nom', 'type', 'departement', 'plateforme', 'contact',
      'nb_affaires', 'resultats'
    ],
    texteBrut: ['departement']
  },
  PARAMETRES: {
    onglet: 'Paramètres',
    cle: 'cle',
    colonnes: ['cle', 'valeur', 'commentaire'],
    texteBrut: ['valeur'] // évite que Sheets convertisse « 04 » en 4
  },
  DECLARATIONS: {
    onglet: 'Déclarations',
    cle: 'id',
    colonnes: ['id', 'ca_declare', 'date_declaration', 'commentaire'],
    nombres: ['ca_declare'],
    texteBrut: ['id']
  },
  JOURNAL_MOTEUR: {
    onglet: 'Journal moteur',
    cle: 'id',
    prefixe: 'JM',
    colonnes: ['id', 'date', 'source', 'avis_lus', 'avis_retenus', 'erreurs', 'duree_s', 'exclus', 'doublons'],
    horodatages: ['date'],
    nombres: ['avis_lus', 'avis_retenus', 'exclus', 'doublons', 'duree_s']
  }
};

/** Avis archivés (échus depuis longtemps) : mêmes colonnes que les avis. */
TABLES.AVIS_ARCHIVES = Object.assign({}, TABLES.AVIS, { onglet: 'Avis archivés' });

/** Colonnes complètes d'une table (métier + dates système). */
function colonnesTable_(table) {
  return table.colonnes.concat(COLONNES_DATES);
}

/**
 * Conversion des valeurs d'une ligne pour l'interface : dates « jour » en
 * aaaa-mm-jj, horodatages en ISO (google.script.run ne transmet pas les Date).
 */
function versClient_(table, ligne) {
  var horo = ['cree_le', 'modifie_le'].concat(table.horodatages || []);
  var out = {};
  Object.keys(ligne).forEach(function (k) {
    var v = ligne[k];
    if (Object.prototype.toString.call(v) === '[object Date]') {
      out[k] = isNaN(v.getTime()) ? '' : (horo.indexOf(k) >= 0 ? v.toISOString() : jourIso_(v));
    } else {
      out[k] = v;
    }
  });
  return out;
}

/** Conversion des valeurs saisies : nombres et dates « jour » selon le schéma de la table. */
function depuisClient_(table, champs) {
  var horo = ['cree_le', 'modifie_le'].concat(table.horodatages || []);
  var out = {};
  Object.keys(champs || {}).forEach(function (k) {
    if (table.colonnes.indexOf(k) < 0) return; // champ inconnu ignoré
    var v = champs[k];
    if (v === null || v === undefined) v = '';
    if ((table.nombres || []).indexOf(k) >= 0) {
      out[k] = String(v).trim() === '' ? '' : montant_(v);
    } else if (/^date/.test(k) && horo.indexOf(k) < 0) {
      out[k] = String(v).trim() === '' ? '' : (date_(v) || '');
    } else {
      out[k] = typeof v === 'string' ? v.trim() : v;
    }
  });
  return out;
}

function jourIso_(d) {
  return Utilities.formatDate(d, APP.FUSEAU, 'yyyy-MM-dd');
}
