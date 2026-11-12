/**
 * Paramètres (onglet « Paramètres ») : clé, valeur, commentaire.
 * Listes : valeurs séparées par « ; ». Nombres : chiffres seuls, sans espace ni €.
 * installer() ajoute les clés manquantes sans jamais écraser une valeur saisie.
 */

var SEP_LISTE = ';';

/** Groupes affichés dans l'écran Paramètres (préfixe de clé → titre). */
var GROUPES_PARAMETRES = [
  ['veille', 'Veille — sources et filtres'],
  ['zone', 'Zones'],
  ['score', 'Barème du pré-score'],
  ['capacite', 'Capacité visée'],
  ['seuil', 'Seuils de CA'],
  ['echeance', 'Échéances et relances'],
  ['email', 'E-mail du matin'],
  ['liste', 'Listes de valeurs'],
  ['sauvegarde', 'Sauvegarde'],
  ['app', 'Application']
];

/** Valeurs initiales : [clé, valeur, commentaire]. */
var PARAMETRES_DEFAUT = [
  // Veille (§ 3.1, 3.2)
  ['veille.cpv', '71241000;71242000;71541000;71310000;71530000',
    'Codes CPV retenus (§ 3.2) — à valider'],
  ['veille.mots_cles', 'assistance à maîtrise d\'ouvrage;AMO;programmation;étude de faisabilité;études préalables;conduite d\'opération;assistance technique',
    'Mots-clés retenus dans l\'objet — à valider'],
  ['veille.mots_cles_coeur', 'faisabilité;programmation;conduite d\'opération',
    'Mots-clés « cœur de mission » (30 pts au critère Mission)'],
  ['veille.exclusions', 'marché de travaux;AMO juridique;AMO financière;assurances',
    'Avis écartés si l\'objet contient l\'un de ces termes — à valider'],
  ['veille.exclusion_moe', 'mission de maîtrise d\'œuvre',
    'Écarté si l\'objet contient ce terme…'],
  ['veille.exception_moe', 'assistance à maîtrise d\'ouvrage',
    '… sauf s\'il contient aussi celui-ci'],
  ['veille.libelle_gmail', 'Veille', 'Libellé Gmail des alertes des plateformes'],
  ['veille.heure_collecte', '6', 'Heure de la collecte quotidienne (0-23)'],

  // Zones (§ 3.2)
  ['zone.departements_paca', '04;05;06;13;83;84', 'Départements classés « PACA »'],
  ['zone.libelle_paca', 'PACA', 'Libellé de zone pour ces départements'],
  ['zone.libelle_france', 'France — présentiel à vérifier', 'Libellé de zone pour les autres'],

  // Pré-score (§ 3.4)
  ['score.zone_paca', '25', 'Zone PACA'],
  ['score.zone_france', '10', 'Zone France hors PACA'],
  ['score.mission_coeur', '30', 'Mission : mot-clé cœur'],
  ['score.mission_autre', '15', 'Mission : autre AMO technique'],
  ['score.delai_15j', '15', 'Délai avant remise ≥ 15 j'],
  ['score.delai_10j', '8', 'Délai avant remise 10 à 14 j'],
  ['score.delai_court', '0', 'Délai avant remise < 10 j (avec alerte)'],
  ['score.acheteur_commune_epci', '15', 'Acheteur commune ou EPCI'],
  ['score.acheteur_autre', '10', 'Autre acheteur public'],
  ['score.montant_compatible', '15', 'Montant compatible avec la capacité'],
  ['score.montant_inconnu', '8', 'Montant inconnu'],
  ['score.montant_hors', '0', 'Montant hors capacité'],
  ['score.seuil_etudier', '60', 'Pré-score ≥ ce seuil : « à étudier »'],
  ['score.seuil_possible', '40', 'Pré-score ≥ ce seuil : « possible » ; en dessous : archivé'],

  // Capacité (§ 11)
  ['capacite.montant_max_mission', '', 'Montant HT maximal d\'une mission (€). Vide = seul le reste sous le plafond visé compte'],
  ['capacite.charge_annuelle_jours', '', 'Jours facturables par an (facultatif, pour le suivi de charge)'],

  // Seuils (§ 7)
  ['seuil.tva_franchise', '37500', 'Franchise de TVA, services (€)'],
  ['seuil.tva_majore', '41250', 'Franchise de TVA, seuil majoré (€)'],
  ['seuil.plafond_vise', '80000', 'Plafond de CA annuel que vous vous fixez, sous le plafond légal (€)'],
  ['seuil.micro_plafond', '83600', 'Plafond micro-entreprise, prestations de services (€)'],
  ['seuil.alerte_pct', '80', 'Première alerte à ce pourcentage du seuil'],

  // Échéances (§ 5)
  ['echeance.remise_alertes_j', '7;3;1', 'Alertes avant la date limite de remise (jours)'],
  ['echeance.questions_alerte_j', '3', 'Alerte avant la date limite des questions (jours)'],
  ['echeance.visite_alerte_j', '2', 'Alerte avant la visite de site (jours)'],
  ['echeance.rejet_relance_j', '10', 'Relance des motifs du rejet si rien reçu (jours)'],
  ['echeance.paiement_public_j', '30', 'Délai de paiement public (jours)'],

  // E-mail (§ 6)
  ['email.heure', '7', 'Heure d\'envoi de l\'e-mail du matin (0-23)'],
  ['email.destinataire', '', 'Adresse de réception (vide = compte Kompa)'],
  ['email.recap_lundi', 'oui', 'Envoi le lundi même si toutes les rubriques sont vides'],

  // Listes de valeurs (§ 4, 9)
  ['liste.statuts_affaire', 'En étude;Go;No-go;Déposée;Gagnée;Perdue;Sans suite;En exécution;Soldée',
    'Cycle des statuts d\'une affaire — à confirmer au lot 2'],
  ['liste.statuts_avis', 'nouveau;étudié;ignoré;archivé', 'Statuts d\'un avis'],
  ['liste.motifs_nogo', 'hors zone;hors compétence;références insuffisantes;délai trop court;charge;autre',
    'Motifs de No-go'],
  ['liste.types_acheteur', 'Commune;EPCI;Département;Région;État;Établissement public;Bailleur social;Autre acheteur public',
    'Types d\'acheteurs'],
  ['liste.procedures', 'MAPA;AO;Consultation directe', 'Procédures'],
  ['liste.statuts_relance', 'à faire;faite;sans objet', 'Statuts d\'une relance'],
  ['liste.pieces_types', 'note méthodologique;CV;références;prix', 'Pièces-types à améliorer'],

  // Sauvegarde (§ 2)
  ['sauvegarde.nb_copies', '8', 'Nombre de copies hebdomadaires conservées dans Drive'],

  // Application
  ['app.favicon_url', '', 'URL publique (PNG) du symbole Kompa pour l\'onglet et l\'écran d\'accueil']
];

var Params_cache_ = null;

/** { clé: valeur } de tous les paramètres (mémorisé pour l'exécution en cours). */
function Params_tous() {
  if (Params_cache_) return Params_cache_;
  var map = {};
  Db_lire(TABLES.PARAMETRES).forEach(function (l) { map[String(l.cle)] = l.valeur; });
  Params_cache_ = map;
  return map;
}

function Params_texte(cle, defaut) {
  var v = Params_tous()[cle];
  return v === undefined || v === null || v === '' ? (defaut === undefined ? '' : defaut) : String(v);
}

function Params_nombre(cle, defaut) {
  var t = Params_texte(cle, '').replace(/\s/g, '').replace(',', '.');
  var n = Number(t);
  return t === '' || isNaN(n) ? (defaut === undefined ? null : defaut) : n;
}

function Params_liste(cle) {
  return Params_texte(cle, '')
    .split(SEP_LISTE)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; });
}

/** Enregistre la valeur d'une clé existante. Les clés se créent par installer(), pas depuis l'app. */
function Params_enregistrer(cle, valeur) {
  cle = String(cle || '').trim();
  if (!cle) throw new Error('Clé de paramètre vide.');
  if (!Db_trouver(TABLES.PARAMETRES, cle)) throw new Error('Paramètre inconnu : ' + cle);
  var v = valeur === null || valeur === undefined ? '' : String(valeur).trim();
  if (v.indexOf(SEP_LISTE) >= 0) {
    v = v.split(SEP_LISTE).map(function (s) { return s.trim(); }).filter(String).join(SEP_LISTE);
  }
  var ligne = Db_maj(TABLES.PARAMETRES, cle, { valeur: v });
  Params_cache_ = null;
  return ligne;
}

/** Ajoute les paramètres par défaut absents. Renvoie le nombre de clés ajoutées. */
function Params_initialiser_() {
  var existants = {};
  Db_lire(TABLES.PARAMETRES).forEach(function (l) { existants[String(l.cle)] = true; });
  var nouveaux = PARAMETRES_DEFAUT
    .filter(function (p) { return !existants[p[0]]; })
    .map(function (p) { return { cle: p[0], valeur: p[1], commentaire: p[2] }; });
  Db_insererPlusieurs(TABLES.PARAMETRES, nouveaux);
  Params_cache_ = null;
  return nouveaux.length;
}
