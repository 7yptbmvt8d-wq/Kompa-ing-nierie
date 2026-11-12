/* Kompa Affaires 1.0.0-lot5 — fichier généré par tools/build.js depuis src/. Ne pas modifier ici. */

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
  var classeur = Setup_classeur_();
  var rapport = { classeur: classeur.getUrl(), onglets: [], colonnesAjoutees: 0 };

  Object.keys(TABLES).forEach(function (k) {
    var r = Setup_onglet_(classeur, TABLES[k]);
    rapport.onglets.push(TABLES[k].onglet + (r.cree ? ' (créé)' : ''));
    rapport.colonnesAjoutees += r.colonnesAjoutees;
  });
  Setup_supprimerFeuilleVide_(classeur);

  rapport.parametresAjoutes = Params_initialiser_();
  // Affaire d'exercice Mouthe (§ 11) : créée si absente
  if (!(options && options.exercice === false)) {
    try { rapport.exerciceMouthe = creerAffaireExerciceMouthe(); } catch (e) { rapport.exerciceMouthe = 'erreur : ' + e.message; }
  }
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
 * Déclencheurs : sauvegarde hebdomadaire (lundi, 5 h), collecte de la veille (6 h, paramètre).
 * et e-mail du matin (7 h, paramètre ; l'envoi vérifie le jour de la semaine).
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
    ['lien_dce', 'Dossier DCE (Google Drive)', 'lien']
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
  { id: 'offre', titre: 'Offre', champs: [
    ['groupement', 'Candidature', 'choix:Seul|Groupement'],
    ['cotraitant', 'Cotraitant', 'texte'],
    ['tranches', 'Tranches', 'long'],
    ['jours_par_tranche', 'Jours par tranche', 'long'],
    ['prix_jour', 'Prix par jour HT (€)', 'euros'],
    ['montant_ht', 'Montant HT (€)', 'euros'],
    ['montant_pondere', 'Montant pondéré (€)', 'euros'],
    ['jours_reponse', 'Jours passés à répondre', 'nombre'],
    ['date_depot', 'Date de dépôt', 'date']
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
    totaux: {
      facture: arrondi_(facture),
      encaisse: arrondi_(encaisse),
      resteAFacturer: arrondi_(Math.max(montant_(a.montant_notifie) - facture, 0))
    },
    transitions: TRANSITIONS[a.statut] || []
  };
}

// ——— Création et modification ———

/** N° interne suivant pour l'année : KA-AAAA-NNN. */
function Affaires_prochainNumero_(annee) {
  var max = 0;
  var re = new RegExp('^KA-' + annee + '-(\\d{3,})$');
  Affaires_lister().forEach(function (a) {
    var m = String(a.id).match(re);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'KA-' + annee + '-' + ('00' + (max + 1)).slice(-3);
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
  return Affaires_get_(a.id);
}

/** Modifie les champs d'une affaire. Le statut ne change que par Affaires_changerStatut. */
function Affaires_maj(id, donnees) {
  Affaires_get_(id);
  var champs = depuisClient_(TABLES.AFFAIRES, donnees);
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
  var onglet = Db_onglet_(T);
  var entetes = Db_entetes_(onglet);
  var iAff = entetes.indexOf('id_affaire');
  // Suppression des lignes existantes de l'affaire (du bas vers le haut)
  Db_verrou_(function () {
    var n = onglet.getLastRow() - 1;
    if (n < 1) return;
    var ids = onglet.getRange(2, iAff + 1, n, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]) === String(idAffaire)) onglet.deleteRow(i + 2);
    }
  });
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
    return { nom: c[0], libelle: c[1], type: c[2], obligatoire: !!c[3], defaut: c[4] || '' };
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
    totaux: f.totaux,
    transitions: f.transitions
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
  return repondre_(function () { Affaires_maj(id, champs); return ficheClient_(id); });
}

function apiAffaireStatut(id, statut, champs, commentaire) {
  return repondre_(function () {
    Affaires_changerStatut(id, statut, champs, { commentaire: commentaire });
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
  return repondre_(function () { Factures_ajouter(id, facture); return ficheClient_(id); });
}

function apiFactureMaj(idAffaire, idFacture, champs) {
  return repondre_(function () { Factures_maj(idFacture, champs); return ficheClient_(idAffaire); });
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
    var sync = Relances_synchroniser();
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
      synchronisation: sync,
      aujourdhui: jourIso_(auj)
    };
  });
}

/** Accueil : échéances à 7 jours et relances à faire. */
function apiSuivi() {
  return repondre_(function () {
    Relances_synchroniser();
    var auj = aujourdhui_();
    return {
      echeances: Echeances_calculer(auj, ajouterJours_(auj, 7)).map(echeanceClient_),
      relances: Relances_aFaire().map(relanceClient_)
    };
  });
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
    Relances_synchroniser();
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

function apiAnnulerDeclaration(idPeriode) {
  return repondre_(function () { Fiscal_annulerDeclaration(idPeriode); Relances_synchroniser(); return Fiscal_declarations(Number(String(idPeriode).slice(0, 4))); });
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
      heure: Params_nombre('veille.heure_collecte', 6)
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
 * Kompa Affaires — configuration générale et schéma du classeur (§ 9).
 *
 * Toute colonne ajoutée ici est créée au prochain lancement de installer(),
 * à la fin de l'onglet, sans toucher aux données existantes.
 */

var APP = {
  NOM: 'Kompa Affaires',
  VERSION: '1.0.0-lot5',
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
 * Les informations manquantes restent entre crochets, à compléter (charte Kompa § 1.7).
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
  var signature = Params_texte('courrier.signature', 'Sébastien De Raedt EI\nKompa Ingénierie');
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
        'Par courrier du ' + j(a.date_resultat) + ', vous nous avez informés du rejet de l\'offre remise par Kompa Ingénierie le ' + j(a.date_depot) +
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
        'Kompa Ingénierie a remis le ' + j(a.date_depot) + ' une offre pour la consultation ' + consultation + '.',
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
        'Pour mémoire, le dépassement du délai de paiement fait courir de plein droit des intérêts moratoires et une indemnité forfaitaire pour frais de recouvrement de 40 € (articles L. 2192-13 et D. 2192-35 du même code).',
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
          (r.commentaire || 'Saisir le CA encaissé de la période.') + '\n4. Payer, puis marquer la période « déclarée » sur l\'accueil de Kompa Affaires.' };
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

/** Supprime les lignes pour lesquelles garder(ligne) est vrai. Renvoie le nombre supprimé. */
function Db_supprimerSi(table, critere) {
  return Db_verrou_(function () {
    var onglet = Db_onglet_(table);
    var entetes = Db_entetes_(onglet);
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
  Db_lire(TABLES.FACTURES).forEach(function (f) {
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
 * E-mail du matin (§ 6) : du lundi au vendredi à 7 h vers le compte Kompa.
 * Rubriques : nouveaux avis PACA, nouveaux avis France, échéances à 7 jours, relances à faire,
 * indicateurs. Rubriques vides masquées ; pas d'envoi si les quatre premières sont vides,
 * sauf le lundi (récapitulatif).
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
  if (!mail.contenu && !lundi && !force) {
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
    .filter(function (e) { return ['Remise', 'Questions', 'Visite', 'Déclaration'].indexOf(e.type) >= 0; });
  var relances = Relances_aFaire(quand);
  var ind = Indicateurs_resume(quand);

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

  var corps = '';
  if (avisPaca.length) corps += section('Nouveaux avis ' + paca, avisPaca.length, avisPaca.map(function (a) { return ligneAvis(a, ''); }).join(''));
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
  var contenu = !!corps;
  if (!contenu) {
    corps = '<tr><td style="padding:24px 24px 0;color:' + C.gris + '">Rien de nouveau depuis le dernier envoi : pas de nouvel avis, pas d\'échéance dans les 7 jours, pas de relance à faire.</td></tr>';
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
  var sujet = APP.NOM + ' — ' + dateTxt + ' — ' + nbAvis + (nbAvis > 1 ? ' nouveaux' : ' nouvel') + ' avis · ' + echeances.length + ' échéance' + (echeances.length > 1 ? 's' : '');

  var html = '<!DOCTYPE html><html lang="fr"><body style="margin:0;background:' + C.brume + ';font-family:\'IBM Plex Sans\',Arial,sans-serif;color:' + C.encre + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + C.brume + '"><tr><td align="center" style="padding:16px 8px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:' + C.blanc + ';border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:' + C.ardoise + ';padding:18px 24px;color:' + C.inverse + '">' +
      '<div style="font-size:12px;letter-spacing:.14em;color:' + C.inverse2 + ';font-weight:600">KOMPA INGÉNIERIE</div>' +
      '<div style="font-size:20px;font-weight:700">Kompa Affaires — ' + dateTxt + '</div></td></tr>' +
    corps +
    '<tr><td style="padding:24px">' + bouton(url, 'Ouvrir Kompa Affaires') + '</td></tr>' +
    '<tr><td style="padding:12px 24px;border-top:1px solid ' + C.filet + ';color:' + C.gris + ';font-size:12px;' + mono + '">E-mail automatique du lundi au vendredi à ' + Params_nombre('email.heure', 7) + ' h — paramètres email.* de l\'app.</td></tr>' +
    '</table></td></tr></table></body></html>';

  var texte = [sujet, '']
    .concat(avisPaca.length ? ['NOUVEAUX AVIS ' + paca].concat(avisPaca.map(function (a) { return '- [' + a.pre_score + '] ' + a.acheteur + ' — ' + a.objet + ' — ' + a.lien; })).concat(['']) : [])
    .concat(avisFrance.length ? ['NOUVEAUX AVIS HORS ' + paca + ' (présentiel à vérifier)'].concat(avisFrance.map(function (a) { return '- [' + a.pre_score + '] ' + a.acheteur + ' — ' + a.objet + ' — ' + a.lien; })).concat(['']) : [])
    .concat(echeances.length ? ['ÉCHÉANCES À 7 JOURS'].concat(echeances.map(function (e) { return '- ' + jr(e.date) + ' ' + e.libelle + ' — ' + e.acheteur; })).concat(['']) : [])
    .concat(relances.length ? ['RELANCES À FAIRE'].concat(relances.map(function (r) { return '- ' + jr(r.date_prevue) + ' ' + r.type + ' — ' + r.acheteur; })).concat(['']) : [])
    .concat(['Ouvrir l\'app : ' + url]).join('\n');

  return { sujet: sujet, html: html, texte: texte, contenu: contenu,
    nombres: { avisPaca: avisPaca.length, avisFrance: horsPaca.length, echeances: echeances.length, relances: relances.length } };
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
    totaux: { ca: somme('ca'), cotisations: somme('cotisations'), cfp: somme('cfp'), impot: somme('impot'), total: somme('total') }
  };
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
 * - Écart de note technique (affaire perdue) : Σ notes Kompa − Σ notes attributaire sur les
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
  ['veille.fenetre_jours', '3', 'Avis BOAMP et alertes des N derniers jours (le dédoublonnage évite les reprises)'],
  ['veille.plateformes_domaines', 'marches-publics.gouv.fr;marches-publics.info;achatpublic.com;marches-securises.fr;e-marchespublics.com;marchesonline.com;francemarches.com;klekoon.com;maximilien.fr;demat-ampa.fr;awsolutions.fr;boamp.fr',
    'Domaines des plateformes : sert à repérer le lien de la consultation dans les alertes e-mail'],

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

  // Déclarations URSSAF (micro-entreprise)
  ['fiscal.debut_suivi', '', 'Début du suivi des déclarations (aaaa-mm-jj) : les périodes terminées avant ne sont ni affichées en retard ni relancées. Rempli à l\'installation'],
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
  ['echeance.validite_defaut_j', '90', 'Validité de l\'offre si non renseignée dans l\'affaire (jours)'],
  ['courrier.signature', 'Sébastien De Raedt EI\nKompa Ingénierie — Assistance à maîtrise d\'ouvrage\n[téléphone] · kompa.ingenierie@gmail.com\nSIRET [n°] · TVA non applicable, art. 293 B du CGI',
    'Signature des modèles de courriers (\\n = retour à la ligne)'],

  // E-mail (§ 6)
  ['email.heure', '7', 'Heure d\'envoi de l\'e-mail du matin (0-23)'],
  ['email.destinataire', '', 'Adresse de réception (vide = compte Kompa : kompa.ingenierie@gmail.com)'],
  ['email.jours', 'lun;mar;mer;jeu;ven', 'Jours d\'envoi (pas le week-end)'],
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
  ['app.favicon_url', '', 'URL publique (PNG) du symbole Kompa pour l\'onglet du navigateur'],
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
  var verrou = LockService.getScriptLock();
  if (!verrou.tryLock(1000)) { console.warn('Collecte déjà en cours.'); return null; }
  try {
    var ctx = Veille_contexte_();
    var bilan = [Veille_executer_(SOURCE_BOAMP, function () { return Veille_lireBoamp_(ctx); }, ctx),
      Veille_executer_(SOURCE_GMAIL, function () { return Veille_lireGmail_(ctx); }, ctx)];
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
    motsCles: Params_liste('veille.mots_cles').map(Veille_norm_),
    motsCoeur: Params_liste('veille.mots_cles_coeur').map(Veille_norm_),
    exclusions: Params_liste('veille.exclusions').map(Veille_norm_),
    exclusionMoe: Veille_norm_(Params_texte('veille.exclusion_moe', '')),
    exceptionMoe: Veille_norm_(Params_texte('veille.exception_moe', '')),
    paca: Params_liste('zone.departements_paca'),
    libellePaca: Params_texte('zone.libelle_paca', 'PACA'),
    libelleFrance: Params_texte('zone.libelle_france', 'France — présentiel à vérifier'),
    jours: Params_nombre('veille.fenetre_jours', 3),
    montantMax: Params_nombre('capacite.montant_max_mission', null),
    resteSousPlafond: typeof vise === 'number' ? vise : null,
    existants: Db_lire(TABLES.AVIS)
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
  return 'dateparution>=date\'' + depuis + '\' and nature=\'APPEL_OFFRE\' and type_marche=\'SERVICES\' and (' +
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
  var excl = ctx.exclusions.filter(function (e) { return e && objet.indexOf(e) >= 0; })[0];
  if (excl) return { garde: false, motif: 'exclusion : ' + excl };
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
  return { garde: true };
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
  var classement = total >= p('seuil_etudier', 60) ? 'à étudier' : total >= p('seuil_possible', 40) ? 'possible' : 'archivé';

  a.zone = paca ? ctx.libellePaca : ctx.libelleFrance;
  if (paca && ctx.paca.indexOf(a.departement) < 0) a.departement = deps.filter(function (d) { return ctx.paca.indexOf(d) >= 0; })[0];
  a.pre_score = total;
  a.score_detail = 'Zone ' + detail.zone + ' · Mission ' + detail.mission + ' · Délai ' + detail.delai +
    (jours === null ? ' (date inconnue)' : ' (' + jours + ' j)') + ' · Acheteur ' + detail.acheteur + ' · Montant ' + detail.montant;
  a.alerte_delai = jours !== null && jours < 10 ? 'oui' : '';
  a.classement = classement;
  a.statut = classement === 'archivé' ? 'archivé' : 'nouveau';
  delete a.departements;
  delete a.descripteurs;
  delete a.texte;
  return a;
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


// ════════ WebApp.js ════════

/**
 * Web app : point d'entrée HTTP et fonctions appelées par l'interface (google.script.run).
 *
 * Accès : le manifeste limite la web app au seul compte propriétaire
 * (access MYSELF, executeAs USER_DEPLOYING). verifierAcces_() double ce contrôle.
 */

function doGet() {
  verifierAcces_();
  // Application pour ordinateur (Windows, macOS, ChromeOS) : pas de version mobile (décision du 12/11/2026).
  var sortie = HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP.NOM);
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
