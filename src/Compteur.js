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
