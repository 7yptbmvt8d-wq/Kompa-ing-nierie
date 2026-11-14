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

/**
 * Aide affichée sous chaque champ (fiche, nouvelle affaire, changement de statut) : [explication, exemple].
 * L'exemple s'affiche en grisé dans le champ vide.
 */
var AIDES_CHAMPS = {
  id: ['Attribué automatiquement : KA-année-numéro.'],
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
  jours_par_tranche: ['Jours que vous prévoyez pour chaque tranche, dans le même ordre. Une ligne par tranche.', 'TF : 6 j\nTO1 : 8 j\nTO2 : 10 j'],
  prix_jour: ['Votre prix de journée HT, utilisé pour chiffrer l\'offre.', '550'],
  montant_ht: ['Prix total HT inscrit à l\'acte d\'engagement (toutes tranches demandées).', '13200'],
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
  Drive_preparerAffaireSansErreur_(a.id); // dossier Drive de l'affaire (année / affaire / 01, 02)
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
