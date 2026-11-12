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
