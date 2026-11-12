/* Kompa Affaires 1.0.0-lot1 — fichier généré par tools/build.js depuis src/. Ne pas modifier ici. */

// ════════ Compteur.js ════════

/**
 * Compteur de CA de l'année civile face aux seuils (§ 7).
 *
 * - Encaissé : somme des montants encaissés dans l'année (onglet Factures,
 *   date_encaissement). C'est la base légale des seuils de la micro-entreprise
 *   et de la franchise de TVA pour des prestations de services.
 * - Engagé : encaissé + factures émises non encore payées + reste à facturer
 *   sur les affaires gagnées. Sert à ne pas signer une mission qui ferait
 *   dépasser un seuil.
 */

/** Statuts d'affaire dont le montant notifié compte dans le CA engagé (Gagnée = notifiée et en exécution). */
var STATUTS_CA_ENGAGE = ['Gagnée'];

function Compteur_ca(annee) {
  var aujourdhui = new Date();
  annee = annee || Number(Utilities.formatDate(aujourdhui, APP.FUSEAU, 'yyyy'));

  var factures = Db_lire(TABLES.FACTURES);
  var affaires = Db_lire(TABLES.AFFAIRES);

  var encaisse = 0, factureAnnee = 0, aEncaisser = 0;
  var factureParAffaire = {};
  factures.forEach(function (f) {
    var montant = montant_(f.montant);
    var paye = montant_(f.montant_encaisse);
    var dEnc = date_(f.date_encaissement);
    var dFac = date_(f.date);
    if (dEnc && anneeDe_(dEnc) === annee) encaisse += paye;
    if (dFac && anneeDe_(dFac) === annee) factureAnnee += montant;
    if (!dEnc) aEncaisser += Math.max(montant - paye, 0);
    if (f.id_affaire) factureParAffaire[f.id_affaire] = (factureParAffaire[f.id_affaire] || 0) + montant;
  });

  var resteAFacturer = 0, signeAnnee = 0;
  affaires.forEach(function (a) {
    var notifie = montant_(a.montant_notifie);
    var dNotif = date_(a.date_notification);
    if (dNotif && anneeDe_(dNotif) === annee) signeAnnee += notifie;
    if (STATUTS_CA_ENGAGE.indexOf(String(a.statut)) >= 0) {
      resteAFacturer += Math.max(notifie - (factureParAffaire[a.id] || 0), 0);
    }
  });

  var engage = encaisse + aEncaisser + resteAFacturer;
  var alerte = Params_nombre('seuil.alerte_pct', 80) / 100;

  var jalons = [
    { cle: 'seuil.tva_franchise', libelle: 'Franchise de TVA', consequence: 'Au-delà : TVA à facturer à partir du 1er janvier suivant.' },
    { cle: 'seuil.tva_majore', libelle: 'Franchise de TVA — seuil majoré', consequence: 'Au-delà : TVA à facturer dès le jour du dépassement.' },
    { cle: 'seuil.plafond_vise', libelle: 'Plafond visé', consequence: 'Votre limite de CA pour l\'année.', vise: true },
    { cle: 'seuil.micro_plafond', libelle: 'Plafond micro-entreprise', consequence: 'Dépassé deux années de suite : sortie du régime micro.' }
  ].map(function (j) {
    var seuil = Params_nombre(j.cle, 0);
    return {
      cle: j.cle,
      libelle: j.libelle,
      consequence: j.consequence,
      vise: !!j.vise,
      seuil: seuil,
      reste: seuil - encaisse,
      resteEngage: seuil - engage,
      etat: etat_(encaisse, seuil, alerte),
      etatEngage: etat_(engage, seuil, alerte)
    };
  }).filter(function (j) { return j.seuil > 0; });

  var prochain = jalons.filter(function (j) { return j.etat !== 'depasse'; })[0] || null;

  return {
    annee: annee,
    encaisse: arrondi_(encaisse),
    facture: arrondi_(factureAnnee),
    signe: arrondi_(signeAnnee),
    aEncaisser: arrondi_(aEncaisser),
    resteAFacturer: arrondi_(resteAFacturer),
    engage: arrondi_(engage),
    alertePct: alerte * 100,
    jalons: jalons,
    prochain: prochain ? prochain.cle : null
  };
}

function etat_(valeur, seuil, alerte) {
  if (!seuil) return 'ok';
  if (valeur > seuil) return 'depasse';
  if (valeur >= seuil * alerte) return 'alerte';
  return 'ok';
}

/** Montant saisi à la main : nombre, ou texte « 12 500,50 € ». */
function montant_(v) {
  if (typeof v === 'number') return v;
  var t = String(v || '').replace(/[\s  €]/g, '').replace(',', '.');
  var n = Number(t);
  return t === '' || isNaN(n) ? 0 : n;
}

/** Date saisie à la main : objet Date, « jj/mm/aaaa » ou ISO. */
function date_(v) {
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? null : v;
  var m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  var d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function anneeDe_(d) {
  return Number(Utilities.formatDate(d, APP.FUSEAU, 'yyyy'));
}

function arrondi_(n) {
  return Math.round(n * 100) / 100;
}


// ════════ Config.js ════════

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


// ════════ Db.js ════════

/**
 * Accès au classeur : une table = un onglet, une ligne = un objet.
 * Ligne 1 = noms de colonnes (identifiants techniques, ne pas renommer à la main).
 */

var Db_cache_ = { classeur: null };

/** Classeur de données. Lève une erreur claire si installer() n'a pas été lancé. */
function Db_classeur() {
  if (Db_cache_.classeur) return Db_cache_.classeur;
  var id = PropertiesService.getScriptProperties().getProperty(APP.PROP_CLASSEUR_ID);
  if (!id) {
    throw new Error('Classeur introuvable : lancez la fonction installer() depuis l\'éditeur Apps Script.');
  }
  Db_cache_.classeur = SpreadsheetApp.openById(id);
  return Db_cache_.classeur;
}

function Db_onglet_(table) {
  var onglet = Db_classeur().getSheetByName(table.onglet);
  if (!onglet) {
    throw new Error('Onglet « ' + table.onglet + ' » absent : relancez installer().');
  }
  return onglet;
}

/** En-têtes réels de l'onglet (ordre du classeur, pas celui du code). */
function Db_entetes_(onglet) {
  var nb = onglet.getLastColumn();
  if (nb === 0) return [];
  return onglet.getRange(1, 1, 1, nb).getValues()[0].map(function (v) { return String(v).trim(); });
}

/** Toutes les lignes d'une table, en objets. */
function Db_lire(table) {
  var onglet = Db_onglet_(table);
  var entetes = Db_entetes_(onglet);
  var nbLignes = onglet.getLastRow() - 1;
  if (nbLignes < 1 || entetes.length === 0) return [];
  var valeurs = onglet.getRange(2, 1, nbLignes, entetes.length).getValues();
  return valeurs
    .filter(function (ligne) { return ligne.some(function (v) { return v !== '' && v !== null; }); })
    .map(function (ligne) {
      var obj = {};
      entetes.forEach(function (nom, i) { if (nom) obj[nom] = ligne[i]; });
      return obj;
    });
}

/** Ligne dont la clé vaut `valeur`, ou null. */
function Db_trouver(table, valeur) {
  var lignes = Db_lire(table);
  for (var i = 0; i < lignes.length; i++) {
    if (String(lignes[i][table.cle]) === String(valeur)) return lignes[i];
  }
  return null;
}

/** Identifiant unique : PRÉFIXE-aaaammjj-xxxxxx. */
function Db_nouvelId(table) {
  var date = Utilities.formatDate(new Date(), APP.FUSEAU, 'yyyyMMdd');
  var alea = Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
  return (table.prefixe || 'ID') + '-' + date + '-' + alea;
}

/** Ajoute une ligne. Renseigne la clé (si absente), cree_le et modifie_le. */
function Db_inserer(table, obj) {
  return Db_insererPlusieurs(table, [obj])[0];
}

/** Ajoute plusieurs lignes en une seule écriture. */
function Db_insererPlusieurs(table, objets) {
  if (!objets.length) return [];
  return Db_verrou_(function () {
    var onglet = Db_onglet_(table);
    var entetes = Db_entetes_(onglet);
    var maintenant = new Date();
    var lignes = objets.map(function (obj) {
      var ligne = Object.assign({}, obj);
      if (!ligne[table.cle]) ligne[table.cle] = Db_nouvelId(table);
      ligne.cree_le = maintenant;
      ligne.modifie_le = maintenant;
      return ligne;
    });
    var valeurs = lignes.map(function (ligne) {
      return entetes.map(function (nom) {
        return ligne[nom] === undefined || ligne[nom] === null ? '' : ligne[nom];
      });
    });
    onglet.getRange(onglet.getLastRow() + 1, 1, valeurs.length, entetes.length).setValues(valeurs);
    return lignes;
  });
}

/** Met à jour les champs fournis de la ligne de clé `valeurCle`. Renvoie la ligne complète. */
function Db_maj(table, valeurCle, champs) {
  return Db_verrou_(function () {
    var onglet = Db_onglet_(table);
    var entetes = Db_entetes_(onglet);
    var iCle = entetes.indexOf(table.cle);
    var nbLignes = onglet.getLastRow() - 1;
    if (iCle < 0 || nbLignes < 1) throw new Error('Ligne introuvable : ' + valeurCle);
    var cles = onglet.getRange(2, iCle + 1, nbLignes, 1).getValues();
    var rang = -1;
    for (var i = 0; i < cles.length; i++) {
      if (String(cles[i][0]) === String(valeurCle)) { rang = i + 2; break; }
    }
    if (rang < 0) throw new Error('Ligne introuvable : ' + valeurCle);

    var plage = onglet.getRange(rang, 1, 1, entetes.length);
    var valeurs = plage.getValues()[0];
    var maj = Object.assign({}, champs, { modifie_le: new Date() });
    delete maj[table.cle];
    delete maj.cree_le;
    Object.keys(maj).forEach(function (nom) {
      var j = entetes.indexOf(nom);
      if (j >= 0) valeurs[j] = maj[nom] === undefined || maj[nom] === null ? '' : maj[nom];
    });
    plage.setValues([valeurs]);

    var obj = {};
    entetes.forEach(function (nom, j) { if (nom) obj[nom] = valeurs[j]; });
    return obj;
  });
}

/** Exécute `fn` sous verrou de script (écritures concurrentes moteur / app). */
function Db_verrou_(fn) {
  var verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush();
    verrou.releaseLock();
  }
}


// ════════ Params.js ════════

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
  ['liste.statuts_affaire', 'En étude;Go;No-go;Abandonnée;Déposée;Gagnée;Perdue;Sans suite;Soldée',
    'Cycle des statuts d\'une affaire (Gagnée = notifiée et en exécution)'],
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


// ════════ Setup.js ════════

/**
 * Installation et maintenance du socle (lot 1).
 *
 * installer() est idempotent : on peut le relancer à chaque mise à jour du code.
 * Il crée le classeur s'il n'existe pas, crée les onglets et colonnes manquants,
 * ajoute les paramètres manquants et (ré)installe les déclencheurs.
 */

function installer() {
  var debut = Date.now();
  var classeur = Setup_classeur_();
  var rapport = { classeur: classeur.getUrl(), onglets: [], colonnesAjoutees: 0 };

  Object.keys(TABLES).forEach(function (k) {
    var r = Setup_onglet_(classeur, TABLES[k]);
    rapport.onglets.push(TABLES[k].onglet + (r.cree ? ' (créé)' : ''));
    rapport.colonnesAjoutees += r.colonnesAjoutees;
  });
  Setup_supprimerFeuilleVide_(classeur);

  rapport.parametresAjoutes = Params_initialiser_();
  rapport.declencheurs = Setup_declencheurs_();
  rapport.duree_s = Math.round((Date.now() - debut) / 100) / 10;

  console.log(JSON.stringify(rapport, null, 2));
  return rapport;
}

/** Ouvre le classeur enregistré ou en crée un nouveau. */
function Setup_classeur_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(APP.PROP_CLASSEUR_ID);
  if (id) {
    try {
      var existant = SpreadsheetApp.openById(id);
      Db_cache_.classeur = existant;
      return existant;
    } catch (e) {
      throw new Error('Le classeur ' + id + ' est inaccessible (supprimé ?). ' +
        'Restaurez-le depuis la corbeille Drive, ou supprimez la propriété ' +
        APP.PROP_CLASSEUR_ID + ' du script pour en créer un nouveau.');
    }
  }
  var classeur = SpreadsheetApp.create(APP.CLASSEUR);
  classeur.setSpreadsheetTimeZone(APP.FUSEAU);
  classeur.setSpreadsheetLocale('fr_FR');
  props.setProperty(APP.PROP_CLASSEUR_ID, classeur.getId());
  Db_cache_.classeur = classeur;
  return classeur;
}

/** Crée l'onglet et ajoute les colonnes manquantes en fin de ligne d'en-tête. */
function Setup_onglet_(classeur, table) {
  var onglet = classeur.getSheetByName(table.onglet);
  var cree = false;
  if (!onglet) {
    onglet = classeur.insertSheet(table.onglet);
    cree = true;
  }

  var attendues = colonnesTable_(table);
  var presentes = Db_entetes_(onglet).filter(String);
  var manquantes = attendues.filter(function (c) { return presentes.indexOf(c) < 0; });

  if (manquantes.length) {
    var depart = presentes.length + 1;
    var besoin = depart + manquantes.length - 1;
    if (onglet.getMaxColumns() < besoin) {
      onglet.insertColumnsAfter(onglet.getMaxColumns(), besoin - onglet.getMaxColumns());
    }
    onglet.getRange(1, depart, 1, manquantes.length).setValues([manquantes]);
  }

  var nbCol = presentes.length + manquantes.length;
  onglet.getRange(1, 1, 1, nbCol)
    .setFontWeight('bold')
    .setBackground(THEME_CLASSEUR.ENTETE_FOND)
    .setFontColor(THEME_CLASSEUR.ENTETE_TEXTE)
    .setFontFamily(THEME_CLASSEUR.POLICE);
  onglet.setFrozenRows(1);

  (table.texteBrut || []).forEach(function (nom) {
    var j = presentes.concat(manquantes).indexOf(nom);
    if (j >= 0) onglet.getRange(2, j + 1, onglet.getMaxRows() - 1, 1).setNumberFormat('@');
  });

  return { cree: cree, colonnesAjoutees: cree ? 0 : manquantes.length };
}

/** Supprime la feuille par défaut (« Feuille 1 » / « Sheet1 ») si elle est vide. */
function Setup_supprimerFeuilleVide_(classeur) {
  var noms = Object.keys(TABLES).map(function (k) { return TABLES[k].onglet; });
  classeur.getSheets().forEach(function (f) {
    if (noms.indexOf(f.getName()) < 0 && f.getLastRow() === 0 && classeur.getSheets().length > 1) {
      classeur.deleteSheet(f);
    }
  });
}

/**
 * Déclencheurs du lot 1 : sauvegarde hebdomadaire (lundi, 5 h).
 * La collecte (6 h) et l'e-mail (7 h) seront ajoutés aux lots 3 et 4.
 */
function Setup_declencheurs_() {
  var voulus = [
    {
      fonction: 'sauvegardeHebdo',
      creer: function () {
        return ScriptApp.newTrigger('sauvegardeHebdo').timeBased()
          .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).inTimezone(APP.FUSEAU).create();
      }
    }
  ];
  var existants = ScriptApp.getProjectTriggers();
  return voulus.map(function (v) {
    existants
      .filter(function (t) { return t.getHandlerFunction() === v.fonction; })
      .forEach(function (t) { ScriptApp.deleteTrigger(t); });
    v.creer();
    return v.fonction;
  });
}

/** Copie datée du classeur dans le dossier Drive des sauvegardes ; conserve les N dernières. */
function sauvegardeHebdo() {
  var classeur = Db_classeur();
  var dossier = Setup_dossierSauvegardes_();
  var horodatage = Utilities.formatDate(new Date(), APP.FUSEAU, 'yyyy-MM-dd');
  DriveApp.getFileById(classeur.getId()).makeCopy(APP.CLASSEUR + ' — ' + horodatage, dossier);

  var aGarder = Params_nombre('sauvegarde.nb_copies', 8);
  var copies = [];
  var it = dossier.getFiles();
  while (it.hasNext()) copies.push(it.next());
  copies.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  copies.slice(aGarder).forEach(function (f) { f.setTrashed(true); });

  console.log('Sauvegarde ' + horodatage + ' : ' + Math.min(copies.length, aGarder) + ' copie(s) conservée(s).');
}

function Setup_dossierSauvegardes_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(APP.PROP_DOSSIER_SAUVEGARDES_ID);
  if (id) {
    try {
      var d = DriveApp.getFolderById(id);
      if (!d.isTrashed()) return d;
    } catch (e) { /* recréé ci-dessous */ }
  }
  var dossier = DriveApp.createFolder(APP.DOSSIER_SAUVEGARDES);
  props.setProperty(APP.PROP_DOSSIER_SAUVEGARDES_ID, dossier.getId());
  return dossier;
}


// ════════ WebApp.js ════════

/**
 * Web app : point d'entrée HTTP et fonctions appelées par l'interface (google.script.run).
 *
 * Accès : le manifeste limite la web app au seul compte propriétaire
 * (access MYSELF, executeAs USER_DEPLOYING). verifierAcces_() double ce contrôle.
 */

function doGet() {
  verifierAcces_();
  var sortie = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP.NOM)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-title', APP.NOM);
  try {
    var favicon = Params_texte('app.favicon_url', '');
    if (favicon) sortie.setFaviconUrl(favicon);
  } catch (e) {
    // Classeur pas encore installé : la page s'affiche quand même et signale l'erreur.
  }
  return sortie;
}

/** Inclusion d'un fichier HTML dans le gabarit : <?!= include('Styles'); ?> */
function include(nom) {
  return HtmlService.createHtmlOutputFromFile(nom).getContent();
}

function verifierAcces_() {
  var proprietaire = Session.getEffectiveUser().getEmail();
  var visiteur = Session.getActiveUser().getEmail();
  if (proprietaire && visiteur && proprietaire !== visiteur) {
    throw new Error('Accès réservé au compte Kompa.');
  }
}

/**
 * Enveloppe commune des appels : contrôle d'accès, gestion d'erreur,
 * sérialisation (google.script.run ne transmet pas les objets Date).
 */
function repondre_(fn) {
  try {
    verifierAcces_();
    return JSON.parse(JSON.stringify({ ok: true, data: fn() }));
  } catch (e) {
    console.error(e && e.stack ? e.stack : e);
    return { ok: false, erreur: String(e && e.message ? e.message : e) };
  }
}

// ——— API du lot 1 ———

/** État du socle : compte, classeur, onglets, quotas. */
function apiEtat() {
  return repondre_(function () {
    var classeur = Db_classeur();
    var onglets = Object.keys(TABLES).map(function (k) {
      var f = classeur.getSheetByName(TABLES[k].onglet);
      return { nom: TABLES[k].onglet, present: !!f, lignes: f ? Math.max(f.getLastRow() - 1, 0) : 0 };
    });
    return {
      app: APP.NOM,
      version: APP.VERSION,
      compte: Session.getEffectiveUser().getEmail(),
      classeur: { nom: classeur.getName(), url: classeur.getUrl() },
      onglets: onglets,
      quotaEmailRestant: MailApp.getRemainingDailyQuota(),
      declencheurs: ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }),
      maintenant: new Date()
    };
  });
}

/** Liste des paramètres, groupés pour l'écran Paramètres. */
function apiParametres() {
  return repondre_(function () {
    var lignes = Db_lire(TABLES.PARAMETRES).map(function (l) {
      return {
        cle: String(l.cle),
        valeur: l.valeur === null ? '' : String(l.valeur),
        commentaire: String(l.commentaire || ''),
        modifie_le: l.modifie_le
      };
    });
    var groupes = GROUPES_PARAMETRES.map(function (g) {
      return { prefixe: g[0], titre: g[1], parametres: [] };
    });
    var autres = { prefixe: '', titre: 'Autres', parametres: [] };
    lignes.forEach(function (p) {
      var prefixe = p.cle.split('.')[0];
      var groupe = groupes.filter(function (g) { return g.prefixe === prefixe; })[0] || autres;
      groupe.parametres.push(p);
    });
    if (autres.parametres.length) groupes.push(autres);
    return groupes.filter(function (g) { return g.parametres.length; });
  });
}

/** Enregistre la valeur d'un paramètre existant. */
function apiParametreEnregistrer(cle, valeur) {
  return repondre_(function () {
    var l = Params_enregistrer(cle, valeur);
    return { cle: String(l.cle), valeur: String(l.valeur), commentaire: String(l.commentaire || ''), modifie_le: l.modifie_le };
  });
}

/** Compteur de CA de l'année civile face aux seuils. */
function apiCompteurCA() {
  return repondre_(function () { return Compteur_ca(); });
}
