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
    var base = montant_(gagnee ? (a.montant_notifie || a.montant_ht) : a.montant_ht);
    var deja = encaisseAffaire[a.id] || {};
    var rep = Previsionnel_repartir_(base, deja, a.repartition_ca, anneeCourante);
    var plan = Planning_parAnnee_(a.id, auj);
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
      id: a.id, acheteur: a.acheteur, objet: a.objet, statut: a.statut, base: arrondi_(base),
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
