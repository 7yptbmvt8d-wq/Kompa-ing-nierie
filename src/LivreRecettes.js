/**
 * Livre des recettes (micro-entreprise, BNC) : registre chronologique des sommes encaissées, tenu
 * automatiquement à partir des factures (encaissement saisi à la main ou relevé par Qonto).
 * Mentions : date d'encaissement, client, nature de la prestation, montant, mode de règlement,
 * référence du justificatif (n° de facture). Mode de règlement : colonne mode_reglement de l'onglet
 * Factures, « virement » par défaut (paramètre livre.mode_defaut). Export annuel en Google Sheets dans
 * le dossier des sauvegardes, sous-dossier « Livre des recettes » (un nouveau fichier par export,
 * aucun fichier n'est écrasé).
 */

var LIVRE_MODES = ['virement', 'chèque', 'carte', 'prélèvement', 'espèces', 'autre'];
var LIVRE_SOUS_DOSSIER = 'Livre des recettes';

/** Registre de l'année (année en cours par défaut). */
function Livre_recettes(annee, quand) {
  var auj = aujourdhui_(quand);
  annee = Number(annee) || auj.getFullYear();
  var modeDefaut = Params_texte('livre.mode_defaut', 'virement');
  var affaires = {};
  Affaires_lister().forEach(function (a) { affaires[a.id] = a; });
  var annees = {};
  annees[auj.getFullYear()] = true;
  var lignes = [];
  Db_lire(TABLES.FACTURES).forEach(function (f) {
    var d = date_(f.date_encaissement);
    var m = montant_(f.montant_encaisse);
    if (!d || !m || f.qonto_statut === 'annulée') return;
    annees[d.getFullYear()] = true;
    if (d.getFullYear() !== annee) return;
    var a = affaires[f.id_affaire] || {};
    var tranche = f.tranche ? (f.tranche === PLANNING_MISSION ? 'mission' : 'tranche ' + f.tranche) : '';
    lignes.push({
      id: f.id, date: jourIso_(d), numero: String(f.numero || ''), id_affaire: f.id_affaire || '',
      client: a.acheteur || '',
      nature: 'Assistance à maîtrise d\'ouvrage' + (tranche ? ' — ' + tranche : '') + (a.objet ? ' — ' + String(a.objet).slice(0, 90) : ''),
      montant: arrondi_(m),
      mode: f.mode_reglement || modeDefaut,
      modeSaisi: !!f.mode_reglement
    });
  });
  lignes.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : (x.numero < y.numero ? -1 : 1); });
  var cumul = 0;
  lignes.forEach(function (l) { cumul = arrondi_(cumul + l.montant); l.cumul = cumul; });
  return {
    annee: annee, lignes: lignes, total: cumul, modes: LIVRE_MODES,
    annees: Object.keys(annees).map(Number).sort(function (x, y) { return y - x; })
  };
}

function Livre_modeReglement(idFacture, mode) {
  mode = String(mode || '').trim().toLowerCase();
  if (LIVRE_MODES.indexOf(mode) < 0) throw new Error('Mode de règlement inconnu : ' + mode);
  if (!Db_trouver(TABLES.FACTURES, idFacture)) throw new Error('Facture introuvable : ' + idFacture);
  return Db_maj(TABLES.FACTURES, idFacture, { mode_reglement: mode });
}

/** Export de l'année en Google Sheets (nouveau fichier daté) → { nom, url }. */
function Livre_exporter(annee, quand) {
  var l = Livre_recettes(annee, quand);
  var entreprise = Params_texte('courrier.nom_entreprise', APP.ENTREPRISE);
  var nom = 'Livre des recettes ' + l.annee + ' — ' + entreprise + ' — export du ' + Utilities.formatDate(aujourdhui_(quand), APP.FUSEAU, 'yyyy-MM-dd');
  var classeur = SpreadsheetApp.create(nom);
  classeur.setSpreadsheetTimeZone(APP.FUSEAU);
  classeur.setSpreadsheetLocale('fr_FR');
  var f = classeur.getSheets()[0];
  f.setName('Recettes ' + l.annee);
  var entete = ['Date d\'encaissement', 'N° de facture', 'Client', 'Nature de la prestation', 'Montant encaissé (€)', 'Mode de règlement', 'Cumul (€)'];
  var titre = [['Livre des recettes ' + l.annee + ' — ' + entreprise, '', '', '', '', '', '']];
  var sous = [['Micro-entreprise (BNC) — recettes encaissées, par ordre chronologique. Justificatifs : factures correspondantes.', '', '', '', '', '', '']];
  f.getRange(1, 1, 1, 7).setValues(titre).setFontWeight('bold');
  f.getRange(2, 1, 1, 7).setValues(sous);
  f.getRange(4, 1, 1, 7).setValues([entete]).setFontWeight('bold');
  if (l.lignes.length) {
    f.getRange(5, 2, l.lignes.length, 1).setNumberFormat('@');
    f.getRange(5, 1, l.lignes.length, 7).setValues(l.lignes.map(function (x) {
      return [date_(x.date), x.numero, x.client, x.nature, x.montant, x.mode, x.cumul];
    }));
    f.getRange(5, 1, l.lignes.length, 1).setNumberFormat('dd/MM/yyyy');
    f.getRange(5, 5, l.lignes.length + 1, 1).setNumberFormat('#,##0.00');
    f.getRange(5, 7, l.lignes.length, 1).setNumberFormat('#,##0.00');
  }
  f.getRange(5 + l.lignes.length, 1, 1, 7).setValues([['Total ' + l.annee, '', '', '', l.total, '', '']]).setFontWeight('bold');
  f.setFrozenRows(4);
  try {
    var dossier = Drive_sousDossier_(Setup_dossierSauvegardes_(), LIVRE_SOUS_DOSSIER);
    DriveApp.getFileById(classeur.getId()).moveTo(dossier);
  } catch (e) { /* reste à la racine du Drive : sans effet sur le contenu */ }
  return { nom: nom, url: classeur.getUrl(), lignes: l.lignes.length, total: l.total };
}
