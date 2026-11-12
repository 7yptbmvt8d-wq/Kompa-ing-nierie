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
