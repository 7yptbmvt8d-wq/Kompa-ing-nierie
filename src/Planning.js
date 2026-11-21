/**
 * Planning de facturation d'une affaire (décision du 21/11/2026, option A « par livrable »).
 *
 * - Montant d'une tranche : montant du marché (notifié, à défaut l'offre) au prorata des jours de la tranche
 *   (« Jours par tranche » : « TF : 50 j »). Sans jours par tranche : une seule ligne « Mission ».
 * - Facture prévue à la remise du dernier livrable de la tranche (Mission › Livrables, même code de tranche) ;
 *   paiement prévu au délai public (echeance.paiement_public_j, 30 jours).
 * - Une facture saisie avec le code de la tranche (bouton « Facturer » du planning) remplace la prévision ;
 *   « payée » dès son encaissement. Les factures sans tranche comptent seulement dans l'encaissé de l'affaire.
 * - Retard de paiement : intérêts moratoires (taux BCE + 8 points, paramètre facture.taux_moratoire)
 *   et indemnité forfaitaire de 40 € (articles L. 2192-13 et D. 2192-35 du code de la commande publique).
 */

var PLANNING_MISSION = 'MISSION';

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
    out.push({ tranche: code, jours: j });
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
  var factures = Db_lire(TABLES.FACTURES).filter(function (f) { return String(f.id_affaire) === String(idAffaire); });
  var codes = tranches.map(function (t) { return t.tranche; });
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
      etat: 'à planifier', dateFacture: '', dateEcheance: '', dateEncaissement: '', montantEncaisse: 0, facture: null, retard: null
    };
    var f = factures.filter(function (x) { return Planning_codeTranche_(x.tranche) === t.tranche; })
      .sort(function (x, y) { return (date_(y.date) || 0) - (date_(x.date) || 0); })[0];
    if (f) {
      var dF = date_(f.date), dE = date_(f.date_echeance), dP = date_(f.date_encaissement);
      ligne.facture = { id: String(f.id), numero: String(f.numero || '') };
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
  var toutes = [];
  lignes.forEach(function (l) {
    l.livrables.forEach(function (x) { if (x.date) toutes.push(x.date); });
    [l.dateFacture, l.dateEcheance, l.dateEncaissement].forEach(function (d) { if (d) toutes.push(d); });
  });
  toutes.sort();
  return {
    base: arrondi_(base), delai: delai, lignes: lignes,
    debut: toutes[0] || '', fin: toutes[toutes.length - 1] || '', aujourdhui: jourIso_(auj),
    aPlanifier: lignes.filter(function (l) { return l.etat === 'à planifier'; }).length,
    utilisable: lignes.some(function (l) { return l.etat !== 'à planifier'; })
  };
}

/**
 * Encaissements à venir par année d'après le planning (pour le CA prévisionnel), ou null si rien n'est planifié.
 * Tranche prévue ou facturée : année de l'échéance de paiement (année en cours si elle est passée) ;
 * tranche à planifier : année en cours (signalée).
 */
function Planning_parAnnee_(idAffaire, quand) {
  var p = Planning_affaire(idAffaire, quand);
  if (!p.utilisable) return null;
  var anCourant = aujourdhui_(quand).getFullYear();
  var parAnnee = {}, aPreciser = false;
  p.lignes.forEach(function (l) {
    if (l.etat === 'payée') return;
    var an = l.dateEcheance ? Math.max(Number(l.dateEcheance.slice(0, 4)), anCourant) : anCourant;
    if (!l.dateEcheance) aPreciser = true;
    parAnnee[an] = (parAnnee[an] || 0) + l.montant;
  });
  return { parAnnee: parAnnee, aPreciser: aPreciser, planning: p };
}

/** Facture d'une tranche (depuis la barre de planning) : numéro, date, montant prérempli. */
function Planning_facturer(idAffaire, tranche, donnees) {
  var d = Object.assign({}, donnees || {}, { tranche: Planning_codeTranche_(tranche) });
  return Factures_ajouter(idAffaire, d);
}
