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
