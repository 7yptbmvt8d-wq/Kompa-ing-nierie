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
