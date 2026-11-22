/* Kartes Affaires 1.6.0 — fichier généré par tools/build.js depuis src/. Ne pas modifier ici. */

// ════════ Setup.js ════════

/**
 * Installation et maintenance du socle (lot 1).
 *
 * installer() est idempotent : on peut le relancer à chaque mise à jour du code.
 * Il crée le classeur s'il n'existe pas, crée les onglets et colonnes manquants,
 * ajoute les paramètres manquants et (ré)installe les déclencheurs.
 */

function installer(options) {
  var debut = Date.now();
  Db_viderCache_();
  var classeur = Setup_classeur_('SUIVI');
  var classeurEst = Setup_classeur_('EST');
  var rapport = { classeur: classeur.getUrl(), classeurEstimation: classeurEst.getUrl(), onglets: [], colonnesAjoutees: 0 };

  var tables = Tables_toutes_();
  Object.keys(tables).forEach(function (k) {
    var t = tables[k];
    var r = Setup_onglet_(t.classeur === 'EST' ? classeurEst : classeur, t);
    rapport.onglets.push(t.onglet + (r.cree ? ' (créé)' : ''));
    rapport.colonnesAjoutees += r.colonnesAjoutees;
  });
  Setup_supprimerFeuilleVide_(classeur, 'SUIVI');
  Setup_supprimerFeuilleVide_(classeurEst, 'EST');
  if (typeof Est_installer_ === 'function') {
    try { rapport.estimation = Est_installer_(); } catch (e) { rapport.estimation = 'erreur : ' + e.message; }
  }

  rapport.parametresAjoutes = Params_initialiser_();
  rapport.parametresMisAJour = Params_migrer_();
  try { rapport.avisRefiltres = Veille_refiltrer_(); } catch (e) { rapport.avisRefiltres = 'erreur : ' + e.message; }
  // Affaire d'exercice Mouthe (§ 11) : créée si absente
  if (!(options && options.exercice === false)) {
    try { rapport.exerciceMouthe = creerAffaireExerciceMouthe(); } catch (e) { rapport.exerciceMouthe = 'erreur : ' + e.message; }
  }
  // Dossiers Drive des affaires existantes
  try { rapport.dossiersDrive = creerDossiersManquants(); } catch (e) { rapport.dossiersDrive = 'erreur : ' + e.message; }
  rapport.declencheurs = Setup_declencheurs_();
  // Classeur à jour pour cette version : la mise à jour automatique n'a rien à refaire
  try { PropertiesService.getScriptProperties().setProperty(MAJ_PROP_SIGNATURE, MiseAJour_signature_()); } catch (e) { /* sans effet */ }
  rapport.duree_s = Math.round((Date.now() - debut) / 100) / 10;

  console.log(JSON.stringify(rapport, null, 2));
  return rapport;
}

/** Ouvre le classeur enregistré (SUIVI ou EST) ou en crée un nouveau. */
function Setup_classeur_(cle) {
  var def = CLASSEURS[cle || 'SUIVI'];
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(def.prop);
  if (id) {
    try {
      var existant = SpreadsheetApp.openById(id);
      Db_cache_.classeurs[cle || 'SUIVI'] = existant;
      return existant;
    } catch (e) {
      throw new Error('Le classeur ' + id + ' est inaccessible (supprimé ?). ' +
        'Restaurez-le depuis la corbeille Drive, ou supprimez la propriété ' +
        def.prop + ' du script pour en créer un nouveau.');
    }
  }
  var classeur = SpreadsheetApp.create(def.nom);
  classeur.setSpreadsheetTimeZone(APP.FUSEAU);
  classeur.setSpreadsheetLocale('fr_FR');
  props.setProperty(def.prop, classeur.getId());
  Db_cache_.classeurs[cle || 'SUIVI'] = classeur;
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
function Setup_supprimerFeuilleVide_(classeur, cle) {
  var tables = Tables_toutes_();
  var noms = Object.keys(tables)
    .filter(function (k) { return (tables[k].classeur || 'SUIVI') === cle; })
    .map(function (k) { return tables[k].onglet; });
  classeur.getSheets().forEach(function (f) {
    if (noms.indexOf(f.getName()) < 0 && f.getLastRow() === 0 && classeur.getSheets().length > 1) {
      classeur.deleteSheet(f);
    }
  });
}

/**
 * Bascule vers un autre compte Google (22/11/2026) : à lancer depuis l'éditeur avec l'ANCIEN compte.
 * Supprime les déclencheurs (collecte, e-mail du matin, sauvegarde, index) de ce compte, pour que la veille
 * ne tourne pas en double une fois le nouveau compte installé. Ne touche à aucune donnée.
 */
function arreterDeclencheursDeCeCompte() {
  var t = ScriptApp.getProjectTriggers();
  t.forEach(function (x) { ScriptApp.deleteTrigger(x); });
  var msg = t.length + ' déclencheur(s) supprimé(s) pour ' + Session.getEffectiveUser().getEmail() + '. Les données ne sont pas modifiées.';
  console.log(msg);
  return msg;
}

/**
 * Déclencheurs : sauvegarde hebdomadaire (lundi, 5 h), collecte de la veille (6 h, paramètre).
 * et e-mail du matin (7 h, paramètre ; l'envoi vérifie le jour de la semaine).
 */
function Setup_declencheurs_(seulement) {
  var voulus = [
    {
      fonction: 'sauvegardeHebdo',
      creer: function () {
        return ScriptApp.newTrigger('sauvegardeHebdo').timeBased()
          .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).inTimezone(APP.FUSEAU).create();
      }
    }
    ,
    {
      fonction: 'collecteQuotidienne',
      creer: function () {
        return ScriptApp.newTrigger('collecteQuotidienne').timeBased()
          .everyDays(1).atHour(Params_nombre('veille.heure_collecte', 6)).inTimezone(APP.FUSEAU).create();
      }
    },
    {
      fonction: 'envoyerEmailMatin',
      creer: function () {
        return ScriptApp.newTrigger('envoyerEmailMatin').timeBased()
          .everyDays(1).atHour(Params_nombre('email.heure', 7)).inTimezone(APP.FUSEAU).create();
      }
    }
  ];
  // Module Estimation (Estimation.gs) : mise à jour mensuelle des index Insee
  if (typeof Est_declencheurs_ === 'function') voulus = voulus.concat(Est_declencheurs_());
  // Mise à jour automatique : seulement les déclencheurs absents (les autres ne sont pas touchés)
  if (seulement) voulus = voulus.filter(function (v) { return seulement.indexOf(v.fonction) >= 0; });
  var existants = ScriptApp.getProjectTriggers();
  return voulus.map(function (v) {
    existants
      .filter(function (t) { return t.getHandlerFunction() === v.fonction; })
      .forEach(function (t) { ScriptApp.deleteTrigger(t); });
    v.creer();
    return v.fonction;
  });
}

/**
 * Copie datée de chaque classeur (suivi et estimation) dans le dossier Drive des sauvegardes ;
 * conserve les N dernières copies de chacun.
 */
function sauvegardeHebdo() {
  var dossier = Setup_dossierSauvegardes_();
  var horodatage = Utilities.formatDate(new Date(), APP.FUSEAU, 'yyyy-MM-dd');
  var aGarder = Params_nombre('sauvegarde.nb_copies', 8);
  var props = PropertiesService.getScriptProperties();
  Object.keys(CLASSEURS).forEach(function (cle) {
    var def = CLASSEURS[cle];
    if (!props.getProperty(def.prop)) return; // classeur pas encore créé
    DriveApp.getFileById(Db_classeur(cle).getId()).makeCopy(def.nom + ' — ' + horodatage, dossier);
    var copies = [];
    var it = dossier.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      var nomF = String(f.getName());
      if (nomF.indexOf(def.nom + ' — ') === 0 || nomF.indexOf(def.nom.replace(/^Kartes/, APP.ANCIEN_NOM) + ' — ') === 0) copies.push(f);
    }
    copies.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
    copies.slice(aGarder).forEach(function (f) { f.setTrashed(true); });
    console.log('Sauvegarde ' + def.nom + ' ' + horodatage + ' : ' + Math.min(copies.length, aGarder) + ' copie(s) conservée(s).');
  });
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


// ════════ Affaires.js ════════

/**
 * Module Affaires (§ 4) : création, fiche, cycle des statuts et règles de passage.
 *
 * Cycle validé le 12/11/2026 :
 *   En étude → Go → Déposée → Gagnée → Soldée
 *       ↘ No-go  ↘ Abandonnée   ↘ Perdue
 *                               ↘ Sans suite
 * Chaque changement de statut est horodaté dans l'onglet Historique.
 */

var STATUTS = {
  EN_ETUDE: 'En étude',
  GO: 'Go',
  NOGO: 'No-go',
  ABANDONNEE: 'Abandonnée',
  DEPOSEE: 'Déposée',
  GAGNEE: 'Gagnée',
  PERDUE: 'Perdue',
  SANS_SUITE: 'Sans suite',
  SOLDEE: 'Soldée'
};

/** Ordre d'affichage (colonnes, listes). */
var ORDRE_STATUTS = ['En étude', 'Go', 'Déposée', 'Gagnée', 'Soldée', 'Perdue', 'No-go', 'Abandonnée', 'Sans suite'];

/** Statuts « en cours » (affaire vivante) ; les autres sont clôturés. */
var STATUTS_ACTIFS = ['En étude', 'Go', 'Déposée', 'Gagnée'];

/** Famille de couleur de chaque statut (§ 10). */
var FAMILLES_STATUT = {
  'En étude': 'encours', 'Go': 'encours', 'Déposée': 'encours',
  'Gagnée': 'gagnee', 'Soldée': 'gagnee',
  'Perdue': 'perdue',
  'No-go': 'abandonnee', 'Abandonnée': 'abandonnee', 'Sans suite': 'abandonnee'
};

/** Passages autorisés. */
var TRANSITIONS = {
  'En étude': ['Go', 'No-go'],
  'Go': ['Déposée', 'Abandonnée'],
  'No-go': ['En étude'],
  'Déposée': ['Gagnée', 'Perdue', 'Sans suite'],
  'Gagnée': ['Soldée'],
  'Abandonnée': [], 'Perdue': [], 'Sans suite': [], 'Soldée': []
};

/**
 * Champs demandés au passage dans chaque statut (§ 4.1).
 * [nom, libellé, type, obligatoire, valeur par défaut]
 * Défauts : 'aujourdhui' = date du jour ; '=champ' = valeur actuelle d'un autre champ.
 */
var CHAMPS_PASSAGE = {
  'Go': [['score_final', 'Score final après lecture du DCE', 'nombre', false]],
  'No-go': [['motif_decision', 'Motif', 'liste:liste.motifs_nogo', true]],
  'Déposée': [
    ['montant_ht', 'Montant HT de l\'offre (€)', 'euros', true],
    ['montant_pondere', 'Montant pondéré (€), s\'il existe', 'euros', false],
    ['jours_reponse', 'Jours passés à répondre', 'nombre', true],
    ['date_depot', 'Date de dépôt', 'date', true, 'aujourdhui']
  ],
  'Gagnée': [
    ['date_notification', 'Date de notification', 'date', true, 'aujourdhui'],
    ['montant_notifie', 'Montant notifié HT (€)', 'euros', true, '=montant_ht']
  ],
  'Perdue': [
    ['date_resultat', 'Date de la décision', 'date', true, 'aujourdhui'],
    ['attributaire', 'Attributaire', 'texte', false],
    ['prix_attributaire', 'Prix de l\'attributaire HT (€)', 'euros', false],
    ['rang', 'Rang', 'nombre', false]
  ],
  'Sans suite': [['date_resultat', 'Date de la décision', 'date', true, 'aujourdhui']],
  'Abandonnée': [], 'Soldée': [], 'En étude': []
};

/**
 * Blocs de la fiche affaire (§ 4.2) : [nom, libellé, type, obligatoire].
 * Types : texte, long, date, nombre, euros, lien, lecture, liste:<clé de paramètre>, choix:a|b.
 */
var FICHE_BLOCS = [
  { id: 'identification', titre: 'Identification', champs: [
    ['id', 'N° interne', 'lecture'],
    ['acheteur', 'Acheteur', 'texte', true],
    ['type_acheteur', 'Type d\'acheteur', 'liste:liste.types_acheteur'],
    ['departement', 'Département', 'texte'],
    ['objet', 'Objet', 'long', true],
    ['reference_acheteur', 'Référence acheteur', 'texte'],
    ['procedure', 'Procédure', 'liste:liste.procedures'],
    ['plateforme', 'Plateforme', 'texte'],
    ['lien_avis', 'Lien vers l\'avis', 'lien'],
    ['lien_dce', 'Dossier Drive de l\'affaire', 'lien']
  ] },
  { id: 'echeances', titre: 'Échéances', champs: [
    ['date_limite_remise', 'Date limite de remise', 'date'],
    ['date_limite_questions', 'Date limite des questions', 'date'],
    ['date_visite', 'Visite de site', 'date'],
    ['validite_offre_jours', 'Validité de l\'offre (jours)', 'nombre']
  ] },
  { id: 'decision', titre: 'Décision', champs: [
    ['pre_score', 'Pré-score', 'nombre'],
    ['score_final', 'Score final', 'nombre'],
    ['decision', 'Décision', 'lecture'],
    ['motif_decision', 'Motif', 'liste:liste.motifs_nogo'],
    ['date_decision', 'Date de décision', 'date']
  ] },
  { id: 'offre', titre: 'Chiffrage', champs: [
    ['tranches', 'Tranches', 'long'],
    ['jours_par_tranche', 'Jours par tranche', 'long'],
    ['prix_jour', 'Prix par jour HT (€)', 'euros'],
    ['montant_ht', 'Montant HT (€)', 'euros'],
    ['montant_pondere', 'Montant pondéré (€)', 'euros']
  ] },
  { id: 'depot', titre: 'Dépôt', champs: [
    ['groupement', 'Candidature', 'choix:Seul|Groupement'],
    ['cotraitant', 'Cotraitant', 'texte'],
    ['date_depot', 'Date de dépôt', 'date'],
    ['jours_reponse', 'Jours passés à répondre', 'nombre']
  ] },
  { id: 'resultat', titre: 'Résultat', champs: [
    ['statut_final', 'Statut final', 'lecture'],
    ['date_resultat', 'Date de la décision', 'date'],
    ['attributaire', 'Attributaire', 'texte'],
    ['prix_attributaire', 'Prix de l\'attributaire HT (€)', 'euros'],
    ['rang', 'Rang', 'nombre'],
    ['motifs_rejet', 'Motifs du rejet', 'long']
  ] },
  { id: 'enseignements', titre: 'Enseignements', champs: [
    ['points_faibles', 'Points faibles constatés', 'long'],
    ['action_corrective', 'Action corrective', 'long'],
    ['piece_type', 'Pièce-type à améliorer', 'liste:liste.pieces_types']
  ] },
  { id: 'execution', titre: 'Exécution', champs: [
    ['date_notification', 'Date de notification', 'date'],
    ['montant_notifie', 'Montant notifié HT (€)', 'euros']
  ] },
  { id: 'journal', titre: 'Journal', champs: [] }
];

/**
 * Aide affichée sous chaque champ (fiche, nouvelle affaire, changement de statut) : [explication, exemple].
 * L'exemple s'affiche en grisé dans le champ vide.
 */
var AIDES_CHAMPS = {
  id: ['Attribué automatiquement : KI-année-numéro (KA- pour les affaires créées avant le 22/11/2026).'],
  acheteur: ['Nom de l\'acheteur tel qu\'il figure sur l\'avis.', 'Commune de Digne-les-Bains'],
  type_acheteur: ['Sert aux indicateurs : taux de réussite par type d\'acheteur.'],
  departement: ['Département du lieu de la mission, en chiffres.', '04'],
  objet: ['Intitulé de la consultation, repris de l\'avis.', 'AMO — programmation d\'une cantine scolaire'],
  reference_acheteur: ['Numéro de la consultation chez l\'acheteur (avis ou règlement de consultation). À rappeler au dépôt et dans les courriers.', '2026-SERV-012'],
  procedure: ['MAPA : procédure adaptée (la plupart des communes). AO : appel d\'offres. Consultation directe : l\'acheteur vous sollicite sans publicité.'],
  plateforme: ['Site où se trouve le DCE et où vous déposerez l\'offre.', 'achatpublic.com'],
  lien_avis: ['Adresse de l\'avis ou de la consultation sur la plateforme (copier depuis le navigateur).'],
  lien_dce: ['Rempli automatiquement à la création du dossier Drive.'],

  date_limite_remise: ['Date limite de réception des offres, dans le règlement de consultation (RC). L\'échéancier vous la rappelle.'],
  date_limite_questions: ['Dernier jour pour poser vos questions à l\'acheteur (voir le RC, souvent quelques jours avant la remise).'],
  date_visite: ['Date de la visite de site, si elle est prévue ou obligatoire (voir le RC).'],
  validite_offre_jours: ['Durée pendant laquelle votre offre vous engage, indiquée dans le RC. Sert à relancer l\'acheteur si la décision tarde.', '120'],

  pre_score: ['Calculé par la veille, sur 100 : zone, type de mission, délai, acheteur, montant.'],
  score_final: ['Votre propre note sur 100 après lecture du DCE, sur la même échelle que le pré-score. Permet de comparer et d\'ajuster le barème.', '70'],
  decision: ['Rempli au passage en Go ou No-go.'],
  motif_decision: ['Raison du No-go. Alimente les enseignements.'],
  date_decision: ['Rempli au passage en Go ou No-go.'],

  groupement: ['Seul, ou en groupement avec un autre prestataire (cotraitance).'],
  cotraitant: ['Si groupement : nom du ou des cotraitants et leur rôle.', 'Atelier Durand, architecte (mandataire)'],
  tranches: ['Découpage de la mission prévu par le marché (acte d\'engagement, CCAP) : tranche ferme, tranches optionnelles ou phases. Une ligne par tranche.',
    'TF : étude de faisabilité\nTO1 : programme\nTO2 : suivi des études de maîtrise d\'œuvre'],
  jours_par_tranche: ['Jours que vous prévoyez pour chaque tranche, une ligne par tranche avec son code (TF ferme ; TO1, TO2… ou la mention « optionnelle » sur la ligne : optionnelles). Nature modifiable et affermissement dans Mission › Marché).', 'TF : 6 j\nTO1 : 8 j\nTO2 : 10 j'],
  prix_jour: ['Votre prix de journée HT. Le montant HT se calcule tout seul avec les jours par tranche.', '400'],
  montant_ht: ['Calculé automatiquement : total des jours par tranche × prix par jour. Vous pouvez le corriger (prix arrondi, frais en sus) : c\'est le prix inscrit à l\'acte d\'engagement.', '13200'],
  repartition_ca: ['Pour le CA prévisionnel : année d\'encaissement prévue et montant HT, une ligne par année ; « reste » pour le solde. Sans répartition, tout le reste à encaisser compte sur l\'année en cours.', '2027 : 10000\n2028 : reste'],
  montant_pondere: ['Seulement si l\'acheteur compare les prix sur une simulation (détail quantitatif estimatif, DQE, ou bordereau pondéré) : montant de cette simulation. Sinon, laisser vide.'],
  jours_reponse: ['Temps passé à préparer l\'offre, en jours (une demi-journée = 0,5). Mesure le coût de vos réponses.', '2,5'],
  date_depot: ['Date du dépôt sur la plateforme, sur l\'accusé de réception.'],

  statut_final: ['Rempli au passage en Gagnée, Perdue ou Sans suite.'],
  date_resultat: ['Date de la lettre de notification ou de rejet.'],
  attributaire: ['Titulaire retenu, indiqué dans la lettre de rejet.', 'Bureau d\'études X'],
  prix_attributaire: ['Montant HT de l\'offre retenue, s\'il est connu. Sinon, demandez-le avec le courrier « motifs du rejet ».'],
  rang: ['Votre classement parmi les offres (1 = retenu).', '2'],
  motifs_rejet: ['Motifs donnés par l\'acheteur, avec vos notes et celles de l\'attributaire si elles sont communiquées.'],

  points_faibles: ['Ce qui vous a coûté des points, d\'après les motifs et les notes.', 'Note méthodologique trop générale sur la phase programme'],
  action_corrective: ['Ce que vous changerez à la prochaine réponse.', 'Ajouter un planning détaillé et un exemple de programme'],
  piece_type: ['Pièce de votre dossier-type à retravailler.'],

  date_notification: ['Date de réception du marché signé par l\'acheteur (notification) : point de départ de l\'exécution.'],
  montant_notifie: ['Montant HT du marché notifié. Compte dans le compteur de CA.']
};

/** Champs du formulaire court « Nouvelle affaire ». */
var CHAMPS_CREATION = ['acheteur', 'type_acheteur', 'departement', 'objet', 'procedure',
  'date_limite_remise', 'lien_avis', 'reference_acheteur'];

// ——— Lecture ———

function Affaires_lister() {
  return Db_lire(TABLES.AFFAIRES);
}

function Affaires_get_(id) {
  var a = Db_trouver(TABLES.AFFAIRES, id);
  if (!a) throw new Error('Affaire introuvable : ' + id);
  return a;
}

function Affaires_fiche(id) {
  var a = Affaires_get_(id);
  var filtre = function (l) { return String(l.id_affaire) === String(id); };
  var factures = Db_lire(TABLES.FACTURES).filter(filtre);
  var facture = factures.reduce(function (s, f) { return s + montant_(f.montant); }, 0);
  var encaisse = factures.reduce(function (s, f) { return s + montant_(f.montant_encaisse); }, 0);
  return {
    affaire: a,
    historique: Db_lire(TABLES.HISTORIQUE).filter(filtre)
      .sort(function (x, y) { return new Date(x.date) - new Date(y.date); }),
    criteres: Db_lire(TABLES.CRITERES).filter(filtre),
    factures: factures,
    relances: Db_lire(TABLES.RELANCES).filter(filtre),
    pieces: PiecesOffre_lister(id),
    livrables: Livrables_lister(id),
    totaux: {
      facture: arrondi_(facture),
      encaisse: arrondi_(encaisse),
      resteAFacturer: arrondi_(Math.max(montant_(a.montant_notifie) - facture, 0))
    },
    transitions: TRANSITIONS[a.statut] || []
  };
}

// ——— Création et modification ———

/**
 * N° interne suivant pour l'année : KI-AAAA-NNN (Kartes Ingénierie). Les affaires créées avant le renommage
 * gardent leur n° KA- ; la numérotation de l'année continue à la suite des deux (pas de doublon de numéro).
 */
var AFFAIRE_PREFIXE = 'KI';
function Affaires_prochainNumero_(annee) {
  var max = 0;
  var re = new RegExp('^K[AI]-' + annee + '-(\\d{3,})$');
  Affaires_lister().forEach(function (a) {
    var m = String(a.id).match(re);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return AFFAIRE_PREFIXE + '-' + annee + '-' + ('00' + (max + 1)).slice(-3);
}

/**
 * Crée une affaire au statut « En étude ».
 * options.date : date de création simulée (affaire saisie a posteriori).
 */
function Affaires_creer(donnees, options) {
  options = options || {};
  var champs = depuisClient_(TABLES.AFFAIRES, donnees);
  if (!champs.acheteur) throw new Error('L\'acheteur est obligatoire.');
  if (!champs.objet) throw new Error('L\'objet est obligatoire.');
  var quand = options.date ? date_(options.date) : new Date();
  champs.id = Affaires_prochainNumero_(Utilities.formatDate(quand, APP.FUSEAU, 'yyyy'));
  champs.statut = STATUTS.EN_ETUDE;
  champs.date_statut = quand;
  if (champs.groupement === undefined) champs.groupement = 'Seul';
  var a = Db_inserer(TABLES.AFFAIRES, champs);
  Historique_ajouter_(a.id, '', STATUTS.EN_ETUDE, quand, options.commentaire || 'Création de l\'affaire');
  Drive_preparerAffaireSansErreur_(a.id); // dossier Drive de l'affaire (année / affaire / 01, 02)
  return Affaires_get_(a.id);
}

/** Modifie les champs d'une affaire. Le statut ne change que par Affaires_changerStatut. */
/**
 * Total des jours d'un texte « Jours par tranche » : une ligne par tranche, nombre suivi de « j » ou « jours »
 * (« TF : 6 j », « TO1 : 2,5 jours »), à défaut dernier nombre de la ligne (« TF 6 »). 0 si rien n'est lu.
 */
function Affaires_joursTotal_(texte) {
  return String(texte || '').split(/\r?\n|;/).reduce(function (s, ligne) {
    var m = ligne.match(/(\d+(?:[.,]\d+)?)\s*j(?:ours?|\b|$)/i) || ligne.match(/(\d+(?:[.,]\d+)?)\s*$/);
    return s + (m ? Number(m[1].replace(',', '.')) : 0);
  }, 0);
}

/** Montant HT calculé = total des jours × prix par jour (arrondi au centime) ; null si l'un des deux manque. */
function Affaires_montantCalcule_(a) {
  var j = Affaires_joursTotal_(a.jours_par_tranche), p = Number(a.prix_jour);
  return j > 0 && p > 0 ? Math.round(j * p * 100) / 100 : null;
}

function Affaires_maj(id, donnees) {
  var avant = Affaires_get_(id);
  var champs = depuisClient_(TABLES.AFFAIRES, donnees);
  // Montant HT laissé vide : calculé à partir des jours par tranche et du prix par jour (décision du 21/11/2026)
  if ('montant_ht' in champs && (champs.montant_ht === '' || champs.montant_ht === null)) {
    var calc = Affaires_montantCalcule_({
      jours_par_tranche: 'jours_par_tranche' in champs ? champs.jours_par_tranche : avant.jours_par_tranche,
      prix_jour: 'prix_jour' in champs ? champs.prix_jour : avant.prix_jour
    });
    if (calc !== null) champs.montant_ht = calc;
  }
  ['id', 'statut', 'date_statut', 'decision', 'statut_final', 'notes', 'cree_le', 'modifie_le']
    .forEach(function (k) { delete champs[k]; });
  if ('acheteur' in champs && !champs.acheteur) throw new Error('L\'acheteur est obligatoire.');
  if ('objet' in champs && !champs.objet) throw new Error('L\'objet est obligatoire.');
  return Db_maj(TABLES.AFFAIRES, id, champs);
}

/** Ajoute une note datée au journal de l'affaire. */
function Affaires_ajouterNote(id, texte, quand) {
  texte = String(texte || '').trim();
  if (!texte) throw new Error('Note vide.');
  var a = Affaires_get_(id);
  var horo = Utilities.formatDate(quand ? date_(quand) || new Date() : new Date(), APP.FUSEAU, 'dd/MM/yyyy HH:mm');
  var notes = String(a.notes || '');
  return Db_maj(TABLES.AFFAIRES, id, { notes: (notes ? notes + '\n' : '') + '[' + horo + '] ' + texte });
}

// ——— Statuts ———

/**
 * Passe l'affaire dans un nouveau statut en appliquant les règles du § 4.1.
 * champs : valeurs demandées par CHAMPS_PASSAGE ; options.date : date simulée ;
 * options.commentaire : texte de l'historique.
 */
function Affaires_changerStatut(id, nouveau, champsSaisis, options) {
  options = options || {};
  var a = Affaires_get_(id);
  var ancien = String(a.statut);
  if ((TRANSITIONS[ancien] || []).indexOf(nouveau) < 0) {
    throw new Error('Passage impossible : « ' + ancien + ' » → « ' + nouveau + ' ».');
  }
  var quand = options.date ? date_(options.date) : new Date();
  var champs = depuisClient_(TABLES.AFFAIRES, champsSaisis || {});

  // Valeurs par défaut des champs du passage non transmis (un champ vidé exprès reste vide)
  (CHAMPS_PASSAGE[nouveau] || []).forEach(function (c) {
    var nom = c[0], defaut = c[4];
    var vide = function (v) { return v === '' || v === null || v === undefined; };
    if (!defaut || nom in champs || !vide(a[nom])) return;
    if (defaut === 'aujourdhui') champs[nom] = quand;
    else if (defaut.charAt(0) === '=') champs[nom] = vide(champs[defaut.slice(1)]) ? a[defaut.slice(1)] : champs[defaut.slice(1)];
  });

  // Champs obligatoires du passage
  var manquants = (CHAMPS_PASSAGE[nouveau] || []).filter(function (c) {
    var v = c[0] in champs ? champs[c[0]] : a[c[0]];
    return c[3] && (v === '' || v === null || v === undefined);
  }).map(function (c) { return c[1]; });
  if (manquants.length) throw new Error('À renseigner pour passer en « ' + nouveau + ' » : ' + manquants.join(', ') + '.');

  if (nouveau === STATUTS.NOGO) {
    var motifs = Params_liste('liste.motifs_nogo');
    if (motifs.length && motifs.indexOf(champs.motif_decision) < 0) throw new Error('Motif de No-go inconnu : ' + champs.motif_decision);
  }

  // Effets du passage
  if (nouveau === STATUTS.GO || nouveau === STATUTS.NOGO) {
    champs.decision = nouveau;
    if (!champs.date_decision) champs.date_decision = quand;
  }
  if (nouveau === STATUTS.EN_ETUDE) { // reprise après un No-go
    champs.decision = '';
  }
  if ([STATUTS.GAGNEE, STATUTS.PERDUE, STATUTS.SANS_SUITE].indexOf(nouveau) >= 0) {
    champs.statut_final = nouveau;
    if (!champs.date_resultat && !a.date_resultat) champs.date_resultat = champs.date_notification || quand;
  }
  champs.statut = nouveau;
  champs.date_statut = quand;
  Db_maj(TABLES.AFFAIRES, id, champs);
  Historique_ajouter_(id, ancien, nouveau, quand, options.commentaire || '');

  if (nouveau === STATUTS.PERDUE) {
    Db_inserer(TABLES.RELANCES, {
      id_affaire: id,
      type: 'Motifs du rejet',
      cle: 'motifs:' + id,
      date_prevue: champs.date_resultat || quand,
      statut: 'à faire',
      commentaire: 'Demander les motifs du rejet, les notes et le prix de l\'attributaire.'
    });
  }
  // Sous-dossiers Drive de l'étape atteinte (Go, résultat, Gagnée)
  if ([STATUTS.GO, STATUTS.GAGNEE, STATUTS.PERDUE, STATUTS.SANS_SUITE].indexOf(nouveau) >= 0) Drive_preparerAffaireSansErreur_(id);
  return Affaires_get_(id);
}

function Historique_ajouter_(idAffaire, ancien, nouveau, quand, commentaire) {
  return Db_inserer(TABLES.HISTORIQUE, {
    id_affaire: idAffaire, ancien_statut: ancien, nouveau_statut: nouveau,
    date: quand || new Date(), commentaire: commentaire || ''
  });
}

// ——— Critères, factures ———

/** Remplace les critères de notation d'une affaire. lignes : [{critere, ponderation, note_kompa, note_attributaire}] */
function Criteres_enregistrer(idAffaire, lignes) {
  Affaires_get_(idAffaire);
  var T = TABLES.CRITERES;
  Db_supprimerSi(T, function (l) { return String(l.id_affaire) === String(idAffaire); });
  var propres = (lignes || [])
    .map(function (l) { return depuisClient_(T, l); })
    .filter(function (l) { return l.critere; })
    .map(function (l) { l.id_affaire = idAffaire; return l; });
  return Db_insererPlusieurs(T, propres);
}

function Factures_ajouter(idAffaire, donnees) {
  Affaires_get_(idAffaire);
  var f = depuisClient_(TABLES.FACTURES, donnees);
  if (f.montant === '' || f.montant === undefined) throw new Error('Montant de la facture obligatoire.');
  if (!f.date) f.date = new Date();
  if (!f.date_echeance) {
    var e = new Date(f.date.getTime());
    e.setDate(e.getDate() + Params_nombre('echeance.paiement_public_j', 30));
    f.date_echeance = e;
  }
  f.id_affaire = idAffaire;
  var ligne = Db_inserer(TABLES.FACTURES, f);
  Affaires_verifierSolde_(idAffaire);
  return ligne;
}

function Factures_maj(idFacture, donnees) {
  var avant = Db_trouver(TABLES.FACTURES, idFacture);
  if (!avant) throw new Error('Facture introuvable : ' + idFacture);
  var f = depuisClient_(TABLES.FACTURES, donnees);
  delete f.id_affaire;
  var ligne = Db_maj(TABLES.FACTURES, idFacture, f);
  Affaires_verifierSolde_(avant.id_affaire);
  return ligne;
}

/** Soldée automatiquement quand l'encaissé atteint le montant notifié (§ 4.1). */
function Affaires_verifierSolde_(idAffaire) {
  var a = Affaires_get_(idAffaire);
  if (a.statut !== STATUTS.GAGNEE) return false;
  var notifie = montant_(a.montant_notifie);
  if (!notifie) return false;
  var encaisse = Db_lire(TABLES.FACTURES)
    .filter(function (f) { return String(f.id_affaire) === String(idAffaire); })
    .reduce(function (s, f) { return s + montant_(f.montant_encaisse); }, 0);
  if (encaisse + 0.005 < notifie) return false;
  Affaires_changerStatut(idAffaire, STATUTS.SOLDEE, {}, { commentaire: 'Automatique : montant notifié entièrement encaissé' });
  return true;
}


// ════════ ApiAffaires.js ════════

/**
 * API du lot 2 (Affaires), appelée par l'interface via google.script.run.
 */

/** Schéma et listes utiles à l'interface (statuts, transitions, champs, listes de valeurs). */
function Affaires_meta_() {
  var listes = {};
  ['liste.types_acheteur', 'liste.procedures', 'liste.motifs_nogo', 'liste.pieces_types']
    .forEach(function (k) { listes[k] = Params_liste(k); });
  var champ = function (c) {
    var aide = AIDES_CHAMPS[c[0]] || [];
    return { nom: c[0], libelle: c[1], type: c[2], obligatoire: !!c[3], defaut: c[4] || '', aide: aide[0] || '', exemple: aide[1] || '' };
  };
  var passage = {};
  Object.keys(CHAMPS_PASSAGE).forEach(function (s) { passage[s] = CHAMPS_PASSAGE[s].map(champ); });
  return {
    statuts: ORDRE_STATUTS,
    actifs: STATUTS_ACTIFS,
    familles: FAMILLES_STATUT,
    transitions: TRANSITIONS,
    passage: passage,
    blocs: FICHE_BLOCS.map(function (b) { return { id: b.id, titre: b.titre, champs: b.champs.map(champ) }; }),
    creation: CHAMPS_CREATION,
    listes: listes
  };
}

function affaireClient_(a) {
  return versClient_(TABLES.AFFAIRES, a);
}

function ficheClient_(id) {
  var f = Affaires_fiche(id);
  return {
    affaire: affaireClient_(f.affaire),
    historique: f.historique.map(function (l) { return versClient_(TABLES.HISTORIQUE, l); }),
    criteres: f.criteres.map(function (l) { return versClient_(TABLES.CRITERES, l); }),
    factures: f.factures.map(function (l) { return versClient_(TABLES.FACTURES, l); }),
    relances: f.relances.map(function (l) { return versClient_(TABLES.RELANCES, l); }),
    pieces: f.pieces.map(function (l) { return versClient_(TABLES.PIECES_OFFRE, l); }),
    piecesResume: PiecesOffre_resume_(f.pieces),
    livrables: f.livrables.map(function (l) { return versClient_(TABLES.LIVRABLES, l); }),
    livrablesResume: Livrables_resume_(f.livrables),
    totaux: f.totaux,
    transitions: f.transitions,
    planning: Planning_affaire(id)
  };
}

/** Liste des affaires (résumé) + méta. */
function apiAffaires() {
  return repondre_(function () {
    var resume = ['id', 'acheteur', 'departement', 'objet', 'statut', 'date_statut', 'date_limite_remise',
      'pre_score', 'score_final', 'montant_ht', 'montant_notifie', 'type_acheteur', 'procedure'];
    return {
      meta: Affaires_meta_(),
      affaires: Affaires_lister().map(function (a) {
        var c = affaireClient_(a);
        var r = {};
        resume.forEach(function (k) { r[k] = c[k] === undefined ? '' : c[k]; });
        return r;
      })
    };
  });
}

function apiAffaire(id) {
  return repondre_(function () {
    var f = ficheClient_(id);
    f.meta = Affaires_meta_();
    return f;
  });
}

function apiAffaireCreer(donnees) {
  return repondre_(function () { return affaireClient_(Affaires_creer(donnees)); });
}

function apiAffaireMaj(id, champs) {
  return repondre_(function () { Affaires_maj(id, champs); Relances_synchroniser(); return ficheClient_(id); });
}

function apiAffaireStatut(id, statut, champs, commentaire) {
  return repondre_(function () {
    Affaires_changerStatut(id, statut, champs, { commentaire: commentaire });
    if (statut === STATUTS.DEPOSEE) PiecesOffre_marquerDeposees_(id);
    Relances_synchroniser();
    return ficheClient_(id);
  });
}

function apiAffaireNote(id, texte) {
  return repondre_(function () { Affaires_ajouterNote(id, texte); return ficheClient_(id); });
}

function apiCriteres(id, lignes) {
  return repondre_(function () { Criteres_enregistrer(id, lignes); return ficheClient_(id); });
}

function apiFactureAjouter(id, facture) {
  return repondre_(function () { Factures_ajouter(id, facture); Relances_synchroniser(); return ficheClient_(id); });
}

/** Tranche optionnelle : affermie, non affermie ou remise optionnelle. */
function apiTrancheAffermir(id, tranche, etat, date) {
  return repondre_(function () { Planning_affermir(id, tranche, etat, date); return ficheClient_(id); });
}

/** Facture d'une tranche, depuis la barre de planning. */
function apiPlanningFacturer(id, tranche, facture) {
  return repondre_(function () { Planning_facturer(id, tranche, facture); Relances_synchroniser(); return ficheClient_(id); });
}

function apiFactureMaj(idAffaire, idFacture, champs) {
  return repondre_(function () { Factures_maj(idFacture, champs); Relances_synchroniser(); return ficheClient_(idAffaire); });
}

/** Pièces du dossier Drive de l'affaire (lecture). */
function apiPieces(id) {
  return repondre_(function () { return Drive_pieces(id); });
}

/** Dépôt d'un fichier depuis la fiche : { nom, type, donnees (base64) } → liste des pièces à jour. */
function apiPieceDeposer(id, sousDossier, fichier) {
  return repondre_(function () {
    var r = Drive_deposer(id, sousDossier, fichier);
    var p = Drive_pieces(id);
    p.depose = r;
    return p;
  });
}

// ——— Pièces de l'offre ———

function apiPieceOffreAjouter(id, champs) {
  return repondre_(function () { PiecesOffre_ajouter(id, champs); return ficheClient_(id); });
}

function apiPiecesOffreListeType(id) {
  return repondre_(function () { PiecesOffre_ajouterListeType(id); return ficheClient_(id); });
}

/** Liste collée (une pièce par ligne) : renvoie la fiche et le nombre de pièces ajoutées / déjà présentes. */
function apiPiecesOffreColler(id, texte) {
  return repondre_(function () { var r = PiecesOffre_collerListe(id, texte); return Object.assign(ficheClient_(id), { collage: r }); });
}

function apiPieceOffreMaj(id, idPiece, champs) {
  return repondre_(function () { PiecesOffre_maj(id, idPiece, champs); return ficheClient_(id); });
}

function apiPieceOffreSupprimer(id, idPiece) {
  return repondre_(function () { PiecesOffre_supprimer(id, idPiece); return ficheClient_(id); });
}

// ——— Livrables de la mission ———

function apiLivrableAjouter(id, champs) {
  return repondre_(function () { Livrables_ajouter(id, champs); return ficheClient_(id); });
}

function apiLivrableMaj(id, idLivrable, champs) {
  return repondre_(function () { Livrables_maj(id, idLivrable, champs); return ficheClient_(id); });
}

function apiLivrableSupprimer(id, idLivrable) {
  return repondre_(function () { Livrables_supprimer(id, idLivrable); return ficheClient_(id); });
}


// ════════ ApiEcheances.js ════════

/**
 * API du lot 4 (échéancier, relances, courriers, e-mail du matin).
 */

function echeanceClient_(e) {
  var o = Object.assign({}, e);
  o.date = jourIso_(e.date);
  return o;
}

function relanceClient_(r) {
  return versClient_(TABLES.RELANCES, r);
}

/** Échéancier : échéances du mois affiché (aaaa-mm) ± marge, échéances dépassées, relances. */
function apiEcheancier(mois) {
  return repondre_(function () {
    var auj = aujourdhui_();
    var m = String(mois || '').match(/^(\d{4})-(\d{2})$/);
    var debutMois = m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date(auj.getFullYear(), auj.getMonth(), 1);
    var finMois = new Date(debutMois.getFullYear(), debutMois.getMonth() + 1, 0);
    // Grille du calendrier : du lundi précédant le 1er au dimanche suivant la fin du mois
    var debut = ajouterJours_(debutMois, -((debutMois.getDay() + 6) % 7));
    var fin = ajouterJours_(finMois, (7 - finMois.getDay()) % 7);
    var liste = Echeances_calculer(auj, ajouterJours_(auj, 60));
    return {
      mois: Utilities.formatDate(debutMois, APP.FUSEAU, 'yyyy-MM'),
      grille: { debut: jourIso_(debut), fin: jourIso_(fin) },
      calendrier: Echeances_calculer(debut, fin).map(echeanceClient_),
      prochaines: liste.map(echeanceClient_),
      relances: Relances_aFaire(null, true).map(relanceClient_),
      aujourdhui: jourIso_(auj)
    };
  });
}

/** Accueil : échéances à 7 jours et relances à faire. */
function Suivi_accueil_() {
  var auj = aujourdhui_();
  return {
    echeances: Echeances_calculer(auj, ajouterJours_(auj, 7)).map(echeanceClient_),
    relances: Relances_aFaire().map(relanceClient_)
  };
}

function apiSuivi() {
  return repondre_(Suivi_accueil_);
}

function apiRelanceStatut(idRelance, statut) {
  return repondre_(function () { return relanceClient_(Relances_changerStatut(idRelance, statut)); });
}

function apiCourrier(idRelance) {
  return repondre_(function () { return Courriers_modele(idRelance); });
}

/** Aperçu de l'e-mail du matin (sans envoi). */
function apiEmailApercu() {
  return repondre_(function () {
    var m = Email_construire(new Date());
    return { sujet: m.sujet, html: m.html, nombres: m.nombres };
  });
}

/** Envoi immédiat de l'e-mail du matin (test). */
function apiEmailEnvoyer() {
  return repondre_(function () { return Email_envoyerTest(); });
}


// ════════ ApiFiscal.js ════════

/**
 * API des déclarations URSSAF (CA au rythme des déclarations, estimation des sommes dues).
 */

function apiFiscal(annee) {
  return repondre_(function () { return Fiscal_declarations(Number(annee) || null); });
}

function apiDeclarer(idPeriode, caDeclare, dateDeclaration) {
  return repondre_(function () { Fiscal_marquerDeclaree(idPeriode, caDeclare, dateDeclaration); Relances_synchroniser(); return Fiscal_declarations(Number(String(idPeriode).slice(0, 4))); });
}

/** Déclaration de revenus faite (CA de l'année précédente reporté sur impots.gouv). */
function apiRevenusDeclares(annee, dateDeclaration) {
  return repondre_(function () { Fiscal_revenusDeclares(annee, dateDeclaration); return Fiscal_declarations(Number(annee)); });
}

function apiCumulFait(dateDemande) {
  return repondre_(function () { Fiscal_cumulFait(dateDemande); return Fiscal_declarations(); });
}

function apiCfePayee(annee, montant, datePaiement) {
  return repondre_(function () { Fiscal_cfePayee(annee, montant, datePaiement); return Fiscal_declarations(Number(annee)); });
}

/** Réglages de la CFE depuis la carte de l'accueil : montant estimé (année pleine) et date de création. */
function apiCfeReglages(montant, dateCreation) {
  return repondre_(function () {
    var m = String(montant || '').replace(/[\s\u00a0€]/g, '').replace(',', '.');
    if (m && !(Number(m) >= 0)) throw new Error('Montant de la CFE : nombre attendu.');
    var d = date_(dateCreation);
    if (dateCreation && !d) throw new Error('Date de création : date attendue.');
    Params_enregistrer('fiscal.cfe_montant', m);
    if (d) Params_enregistrer('fiscal.date_creation', Utilities.formatDate(d, APP.FUSEAU, 'yyyy-MM-dd'));
    return Fiscal_declarations();
  });
}

function apiAnnulerDeclaration(idPeriode) {
  return repondre_(function () { Fiscal_annulerDeclaration(idPeriode); Relances_synchroniser(); return Fiscal_declarations(Number((String(idPeriode).match(/\d{4}/) || [])[0]) || null); });
}


// ════════ ApiQonto.js ════════

/** API de l'interface : connexion à Qonto, synchronisation des factures, rattachement. */

function apiQontoEtat() {
  return repondre_(function () { return Qonto_etat(); });
}

/** Teste puis enregistre la clé API (propriétés du script, jamais le classeur). */
function apiQontoConnecter(login, secret) {
  return repondre_(function () { var r = Qonto_connecter(login, secret); r.etat = Qonto_etat(); return r; });
}

function apiQontoDeconnecter() {
  return repondre_(function () { Qonto_deconnecter(); return Qonto_etat(); });
}

/** Synchronise puis renvoie le bilan, l'état Qonto et la synthèse Finances à jour. */
function apiQontoSynchroniser() {
  return repondre_(function () {
    var bilan = Qonto_synchroniser();
    return { bilan: bilan, etat: Qonto_etat(), finances: Finances_synthese() };
  });
}

function apiQontoRattacher(idFacture, idAffaire, tranche) {
  return repondre_(function () {
    Qonto_rattacher(idFacture, idAffaire, tranche);
    return { etat: Qonto_etat(), finances: Finances_synthese() };
  });
}


// ════════ ApiTableau.js ════════

/**
 * API du lot 5 (tableau de bord, enseignements).
 */

function apiTableau() {
  return repondre_(function () { return Indicateurs_tableau(); });
}

function apiEnseignements() {
  return repondre_(function () {
    var t = Indicateurs_tableau();
    return {
      lignes: Indicateurs_enseignements(),
      moyennes: { ecartPrix: t.ecartPrixMoyen, ecartNote: t.ecartNoteMoyen, rang: t.rangMoyen },
      motifsRejet: t.motifsRejet,
      motifsNogo: t.motifsNogo,
      fenetre: t.fenetre
    };
  });
}


// ════════ ApiVeille.js ════════

/**
 * API du lot 3 (Veille), appelée par l'interface via google.script.run.
 */

/** Avis (les plus récents d'abord) + derniers passages du moteur. */
function apiVeille() {
  return repondre_(function () {
    var avis = Db_lire(TABLES.AVIS).map(function (a) { return versClient_(TABLES.AVIS, a); })
      .sort(function (x, y) {
        return String(y.date_parution).localeCompare(String(x.date_parution)) || (Number(y.pre_score) || 0) - (Number(x.pre_score) || 0);
      });
    var journal = Db_lire(TABLES.JOURNAL_MOTEUR).map(function (j) { return versClient_(TABLES.JOURNAL_MOTEUR, j); })
      .sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); }).slice(0, 6);
    return {
      avis: avis,
      journal: journal,
      paca: Params_texte('zone.libelle_paca', 'PACA'),
      seuils: { etudier: Params_nombre('score.seuil_etudier', 60), possible: Params_nombre('score.seuil_possible', 40) },
      heure: Params_nombre('veille.heure_collecte', 6),
      apprentissage: (function () {
        var app = Veille_apprentissage_();
        return { actif: app.actif, decisions: app.decisions, retenus: app.retenus, ecartes: app.ecartes, min: Params_nombre('veille.apprentissage_min', 15),
          active: Params_texte('veille.apprentissage', 'oui').toLowerCase() === 'oui' };
      })()
    };
  });
}

/** Lance la collecte immédiatement (bouton « Collecter maintenant »). */
function apiCollecter() {
  return repondre_(function () {
    var bilan = collecteQuotidienne();
    if (!bilan) throw new Error('Une collecte est déjà en cours, réessayez dans une minute.');
    return bilan;
  });
}

function apiAvisEtudier(idAvis) {
  return repondre_(function () { return versClient_(TABLES.AFFAIRES, Avis_etudier(idAvis)); });
}

function apiAvisStatut(idAvis, statut) {
  return repondre_(function () { return versClient_(TABLES.AVIS, Avis_changerStatut(idAvis, statut)); });
}


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

/** Seuils comparés au CA (paramètres seuil.*), dans l'ordre croissant habituel. */
var JALONS_CA = [
  { cle: 'seuil.tva_franchise', libelle: 'Franchise de TVA', consequence: 'Au-delà : TVA à facturer à partir du 1er janvier suivant.' },
  { cle: 'seuil.tva_majore', libelle: 'Franchise de TVA — seuil majoré', consequence: 'Au-delà : TVA à facturer dès le jour du dépassement.' },
  { cle: 'seuil.plafond_vise', libelle: 'Plafond visé', consequence: 'Votre limite de CA pour l\'année.', vise: true },
  { cle: 'seuil.micro_plafond', libelle: 'Plafond micro-entreprise', consequence: 'Dépassé deux années de suite : sortie du régime micro.' }
];

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

  var jalons = JALONS_CA.map(function (j) {
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
  m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/); // champ date du formulaire (jour seul)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
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
 * Kartes Affaires — configuration générale et schéma du classeur (§ 9).
 *
 * Toute colonne ajoutée ici est créée au prochain lancement de installer(),
 * à la fin de l'onglet, sans toucher aux données existantes.
 */

var APP = {
  NOM: 'Kartes Affaires',
  ENTREPRISE: 'Kartes Ingénierie',
  VERSION: '1.6.0',
  CLASSEUR: 'Kartes Affaires — données',
  DOSSIER_SAUVEGARDES: 'Kartes Affaires — sauvegardes',
  ANCIEN_NOM: 'Kompa', // nom d'avant le 22/11/2026 : fichiers et dossiers renommés par la mise à jour automatique
  PROP_CLASSEUR_ID: 'CLASSEUR_ID',
  PROP_DOSSIER_SAUVEGARDES_ID: 'DOSSIER_SAUVEGARDES_ID',
  FUSEAU: 'Europe/Paris',
  // Icône de l'onglet du navigateur : icône du kit (symbole compas), servie par le dépôt GitHub public
  // (l'adresse doit se terminer par .png). Remplaçable par le paramètre app.favicon_url.
  FAVICON: 'https://raw.githubusercontent.com/7yptbmvt8d-wq/Kompa-ing-nierie/claude/amazing-cray-l4l2w9/charte/kartes-kit/logos/png/kartes-icone-192.png'
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
    prefixe: 'KI',
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
      'montant_ht', 'montant_pondere', 'jours_reponse', 'date_depot', 'repartition_ca', 'tranches_etat',
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
    texteBrut: ['departement', 'reference_acheteur', 'repartition_ca', 'tranches_etat']
  },
  HISTORIQUE: {
    onglet: 'Historique',
    cle: 'id',
    prefixe: 'HI',
    colonnes: ['id', 'id_affaire', 'ancien_statut', 'nouveau_statut', 'date', 'commentaire'],
    horodatages: ['date']
  },
  PIECES_OFFRE: {
    onglet: 'Pièces de l\'offre',
    cle: 'id',
    prefixe: 'PO',
    colonnes: ['id', 'id_affaire', 'categorie', 'libelle', 'etat', 'ordre', 'commentaire'],
    nombres: ['ordre']
  },
  LIVRABLES: {
    onglet: 'Livrables',
    cle: 'id',
    prefixe: 'LV',
    colonnes: ['id', 'id_affaire', 'tranche', 'libelle', 'date_echeance', 'etat', 'indice', 'lien', 'ordre', 'commentaire'],
    nombres: ['ordre'],
    texteBrut: ['tranche', 'indice']
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
      'date_encaissement', 'montant_encaisse', 'tranche', 'qonto_id', 'qonto_statut', 'lien_facture'
    ],
    nombres: ['montant', 'montant_encaisse'],
    texteBrut: ['tranche', 'qonto_id', 'numero']
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

/**
 * Classeurs de données. Le module Estimation a son propre classeur (bibliothèque de prix
 * volumineuse, données anonymisées) : ses tables portent classeur: 'EST'.
 */
var CLASSEURS = {
  SUIVI: { nom: APP.CLASSEUR, prop: APP.PROP_CLASSEUR_ID },
  EST: { nom: 'Kartes Estimation — données', prop: 'CLASSEUR_EST_ID' }
};

/**
 * Toutes les tables : suivi (TABLES, Code.gs) + module Estimation (EST_TABLES, Estimation.gs).
 * EST_TABLES est lu à l'appel, jamais au chargement : l'ordre des fichiers dans l'éditeur importe peu.
 */
function Tables_toutes_() {
  var t = {};
  Object.keys(TABLES).forEach(function (k) { t[k] = TABLES[k]; });
  if (typeof EST_TABLES !== 'undefined') Object.keys(EST_TABLES).forEach(function (k) { t[k] = EST_TABLES[k]; });
  return t;
}

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


// ════════ Courriers.js ════════

/**
 * Modèles de courriers des relances (§ 5) : texte prêt à copier dans un e-mail ou un courrier.
 * Les informations manquantes restent entre crochets, à compléter (charte § 1.7).
 */

function Courriers_modele(idRelance) {
  var r = Db_trouver(TABLES.RELANCES, idRelance);
  if (!r) throw new Error('Relance introuvable : ' + idRelance);
  var a = Db_trouver(TABLES.AFFAIRES, r.id_affaire) || {};
  var f = r.id_facture ? Db_trouver(TABLES.FACTURES, r.id_facture) || {} : {};
  var j = function (v) { var d = date_(v); return d ? Utilities.formatDate(d, APP.FUSEAU, 'dd/MM/yyyy') : '[date]'; };
  var e = function (v) { return montant_(v) ? Courriers_euros_(montant_(v)) : '[montant]'; };
  var consultation = '« ' + (a.objet || '[objet de la consultation]') + ' »' + (a.reference_acheteur ? ' (référence ' + a.reference_acheteur + ')' : '');
  var ref = a.reference_acheteur ? a.reference_acheteur + ' — ' : '';
  var entreprise = Params_texte('courrier.nom_entreprise', APP.ENTREPRISE);
  var emailPublic = Params_texte('courrier.email_public', '');
  var signature = Params_texte('courrier.signature', 'Sébastien De Raedt EI\n' + entreprise);
  if (emailPublic) signature = signature.replace('[e-mail]', emailPublic);
  var politesse = 'Nous vous prions d\'agréer, Madame, Monsieur, l\'expression de nos salutations distinguées.';
  var corps, objet;

  switch (r.type) {
    case TYPES_RELANCE.MOTIFS:
    case TYPES_RELANCE.MOTIFS_RAPPEL:
      objet = ref + 'Demande des motifs de rejet de notre offre' + (r.type === TYPES_RELANCE.MOTIFS_RAPPEL ? ' — rappel' : '');
      corps = [
        'Madame, Monsieur,',
        '',
        (r.type === TYPES_RELANCE.MOTIFS_RAPPEL
          ? 'Notre demande du ' + j(Courriers_premiereDemande_(a.id)) + ' étant restée sans réponse, nous nous permettons de la renouveler.\n\n'
          : '') +
        'Par courrier du ' + j(a.date_resultat) + ', vous nous avez informés du rejet de l\'offre remise par ' + entreprise + ' le ' + j(a.date_depot) +
          ' pour la consultation ' + consultation + '.',
        '',
        'En application des articles R. 2181-1 à R. 2181-4 du code de la commande publique, nous vous remercions de bien vouloir nous communiquer :',
        '– les motifs détaillés du rejet de notre offre ;',
        '– le nom de l\'attributaire et le montant de son offre ;',
        '– les notes obtenues par notre offre et par celle de l\'attributaire pour chacun des critères de jugement, ainsi que notre classement.',
        '',
        'Ces éléments nous permettront d\'améliorer nos prochaines propositions.',
        '',
        politesse
      ];
      break;
    case TYPES_RELANCE.DECISION:
      objet = ref + 'Demande d\'information sur l\'attribution';
      corps = [
        'Madame, Monsieur,',
        '',
        entreprise + ' a remis le ' + j(a.date_depot) + ' une offre pour la consultation ' + consultation + '.',
        '',
        'La durée de validité de notre offre (' + (montant_(a.validite_offre_jours) || Params_nombre('echeance.validite_defaut_j', 90)) +
          ' jours) étant arrivée à son terme, nous vous remercions de bien vouloir nous indiquer où en est la procédure et, le cas échéant, la date prévisionnelle d\'attribution.',
        '',
        'Nous restons disposés à prolonger la validité de notre offre si nécessaire.',
        '',
        politesse
      ];
      break;
    case TYPES_RELANCE.ENCAISSEMENT:
      var retard = f.date_echeance && montant_(f.montant) ? Planning_interets_(montant_(f.montant), date_(f.date_echeance), aujourdhui_()) : null;
      if (retard && retard.jours >= Params_nombre('facture.mise_en_demeure_j', 30)) {
        objet = ref + 'Mise en demeure de payer — facture ' + (f.numero || '[n°]');
        corps = [
          'Madame, Monsieur,',
          '',
          'Malgré notre précédente relance, la facture n° ' + (f.numero || '[n°]') + ' du ' + j(f.date) + ', d\'un montant de ' + e(f.montant) +
            ' HT (TVA non applicable, art. 293 B du CGI), relative à la mission ' + consultation + ', reste impayée ' + retard.jours +
            ' jours après son échéance du ' + j(f.date_echeance) + '.',
          '',
          'Nous vous mettons en demeure de procéder à son règlement sous quinze jours à compter de la réception du présent courrier.',
          '',
          'Conformément aux articles L. 2192-13, R. 2192-31 et D. 2192-35 du code de la commande publique, sont dus de plein droit, sans formalité :',
          '– des intérêts moratoires au taux de ' + String(retard.taux).replace('.', ',') + ' %, soit ' + Courriers_euros_(retard.interets) + ' arrêtés à ce jour ;',
          '– une indemnité forfaitaire pour frais de recouvrement de ' + Courriers_euros_(retard.indemnite) + '.',
          '',
          'Soit un total de ' + Courriers_euros_(montant_(f.montant) + retard.interets + retard.indemnite) + ' à régler à ce jour.',
          '',
          politesse
        ];
        break;
      }
      objet = ref + 'Relance de paiement — facture ' + (f.numero || '[n°]');
      corps = [
        'Madame, Monsieur,',
        '',
        'Sauf erreur de notre part, la facture n° ' + (f.numero || '[n°]') + ' du ' + j(f.date) + ', d\'un montant de ' + e(f.montant) +
          ' HT (TVA non applicable, art. 293 B du CGI), relative à la mission ' + consultation + ', n\'a pas encore été réglée.',
        '',
        'Le délai global de paiement de 30 jours (article R. 2192-10 du code de la commande publique) est échu depuis le ' + j(f.date_echeance) +
          '. Nous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais.',
        '',
        'Pour mémoire, le dépassement du délai de paiement fait courir de plein droit des intérêts moratoires et une indemnité forfaitaire pour frais de recouvrement de 40 € (articles L. 2192-13 et D. 2192-35 du même code)' +
          (retard ? ' : à ce jour, ' + retard.jours + ' jours de retard, soit ' + Courriers_euros_(retard.interets) + ' d\'intérêts au taux de ' + String(retard.taux).replace('.', ',') + ' %.' : '.'),
        '',
        politesse
      ];
      break;
    case TYPES_RELANCE.FACTURATION:
      objet = ref + 'Facture ' + (f.numero || '[n°]');
      corps = [
        'Madame, Monsieur,',
        '',
        'Nous avons déposé ce jour sur Chorus Pro la facture n° ' + (f.numero || '[n°]') + ', d\'un montant de ' + e(f.montant) +
          ' HT (TVA non applicable, art. 293 B du CGI), au titre de la mission ' + consultation + '.',
        '',
        'Nous restons à votre disposition pour tout complément.',
        '',
        politesse
      ];
      break;
    case TYPE_RELANCE_URSSAF:
      return { type: r.type, destinataire: 'URSSAF — autoentrepreneur.urssaf.fr', objet: 'Déclaration de chiffre d\'affaires',
        corps: 'Pas de courrier : déclaration en ligne.\n\n1. Se connecter sur https://autoentrepreneur.urssaf.fr\n2. Déclarer et payer → période concernée\n3. ' +
          (r.commentaire || 'Saisir le CA encaissé de la période.') + '\n4. Payer, puis marquer la période « déclarée » sur l\'accueil de ' + APP.NOM + '.' };
    default:
      objet = ref + (r.type || 'Relance');
      corps = ['Madame, Monsieur,', '', '[texte]', '', politesse];
  }
  var texte = corps.join('\n') + '\n\n' + signature;
  return { type: r.type, destinataire: a.acheteur || '[acheteur]', objet: objet, corps: texte };
}

function Courriers_premiereDemande_(idAffaire) {
  var m = Db_lire(TABLES.RELANCES).filter(function (r) { return r.id_affaire === idAffaire && r.type === TYPES_RELANCE.MOTIFS; })[0];
  return m ? (m.date_faite || m.date_prevue) : '';
}

function Courriers_euros_(n) {
  var s = (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  var p = s.split(',');
  return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + p[1] + ' €';
}


// ════════ Db.js ════════

/**
 * Accès au classeur : une table = un onglet, une ligne = un objet.
 * Ligne 1 = noms de colonnes (identifiants techniques, ne pas renommer à la main).
 */

/**
 * Mémoire de l'exécution en cours : chaque onglet n'est lu qu'une fois par appel
 * (google.script.run, déclencheur). Toute écriture dans un onglet vide sa mémoire.
 */
var Db_cache_ = { classeurs: {}, lignes: {}, entetes: {}, versions: {}, ecrits: {} };

/**
 * Mémoire partagée entre les appels (accélération du 21/11/2026) : chaque onglet lu est gardé dans le cache
 * du script (CacheService, 6 h au plus), avec la date de dernière modification du classeur (Drive).
 * - Une écriture par l'app (Db_inserer, Db_maj, Db_supprimerSi…) change, une fois écrite, la « génération »
 *   du classeur : toute la mémoire lue avant est ignorée, y compris celle qu'un appel simultané garderait
 *   après coup (correctif du 21/11/2026 : tranche repassée en « ferme » après un changement) ;
 * - une modification faite à la main dans le classeur change sa date : toute la mémoire du classeur est ignorée.
 * En cas de souci (cache indisponible, onglet trop gros), lecture directe du classeur, comme avant.
 */
var DB_MEMOIRE_TTL = 21600;
var DB_MEMOIRE_MORCEAU = 30000; // caractères par entrée (limite de 100 Ko par valeur)
var DB_MEMOIRE_MORCEAUX_MAX = 40;

function Db_memoire_() {
  try { return typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null; } catch (e) { return null; }
}

/**
 * Version de la mémoire d'un classeur pour cet appel : date de dernière modification (Drive) + génération
 * (changée après chaque écriture de l'app). Lue une fois par appel et par classeur ; null = pas de mémoire.
 */
function Db_versionClasseur_(cleClasseur) {
  var cle = cleClasseur || 'SUIVI';
  if (cle in Db_cache_.versions) return Db_cache_.versions[cle];
  var v = null;
  try {
    var c = Db_memoire_();
    var id = PropertiesService.getScriptProperties().getProperty(CLASSEURS[cle].prop);
    if (c && id) {
      var gen = c.get('db|gen|' + cle);
      if (!gen) { gen = Db_nouvelleGeneration_(); c.put('db|gen|' + cle, gen, DB_MEMOIRE_TTL); }
      v = String(DriveApp.getFileById(id).getLastUpdated().getTime()) + '|' + gen;
    }
  } catch (e) { v = null; }
  Db_cache_.versions[cle] = v;
  return v;
}

function Db_nouvelleGeneration_() {
  return new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 8);
}

function Db_cleMemoire_(table) {
  return 'db|' + Db_cle_(table);
}

/** Lignes d'un onglet depuis la mémoire partagée, ou null (absente, périmée, illisible). */
function Db_lireMemoire_(table) {
  if (Db_cache_.ecrits[table.classeur || 'SUIVI']) return null; // cet appel a écrit : lecture directe du classeur
  var c = Db_memoire_();
  var version = c && Db_versionClasseur_(table.classeur);
  if (!version) return null;
  try {
    var cle = Db_cleMemoire_(table);
    var tete = c.get(cle);
    if (!tete) return null;
    var t = JSON.parse(tete);
    if (t.v !== version || !(t.n >= 1)) return null;
    var cles = [];
    for (var i = 0; i < t.n; i++) cles.push(cle + '|' + i);
    var morceaux = c.getAll(cles);
    var texte = '';
    for (var j = 0; j < t.n; j++) {
      if (typeof morceaux[cles[j]] !== 'string') return null;
      texte += morceaux[cles[j]];
    }
    return JSON.parse(texte, function (k, val) {
      return val && typeof val === 'object' && typeof val.$d === 'number' ? new Date(val.$d) : val;
    });
  } catch (e) { return null; }
}

/** Garde les lignes d'un onglet dans la mémoire partagée (sauf si l'appel a déjà écrit dans ce classeur). */
function Db_ecrireMemoire_(table, lignes) {
  var c = Db_memoire_();
  if (!c || Db_cache_.ecrits[table.classeur || 'SUIVI']) return;
  var version = Db_versionClasseur_(table.classeur);
  if (!version) return;
  try {
    var texte = JSON.stringify(lignes, function (k, val) {
      var brut = this[k];
      return brut instanceof Date ? { $d: brut.getTime() } : val;
    });
    var n = Math.max(1, Math.ceil(texte.length / DB_MEMOIRE_MORCEAU));
    if (n > DB_MEMOIRE_MORCEAUX_MAX) return;
    var cle = Db_cleMemoire_(table), valeurs = {};
    for (var i = 0; i < n; i++) valeurs[cle + '|' + i] = texte.slice(i * DB_MEMOIRE_MORCEAU, (i + 1) * DB_MEMOIRE_MORCEAU);
    c.putAll(valeurs, DB_MEMOIRE_TTL);
    c.put(cle, JSON.stringify({ v: version, n: n }), DB_MEMOIRE_TTL);
  } catch (e) { /* mémoire non disponible : sans effet */ }
}

/** Écriture en cours dans un classeur : plus de mise en mémoire pour cet appel ; génération changée après l'écriture. */
function Db_oublierMemoire_(table) {
  Db_cache_.ecrits[table.classeur || 'SUIVI'] = true;
  (Db_cache_.aInvalider = Db_cache_.aInvalider || {})[table.classeur || 'SUIVI'] = true;
  var c = Db_memoire_();
  if (c) try { c.remove(Db_cleMemoire_(table)); } catch (e) { /* sans effet */ }
}

/** Après une écriture (classeur à jour) : nouvelle génération, la mémoire lue avant ne sert plus. */
function Db_invaliderMemoire_() {
  var a = Db_cache_.aInvalider || {};
  Db_cache_.aInvalider = {};
  var c = Db_memoire_();
  if (!c) return;
  Object.keys(a).forEach(function (cle) {
    delete Db_cache_.versions[cle];
    try { c.put('db|gen|' + cle, Db_nouvelleGeneration_(), DB_MEMOIRE_TTL); } catch (e) { /* sans effet */ }
  });
}

/** Clé de mémoire d'une table : classeur + onglet (deux classeurs peuvent avoir un onglet de même nom). */
function Db_cle_(table) {
  return (table.classeur || 'SUIVI') + '|' + table.onglet;
}

function Db_viderCache_(table) {
  if (table) { delete Db_cache_.lignes[Db_cle_(table)]; delete Db_cache_.entetes[Db_cle_(table)]; }
  else { Db_cache_.lignes = {}; Db_cache_.entetes = {}; Db_cache_.versions = {}; Db_cache_.ecrits = {}; }
}

/** En-têtes d'une table (mémorisés pour l'exécution). */
function Db_entetesTable_(table, onglet) {
  var k = Db_cle_(table);
  if (!Db_cache_.entetes[k]) Db_cache_.entetes[k] = Db_entetes_(onglet || Db_onglet_(table));
  return Db_cache_.entetes[k];
}

/**
 * Classeur de données : « SUIVI » (par défaut, suivi des affaires) ou « EST » (module Estimation).
 * Lève une erreur claire si installer() n'a pas été lancé.
 */
function Db_classeur(cle) {
  cle = cle || 'SUIVI';
  if (Db_cache_.classeurs[cle]) return Db_cache_.classeurs[cle];
  var def = CLASSEURS[cle];
  if (!def) throw new Error('Classeur inconnu : ' + cle);
  var id = PropertiesService.getScriptProperties().getProperty(def.prop);
  if (!id) {
    throw new Error('Classeur « ' + def.nom + ' » introuvable : lancez la fonction installer() depuis l\'éditeur Apps Script.');
  }
  Db_cache_.classeurs[cle] = SpreadsheetApp.openById(id);
  return Db_cache_.classeurs[cle];
}

function Db_onglet_(table) {
  var onglet = Db_classeur(table.classeur).getSheetByName(table.onglet);
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

/** Toutes les lignes d'une table, en objets (copies : modifiables sans effet sur la mémoire). */
function Db_lire(table) {
  var cle = Db_cle_(table);
  if (!Db_cache_.lignes[cle]) Db_cache_.lignes[cle] = Db_lireMemoire_(table);
  if (!Db_cache_.lignes[cle]) {
    var onglet = Db_onglet_(table);
    var entetes = Db_entetesTable_(table, onglet);
    var nbLignes = onglet.getLastRow() - 1;
    var lignes = [];
    if (nbLignes >= 1 && entetes.length) {
      lignes = onglet.getRange(2, 1, nbLignes, entetes.length).getValues()
        .filter(function (ligne) { return ligne.some(function (v) { return v !== '' && v !== null; }); })
        .map(function (ligne) {
          var obj = {};
          entetes.forEach(function (nom, i) { if (nom) obj[nom] = ligne[i]; });
          return obj;
        });
    }
    Db_cache_.lignes[cle] = lignes;
    Db_ecrireMemoire_(table, lignes);
  }
  return Db_cache_.lignes[cle].map(function (o) { return Object.assign({}, o); });
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
    var entetes = Db_entetesTable_(table, onglet);
    Db_viderCache_lignes_(table);
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
    var entetes = Db_entetesTable_(table, onglet);
    Db_viderCache_lignes_(table);
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
    // Aucune des colonnes à modifier n'existe : classeur pas à jour (installer() non relancé) → erreur explicite
    var demandees = Object.keys(maj).filter(function (n) { return n !== 'modifie_le'; });
    var absentes = demandees.filter(function (n) { return entetes.indexOf(n) < 0; });
    if (demandees.length && absentes.length === demandees.length) {
      throw new Error('Colonne « ' + absentes.join(', ') + ' » absente de l\'onglet « ' + table.onglet + ' » : lancez installer() depuis l\'éditeur Apps Script.');
    }
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
    Db_invaliderMemoire_();
    verrou.releaseLock();
  }
}

/** Supprime les lignes pour lesquelles garder(ligne) est vrai. Renvoie le nombre supprimé. */
function Db_supprimerSi(table, critere) {
  return Db_verrou_(function () {
    var onglet = Db_onglet_(table);
    var entetes = Db_entetesTable_(table, onglet);
    Db_viderCache_lignes_(table);
    var n = onglet.getLastRow() - 1;
    if (n < 1) return 0;
    var valeurs = onglet.getRange(2, 1, n, entetes.length).getValues();
    var supprimees = 0;
    for (var i = valeurs.length - 1; i >= 0; i--) {
      var obj = {};
      entetes.forEach(function (nom, j) { if (nom) obj[nom] = valeurs[i][j]; });
      if (critere(obj)) { onglet.deleteRow(i + 2); supprimees++; }
    }
    return supprimees;
  });
}

/** Remplace une valeur dans toute une colonne (une seule écriture). Renvoie le nombre de cellules modifiées. */
function Db_remplacerValeur_(table, colonne, ancienne, nouvelle) {
  return Db_verrou_(function () {
    var onglet = Db_onglet_(table);
    var j = Db_entetesTable_(table, onglet).indexOf(colonne);
    var n = onglet.getLastRow() - 1;
    if (j < 0 || n < 1) return 0;
    var plage = onglet.getRange(2, j + 1, n, 1);
    var valeurs = plage.getValues();
    var modifiees = 0;
    valeurs.forEach(function (l) { if (String(l[0]) === String(ancienne)) { l[0] = nouvelle; modifiees++; } });
    if (modifiees) plage.setValues(valeurs);
    Db_viderCache_lignes_(table);
    return modifiees;
  });
}

function Db_viderCache_lignes_(table) {
  delete Db_cache_.lignes[Db_cle_(table)];
  Db_oublierMemoire_(table);
}


// ════════ Drive.js ════════

/**
 * Dossiers Drive des affaires.
 *
 *   Kartes Affaires — Dossiers/           (racine, paramètre drive.dossier_racine)
 *     2026/                               (un dossier par année, d'après le n° KI-AAAA-NNN ou KA-…)
 *       KA-2026-012 — Acheteur — Objet/   (un dossier par affaire, lien dans la fiche)
 *         01 DCE, 02 Questions et visite              → à la création (En étude)
 *         03 Candidature, 04 Offre, 05 Dépôt          → au passage en Go
 *         06 Résultat                                 → au résultat (gagnée, perdue, sans suite)
 *         07 Exécution, 08 Facturation                → au passage en Gagnée
 * Les noms des sous-dossiers sont des paramètres (drive.sous_dossiers_*).
 * Une erreur Drive ne bloque jamais l'affaire : elle est notée dans le journal de l'affaire.
 */

var ETAPES_DRIVE = {
  etude: 'drive.sous_dossiers_etude',
  go: 'drive.sous_dossiers_go',
  resultat: 'drive.sous_dossiers_resultat',
  gagnee: 'drive.sous_dossiers_gagnee'
};

/** Identifiant Drive tiré d'une URL ou d'un identifiant collé tel quel. */
function Drive_id_(v) {
  var t = String(v || '').trim();
  var m = t.match(/\/folders\/([\w-]{10,})/) || t.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : (/^[\w-]{10,}$/.test(t) ? t : '');
}

function Drive_racine_() {
  var id = Drive_id_(Params_texte('drive.dossier_racine', ''));
  if (id) {
    try { var d = DriveApp.getFolderById(id); if (!d.isTrashed()) return d; } catch (e) { /* recréé ci-dessous */ }
  }
  var racine = DriveApp.createFolder(Params_texte('drive.nom_racine', 'Kartes Affaires — Dossiers'));
  Params_enregistrer('drive.dossier_racine', racine.getUrl());
  return racine;
}

/** Sous-dossier de nom donné (créé s'il n'existe pas). */
function Drive_sousDossier_(parent, nom) {
  var it = parent.getFoldersByName(nom);
  return it.hasNext() ? it.next() : parent.createFolder(nom);
}

function Drive_nomAffaire_(a) {
  var propre = function (s, n) {
    s = String(s || '').replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trim() + '…' : s;
  };
  return [a.id, propre(a.acheteur, 50), propre(a.objet, 70)].filter(String).join(' — ');
}

function Drive_dossierAffaire_(a) {
  var id = Drive_id_(a.lien_dce);
  if (!id) return null;
  try { var d = DriveApp.getFolderById(id); return d.isTrashed() ? null : d; } catch (e) { return null; }
}

/** Crée (ou retrouve) le dossier de l'affaire et les sous-dossiers des étapes atteintes. Renvoie son URL. */
function Drive_preparerAffaire(idAffaire) {
  var a = Affaires_get_(idAffaire);
  var dossier = Drive_dossierAffaire_(a);
  if (!dossier) {
    var annee = (String(a.id).match(/^K[AI]-(\d{4})-/) || [])[1] || Utilities.formatDate(new Date(), APP.FUSEAU, 'yyyy');
    dossier = Drive_sousDossier_(Drive_sousDossier_(Drive_racine_(), annee), Drive_nomAffaire_(a));
    Db_maj(TABLES.AFFAIRES, a.id, { lien_dce: dossier.getUrl() });
  }
  Drive_etapes_(a.statut).forEach(function (etape) {
    Params_liste(ETAPES_DRIVE[etape]).forEach(function (nom) { Drive_sousDossier_(dossier, nom); });
  });
  return dossier.getUrl();
}

/** Étapes atteintes pour un statut. */
function Drive_etapes_(statut) {
  var e = ['etude'];
  if (['Go', 'Déposée', 'Abandonnée', 'Gagnée', 'Perdue', 'Sans suite', 'Soldée'].indexOf(statut) >= 0) e.push('go');
  if (['Gagnée', 'Perdue', 'Sans suite', 'Soldée'].indexOf(statut) >= 0) e.push('resultat');
  if (['Gagnée', 'Soldée'].indexOf(statut) >= 0) e.push('gagnee');
  return e;
}

/** Version sûre : une erreur Drive est notée dans le journal de l'affaire, sans bloquer. */
function Drive_preparerAffaireSansErreur_(idAffaire) {
  if (Params_texte('drive.actif', 'oui').toLowerCase() !== 'oui') return '';
  try {
    return Drive_preparerAffaire(idAffaire);
  } catch (e) {
    console.error('Dossier Drive ' + idAffaire + ' : ' + e.message);
    try { Affaires_ajouterNote(idAffaire, 'Dossier Drive non créé : ' + e.message); } catch (e2) { /* sans effet */ }
    return '';
  }
}

/** Crée les dossiers des affaires qui n'en ont pas (lancé par installer). */
function creerDossiersManquants() {
  var n = 0;
  Affaires_lister().forEach(function (a) {
    if (!Drive_dossierAffaire_(a) && Drive_preparerAffaireSansErreur_(a.id)) n++;
  });
  console.log(n + ' dossier(s) Drive créé(s).');
  return n;
}

// ——— Pièces de l'affaire : liste et dépôt depuis la fiche ———

/** Taille maximale d'un fichier déposé depuis l'app (octets). Au-delà : dépôt direct dans Drive. */
var PIECE_TAILLE_MAX = 20 * 1024 * 1024;

/** Sous-dossier proposé par défaut selon le statut : [groupe de sous-dossiers, rang dans le groupe]. */
var PIECE_DOSSIER_STATUT = {
  'En étude': ['etude', 0], 'No-go': ['etude', 0],
  'Go': ['go', 1], 'Déposée': ['go', 2], 'Abandonnée': ['go', 1],
  'Perdue': ['resultat', 0], 'Sans suite': ['resultat', 0],
  'Gagnée': ['gagnee', 0], 'Soldée': ['gagnee', 1]
};

function Drive_dossierDefaut_(statut) {
  var r = PIECE_DOSSIER_STATUT[statut] || ['etude', 0];
  var liste = Params_liste(ETAPES_DRIVE[r[0]]);
  return liste[r[1]] || liste[liste.length - 1] || '';
}

/** Dossier de l'affaire, créé s'il manque (lève une erreur si Drive est désactivé). */
function Drive_dossierAffaireOuCreer_(a) {
  var d = Drive_dossierAffaire_(a);
  if (d) return d;
  if (Params_texte('drive.actif', 'oui').toLowerCase() !== 'oui') throw new Error('Les dossiers Drive sont désactivés (paramètre drive.actif).');
  Drive_preparerAffaire(a.id);
  return Drive_dossierAffaire_(Affaires_get_(a.id));
}

function Drive_fichiers_(dossier) {
  var liste = [], it = dossier.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    liste.push({ nom: f.getName(), url: f.getUrl(), taille: f.getSize(), date: f.getDateCreated() });
  }
  liste.sort(function (x, y) { return y.date - x.date; });
  return liste.map(function (f) { f.date = Utilities.formatDate(f.date, APP.FUSEAU, 'dd/MM/yyyy'); return f; });
}

/** Sous-dossiers de l'affaire (par ordre de nom) et leurs fichiers ; fichiers posés à la racine du dossier en tête. */
function Drive_pieces(idAffaire) {
  var a = Affaires_get_(idAffaire);
  var dossier = Drive_dossierAffaire_(a);
  if (!dossier) return { url: '', dossiers: [], parDefaut: '', tailleMax: PIECE_TAILLE_MAX };
  // Étape de chaque sous-dossier (etude, go, resultat, gagnee) et son rang dans la liste du paramètre :
  // la fiche range ainsi chaque dossier dans son sous-onglet (Consultation, Offre, Résultat, Livrables…).
  var etapes = {};
  Object.keys(ETAPES_DRIVE).forEach(function (e) {
    Params_liste(ETAPES_DRIVE[e]).forEach(function (nom, i) { etapes[nom] = { etape: e, rang: i }; });
  });
  var dossiers = [], it = dossier.getFolders();
  while (it.hasNext()) {
    var d = it.next();
    var et = etapes[d.getName()] || { etape: '', rang: -1 };
    dossiers.push({ nom: d.getName(), url: d.getUrl(), fichiers: Drive_fichiers_(d), etape: et.etape, rang: et.rang });
  }
  dossiers.sort(function (x, y) { return x.nom < y.nom ? -1 : x.nom > y.nom ? 1 : 0; });
  var racine = Drive_fichiers_(dossier);
  if (racine.length) dossiers.unshift({ nom: '', url: dossier.getUrl(), fichiers: racine, etape: '', rang: -1 });
  var defaut = Drive_dossierDefaut_(a.statut);
  if (!dossiers.some(function (d) { return d.nom === defaut; })) defaut = dossiers.length ? dossiers[dossiers.length - 1].nom : '';
  return { url: dossier.getUrl(), dossiers: dossiers, parDefaut: defaut, tailleMax: PIECE_TAILLE_MAX };
}

/**
 * Dépose un fichier (contenu en base64) dans un sous-dossier de l'affaire.
 * Un fichier de même nom n'est pas écrasé : le nouveau reçoit le suffixe « (2) », « (3) »…
 */
function Drive_deposer(idAffaire, sousDossier, fichier) {
  var a = Affaires_get_(idAffaire);
  if (!fichier || !fichier.nom || typeof fichier.donnees !== 'string') throw new Error('Fichier vide ou illisible.');
  var octets = Utilities.base64Decode(fichier.donnees);
  if (octets.length > PIECE_TAILLE_MAX) {
    throw new Error('« ' + fichier.nom + ' » dépasse ' + Math.round(PIECE_TAILLE_MAX / 1048576) + ' Mo : déposez-le directement dans le dossier Drive.');
  }
  var dossier = Drive_dossierAffaireOuCreer_(a);
  var nomDossier = String(sousDossier || '').trim();
  var cible = nomDossier ? Drive_sousDossier_(dossier, nomDossier) : dossier;
  var nom = Drive_nomLibre_(cible, String(fichier.nom).replace(/[\\/]+/g, ' ').trim());
  var cree = cible.createFile(Utilities.newBlob(octets, fichier.type || 'application/octet-stream', nom));
  Affaires_ajouterNote(a.id, 'Pièce déposée : ' + (nomDossier ? nomDossier + ' / ' : '') + nom);
  return { nom: nom, url: cree.getUrl(), dossier: nomDossier };
}

function Drive_nomLibre_(dossier, nom) {
  var existe = function (n) { return dossier.getFilesByName(n).hasNext(); };
  if (!existe(nom)) return nom;
  var m = nom.match(/^(.*?)(\.[^.]{1,8})?$/);
  for (var i = 2; i < 100; i++) {
    var n = m[1] + ' (' + i + ')' + (m[2] || '');
    if (!existe(n)) return n;
  }
  return nom;
}


// ════════ Echeances.js ════════

/**
 * Échéancier et relances (§ 5).
 *
 * Les échéances sont calculées à partir des affaires et des factures : rien n'est saisi deux fois.
 * Les relances sont des lignes de l'onglet Relances, créées automatiquement par
 * Relances_synchroniser() (clé unique par relance) et closes « sans objet » quand la situation
 * qui les justifiait a disparu (résultat reçu, facture encaissée…).
 */

var TYPES_RELANCE = {
  MOTIFS: 'Motifs du rejet',
  MOTIFS_RAPPEL: 'Motifs du rejet — rappel',
  DECISION: 'Décision attendue',
  ENCAISSEMENT: 'Encaissement',
  FACTURATION: 'Facturation'
};

/** Statuts pour lesquels remise, questions et visite restent à surveiller. */
var STATUTS_AVANT_DEPOT = ['En étude', 'Go'];

function aujourdhui_(quand) {
  var d = quand ? new Date(quand.getTime ? quand.getTime() : date_(quand)) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function ajouterJours_(d, n) {
  var r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

function ecartJours_(d, ref) {
  var x = aujourdhui_(d), y = aujourdhui_(ref);
  return Math.round((x - y) / 86400000);
}

// ——— Échéances ———

/**
 * Échéances entre debut et fin (dates incluses) + échéances dépassées non traitées.
 * Chaque échéance : { date, type, libelle, id_affaire, acheteur, objet, jours, urgent, depassee }.
 */
function Echeances_calculer(debut, fin, quand) {
  var auj = aujourdhui_(quand);
  debut = aujourdhui_(debut || auj);
  fin = aujourdhui_(fin || ajouterJours_(auj, 60));
  var alertesRemise = Params_liste('echeance.remise_alertes_j').map(Number);
  var validiteDefaut = Params_nombre('echeance.validite_defaut_j', 90);
  var out = [];
  var ajouter = function (d, type, libelle, a, extra) {
    if (!d) return;
    var j = ecartJours_(d, auj);
    var dansFenetre = aujourdhui_(d) >= debut && aujourdhui_(d) <= fin;
    if (!dansFenetre && !(extra && extra.siDepassee && j < 0)) return;
    out.push(Object.assign({
      date: aujourdhui_(d), type: type, libelle: libelle, id_affaire: a.id, acheteur: a.acheteur,
      objet: a.objet, statut: a.statut, jours: j, urgent: j >= 0 && j <= 3, depassee: j < 0
    }, extra || {}));
  };

  Affaires_lister().forEach(function (a) {
    if (STATUTS_AVANT_DEPOT.indexOf(a.statut) >= 0) {
      var dr = date_(a.date_limite_remise);
      if (dr) {
        var jr = ecartJours_(dr, auj);
        ajouter(dr, 'Remise', 'Remise de l\'offre', a, { alerte: alertesRemise.indexOf(jr) >= 0 || (jr >= 0 && jr <= 1) });
      }
      ajouter(date_(a.date_limite_questions), 'Questions', 'Date limite des questions à l\'acheteur', a,
        { alerte: ecartJours_(date_(a.date_limite_questions) || auj, auj) === Params_nombre('echeance.questions_alerte_j', 3) });
      ajouter(date_(a.date_visite), 'Visite', 'Visite de site', a,
        { alerte: ecartJours_(date_(a.date_visite) || auj, auj) === Params_nombre('echeance.visite_alerte_j', 2) });
    }
    if (a.statut === 'Déposée') {
      var dd = date_(a.date_depot);
      if (dd) ajouter(ajouterJours_(dd, montant_(a.validite_offre_jours) || validiteDefaut), 'Décision', 'Fin de validité de l\'offre : décision attendue', a, { siDepassee: true });
    }
  });

  var affaires = {};
  Affaires_lister().forEach(function (a) { affaires[a.id] = a; });
  // Livrables de mission à remettre (affaires gagnées)
  Db_lire(TABLES.LIVRABLES).forEach(function (l) {
    var a = affaires[l.id_affaire];
    if (!a || a.statut !== 'Gagnée' || (l.etat !== 'à faire' && l.etat !== 'en cours')) return;
    ajouter(date_(l.date_echeance), 'Livrable', 'Livrable à remettre : ' + l.libelle + (l.tranche ? ' (' + l.tranche + ')' : ''), a,
      { siDepassee: true, id_livrable: l.id });
  });
  Db_lire(TABLES.FACTURES).forEach(function (f) {
    if (f.qonto_statut === 'annulée') return;
    var a = affaires[f.id_affaire] || { id: f.id_affaire, acheteur: '', objet: '' };
    if (Factures_prevue_(f, auj)) {
      ajouter(date_(f.date), 'Facturation', 'Émettre la facture ' + (f.numero || '') + ' (' + arrondi_(montant_(f.montant)) + ' € HT)', a, { id_facture: f.id });
    } else if (!date_(f.date_encaissement) && date_(f.date_echeance)) {
      ajouter(date_(f.date_echeance), 'Encaissement', 'Paiement attendu de la facture ' + (f.numero || ''), a,
        { id_facture: f.id, siDepassee: true });
    }
  });

  // Déclarations URSSAF (périodes terminées non déclarées)
  Fiscal_echeances_(debut, fin, auj).forEach(function (e) {
    var p = e.periode;
    out.push({
      date: aujourdhui_(e.date), type: 'Déclaration', libelle: 'Déclaration URSSAF ' + p.libelle + ' — CA encaissé ' + Courriers_euros_(p.ca),
      id_affaire: '', acheteur: 'URSSAF', objet: 'Déclarer le CA encaissé du ' + jourIso_(date_(p.debut)) + ' au ' + jourIso_(date_(p.fin)),
      statut: p.etat, jours: ecartJours_(e.date, auj), urgent: ecartJours_(e.date, auj) >= 0 && ecartJours_(e.date, auj) <= 7, depassee: e.depassee
    });
  });

  // Facturation : tranche ferme ou affermie dont le dernier livrable est prévu dans la fenêtre (ou dépassé)
  Affaires_lister().forEach(function (a) {
    if (String(a.statut) !== 'Gagnée') return;
    Planning_affaire(a.id, auj).lignes.forEach(function (l) {
      if (l.etat !== 'prévue' || l.affermissement === 'optionnelle' || l.affermissement === 'non affermie') return;
      var d = date_(l.dateFacture);
      var j = ecartJours_(d, auj);
      var dans = aujourdhui_(d) >= debut && aujourdhui_(d) <= fin;
      if (!dans && j >= 0) return;
      out.push({
        date: aujourdhui_(d), type: 'Facturation', libelle: 'Facturer la tranche ' + (l.tranche === PLANNING_MISSION ? 'de la mission' : l.tranche) + ' — ' + Courriers_euros_(l.montant),
        id_affaire: a.id, acheteur: a.acheteur, objet: a.objet, statut: a.statut,
        jours: j, urgent: j <= 3, depassee: j < 0
      });
    });
  });

  // CFE de l'année (et de l'année précédente si impayée), à payer avant le 15 décembre
  [auj.getFullYear() - 1, auj.getFullYear()].forEach(function (an) {
    var c = Fiscal_cfe(an, auj);
    if (['à venir', 'à payer', 'en retard'].indexOf(c.etat) < 0 || !c.dateCreation) return;
    var d = date_(c.echeance);
    var dans = aujourdhui_(d) >= debut && aujourdhui_(d) <= fin;
    if (!dans && c.etat !== 'en retard') return;
    var j = ecartJours_(d, auj);
    out.push({
      date: aujourdhui_(d), type: 'Déclaration', libelle: 'CFE ' + an + ' à payer' + (c.montant !== null ? ' — ' + (c.estime ? 'estimée ' : '') + Courriers_euros_(c.montant) : ''),
      id_affaire: '', acheteur: 'Impôts (CFE)', objet: 'Avis de CFE sur votre espace professionnel impots.gouv (vers la mi-novembre), paiement avant le 15/12',
      statut: c.etat, jours: j, urgent: j >= 0 && j <= 15, depassee: c.etat === 'en retard'
    });
  });

  // Autorisation de cumul d'activités (agent public) : avant la création de l'entreprise
  var cu = Fiscal_cumul(auj);
  if (cu.etat === 'en retard' || (['à venir', 'à faire'].indexOf(cu.etat) >= 0 && aujourdhui_(date_(cu.avant)) >= debut && aujourdhui_(date_(cu.avant)) <= fin)) {
    var jCu = ecartJours_(date_(cu.avant), auj);
    out.push({
      date: aujourdhui_(date_(cu.avant)), type: 'Déclaration', libelle: 'Demander l\'autorisation de cumul d\'activités',
      id_affaire: '', acheteur: 'Employeur (cumul d\'activités)', objet: 'Demande écrite à l\'employeur avant la création de l\'entreprise (activité accessoire : expertise et consultation). À marquer « faite » sur la carte de l\'accueil',
      statut: cu.etat, jours: jCu, urgent: jCu <= 7, depassee: cu.etat === 'en retard'
    });
  }

  // Déclaration de revenus (printemps) : CA encaissé de l'année précédente, à partir de la 1re année d'activité
  var ir = Fiscal_declarationRevenus(auj.getFullYear(), auj);
  if (['à venir', 'à faire', 'en retard'].indexOf(ir.etat) >= 0) {
    var dIr = date_(ir.echeance), jIr = ecartJours_(dIr, auj);
    var dansIr = aujourdhui_(dIr) >= debut && aujourdhui_(dIr) <= fin;
    if (dansIr || ir.etat !== 'à venir') {
      out.push({
        date: aujourdhui_(dIr), type: 'Déclaration', libelle: 'Déclaration de revenus — reporter le CA ' + ir.anneeCa + ' : ' + Courriers_euros_(ir.ca),
        id_affaire: '', acheteur: 'Impôts (revenus)', objet: 'impots.gouv.fr : déclaration en ligne, partie micro-entrepreneur (2042-C-PRO). Date limite selon le département : à vérifier',
        statut: ir.etat, jours: jIr, urgent: jIr >= 0 && jIr <= 15, depassee: ir.etat === 'en retard'
      });
    }
  }

  return out.sort(function (x, y) { return x.date - y.date || x.type.localeCompare(y.type); });
}

/** Facture « prévue » : saisie à l'avance (date d'émission postérieure à sa création) et pas encore arrivée. */
function Factures_prevue_(f, auj) {
  var d = date_(f.date), c = date_(f.cree_le);
  return d && c && aujourdhui_(d) > aujourdhui_(c) && aujourdhui_(d) >= aujourdhui_(auj);
}

// ——— Relances ———

/**
 * Crée les relances dues et clôt celles devenues sans objet. Idempotent (clé par relance).
 * Renvoie { creees, closes }.
 */
function Relances_synchroniser(quand) {
  var auj = aujourdhui_(quand);
  var relances = Db_lire(TABLES.RELANCES);
  var parCle = {};
  relances.forEach(function (r) { if (r.cle) parCle[r.cle] = r; });
  var affaires = Affaires_lister();
  var parId = {};
  affaires.forEach(function (a) { parId[a.id] = a; });
  var aCreer = [], closes = 0;
  var dues = {};
  var due = function (cle, ligne) {
    dues[cle] = true;
    if (!parCle[cle]) aCreer.push(Object.assign({ cle: cle, statut: 'à faire' }, ligne));
  };
  var validiteDefaut = Params_nombre('echeance.validite_defaut_j', 90);
  var delaiRappel = Params_nombre('echeance.rejet_relance_j', 10);

  affaires.forEach(function (a) {
    // Décision attendue : offre déposée, validité dépassée, pas de résultat
    if (a.statut === 'Déposée' && date_(a.date_depot)) {
      var fin = ajouterJours_(aujourdhui_(date_(a.date_depot)), montant_(a.validite_offre_jours) || validiteDefaut);
      if (fin < auj) due('decision:' + a.id, { id_affaire: a.id, type: TYPES_RELANCE.DECISION, date_prevue: fin,
        commentaire: 'Validité de l\'offre dépassée sans résultat : demander où en est la décision.' });
    }
    // Motifs du rejet : J+0 (créée au passage en Perdue), rappel à J+10 si rien reçu
    if (a.statut === 'Perdue') {
      var motifs = relances.filter(function (r) { return r.id_affaire === a.id && r.type === TYPES_RELANCE.MOTIFS; })[0];
      var depart = motifs ? date_(motifs.date_prevue) : date_(a.date_resultat);
      if (depart && !String(a.motifs_rejet || '').trim() && ajouterJours_(aujourdhui_(depart), delaiRappel) <= auj) {
        due('motifs-rappel:' + a.id, { id_affaire: a.id, type: TYPES_RELANCE.MOTIFS_RAPPEL,
          date_prevue: ajouterJours_(aujourdhui_(depart), delaiRappel),
          commentaire: 'Aucun motif reçu ' + delaiRappel + ' jours après la première demande : relancer l\'acheteur.' });
      }
    }
  });

  Db_lire(TABLES.FACTURES).forEach(function (f) {
    if (f.qonto_statut === 'annulée') return;
    var encaissee = !!date_(f.date_encaissement);
    var d = date_(f.date), c = date_(f.cree_le);
    if (d && c && aujourdhui_(d) > aujourdhui_(c) && aujourdhui_(d) <= auj && !encaissee) {
      // Facture saisie à l'avance (prévue) dont la date d'émission est arrivée : J-0
      due('facturation:' + f.id, { id_affaire: f.id_affaire, id_facture: f.id, type: TYPES_RELANCE.FACTURATION,
        date_prevue: aujourdhui_(date_(f.date)), commentaire: 'Émettre la facture ' + (f.numero || '') + '.' });
    }
    var ech = date_(f.date_echeance);
    if (!encaissee && ech && aujourdhui_(ech) < auj) {
      due('encaissement:' + f.id, { id_affaire: f.id_affaire, id_facture: f.id, type: TYPES_RELANCE.ENCAISSEMENT,
        date_prevue: aujourdhui_(ech), commentaire: 'Facture ' + (f.numero || '') + ' non payée à l\'échéance (délai de paiement public dépassé).' });
    }
  });

  // Déclaration URSSAF : période terminée et non déclarée
  [auj.getFullYear() - 1, auj.getFullYear()].forEach(function (an) {
    Fiscal_declarations(an, auj).periodes.forEach(function (p) {
      if (p.etat !== 'à déclarer' && p.etat !== 'en retard') return;
      due('urssaf:' + p.id, { id_affaire: '', type: TYPE_RELANCE_URSSAF, date_prevue: ajouterJours_(aujourdhui_(date_(p.fin)), 1),
        commentaire: 'Déclarer sur autoentrepreneur.urssaf.fr le CA encaissé ' + p.libelle + ' : ' + Courriers_euros_(p.ca) + ', avant le ' +
          Utilities.formatDate(date_(p.echeance), APP.FUSEAU, 'dd/MM/yyyy') + '.' });
    });
  });

  Db_insererPlusieurs(TABLES.RELANCES, aCreer);

  // Clôture automatique des relances devenues sans objet
  relances.forEach(function (r) {
    if (r.statut !== 'à faire' || !r.cle) return;
    var a = parId[r.id_affaire];
    var sansObjet = false;
    if (r.type === TYPES_RELANCE.MOTIFS || r.type === TYPES_RELANCE.MOTIFS_RAPPEL) sansObjet = a && String(a.motifs_rejet || '').trim() !== '';
    else if (r.type === TYPES_RELANCE.DECISION) sansObjet = !a || a.statut !== 'Déposée';
    else if (r.type === TYPES_RELANCE.ENCAISSEMENT) sansObjet = !dues[r.cle]; // facture encaissée entre-temps
    else if (r.type === TYPE_RELANCE_URSSAF) sansObjet = !dues[r.cle]; // période déclarée
    if (sansObjet) {
      Db_maj(TABLES.RELANCES, r.id, { statut: 'sans objet', date_faite: auj,
        commentaire: (r.commentaire ? r.commentaire + ' ' : '') + '[Clôturée automatiquement]' });
      closes++;
    }
  });
  return { creees: aCreer.length, closes: closes };
}

/** Relances à faire (date prévue atteinte ou dépassée, ou toutes si tout = true). */
function Relances_aFaire(quand, tout) {
  var auj = aujourdhui_(quand);
  var affaires = {};
  Affaires_lister().forEach(function (a) { affaires[a.id] = a; });
  return Db_lire(TABLES.RELANCES)
    .filter(function (r) { return r.statut === 'à faire' && (tout || !date_(r.date_prevue) || aujourdhui_(date_(r.date_prevue)) <= auj); })
    .map(function (r) {
      var a = affaires[r.id_affaire] || (r.type === TYPE_RELANCE_URSSAF ? { acheteur: 'URSSAF', objet: r.commentaire } : {});
      return Object.assign({}, r, { acheteur: a.acheteur || '', objet: a.objet || '', jours: date_(r.date_prevue) ? ecartJours_(date_(r.date_prevue), auj) : 0 });
    })
    .sort(function (x, y) { return (date_(x.date_prevue) || 0) - (date_(y.date_prevue) || 0); });
}

function Relances_changerStatut(idRelance, statut, quand) {
  if (['à faire', 'faite', 'sans objet'].indexOf(statut) < 0) throw new Error('Statut de relance inconnu : ' + statut);
  var r = Db_trouver(TABLES.RELANCES, idRelance);
  if (!r) throw new Error('Relance introuvable : ' + idRelance);
  return Db_maj(TABLES.RELANCES, idRelance, { statut: statut, date_faite: statut === 'à faire' ? '' : aujourdhui_(quand) });
}


// ════════ Email.js ════════

/**
 * E-mail du matin (§ 6) : du lundi au vendredi à 7 h vers le compte de l'app.
 * Rubriques : nouveaux avis PACA, nouveaux avis France, échéances à 7 jours, relances à faire,
 * indicateurs. Rubriques vides masquées. Sans nouvel avis, échéance ni relance : e-mail « aucun nouvel avis »
 * avec le bilan de la collecte du matin (paramètre email.si_rien, oui par défaut — décision du 18/11/2026) ;
 * avec email.si_rien = non, pas d'envoi sauf le lundi (récapitulatif).
 *
 * Les e-mails n'acceptent pas les variables CSS : les couleurs de la charte (tokens.css)
 * sont reprises ici en valeurs.
 */

var COULEURS_EMAIL = {
  encre: '#0B1220', ardoise: '#1B263B', rouille: '#B4460E', brume: '#EEF1F6',
  gris: '#4A5568', filet: '#D5DBE5', blanc: '#FFFFFF', inverse: '#EEF2F8', inverse2: '#A3B0C4'
};
var JOURS_SEMAINE = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** Déclencheur quotidien (7 h). */
function envoyerEmailMatin() {
  MiseAJour_verifier_();
  return Email_envoyer_(new Date(), false);
}

/** Envoi immédiat depuis l'app (bouton de test) : ignore le jour de la semaine. */
function Email_envoyerTest() {
  return Email_envoyer_(new Date(), true);
}

function Email_envoyer_(quand, force) {
  var jour = JOURS_SEMAINE[quand.getDay()];
  var jours = Params_liste('email.jours');
  if (!force && jours.length && jours.indexOf(jour) < 0) {
    console.log('E-mail du matin : pas d\'envoi le ' + jour + '.');
    return { envoye: false, motif: 'jour non ouvré (' + jour + ')' };
  }
  Relances_synchroniser(quand);
  var props = PropertiesService.getScriptProperties();
  var dernier = props.getProperty('EMAIL_DERNIER_ENVOI');
  var mail = Email_construire(quand, dernier ? new Date(dernier) : null);
  var lundi = jour === 'lun' && Params_texte('email.recap_lundi', 'oui') === 'oui';
  var siRien = Params_texte('email.si_rien', 'oui') === 'oui';
  if (!mail.contenu && !lundi && !force && !siRien) {
    console.log('E-mail du matin : rien à signaler, pas d\'envoi.');
    return { envoye: false, motif: 'rubriques vides' };
  }
  var destinataire = Params_texte('email.destinataire', '') || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({ to: destinataire, subject: mail.sujet, htmlBody: mail.html, body: mail.texte, name: APP.NOM });
  props.setProperty('EMAIL_DERNIER_ENVOI', quand.toISOString());
  return { envoye: true, destinataire: destinataire, sujet: mail.sujet };
}

/** Contenu de l'e-mail. depuis : avis créés depuis cette date (défaut : 24 h). */
function Email_construire(quand, depuis) {
  quand = quand || new Date();
  var auj = aujourdhui_(quand);
  depuis = depuis || new Date(quand.getTime() - 86400000);
  var paca = Params_texte('zone.libelle_paca', 'PACA');
  var url = Email_urlApp_();

  var nouveaux = Db_lire(TABLES.AVIS).filter(function (a) {
    return a.statut === 'nouveau' && date_(a.cree_le) && new Date(a.cree_le) > depuis;
  }).sort(function (x, y) { return (Number(y.pre_score) || 0) - (Number(x.pre_score) || 0); });
  var avisPaca = nouveaux.filter(function (a) { return a.zone === paca; });
  // Hors PACA : seuls les avis « à étudier » sont détaillés ; les « possibles » sont comptés (lisibilité).
  var horsPaca = nouveaux.filter(function (a) { return a.zone !== paca; });
  var avisFrance = horsPaca.filter(function (a) { return a.classement === 'à étudier'; });
  var autresFrance = horsPaca.length - avisFrance.length;
  var echeances = Echeances_calculer(auj, ajouterJours_(auj, 7), quand)
    .filter(function (e) { return ['Remise', 'Questions', 'Visite', 'Déclaration', 'Livrable', 'Facturation'].indexOf(e.type) >= 0; });
  var relances = Relances_aFaire(quand);
  var ind = Indicateurs_resume(quand);
  // Remises imminentes (J-3 à J0) : encadré rouge en tête de l'e-mail et dans l'objet.
  var remises = echeances.filter(function (e) { return e.type === 'Remise' && e.jours >= 0 && e.jours <= 3; })
    .sort(function (x, y) { return x.jours - y.jours; })
    .map(function (e) { return Object.assign({ pieces: PiecesOffre_resume_(PiecesOffre_lister(e.id_affaire)) }, e); });

  var C = COULEURS_EMAIL;
  var h = function (s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var jr = function (d) { return Utilities.formatDate(date_(d) || new Date(d), APP.FUSEAU, 'dd/MM/yyyy'); };
  var mono = 'font-family:\'IBM Plex Mono\',Consolas,monospace;';
  var bouton = function (lien, txt) {
    return '<a href="' + h(lien) + '" style="display:inline-block;background:' + C.ardoise + ';color:' + C.inverse + ';text-decoration:none;padding:6px 12px;border-radius:4px;font-size:13px;font-weight:600">' + h(txt) + '</a>';
  };
  var section = function (titre, nb, lignes) {
    return '<tr><td style="padding:24px 24px 0"><h2 style="margin:0 0 8px;font-size:16px;color:' + C.ardoise + ';border-top:2px solid ' + C.ardoise + ';padding-top:10px">' +
      h(titre) + ' <span style="' + mono + 'color:' + C.gris + ';font-weight:400">(' + nb + ')</span></h2>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">' + lignes + '</table></td></tr>';
  };
  var ligneAvis = function (a, etiquette) {
    var jl = date_(a.date_limite) ? ecartJours_(new Date(a.date_limite), auj) : null;
    return '<tr><td style="padding:10px 0;border-bottom:1px solid ' + C.filet + ';vertical-align:top;width:44px">' +
      '<span style="' + mono + 'display:inline-block;background:' + (a.classement === 'à étudier' ? C.ardoise + ';color:' + C.inverse : C.brume + ';color:' + C.ardoise) + ';padding:2px 6px;border-radius:4px;font-weight:600">' + h(a.pre_score) + '</span></td>' +
      '<td style="padding:10px 8px;border-bottom:1px solid ' + C.filet + ';vertical-align:top">' +
      '<div style="font-weight:600">' + h(a.acheteur) + (a.departement ? ' <span style="' + mono + 'color:' + C.gris + ';font-weight:400">(' + h(a.departement) + ')</span>' : '') + '</div>' +
      '<div>' + h(a.objet) + '</div>' +
      '<div style="color:' + C.gris + ';font-size:13px">' + (jl === null ? 'Date limite inconnue' : 'Date limite <span style="' + mono + '">' + jr(a.date_limite) + '</span> (J-' + jl + ')') +
      (etiquette ? ' · <span style="color:' + C.rouille + ';font-weight:600">' + h(etiquette) + '</span>' : '') +
      ' · <a href="' + h(a.lien) + '" style="color:' + C.ardoise + '">Voir l\'avis</a></div></td>' +
      '<td style="padding:10px 0;border-bottom:1px solid ' + C.filet + ';vertical-align:top;text-align:right">' + bouton(url + '#veille', 'Étudier') + '</td></tr>';
  };
  var ligneSimple = function (date, quoi, a, lien, urgent) {
    return '<tr><td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';' + mono + 'white-space:nowrap;vertical-align:top;' + (urgent ? 'color:' + C.rouille + ';font-weight:600' : '') + '">' + h(date) + '</td>' +
      '<td style="padding:8px;border-bottom:1px solid ' + C.filet + ';vertical-align:top"><strong>' + h(quoi) + '</strong> — ' + h(a.acheteur) +
      '<div style="color:' + C.gris + ';font-size:13px">' + h(String(a.objet || '').slice(0, 140)) + '</div></td>' +
      '<td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';text-align:right;vertical-align:top"><a href="' + h(lien) + '" style="color:' + C.ardoise + '">Ouvrir</a></td></tr>';
  };

  var quandRemise = function (j) { return j === 0 ? 'aujourd\'hui' : j === 1 ? 'demain' : 'dans ' + j + ' jours'; };
  var etatPieces = function (p) {
    if (!p.total) return 'liste des pièces non renseignée (fiche › Offre)';
    var reste = p.total - p.pretes;
    return p.pretes + ' pièce' + (p.pretes > 1 ? 's' : '') + ' prête' + (p.pretes > 1 ? 's' : '') + ' sur ' + p.total + (reste ? ' — ' + reste + ' à finir' : ' — tout est prêt');
  };
  var conseilDepot = function (e) {
    return e.jours <= 2 ? 'Déposez aujourd\'hui : la plateforme peut être lente ou saturée la veille.'
      : 'Visez un dépôt le ' + jr(ajouterJours_(e.date, -2)) + ', 48 h avant la limite.';
  };
  var corps = '';
  if (remises.length) {
    corps += '<tr><td style="padding:24px 24px 0"><div style="border:2px solid ' + C.rouille + ';border-radius:8px;background:#FDF1EA;padding:12px 16px">' +
      '<div style="color:' + C.rouille + ';font-weight:700;font-size:16px;margin-bottom:4px">Remise imminente</div>' +
      remises.map(function (e) {
        return '<div style="padding:8px 0;border-top:1px solid ' + C.filet + '">' +
          '<div><span style="' + mono + 'color:' + C.rouille + ';font-weight:600">' + (e.jours === 0 ? 'J0' : 'J-' + e.jours) + ' · ' + jr(e.date) + '</span> — remise ' + quandRemise(e.jours) + '</div>' +
          '<div style="font-weight:600">' + h(e.acheteur) + '</div><div>' + h(String(e.objet || '').slice(0, 140)) + '</div>' +
          '<div style="font-size:13px;color:' + (e.pieces.total && e.pieces.pretes === e.pieces.total ? C.gris : C.rouille) + '">' + h(etatPieces(e.pieces)) + '</div>' +
          '<div style="font-size:13px;color:' + C.gris + ';margin-bottom:6px">' + h(conseilDepot(e)) + '</div>' +
          bouton(url + '#affaire/' + e.id_affaire, 'Ouvrir l\'offre') + '</div>';
      }).join('') + '</div></td></tr>';
  }
  if (avisPaca.length) corps += section('Nouveaux avis ' + paca, avisPaca.length, avisPaca.map(function (a) {
    return ligneAvis(a, /Bâtiment à vérifier/.test(a.score_detail || '') ? 'bâtiment à vérifier' : '');
  }).join(''));
  if (avisFrance.length || autresFrance) corps += section('Nouveaux avis hors ' + paca + ' à étudier', avisFrance.length,
    avisFrance.map(function (a) { return ligneAvis(a, 'présentiel à vérifier'); }).join('') +
    (autresFrance ? '<tr><td colspan="3" style="padding:10px 0;color:' + C.gris + ';font-size:13px">+ ' + autresFrance + ' autre' + (autresFrance > 1 ? 's' : '') +
      ' avis « possible » hors ' + h(paca) + ' : <a href="' + h(url) + '#veille" style="color:' + C.ardoise + '">voir dans l\'app</a></td></tr>' : ''));
  if (echeances.length) corps += section('Échéances des 7 prochains jours', echeances.length, echeances.map(function (e) {
    return ligneSimple(jr(e.date) + (e.jours === 0 ? ' (aujourd\'hui)' : e.jours < 0 ? ' (retard)' : ' (J-' + e.jours + ')'), e.libelle, e, url + (e.id_affaire ? '#affaire/' + e.id_affaire : '#accueil'), e.urgent || e.depassee);
  }).join(''));
  if (relances.length) corps += section('Relances à faire', relances.length, relances.map(function (r) {
    return ligneSimple(jr(r.date_prevue), r.type, r, url + '#echeancier', r.jours < 0);
  }).join(''));
  // Module Estimation : panne de la mise à jour des index Insee
  var alerteEst = '';
  if (typeof Est_alerteEmail_ === 'function') { try { alerteEst = Est_alerteEmail_(); } catch (e) { alerteEst = ''; } }
  var alertesPrev = [];
  try { alertesPrev = Previsionnel_alertes_(quand); } catch (e) { alertesPrev = []; }
  if (alertesPrev.length) corps += section('CA prévisionnel : seuil dépassé', alertesPrev.length, alertesPrev.map(function (t) {
    return '<tr><td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';color:' + C.rouille + '">' + h(t) + '</td></tr>';
  }).join('') + '<tr><td style="padding:8px 0"><a href="' + h(url) + '#previsionnel" style="color:' + C.ardoise + '">Voir le CA prévisionnel</a></td></tr>');
  if (alerteEst) corps += section('Module Estimation', 1, '<tr><td style="padding:8px 0;color:' + C.rouille + '">' + h(alerteEst) + '</td></tr>');
  var contenu = !!corps;
  var bilanVeille = Email_bilanVeille_(quand);
  if (!contenu) {
    corps = '<tr><td style="padding:24px 24px 0;color:' + C.gris + '">Rien de nouveau depuis le dernier envoi : pas de nouvel avis, pas d\'échéance dans les 7 jours, pas de relance à faire.' +
      '<div style="margin-top:8px;font-size:13px;' + (bilanVeille.alerte ? 'color:' + C.rouille + ';font-weight:600' : '') + '">' + h(bilanVeille.texte) + '</div></td></tr>';
  }

  // Indicateurs
  var statuts = Object.keys(ind.enCours).map(function (s) { return s + ' : <strong style="' + mono + '">' + ind.enCours[s] + '</strong>'; }).join(' · ');
  var taux = ind.attribution.gagnees + ind.attribution.perdues
    ? '<strong style="' + mono + '">' + Math.round(ind.attribution.taux * 100) + ' %</strong> (' + ind.attribution.gagnees + ' gagnée(s) / ' + (ind.attribution.gagnees + ind.attribution.perdues) + ')'
    : 'pas encore de résultat';
  var ca = ind.ca;
  var jalons = ca.jalons.map(function (j) {
    var couleur = j.etat === 'ok' ? C.gris : C.rouille;
    return '<span style="color:' + couleur + '">' + h(j.libelle) + ' <span style="' + mono + '">' + Courriers_euros_(j.seuil) + '</span>' + (j.etat === 'depasse' ? ' — dépassé' : j.etat === 'alerte' ? ' — ≥ ' + ca.alertePct + ' %' : '') + '</span>';
  }).join('<br>');
  corps += section('Indicateurs', 3,
    '<tr><td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';width:170px;color:' + C.gris + '">Affaires en cours</td><td style="padding:8px;border-bottom:1px solid ' + C.filet + '">' + (statuts || 'aucune') + '</td></tr>' +
    '<tr><td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';color:' + C.gris + '">Taux d\'attribution (12 mois)</td><td style="padding:8px;border-bottom:1px solid ' + C.filet + '">' + taux + '</td></tr>' +
    '<tr><td style="padding:8px 0;border-bottom:1px solid ' + C.filet + ';color:' + C.gris + ';vertical-align:top">CA encaissé ' + ca.annee + '</td><td style="padding:8px;border-bottom:1px solid ' + C.filet + '"><strong style="' + mono + '">' + Courriers_euros_(ca.encaisse) + '</strong> · engagé <span style="' + mono + '">' + Courriers_euros_(ca.engage) + '</span><br>' + jalons + '</td></tr>');

  var dateTxt = Utilities.formatDate(quand, APP.FUSEAU, 'dd/MM/yyyy');
  var nbAvis = avisPaca.length + horsPaca.length;
  var sujet = APP.NOM + ' — ' + dateTxt + ' — ' +
    (remises.length ? '⚠ Remise ' + (remises[0].jours === 0 ? 'aujourd\'hui' : 'J-' + remises[0].jours) + (remises.length > 1 ? ' (+' + (remises.length - 1) + ')' : '') + ' · ' : '') +
    (nbAvis ? nbAvis + (nbAvis > 1 ? ' nouveaux' : ' nouvel') + ' avis' : 'aucun nouvel avis') +
    ' · ' + echeances.length + ' échéance' + (echeances.length > 1 ? 's' : '');

  var html = '<!DOCTYPE html><html lang="fr"><body style="margin:0;background:' + C.brume + ';font-family:\'IBM Plex Sans\',Arial,sans-serif;color:' + C.encre + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.brume + '"><tr><td align="center" style="padding:16px 8px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:' + C.blanc + ';border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:' + C.ardoise + ';padding:18px 24px;color:' + C.inverse + '">' +
      '<div style="font-size:12px;letter-spacing:.14em;color:' + C.inverse2 + ';font-weight:600">KOMPA INGÉNIERIE</div>' +
      '<div style="font-size:20px;font-weight:700">' + APP.NOM + ' — ' + dateTxt + '</div></td></tr>' +
    corps +
    '<tr><td style="padding:24px">' + bouton(url, 'Ouvrir ' + APP.NOM) + '</td></tr>' +
    '<tr><td style="padding:12px 24px;border-top:1px solid ' + C.filet + ';color:' + C.gris + ';font-size:12px;' + mono + '">E-mail automatique du lundi au vendredi à ' + Params_nombre('email.heure', 7) + ' h — paramètres email.* de l\'app.</td></tr>' +
    '</table></td></tr></table></body></html>';

  var texte = [sujet, '']
    .concat(remises.length ? ['⚠ REMISE IMMINENTE'].concat(remises.map(function (e) {
      return '- ' + (e.jours === 0 ? 'J0' : 'J-' + e.jours) + ' ' + jr(e.date) + ' ' + e.acheteur + ' — ' + etatPieces(e.pieces) + '. ' + conseilDepot(e) + ' ' + url + '#affaire/' + e.id_affaire;
    })).concat(['']) : [])
    .concat(avisPaca.length ? ['NOUVEAUX AVIS ' + paca].concat(avisPaca.map(function (a) { return '- [' + a.pre_score + '] ' + a.acheteur + ' — ' + a.objet + ' — ' + a.lien; })).concat(['']) : [])
    .concat(avisFrance.length ? ['NOUVEAUX AVIS HORS ' + paca + ' (présentiel à vérifier)'].concat(avisFrance.map(function (a) { return '- [' + a.pre_score + '] ' + a.acheteur + ' — ' + a.objet + ' — ' + a.lien; })).concat(['']) : [])
    .concat(echeances.length ? ['ÉCHÉANCES À 7 JOURS'].concat(echeances.map(function (e) { return '- ' + jr(e.date) + ' ' + e.libelle + ' — ' + e.acheteur; })).concat(['']) : [])
    .concat(relances.length ? ['RELANCES À FAIRE'].concat(relances.map(function (r) { return '- ' + jr(r.date_prevue) + ' ' + r.type + ' — ' + r.acheteur; })).concat(['']) : [])
    .concat(contenu ? [] : ['Rien de nouveau depuis le dernier envoi.', bilanVeille.texte, ''])
    .concat(alertesPrev.length ? ['CA PRÉVISIONNEL : SEUIL DÉPASSÉ'].concat(alertesPrev.map(function (t) { return '- ' + t; })).concat(['']) : [])
    .concat(alerteEst ? ['MODULE ESTIMATION', '- ' + alerteEst, ''] : [])
    .concat(['Ouvrir l\'app : ' + url]).join('\n');

  return { sujet: sujet, html: html, texte: texte, contenu: contenu,
    nombres: { remises: remises.length, avisPaca: avisPaca.length, avisFrance: horsPaca.length, echeances: echeances.length, relances: relances.length } };
}

/**
 * Bilan de la collecte du jour (onglet Journal moteur) : preuve que la veille a tourné.
 * Sans collecte enregistrée le jour de l'envoi : alerte (déclencheur absent ou en erreur).
 */
function Email_bilanVeille_(quand) {
  var jour = jourIso_(quand);
  var lignes = Db_lire(TABLES.JOURNAL_MOTEUR).filter(function (l) {
    var d = date_(l.date) || (l.date ? new Date(l.date) : null);
    return d && !isNaN(d.getTime()) && jourIso_(d) === jour && d <= quand;
  });
  var derniere = function (source) {
    var l = lignes.filter(function (x) { return x.source === source; });
    return l[l.length - 1] || null;
  };
  var boamp = derniere(SOURCE_BOAMP), gmail = derniere(SOURCE_GMAIL);
  if (!boamp) {
    return { alerte: true, texte: 'Aucune collecte de la veille enregistrée aujourd\'hui avant cet envoi : vérifiez les déclencheurs (accueil de l\'app, carte « État du socle »).' };
  }
  var n = function (v) { return Number(v) || 0; };
  var heure = Utilities.formatDate(date_(boamp.date) || new Date(boamp.date), APP.FUSEAU, 'HH:mm').replace(':', ' h ');
  var t = 'Veille de ce matin (' + heure + ') : ' + n(boamp.avis_lus) + ' avis lus au BOAMP — ' + n(boamp.exclus) + ' écartés par les filtres, ' +
    n(boamp.doublons) + ' déjà connus, ' + n(boamp.avis_retenus) + ' nouveau' + (n(boamp.avis_retenus) > 1 ? 'x' : '') +
    (gmail ? ' ; ' + n(gmail.avis_lus) + ' alerte' + (n(gmail.avis_lus) > 1 ? 's' : '') + ' e-mail de plateforme' : '') + '.';
  var erreurs = [boamp, gmail].filter(function (x) { return x && String(x.erreurs || '').trim(); });
  if (erreurs.length) t += ' Erreur : ' + erreurs.map(function (x) { return x.source + ' — ' + x.erreurs; }).join(' ; ');
  return { alerte: !!erreurs.length, texte: t };
}

function Email_urlApp_() {
  var u = Params_texte('app.url', '');
  if (u) return u;
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}


// ════════ Exercice.js ════════

/**
 * Affaire d'exercice : Mouthe (§ 11 et recette du lot 2).
 *
 * Données du DCE réel (SIVOM des Hauts du Doubs) ; offre, dates et résultat FICTIFS.
 * À lancer une fois depuis l'éditeur : creerAffaireExerciceMouthe.
 * Sans effet si l'affaire d'exercice existe déjà.
 */

var REF_EXERCICE_MOUTHE = 'EXERCICE-MOUTHE';

function creerAffaireExerciceMouthe() {
  var existante = Affaires_lister().filter(function (a) { return a.reference_acheteur === REF_EXERCICE_MOUTHE; })[0];
  if (existante) {
    console.log('Affaire d\'exercice déjà présente : ' + existante.id);
    return existante.id;
  }

  // 1. Création (veille) — 03/09/2026
  var a = Affaires_creer({
    acheteur: 'SIVOM des Hauts du Doubs',
    type_acheteur: 'EPCI',
    departement: '25',
    objet: '[EXERCICE] AMO — construction d\'un accueil périscolaire avec restauration à Mouthe : ' +
      'étude de faisabilité sur deux sites, programme, recrutement de la maîtrise d\'œuvre et vérification des études jusqu\'à l\'APD',
    reference_acheteur: REF_EXERCICE_MOUTHE,
    procedure: 'MAPA',
    plateforme: '[plateforme — exercice]',
    date_limite_remise: '2026-10-02',
    date_limite_questions: '2026-09-22',
    validite_offre_jours: 90,
    pre_score: 78, // France 10 + mission cœur 30 + délai ≥ 15 j 15 + EPCI 15 + montant inconnu 8
    tranches: 'TF : étude de faisabilité (4 mois)\n' +
      'Hypothèse a (site de l\'école du Bois Joli) : TO1a programme (2 mois) ; TO2a recrutement MOE, CT, CSPS et vérification jusqu\'à l\'APD (6 mois)\n' +
      'Hypothèse b (site « Colombo ») : TO1b montage avec un bailleur social (4 mois) ; TO2b vérification jusqu\'à l\'APD (4 mois)'
  }, { date: '2026-09-03', commentaire: 'Affaire d\'exercice : DCE réel, offre et résultat fictifs' });
  var id = a.id;

  Affaires_ajouterNote(id, 'Département 25 : au moins 3 réunions en tranche ferme, 1 en TO1a, 6 en TO2a. Présentiel à chiffrer (déplacements).', '2026-09-04');

  // 2. Go — 08/09/2026
  Affaires_changerStatut(id, STATUTS.GO, { score_final: 62 },
    { date: '2026-09-08', commentaire: 'Mission cœur (faisabilité, programmation) ; déplacements à intégrer au prix' });

  Affaires_maj(id, {
    groupement: 'Seul',
    jours_par_tranche: 'TF 14 j ; TO1a 6 j ; TO2a 16 j (hypothèse a, chiffrée dans le total)\nTO1b 10 j ; TO2b 8 j',
    prix_jour: 550
  });

  // 3. Déposée — 01/10/2026 : TF + TO1a + TO2a = 36 j × 550 € = 19 800 € HT
  Affaires_changerStatut(id, STATUTS.DEPOSEE, {
    montant_ht: 19800, montant_pondere: '', jours_reponse: 3, date_depot: '2026-10-01'
  }, { date: '2026-10-01', commentaire: 'Offre déposée (hypothèse a : TF + TO1a + TO2a)' });

  // 4. Perdue — 06/11/2026 (résultat fictif)
  Affaires_changerStatut(id, STATUTS.PERDUE, {
    date_resultat: '2026-11-06',
    attributaire: '[attributaire — fictif]',
    prix_attributaire: 17600,
    rang: 2
  }, { date: '2026-11-06', commentaire: 'Lettre de rejet reçue (fictive)' });

  // Motifs reçus : la relance créée au passage en Perdue est faite
  Db_lire(TABLES.RELANCES)
    .filter(function (r) { return r.id_affaire === id && r.type === 'Motifs du rejet'; })
    .forEach(function (r) { Db_maj(TABLES.RELANCES, r.id, { statut: 'faite', date_faite: date_('2026-11-10') }); });

  Affaires_maj(id, {
    motifs_rejet: 'Valeur technique : note méthodologique jugée moins précise sur la TO2a (analyse des offres de maîtrise d\'œuvre, vérification des études). ' +
      'Prix : offre supérieure de 12,5 % à celle de l\'attributaire.',
    points_faibles: 'Planning de la TO2a peu détaillé ; aucune référence de vérification d\'APD sur un équipement scolaire ou périscolaire ; ' +
      'frais de déplacement vers le Doubs intégrés au prix journalier.',
    action_corrective: 'Ajouter à la note méthodologique un planning par phase et un exemple de grille de vérification APS / APD ; ' +
      'chiffrer les déplacements à part ou proposer des réunions en visioconférence.',
    piece_type: 'note méthodologique'
  });

  Criteres_enregistrer(id, [
    { critere: 'Valeur technique', ponderation: 60, note_kompa: 44, note_attributaire: 50 },
    { critere: 'Prix', ponderation: 40, note_kompa: 35.6, note_attributaire: 40 }
  ]);

  Affaires_ajouterNote(id, 'Exercice terminé : rang 2, 79,6 / 100 contre 90 / 100 pour l\'attributaire (fictif).', '2026-11-10');
  console.log('Affaire d\'exercice créée : ' + id);
  return id;
}

/**
 * Recette du lot 5 : trois affaires fictives [TEST] dont les indicateurs se recalculent
 * à la main (docs/recette-lot-5.md). À lancer depuis l'éditeur : creerAffairesTestIndicateurs ;
 * puis supprimerAffairesTest pour tout effacer (affaires, historique, critères, factures, relances).
 */
var MARQUE_TEST = '[TEST]';

function creerAffairesTestIndicateurs() {
  if (Affaires_lister().some(function (a) { return String(a.acheteur).indexOf(MARQUE_TEST) === 0; })) {
    console.log('Affaires [TEST] déjà présentes.');
    return Affaires_lister().filter(function (a) { return String(a.acheteur).indexOf(MARQUE_TEST) === 0; }).map(function (a) { return a.id; });
  }
  // T1 — gagnée : Go, déposée 20 000 € (4 j), notifiée 20 000 €, rang 1 ; facture 10 000 € encaissée
  var t1 = Affaires_creer({ acheteur: MARQUE_TEST + ' Commune A', type_acheteur: 'Commune', departement: '83', objet: MARQUE_TEST + ' Faisabilité école', procedure: 'MAPA' }, { date: '2026-05-20' }).id;
  Affaires_changerStatut(t1, STATUTS.GO, {}, { date: '2026-06-02' });
  Affaires_changerStatut(t1, STATUTS.DEPOSEE, { montant_ht: 20000, jours_reponse: 4, date_depot: '2026-06-20' }, { date: '2026-06-20' });
  Affaires_changerStatut(t1, STATUTS.GAGNEE, { date_notification: '2026-07-15', montant_notifie: 20000, rang: 1 }, { date: '2026-07-15' });
  Affaires_maj(t1, { rang: 1 });
  Factures_ajouter(t1, { numero: 'TEST-01', date: '2026-08-31', montant: 10000, date_encaissement: '2026-09-30', montant_encaisse: 10000 });

  // T2 — perdue : Go, déposée 15 000 € (3 j), attributaire 12 000 €, rang 3 ; technique 40 / 48 ; pièce : prix
  var t2 = Affaires_creer({ acheteur: MARQUE_TEST + ' EPCI B', type_acheteur: 'EPCI', departement: '13', objet: MARQUE_TEST + ' Programmation gymnase', procedure: 'MAPA' }, { date: '2026-06-25' }).id;
  Affaires_changerStatut(t2, STATUTS.GO, {}, { date: '2026-07-01' });
  Affaires_changerStatut(t2, STATUTS.DEPOSEE, { montant_ht: 15000, jours_reponse: 3, date_depot: '2026-07-20' }, { date: '2026-07-20' });
  Affaires_changerStatut(t2, STATUTS.PERDUE, { date_resultat: '2026-09-10', attributaire: MARQUE_TEST + ' Concurrent', prix_attributaire: 12000, rang: 3 }, { date: '2026-09-10' });
  Affaires_maj(t2, { motifs_rejet: 'Prix', piece_type: 'prix' });
  Criteres_enregistrer(t2, [
    { critere: 'Valeur technique', ponderation: 60, note_kompa: 40, note_attributaire: 48 },
    { critere: 'Prix', ponderation: 40, note_kompa: 32, note_attributaire: 40 }
  ]);

  // T3 — No-go : motif « charge »
  var t3 = Affaires_creer({ acheteur: MARQUE_TEST + ' Commune C', type_acheteur: 'Commune', departement: '04', objet: MARQUE_TEST + ' Étude préalable', procedure: 'MAPA' }, { date: '2026-08-01' }).id;
  Affaires_changerStatut(t3, STATUTS.NOGO, { motif_decision: 'charge' }, { date: '2026-08-05' });

  console.log('Affaires [TEST] créées : ' + [t1, t2, t3].join(', '));
  return [t1, t2, t3];
}

function supprimerAffairesTest() {
  var ids = Affaires_lister().filter(function (a) { return String(a.acheteur).indexOf(MARQUE_TEST) === 0; }).map(function (a) { return String(a.id); });
  if (!ids.length) { console.log('Aucune affaire [TEST].'); return 0; }
  var lie = function (l) { return ids.indexOf(String(l.id_affaire)) >= 0; };
  [TABLES.HISTORIQUE, TABLES.CRITERES, TABLES.FACTURES, TABLES.RELANCES].forEach(function (t) { Db_supprimerSi(t, lie); });
  Db_supprimerSi(TABLES.AFFAIRES, function (a) { return ids.indexOf(String(a.id)) >= 0; });
  console.log('Affaires [TEST] supprimées : ' + ids.join(', '));
  return ids.length;
}


// ════════ Finances.js ════════

/**
 * Écran « Finances » (réorganisation du 21/11/2026) : vue d'ensemble, prévisionnel, encaissements, URSSAF et CFE.
 * Regroupe ce qui était dispersé entre l'accueil (CA, URSSAF), l'écran CA prévisionnel et les fiches (factures).
 */

/**
 * Encaissements de toutes les affaires gagnées (planning de facturation + factures sans tranche non payées),
 * sur une même ligne de temps. Renvoie { lignes: [...], debut, fin, aujourdhui }.
 */
function Finances_encaissements_(quand) {
  var auj = aujourdhui_(quand);
  var lignes = [];
  Affaires_lister().forEach(function (a) {
    if (['Gagnée', 'Soldée'].indexOf(String(a.statut)) < 0) return;
    var p = Planning_affaire(a.id, auj);
    p.lignes.forEach(function (l) {
      if (l.etat === 'couverte' || (a.statut === 'Soldée' && l.etat !== 'payée')) return;
      lignes.push(Object.assign({ id_affaire: a.id, acheteur: String(a.acheteur || ''), objet: String(a.objet || '') }, l));
    });
    // Factures saisies sans tranche (avant le planning) et non payées
    Db_lire(TABLES.FACTURES).forEach(function (f) {
      if (String(f.id_affaire) !== String(a.id) || f.tranche || date_(f.date_encaissement) || f.qonto_statut === 'annulée') return;
      var dE = date_(f.date_echeance), dF = date_(f.date);
      var enRetard = dE && auj > aujourdhui_(dE);
      lignes.push({
        id_affaire: a.id, acheteur: String(a.acheteur || ''), objet: String(a.objet || ''),
        tranche: '', jours: 0, montant: arrondi_(montant_(f.montant)), livrables: [],
        etat: enRetard ? 'en retard' : 'facturée', dateFacture: dF ? jourIso_(dF) : '', dateEcheance: dE ? jourIso_(dE) : '',
        dateEncaissement: '', montantEncaisse: 0, facture: { id: String(f.id), numero: String(f.numero || '') },
        retard: enRetard ? Planning_interets_(montant_(f.montant), dE, auj) : null, optionnelle: false, affermissement: 'ferme'
      });
    });
  });
  var ordre = { 'en retard': 0, 'facturée': 1, 'prévue': 2, 'à planifier': 3, 'payée': 4 };
  lignes.sort(function (x, y) {
    return (ordre[x.etat] - ordre[y.etat]) || String(x.dateEcheance || '9999').localeCompare(String(y.dateEcheance || '9999'));
  });
  var dates = [];
  lignes.forEach(function (l) {
    l.livrables.forEach(function (x) { if (x.date) dates.push(x.date); });
    [l.dateFacture, l.dateEcheance, l.dateEncaissement].forEach(function (d) { if (d) dates.push(d); });
  });
  dates.sort();
  return { lignes: lignes, debut: dates[0] || '', fin: dates[dates.length - 1] || '', aujourdhui: jourIso_(auj) };
}

/** Paiements en retard (toutes affaires) : pour les alertes de l'accueil. */
function Finances_retards_(quand) {
  return Finances_encaissements_(quand).lignes.filter(function (l) { return l.etat === 'en retard'; }).map(function (l) {
    return { id_affaire: l.id_affaire, acheteur: l.acheteur, tranche: l.tranche, numero: l.facture ? l.facture.numero : '',
      montant: l.montant, jours: l.retard ? l.retard.jours : 0, interets: l.retard ? l.retard.interets : 0, indemnite: l.retard ? l.retard.indemnite : 0 };
  });
}

/** Synthèse de l'écran Finances (tout en un appel). */
function Finances_synthese(quand) {
  var auj = aujourdhui_(quand);
  var enc = Finances_encaissements_(auj);
  var somme = function (filtre) { return arrondi_(enc.lignes.filter(filtre).reduce(function (s, l) { return s + l.montant; }, 0)); };
  var fiscal = Fiscal_declarations(null, auj);
  var prochaineDecl = fiscal.periodes.filter(function (p) { return p.etat !== 'déclarée' && p.etat !== 'non suivie'; })[0] || null;
  var cfe = fiscal.cfe && ['non due', 'exonérée', 'payée'].indexOf(fiscal.cfe.etat) < 0 ? fiscal.cfe : fiscal.cfeProchaine;
  return {
    ca: Compteur_ca(auj.getFullYear()),
    previsionnel: Previsionnel_ca(auj),
    encaissements: enc,
    fiscal: fiscal,
    resume: {
      enAttente: somme(function (l) { return l.etat === 'facturée' || l.etat === 'en retard'; }),
      enRetard: somme(function (l) { return l.etat === 'en retard'; }),
      nbRetard: enc.lignes.filter(function (l) { return l.etat === 'en retard'; }).length,
      aFacturer: somme(function (l) { return (l.etat === 'prévue' || l.etat === 'à planifier') && l.affermissement !== 'non affermie' && l.affermissement !== 'optionnelle'; }),
      optionnel: somme(function (l) { return (l.etat === 'prévue' || l.etat === 'à planifier') && l.affermissement === 'optionnelle'; }),
      prochaineDeclaration: prochaineDecl ? { libelle: prochaineDecl.libelle, echeance: prochaineDecl.echeance, total: prochaineDecl.total } : null,
      cfe: cfe ? { annee: cfe.annee, echeance: cfe.echeance, montant: cfe.montant, estime: cfe.estime, etat: cfe.etat } : null
    }
  };
}

/** Recherche rapide (Ctrl+K) : liste légère des affaires. */
function Finances_listeRecherche_() {
  return Affaires_lister().map(function (a) {
    return { id: a.id, acheteur: String(a.acheteur || ''), objet: String(a.objet || ''), statut: String(a.statut || ''), departement: String(a.departement || '') };
  });
}


// ════════ Fiscal.js ════════

/**
 * Déclarations de CA à l'URSSAF (micro-entreprise), au rythme choisi : trimestriel (défaut) ou mensuel.
 *
 * Base : CA ENCAISSÉ de la période (date et montant d'encaissement des factures).
 * Échéances : trimestriel → 30/04, 31/07, 31/10, 31/01 ; mensuel → dernier jour du mois suivant.
 * Estimation des sommes à payer : CA × taux (paramètres fiscal.*, à vérifier chaque année
 * dans l'espace autoentrepreneur.urssaf.fr) — cotisations sociales, CFP, versement libératoire.
 */

var TYPE_RELANCE_URSSAF = 'Déclaration URSSAF';

/** Périodes de l'année (trimestres ou mois) avec bornes et échéance de déclaration. */
function Fiscal_periodes_(annee) {
  var mensuel = Params_texte('fiscal.periodicite', 'trimestrielle').toLowerCase().indexOf('mens') === 0;
  var out = [];
  var n = mensuel ? 12 : 4, pas = mensuel ? 1 : 3;
  for (var i = 0; i < n; i++) {
    var debut = new Date(annee, i * pas, 1);
    var fin = new Date(annee, i * pas + pas, 0);
    var echeance = new Date(annee, i * pas + pas + 1, 0); // dernier jour du mois suivant la période
    out.push({
      id: annee + '-' + (mensuel ? 'M' + ('0' + (i + 1)).slice(-2) : 'T' + (i + 1)),
      libelle: mensuel ? Utilities.formatDate(debut, APP.FUSEAU, 'MM/yyyy') : 'T' + (i + 1) + ' ' + annee,
      debut: debut, fin: fin, echeance: echeance
    });
  }
  return out;
}

function Fiscal_taux_() {
  var t = function (cle) { var v = Params_nombre(cle, null); return v === null ? null : v / 100; };
  var vl = Params_texte('fiscal.versement_liberatoire', 'non').toLowerCase() === 'oui';
  return {
    cotisations: t('fiscal.taux_cotisations'),
    cfp: t('fiscal.taux_cfp'),
    vl: vl,
    impot: vl ? t('fiscal.taux_versement_liberatoire') : 0
  };
}

/**
 * Déclarations de l'année : CA encaissé, estimation des sommes dues, échéance et état
 * (à venir, en cours, à déclarer, en retard, déclarée).
 */
function Fiscal_declarations(annee, quand) {
  var auj = aujourdhui_(quand);
  annee = annee || auj.getFullYear();
  var taux = Fiscal_taux_();
  var factures = Db_lire(TABLES.FACTURES);
  var declarees = {};
  Db_lire(TABLES.DECLARATIONS).forEach(function (d) { declarees[d.id] = d; });
  var arr = function (x) { return x === null ? null : arrondi_(x); };
  var debutSuivi = date_(Params_texte('fiscal.debut_suivi', ''));
  // Rien à déclarer avant la création de l'entreprise : le suivi part de la plus tardive des deux dates
  var creationEntreprise = date_(Params_texte('fiscal.date_creation', ''));
  if (creationEntreprise && (!debutSuivi || creationEntreprise > debutSuivi)) debutSuivi = creationEntreprise;

  var periodes = Fiscal_periodes_(annee).map(function (p) {
    var ca = factures.reduce(function (s, f) {
      var d = date_(f.date_encaissement);
      return d && aujourdhui_(d) >= p.debut && aujourdhui_(d) <= p.fin ? s + montant_(f.montant_encaisse) : s;
    }, 0);
    var cotisations = taux.cotisations === null ? null : ca * taux.cotisations;
    var cfp = taux.cfp === null ? null : ca * taux.cfp;
    var impot = taux.impot === null ? null : ca * taux.impot;
    var total = cotisations === null || cfp === null || impot === null ? null : cotisations + cfp + impot;
    var dec = declarees[p.id];
    var etat = dec && dec.date_declaration ? 'déclarée'
      : debutSuivi && p.fin < aujourdhui_(debutSuivi) ? 'non suivie'
      : auj < p.debut ? 'à venir'
      : auj <= p.fin ? 'en cours'
      : auj <= p.echeance ? 'à déclarer' : 'en retard';
    return {
      id: p.id, libelle: p.libelle, debut: jourIso_(p.debut), fin: jourIso_(p.fin), echeance: jourIso_(p.echeance),
      ca: arrondi_(ca), cotisations: arr(cotisations), cfp: arr(cfp), impot: arr(impot), total: arr(total),
      etat: etat, joursAvantEcheance: ecartJours_(p.echeance, auj),
      ca_declare: dec ? montant_(dec.ca_declare) : null,
      date_declaration: dec && date_(dec.date_declaration) ? jourIso_(date_(dec.date_declaration)) : ''
    };
  });
  var somme = function (k) {
    return periodes.some(function (p) { return p[k] === null; }) ? null : arrondi_(periodes.reduce(function (s, p) { return s + p[k]; }, 0));
  };
  return {
    annee: annee,
    periodicite: Params_texte('fiscal.periodicite', 'trimestrielle'),
    debutSuivi: debutSuivi ? jourIso_(debutSuivi) : '',
    taux: { cotisations: taux.cotisations, cfp: taux.cfp, impot: taux.impot, versementLiberatoire: taux.vl },
    tauxManquants: taux.cotisations === null || taux.cfp === null || taux.impot === null,
    periodes: periodes,
    cfe: Fiscal_cfe(annee, quand),
    cumul: Fiscal_cumul(quand),
    revenus: Fiscal_declarationRevenus(annee, quand),
    cfeProchaine: (function () {
      for (var an = annee + 1; an <= annee + 4; an++) {
        var c = Fiscal_cfe(an, quand);
        if (['non due', 'exonérée'].indexOf(c.etat) < 0) return c;
      }
      return null;
    })(),
    totaux: { ca: somme('ca'), cotisations: somme('cotisations'), cfp: somme('cfp'), impot: somme('impot'), total: somme('total') }
  };
}

/**
 * CFE (cotisation foncière des entreprises) d'une année : due au 15 décembre, avis sur impots.gouv.
 * Exonérée l'année de création ; base réduite de moitié l'année suivante ; non due avant la création.
 * Montant : celui payé (onglet Déclarations, id « CFE-AAAA »), à défaut estimation fiscal.cfe_montant.
 * Renvoie { id, annee, echeance, etat: 'non due'|'exonérée'|'à venir'|'à payer'|'en retard'|'payée', montant, estime, reduction, motif }.
 */
function Fiscal_cfe(annee, quand) {
  var auj = aujourdhui_(quand);
  annee = annee || auj.getFullYear();
  var creation = date_(Params_texte('fiscal.date_creation', ''));
  var anCreation = creation ? creation.getFullYear() : null;
  var estimeAnnee = Params_nombre('fiscal.cfe_montant', null);
  var echeance = new Date(annee, 11, 15);
  var id = 'CFE-' + annee;
  var dec = Db_trouver(TABLES.DECLARATIONS, id);
  var r = { id: id, annee: annee, echeance: jourIso_(echeance), dateCreation: creation ? jourIso_(creation) : '', estimeAnnee: estimeAnnee,
    reduction: false, montant: null, estime: true, etat: 'à venir', motif: '', date_paiement: '', joursAvantEcheance: ecartJours_(echeance, auj) };
  if (anCreation === null) { r.etat = 'à venir'; r.motif = 'date de création à renseigner'; }
  else if (annee < anCreation) { r.etat = 'non due'; r.motif = 'avant la création (' + Utilities.formatDate(creation, APP.FUSEAU, 'MM/yyyy') + ')'; return r; }
  else if (annee === anCreation) { r.etat = 'exonérée'; r.motif = 'année de création'; return r; }
  if (anCreation !== null && annee === anCreation + 1) { r.reduction = true; r.motif = 'base réduite de moitié (2e année)'; }
  if (dec && date_(dec.date_declaration)) {
    r.etat = 'payée'; r.montant = montant_(dec.ca_declare); r.estime = false; r.date_paiement = jourIso_(date_(dec.date_declaration));
    return r;
  }
  r.montant = estimeAnnee === null ? null : arrondi_(estimeAnnee * (r.reduction ? 0.5 : 1));
  if (anCreation !== null) r.etat = auj > echeance ? 'en retard' : (auj >= new Date(annee, 10, 15) ? 'à payer' : 'à venir');
  return r;
}

/**
 * Déclaration annuelle de revenus (impots.gouv, au printemps) : le CA encaissé de l'année précédente est à reporter
 * dans la partie « micro-entrepreneur » de la déclaration complémentaire (2042-C-PRO).
 * annee = année de la déclaration (ex. 2028 pour le CA 2027). Rien n'est dû pour une année antérieure à la création
 * de l'entreprise (ex. au printemps 2027, aucun CA 2026 de micro-entreprise : pas de rappel).
 * Dates : paramètres fiscal.declaration_revenus_ouverture et fiscal.declaration_revenus_limite (MM-JJ), à vérifier
 * chaque printemps (la date limite dépend du département). Fait : onglet Déclarations, id « IR-AAAA ».
 * Renvoie { id, annee, anneeCa, ca, ouverture, echeance, etat: 'non due'|'à venir'|'à faire'|'en retard'|'faite', date_declaration }.
 */
function Fiscal_declarationRevenus(annee, quand) {
  var auj = aujourdhui_(quand);
  annee = Number(annee) || auj.getFullYear();
  var anneeCa = annee - 1;
  var creation = date_(Params_texte('fiscal.date_creation', ''));
  var md = function (cle, defaut) {
    var m = String(Params_texte(cle, defaut)).match(/^(\d{1,2})-(\d{1,2})$/) || String(defaut).match(/^(\d{1,2})-(\d{1,2})$/);
    return new Date(annee, Number(m[1]) - 1, Number(m[2]));
  };
  var ouverture = md('fiscal.declaration_revenus_ouverture', '04-10');
  var echeance = md('fiscal.declaration_revenus_limite', '05-28');
  var id = 'IR-' + annee;
  var dec = Db_trouver(TABLES.DECLARATIONS, id);
  var ca = Db_lire(TABLES.FACTURES).reduce(function (s, f) {
    var d = date_(f.date_encaissement);
    return d && d.getFullYear() === anneeCa && f.qonto_statut !== 'annulée' ? s + montant_(f.montant_encaisse) : s;
  }, 0);
  var r = { id: id, annee: annee, anneeCa: anneeCa, ca: arrondi_(ca), ouverture: jourIso_(ouverture), echeance: jourIso_(echeance),
    etat: 'à venir', date_declaration: '', joursAvantEcheance: ecartJours_(echeance, auj) };
  if (!creation || anneeCa < creation.getFullYear()) { r.etat = 'non due'; return r; }
  if (dec && date_(dec.date_declaration)) { r.etat = 'faite'; r.date_declaration = jourIso_(date_(dec.date_declaration)); return r; }
  r.etat = auj > echeance ? 'en retard' : (auj >= ouverture ? 'à faire' : 'à venir');
  return r;
}

function Fiscal_revenusDeclares(annee, dateDeclaration) {
  var id = 'IR-' + Number(annee);
  if (!/^IR-\d{4}$/.test(id)) throw new Error('Année inconnue : ' + annee);
  var r = Fiscal_declarationRevenus(Number(annee));
  var champs = { ca_declare: r.ca, date_declaration: date_(dateDeclaration) || aujourdhui_(), commentaire: 'Déclaration de revenus (CA ' + r.anneeCa + ')' };
  if (Db_trouver(TABLES.DECLARATIONS, id)) return Db_maj(TABLES.DECLARATIONS, id, champs);
  return Db_inserer(TABLES.DECLARATIONS, Object.assign({ id: id }, champs));
}

/**
 * Autorisation de cumul d'activités (agent public) : à demander à l'employeur avant fiscal.cumul_avant,
 * avant la création de l'entreprise. Rappel dans l'échéancier et l'e-mail du matin (30 jours avant)
 * jusqu'à ce qu'elle soit marquée faite (onglet Déclarations, id « CUMUL »).
 * Renvoie { id, avant, etat: 'non due'|'à venir'|'à faire'|'en retard'|'faite', date_demande, afficher }.
 */
function Fiscal_cumul(quand) {
  var auj = aujourdhui_(quand);
  var avant = date_(Params_texte('fiscal.cumul_avant', ''));
  var dec = Db_trouver(TABLES.DECLARATIONS, 'CUMUL');
  var creation = date_(Params_texte('fiscal.date_creation', ''));
  var r = { id: 'CUMUL', avant: avant ? jourIso_(avant) : '', etat: 'non due', date_demande: '', afficher: false, joursAvantEcheance: avant ? ecartJours_(avant, auj) : null };
  if (dec && date_(dec.date_declaration)) {
    r.etat = 'faite'; r.date_demande = jourIso_(date_(dec.date_declaration));
    r.afficher = !creation || auj <= ajouterJours_(creation, 90); // carte gardée jusqu'à 3 mois après la création
    return r;
  }
  if (!avant) return r;
  if (creation && auj > ajouterJours_(creation, 90)) return r; // entreprise en activité depuis plus de 3 mois : plus de rappel
  r.etat = auj > avant ? 'en retard' : (ecartJours_(avant, auj) <= 30 ? 'à faire' : 'à venir');
  r.afficher = true;
  return r;
}

function Fiscal_cumulFait(dateDemande) {
  var champs = { ca_declare: '', date_declaration: date_(dateDemande) || aujourdhui_(), commentaire: 'Autorisation de cumul d\'activités demandée' };
  if (Db_trouver(TABLES.DECLARATIONS, 'CUMUL')) return Db_maj(TABLES.DECLARATIONS, 'CUMUL', champs);
  return Db_inserer(TABLES.DECLARATIONS, Object.assign({ id: 'CUMUL' }, champs));
}

function Fiscal_cfePayee(annee, montant, datePaiement) {
  var id = 'CFE-' + Number(annee);
  if (!/^CFE-\d{4}$/.test(id)) throw new Error('Année inconnue : ' + annee);
  var champs = { ca_declare: montant_(montant), date_declaration: date_(datePaiement) || aujourdhui_(), commentaire: 'CFE' };
  if (Db_trouver(TABLES.DECLARATIONS, id)) return Db_maj(TABLES.DECLARATIONS, id, champs);
  return Db_inserer(TABLES.DECLARATIONS, Object.assign({ id: id }, champs));
}

/** Marque une période déclarée (CA déclaré, date). */
function Fiscal_marquerDeclaree(idPeriode, caDeclare, dateDeclaration) {
  if (!/^\d{4}-(T[1-4]|M(0[1-9]|1[0-2]))$/.test(String(idPeriode))) throw new Error('Période inconnue : ' + idPeriode);
  var champs = {
    ca_declare: montant_(caDeclare),
    date_declaration: date_(dateDeclaration) || aujourdhui_()
  };
  if (Db_trouver(TABLES.DECLARATIONS, idPeriode)) return Db_maj(TABLES.DECLARATIONS, idPeriode, champs);
  return Db_inserer(TABLES.DECLARATIONS, Object.assign({ id: idPeriode }, champs));
}

function Fiscal_annulerDeclaration(idPeriode) {
  if (!Db_trouver(TABLES.DECLARATIONS, idPeriode)) return null;
  return Db_maj(TABLES.DECLARATIONS, idPeriode, { date_declaration: '', ca_declare: '' });
}

/** Échéances de déclaration (pour l'échéancier) : périodes terminées non déclarées + prochaine. */
function Fiscal_echeances_(debut, fin, quand) {
  var auj = aujourdhui_(quand);
  var annees = [auj.getFullYear() - 1, auj.getFullYear()];
  var out = [];
  annees.forEach(function (an) {
    Fiscal_declarations(an, auj).periodes.forEach(function (p) {
      if (p.etat === 'déclarée' || p.etat === 'à venir' || p.etat === 'non suivie') return;
      var e = date_(p.echeance);
      var dans = aujourdhui_(e) >= aujourdhui_(debut) && aujourdhui_(e) <= aujourdhui_(fin);
      if (!dans && p.etat !== 'en retard') return;
      out.push({ date: e, periode: p, depassee: p.etat === 'en retard' });
    });
  });
  return out;
}


// ════════ Indicateurs.js ════════

/**
 * Indicateurs (§ 7) et enseignements.
 *
 * Définitions retenues (recalculables à la main, voir docs/recette-lot-5.md) :
 * - Fenêtre « 12 mois glissants » : du jour J-365 au jour J inclus.
 * - Taux de Go : décisions Go / (Go + No-go), sur la date de décision.
 * - Taux d'attribution (nombre) : gagnées / (gagnées + perdues), sur la date du résultat.
 * - Taux d'attribution (montant) : Σ montant HT des offres gagnées / Σ montant HT des offres
 *   gagnées et perdues (même fenêtre). Les affaires « sans suite » sont exclues.
 * - Rang moyen : moyenne des rangs renseignés (résultats de la fenêtre).
 * - Écart de prix (affaire perdue) : (votre prix − prix attributaire) / prix attributaire.
 * - Écart de note technique (affaire perdue) : Σ de nos notes − Σ notes attributaire sur les
 *   critères dont le nom contient « techni » (ex. « Valeur technique »).
 * - Coût de la réponse (année civile) : Σ jours passés à répondre (offres déposées dans l'année)
 *   / Σ montants notifiés (marchés notifiés dans l'année), affiché en jours pour 10 000 €.
 * - CA signé / facturé / encaissé : compteur de CA de l'année civile.
 * - Motifs de No-go : motif de la décision ; motifs de rejet : pièce-type à améliorer.
 * - L'affaire d'exercice Mouthe est exclue de tous les indicateurs (décision du 12/11/2026).
 */

function Indicateurs_tableau(quand) {
  var auj = aujourdhui_(quand);
  var debut = ajouterJours_(auj, -365);
  var dans = function (v) { var d = date_(v); return d && aujourdhui_(d) >= debut && aujourdhui_(d) <= auj; };
  var annee = auj.getFullYear();
  var deLAnnee = function (v) { var d = date_(v); return d && d.getFullYear() === annee; };
  var affaires = Indicateurs_affaires_();
  var criteres = Db_lire(TABLES.CRITERES);

  // Affaires par statut (en cours) et clôturées sur 12 mois
  var parStatut = ORDRE_STATUTS.map(function (s) {
    var liste = affaires.filter(function (a) { return a.statut === s; });
    var actif = STATUTS_ACTIFS.indexOf(s) >= 0;
    return { statut: s, actif: actif, nombre: actif ? liste.length : liste.filter(function (a) { return dans(a.date_statut); }).length };
  });

  // Taux de Go
  var go = affaires.filter(function (a) { return a.decision === 'Go' && dans(a.date_decision); }).length;
  var nogo = affaires.filter(function (a) { return a.decision === 'No-go' && dans(a.date_decision); });

  // Résultats de la fenêtre
  var resultats = affaires.filter(function (a) { return dans(a.date_resultat); });
  var gagnees = resultats.filter(function (a) { return a.statut_final === 'Gagnée'; });
  var perdues = resultats.filter(function (a) { return a.statut_final === 'Perdue'; });
  var somme = function (l, k) { return l.reduce(function (s, a) { return s + montant_(a[k]); }, 0); };
  var montantGagne = somme(gagnees, 'montant_ht');
  var montantJuge = montantGagne + somme(perdues, 'montant_ht');
  var rangs = resultats.map(function (a) { return montant_(a.rang); }).filter(function (n) { return n > 0; });

  // Écarts sur les affaires perdues
  var ecarts = perdues.map(function (a) { return Indicateurs_ecarts_(a, criteres); });
  var moyenne = function (l) { return l.length ? l.reduce(function (s, x) { return s + x; }, 0) / l.length : null; };
  var ecartsPrix = ecarts.map(function (e) { return e.ecartPrix; }).filter(function (x) { return x !== null; });
  var ecartsNote = ecarts.map(function (e) { return e.ecartNote; }).filter(function (x) { return x !== null; });

  // Coût de la réponse (année civile)
  var joursAnnee = somme(affaires.filter(function (a) { return deLAnnee(a.date_depot); }), 'jours_reponse');
  var notifieAnnee = somme(affaires.filter(function (a) { return deLAnnee(a.date_notification); }), 'montant_notifie');

  // Répartition des motifs
  var compter = function (liste, cle, defaut) {
    var c = {};
    liste.forEach(function (a) { var k = String(a[cle] || '').trim() || defaut; c[k] = (c[k] || 0) + 1; });
    return Object.keys(c).map(function (k) { return { motif: k, nombre: c[k] }; })
      .sort(function (x, y) { return y.nombre - x.nombre || x.motif.localeCompare(y.motif); });
  };

  return {
    aujourdhui: jourIso_(auj),
    fenetre: { debut: jourIso_(debut), fin: jourIso_(auj) },
    annee: annee,
    parStatut: parStatut,
    enCours: parStatut.filter(function (s) { return s.actif; }).reduce(function (t, s) { return t + s.nombre; }, 0),
    go: { go: go, nogo: nogo.length, taux: go + nogo.length ? go / (go + nogo.length) : null },
    attribution: {
      gagnees: gagnees.length, perdues: perdues.length,
      taux: gagnees.length + perdues.length ? gagnees.length / (gagnees.length + perdues.length) : null,
      montantGagne: arrondi_(montantGagne), montantJuge: arrondi_(montantJuge),
      tauxMontant: montantJuge ? montantGagne / montantJuge : null
    },
    rangMoyen: rangs.length ? moyenne(rangs) : null,
    rangsConnus: rangs.length,
    ecartPrixMoyen: moyenne(ecartsPrix),
    ecartNoteMoyen: moyenne(ecartsNote),
    perduesAnalysees: ecarts.length,
    cout: {
      jours: joursAnnee, montantNotifie: arrondi_(notifieAnnee),
      joursPour10k: notifieAnnee ? joursAnnee / notifieAnnee * 10000 : null
    },
    ca: Compteur_ca(annee),
    motifsNogo: compter(nogo, 'motif_decision', 'non renseigné'),
    motifsRejet: compter(perdues, 'piece_type', 'non renseigné')
  };
}

/** Affaires prises en compte : toutes sauf l'exercice Mouthe (consultable, hors indicateurs). */
function Indicateurs_affaires_() {
  return Affaires_lister().filter(function (a) { return !Indicateurs_estExercice_(a); });
}

function Indicateurs_estExercice_(a) {
  return a.reference_acheteur === REF_EXERCICE_MOUTHE || /^\[EXERCICE\]/.test(String(a.objet || ''));
}

/** Écarts de prix et de note technique d'une affaire perdue. */
function Indicateurs_ecarts_(a, criteres) {
  var prix = montant_(a.montant_ht), attrib = montant_(a.prix_attributaire);
  var tech = criteres.filter(function (c) {
    return String(c.id_affaire) === String(a.id) && /techni/.test(Veille_norm_(c.critere));
  });
  var noteK = tech.reduce(function (s, c) { return s + montant_(c.note_kompa); }, 0);
  var noteA = tech.reduce(function (s, c) { return s + montant_(c.note_attributaire); }, 0);
  var aNotes = tech.some(function (c) { return c.note_kompa !== '' && c.note_attributaire !== ''; });
  return {
    ecartPrix: prix && attrib ? (prix - attrib) / attrib : null,
    noteKompa: aNotes ? arrondi_(noteK) : null,
    noteAttributaire: aNotes ? arrondi_(noteA) : null,
    ecartNote: aNotes ? arrondi_(noteK - noteA) : null
  };
}

/** Toutes les affaires perdues, avec écarts et enseignements (écran Enseignements). */
function Indicateurs_enseignements() {
  var criteres = Db_lire(TABLES.CRITERES);
  return Affaires_lister()
    .filter(function (a) { return a.statut_final === 'Perdue'; })
    .sort(function (x, y) { return (date_(y.date_resultat) || 0) - (date_(x.date_resultat) || 0); })
    .map(function (a) {
      var e = Indicateurs_ecarts_(a, criteres);
      return {
        id: a.id, acheteur: a.acheteur, objet: a.objet, exercice: Indicateurs_estExercice_(a), date_resultat: date_(a.date_resultat) ? jourIso_(date_(a.date_resultat)) : '',
        montant_ht: montant_(a.montant_ht) || null, prix_attributaire: montant_(a.prix_attributaire) || null,
        attributaire: a.attributaire || '', rang: montant_(a.rang) || null,
        ecartPrix: e.ecartPrix, noteKompa: e.noteKompa, noteAttributaire: e.noteAttributaire, ecartNote: e.ecartNote,
        motifs_rejet: a.motifs_rejet || '', points_faibles: a.points_faibles || '',
        action_corrective: a.action_corrective || '', piece_type: a.piece_type || ''
      };
    });
}

/** Résumé pour l'e-mail du matin. */
function Indicateurs_resume(quand) {
  var t = Indicateurs_tableau(quand);
  var enCours = {};
  t.parStatut.forEach(function (s) { if (s.actif && s.nombre) enCours[s.statut] = s.nombre; });
  return {
    enCours: enCours,
    attribution: { gagnees: t.attribution.gagnees, perdues: t.attribution.perdues, taux: t.attribution.taux || 0 },
    ca: t.ca
  };
}


// ════════ Livrables.js ════════

/**
 * Livrables de la mission (fiche › Mission › Planning) : une ligne par livrable du CCTP.
 * Les échéances des livrables non remis alimentent l'Échéancier et l'e-mail du matin.
 * Organisation validée le 18/11/2026.
 */

var ETATS_LIVRABLE = ['à faire', 'en cours', 'remis', 'validé'];

function Livrables_lister(idAffaire) {
  return Db_lire(TABLES.LIVRABLES)
    .filter(function (l) { return String(l.id_affaire) === String(idAffaire); })
    .sort(function (x, y) {
      var dx = date_(x.date_echeance), dy = date_(y.date_echeance);
      if (dx && dy && dx - dy) return dx - dy;
      if (dx && !dy) return -1;
      if (!dx && dy) return 1;
      return (Number(x.ordre) || 0) - (Number(y.ordre) || 0);
    });
}

function Livrables_valider_(champs, creation) {
  var out = {};
  if ('libelle' in champs || creation) {
    var l = String(champs.libelle || '').trim();
    if (!l) throw new Error('Intitulé du livrable obligatoire.');
    out.libelle = l.slice(0, 200);
  }
  if ('tranche' in champs) out.tranche = String(champs.tranche || '').trim().toUpperCase().slice(0, 12);
  if ('date_echeance' in champs) {
    var v = String(champs.date_echeance || '').trim();
    out.date_echeance = v ? (date_(v) || (function () { throw new Error('Échéance : date attendue.'); })()) : '';
  }
  if ('etat' in champs) {
    if (ETATS_LIVRABLE.indexOf(champs.etat) < 0) throw new Error('État attendu : ' + ETATS_LIVRABLE.join(', ') + '.');
    out.etat = champs.etat;
  }
  if ('indice' in champs) out.indice = String(champs.indice || '').trim().toUpperCase().slice(0, 4);
  if ('lien' in champs) {
    var u = String(champs.lien || '').trim();
    if (u && !/^https?:\/\//.test(u)) throw new Error('Lien : adresse commençant par https:// attendue (fichier Drive).');
    out.lien = u;
  }
  if ('commentaire' in champs) out.commentaire = String(champs.commentaire || '').trim();
  return out;
}

function Livrables_ajouter(idAffaire, champs) {
  Affaires_get_(idAffaire);
  var l = Livrables_valider_(champs, true);
  l.id_affaire = idAffaire;
  l.etat = l.etat || 'à faire';
  l.ordre = Livrables_lister(idAffaire).reduce(function (m, x) { return Math.max(m, Number(x.ordre) || 0); }, 0) + 10;
  return Db_inserer(TABLES.LIVRABLES, l);
}

function Livrables_maj(idAffaire, idLivrable, champs) {
  var l = Db_trouver(TABLES.LIVRABLES, idLivrable);
  if (!l || String(l.id_affaire) !== String(idAffaire)) throw new Error('Livrable introuvable.');
  return Db_maj(TABLES.LIVRABLES, idLivrable, Livrables_valider_(champs, false));
}

function Livrables_supprimer(idAffaire, idLivrable) {
  return Db_supprimerSi(TABLES.LIVRABLES, function (l) { return String(l.id) === String(idLivrable) && String(l.id_affaire) === String(idAffaire); });
}

/** Résumé pour la synthèse : total, remis, validés, prochain livrable à remettre. */
function Livrables_resume_(livrables) {
  var aRemettre = livrables.filter(function (l) { return l.etat === 'à faire' || l.etat === 'en cours'; });
  var prochain = aRemettre.filter(function (l) { return date_(l.date_echeance); })[0] || aRemettre[0] || null;
  return {
    total: livrables.length,
    valides: livrables.filter(function (l) { return l.etat === 'validé'; }).length,
    remis: livrables.filter(function (l) { return l.etat === 'remis' || l.etat === 'validé'; }).length,
    prochain: prochain ? { libelle: String(prochain.libelle), tranche: String(prochain.tranche || ''), date: date_(prochain.date_echeance) ? jourIso_(date_(prochain.date_echeance)) : '' } : null
  };
}


// ════════ MiseAJour.js ════════

/** Déployé automatiquement depuis GitHub (workflow « Déployer dans Apps Script »).
 * Mise à jour automatique du classeur (décision du 21/11/2026) : après le collage d'une nouvelle version du code,
 * le premier appel (ouverture de l'app ou déclencheur du matin) complète le classeur, sans relancer installer().
 *
 * Seulement des AJOUTS, jamais de suppression, de déplacement ni de modification d'une valeur saisie :
 * - onglets absents créés, colonnes absentes ajoutées en fin de ligne d'en-tête ;
 * - paramètres absents ajoutés avec leur valeur par défaut ; valeur d'origine jamais modifiée → nouvelle valeur par défaut ;
 * - référentiels du module Estimation : lignes absentes ajoutées ;
 * - déclencheurs absents recréés (ceux qui existent ne sont pas touchés).
 * installer() reste disponible pour une remise à plat complète (migrations de valeurs, avis re-filtrés…).
 * Le résultat est noté dans le Journal moteur et signalé une fois sur l'accueil.
 */

var MAJ_PROP_SIGNATURE = 'KA_SIGNATURE_SCHEMA';
var MAJ_PROP_RAPPORT = 'KA_DERNIERE_MAJ_AUTO';

/** Empreinte de ce que le code attend du classeur : colonnes, paramètres, référentiels, déclencheurs. */
function MiseAJour_signature_() {
  var tables = Tables_toutes_();
  var morceaux = [APP.VERSION, typeof EST_VERSION !== 'undefined' ? EST_VERSION : '-'];
  Object.keys(tables).sort().forEach(function (k) { morceaux.push(tables[k].onglet + ':' + colonnesTable_(tables[k]).join(',')); });
  morceaux.push(PARAMETRES_DEFAUT.map(function (p) { return p[0]; }).join(','));
  if (typeof EST_PARAMS_DEFAUT !== 'undefined') {
    morceaux.push(EST_PARAMS_DEFAUT.map(function (p) { return p[0]; }).join(','));
    morceaux.push(EST_LOTS_DEFAUT.map(function (p) { return p[0]; }).join(','));
    morceaux.push(EST_TYPOLOGIES_DEFAUT.map(function (p) { return p[0]; }).join(','));
  }
  morceaux.push(MiseAJour_declencheursVoulus_().join(','));
  var texte = morceaux.join('|'), h = 5381;
  for (var i = 0; i < texte.length; i++) h = ((h * 33) ^ texte.charCodeAt(i)) >>> 0;
  return APP.VERSION + '-' + h.toString(36) + '-' + texte.length;
}

function MiseAJour_declencheursVoulus_() {
  var noms = ['sauvegardeHebdo', 'collecteQuotidienne', 'envoyerEmailMatin'];
  if (typeof Est_declencheurs_ === 'function') noms = noms.concat(Est_declencheurs_().map(function (d) { return d.fonction; }));
  return noms;
}

/**
 * Vérifie, très vite, si le classeur correspond à la version du code ; sinon le complète.
 * Renvoie null (rien à faire) ou le rapport de mise à jour. Ne lève jamais d'erreur.
 */
function MiseAJour_verifier_() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (!props.getProperty(CLASSEURS.SUIVI.prop)) return null; // pas encore installé : installer() d'abord
    var signature = MiseAJour_signature_();
    if (props.getProperty(MAJ_PROP_SIGNATURE) === signature) return null;
    var verrou = LockService.getScriptLock();
    if (!verrou.tryLock(15000)) return null; // un autre appel s'en charge
    try {
      if (props.getProperty(MAJ_PROP_SIGNATURE) === signature) return null;
      var rapport = MiseAJour_appliquer_();
      props.setProperty(MAJ_PROP_SIGNATURE, signature);
      if (rapport.changements.length) props.setProperty(MAJ_PROP_RAPPORT, JSON.stringify({ date: new Date().toISOString(), version: APP.VERSION, changements: rapport.changements }));
      return rapport;
    } finally {
      verrou.releaseLock();
    }
  } catch (e) {
    console.error('Mise à jour automatique du classeur : ' + e.message);
    try { Db_inserer(TABLES.JOURNAL_MOTEUR, { date: new Date(), source: 'Mise à jour automatique', avis_lus: 0, avis_retenus: 0, erreurs: String(e.message).slice(0, 300) }); } catch (e2) { /* sans effet */ }
    return null;
  }
}

/** Ajouts seulement (voir l'en-tête du fichier). Renvoie { changements: [libellés] }. */
function MiseAJour_appliquer_() {
  Db_viderCache_();
  var changements = [];
  var classeurs = { SUIVI: Db_classeur('SUIVI') };
  var tables = Tables_toutes_();
  Object.keys(tables).forEach(function (k) {
    var t = tables[k], cle = t.classeur || 'SUIVI';
    if (!classeurs[cle]) {
      if (!PropertiesService.getScriptProperties().getProperty(CLASSEURS[cle].prop)) { classeurs[cle] = Setup_classeur_(cle); changements.push('classeur « ' + CLASSEURS[cle].nom + ' » créé'); }
      else classeurs[cle] = Db_classeur(cle);
    }
    var onglet = classeurs[cle].getSheetByName(t.onglet);
    var presentes = onglet ? Db_entetes_(onglet).filter(String) : [];
    var manquantes = colonnesTable_(t).filter(function (c) { return presentes.indexOf(c) < 0; });
    if (onglet && !manquantes.length) return; // rien à faire : l'onglet n'est pas retouché
    Setup_onglet_(classeurs[cle], t);
    changements.push(onglet ? t.onglet + ' : colonne' + (manquantes.length > 1 ? 's' : '') + ' ' + manquantes.join(', ') + ' ajoutée' + (manquantes.length > 1 ? 's' : '') : 'onglet « ' + t.onglet + ' » créé');
  });
  Db_viderCache_();
  var p = Params_initialiser_();
  if (p) changements.push(p + ' paramètre' + (p > 1 ? 's' : '') + ' ajouté' + (p > 1 ? 's' : ''));
  // Valeurs par défaut d'origine remplacées par les nouvelles (une valeur que vous avez modifiée n'est jamais touchée)
  var migres = Params_migrer_();
  if (migres && migres.length) changements.push('paramètre' + (migres.length > 1 ? 's' : '') + ' mis à jour (valeur d\'origine) : ' + migres.join(', '));
  if (typeof Est_initialiserReferentiels_ === 'function') {
    var r = Est_initialiserReferentiels_();
    var nb = (r.parametres || 0) + (r.lots || 0) + (r.typologies || 0) + (Number(r.k) || 0);
    if (nb) changements.push('Estimation : ' + nb + ' ligne' + (nb > 1 ? 's' : '') + ' de référentiel ajoutée' + (nb > 1 ? 's' : ''));
  }
  // Acheteurs exclus (Ministère des Armées) : avis « nouveaux » déjà collectés archivés
  if (typeof Veille_archiverAcheteursExclus_ === 'function') {
    var arch = Veille_archiverAcheteursExclus_();
    if (arch) changements.push(arch + ' avis d\'acheteur exclu archivé' + (arch > 1 ? 's' : ''));
  }
  var renommes = MiseAJour_renommer_();
  if (renommes.length) changements.push('renommé' + (renommes.length > 1 ? 's' : '') + ' : ' + renommes.join(', '));
  var existants = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  var absents = MiseAJour_declencheursVoulus_().filter(function (n) { return existants.indexOf(n) < 0; });
  if (absents.length && existants.length) {
    // Seulement si l'installation a déjà des déclencheurs : on recrée ceux qui manquent, sans toucher aux autres.
    Setup_declencheurs_(absents);
    changements.push('déclencheur' + (absents.length > 1 ? 's' : '') + ' ' + absents.join(', ') + ' recréé' + (absents.length > 1 ? 's' : ''));
  }
  if (changements.length) Db_inserer(TABLES.JOURNAL_MOTEUR, {
    date: new Date(), source: 'Mise à jour automatique', avis_lus: 0, avis_retenus: 0,
    erreurs: changements.length ? ('v' + APP.VERSION + ' : ' + changements.join(' ; ')).slice(0, 500) : ''
  });
  return { changements: changements };
}

/**
 * Renommage Kompa → Kartes (22/11/2026) : classeurs, dossier racine des affaires et dossier des sauvegardes,
 * seulement s'ils portent encore le nom d'origine « Kompa … ». L'app les retrouve par leur identifiant :
 * le renommage ne change ni leur contenu ni leurs liens.
 */
function MiseAJour_renommer_() {
  var faits = [];
  var renommer = function (element, nouveau) {
    if (!element) return;
    var nom = String(element.getName());
    if (nom.indexOf(APP.ANCIEN_NOM + ' ') !== 0 || nom === nouveau) return;
    element.setName(nouveau);
    faits.push('« ' + nom + ' » → « ' + nouveau + ' »');
  };
  var props = PropertiesService.getScriptProperties();
  Object.keys(CLASSEURS).forEach(function (cle) {
    var id = props.getProperty(CLASSEURS[cle].prop);
    if (!id) return;
    try { renommer(DriveApp.getFileById(id), CLASSEURS[cle].nom); } catch (e) { /* fichier inaccessible : laissé tel quel */ }
  });
  try {
    var racine = Drive_id_(Params_texte('drive.dossier_racine', ''));
    if (racine) renommer(DriveApp.getFolderById(racine), Params_texte('drive.nom_racine', 'Kartes Affaires — Dossiers'));
  } catch (e) { /* sans effet */ }
  try {
    var sauv = props.getProperty(APP.PROP_DOSSIER_SAUVEGARDES_ID);
    if (sauv) renommer(DriveApp.getFolderById(sauv), APP.DOSSIER_SAUVEGARDES);
  } catch (e) { /* sans effet */ }
  return faits;
}

/** Dernière mise à jour automatique (affichée sur l'accueil pendant 3 jours), ou null. */
function MiseAJour_dernier_() {
  try {
    var r = JSON.parse(PropertiesService.getScriptProperties().getProperty(MAJ_PROP_RAPPORT) || 'null');
    if (!r || (new Date() - new Date(r.date)) > 3 * 86400000) return null;
    return r;
  } catch (e) { return null; }
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
  ['courrier', 'Courriers'],
  ['fiscal', 'Déclarations URSSAF'],
  ['drive', 'Dossiers Drive'],
  ['liste', 'Listes de valeurs'],
  ['sauvegarde', 'Sauvegarde'],
  ['facture', 'Factures et retards de paiement'],
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
  ['veille.exclusions', 'marché de travaux;AMO juridique;AMO financière;assurance;eau potable;assainissement;adduction;délégation de service public;délégations de service public;dsp ;concession;comptab;budget;plan local d\'urbanisme;plu ;déchet;collecte;rivière;ruisseau;hydraul;inondation;bassin versant;copropriété;géomètre;topograph;amiante;termite;xylophage;jeux d\'enfants;scénographie;services graphiques;multimédia;recrutement;ressources humaines;effectifs;communication;informatique;systèmes d\'information;tourisme;touristique;routier;routière;voirie;portuaire;nettoyage;restauration collective;approvisionnement;illumination;pyrotechni;cartographie;sensibilisation;biodiversité;renaturation;écolog;notation;émetteur;contentieux;enquête publique;enquêtes publiques;décence;logistique;ordonnancement;opc ;géotechni;éclairage public;incendie;chaufferie;réseau de chaleur;très haut débit;fourniture;location;prestations artistiques;événementiel;évènementiel;assistance technique générale',
    'Avis écartés si l\'objet contient l\'un de ces termes — à valider'],
  ['veille.acheteurs_exclus', 'minarm;ministère des armées;ministère de la défense;armées;armée de terre;armée de l\'air;marine nationale;légion étrangère;infrastructure de la défense;esid ;usid ;sid ;gsbdd;base de défense;direction générale de l\'armement;dga ;commissariat des armées;service de santé des armées;énergie opérationnelle;plateforme achats finances;pfaf;onacvg;ecpad',
    'Acheteurs jamais retenus (cumul d\'activités : aucun marché du Ministère des Armées, quelle que soit la procédure) : comparés au nom de l\'acheteur et à l\'objet'],
  ['veille.exclusions_souples', 'foncier;financ;juridique;mobilité;déplacement;transport', 'Exclusions levées si l\'objet cite un équipement (ex. « accompagnement foncier pour un projet de collège »)'],
  ['veille.batiment_requis', 'oui', 'Ne garder que les avis dont l\'objet relève du bâtiment : oui ou non'],
  ['veille.exclusions_a_verifier', 'pmpfci;pidaf;dfci;débroussaill;forêt;forestier;enfance;jeux olympiques;olympique;tourisme;culture;sport',
    'AMO sans mot du bâtiment : écartée malgré tout si l\'objet contient l\'un de ces termes'],
  ['veille.batiment_amo_souple', 'oui', 'AMO explicite sans mot du bâtiment (ex. « assistance technique à maîtrise d\'ouvrage pour les marchés de travaux ») : gardée en « possible », bâtiment à vérifier (oui) ou écartée (non)'],
  ['veille.mots_batiment', 'bâtiment;construction;réhabilitation;rénovation;restructuration;extension;patrimoine;immobili;équipement;locaux;programmation;faisabilité;conduite d\'opération;études préalables;école;groupe scolaire;scolaire;collège;lycée;crèche;cantine;cuisine;restaurant;gymnase;piscine;stade;salle;médiathèque;bibliothèque;musée;mairie;hôtel de ville;marché couvert;halle;théâtre;cinéma;maison;centre;pôle;équipement;caserne;gendarmerie;police;ehpad;foyer;résidence;logement;église;chapelle;château;couvent;bâtiment;locaux;bureaux', 'Mots du domaine bâtiment (au moins un requis si veille.batiment_requis = oui)'],
  ['veille.equipements', 'école;groupe scolaire;scolaire;collège;lycée;crèche;cantine;cuisine;restaurant;gymnase;piscine;stade;salle;médiathèque;bibliothèque;musée;mairie;hôtel de ville;marché couvert;halle;théâtre;cinéma;maison;centre;pôle;équipement;caserne;gendarmerie;police;ehpad;foyer;résidence;logement;église;chapelle;château;couvent;bâtiment;locaux;bureaux', 'Types d\'équipements (lèvent les exclusions souples)'],
  ['veille.hors_zone', 'non', 'Collecter aussi les avis hors zone (hors PACA-Corse) : oui ou non'],
  ['veille.exclusion_moe', 'mission de maîtrise d\'œuvre',
    'Écarté si l\'objet contient ce terme…'],
  ['veille.exception_moe', 'assistance à maîtrise d\'ouvrage',
    '… sauf s\'il contient aussi celui-ci'],
  ['veille.libelle_gmail', 'Veille', 'Libellé Gmail des alertes des plateformes'],
  ['veille.heure_collecte', '6', 'Heure de la collecte quotidienne (0-23)'],
  ['veille.apprentissage', 'oui', 'oui : le pré-score des nouveaux avis tient compte de vos décisions passées (mots des avis ignorés, No-go, étudiés)'],
  ['veille.apprentissage_min', '15', 'Nombre de décisions (avis ignorés ou étudiés, No-go) à partir duquel l\'apprentissage s\'applique'],
  ['veille.archivage_jours', '60', 'Avis échus depuis plus de N jours déplacés dans l\'onglet « Avis archivés » (allège l\'écran Veille)'],
  ['veille.fenetre_jours', '3', 'Avis BOAMP et alertes des N derniers jours (le dédoublonnage évite les reprises)'],
  ['veille.plateformes_domaines', 'marches-publics.gouv.fr;marches-publics.info;achatpublic.com;marches-securises.fr;e-marchespublics.com;marchesonline.com;francemarches.com;klekoon.com;maximilien.fr;demat-ampa.fr;awsolutions.fr;boamp.fr;ampmetropole.fr;safetender.com;ville-gap.fr;maregionsud.fr;departement13.fr;laprovencemarchespublics.com',
    'Domaines des plateformes : sert à repérer le lien de la consultation dans les alertes e-mail'],

  // Zones (§ 3.2)
  ['zone.departements_paca', '04;05;06;13;83;84;2A;2B', 'Départements de la zone (PACA + Corse)'],
  ['zone.libelle_paca', 'PACA-Corse', 'Libellé de zone pour ces départements'],
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
  ['score.apprentissage_max', '10', 'Ajustement maximal « Historique » (points) appris de vos décisions : avis ignorés et No-go en moins, affaires étudiées en plus. Ne fait jamais passer un avis en « archivé » (au pire « possible ») ; 0 = sans effet'],
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

  // Déclarations URSSAF (micro-entreprise)
  ['fiscal.debut_suivi', '', 'Début du suivi des déclarations (aaaa-mm-jj) : les périodes terminées avant ne sont ni affichées en retard ni relancées. Rempli à l\'installation'],
  ['fiscal.date_creation', '2027-01-04', 'Date de création de l\'entreprise (aaaa-mm-jj) : CFE exonérée l\'année de création, base réduite de moitié l\'année suivante. Modifiable depuis la carte URSSAF de l\'accueil'],
  ['fiscal.cumul_avant', '2026-12-01', 'Agent public : demander l\'autorisation de cumul d\'activités à l\'employeur avant cette date (aaaa-mm-jj), avant la création de l\'entreprise. Vide : pas de rappel'],
  ['fiscal.cfe_montant', '', 'CFE estimée pour une année pleine (€) : à remplacer par le montant de l\'avis (impots.gouv, vers la mi-novembre). Modifiable depuis la carte URSSAF de l\'accueil'],
  ['fiscal.declaration_revenus_ouverture', '04-10', 'Déclaration de revenus (impots.gouv) : date d\'ouverture du service en ligne (mois-jour), à vérifier chaque printemps'],
  ['fiscal.declaration_revenus_limite', '05-28', 'Déclaration de revenus : date limite en ligne (mois-jour), selon le département (Corse : zone 2), à vérifier chaque printemps sur impots.gouv.fr'],
  ['fiscal.periodicite', 'trimestrielle', 'Rythme de déclaration du CA à l\'URSSAF : trimestrielle ou mensuelle'],
  ['fiscal.taux_cotisations', '', 'Taux des cotisations sociales (%) — À RENSEIGNER : taux appliqué sur votre espace autoentrepreneur.urssaf.fr'],
  ['fiscal.taux_cfp', '0.2', 'Contribution à la formation professionnelle (%), professions libérales — à vérifier chaque année'],
  ['fiscal.versement_liberatoire', 'oui', 'Versement libératoire de l\'impôt sur le revenu : oui ou non'],
  ['fiscal.taux_versement_liberatoire', '2.2', 'Taux du versement libératoire (%), activité libérale (BNC) — à vérifier chaque année'],

  // Échéances (§ 5)
  ['echeance.remise_alertes_j', '7;3;1', 'Alertes avant la date limite de remise (jours)'],
  ['echeance.questions_alerte_j', '3', 'Alerte avant la date limite des questions (jours)'],
  ['echeance.visite_alerte_j', '2', 'Alerte avant la visite de site (jours)'],
  ['echeance.rejet_relance_j', '10', 'Relance des motifs du rejet si rien reçu (jours)'],
  ['echeance.paiement_public_j', '30', 'Délai de paiement public (jours)'],
  ['facture.taux_moratoire', '10.15', 'Taux des intérêts moratoires (%) : taux de refinancement de la BCE + 8 points (art. R. 2192-31 CCP), à mettre à jour chaque semestre'],
  ['facture.mise_en_demeure_j', '30', 'Retard de paiement (jours après l\'échéance) à partir duquel le courrier de relance devient une mise en demeure'],
  ['facture.indemnite_recouvrement', '40', 'Indemnité forfaitaire pour frais de recouvrement (€), due en cas de retard de paiement (art. D. 2192-35 CCP)'],
  ['echeance.validite_defaut_j', '90', 'Validité de l\'offre si non renseignée dans l\'affaire (jours)'],
  ['courrier.nom_entreprise', 'Kartes Ingénierie', 'Nom de l\'entreprise dans les courriers et documents'],
  ['courrier.email_public', 'kartes.ingenierie@gmail.com', 'Adresse e-mail publique (courriers, offres, DC1) : remplace [e-mail] dans la signature. À renseigner'],
  ['courrier.signature', 'Sébastien De Raedt EI\nKartes Ingénierie — Assistance à maîtrise d\'ouvrage\n[téléphone] · [e-mail]\nSIRET [n°] · TVA non applicable, art. 293 B du CGI',
    'Signature des modèles de courriers (\\n = retour à la ligne ; [e-mail] = adresse publique ci-dessus)'],

  // E-mail (§ 6)
  ['email.heure', '7', 'Heure d\'envoi de l\'e-mail du matin (0-23)'],
  ['email.destinataire', '', 'Adresse de réception (vide = compte Google de l\'app)'],
  ['email.jours', 'lun;mar;mer;jeu;ven', 'Jours d\'envoi (pas le week-end)'],
  ['email.recap_lundi', 'oui', 'Envoi le lundi même si toutes les rubriques sont vides'],
  ['email.si_rien', 'oui', 'Envoi chaque jour ouvré même sans nouvel avis, échéance ni relance (« aucun nouvel avis », avec le bilan de la collecte du matin)'],

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
  ['liste.pieces_offre', 'Candidature:DC1 et DC2, ou DUME;Candidature:Attestation d\'assurance responsabilité civile professionnelle;Candidature:Références et qualifications;Offre:Acte d\'engagement;Offre:Décomposition du prix (DPGF ou BPU);Offre:Mémoire technique;Offre:CV de l\'équipe',
    'Liste type des pièces d\'une offre (catégorie:pièce), proposée dans Appel d\'offres › Offre ; à compléter selon le RC'],

  // Dossiers Drive des affaires
  ['drive.actif', 'oui', 'Créer un dossier Drive pour chaque affaire : oui ou non'],
  ['drive.dossier_racine', '', 'Dossier racine (URL ou identifiant). Vide = créé automatiquement « Kartes Affaires — Dossiers »'],
  ['drive.nom_racine', 'Kartes Affaires — Dossiers', 'Nom du dossier racine s\'il est créé automatiquement'],
  ['drive.sous_dossiers_etude', '01 DCE;02 Questions et visite', 'Sous-dossiers créés avec l\'affaire (En étude)'],
  ['drive.sous_dossiers_go', '03 Candidature;04 Offre;05 Dépôt', 'Sous-dossiers créés au passage en Go'],
  ['drive.sous_dossiers_resultat', '06 Résultat', 'Sous-dossiers créés au résultat (gagnée, perdue, sans suite)'],
  ['drive.sous_dossiers_gagnee', '07 Exécution;08 Facturation;09 Estimations', 'Sous-dossiers créés au passage en Gagnée (volet Mission : Livrables, Facturation, Estimations, dans cet ordre)'],

  // Sauvegarde (§ 2)
  ['sauvegarde.nb_copies', '8', 'Nombre de copies hebdomadaires conservées dans Drive'],

  // Application
  ['app.favicon_url', '', 'Icône de l\'onglet : URL publique se terminant par .png (vide = icône du kit)'],
  ['app.url', '', 'Adresse /exec de l\'app pour les liens de l\'e-mail (vide = détectée automatiquement)']
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

/**
 * Nouvelles valeurs par défaut appliquées aux classeurs déjà installés, seulement si la valeur
 * actuelle est encore l'ancienne valeur par défaut (une valeur modifiée à la main est respectée).
 * [clé, ancienne valeur par défaut, nouvelle]
 */
var MIGRATIONS_PARAMETRES = [
  ['courrier.email_public', '', 'kartes.ingenierie@gmail.com'],
  ['drive.nom_racine', 'Kompa Affaires — Dossiers', null],
  // Renommage Kompa → Kartes Ingénierie (22/11/2026) : seulement si la valeur d'origine n'a pas été modifiée
  ['courrier.signature', 'Sébastien De Raedt EI\nKompa Ingénierie — Assistance à maîtrise d\'ouvrage\n[téléphone] · kompa.ingenierie@gmail.com\nSIRET [n°] · TVA non applicable, art. 293 B du CGI', null],
  ['zone.departements_paca', '04;05;06;13;83;84', null],
  ['zone.libelle_paca', 'PACA', null],
  ['veille.exclusions', 'marché de travaux;AMO juridique;AMO financière;assurances', null]
];

/** Valeurs ajoutées aux listes existantes, même modifiées (sans doublon, sans retirer les vôtres). */
var AJOUTS_PARAMETRES = [
  ['veille.plateformes_domaines', 'ampmetropole.fr;safetender.com;ville-gap.fr;maregionsud.fr;departement13.fr;laprovencemarchespublics.com'],
  ['drive.sous_dossiers_gagnee', '09 Estimations']
];

function Params_migrer_() {
  var defauts = {};
  PARAMETRES_DEFAUT.forEach(function (p) { defauts[p[0]] = p[1]; });
  var faites = [];
  MIGRATIONS_PARAMETRES.forEach(function (m) {
    var ligne = Db_trouver(TABLES.PARAMETRES, m[0]);
    var nouvelle = m[2] === null ? defauts[m[0]] : m[2];
    if (ligne && String(ligne.valeur) === m[1] && nouvelle !== m[1]) {
      Db_maj(TABLES.PARAMETRES, m[0], { valeur: nouvelle });
      faites.push(m[0]);
    }
  });
  AJOUTS_PARAMETRES.forEach(function (m) {
    var ligne = Db_trouver(TABLES.PARAMETRES, m[0]);
    if (!ligne) return;
    var actuels = String(ligne.valeur).split(';').map(function (x) { return x.trim(); }).filter(String);
    var manquants = m[1].split(';').filter(function (x) { return actuels.indexOf(x) < 0; });
    if (!manquants.length) return;
    Db_maj(TABLES.PARAMETRES, m[0], { valeur: actuels.concat(manquants).join(';') });
    if (faites.indexOf(m[0]) < 0) faites.push(m[0]);
  });
  Params_cache_ = null;
  // Changement de libellé de zone : les avis déjà collectés suivent
  if (faites.indexOf('zone.libelle_paca') >= 0) Db_remplacerValeur_(TABLES.AVIS, 'zone', 'PACA', Params_texte('zone.libelle_paca', 'PACA'));
  return faites;
}

/** Ajoute les paramètres par défaut absents. Renvoie le nombre de clés ajoutées. */
function Params_initialiser_() {
  var existants = {};
  Db_lire(TABLES.PARAMETRES).forEach(function (l) { existants[String(l.cle)] = true; });
  var nouveaux = PARAMETRES_DEFAUT
    .filter(function (p) { return !existants[p[0]]; })
    .map(function (p) {
      // Valeur dynamique : date du jour pour le début du suivi des déclarations
      var valeur = p[0] === 'fiscal.debut_suivi' && !p[1] ? Utilities.formatDate(new Date(), APP.FUSEAU, 'yyyy-MM-dd') : p[1];
      return { cle: p[0], valeur: valeur, commentaire: p[2] };
    });
  Db_insererPlusieurs(TABLES.PARAMETRES, nouveaux);
  Params_cache_ = null;
  return nouveaux.length;
}


// ════════ PiecesOffre.js ════════

/**
 * Pièces de l'offre (fiche › Appel d'offres › Offre) : liste des pièces exigées par le RC et leur état.
 * Sert au contrôle avant dépôt et à la synthèse de la fiche. Organisation validée le 18/11/2026.
 */

var ETATS_PIECE = ['à faire', 'en cours', 'prête', 'déposée'];
var CATEGORIES_PIECE = ['Candidature', 'Offre'];

function PiecesOffre_lister(idAffaire) {
  return Db_lire(TABLES.PIECES_OFFRE)
    .filter(function (p) { return String(p.id_affaire) === String(idAffaire); })
    .sort(function (x, y) {
      var c = CATEGORIES_PIECE.indexOf(x.categorie) - CATEGORIES_PIECE.indexOf(y.categorie);
      return c || (Number(x.ordre) || 0) - (Number(y.ordre) || 0);
    });
}

function PiecesOffre_valider_(champs, creation) {
  var out = {};
  if ('categorie' in champs || creation) {
    var c = String(champs.categorie || '').trim();
    if (CATEGORIES_PIECE.indexOf(c) < 0) throw new Error('Catégorie attendue : ' + CATEGORIES_PIECE.join(' ou ') + '.');
    out.categorie = c;
  }
  if ('libelle' in champs || creation) {
    var l = String(champs.libelle || '').trim();
    if (!l) throw new Error('Intitulé de la pièce obligatoire.');
    out.libelle = l.slice(0, 200);
  }
  if ('etat' in champs) {
    if (ETATS_PIECE.indexOf(champs.etat) < 0) throw new Error('État attendu : ' + ETATS_PIECE.join(', ') + '.');
    out.etat = champs.etat;
  }
  if ('commentaire' in champs) out.commentaire = String(champs.commentaire || '').trim();
  return out;
}

function PiecesOffre_ajouter(idAffaire, champs) {
  Affaires_get_(idAffaire);
  var p = PiecesOffre_valider_(champs, true);
  var existantes = PiecesOffre_lister(idAffaire);
  p.id_affaire = idAffaire;
  p.etat = p.etat || 'à faire';
  p.ordre = existantes.reduce(function (m, x) { return Math.max(m, Number(x.ordre) || 0); }, 0) + 10;
  return Db_inserer(TABLES.PIECES_OFFRE, p);
}

/** Ajoute la liste type (paramètre liste.pieces_offre), sans doublon d'intitulé. Renvoie le nombre ajouté. */
function PiecesOffre_ajouterListeType(idAffaire) {
  var items = Params_liste('liste.pieces_offre').map(function (item) {
    var i = item.indexOf(':');
    var cat = i > 0 ? item.slice(0, i).trim() : 'Offre';
    return { categorie: CATEGORIES_PIECE.indexOf(cat) >= 0 ? cat : 'Offre', libelle: (i > 0 ? item.slice(i + 1) : item).trim() };
  });
  return PiecesOffre_insererItems_(idAffaire, items).ajoutees;
}

/**
 * Liste collée (rubrique « Pièces à remettre » de l'analyse du DCE, ou du RC) : une pièce par ligne.
 * Catégorie : ligne « Candidature » ou « Offre » seule (titre qui vaut pour les lignes suivantes),
 * ou préfixe « Candidature : DC1 ». Les autres titres (ligne finie par « : », « Pièces à remettre ») sont ignorés. Par défaut : Offre. Puces, cases et numéros en début de ligne sont ignorés.
 * Renvoie { ajoutees, doublons }.
 */
function PiecesOffre_collerListe(idAffaire, texte) {
  var items = PiecesOffre_analyserListe_(texte);
  if (!items.length) throw new Error('Aucune pièce reconnue : collez une pièce par ligne.');
  return PiecesOffre_insererItems_(idAffaire, items);
}

function PiecesOffre_analyserListe_(texte) {
  var cat = 'Offre', items = [];
  var categorie = function (s) {
    var c = String(s || '').trim().toLowerCase();
    return c === 'candidature' ? 'Candidature' : c === 'offre' ? 'Offre' : '';
  };
  String(texte || '').split(/\r?\n/).forEach(function (ligne) {
    var l = ligne.replace(/^\s*(?:[-–—•*·▪◦☐☑✓✔□■]|\[\s?[xX ]?\s?\]|\(?\d{1,2}[.)]|[a-z][.)])\s+/, '').trim();
    if (!l) return;
    var titre = categorie(l.replace(/\s*:\s*$/, ''));
    if (titre) { cat = titre; return; }
    // Autres titres : ligne terminée par « : » (« Pièces de la candidature : ») ou « Pièces à remettre »
    if (/:\s*$/.test(l) || /^pi[eè]ces?\s+(?:à|a)\s+(?:remettre|fournir|produire)\b/i.test(l)) {
      if (/candidature/i.test(l)) cat = 'Candidature';
      else if (/offre/i.test(l)) cat = 'Offre';
      return;
    }
    var m = l.match(/^(candidature|offre)\s*[:–—-]\s*(.+)$/i);
    if (m) items.push({ categorie: categorie(m[1]), libelle: m[2].trim() });
    else items.push({ categorie: cat, libelle: l });
  });
  return items;
}

/** Ajoute des pièces { categorie, libelle } à la suite, sans doublon d'intitulé (casse ignorée). */
function PiecesOffre_insererItems_(idAffaire, items) {
  Affaires_get_(idAffaire);
  var existantes = PiecesOffre_lister(idAffaire), deja = {};
  existantes.forEach(function (p) { deja[String(p.libelle).toLowerCase()] = true; });
  var ordre = existantes.reduce(function (m, x) { return Math.max(m, Number(x.ordre) || 0); }, 0);
  var doublons = 0, lignes = [];
  items.forEach(function (it) {
    var lib = String(it.libelle || '').trim().slice(0, 200);
    if (!lib) return;
    if (deja[lib.toLowerCase()]) { doublons++; return; }
    deja[lib.toLowerCase()] = true;
    ordre += 10;
    lignes.push({ id_affaire: idAffaire, categorie: CATEGORIES_PIECE.indexOf(it.categorie) >= 0 ? it.categorie : 'Offre', libelle: lib, etat: 'à faire', ordre: ordre });
  });
  if (lignes.length) Db_insererPlusieurs(TABLES.PIECES_OFFRE, lignes);
  return { ajoutees: lignes.length, doublons: doublons };
}

function PiecesOffre_maj(idAffaire, idPiece, champs) {
  var p = Db_trouver(TABLES.PIECES_OFFRE, idPiece);
  if (!p || String(p.id_affaire) !== String(idAffaire)) throw new Error('Pièce introuvable.');
  return Db_maj(TABLES.PIECES_OFFRE, idPiece, PiecesOffre_valider_(champs, false));
}

function PiecesOffre_supprimer(idAffaire, idPiece) {
  return Db_supprimerSi(TABLES.PIECES_OFFRE, function (p) { return String(p.id) === String(idPiece) && String(p.id_affaire) === String(idAffaire); });
}

/** Au passage en Déposée : les pièces prêtes ou en cours passent « déposée ». */
function PiecesOffre_marquerDeposees_(idAffaire) {
  var n = 0;
  PiecesOffre_lister(idAffaire).forEach(function (p) {
    if (p.etat !== 'déposée' && p.etat !== 'à faire') { Db_maj(TABLES.PIECES_OFFRE, p.id, { etat: 'déposée' }); n++; }
  });
  return n;
}

/** Résumé pour la synthèse et le contrôle avant dépôt. */
function PiecesOffre_resume_(pieces) {
  var n = function (e) { return pieces.filter(function (p) { return p.etat === e; }).length; };
  return { total: pieces.length, pretes: n('prête') + n('déposée'), deposees: n('déposée'), aFaire: n('à faire'), enCours: n('en cours') };
}


// ════════ Planning.js ════════

/**
 * Planning de facturation d'une affaire (décision du 21/11/2026, option A « par livrable »).
 *
 * - Montant d'une tranche : montant du marché (notifié, à défaut l'offre) au prorata des jours de la tranche
 *   (« Jours par tranche » : « TF : 50 j »). Sans jours par tranche : une seule ligne « Mission ».
 * - Facture prévue à la remise du dernier livrable de la tranche (Mission › Planning, même code de tranche) ;
 *   paiement prévu au délai public (echeance.paiement_public_j, 30 jours).
 * - Une facture saisie avec le code de la tranche (bouton « Facturer » du planning) remplace la prévision ;
 *   « payée » dès son encaissement. Les factures sans tranche comptent seulement dans l'encaissé de l'affaire.
 * - Retard de paiement : intérêts moratoires (taux BCE + 8 points, paramètre facture.taux_moratoire)
 *   et indemnité forfaitaire de 40 € (articles L. 2192-13 et D. 2192-35 du code de la commande publique).
 */

var PLANNING_MISSION = 'MISSION';
var ETATS_AFFERMISSEMENT = ['optionnelle', 'affermie', 'non affermie'];
/** États enregistrables : affermissement, plus « ferme » pour déclarer ferme une tranche au code d'option. */
var ETATS_TRANCHE = ETATS_AFFERMISSEMENT.concat(['ferme']);

/**
 * Tranche optionnelle ou conditionnelle d'après son code (TO1, TC2, TOP…) ou la mention « optionnelle » /
 * « conditionnelle » sur sa ligne de « Jours par tranche » ; TF et Mission sont fermes.
 */
function Planning_estOptionnelle_(code, ligne) {
  return /^T(O|C)/.test(String(code || '').toUpperCase()) || /option|condition/i.test(String(ligne || ''));
}

/** Nature d'une tranche : le choix enregistré (Mission › Marché) l'emporte sur le code et la mention. */
function Planning_trancheOptionnelle_(t, etatsT) {
  var e = etatsT[t.tranche];
  if (e) return e.etat !== 'ferme';
  return Planning_estOptionnelle_(t.tranche, t.texte);
}

/** État des tranches optionnelles enregistré sur l'affaire : « TO1:affermie:2027-03-01;TO2:non affermie ». */
function Planning_etatsTranches_(texte) {
  var out = {};
  String(texte || '').split(';').forEach(function (p) {
    var m = p.split(':');
    if (m.length < 2) return;
    var code = Planning_codeTranche_(m[0]);
    if (code && ETATS_TRANCHE.indexOf(m[1].trim()) >= 0) out[code] = { etat: m[1].trim(), date: (m[2] || '').trim() };
  });
  return out;
}

/**
 * Affermit une tranche optionnelle (ou la déclare non affermie, ou la remet optionnelle) ;
 * « ferme » / « optionnelle » fixent aussi la nature d'une tranche quel que soit son code (Mission › Marché).
 */
function Planning_affermir(idAffaire, tranche, etat, dateAffermissement) {
  var a = Affaires_get_(idAffaire);
  var code = Planning_codeTranche_(tranche);
  if (ETATS_TRANCHE.indexOf(etat) < 0) throw new Error('État attendu : ' + ETATS_TRANCHE.join(', ') + '.');
  var etats = Planning_etatsTranches_(a.tranches_etat);
  var d = date_(dateAffermissement);
  var t = Planning_tranches_(a.jours_par_tranche).filter(function (x) { return x.tranche === code; })[0] || { tranche: code, texte: '' };
  var parDefautOpt = Planning_estOptionnelle_(code, t.texte);
  if (etat === 'optionnelle' && parDefautOpt) delete etats[code];
  else if (etat === 'ferme' && !parDefautOpt) delete etats[code];
  else etats[code] = { etat: etat, date: d ? jourIso_(d) : (etat === 'affermie' ? jourIso_(aujourdhui_()) : '') };
  var texte = Object.keys(etats).map(function (k) { return k + ':' + etats[k].etat + (etats[k].date ? ':' + etats[k].date : ''); }).join(';');
  Db_maj(TABLES.AFFAIRES, idAffaire, { tranches_etat: texte });
  if (etat !== 'optionnelle' && etat !== 'ferme') Affaires_ajouterNote(idAffaire, 'Tranche ' + code + ' ' + etat + (etats[code].date ? ' le ' + etats[code].date.split('-').reverse().join('/') : ''));
  return etats;
}

/** Code de tranche comparable à celui des livrables (majuscules, 12 caractères). */
function Planning_codeTranche_(t) {
  return String(t || '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 12);
}

/** Tranches et jours lus dans « Jours par tranche » : [{ tranche, jours }]. */
function Planning_tranches_(texte) {
  var out = [];
  String(texte || '').split(/\r?\n|;/).forEach(function (ligne, i) {
    var l = ligne.trim();
    if (!l) return;
    var j = Affaires_joursTotal_(l);
    if (!(j > 0)) return;
    var m = l.match(/^([^:=]+?)\s*[:=]/);
    var code = Planning_codeTranche_(m ? m[1] : (l.match(/^([A-Za-z][\w-]*)/) || [])[1] || 'T' + (i + 1));
    out.push({ tranche: code, jours: j, texte: l });
  });
  return out;
}

/** Intérêts moratoires d'un retard : { jours, interets, indemnite, total }. */
function Planning_interets_(montant, echeance, paiement) {
  var jours = Math.max(ecartJours_(aujourdhui_(paiement), aujourdhui_(echeance)), 0);
  if (!jours) return null;
  var taux = Params_nombre('facture.taux_moratoire', 10.15) / 100;
  var interets = arrondi_(montant * taux * jours / 365);
  var indemnite = Params_nombre('facture.indemnite_recouvrement', 40);
  return { jours: jours, taux: taux * 100, interets: interets, indemnite: indemnite, total: arrondi_(interets + indemnite) };
}

/**
 * Planning d'une affaire. Renvoie { base, lignes: [...], debut, fin, aPlanifier, utilisable }.
 * Ligne : { tranche, jours, montant, livrables: [{ libelle, date, etat }], etat: 'à planifier'|'prévue'|'facturée'|'en retard'|'payée',
 *           dateFacture, dateEcheance, dateEncaissement, montantEncaisse, facture: { id, numero }, retard }.
 */
function Planning_affaire(idAffaire, quand) {
  var auj = aujourdhui_(quand);
  var a = Affaires_get_(idAffaire);
  var gagnee = ['Gagnée', 'Soldée'].indexOf(String(a.statut)) >= 0;
  var base = montant_(gagnee ? (a.montant_notifie || a.montant_ht) : a.montant_ht);
  var delai = Params_nombre('echeance.paiement_public_j', 30);
  var tranches = Planning_tranches_(a.jours_par_tranche);
  if (!tranches.length) tranches = [{ tranche: PLANNING_MISSION, jours: Affaires_joursTotal_(a.jours_par_tranche) }];
  var totalJours = tranches.reduce(function (s, t) { return s + t.jours; }, 0);
  var livrables = Livrables_lister(idAffaire);
  var factures = Db_lire(TABLES.FACTURES).filter(function (f) { return String(f.id_affaire) === String(idAffaire) && f.qonto_statut !== 'annulée'; });
  var codes = tranches.map(function (t) { return t.tranche; });
  var etatsT = Planning_etatsTranches_(a.tranches_etat);
  var lignes = tranches.map(function (t) {
    var unique = tranches.length === 1;
    var liv = livrables.filter(function (l) {
      var c = Planning_codeTranche_(l.tranche);
      return c === t.tranche || (unique && (!c || codes.indexOf(c) < 0));
    });
    var montant = arrondi_(totalJours > 0 ? base * t.jours / totalJours : base);
    var ligne = {
      tranche: t.tranche, jours: t.jours, montant: montant,
      livrables: liv.map(function (l) { return { libelle: String(l.libelle), date: date_(l.date_echeance) ? jourIso_(date_(l.date_echeance)) : '', etat: String(l.etat) }; }),
      etat: 'à planifier', dateFacture: '', dateEcheance: '', dateEncaissement: '', montantEncaisse: 0, facture: null, retard: null,
      optionnelle: Planning_trancheOptionnelle_(t, etatsT),
      affermissement: Planning_trancheOptionnelle_(t, etatsT)
        ? (etatsT[t.tranche] && ETATS_AFFERMISSEMENT.indexOf(etatsT[t.tranche].etat) >= 0 ? etatsT[t.tranche].etat : 'optionnelle') : 'ferme',
      dateAffermissement: etatsT[t.tranche] && etatsT[t.tranche].etat !== 'ferme' ? etatsT[t.tranche].date : ''
    };
    var f = factures.filter(function (x) { return Planning_codeTranche_(x.tranche) === t.tranche; })
      .sort(function (x, y) { return (date_(y.date) || 0) - (date_(x.date) || 0); })[0];
    if (f) {
      if (ligne.affermissement === 'optionnelle') ligne.affermissement = 'affermie'; // facturée : affermie de fait
      var dF = date_(f.date), dE = date_(f.date_echeance), dP = date_(f.date_encaissement);
      ligne.facture = { id: String(f.id), numero: String(f.numero || ''), lien: String(f.lien_facture || ''), qonto: String(f.qonto_statut || '') };
      ligne.montant = arrondi_(montant_(f.montant)) || montant;
      ligne.dateFacture = dF ? jourIso_(dF) : '';
      ligne.dateEcheance = dE ? jourIso_(dE) : '';
      if (dP) {
        ligne.etat = 'payée';
        ligne.dateEncaissement = jourIso_(dP);
        ligne.montantEncaisse = arrondi_(montant_(f.montant_encaisse));
        if (dE) ligne.retard = Planning_interets_(ligne.montant, dE, dP);
      } else {
        ligne.etat = dE && auj > aujourdhui_(dE) ? 'en retard' : 'facturée';
        if (ligne.etat === 'en retard') ligne.retard = Planning_interets_(ligne.montant, dE, auj);
      }
      return ligne;
    }
    var dates = liv.map(function (l) { return date_(l.date_echeance); }).filter(Boolean).sort(function (x, y) { return x - y; });
    if (dates.length) {
      var dFac = dates[dates.length - 1];
      var dEch = new Date(dFac.getTime()); dEch.setDate(dEch.getDate() + delai);
      ligne.etat = 'prévue';
      ligne.dateFacture = jourIso_(dFac);
      ligne.dateEcheance = jourIso_(dEch);
    }
    return ligne;
  });
  // Factures saisies sans tranche : elles couvrent les tranches non encore facturées, dans l'ordre
  var horsPlanning = factures.filter(function (x) { return !Planning_codeTranche_(x.tranche); })
    .reduce(function (s, x) { return s + montant_(x.montant); }, 0);
  lignes.forEach(function (l) {
    if (horsPlanning <= 0.005 || l.facture || l.affermissement === 'non affermie' || l.affermissement === 'optionnelle') return;
    var pris = Math.min(horsPlanning, l.montant);
    l.montant = arrondi_(l.montant - pris);
    horsPlanning -= pris;
    l.dejaFacture = arrondi_(pris);
    if (l.montant <= 0.005) l.etat = 'couverte';
  });
  lignes = lignes.filter(function (l) { return l.etat !== 'couverte'; }).concat(lignes.filter(function (l) { return l.etat === 'couverte'; }));
  var toutes = [];
  lignes.forEach(function (l) {
    l.livrables.forEach(function (x) { if (x.date) toutes.push(x.date); });
    [l.dateFacture, l.dateEcheance, l.dateEncaissement].forEach(function (d) { if (d) toutes.push(d); });
  });
  toutes.sort();
  return {
    base: arrondi_(base), delai: delai, lignes: lignes,
    debut: toutes[0] || '', fin: toutes[toutes.length - 1] || '', aujourdhui: jourIso_(auj),
    aPlanifier: lignes.filter(function (l) { return l.etat === 'à planifier' && l.affermissement !== 'non affermie'; }).length,
    montantOptionnel: arrondi_(lignes.filter(function (l) { return l.affermissement === 'optionnelle'; }).reduce(function (s, l) { return s + l.montant; }, 0)),
    montantNonAffermi: arrondi_(lignes.filter(function (l) { return l.affermissement === 'non affermie'; }).reduce(function (s, l) { return s + l.montant; }, 0)),
    utilisable: lignes.some(function (l) { return l.etat !== 'à planifier' && l.etat !== 'couverte'; })
  };
}

/**
 * Encaissements à venir par année d'après le planning (pour le CA prévisionnel), ou null si rien n'est planifié.
 * Tranche prévue ou facturée : année de l'échéance de paiement (année en cours si elle est passée) ;
 * tranche à planifier : année en cours (signalée).
 */
function Planning_parAnnee_(idAffaire, quand, p) {
  p = p || Planning_affaire(idAffaire, quand);
  if (!p.utilisable) return null;
  var anCourant = aujourdhui_(quand).getFullYear();
  var parAnnee = {}, potentiel = {}, aPreciser = false;
  p.lignes.forEach(function (l) {
    if (l.etat === 'payée' || l.etat === 'couverte' || l.affermissement === 'non affermie') return;
    var an = l.dateEcheance ? Math.max(Number(l.dateEcheance.slice(0, 4)), anCourant) : anCourant;
    if (l.affermissement === 'optionnelle') { potentiel[an] = (potentiel[an] || 0) + l.montant; return; }
    if (!l.dateEcheance) aPreciser = true;
    parAnnee[an] = (parAnnee[an] || 0) + l.montant;
  });
  return { parAnnee: parAnnee, potentiel: potentiel, aPreciser: aPreciser, planning: p };
}

/** Facture d'une tranche (depuis la barre de planning) : numéro, date, montant prérempli. */
function Planning_facturer(idAffaire, tranche, donnees) {
  var d = Object.assign({}, donnees || {}, { tranche: Planning_codeTranche_(tranche) });
  return Factures_ajouter(idAffaire, d);
}


// ════════ Previsionnel.js ════════

/**
 * CA prévisionnel par année d'encaissement (décision du 21/11/2026).
 *
 * - Base : encaissements (règle des seuils de la micro-entreprise et de la franchise de TVA).
 * - Encaissé : factures payées, par année de date_encaissement.
 * - Prévu : affaires Gagnées, reste à encaisser (montant notifié, à défaut montant de l'offre − déjà encaissé),
 *   réparti selon le champ « Encaissements prévus par année » de l'affaire (« 2027 : 10000 », « 2028 : reste »).
 *   Sans répartition : tout le reste sur l'année en cours, signalé « répartition à préciser ».
 * - Potentiel : affaires Déposées, montant de l'offre réparti de la même façon, affiché à part (non pondéré).
 */

var STATUTS_CA_POTENTIEL = ['Déposée'];
var PREVISIONNEL_HORIZON = 3; // années affichées après l'année en cours (au minimum)

/**
 * Lit une répartition : une ligne (ou « ; ») par année, « AAAA : montant » ou « AAAA : reste ».
 * Renvoie { lignes: [{ annee, montant|null (reste) }], erreurs: [texte] }.
 */
function Previsionnel_lireRepartition_(texte) {
  var lignes = [], erreurs = [];
  String(texte || '').split(/\r?\n|;/).forEach(function (l) {
    var t = l.trim();
    if (!t) return;
    var m = t.match(/^(\d{4})\s*[:=\-–]?\s*(.*)$/);
    if (!m) { erreurs.push('ligne illisible : « ' + t + ' »'); return; }
    var v = m[2].trim();
    if (!v || /^(le\s+)?reste|solde/i.test(v)) { lignes.push({ annee: Number(m[1]), montant: null }); return; }
    var n = montant_(v.replace(/€|ht/gi, ''));
    if (!(n > 0)) { erreurs.push('montant illisible pour ' + m[1] + ' : « ' + v + ' »'); return; }
    lignes.push({ annee: Number(m[1]), montant: n });
  });
  if (lignes.filter(function (x) { return x.montant === null; }).length > 1) erreurs.push('« reste » indiqué sur plusieurs années : seule la première est retenue');
  return { lignes: lignes, erreurs: erreurs };
}

/**
 * Montants à encaisser par année pour une affaire, à partir de l'année en cours.
 * base = montant total du marché ; dejaParAnnee = encaissé de l'affaire par année.
 * Renvoie { parAnnee: {annee: montant}, aPreciser, remarques: [] }.
 */
function Previsionnel_repartir_(base, dejaParAnnee, texte, anneeCourante) {
  var deja = Object.keys(dejaParAnnee).reduce(function (s, k) { return s + dejaParAnnee[k]; }, 0);
  var reste = Math.max(base - deja, 0);
  var out = { parAnnee: {}, aPreciser: false, remarques: [] };
  if (reste <= 0) return out;
  var r = Previsionnel_lireRepartition_(texte);
  out.remarques = r.erreurs.slice();
  // Lignes futures (année en cours incluse) ; une ligne passée ne compte que pour ce qui y a été encaissé
  var lignes = r.lignes.filter(function (l) { return l.annee >= anneeCourante; });
  if (!lignes.length) {
    out.parAnnee[anneeCourante] = reste;
    out.aPreciser = true;
    if (r.lignes.length) out.remarques.push('répartition sans année à venir : reste mis sur ' + anneeCourante);
    return out;
  }
  // Montant d'une année = prévu − déjà encaissé cette année-là ; « reste » = ce qui n'est pas réparti ailleurs
  var idxReste = -1;
  var alloue = 0;
  lignes.forEach(function (l, i) {
    if (l.montant === null) { if (idxReste < 0) idxReste = i; return; }
    var v = Math.max(l.montant - (dejaParAnnee[l.annee] || 0), 0);
    out.parAnnee[l.annee] = (out.parAnnee[l.annee] || 0) + v;
    alloue += v;
  });
  var solde = arrondi_(reste - alloue);
  if (idxReste >= 0) {
    out.parAnnee[lignes[idxReste].annee] = (out.parAnnee[lignes[idxReste].annee] || 0) + Math.max(solde, 0);
    if (solde < 0) out.remarques.push('répartition supérieure au montant restant de ' + Courriers_euros_(-solde));
  } else if (solde > 0.005) {
    var der = lignes[lignes.length - 1].annee;
    out.parAnnee[der] += solde;
    out.remarques.push(Courriers_euros_(solde) + ' non répartis, ajoutés à ' + der);
  } else if (solde < -0.005) {
    out.remarques.push('répartition supérieure au montant restant de ' + Courriers_euros_(-solde));
  }
  return out;
}

/** Seuils (mêmes paramètres que le compteur de CA). */
function Previsionnel_seuils_() {
  return JALONS_CA.map(function (j) {
    return { cle: j.cle, libelle: j.libelle, vise: !!j.vise, seuil: Params_nombre(j.cle, 0) };
  }).filter(function (j) { return j.seuil > 0; });
}

/**
 * Tableau prévisionnel : années, détail par affaire, comparaison aux seuils.
 * Renvoie { annees: [{ annee, encaisse, prevu, certain, potentiel, total, etats: {...}, depasse: [libellés] }],
 *           affaires: [{ id, acheteur, objet, statut, base, encaisse, parAnnee, aPreciser, remarques, repartition }], seuils, alertePct }.
 */
function Previsionnel_ca(quand) {
  var auj = quand || new Date();
  var anneeCourante = Number(Utilities.formatDate(auj, APP.FUSEAU, 'yyyy'));
  var alerte = Params_nombre('seuil.alerte_pct', 80) / 100;
  var encaisseAnnee = {}, encaisseAffaire = {};
  Db_lire(TABLES.FACTURES).forEach(function (f) {
    var d = date_(f.date_encaissement);
    var paye = montant_(f.montant_encaisse);
    if (!d || !paye) return;
    var an = anneeDe_(d);
    encaisseAnnee[an] = (encaisseAnnee[an] || 0) + paye;
    if (f.id_affaire) {
      encaisseAffaire[f.id_affaire] = encaisseAffaire[f.id_affaire] || {};
      encaisseAffaire[f.id_affaire][an] = (encaisseAffaire[f.id_affaire][an] || 0) + paye;
    }
  });
  var prevu = {}, potentiel = {}, annees = {}, joursPrevu = {}, joursPotentiel = {};
  for (var y = anneeCourante; y <= anneeCourante + PREVISIONNEL_HORIZON; y++) annees[y] = true;
  var affaires = [];
  Affaires_lister().forEach(function (a) {
    var gagnee = STATUTS_CA_ENGAGE.indexOf(String(a.statut)) >= 0;
    var deposee = STATUTS_CA_POTENTIEL.indexOf(String(a.statut)) >= 0;
    if (!gagnee && !deposee) return;
    var baseMarche = montant_(gagnee ? (a.montant_notifie || a.montant_ht) : a.montant_ht);
    var pl = Planning_affaire(a.id, auj);
    // Tranches optionnelles : non encore affermies → potentiel ; non affermies → exclues du CA
    var base = Math.max(baseMarche - pl.montantOptionnel - pl.montantNonAffermi, 0);
    var deja = encaisseAffaire[a.id] || {};
    var rep = Previsionnel_repartir_(base, deja, a.repartition_ca, anneeCourante);
    var plan = Planning_parAnnee_(a.id, auj, pl);
    var potOptions = plan ? plan.potentiel : (pl.montantOptionnel > 0 ? (function () { var o = {}; o[anneeCourante] = pl.montantOptionnel; return o; })() : {});
    Object.keys(potOptions).forEach(function (k) { potentiel[k] = (potentiel[k] || 0) + potOptions[k]; annees[k] = true; });
    if (plan) {
      // Planning de facturation (livrables) : prioritaire sur la répartition saisie, plafonné au reste à encaisser
      var resteP = Math.max(base - Object.keys(deja).reduce(function (s, k) { return s + deja[k]; }, 0), 0);
      var parAnneeP = {};
      Object.keys(plan.parAnnee).map(Number).sort().forEach(function (k) {
        var v = Math.min(plan.parAnnee[k], resteP);
        if (v > 0.005) parAnneeP[k] = v;
        resteP -= v;
      });
      if (resteP > 0.005) parAnneeP[anneeCourante] = (parAnneeP[anneeCourante] || 0) + resteP;
      rep = { parAnnee: parAnneeP, aPreciser: plan.aPreciser, remarques: plan.aPreciser ? ['tranche(s) sans livrable daté : comptée(s) sur ' + anneeCourante] : [], source: 'planning' };
    }
    var cible = gagnee ? prevu : potentiel;
    Object.keys(rep.parAnnee).forEach(function (k) { cible[k] = (cible[k] || 0) + rep.parAnnee[k]; annees[k] = true; });
    // Jours : saisis dans « Jours par tranche » ; prix de journée saisi, à défaut montant / jours.
    // Jours d'une année = montant de l'année / prix de journée.
    var joursTotal = Affaires_joursTotal_(a.jours_par_tranche);
    var prixJour = Number(a.prix_jour) || (joursTotal > 0 && base > 0 ? base / joursTotal : 0);
    var cibleJ = gagnee ? joursPrevu : joursPotentiel;
    var joursParAnnee = {};
    if (prixJour > 0) Object.keys(rep.parAnnee).forEach(function (k) {
      if (!(rep.parAnnee[k] > 0.005)) return;
      joursParAnnee[k] = Math.round(rep.parAnnee[k] / prixJour * 10) / 10;
      cibleJ[k] = (cibleJ[k] || 0) + rep.parAnnee[k] / prixJour;
    });
    if (!base) rep.remarques.push(gagnee ? 'montant notifié manquant' : 'montant de l\'offre manquant');
    affaires.push({
      id: a.id, acheteur: a.acheteur, objet: a.objet, statut: a.statut, base: arrondi_(base), optionnel: arrondi_(pl.montantOptionnel), nonAffermi: arrondi_(pl.montantNonAffermi),
      encaisse: arrondi_(Object.keys(deja).reduce(function (s, k) { return s + deja[k]; }, 0)),
      parAnnee: Object.keys(rep.parAnnee).reduce(function (o, k) { if (rep.parAnnee[k] > 0.005) o[k] = arrondi_(rep.parAnnee[k]); return o; }, {}),
      aPreciser: rep.aPreciser && base > 0, remarques: rep.remarques, repartition: String(a.repartition_ca || ''), source: rep.source || (a.repartition_ca ? 'répartition saisie' : ''),
      jours: joursTotal, joursSource: joursTotal > 0 ? 'jours par tranche' : (prixJour > 0 ? 'montant / prix par jour' : ''),
      joursEstimes: joursTotal > 0 ? joursTotal : (prixJour > 0 && base > 0 ? Math.round(base / prixJour * 10) / 10 : 0),
      prixJour: Math.round(prixJour * 100) / 100, joursParAnnee: joursParAnnee
    });
  });
  var seuils = Previsionnel_seuils_();
  var lignes = Object.keys(annees).map(Number).filter(function (an) { return an >= anneeCourante; }).sort().map(function (an) {
    var enc = an === anneeCourante ? (encaisseAnnee[an] || 0) : 0;
    var certain = enc + (prevu[an] || 0);
    var total = certain + (potentiel[an] || 0);
    return {
      annee: an, encaisse: arrondi_(enc), prevu: arrondi_(prevu[an] || 0), certain: arrondi_(certain),
      potentiel: arrondi_(potentiel[an] || 0), total: arrondi_(total),
      joursPrevu: Math.round((joursPrevu[an] || 0) * 10) / 10, joursPotentiel: Math.round((joursPotentiel[an] || 0) * 10) / 10,
      seuils: seuils.map(function (s) {
        return { cle: s.cle, libelle: s.libelle, seuil: s.seuil, etat: etat_(certain, s.seuil, alerte), etatTotal: etat_(total, s.seuil, alerte) };
      })
    };
  });
  affaires.sort(function (x, y) { return String(x.id).localeCompare(String(y.id), 'fr', { numeric: true }); });
  return { anneeCourante: anneeCourante, annees: lignes, affaires: affaires, seuils: seuils, alertePct: alerte * 100 };
}

/** Années à venir dont le CA certain dépasse un seuil (pour l'e-mail du matin) : [« 2027 : Plafond micro-entreprise dépassé (…) »]. */
function Previsionnel_alertes_(quand) {
  var p = Previsionnel_ca(quand);
  var out = [];
  p.annees.forEach(function (an) {
    var dep = an.seuils.filter(function (s) { return s.etat === 'depasse'; });
    var pire = dep[dep.length - 1];
    if (pire) out.push(an.annee + ' : ' + pire.libelle + ' dépassé — ' + Courriers_euros_(an.certain) + ' prévus pour ' + Courriers_euros_(pire.seuil));
    else {
      var pot = an.seuils.filter(function (s) { return s.etatTotal === 'depasse'; }).pop();
      if (pot) out.push(an.annee + ' : ' + pot.libelle + ' dépassé si les offres déposées sont gagnées — ' + Courriers_euros_(an.total) + ' pour ' + Courriers_euros_(pot.seuil));
    }
  });
  return out;
}


// ════════ Qonto.js ════════

/**
 * Qonto : récupération des factures clients et de leurs paiements (21/11/2026).
 *
 * Les factures sont émises dans Qonto (plateforme agréée pour la facture électronique) ; l'app les lit seulement,
 * avec une clé API Qonto (« identifiant:clé secrète », en-tête Authorization, API en lecture).
 * La clé est gardée dans les propriétés du script, jamais dans le classeur.
 *
 * Rattachement d'une facture Qonto à une affaire : le n° KA dans le champ « Bon de commande » de la facture
 * (ex. « KI-2027-003 TF » : affaire et tranche), à défaut dans l'en-tête, le pied ou une ligne de la facture.
 * Une facture sans n° KA est gardée « à rattacher » (elle compte quand même dans le CA encaissé) ;
 * le rattachement se fait ensuite dans Finances › Encaissements.
 *
 * Une facture saisie à la main dans l'app avec le même numéro est complétée, pas dupliquée.
 * Rien n'est jamais supprimé : une facture annulée dans Qonto est signalée (qonto_statut « annulée »).
 */

var QONTO_URL = 'https://thirdparty.qonto.com';
var QONTO_PROP_LOGIN = 'QONTO_LOGIN';
var QONTO_PROP_SECRET = 'QONTO_SECRET';
var QONTO_PROP_SYNCHRO = 'QONTO_DERNIERE_SYNCHRO';
var QONTO_STATUTS = { unpaid: 'à payer', paid: 'payée', canceled: 'annulée', draft: 'brouillon' };

function Qonto_identifiants_() {
  var p = PropertiesService.getScriptProperties();
  var login = p.getProperty(QONTO_PROP_LOGIN), secret = p.getProperty(QONTO_PROP_SECRET);
  return login && secret ? { login: login, secret: secret } : null;
}

function Qonto_appel_(chemin, ids) {
  ids = ids || Qonto_identifiants_();
  if (!ids) throw new Error('Qonto n\'est pas connecté : Paramètres › Finances › Qonto.');
  var r = UrlFetchApp.fetch(QONTO_URL + chemin, {
    method: 'get', muteHttpExceptions: true,
    headers: { Authorization: ids.login + ':' + ids.secret, Accept: 'application/json' }
  });
  var code = r.getResponseCode();
  if (code === 401 || code === 403) throw new Error('Qonto refuse la clé API (vérifiez l\'identifiant et la clé secrète, et les droits de la clé).');
  if (code === 429) throw new Error('Qonto : trop de requêtes, réessayez dans une minute.');
  if (code < 200 || code >= 300) throw new Error('Qonto : erreur ' + code + '.');
  return JSON.parse(r.getContentText() || '{}');
}

/** Enregistre la clé après l'avoir testée ; renvoie le nom de la société vu par Qonto. */
function Qonto_connecter(login, secret) {
  login = String(login || '').trim(); secret = String(secret || '').trim();
  if (!login || !secret) throw new Error('Identifiant et clé secrète Qonto obligatoires.');
  var org = Qonto_appel_('/v2/organization', { login: login, secret: secret });
  var p = PropertiesService.getScriptProperties();
  p.setProperty(QONTO_PROP_LOGIN, login);
  p.setProperty(QONTO_PROP_SECRET, secret);
  var o = org.organization || {};
  return { societe: String(o.legal_name || o.name || o.slug || 'connecté') };
}

function Qonto_deconnecter() {
  var p = PropertiesService.getScriptProperties();
  p.deleteProperty(QONTO_PROP_LOGIN);
  p.deleteProperty(QONTO_PROP_SECRET);
  return true;
}

/** Toutes les factures clients Qonto (hors brouillons), toutes pages. */
function Qonto_factures_() {
  var toutes = [], page = 1;
  for (var garde = 0; garde < 50 && page; garde++) {
    var r = Qonto_appel_('/v2/client_invoices?filter%5Bstatus%5D=unpaid,paid,canceled&per_page=100&page=' + page);
    toutes = toutes.concat(r.client_invoices || []);
    page = r.meta && r.meta.next_page ? r.meta.next_page : null;
  }
  return toutes;
}

/** Affaire et tranche lues sur la facture : { id_affaire, tranche } (vides si rien trouvé). */
function Qonto_reference_(inv, affaires) {
  var sources = [inv.purchase_order, inv.header, inv.footer].concat((inv.items || []).map(function (i) { return (i.title || '') + ' ' + (i.description || ''); }));
  for (var i = 0; i < sources.length; i++) {
    var t = String(sources[i] || '');
    var m = t.toUpperCase().match(/(K[AI])[-\s]?(\d{4})[-\s]?(\d{3})/);
    if (!m) continue;
    var id = m[1] + '-' + m[2] + '-' + m[3];
    var a = affaires[id];
    if (!a) continue;
    var reste = t.toUpperCase().slice(t.toUpperCase().indexOf(m[0]) + m[0].length);
    var codes = Planning_tranches_(a.jours_par_tranche).map(function (x) { return x.tranche; });
    var tranche = codes.filter(function (c) { return new RegExp('(^|[^A-Z0-9])' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Z0-9]|$)').test(reste); })[0] || '';
    return { id_affaire: id, tranche: tranche };
  }
  return { id_affaire: '', tranche: '' };
}

function Qonto_jour_(v) {
  var d = date_(v);
  return d ? aujourdhui_(d) : '';
}

/**
 * Synchronisation : crée ou complète les factures de l'app d'après Qonto.
 * Renvoie { lues, creees, majs, aRattacher, annulees, payees: [numéros payés depuis la dernière fois] }.
 */
function Qonto_synchroniser() {
  var debut = Date.now();
  var bilan = { lues: 0, creees: 0, majs: 0, aRattacher: 0, annulees: 0, payees: [], erreur: '' };
  try {
    var affaires = {};
    Affaires_lister().forEach(function (a) { affaires[String(a.id)] = a; });
    var existantes = Db_lire(TABLES.FACTURES);
    var parQonto = {}, parNumero = {};
    existantes.forEach(function (f) {
      if (f.qonto_id) parQonto[String(f.qonto_id)] = f;
      if (f.numero) parNumero[String(f.numero).trim().toUpperCase()] = f;
    });
    var touchees = {};
    Qonto_factures_().forEach(function (inv) {
      bilan.lues++;
      var statut = QONTO_STATUTS[inv.status] || String(inv.status || '');
      var ttc = Number(inv.total_amount && inv.total_amount.value) || (Number(inv.total_amount_cents) || 0) / 100;
      var tva = Number(inv.vat_amount && inv.vat_amount.value) || (Number(inv.vat_amount_cents) || 0) / 100;
      var ht = arrondi_(ttc - tva);
      var paye = inv.status === 'paid';
      var encaisse = paye ? (Number(inv.amount_paid && inv.amount_paid.value) || ttc) : 0;
      var ref = Qonto_reference_(inv, affaires);
      var champs = {
        numero: String(inv.number || ''), date: Qonto_jour_(inv.issue_date), montant: ht,
        date_echeance: Qonto_jour_(inv.due_date), qonto_id: String(inv.id), qonto_statut: statut, lien_facture: String(inv.invoice_url || '')
      };
      if (paye) { champs.date_encaissement = Qonto_jour_(inv.paid_at) || aujourdhui_(); champs.montant_encaisse = arrondi_(encaisse); }
      var f = parQonto[String(inv.id)] || parNumero[String(inv.number || '').trim().toUpperCase()];
      if (!f) {
        if (inv.status === 'canceled') return; // jamais vue dans l'app : rien à faire
        champs.id_affaire = ref.id_affaire;
        champs.tranche = ref.tranche;
        Db_inserer(TABLES.FACTURES, champs);
        bilan.creees++;
        if (!ref.id_affaire) bilan.aRattacher++;
        if (paye) bilan.payees.push(champs.numero);
        if (ref.id_affaire) touchees[ref.id_affaire] = true;
        return;
      }
      // Facture connue : on complète, sans écraser un rattachement fait à la main
      if (!f.id_affaire && ref.id_affaire) champs.id_affaire = ref.id_affaire;
      if (!f.tranche && ref.tranche) champs.tranche = ref.tranche;
      if (inv.status === 'canceled') {
        champs = { qonto_id: champs.qonto_id, qonto_statut: statut, lien_facture: champs.lien_facture };
        if (f.qonto_statut !== statut) bilan.annulees++;
      }
      var change = Object.keys(champs).some(function (k) { return String(Qonto_comparable_(champs[k])) !== String(Qonto_comparable_(f[k])); });
      if (!change) return;
      if (paye && !date_(f.date_encaissement)) bilan.payees.push(champs.numero);
      Db_maj(TABLES.FACTURES, f.id, champs);
      bilan.majs++;
      if (f.id_affaire || champs.id_affaire) touchees[String(f.id_affaire || champs.id_affaire)] = true;
    });
    Object.keys(touchees).forEach(function (id) { try { Affaires_verifierSolde_(id); } catch (e) { /* affaire supprimée */ } });
    try { Relances_synchroniser(); } catch (e) { console.error('Relances : ' + e.message); }
    PropertiesService.getScriptProperties().setProperty(QONTO_PROP_SYNCHRO, new Date().toISOString());
  } catch (e) {
    bilan.erreur = String(e && e.message ? e.message : e);
  }
  Db_inserer(TABLES.JOURNAL_MOTEUR, {
    date: new Date(), source: 'Qonto', avis_lus: bilan.lues, avis_retenus: bilan.creees + bilan.majs,
    exclus: 0, doublons: 0, erreurs: bilan.erreur, duree_s: Math.round((Date.now() - debut) / 100) / 10
  });
  if (bilan.erreur) throw new Error(bilan.erreur);
  return bilan;
}

function Qonto_comparable_(v) {
  if (v instanceof Date) return jourIso_(v);
  if (typeof v === 'number') return arrondi_(v);
  return v === undefined || v === null ? '' : v;
}

/** État de la connexion et factures à rattacher (Paramètres et Finances). */
function Qonto_etat() {
  var ids = Qonto_identifiants_();
  var derniere = PropertiesService.getScriptProperties().getProperty(QONTO_PROP_SYNCHRO);
  var aRattacher = Db_lire(TABLES.FACTURES).filter(function (f) { return f.qonto_id && !f.id_affaire && f.qonto_statut !== 'annulée'; })
    .map(function (f) { return versClient_(TABLES.FACTURES, f); });
  var annulees = Db_lire(TABLES.FACTURES).filter(function (f) { return f.qonto_statut === 'annulée' && f.id_affaire; })
    .map(function (f) { return versClient_(TABLES.FACTURES, f); });
  return {
    connecte: !!ids, identifiant: ids ? ids.login : '', derniereSynchro: derniere || '',
    aRattacher: aRattacher, annulees: annulees,
    affaires: Affaires_lister().filter(function (a) { return ['Gagnée', 'Soldée'].indexOf(String(a.statut)) >= 0; })
      .map(function (a) { return { id: a.id, acheteur: String(a.acheteur || ''), tranches: Planning_tranches_(a.jours_par_tranche).map(function (t) { return t.tranche; }) }; })
  };
}

/** Rattache une facture (venue de Qonto sans n° KA) à une affaire et, si besoin, à une tranche. */
function Qonto_rattacher(idFacture, idAffaire, tranche) {
  var f = Db_trouver(TABLES.FACTURES, idFacture);
  if (!f) throw new Error('Facture introuvable : ' + idFacture);
  Affaires_get_(idAffaire);
  Db_maj(TABLES.FACTURES, idFacture, { id_affaire: idAffaire, tranche: Planning_codeTranche_(tranche) });
  Affaires_verifierSolde_(idAffaire);
  try { Relances_synchroniser(); } catch (e) { /* sans effet */ }
  return true;
}

/** Synchronisation quotidienne (déclencheur de la collecte), seulement si Qonto est connecté. */
function Qonto_synchroniserSiConnecte_() {
  if (!Qonto_identifiants_()) return null;
  try { return Qonto_synchroniser(); } catch (e) { console.error('Qonto : ' + e.message); return null; }
}


// ════════ Veille.js ════════

/**
 * Module Veille (§ 3) : collecte BOAMP + alertes Gmail, filtres, dédoublonnage, pré-score.
 *
 * API BOAMP (open data DILA, Opendatasoft) — champs confirmés le 12/11/2026 :
 *   idweb, objet, nomacheteur, code_departement[], dateparution, datelimitereponse,
 *   nature (APPEL_OFFRE…), type_marche[] (SERVICES…), procedure_libelle,
 *   descripteur_libelle[], url_avis, donnees (JSON : CPV, montant estimé, référence).
 * Les départements arrivent parfois sans zéro (« 4 ») : normalisés en « 04 ».
 */

var BOAMP_API = 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records';
var SOURCE_BOAMP = 'BOAMP';
var SOURCE_GMAIL = 'Alerte e-mail';

// ——— Collecte quotidienne (déclencheur 6 h) ———

function collecteQuotidienne() {
  MiseAJour_verifier_();
  var verrou = LockService.getScriptLock();
  if (!verrou.tryLock(1000)) { console.warn('Collecte déjà en cours.'); return null; }
  try {
    var ctx = Veille_contexte_();
    var bilan = [Veille_executer_(SOURCE_BOAMP, function () { return Veille_lireBoamp_(ctx); }, ctx),
      Veille_executer_(SOURCE_GMAIL, function () { return Veille_lireGmail_(ctx); }, ctx)];
    try { Qonto_synchroniserSiConnecte_(); } catch (e) { console.error('Qonto : ' + e.message); }
    try { Relances_synchroniser(); } catch (e) { console.error('Relances : ' + e.message); }
    try { Veille_archiver_(); } catch (e) { console.error('Archivage : ' + e.message); }
    console.log(JSON.stringify(bilan));
    return bilan;
  } finally {
    verrou.releaseLock();
  }
}

/** Paramètres et données lus une fois par collecte. */
function Veille_contexte_() {
  var ca = Compteur_ca();
  var vise = (ca.jalons.filter(function (j) { return j.cle === 'seuil.plafond_vise'; })[0] || {}).resteEngage;
  return {
    aujourdhui: (function () { var d = new Date(); d.setHours(0, 0, 0, 0); return d; })(),
    cpv: Params_liste('veille.cpv'),
    motsCles: Veille_termes_('veille.mots_cles'),
    motsCoeur: Veille_termes_('veille.mots_cles_coeur'),
    exclusions: Veille_termes_('veille.exclusions'),
    acheteursExclus: Veille_motsEntiers_(Params_liste('veille.acheteurs_exclus')),
    exclusionsSouples: Veille_termes_('veille.exclusions_souples'),
    motsBatiment: Veille_termes_('veille.mots_batiment'),
    equipements: Veille_termes_('veille.equipements'),
    batimentRequis: Params_texte('veille.batiment_requis', 'oui').toLowerCase() === 'oui',
    batimentAmoSouple: Params_texte('veille.batiment_amo_souple', 'oui').toLowerCase() === 'oui',
    exclusionsAVerifier: Veille_termes_('veille.exclusions_a_verifier'),
    horsZone: Params_texte('veille.hors_zone', 'non').toLowerCase() === 'oui',
    exclusionMoe: Veille_norm_(Params_texte('veille.exclusion_moe', '')),
    exceptionMoe: Veille_norm_(Params_texte('veille.exception_moe', '')),
    paca: Params_liste('zone.departements_paca'),
    libellePaca: Params_texte('zone.libelle_paca', 'PACA'),
    libelleFrance: Params_texte('zone.libelle_france', 'France — présentiel à vérifier'),
    jours: Params_nombre('veille.fenetre_jours', 3),
    montantMax: Params_nombre('capacite.montant_max_mission', null),
    resteSousPlafond: typeof vise === 'number' ? vise : null,
    existants: Db_lire(TABLES.AVIS),
    apprentissage: Veille_apprentissage_()
  };
}

/** Exécute une source, filtre, dédoublonne, enregistre et journalise. */
function Veille_executer_(source, lire, ctx) {
  var debut = Date.now();
  var bilan = { source: source, lus: 0, exclus: 0, doublons: 0, retenus: 0, erreurs: '' };
  try {
    var bruts = lire();
    bilan.lus = bruts.length;
    var nouveaux = [];
    bruts.forEach(function (a) {
      var f = Veille_filtrer_(a, ctx);
      if (!f.garde) { bilan.exclus++; return; }
      if (f.batimentAVerifier) a.batimentAVerifier = true;
      var d = Veille_doublon_(a, ctx.existants.concat(nouveaux));
      if (d) {
        bilan.doublons++;
        if (d.id && d.lien !== a.lien && String(d.liens_autres || '').indexOf(a.lien) < 0 && a.lien) {
          d.liens_autres = (d.liens_autres ? d.liens_autres + '\n' : '') + a.lien;
          Db_maj(TABLES.AVIS, d.id, { liens_autres: d.liens_autres });
        } else if (!d.id && a.lien && d.lien !== a.lien) {
          d.liens_autres = (d.liens_autres ? d.liens_autres + '\n' : '') + a.lien;
        }
        return;
      }
      Veille_scorer_(a, ctx);
      nouveaux.push(a);
    });
    var enregistres = Db_insererPlusieurs(TABLES.AVIS, nouveaux);
    ctx.existants = ctx.existants.concat(enregistres);
    bilan.retenus = enregistres.length;
  } catch (e) {
    bilan.erreurs = String(e && e.message ? e.message : e);
    console.error(source + ' : ' + bilan.erreurs);
  }
  bilan.duree_s = Math.round((Date.now() - debut) / 100) / 10;
  Db_inserer(TABLES.JOURNAL_MOTEUR, {
    date: new Date(), source: source, avis_lus: bilan.lus, avis_retenus: bilan.retenus,
    exclus: bilan.exclus, doublons: bilan.doublons, erreurs: bilan.erreurs, duree_s: bilan.duree_s
  });
  return bilan;
}

// ——— Source BOAMP ———

function Veille_requeteBoamp_(ctx, depuis) {
  var q = function (t) { return '"' + String(t).replace(/["\\]/g, ' ') + '"'; };
  var conditions = ['descripteur_libelle=' + q('Assistance à maîtrise d\'ouvrage')]
    .concat(ctx.cpv.map(function (c) { return 'donnees like \'%' + c.replace(/\D/g, '') + '%\''; }))
    .concat(Params_liste('veille.mots_cles').map(function (m) { return 'search(objet,' + q(m) + ')'; }));
  var zone = '';
  if (!ctx.horsZone && ctx.paca.length) {
    var codes = [];
    ctx.paca.forEach(function (d) { codes.push(d); if (/^0\d$/.test(d)) codes.push(d.slice(1)); if (/^2[AB]$/i.test(d) && codes.indexOf('20') < 0) codes.push('20'); });
    zone = ' and code_departement in (' + codes.map(function (c) { return '\'' + c + '\''; }).join(',') + ')';
  }
  return 'dateparution>=date\'' + depuis + '\' and nature=\'APPEL_OFFRE\' and type_marche=\'SERVICES\'' + zone + ' and (' +
    conditions.join(' or ') + ')';
}

function Veille_lireBoamp_(ctx) {
  var depuis = new Date(ctx.aujourdhui.getTime() - ctx.jours * 86400000);
  var where = Veille_requeteBoamp_(ctx, jourIso_(depuis));
  var resultats = [], offset = 0, total = Infinity;
  while (offset < total && offset < 1000) {
    var url = BOAMP_API + '?where=' + encodeURIComponent(where) + '&order_by=dateparution&limit=100&offset=' + offset;
    var json = Veille_fetchJson_(url);
    total = json.total_count || 0;
    resultats = resultats.concat(json.results || []);
    if (!json.results || !json.results.length) break;
    offset += json.results.length;
  }
  return resultats.map(function (r) { return Veille_depuisBoamp_(r, ctx); });
}

/** Appel HTTP avec 3 essais (l'API coupe parfois la connexion). */
function Veille_fetchJson_(url) {
  var derniere;
  for (var essai = 0; essai < 3; essai++) {
    try {
      var rep = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
      var code = rep.getResponseCode();
      var corps = JSON.parse(rep.getContentText());
      if (code === 200) return corps;
      derniere = new Error('BOAMP ' + code + ' : ' + (corps.message || ''));
      if (code >= 400 && code < 500) break; // requête invalide : inutile de réessayer
    } catch (e) {
      derniere = e;
    }
    Utilities.sleep(2000 * (essai + 1));
  }
  throw derniere;
}

/** Enregistrement BOAMP → avis. */
function Veille_depuisBoamp_(r, ctx) {
  var d = String(r.donnees || '');
  var deps = (r.code_departement || []).map(Veille_dep_);
  var cpv = [];
  var re1 = /"classPrincipale"\s*:\s*"(\d{8})/g, re2 = /"@listName"\s*:\s*"cpv"\s*,\s*"#text"\s*:\s*"(\d{8})/g, m;
  while ((m = re1.exec(d))) if (cpv.indexOf(m[1]) < 0) cpv.push(m[1]);
  while ((m = re2.exec(d))) if (cpv.indexOf(m[1]) < 0) cpv.push(m[1]);
  return {
    source: SOURCE_BOAMP,
    id_source: String(r.idweb),
    date_parution: date_(r.dateparution),
    acheteur: Veille_texte_(r.nomacheteur),
    type_acheteur: Veille_typeAcheteur_(r.nomacheteur),
    departement: deps.filter(function (x) { return ctx.paca.indexOf(x) >= 0; })[0] || deps[0] || '',
    departements: deps,
    objet: Veille_texte_(r.objet),
    cpv: cpv.join(';'),
    descripteurs: (r.descripteur_libelle || []).join(';'),
    reference_acheteur: Veille_referenceBoamp_(d),
    montant_estime: Veille_montantBoamp_(d),
    procedure: r.procedure_libelle || '',
    date_limite: r.datelimitereponse ? new Date(r.datelimitereponse) : '',
    lien: r.url_avis || ('https://www.boamp.fr/pages/avis/?q=idweb:' + r.idweb)
  };
}

function Veille_referenceBoamp_(d) {
  var m = d.match(/"identifiantInterne"\s*:\s*"([^"]+)"/);
  if (m) return m[1].trim();
  m = d.match(/"cac:ProcurementProject"\s*:\s*\{\s*"cbc:ID"\s*:\s*(?:"([^"]+)"|\{[^}]*"#text"\s*:\s*"([^"]+)")/);
  return m ? (m[1] || m[2]).trim() : '';
}

function Veille_montantBoamp_(d) {
  var m = d.match(/"cbc:EstimatedOverallContractAmount"\s*:\s*\{[^}]*"#text"\s*:\s*"([\d.]+)"/) ||
    d.match(/"valeurEstimee"\s*:\s*\{[^}]*?"valeur"\s*:\s*"([\d.]+)"/) ||
    d.match(/"valeurHaute"\s*:\s*"([\d.]+)"/);
  var n = m ? Number(m[1]) : 0;
  return n > 1 ? n : '';
}

// ——— Source Gmail (alertes des plateformes, libellé « Veille ») ———

function Veille_lireGmail_(ctx) {
  var libelle = Params_texte('veille.libelle_gmail', 'Veille');
  var threads = GmailApp.search('label:"' + libelle + '" newer_than:' + Math.max(ctx.jours, 1) + 'd', 0, 100);
  var props = PropertiesService.getScriptProperties();
  var traites = JSON.parse(props.getProperty('GMAIL_TRAITES') || '[]');
  var connus = {};
  traites.forEach(function (id) { connus[id] = true; });
  ctx.existants.forEach(function (a) { if (a.source === SOURCE_GMAIL) connus[a.id_source] = true; });
  var avis = [];
  threads.forEach(function (t) {
    t.getMessages().forEach(function (msg) {
      var id = 'gmail:' + msg.getId();
      if (connus[id]) return;
      connus[id] = true;
      traites.push(id);
      avis.push(Veille_depuisEmail_(id, msg.getSubject(), msg.getFrom(), msg.getPlainBody(), msg.getDate(), ctx));
    });
  });
  props.setProperty('GMAIL_TRAITES', JSON.stringify(traites.slice(-400)));
  return avis;
}

/**
 * Alerte e-mail → avis. V1 générique : un avis par e-mail (objet = sujet, lien = premier lien
 * vers une plateforme, date limite et département cherchés dans le texte). À affiner plateforme
 * par plateforme avec les premières alertes reçues.
 */
function Veille_depuisEmail_(id, sujet, de, corps, quand, ctx) {
  corps = String(corps || '');
  var liens = (corps.match(/https?:\/\/[^\s<>")\]]+/g) || []).filter(function (u) {
    return !/unsubscribe|desinscri|désinscri|desabonn|désabonn|\.(png|jpg|gif)(\?|$)|mailto:/i.test(u);
  });
  var domaines = Params_liste('veille.plateformes_domaines');
  var lien = liens.filter(function (u) { return domaines.some(function (dm) { return u.indexOf(dm) >= 0; }); })[0] || liens[0] || '';
  var dl = corps.match(/(?:date\s+limite|remise\s+des\s+(?:offres|plis)|r[ée]ception\s+des\s+(?:offres|plis))[^0-9]{0,60}(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/i);
  var dateLimite = dl ? new Date(Number(dl[3].length === 2 ? '20' + dl[3] : dl[3]), Number(dl[2]) - 1, Number(dl[1])) : '';
  var cp = corps.match(/\b(\d{2})\d{3}\b/g) || [];
  var deps = cp.map(function (c) { return c.slice(0, 2); });
  var acheteurMatch = corps.match(/(?:acheteur|organisme|pouvoir adjudicateur)\s*:\s*([^\n]+)/i);
  var acheteur = acheteurMatch ? acheteurMatch[1].trim() : String(de || '').replace(/<.*>/, '').replace(/"/g, '').trim();
  var objet = String(sujet || '').replace(/^(\s*(tr|fwd?|re)\s*:\s*)+/i, '').trim();
  return {
    source: SOURCE_GMAIL,
    id_source: id,
    date_parution: quand || new Date(),
    acheteur: acheteur,
    type_acheteur: Veille_typeAcheteur_(acheteur),
    departement: deps.filter(function (x) { return ctx.paca.indexOf(x) >= 0; })[0] || deps[0] || '',
    departements: deps,
    objet: objet,
    texte: corps.slice(0, 3000),
    cpv: (corps.match(/\b7\d{7}\b/g) || []).join(';'),
    descripteurs: '',
    reference_acheteur: '',
    montant_estime: '',
    procedure: '',
    date_limite: dateLimite,
    lien: lien
  };
}

// ——— Filtres (§ 3.2) ———

function Veille_filtrer_(a, ctx) {
  var objet = Veille_norm_(a.objet);
  var texte = objet + ' ' + Veille_norm_(a.texte || '');
  // Acheteurs exclus (Ministère des Armées) : AO, MAPA, toute procédure. Alerte e-mail sans acheteur : début du texte.
  var exAch = Veille_acheteurExclu_(a, ctx);
  if (exAch) return { garde: false, motif: 'acheteur exclu : ' + exAch };
  // Zone : départements connus et tous hors zone → exclu (sauf veille.hors_zone = oui)
  var deps = (a.departements || [a.departement]).filter(Boolean);
  if (!ctx.horsZone && deps.length && !deps.some(function (d) { return ctx.paca.indexOf(d) >= 0; })) {
    return { garde: false, motif: 'hors zone' };
  }
  var equipement = Veille_contientMot_(objet, ctx.equipements);
  var excl = Veille_contientMot_(objet, ctx.exclusions);
  if (excl) return { garde: false, motif: 'exclusion : ' + excl };
  var souple = Veille_contientMot_(objet, ctx.exclusionsSouples);
  if (souple && !equipement) return { garde: false, motif: 'exclusion : ' + souple };
  if (ctx.exclusionMoe && objet.indexOf(ctx.exclusionMoe) >= 0 && objet.indexOf(ctx.exceptionMoe) < 0) {
    return { garde: false, motif: 'mission de maîtrise d\'œuvre' };
  }
  // Maîtrise d'œuvre sans AMO (variantes d'écriture : « maîtrise d'oeuvre », « MOE ») — texte normalisé
  if (/maitrise d.?oeuvre|\bmoe\b/.test(objet) && !/assistance a (la )?maitrise d.?ouvrage|\bamo\b/.test(objet)) {
    return { garde: false, motif: 'mission de maîtrise d\'œuvre' };
  }
  var cpvOk = String(a.cpv || '').split(';').some(function (c) { return ctx.cpv.indexOf(c) >= 0; });
  var descOk = /assistance a maitrise d.ouvrage/.test(Veille_norm_(a.descripteurs || ''));
  var motOk = ctx.motsCles.some(function (m) {
    return m.length <= 4 ? new RegExp('\\b' + m + '\\b').test(texte) : texte.indexOf(m) >= 0;
  });
  if (!(cpvOk || descOk || motOk)) return { garde: false, motif: 'hors CPV et mots-clés' };
  if (ctx.batimentRequis && !Veille_contientMot_(objet, ctx.motsBatiment)) {
    // Assouplissement (19/11/2026) : une AMO explicite sans mot du bâtiment (« assistance technique à maîtrise
    // d'ouvrage pour les marchés de travaux », « AMO cadre de vie ») est gardée en « possible », bâtiment à vérifier.
    if (ctx.batimentAmoSouple && /assistance (technique )?a (la )?maitrise d.?ouvrage|\bamo\b/.test(objet)) {
      var hs = Veille_contientMot_(objet, ctx.exclusionsAVerifier);
      if (hs) return { garde: false, motif: 'hors domaine bâtiment (' + hs + ')' };
      return { garde: true, batimentAVerifier: true };
    }
    return { garde: false, motif: 'hors domaine bâtiment' };
  }
  return { garde: true };
}

/** Terme de veille.acheteurs_exclus trouvé dans l'acheteur ou l'objet (ou le début d'une alerte e-mail sans acheteur), sinon ''. */
function Veille_acheteurExclu_(a, ctx) {
  if (!ctx.acheteursExclus || !ctx.acheteursExclus.length) return '';
  var cible = Veille_norm_(a.acheteur) + ' | ' + Veille_norm_(a.objet);
  if (!a.acheteur) cible += ' | ' + Veille_norm_(String(a.texte || '').slice(0, 600));
  return Veille_contientMot_(cible, ctx.acheteursExclus);
}

/**
 * Liste de termes de veille, normalisés. Un terme saisi avec une espace finale (« plu », « dsp », « opc »)
 * la garde : il ne correspond qu'au mot entier (« plu » ≠ « plusieurs »). Params_liste la retirait.
 */
function Veille_termes_(cle) {
  return Params_texte(cle, '').split(SEP_LISTE).map(function (t) {
    var n = Veille_norm_(t);
    return n && /\s$/.test(t) ? n + ' ' : n;
  }).filter(String);
}

/** Termes comparés en mot entier (« sid » ≠ « Sidiailles », « armées » ≠ « armement »). */
function Veille_motsEntiers_(termes) {
  return termes.map(function (t) { return Veille_norm_(t) + ' '; }).filter(function (t) { return t.trim(); });
}

/** Avis « nouveaux » d'un acheteur exclu, déjà collectés : archivés (rien d'autre n'est touché). */
function Veille_archiverAcheteursExclus_() {
  var ctx = { acheteursExclus: Veille_motsEntiers_(Params_liste('veille.acheteurs_exclus')) };
  var n = 0;
  Db_lire(TABLES.AVIS).forEach(function (a) {
    if (a.statut !== 'nouveau') return;
    var m = Veille_acheteurExclu_({ acheteur: a.acheteur || '-', objet: a.objet }, ctx);
    if (!m) return;
    Db_maj(TABLES.AVIS, a.id, { statut: 'archivé', classement: 'archivé', score_detail: 'Acheteur exclu : ' + m + ' · ' + (a.score_detail || '') });
    n++;
  });
  return n;
}

/**
 * Premier terme de la liste présent dans le texte, comparé en début de mot
 * (« graphique » ne correspond pas à « muséographique »). Un terme qui finit par une espace
 * doit être un mot entier (« plu » ≠ « plus »).
 */
function Veille_contientMot_(texte, termes) {
  var t = ' ' + texte + ' ';
  for (var i = 0; i < termes.length; i++) {
    var m = termes[i];
    if (!m) continue;
    var echap = m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ $/, '(?![a-z0-9])');
    if (new RegExp('(^|[^a-z0-9])' + echap).test(t)) return m.trim();
  }
  return '';
}

/**
 * Applique les filtres actuels aux avis « nouveaux » déjà collectés : ceux qui ne passent plus
 * sont archivés (statut et classement « archivé », motif dans le détail du score).
 */
function Veille_refiltrer_() {
  var ctx = Veille_contexte_();
  var n = 0;
  Db_lire(TABLES.AVIS).forEach(function (a) {
    if (a.statut !== 'nouveau') return;
    var f = Veille_filtrer_({ acheteur: a.acheteur, objet: a.objet, cpv: a.cpv, descripteurs: '', departement: a.departement, departements: [a.departement], texte: '' }, ctx);
    // Les avis collectés avant ce filtre ont passé le contrôle CPV / mots-clés : seul le nouveau tri s'applique
    if (!f.garde && f.motif !== 'hors CPV et mots-clés') {
      Db_maj(TABLES.AVIS, a.id, { statut: 'archivé', classement: 'archivé', score_detail: 'Exclu par les nouveaux filtres : ' + f.motif + ' · ' + (a.score_detail || '') });
      n++;
    }
  });
  return n;
}

// ——— Dédoublonnage (§ 3.3) ———

function Veille_doublon_(a, existants) {
  var dl = a.date_limite ? jourIso_(a.date_limite instanceof Date ? a.date_limite : date_(a.date_limite) || new Date(a.date_limite)) : '';
  for (var i = 0; i < existants.length; i++) {
    var e = existants[i];
    if (e.source === a.source && String(e.id_source) === String(a.id_source)) return e;
    if (!Veille_memeAcheteur_(a.acheteur, e.acheteur)) continue;
    if (a.reference_acheteur && e.reference_acheteur &&
        Veille_norm_(a.reference_acheteur) === Veille_norm_(e.reference_acheteur)) return e;
    var edl = e.date_limite ? jourIso_(e.date_limite instanceof Date ? e.date_limite : date_(e.date_limite) || new Date(e.date_limite)) : '';
    if (dl && dl === edl && Veille_similarite_(a.objet, e.objet) >= 0.5) return e;
  }
  return null;
}

/** Même acheteur malgré des écritures différentes (« EHPAD X » / « EHPAD Résidence X »). */
function Veille_memeAcheteur_(x, y) {
  var mots = function (s) {
    return Veille_norm_(s).replace(/&#0?39;/g, ' ').split(/[^a-z0-9]+/).filter(function (w) {
      return w.length > 2 && ['commune', 'ville', 'mairie', 'des', 'les', 'residence'].indexOf(w) < 0;
    });
  };
  var a = mots(x), b = mots(y);
  if (!a.length || !b.length) return false;
  if (a.join(' ') === b.join(' ')) return true;
  var communs = a.filter(function (w) { return b.indexOf(w) >= 0; }).length;
  return communs / Math.min(a.length, b.length) >= 0.75 && Math.min(a.length, b.length) >= 2;
}

function Veille_similarite_(x, y) {
  var mots = function (s) { return Veille_norm_(s).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3; }); };
  var a = mots(x), b = mots(y);
  if (!a.length || !b.length) return 0;
  var communs = a.filter(function (w) { return b.indexOf(w) >= 0; }).length;
  return communs / Math.min(a.length, b.length);
}

// ——— Pré-score (§ 3.4) ———

function Veille_scorer_(a, ctx) {
  var p = function (cle, defaut) { return Params_nombre('score.' + cle, defaut); };
  var deps = a.departements || [a.departement];
  var paca = deps.some(function (d) { return ctx.paca.indexOf(d) >= 0; });
  var objet = Veille_norm_(a.objet);
  var coeur = ctx.motsCoeur.some(function (m) { return objet.indexOf(m) >= 0; });
  var jours = a.date_limite ? Math.floor(((a.date_limite instanceof Date ? a.date_limite : new Date(a.date_limite)) - ctx.aujourdhui) / 86400000) : null;
  var commune = a.type_acheteur === 'Commune' || a.type_acheteur === 'EPCI';
  var montant = Number(a.montant_estime) || 0;
  var plafond = [ctx.montantMax, ctx.resteSousPlafond].filter(function (v) { return typeof v === 'number' && v > 0; });
  var compatible = plafond.every(function (v) { return montant <= v; });

  var detail = {
    zone: paca ? p('zone_paca', 25) : p('zone_france', 10),
    mission: coeur ? p('mission_coeur', 30) : p('mission_autre', 15),
    delai: jours === null ? p('delai_10j', 8) : jours >= 15 ? p('delai_15j', 15) : jours >= 10 ? p('delai_10j', 8) : p('delai_court', 0),
    acheteur: commune ? p('acheteur_commune_epci', 15) : p('acheteur_autre', 10),
    montant: !montant ? p('montant_inconnu', 8) : compatible ? p('montant_compatible', 15) : p('montant_hors', 0)
  };
  var total = detail.zone + detail.mission + detail.delai + detail.acheteur + detail.montant;
  // Historique de vos décisions (avis ignorés, No-go, affaires étudiées) : ajustement borné
  var hist = Veille_ajustementHistorique_(a.objet, ctx.apprentissage);
  if (hist) {
    var base = total, plancher = p('seuil_possible', 40);
    total = Math.max(0, Math.min(100, total + hist.points));
    // Garde-fou : l'historique ne fait jamais archiver un avis que les critères de base gardent (au pire « possible »)
    if (base >= plancher && total < plancher) { total = plancher; hist.plancher = true; }
  }
  var classement = total >= p('seuil_etudier', 60) ? 'à étudier' : total >= p('seuil_possible', 40) ? 'possible' : 'archivé';
  // Domaine bâtiment non cité dans l'objet : au mieux « possible », jamais « à étudier »
  if (a.batimentAVerifier && classement === 'à étudier') classement = 'possible';

  a.zone = paca ? ctx.libellePaca : ctx.libelleFrance;
  if (paca && ctx.paca.indexOf(a.departement) < 0) a.departement = deps.filter(function (d) { return ctx.paca.indexOf(d) >= 0; })[0];
  a.pre_score = total;
  a.score_detail = 'Zone ' + detail.zone + ' · Mission ' + detail.mission + ' · Délai ' + detail.delai +
    (jours === null ? ' (date inconnue)' : ' (' + jours + ' j)') + ' · Acheteur ' + detail.acheteur + ' · Montant ' + detail.montant +
    (hist ? ' · Historique ' + (hist.points > 0 ? '+' : '') + hist.points + ' (' +
      [hist.plus.length ? 'proche d\'avis retenus : ' + hist.plus.join(', ') : '', hist.moins.length ? 'proche d\'avis écartés : ' + hist.moins.join(', ') : '']
        .filter(String).join(' ; ') + ')' + (hist.plancher ? ' limité : jamais archivé par l\'historique' : '') : '') +
    (a.batimentAVerifier ? ' · Bâtiment à vérifier (objet sans mot du bâtiment)' : '');
  a.alerte_delai = jours !== null && jours < 10 ? 'oui' : '';
  a.classement = classement;
  a.statut = classement === 'archivé' ? 'archivé' : 'nouveau';
  delete a.departements;
  delete a.descripteurs;
  delete a.texte;
  delete a.batimentAVerifier;
  return a;
}

// ——— Archivage (allège l'onglet Avis) ———

/** Déplace dans « Avis archivés » les avis échus depuis plus de N jours (sans date : parus il y a plus de 2N jours). */
function Veille_archiver_(quand) {
  var auj = aujourdhui_(quand);
  var n = Params_nombre('veille.archivage_jours', 60);
  var limite = ajouterJours_(auj, -n), limiteParution = ajouterJours_(auj, -2 * n);
  var aArchiver = Db_lire(TABLES.AVIS).filter(function (a) {
    var dl = date_(a.date_limite), dp = date_(a.date_parution);
    return dl ? aujourdhui_(dl) < limite : (dp ? aujourdhui_(dp) < limiteParution : false);
  });
  if (!aArchiver.length) return 0;
  var ids = aArchiver.map(function (a) { return String(a.id); });
  Db_insererPlusieurs(TABLES.AVIS_ARCHIVES, aArchiver);
  Db_supprimerSi(TABLES.AVIS, function (a) { return ids.indexOf(String(a.id)) >= 0; });
  return aArchiver.length;
}

// ——— Actions sur les avis ———

/** « Étudier » : crée l'affaire (statut En étude) liée à l'avis. */
function Avis_etudier(idAvis) {
  var a = Db_trouver(TABLES.AVIS, idAvis);
  if (!a) throw new Error('Avis introuvable : ' + idAvis);
  if (a.id_affaire) return Affaires_get_(a.id_affaire);
  var affaire = Affaires_creer({
    acheteur: a.acheteur, type_acheteur: a.type_acheteur, departement: a.departement, objet: a.objet,
    reference_acheteur: a.reference_acheteur, procedure: Veille_procedure_(a.procedure),
    plateforme: a.source === SOURCE_BOAMP ? 'BOAMP' : '', lien_avis: a.lien,
    date_limite_remise: a.date_limite instanceof Date ? jourIso_(a.date_limite) : a.date_limite,
    pre_score: a.pre_score, id_avis: a.id
  }, { commentaire: 'Créée depuis l\'avis ' + a.id + ' (' + a.source + ', pré-score ' + a.pre_score + ')' });
  Db_maj(TABLES.AVIS, idAvis, { statut: 'étudié', id_affaire: affaire.id });
  return affaire;
}

function Avis_changerStatut(idAvis, statut) {
  if (['nouveau', 'ignoré', 'archivé'].indexOf(statut) < 0) throw new Error('Statut d\'avis non modifiable : ' + statut);
  var a = Db_trouver(TABLES.AVIS, idAvis);
  if (!a) throw new Error('Avis introuvable : ' + idAvis);
  if (a.statut === 'étudié') throw new Error('Avis déjà transformé en affaire (' + a.id_affaire + ').');
  return Db_maj(TABLES.AVIS, idAvis, { statut: statut });
}

// ——— Outils ———

function Veille_norm_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’`´]/g, '\'').replace(/œ/g, 'oe').replace(/\s+/g, ' ')
    .replace(/assistance a la maitrise/g, 'assistance a maitrise').trim();
}

function Veille_normAcheteur_(s) {
  return Veille_norm_(s).replace(/&#0?39;/g, '\'')
    .replace(/\b(commune|ville|mairie|de|du|des|la|le|les|d|l)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
}

function Veille_texte_(s) {
  return String(s || '').replace(/&#0?39;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function Veille_dep_(d) {
  d = String(d || '').trim();
  return /^\d$/.test(d) ? '0' + d : d.toUpperCase();
}

function Veille_typeAcheteur_(nom) {
  var n = ' ' + Veille_norm_(nom) + ' ';
  if (/\b(communaute|communautes|cnes|cte|metropole|agglomeration|agglo|syndicat|sivom|sivu|sivos|smi?|petr|pays|epci|cc|ca|cu|ccas)\b/.test(n)) return 'EPCI';
  if (/\b(commune|ville|mairie)\b/.test(n)) return 'Commune';
  if (/\b(departement|conseil departemental)\b/.test(n)) return 'Département';
  if (/\b(region|conseil regional)\b/.test(n)) return 'Région';
  if (/\b(habitat|logement|hlm|oph)\b/.test(n)) return 'Bailleur social';
  if (/\b(prefecture|ministere|dreal|ddt|sgami|direction|etat)\b/.test(n)) return 'État';
  if (/\b(universite|hopital|chu|chru|ch|ehpad|etablissement public|epf|cnfpt|lycee|college|ecole)\b/.test(n)) return 'Établissement public';
  return 'Autre acheteur public';
}

function Veille_procedure_(libelle) {
  var n = Veille_norm_(libelle);
  if (/adapt/.test(n)) return 'MAPA';
  if (/ouvert|restreint|appel d.offres/.test(n)) return 'AO';
  return libelle || '';
}


// ════════ VeilleApprentissage.js ════════

/**
 * Veille qui apprend de vos décisions (21/11/2026).
 *
 * Exemples écartés : avis « ignoré » (onglets Avis et Avis archivés) et affaires passées en No-go.
 * Exemples retenus : avis « étudié » dont l'affaire n'est pas en No-go.
 * Pour chaque mot de l'objet (4 lettres et plus, hors mots vides), part des avis retenus parmi ceux qui le contiennent,
 * comparée à la part globale. Le pré-score d'un nouvel avis reçoit un ajustement « Historique » borné
 * (paramètre score.apprentissage_max, 10 points), visible dans le détail du score avec les mots qui l'expliquent.
 * Sans effet tant qu'il y a moins de veille.apprentissage_min décisions (15) ou si veille.apprentissage = non.
 */

var VEILLE_MOTS_VIDES = ['avec', 'pour', 'dans', 'des', 'les', 'une', 'sur', 'aux', 'par', 'entre', 'suite', 'cadre', 'relative', 'relatif',
  'concernant', 'objet', 'marche', 'marches', 'lot', 'lots', 'prestation', 'prestations', 'mission', 'missions', 'assistance', 'maitrise', 'ouvrage',
  'travaux', 'commune', 'ville', 'departement', 'communaute', 'communes', 'accord', 'accords', 'cadre', 'service', 'services', 'realisation',
  'operation', 'projet', 'etude', 'etudes', 'dans', 'leur', 'tout', 'tous', 'plus', 'autres', 'type', 'site', 'sites'];

function Veille_motsObjet_(objet) {
  var vus = {};
  return Veille_norm_(objet).split(/[^a-z0-9]+/).filter(function (w) {
    if (w.length < 4 || /^\d+$/.test(w) || VEILLE_MOTS_VIDES.indexOf(w) >= 0 || vus[w]) return false;
    vus[w] = true;
    return true;
  });
}

/** Statistiques apprises : { actif, decisions, retenus, ecartes, mots: { mot: [retenus, ecartes] } }. */
function Veille_apprentissage_() {
  var actif = Params_texte('veille.apprentissage', 'oui').toLowerCase() === 'oui';
  var res = { actif: false, decisions: 0, retenus: 0, ecartes: 0, mots: {} };
  if (!actif) return res;
  var affaires = {};
  Db_lire(TABLES.AFFAIRES).forEach(function (a) { affaires[String(a.id)] = a; });
  var exemples = [], avisLies = {};
  var avis = Db_lire(TABLES.AVIS);
  try { avis = avis.concat(Db_lire(TABLES.AVIS_ARCHIVES)); } catch (e) { /* onglet absent */ }
  avis.forEach(function (x) {
    if (x.statut === 'ignoré') exemples.push({ objet: x.objet, retenu: false });
    else if (x.statut === 'étudié' && x.id_affaire && affaires[String(x.id_affaire)]) {
      avisLies[String(x.id_affaire)] = true;
      exemples.push({ objet: x.objet, retenu: affaires[String(x.id_affaire)].statut !== 'No-go' });
    }
  });
  // Affaires créées à la main (sans avis) : leur décision compte aussi
  Object.keys(affaires).forEach(function (id) {
    var a = affaires[id];
    if (avisLies[id] || /^\[EXERCICE\]/.test(String(a.objet || ''))) return;
    if (a.statut === 'No-go') exemples.push({ objet: a.objet, retenu: false });
    else if (['Go', 'Déposée', 'Gagnée', 'Perdue', 'Sans suite', 'Soldée', 'Abandonnée'].indexOf(String(a.statut)) >= 0) exemples.push({ objet: a.objet, retenu: true });
  });
  res.decisions = exemples.length;
  if (exemples.length < Params_nombre('veille.apprentissage_min', 15)) return res;
  exemples.forEach(function (ex) {
    if (ex.retenu) res.retenus++; else res.ecartes++;
    Veille_motsObjet_(ex.objet).forEach(function (w) {
      var m = res.mots[w] = res.mots[w] || [0, 0];
      m[ex.retenu ? 0 : 1]++;
    });
  });
  res.actif = res.retenus > 0 && res.ecartes > 0;
  return res;
}

/**
 * Ajustement « Historique » d'un objet d'avis : { points, plus: [mots], moins: [mots] } ou null.
 * Un mot compte s'il apparaît dans au moins 3 décisions ; il faut au moins 2 mots connus.
 */
function Veille_ajustementHistorique_(objet, app) {
  if (!app || !app.actif) return null;
  var base = (app.retenus + 1) / (app.retenus + app.ecartes + 2);
  var connus = Veille_motsObjet_(objet).map(function (w) {
    var m = app.mots[w];
    if (!m || m[0] + m[1] < 3) return null;
    return { mot: w, ecart: (m[0] + 1) / (m[0] + m[1] + 2) - base };
  }).filter(Boolean);
  if (connus.length < 2) return null;
  var moyenne = connus.reduce(function (s, c) { return s + c.ecart; }, 0) / connus.length;
  var max = Params_nombre('score.apprentissage_max', 10);
  var points = Math.round(Math.max(-1, Math.min(1, moyenne * 2)) * max);
  if (!points) return null;
  connus.sort(function (x, y) { return x.ecart - y.ecart; });
  return {
    points: points,
    moins: connus.filter(function (c) { return c.ecart < -0.1; }).slice(0, 3).map(function (c) { return c.mot; }),
    plus: connus.filter(function (c) { return c.ecart > 0.1; }).reverse().slice(0, 3).map(function (c) { return c.mot; })
  };
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
  MiseAJour_verifier_(); // classeur complété si le code vient d'être mis à jour (ajouts seulement)
  // Application pour ordinateur (Windows, macOS, ChromeOS). Sur téléphone, seul l'Accueil (tableau de bord)
  // est adapté à l'écran (décision du 18/11/2026) ; les autres écrans gardent la mise en page ordinateur.
  var sortie = HtmlService.createTemplateFromFile('Index').evaluate();
  // Thème du compte, appliqué avant l'affichage (repère THEME_SERVEUR de Index.html)
  try { sortie.setContent(sortie.getContent().replace("'THEME_SERVEUR'", "'" + Theme_lire_() + "'")); } catch (e) { /* thème du navigateur */ }
  sortie.setTitle(APP.NOM).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  try {
    sortie.setFaviconUrl(Params_texte('app.favicon_url', '') || APP.FAVICON);
  } catch (e) {
    // Classeur pas encore installé : la page s'affiche quand même et signale l'erreur.
  }
  return sortie;
}

/**
 * Thème de l'interface (Paramètres › Apparence) : gardé sur le compte, pas seulement dans le navigateur
 * (la mémoire du navigateur repart à zéro à chaque nouvelle version de l'app). « kompa » ou « neon ».
 */
function Theme_lire_() {
  try {
    var t = PropertiesService.getUserProperties().getProperty('KA_THEME');
    return t === 'neon' || t === 'kompa' ? t : '';
  } catch (e) { return ''; }
}

function apiTheme(theme) {
  return repondre_(function () {
    if (theme !== 'neon' && theme !== 'kompa') throw new Error('Thème inconnu : ' + theme);
    PropertiesService.getUserProperties().setProperty('KA_THEME', theme);
    return theme;
  });
}

/** Inclusion d'un fichier HTML dans le gabarit : <?!= include('Styles'); ?> */
function include(nom) {
  return HtmlService.createHtmlOutputFromFile(nom).getContent();
}

function verifierAcces_() {
  var proprietaire = Session.getEffectiveUser().getEmail();
  var visiteur = Session.getActiveUser().getEmail();
  if (proprietaire && visiteur && proprietaire !== visiteur) {
    throw new Error('Accès réservé au compte de ' + APP.ENTREPRISE + '.');
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

/** Accueil en un seul échange : tableau de bord, CA, déclarations, échéances, relances, état. */
function apiAccueil() {
  return repondre_(function () {
    return {
      tableau: Indicateurs_tableau(),
      ca: Compteur_ca(),
      fiscal: Fiscal_declarations(),
      suivi: Suivi_accueil_(),
      etat: Etat_leger_(),
      previsionnel: Previsionnel_ca(),
      alertes: { retards: Finances_retards_(), seuils: Previsionnel_alertes_() }
    };
  });
}

/** Écran Finances : vue d'ensemble, prévisionnel, encaissements (toutes affaires), URSSAF et CFE. */
function apiFinances() {
  return repondre_(function () { return Finances_synthese(); });
}

/** Recherche rapide d'une affaire (Ctrl+K). */
function apiRecherche() {
  return repondre_(Finances_listeRecherche_);
}

/** Facturer ou confirmer un paiement depuis l'écran Finances : renvoie la synthèse à jour. */
function apiFinancesFacturer(idAffaire, tranche, facture) {
  return repondre_(function () { Planning_facturer(idAffaire, tranche, facture); Relances_synchroniser(); return Finances_synthese(); });
}

function apiFinancesPaiement(idFacture, champs) {
  return repondre_(function () { Factures_maj(idFacture, champs); Relances_synchroniser(); return Finances_synthese(); });
}

/** CA prévisionnel par année d'encaissement (écran « CA prévisionnel »). */
function apiPrevisionnel() {
  return repondre_(function () { return Previsionnel_ca(); });
}

/** État du socle : compte, classeur, onglets, quotas. */
function apiEtat() {
  return repondre_(Etat_socle_);
}

/** État pour l'accueil : version, alertes de déploiement, dernière mise à jour automatique (sans relire les onglets). */
function Etat_leger_() {
  return { app: APP.NOM, version: APP.VERSION, alertes: Etat_alertes_(), majAuto: MiseAJour_dernier_() };
}

function Etat_socle_() {
  return (function () {
    var classeur = Db_classeur();
    var tables = Tables_toutes_();
    var onglets = Object.keys(tables).map(function (k) {
      var f = null;
      try { f = Db_classeur(tables[k].classeur).getSheetByName(tables[k].onglet); } catch (e) { /* classeur absent */ }
      return { nom: tables[k].onglet, present: !!f, lignes: f ? Math.max(f.getLastRow() - 1, 0) : 0 };
    });
    return {
      app: APP.NOM,
      version: APP.VERSION,
      alertes: Etat_alertes_(),
      majAuto: MiseAJour_dernier_(),
      compte: Session.getEffectiveUser().getEmail(),
      classeur: { nom: classeur.getName(), url: classeur.getUrl() },
      onglets: onglets,
      quotaEmailRestant: MailApp.getRemainingDailyQuota(),
      declencheurs: ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); }),
      maintenant: new Date()
    };
  })();
}

/**
 * Contrôle du déploiement : Code.gs et Estimation.gs doivent être de la même version
 * (un des deux fichiers oublié lors du copier-coller).
 */
function Etat_alertes_() {
  if (typeof EST_VERSION === 'undefined') {
    return ['Le fichier Estimation.gs est absent du projet Apps Script : collez-le depuis dist/ (module Estimation indisponible).'];
  }
  if (EST_VERSION !== APP.VERSION) {
    return ['Versions différentes : Code.gs v' + APP.VERSION + ', Estimation.gs v' + EST_VERSION +
      '. Recollez les deux fichiers depuis dist/, puis relancez installer().'];
  }
  return Etat_colonnesManquantes_();
}

/**
 * Colonnes prévues par le code mais absentes du classeur (installer() pas relancé après une mise à jour).
 * Contrôle mémorisé 6 h une fois réussi, pour ne pas relire les en-têtes à chaque ouverture.
 */
function Etat_colonnesManquantes_() {
  var c = Db_memoire_(), cle = 'schema|' + APP.VERSION;
  try { if (c && c.get(cle) === 'ok') return []; } catch (e) { /* contrôle complet */ }
  var manquantes = [];
  Object.keys(TABLES).forEach(function (k) {
    var t = TABLES[k];
    try {
      var presentes = Db_entetesTable_(t);
      colonnesTable_(t).forEach(function (col) { if (presentes.indexOf(col) < 0) manquantes.push(t.onglet + ' › ' + col); });
    } catch (e) { manquantes.push(t.onglet); }
  });
  if (!manquantes.length) {
    try { if (c) c.put(cle, 'ok', DB_MEMOIRE_TTL); } catch (e) { /* sans effet */ }
    return [];
  }
  return ['Classeur pas à jour (' + manquantes.slice(0, 6).join(', ') + (manquantes.length > 6 ? '…' : '') +
    ') : ouvrez l\'éditeur Apps Script, choisissez la fonction installer et cliquez sur Exécuter. Sans cela, certaines saisies ne sont pas enregistrées.'];
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
