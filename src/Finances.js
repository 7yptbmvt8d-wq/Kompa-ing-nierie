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
      if (a.statut === 'Soldée' && l.etat !== 'payée') return;
      lignes.push(Object.assign({ id_affaire: a.id, acheteur: String(a.acheteur || ''), objet: String(a.objet || '') }, l));
    });
    // Factures saisies sans tranche (avant le planning) et non payées
    Db_lire(TABLES.FACTURES).forEach(function (f) {
      if (String(f.id_affaire) !== String(a.id) || f.tranche || date_(f.date_encaissement)) return;
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
